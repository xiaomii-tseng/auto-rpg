import { Element, StatBonus } from './equipment-data';

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface DropEntry {
  itemId:   string;
  itemName: string;
  rate:     number;   // 0~1
  qtyMin:   number;
  qtyMax:   number;
}

export interface MonsterDef {
  id:           string;
  name:         string;
  spriteKey:    string;   // Phaser texture key prefix (e.g. 'slime', 'slime2', 'slime3')
  frameEnd:     number;   // last frame index (0-based); -1 = no animation
  element:      Element;
  tint:         number;   // hex tint (0xffffff = no tint)
  fillTint?:    boolean;  // use setTintFill to override sprite colours entirely
  tier:         number;
  hp:           number;
  atk:          number;
  speed:        number;
  exp:          number;
  gold:         number;
  cardId:       string;
  cardDropRate: number;   // 0~1
  drops:        DropEntry[];
}

export interface CardDef {
  id:        string;
  name:      string;
  monsterId: string;
  element:   Element;
  tint:      number;
  effect:    StatBonus;
  desc:      string;
}

// ── Element tints ──────────────────────────────────────────────────────────

export const ELEMENT_TINTS: Record<Element, number> = {
  none:  0xffffff,
  grass: 0x88ff88,
  water: 0x88ccff,
  fire:  0xff9966,
};

// ── Enhancement stone item IDs (referenced by game.scene & inventory) ──────
export const ITEM_STONE_BROKEN = 'stone_broken';  // 破損強化石
export const ITEM_STONE_INTACT = 'stone_intact';  // 完整強化石

// ── Elite monster multipliers ──────────────────────────────────────────────
export const ELITE_HP_MULT    = 3.0;   // 菁英HP倍率（相對物種基礎值）
export const ELITE_SCALE_MOD  = 1.6;   // 菁英體型縮放倍率

// ── Shared drop tables ─────────────────────────────────────────────────────

const smallDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 1.00, qtyMin: 1, qtyMax: 1 },
];

const bossDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 1.00, qtyMin: 2, qtyMax: 4 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 1.00, qtyMin: 1, qtyMax: 1 },
];

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  {
    id: 'slime_green_s', name: '綠史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44ff44, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 15, gold: 5,
    cardId: 'card_slime_green_s', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'slime_red_s', name: '紅史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 1,
    hp: 65, atk: 10, speed: 85, exp: 18, gold: 6,
    cardId: 'card_slime_red_s', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'slime_blue_s', name: '藍史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2299ff, tier: 1,
    hp: 55, atk: 8, speed: 100, exp: 15, gold: 5,
    cardId: 'card_slime_blue_s', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'slime_white_s', name: '白史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xccddee, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 12, gold: 4,
    cardId: 'card_slime_white_s', cardDropRate: 1.00,
    drops: smallDrops,
  },

  // ── 殭屍史萊姆(小) / 熔岩史萊姆(小) ───────────────────
  {
    id: 'slime_zombie_s', name: '殭屍史萊姆(小)', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0x99dd44, tier: 1,
    hp: 80, atk: 10, speed: 70, exp: 20, gold: 7,
    cardId: 'card_slime_zombie_s', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'slime_lava_s', name: '熔岩史萊姆(小)', spriteKey: 'slime3', frameEnd: 5,
    element: 'none', tint: 0xffffff, tier: 1,
    hp: 70, atk: 12, speed: 100, exp: 22, gold: 8,
    cardId: 'card_slime_lava_s', cardDropRate: 1.00,
    drops: smallDrops,
  },

  // ── 菁英史萊姆 Tier 3 ──────────────────────────────────
  // HP/scale 由生成器套用 ELITE_HP_MULT / ELITE_SCALE_MOD，基礎值與小怪相同
  {
    id: 'elite_slime_green', name: '綠史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x00ff88, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 60, gold: 25,
    cardId: 'card_elite_slime_green', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'elite_slime_red', name: '紅史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff6600, tier: 3,
    hp: 65, atk: 10, speed: 90, exp: 65, gold: 28,
    cardId: 'card_elite_slime_red', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'elite_slime_blue', name: '藍史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x00ddff, tier: 3,
    hp: 55, atk: 8, speed: 110, exp: 60, gold: 25,
    cardId: 'card_elite_slime_blue', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'elite_slime_white', name: '白史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xeeffff, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 55, gold: 22,
    cardId: 'card_elite_slime_white', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'elite_slime_zombie', name: '殭屍史萊姆(菁英)', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xccff44, tier: 3,
    hp: 80, atk: 10, speed: 78, exp: 75, gold: 32,
    cardId: 'card_elite_slime_zombie', cardDropRate: 1.00,
    drops: smallDrops,
  },
  {
    id: 'elite_slime_lava', name: '熔岩史萊姆(菁英)', spriteKey: 'slime3', frameEnd: 5,
    element: 'none', tint: 0xff4400, tier: 3,
    hp: 70, atk: 12, speed: 110, exp: 80, gold: 36,
    cardId: 'card_elite_slime_lava', cardDropRate: 1.00,
    drops: smallDrops,
  },

  // ── 史萊姆王 Tier 5 (Slime1 精靈) ──────────────────────
  {
    id: 'boss_slime_green', name: '綠史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'grass', tint: 0x33ff33, tier: 5,
    hp: 750, atk: 25, speed: 80, exp: 200, gold: 100,
    cardId: 'card_boss_slime_green', cardDropRate: 1.00,
    drops: bossDrops,
  },
  {
    id: 'boss_slime_red', name: '紅史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'fire', tint: 0xff1111, tier: 5,
    hp: 750, atk: 30, speed: 80, exp: 200, gold: 100,
    cardId: 'card_boss_slime_red', cardDropRate: 1.00,
    drops: bossDrops,
  },
  {
    id: 'boss_slime_blue', name: '藍史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'water', tint: 0x1188ff, tier: 5,
    hp: 720, atk: 25, speed: 80, exp: 200, gold: 100,
    cardId: 'card_boss_slime_blue', cardDropRate: 1.00,
    drops: bossDrops,
  },
  {
    id: 'boss_slime_white', name: '白史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'none', tint: 0xccddee, tier: 5,
    hp: 750, atk: 25, speed: 80, exp: 200, gold: 100,
    cardId: 'card_boss_slime_white', cardDropRate: 1.00,
    drops: bossDrops,
  },

  // ── 殭屍史萊姆王 (Slime2 精靈) ─────────────────────────
  {
    id: 'boss_zombie_slime', name: '殭屍史萊姆王', spriteKey: 'slime2', frameEnd: 9,
    element: 'none', tint: 0x99dd44, tier: 5,
    hp: 825, atk: 28, speed: 80, exp: 220, gold: 120,
    cardId: 'card_boss_zombie_slime', cardDropRate: 1.00,
    drops: bossDrops,
  },

  // ── 熔岩史萊姆王 (Slime3 精靈) ─────────────────────────
  {
    id: 'boss_lava_slime', name: '熔岩史萊姆王', spriteKey: 'slime3', frameEnd: 9,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 900, atk: 32, speed: 80, exp: 250, gold: 150,
    cardId: 'card_boss_lava_slime', cardDropRate: 1.00,
    drops: bossDrops,
  },
];

// ── Card definitions ───────────────────────────────────────────────────────

export const CARD_DEFS: CardDef[] = [

  // ── 小史萊姆卡 ──
  {
    id: 'card_slime_green_s', name: '綠史萊姆(小)卡片', monsterId: 'slime_green_s',
    element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_slime_red_s', name: '紅史萊姆(小)卡片', monsterId: 'slime_red_s',
    element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_slime_blue_s', name: '藍史萊姆(小)卡片', monsterId: 'slime_blue_s',
    element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_slime_white_s', name: '白史萊姆(小)卡片', monsterId: 'slime_white_s',
    element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_slime_zombie_s', name: '殭屍史萊姆(小)卡片', monsterId: 'slime_zombie_s',
    element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_slime_lava_s', name: '熔岩史萊姆(小)卡片', monsterId: 'slime_lava_s',
    element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)',
  },

  // ── 菁英史萊姆卡（銀框，tier 3）──
  {
    id: 'card_elite_slime_green', name: '綠史萊姆(菁英)卡片', monsterId: 'elite_slime_green',
    element: 'grass', tint: 0x00ff88, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_elite_slime_red', name: '紅史萊姆(菁英)卡片', monsterId: 'elite_slime_red',
    element: 'fire', tint: 0xff6600, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_elite_slime_blue', name: '藍史萊姆(菁英)卡片', monsterId: 'elite_slime_blue',
    element: 'water', tint: 0x00ddff, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_elite_slime_white', name: '白史萊姆(菁英)卡片', monsterId: 'elite_slime_white',
    element: 'none', tint: 0xaaccdd, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_elite_slime_zombie', name: '殭屍史萊姆(菁英)卡片', monsterId: 'elite_slime_zombie',
    element: 'none', tint: 0xccff44, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_elite_slime_lava', name: '熔岩史萊姆(菁英)卡片', monsterId: 'elite_slime_lava',
    element: 'none', tint: 0xff4400, effect: {}, desc: '(待設定)',
  },

  // ── 史萊姆王卡 ──
  {
    id: 'card_boss_slime_green', name: '綠史萊姆王卡片', monsterId: 'boss_slime_green',
    element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_boss_slime_red', name: '紅史萊姆王卡片', monsterId: 'boss_slime_red',
    element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_boss_slime_blue', name: '藍史萊姆王卡片', monsterId: 'boss_slime_blue',
    element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_boss_slime_white', name: '白史萊姆王卡片', monsterId: 'boss_slime_white',
    element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_boss_zombie_slime', name: '殭屍史萊姆王卡片', monsterId: 'boss_zombie_slime',
    element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)',
  },
  {
    id: 'card_boss_lava_slime', name: '熔岩史萊姆王卡片', monsterId: 'boss_lava_slime',
    element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}
