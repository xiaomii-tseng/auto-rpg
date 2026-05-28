import express    from 'express';
import cors       from 'cors';
import multer     from 'multer';
import rateLimit  from 'express-rate-limit';
import webpush    from 'web-push';
import { Server } from 'colyseus';
import { createServer } from 'http';
import { GameRoom }     from './rooms/GameRoom';
import { TownRoom }     from './rooms/TownRoom';
import { codeMap }      from './codeRegistry';
import { supabase }     from './supabase';

const PORT = Number(process.env.PORT) || 3001;

// ── Web Push (VAPID) ──────────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? '';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? 'mailto:admin@game.local',
    VAPID_PUBLIC,
    VAPID_PRIVATE,
  );
}

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

// ── Rate limiters ─────────────────────────────────────────────────────────────
const limiterAuth = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { error: '嘗試次數過多，請 15 分鐘後再試' },
  standardHeaders: true, legacyHeaders: false,
});
const limiterReport = rateLimit({
  windowMs: 10 * 60 * 1000, max: 3,
  message: { error: '回報次數過多，請稍後再試' },
  standardHeaders: true, legacyHeaders: false,
});
const limiterSave = rateLimit({
  windowMs: 60 * 1000, max: 20,
  message: { error: '存檔頻率過高，請稍後再試' },
  standardHeaders: true, legacyHeaders: false,
});

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

app.post('/auth/register', limiterAuth, async (req, res) => {
  const { account, password, playerId, email: playerEmail, nickname } = req.body ?? {};
  if (!account || !password || !playerId || !playerEmail) {
    res.status(400).json({ error: 'account, password, playerId, email required' }); return;
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
    id:        created.user.id,
    player_id: playerId,
    email:     playerEmail ?? null,
    nickname:  nickname ?? null,
  });
  if (profErr) {
    // 若 profile 建失敗，把剛建的 auth user 也刪掉，保持一致性
    await supabase.auth.admin.deleteUser(created.user.id);
    res.status(400).json({ error: profErr.message }); return;
  }

  res.json({ userId: created.user.id, playerId });
});

// POST /auth/login  { account, password }
app.post('/auth/login', limiterAuth, async (req, res) => {
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

  const sessionId = crypto.randomUUID();
  const [{ data: profile }] = await Promise.all([
    supabase.from('profiles').select('player_id, nickname').eq('id', data.user.id).single(),
    supabase.from('profiles').update({ session_id: sessionId }).eq('id', data.user.id),
  ]);

  res.json({
    accessToken:  data.session.access_token,
    refreshToken: data.session.refresh_token,
    userId:       data.user.id,
    playerId:     profile?.player_id,
    nickname:     profile?.nickname,
    sessionId,
  });
});

// POST /auth/change-password  { oldPassword, newPassword }
app.post('/auth/change-password', requireAuth, async (req: any, res) => {
  const { oldPassword, newPassword } = req.body ?? {};
  if (!oldPassword || !newPassword) {
    res.status(400).json({ error: 'oldPassword and newPassword required' }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: '新密碼至少需要 6 個字元' }); return;
  }

  const { data: adminUser, error: adminErr } = await supabase.auth.admin.getUserById(req.userId);
  if (adminErr || !adminUser.user?.email) {
    res.status(500).json({ error: '無法取得使用者資訊' }); return;
  }

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: adminUser.user.email,
    password: oldPassword,
  });
  if (signInErr) {
    res.status(401).json({ error: '舊密碼錯誤' }); return;
  }

  const { error: updateErr } = await supabase.auth.admin.updateUserById(req.userId, {
    password: newPassword,
  });
  if (updateErr) {
    res.status(500).json({ error: updateErr.message }); return;
  }

  res.json({ ok: true });
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

// ── Save validation ───────────────────────────────────────────────────────────
function validateSave(d: any): string | null {
  if (typeof d !== 'object' || d === null) return 'saveData must be an object';

  const p = d.player;
  if (!p || typeof p !== 'object')           return 'missing player';
  if (typeof p.level !== 'number' || p.level < 1 || p.level > 50)  return 'invalid level';
  if (typeof p.exp   !== 'number' || p.exp   < 0)                    return 'invalid exp';

  const inv = d.inventory;
  if (!inv || typeof inv !== 'object')       return 'missing inventory';
  if (typeof inv.gold !== 'number' || inv.gold < 0 || inv.gold > 1_000_000_000) return 'invalid gold';
  if (!Array.isArray(inv.items))             return 'invalid items';

  if (d.tower != null) {
    const t = d.tower;
    if (typeof t.keys !== 'number' || t.keys < 0 || t.keys > 9999)           return 'invalid tower.keys';
    if (typeof t.bestFloor !== 'number' || t.bestFloor < 0 || t.bestFloor > 9999) return 'invalid tower.bestFloor';
  }

  return null;
}

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

// POST /save  { saveData, version, sessionId }  → upsert
app.post('/save', limiterSave, requireAuth, async (req: any, res) => {
  const { saveData, version, sessionId } = req.body ?? {};
  if (!saveData) { res.status(400).json({ error: 'saveData required' }); return; }

  // TODO: 單裝置限制暫時關閉
  // const { data: profile } = await supabase
  //   .from('profiles').select('session_id').eq('id', req.userId).single();
  // if (profile?.session_id && sessionId !== profile.session_id) {
  //   res.status(409).json({ error: '已在其他裝置登入' }); return;
  // }

  const validationError = validateSave(saveData);
  if (validationError) { res.status(400).json({ error: validationError }); return; }

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
app.post('/report', limiterReport, upload.single('image'), async (req: any, res) => {
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
// MARKET
// ══════════════════════════════════════════════════════════════════════════════

const limiterMarket = rateLimit({
  windowMs: 60 * 1000, max: 30,
  message: { error: '操作頻率過高，請稍後再試' },
  standardHeaders: true, legacyHeaders: false,
});

// ── helpers ───────────────────────────────────────────────────────────────────

function extractAffixStats(item: any): string[] | null {
  if (!Array.isArray(item?.affixes)) return null;
  return item.affixes.map((a: any) => a.stat).filter(Boolean);
}

function removeEquipFromOwned(saveData: any, itemId: string): { save: any; found: boolean } {
  const owned: any[] = saveData?.player?.owned ?? [];
  const idx = owned.findIndex((e: any) => e.id === itemId);
  if (idx === -1) return { save: saveData, found: false };
  const newOwned = [...owned.slice(0, idx), ...owned.slice(idx + 1)];
  return {
    save: { ...saveData, player: { ...saveData.player, owned: newOwned } },
    found: true,
  };
}

function removeConsumable(saveData: any, itemId: string, qty: number): { save: any; found: boolean } {
  const items: any[] = saveData?.inventory?.items ?? [];
  const idx = items.findIndex((i: any) => i.id === itemId);
  if (idx === -1) return { save: saveData, found: false };
  const entry = items[idx];
  if (entry.qty < qty) return { save: saveData, found: false };
  const newItems = entry.qty === qty
    ? [...items.slice(0, idx), ...items.slice(idx + 1)]
    : items.map((i: any, n: number) => n === idx ? { ...i, qty: i.qty - qty } : i);
  return {
    save: { ...saveData, inventory: { ...saveData.inventory, items: newItems } },
    found: true,
  };
}

function removeCard(saveData: any, cardId: string, qty: number): { save: any; found: boolean } {
  const inv: any[] = saveData?.cards?.inventory ?? [];
  const idx = inv.findIndex((c: any) => c.cardId === cardId);
  if (idx === -1) return { save: saveData, found: false };
  const entry = inv[idx];
  if (entry.qty < qty) return { save: saveData, found: false };
  const newInv = entry.qty === qty
    ? [...inv.slice(0, idx), ...inv.slice(idx + 1)]
    : inv.map((c: any, n: number) => n === idx ? { ...c, qty: c.qty - qty } : c);
  return {
    save: { ...saveData, cards: { ...saveData.cards, inventory: newInv } },
    found: true,
  };
}

// ── GET /market/listings ──────────────────────────────────────────────────────
// Query params: type, quality, affix (可多個), name, page, limit
app.get('/market/listings', async (req, res) => {
  const { type, quality, name, page = '1', limit: lim = '20' } = req.query as Record<string, string>;
  const affix = req.query['affix'];
  const affixes = Array.isArray(affix) ? affix : affix ? [affix] : [];
  const pageNum  = Math.max(1, parseInt(page)  || 1);
  const pageSize = Math.min(50, parseInt(lim)   || 20);
  const offset   = (pageNum - 1) * pageSize;

  let query = supabase
    .from('market_listings')
    .select('id, seller_nickname, item_type, item_name, item_snapshot, affix_stats, quality, price, qty, created_at')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (type)    query = query.eq('item_type', type);
  if (quality) query = query.eq('quality', quality);
  if (name)    query = query.ilike('item_name', `%${name}%`);
  if (affixes.length > 0) query = query.contains('affix_stats', affixes);

  const { data, error } = await query;
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── GET /market/my-listings ───────────────────────────────────────────────────
app.get('/market/my-listings', requireAuth, async (req: any, res) => {
  const { data, error } = await supabase
    .from('market_listings')
    .select('id, item_type, item_name, item_snapshot, quality, price, qty, status, created_at, sold_at')
    .eq('seller_user_id', req.userId)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json(data);
});

// ── POST /market/list ─────────────────────────────────────────────────────────
// Body: { itemType, itemId, qty, price }
// itemType = 'equipment' | 'consumable' | 'card'
// itemId   = EquipmentItem.id | InventoryItem.id | cardId
app.post('/market/list', limiterMarket, requireAuth, async (req: any, res) => {
  const { itemType, itemId, qty, price } = req.body ?? {};

  if (!itemType || !itemId || !price) {
    res.status(400).json({ error: 'itemType, itemId, price required' }); return;
  }
  if (!['equipment', 'consumable', 'card'].includes(itemType)) {
    res.status(400).json({ error: 'invalid itemType' }); return;
  }
  const priceNum = parseInt(price);
  const qtyNum   = parseInt(qty) || 1;
  if (isNaN(priceNum) || priceNum <= 0 || priceNum > 999999999) {
    res.status(400).json({ error: 'invalid price' }); return;
  }
  if (qtyNum <= 0) { res.status(400).json({ error: 'invalid qty' }); return; }

  // 讀存檔（加鎖用 maybeSingle 即可，RPC 只在 buy 時鎖）
  const { data: saveRow, error: saveErr } = await supabase
    .from('player_saves').select('save_data').eq('user_id', req.userId).single();
  if (saveErr || !saveRow) { res.status(404).json({ error: 'save not found' }); return; }

  const { data: profile } = await supabase
    .from('profiles').select('player_id, nickname').eq('id', req.userId).single();

  let saveData = saveRow.save_data;
  let snapshot: any;
  let itemName: string;
  let affixStats: string[] | null = null;
  let quality: string | null = null;

  if (itemType === 'equipment') {
    const item = (saveData?.player?.owned ?? []).find((e: any) => e.id === itemId);
    if (!item) { res.status(400).json({ error: 'item not found' }); return; }
    snapshot   = item;
    itemName   = item.name ?? item.slot ?? 'equipment';
    affixStats = extractAffixStats(item);
    quality    = item.quality ?? null;
    const { save, found } = removeEquipFromOwned(saveData, itemId);
    if (!found) { res.status(400).json({ error: 'item not found' }); return; }
    saveData = save;

  } else if (itemType === 'consumable') {
    const item = (saveData?.inventory?.items ?? []).find((i: any) => i.id === itemId);
    if (!item) { res.status(400).json({ error: 'item not found' }); return; }
    if (item.qty < qtyNum) { res.status(400).json({ error: 'insufficient qty' }); return; }
    snapshot = { id: item.id, name: item.name, qty: qtyNum };
    itemName = item.name ?? item.id;
    const { save, found } = removeConsumable(saveData, itemId, qtyNum);
    if (!found) { res.status(400).json({ error: 'item not found or qty insufficient' }); return; }
    saveData = save;

  } else {
    // card
    const entry = (saveData?.cards?.inventory ?? []).find((c: any) => c.cardId === itemId);
    if (!entry) { res.status(400).json({ error: 'card not found' }); return; }
    if (entry.qty < qtyNum) { res.status(400).json({ error: 'insufficient qty' }); return; }
    snapshot = { cardId: itemId, qty: qtyNum };
    itemName = itemId;
    const { save, found } = removeCard(saveData, itemId, qtyNum);
    if (!found) { res.status(400).json({ error: 'card not found or qty insufficient' }); return; }
    saveData = save;
  }

  // 寫入 listing + 更新存檔（兩個 DB 操作，用 Promise.all 快一點；listing 失敗時補償存檔）
  const [listRes, saveRes] = await Promise.all([
    supabase.from('market_listings').insert({
      seller_user_id:  req.userId,
      seller_nickname: profile?.nickname ?? profile?.player_id ?? null,
      item_type:       itemType,
      item_name:       itemName,
      item_snapshot:   snapshot,
      affix_stats:     affixStats,
      quality,
      price:           priceNum,
      qty:             qtyNum,
    }).select('id').single(),
    supabase.from('player_saves').update({ save_data: saveData, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId),
  ]);

  if (listRes.error || saveRes.error) {
    // 補償：存檔成功但 listing 失敗時，把道具還回去（best-effort）
    if (!listRes.error && saveRes.error) {
      await supabase.from('market_listings').delete().eq('id', listRes.data!.id);
    }
    if (listRes.error && !saveRes.error) {
      await supabase.from('player_saves').update({
        save_data: saveRow.save_data, updated_at: new Date().toISOString()
      }).eq('user_id', req.userId);
    }
    res.status(500).json({ error: listRes.error?.message ?? saveRes.error?.message }); return;
  }

  res.json({ ok: true, listingId: listRes.data!.id });
});

// ── POST /market/buy/:id ──────────────────────────────────────────────────────
app.post('/market/buy/:id', limiterMarket, requireAuth, async (req: any, res) => {
  const listingId = req.params.id;
  if (!listingId) { res.status(400).json({ error: 'listingId required' }); return; }

  const reqQty = parseInt(req.body?.qty) || 0;

  const { data, error } = await supabase.rpc('buy_listing', {
    p_listing_id:    listingId,
    p_buyer_user_id: req.userId,
    p_qty:           reqQty,
  });

  if (error) { res.status(500).json({ error: error.message }); return; }
  if (!data?.ok) { res.status(400).json({ error: data?.error ?? 'buy failed' }); return; }
  res.json({ ok: true, qty_bought: data.qty_bought, cost: data.cost });
});

// ── DELETE /market/list/:id ───────────────────────────────────────────────────
app.delete('/market/list/:id', limiterMarket, requireAuth, async (req: any, res) => {
  const listingId = req.params.id;

  // 取回 listing，確認是自己的且仍 active
  const { data: listing, error: listErr } = await supabase
    .from('market_listings').select('*').eq('id', listingId).single();
  if (listErr || !listing) { res.status(404).json({ error: 'listing not found' }); return; }
  if (listing.seller_user_id !== req.userId) { res.status(403).json({ error: 'forbidden' }); return; }
  if (listing.status !== 'active') { res.status(400).json({ error: 'listing not active' }); return; }

  // 讀存檔
  const { data: saveRow, error: saveErr } = await supabase
    .from('player_saves').select('save_data').eq('user_id', req.userId).single();
  if (saveErr || !saveRow) { res.status(404).json({ error: 'save not found' }); return; }

  let saveData = saveRow.save_data;
  const snap   = listing.item_snapshot;

  if (listing.item_type === 'equipment') {
    const newOwned = [...(saveData?.player?.owned ?? []), snap];
    saveData = { ...saveData, player: { ...saveData.player, owned: newOwned } };

  } else if (listing.item_type === 'consumable') {
    const items: any[]  = saveData?.inventory?.items ?? [];
    const idx           = items.findIndex((i: any) => i.id === snap.id);
    const newItems      = idx === -1
      ? [...items, { id: snap.id, name: snap.name, qty: listing.qty }]
      : items.map((i: any, n: number) => n === idx ? { ...i, qty: i.qty + listing.qty } : i);
    saveData = { ...saveData, inventory: { ...saveData.inventory, items: newItems } };

  } else {
    // card
    const inv: any[]  = saveData?.cards?.inventory ?? [];
    const idx         = inv.findIndex((c: any) => c.cardId === snap.cardId);
    const newInv      = idx === -1
      ? [...inv, { cardId: snap.cardId, qty: listing.qty }]
      : inv.map((c: any, n: number) => n === idx ? { ...c, qty: c.qty + listing.qty } : c);
    saveData = { ...saveData, cards: { ...saveData.cards, inventory: newInv } };
  }

  const [cancelRes, saveRes] = await Promise.all([
    supabase.from('market_listings').update({ status: 'cancelled' }).eq('id', listingId),
    supabase.from('player_saves').update({ save_data: saveData, updated_at: new Date().toISOString() })
      .eq('user_id', req.userId),
  ]);

  if (cancelRes.error || saveRes.error) {
    res.status(500).json({ error: cancelRes.error?.message ?? saveRes.error?.message }); return;
  }

  res.json({ ok: true });
});

// ══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

const limiterPush = rateLimit({
  windowMs: 60 * 1000, max: 10,
  message: { error: '操作頻率過高，請稍後再試' },
  standardHeaders: true, legacyHeaders: false,
});

// POST /push/subscribe  { endpoint, keys: { p256dh, auth } }
app.post('/push/subscribe', limiterPush, requireAuth, async (req: any, res) => {
  const { endpoint, keys } = req.body ?? {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: 'invalid subscription' }); return;
  }
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id:  req.userId,
    endpoint,
    p256dh:   keys.p256dh,
    auth_key: keys.auth,
  }, { onConflict: 'endpoint' });
  if (error) { res.status(500).json({ error: error.message }); return; }
  res.json({ ok: true });
});

// DELETE /push/unsubscribe  { endpoint }
app.delete('/push/unsubscribe', limiterPush, requireAuth, async (req: any, res) => {
  const { endpoint } = req.body ?? {};
  if (!endpoint) { res.status(400).json({ error: 'endpoint required' }); return; }
  await supabase.from('push_subscriptions')
    .delete()
    .eq('user_id', req.userId)
    .eq('endpoint', endpoint);
  res.json({ ok: true });
});

// POST /push/notify-version  { version, notes? }  — admin only (x-admin-secret header)
app.post('/push/notify-version', async (req, res) => {
  if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET || !process.env.ADMIN_SECRET) {
    res.status(403).json({ error: 'forbidden' }); return;
  }
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
    res.status(503).json({ error: 'push not configured' }); return;
  }
  const { version, notes } = req.body ?? {};
  if (!version) { res.status(400).json({ error: 'version required' }); return; }

  const { data: subs } = await supabase
    .from('push_subscriptions').select('endpoint, p256dh, auth_key');
  if (!subs?.length) { res.json({ ok: true, sent: 0 }); return; }

  const payload = JSON.stringify({
    notification: {
      title: '有新版本上線了！',
      body:  version,
    },
  });

  const results = await Promise.allSettled(
    subs.map(sub => webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
      payload,
    ))
  );

  // 清除已失效的訂閱 (HTTP 410 Gone)
  const expired = subs.filter((_, i) => {
    const r = results[i];
    return r.status === 'rejected' && (r as any).reason?.statusCode === 410;
  });
  if (expired.length) {
    await supabase.from('push_subscriptions')
      .delete().in('endpoint', expired.map(s => s.endpoint));
  }

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const errors = results
    .filter(r => r.status === 'rejected')
    .map(r => ({ code: (r as any).reason?.statusCode, msg: (r as any).reason?.message }));
  res.json({ ok: true, sent, total: subs.length, errors });
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
