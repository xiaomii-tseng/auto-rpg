import { Element, StatBonus } from './equipment-data';

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface DropEntry {
  itemId:   string;
  itemName: string;
  rate:     number;   // 0~1
  qtyMin:   number;
  qtyMax:   number;
}

export interface CardDropEntry {
  cardId: string;
  rate:   number;   // 0~1
}

export interface MonsterDef {
  id:        string;
  name:      string;
  spriteKey: string;
  frameEnd:  number;
  element:   Element;
  tint:      number;
  fillTint?: boolean;
  tier:      number;
  hp:        number;
  atk:       number;
  def?:      number;
  speed:     number;
  exp:       number;
  gold:      number;
  cards:     CardDropEntry[];   // A/B/C 三種卡片
  drops:     DropEntry[];
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
export const ITEM_STONE_GUARD  = 'stone_guard';   // 防退石

// ── Card drop rates (A=普通 / B=稀有 / C=傳說) ────────────────────────────
const CA_S = 0.03, CB_S = 0.01, CC_S = 0.003;  // 小怪
const CA_E = 0.05, CB_E = 0.02, CC_E = 0.005;  // 菁英
const CA_B = 0.10, CB_B = 0.04, CC_B = 0.01;   // Boss

// ── Elite monster multipliers ──────────────────────────────────────────────
export const ELITE_HP_MULT    = 3.0;   // 菁英HP倍率（相對物種基礎值）
export const ELITE_SCALE_MOD  = 1.6;   // 菁英體型縮放倍率

// ── Shared drop tables ─────────────────────────────────────────────────────
//
// 目標：+7 ≈ 10 趟、+10 ≈ 43 趟（含防退石全保護）
// 每趟估計：~60小怪、~8菁英、1Boss
// 破損石/趟 = 60×0.02×1 + 8×0.04×2.5 + 0.35×4.5 = 1.2+0.8+1.575 ≈ 3.58

const smallDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 0.03, qtyMin: 1, qtyMax: 1 },
];

const eliteDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 0.10, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 0.02, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_GUARD,  itemName: '防退石',     rate: 0.02, qtyMin: 1, qtyMax: 1 },
];

const bossDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 1.00, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 0.30, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_GUARD,  itemName: '防退石',     rate: 0.10, qtyMin: 1, qtyMax: 1 },
];

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  {
    id: 'slime_green_s', name: '綠史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44ff44, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_green_s_a', rate: CA_S }, { cardId: 'card_slime_green_s_b', rate: CB_S }, { cardId: 'card_slime_green_s_c', rate: CC_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_red_s', name: '紅史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 1,
    hp: 65, atk: 10, speed: 85, exp: 18, gold: 6,
    cards: [{ cardId: 'card_slime_red_s_a', rate: CA_S }, { cardId: 'card_slime_red_s_b', rate: CB_S }, { cardId: 'card_slime_red_s_c', rate: CC_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_blue_s', name: '藍史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2299ff, tier: 1,
    hp: 55, atk: 8, speed: 100, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_blue_s_a', rate: CA_S }, { cardId: 'card_slime_blue_s_b', rate: CB_S }, { cardId: 'card_slime_blue_s_c', rate: CC_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_white_s', name: '白史萊姆(小)', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xccddee, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 12, gold: 4,
    cards: [{ cardId: 'card_slime_white_s_a', rate: CA_S }, { cardId: 'card_slime_white_s_b', rate: CB_S }, { cardId: 'card_slime_white_s_c', rate: CC_S }],
    drops: smallDrops,
  },

  // ── 殭屍史萊姆(小) / 熔岩史萊姆(小) ───────────────────
  {
    id: 'slime_zombie_s', name: '殭屍史萊姆(小)', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0x99dd44, tier: 1,
    hp: 80, atk: 10, speed: 70, exp: 20, gold: 7,
    cards: [{ cardId: 'card_slime_zombie_s_a', rate: CA_S }, { cardId: 'card_slime_zombie_s_b', rate: CB_S }, { cardId: 'card_slime_zombie_s_c', rate: CC_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_lava_s', name: '熔岩史萊姆(小)', spriteKey: 'slime3', frameEnd: 5,
    element: 'none', tint: 0xffffff, tier: 1,
    hp: 70, atk: 12, speed: 100, exp: 22, gold: 8,
    cards: [{ cardId: 'card_slime_lava_s_a', rate: CA_S }, { cardId: 'card_slime_lava_s_b', rate: CB_S }, { cardId: 'card_slime_lava_s_c', rate: CC_S }],
    drops: smallDrops,
  },

  // ── 菁英史萊姆 Tier 3 ──────────────────────────────────
  {
    id: 'elite_slime_green', name: '綠史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x00ff88, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 60, gold: 25,
    cards: [{ cardId: 'card_elite_slime_green_a', rate: CA_E }, { cardId: 'card_elite_slime_green_b', rate: CB_E }, { cardId: 'card_elite_slime_green_c', rate: CC_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_red', name: '紅史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff6600, tier: 3,
    hp: 65, atk: 10, speed: 90, exp: 65, gold: 28,
    cards: [{ cardId: 'card_elite_slime_red_a', rate: CA_E }, { cardId: 'card_elite_slime_red_b', rate: CB_E }, { cardId: 'card_elite_slime_red_c', rate: CC_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_blue', name: '藍史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x00ddff, tier: 3,
    hp: 55, atk: 8, speed: 110, exp: 60, gold: 25,
    cards: [{ cardId: 'card_elite_slime_blue_a', rate: CA_E }, { cardId: 'card_elite_slime_blue_b', rate: CB_E }, { cardId: 'card_elite_slime_blue_c', rate: CC_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_white', name: '白史萊姆(菁英)', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xeeffff, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 55, gold: 22,
    cards: [{ cardId: 'card_elite_slime_white_a', rate: CA_E }, { cardId: 'card_elite_slime_white_b', rate: CB_E }, { cardId: 'card_elite_slime_white_c', rate: CC_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_zombie', name: '殭屍史萊姆(菁英)', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xccff44, tier: 3,
    hp: 80, atk: 10, speed: 78, exp: 75, gold: 32,
    cards: [{ cardId: 'card_elite_slime_zombie_a', rate: CA_E }, { cardId: 'card_elite_slime_zombie_b', rate: CB_E }, { cardId: 'card_elite_slime_zombie_c', rate: CC_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_lava', name: '熔岩史萊姆(菁英)', spriteKey: 'slime3', frameEnd: 5,
    element: 'none', tint: 0xff4400, tier: 3,
    hp: 70, atk: 12, speed: 110, exp: 80, gold: 36,
    cards: [{ cardId: 'card_elite_slime_lava_a', rate: CA_E }, { cardId: 'card_elite_slime_lava_b', rate: CB_E }, { cardId: 'card_elite_slime_lava_c', rate: CC_E }],
    drops: eliteDrops,
  },

  // ── 史萊姆王 Tier 5 (Slime1 精靈) ──────────────────────
  {
    id: 'boss_slime_green', name: '綠史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'grass', tint: 0x33ff33, tier: 5,
    hp: 750, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_green_a', rate: CA_B }, { cardId: 'card_boss_slime_green_b', rate: CB_B }, { cardId: 'card_boss_slime_green_c', rate: CC_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_red', name: '紅史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'fire', tint: 0xff1111, tier: 5,
    hp: 750, atk: 30, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_red_a', rate: CA_B }, { cardId: 'card_boss_slime_red_b', rate: CB_B }, { cardId: 'card_boss_slime_red_c', rate: CC_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_blue', name: '藍史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'water', tint: 0x1188ff, tier: 5,
    hp: 720, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_blue_a', rate: CA_B }, { cardId: 'card_boss_slime_blue_b', rate: CB_B }, { cardId: 'card_boss_slime_blue_c', rate: CC_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_white', name: '白史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'none', tint: 0xccddee, tier: 5,
    hp: 750, atk: 25, def: 24, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_white_a', rate: CA_B }, { cardId: 'card_boss_slime_white_b', rate: CB_B }, { cardId: 'card_boss_slime_white_c', rate: CC_B }],
    drops: bossDrops,
  },

  // ── 殭屍史萊姆王 (Slime2 精靈) ─────────────────────────
  {
    id: 'boss_zombie_slime', name: '殭屍史萊姆王', spriteKey: 'slime2', frameEnd: 9,
    element: 'none', tint: 0x99dd44, tier: 5,
    hp: 825, atk: 28, def: 20, speed: 80, exp: 220, gold: 120,
    cards: [{ cardId: 'card_boss_zombie_slime_a', rate: CA_B }, { cardId: 'card_boss_zombie_slime_b', rate: CB_B }, { cardId: 'card_boss_zombie_slime_c', rate: CC_B }],
    drops: bossDrops,
  },

  // ── 熔岩史萊姆王 (Slime3 精靈) ─────────────────────────
  {
    id: 'boss_lava_slime', name: '熔岩史萊姆王', spriteKey: 'slime3', frameEnd: 9,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 900, atk: 32, def: 30, speed: 80, exp: 250, gold: 150,
    cards: [{ cardId: 'card_boss_lava_slime_a', rate: CA_B }, { cardId: 'card_boss_lava_slime_b', rate: CB_B }, { cardId: 'card_boss_lava_slime_c', rate: CC_B }],
    drops: bossDrops,
  },
];

// ── Card definitions ───────────────────────────────────────────────────────

export const CARD_DEFS: CardDef[] = [

  // ── 小史萊姆卡 A/B/C ──
  { id: 'card_slime_green_s_a', name: '綠史萊姆(小)A卡', monsterId: 'slime_green_s', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_green_s_b', name: '綠史萊姆(小)B卡', monsterId: 'slime_green_s', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_green_s_c', name: '綠史萊姆(小)C卡', monsterId: 'slime_green_s', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },

  { id: 'card_slime_red_s_a', name: '紅史萊姆(小)A卡', monsterId: 'slime_red_s', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_red_s_b', name: '紅史萊姆(小)B卡', monsterId: 'slime_red_s', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_red_s_c', name: '紅史萊姆(小)C卡', monsterId: 'slime_red_s', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },

  { id: 'card_slime_blue_s_a', name: '藍史萊姆(小)A卡', monsterId: 'slime_blue_s', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_blue_s_b', name: '藍史萊姆(小)B卡', monsterId: 'slime_blue_s', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_blue_s_c', name: '藍史萊姆(小)C卡', monsterId: 'slime_blue_s', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },

  { id: 'card_slime_white_s_a', name: '白史萊姆(小)A卡', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_white_s_b', name: '白史萊姆(小)B卡', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_white_s_c', name: '白史萊姆(小)C卡', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },

  { id: 'card_slime_zombie_s_a', name: '殭屍史萊姆(小)A卡', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_zombie_s_b', name: '殭屍史萊姆(小)B卡', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_zombie_s_c', name: '殭屍史萊姆(小)C卡', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },

  { id: 'card_slime_lava_s_a', name: '熔岩史萊姆(小)A卡', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_lava_s_b', name: '熔岩史萊姆(小)B卡', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },
  { id: 'card_slime_lava_s_c', name: '熔岩史萊姆(小)C卡', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },

  // ── 菁英史萊姆卡 A/B/C ──
  { id: 'card_elite_slime_green_a', name: '綠史萊姆(菁英)A卡', monsterId: 'elite_slime_green', element: 'grass', tint: 0x00ff88, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_green_b', name: '綠史萊姆(菁英)B卡', monsterId: 'elite_slime_green', element: 'grass', tint: 0x00ff88, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_green_c', name: '綠史萊姆(菁英)C卡', monsterId: 'elite_slime_green', element: 'grass', tint: 0x00ff88, effect: {}, desc: '(待設定)' },

  { id: 'card_elite_slime_red_a', name: '紅史萊姆(菁英)A卡', monsterId: 'elite_slime_red', element: 'fire', tint: 0xff6600, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_red_b', name: '紅史萊姆(菁英)B卡', monsterId: 'elite_slime_red', element: 'fire', tint: 0xff6600, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_red_c', name: '紅史萊姆(菁英)C卡', monsterId: 'elite_slime_red', element: 'fire', tint: 0xff6600, effect: {}, desc: '(待設定)' },

  { id: 'card_elite_slime_blue_a', name: '藍史萊姆(菁英)A卡', monsterId: 'elite_slime_blue', element: 'water', tint: 0x00ddff, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_blue_b', name: '藍史萊姆(菁英)B卡', monsterId: 'elite_slime_blue', element: 'water', tint: 0x00ddff, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_blue_c', name: '藍史萊姆(菁英)C卡', monsterId: 'elite_slime_blue', element: 'water', tint: 0x00ddff, effect: {}, desc: '(待設定)' },

  { id: 'card_elite_slime_white_a', name: '白史萊姆(菁英)A卡', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_white_b', name: '白史萊姆(菁英)B卡', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_white_c', name: '白史萊姆(菁英)C卡', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: {}, desc: '(待設定)' },

  { id: 'card_elite_slime_zombie_a', name: '殭屍史萊姆(菁英)A卡', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_zombie_b', name: '殭屍史萊姆(菁英)B卡', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_zombie_c', name: '殭屍史萊姆(菁英)C卡', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: {}, desc: '(待設定)' },

  { id: 'card_elite_slime_lava_a', name: '熔岩史萊姆(菁英)A卡', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_lava_b', name: '熔岩史萊姆(菁英)B卡', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: {}, desc: '(待設定)' },
  { id: 'card_elite_slime_lava_c', name: '熔岩史萊姆(菁英)C卡', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: {}, desc: '(待設定)' },

  // ── 史萊姆王卡 A/B/C ──
  { id: 'card_boss_slime_green_a', name: '綠史萊姆王A卡', monsterId: 'boss_slime_green', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_green_b', name: '綠史萊姆王B卡', monsterId: 'boss_slime_green', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_green_c', name: '綠史萊姆王C卡', monsterId: 'boss_slime_green', element: 'grass', tint: 0x44cc44, effect: {}, desc: '(待設定)' },

  { id: 'card_boss_slime_red_a', name: '紅史萊姆王A卡', monsterId: 'boss_slime_red', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_red_b', name: '紅史萊姆王B卡', monsterId: 'boss_slime_red', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_red_c', name: '紅史萊姆王C卡', monsterId: 'boss_slime_red', element: 'fire', tint: 0xff5522, effect: {}, desc: '(待設定)' },

  { id: 'card_boss_slime_blue_a', name: '藍史萊姆王A卡', monsterId: 'boss_slime_blue', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_blue_b', name: '藍史萊姆王B卡', monsterId: 'boss_slime_blue', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_blue_c', name: '藍史萊姆王C卡', monsterId: 'boss_slime_blue', element: 'water', tint: 0x44aaff, effect: {}, desc: '(待設定)' },

  { id: 'card_boss_slime_white_a', name: '白史萊姆王A卡', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_white_b', name: '白史萊姆王B卡', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_slime_white_c', name: '白史萊姆王C卡', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: {}, desc: '(待設定)' },

  { id: 'card_boss_zombie_slime_a', name: '殭屍史萊姆王A卡', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_zombie_slime_b', name: '殭屍史萊姆王B卡', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_zombie_slime_c', name: '殭屍史萊姆王C卡', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: {}, desc: '(待設定)' },

  { id: 'card_boss_lava_slime_a', name: '熔岩史萊姆王A卡', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_lava_slime_b', name: '熔岩史萊姆王B卡', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },
  { id: 'card_boss_lava_slime_c', name: '熔岩史萊姆王C卡', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: {}, desc: '(待設定)' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}
