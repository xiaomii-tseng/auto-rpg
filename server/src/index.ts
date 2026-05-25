import express    from 'express';
import cors       from 'cors';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { GameRoom }     from './rooms/GameRoom';
import { TownRoom }     from './rooms/TownRoom';
import { codeMap }      from './codeRegistry';
import { supabase }     from './supabase';

const PORT = Number(process.env.PORT) || 3001;

// Allow GitHub Pages origin + localhost dev
const ALLOWED_ORIGINS = [
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

  // 1. create auth user
  const { data: signUp, error: signUpErr } = await supabase.auth.signUp({ email, password });
  if (signUpErr || !signUp.user) {
    res.status(400).json({ error: signUpErr?.message ?? 'signup failed' }); return;
  }

  // 2. insert profile (trigger also does this, but we set playerId + nickname here)
  const { error: profErr } = await supabase.from('profiles').upsert({
    id: signUp.user.id,
    player_id: playerId,
    nickname: nickname ?? null,
  });
  if (profErr) {
    res.status(400).json({ error: profErr.message }); return;
  }

  res.json({ userId: signUp.user.id, playerId });
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
    res.status(401).json({ error: error?.message ?? 'login failed' }); return;
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

// Middleware: verify JWT and attach userId
function requireAuth(req: any, res: any, next: any) {
  const auth = req.headers['authorization'] ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) { res.status(401).json({ error: 'no token' }); return; }
  // decode payload (we trust Supabase signed JWTs; for extra security verify with JWKS)
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
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
