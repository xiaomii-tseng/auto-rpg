// 一次性腳本：建立測試帳號並注入存檔
// 執行：node scripts/create-test-account.mjs

const API = 'https://minirpg-q1zq.onrender.com';
const ACCOUNT     = 'test';
const PASSWORD    = '123456';
const PLAYER_NAME = '測試帳號';
const EMAIL       = 'test@example.com';

// ── 同 save-store.ts 的加密邏輯 ────────────────────────────
const _CK = new Uint8Array([
  0x7f, 0x3a, 0xc8, 0x15, 0x9e, 0x42, 0xd7, 0x6b,
  0x28, 0xf4, 0x51, 0x8d, 0xa3, 0x7c, 0x2e, 0xb9,
  0x64, 0x1f, 0x93, 0x5a, 0xe8, 0x37, 0x0c, 0x76,
  0xd5, 0x4b, 0x82, 0x19, 0xac, 0x63, 0xf0, 0x2d,
  0x58, 0x9b, 0xe4, 0x71, 0x3c, 0xa7, 0x06, 0xcd,
  0x85, 0x42, 0xfe, 0x1a, 0x67, 0xb3, 0x90, 0x4e,
  0xd2, 0x7f, 0x38, 0xc5, 0x0b, 0x91, 0x56, 0xe3,
  0xaa, 0x2c, 0x78, 0xf1, 0x43, 0x8e, 0xbd, 0x60,
]);

function encryptSave(plain) {
  const bytes = new TextEncoder().encode(plain);
  const out   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ _CK[i % _CK.length];
  return Buffer.from(out).toString('base64');
}

// ── 存檔內容 ────────────────────────────────────────────────
const saveData = {
  version:    '1.0.0',
  playerName: PLAYER_NAME,
  skinId:     0,
  player: {
    level:    50,
    exp:      0,
    equipped: { hat: null, outfit: null, shoes: null, ring1: null, ring2: null, sword: null },
    owned:    [],
  },
  inventory: {
    gold:  5_000_000,
    items: [
      { id: 'stone_broken', name: '破損強化石', qty: 10000 },
      { id: 'blank_card',   name: '空白卡片',   qty: 500   },
    ],
  },
  cards:     { equipped: [null, null, null], inventory: [] },
  quests:    { quests: [] },
  potionBar: { slots: [null, null] },
  skillTree: { learned: [], attackMode: 'projectile' },
  tower:     { keys: 0, bestFloor: 0 },
  tutorial:  { battleDone: true, move: true, attack: true, potion: true, equip: true, card: true, brokenStone: true, shop: true, market: true, ranking: true, altar: true, wardrobe: true, quest: true, skill: true },
};

async function main() {
  // 1. 註冊
  console.log('📝 註冊帳號...');
  const regRes = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD, playerId: PLAYER_NAME, email: EMAIL }),
  });
  const regJson = await regRes.json();

  if (regRes.ok) {
    console.log('✅ 註冊成功');
  } else if (regJson.error?.includes('已被使用') || regJson.error?.includes('already') || regRes.status === 409) {
    console.log('⚠️  帳號已存在，繼續登入...');
  } else {
    console.error('❌ 註冊失敗', regJson);
    process.exit(1);
  }

  // 2. 登入取得 token
  console.log('🔑 登入...');
  const loginRes = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account: ACCOUNT, password: PASSWORD }),
  });
  if (!loginRes.ok) { console.error('❌ 登入失敗', await loginRes.text()); process.exit(1); }
  const { accessToken: token, sessionId } = await loginRes.json();
  console.log('✅ 登入成功');

  // 2. 上傳存檔
  console.log('💾 上傳存檔...');
  const encrypted = encryptSave(JSON.stringify(saveData));
  const saveRes = await fetch(`${API}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ saveData, version: '1.0.0', sessionId }),
  });

  if (!saveRes.ok) { console.error('❌ 存檔失敗', await saveRes.text()); process.exit(1); }

  console.log('✅ 完成！');
  console.log(`   帳號：${ACCOUNT}`);
  console.log(`   密碼：${PASSWORD}`);
  console.log(`   等級：${saveData.player.level}`);
  console.log(`   金幣：${saveData.inventory.gold.toLocaleString()}`);
  console.log(`   破損強化石：${saveData.inventory.items[0].qty}`);
  console.log(`   空白卡片：${saveData.inventory.items[1].qty}`);
}

main().catch(console.error);
