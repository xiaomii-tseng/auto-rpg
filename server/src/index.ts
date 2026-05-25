import express    from 'express';
import cors       from 'cors';
import multer     from 'multer';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { GameRoom }     from './rooms/GameRoom';
import { TownRoom }     from './rooms/TownRoom';
import { codeMap }      from './codeRegistry';
import { supabase }     from './supabase';

const PORT = Number(process.env.PORT) || 3001;

// Allow GitHub Pages origin + localhost dev
const ALLOWED_ORIGINS = [
  'https://xiaomii-tseng.github.io',
  'https://mii-gpgpu.github.io',
  'http://localhost:4200',
  'http://localhost:3000',
];

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json());

// ── health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Colyseus room code lookup ─────────────────────────────────────────────────
app.get('/room/:code', (req, res) => {
  const roomId = codeMap.get(req.params.code);
  if (!roomId) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ roomId });
});

// ══════════════════════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════════════════════

// POST /auth/register  { email, password, playerId, nickname? }
// account → 內部轉成 account@game.local，玩家不需要填真實 email
const toEmail = (account: string) => `${account.toLowerCase().replace(/[^a-z0-9_.-]/g, '_')}@game.local`;

app.post('/auth/register', async (req, res) => {
  const { account, password, playerId, nickname } = req.body ?? {};
  if (!account || !password || !playerId) {
    res.status(400).json({ error: 'account, password, playerId required' }); return;
  }

  const email = toEmail(account);

  // 0. 確認 playerId 尚未被使用
  const { data: existingProfile } = await supabase
    .from('profiles').select('id').eq('player_id', playerId).maybeSingle();
  if (existingProfile) {
    res.status(400).json({ error: '玩家名稱已被使用' }); return;
  }

  // 1. 用 admin API 建帳號（不影響 client session，確保後續 DB 操作維持 service_role）
  const { data: created, error: createErr } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createErr || !created.user) {
    const msg = createErr?.message ?? '';
    const friendly = msg.includes('already') || msg.includes('exists')
      ? '帳號已被使用'
      : msg || '註冊失敗';
    res.status(400).json({ error: friendly }); return;
  }

  // 2. 建 profile
  const { error: profErr } = await supabase.from('profiles').insert({
    id: created.user.id,
    player_id: playerId,
    nickname: nickname ?? null,
  });
  if (profErr) {
    // 若 profile 建失敗，把剛建的 auth user 也刪掉，保持一致性
    await supabase.auth.admin.deleteUser(created.user.id);
    res.status(400).json({ error: profErr.message }); return;
  }

  res.json({ userId: created.user.id, playerId });
});

// POST /auth/login  { account, password }
app.post('/auth/login', async (req, res) => {
  const { account, password } = req.body ?? {};
  if (!account || !password) {
    res.status(400).json({ error: 'account and password required' }); return;
  }

  const email = toEmail(account);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    const msg = (error?.message ?? '').toLowerCase();
    const friendly =
      msg.includes('invalid') || msg.includes('credentials') ? '帳號或密碼錯誤'
      : msg.includes('too many') || msg.includes('rate')     ? '嘗試次數過多，請稍後再試'
      : '登入失敗';
    res.status(401).json({ error: friendly }); return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('player_id, nickname')
    .eq('id', data.user.id)
    .single();

  res.json({
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId:       data.user.id,
    playerId:     profile?.player_id,
    nickname:     profile?.nickname,
  });
});

// POST /auth/refresh  { refreshToken }
app.post('/auth/refresh', async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) { res.status(400).json({ error: 'refreshToken required' }); return; }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    res.status(401).json({ error: error?.message ?? 'refresh failed' }); return;
  }

  res.json({
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SAVE DATA
// ══════════════════════════════════════════════════════════════════════════════

// Middleware: verify JWT via Supabase (validates signature + expiry)
async function requireAuth(req: any, res: any, next: any) {
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'no token' }); return; }
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) { res.status(401).json({ error: 'token expired' }); return; }
  req.userId = data.user.id;
  next();
}

// GET /save  → returns save_data JSON
app.get('/save', requireAuth, async (req: any, res) => {
  const { data, error } = await supabase
    .from('player_saves')
    .select('save_data, version, updated_at')
    .eq('user_id', req.userId)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = row not found
    res.status(500).json({ error: error.message }); return;
  }

  res.json(data ?? { save_data: null });
});

// POST /save  { saveData, version }  → upsert
app.post('/save', requireAuth, async (req: any, res) => {
  const { saveData, version } = req.body ?? {};
  if (!saveData) { res.status(400).json({ error: 'saveData required' }); return; }

  const { error } = await supabase.from('player_saves').upsert({
    user_id:    req.userId,
    save_data:  saveData,
    version:    version ?? null,
    updated_at: new Date().toISOString(),
  });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// BUG REPORT
// ══════════════════════════════════════════════════════════════════════════════

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// POST /report  { message, playerName, version, scene }  + optional image file
app.post('/report', upload.single('image'), async (req: any, res) => {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) { res.status(503).json({ error: 'report not configured' }); return; }

  const { message, playerName, version, scene } = req.body ?? {};
  if (!message?.trim()) { res.status(400).json({ error: 'message required' }); return; }

  const embed = {
    title: '🐛 玩家回報問題',
    color: 0xe74c3c,
    fields: [
      { name: '玩家', value: playerName || '未知', inline: true },
      { name: '版本', value: version   || '未知', inline: true },
      { name: '場景', value: scene     || '未知', inline: true },
      { name: '描述', value: message.slice(0, 1000) },
    ],
    timestamp: new Date().toISOString(),
  };

  const form = new FormData();
  form.append('payload_json', JSON.stringify({ embeds: [embed] }));

  if (req.file) {
    const ext  = req.file.originalname.split('.').pop() ?? 'png';
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype });
    form.append('files[0]', blob, `screenshot.${ext}`);
  }

  try {
    const dr = await fetch(webhookUrl, { method: 'POST', body: form });
    if (!dr.ok) { res.status(502).json({ error: 'discord error' }); return; }
    res.json({ ok: true });
  } catch {
    res.status(502).json({ error: 'network error' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD — TOWER
// ══════════════════════════════════════════════════════════════════════════════

// GET /leaderboard/tower?limit=50
app.get('/leaderboard/tower', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const { data, error } = await supabase
    .from('tower_leaderboard')
    .select('player_id, nickname, floor, time_ms, created_at')
    .order('floor', { ascending: false })
    .order('time_ms', { ascending: true })
    .limit(limit);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// POST /leaderboard/tower  { floor, timeMs }
app.post('/leaderboard/tower', requireAuth, async (req: any, res) => {
  const { floor, timeMs } = req.body ?? {};
  if (floor == null || timeMs == null) {
    res.status(400).json({ error: 'floor and timeMs required' }); return;
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('player_id, nickname')
    .eq('id', req.userId)
    .single();

  const { error } = await supabase.from('tower_leaderboard').insert({
    user_id:   req.userId,
    player_id: profile?.player_id ?? 'unknown',
    nickname:  profile?.nickname ?? null,
    floor:     Number(floor),
    time_ms:   Number(timeMs),
  });

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// LEADERBOARD — LEVEL
// ══════════════════════════════════════════════════════════════════════════════

// GET /leaderboard/level?limit=50
app.get('/leaderboard/level', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 100);

  const [savesRes, profilesRes] = await Promise.all([
    supabase.from('player_saves').select('user_id, save_data'),
    supabase.from('profiles').select('id, player_id'),
  ]);

  if (savesRes.error) { res.status(500).json({ error: savesRes.error.message }); return; }

  const profileMap = new Map(
    (profilesRes.data ?? []).map((p: any) => [p.id as string, p.player_id as string])
  );

  const ranked = (savesRes.data ?? [])
    .map((s: any) => ({
      playerId: profileMap.get(s.user_id) ?? '–',
      level: Number(s.save_data?.player?.level ?? 0),
    }))
    .sort((a: any, b: any) => b.level - a.level)
    .slice(0, limit);

  res.json(ranked);
});

// ══════════════════════════════════════════════════════════════════════════════
// COLYSEUS
// ══════════════════════════════════════════════════════════════════════════════

const httpServer = createServer(app);
const gameServer = new Server({ server: httpServer });

gameServer.define('game', GameRoom);
gameServer.define('town', TownRoom);
console.log('[server] rooms registered: game, town');

httpServer.listen(PORT, () => {
  console.log(`[auto-rpg] server running on http://localhost:${PORT}`);
});
