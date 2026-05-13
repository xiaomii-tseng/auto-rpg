const DPR = (window as any).__gameDpr as number;
import { Element, StatBonus } from './equipment-data';

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface DropEntry {
  itemId: string;
  itemName: string;
  rate: number;   // 0~1
  qtyMin: number;
  qtyMax: number;
}

export interface CardDropEntry {
  cardId: string;
  rate: number;   // 0~1
}

export interface MonsterDef {
  id: string;
  name: string;
  spriteKey: string;
  frameEnd: number;
  element: Element;
  tint: number;
  fillTint?: boolean;
  tier: number;
  hp: number;
  atk: number;
  def?: number;
  speed: number;
  exp: number;
  gold: number;
  minStar?: number;   // 最低星級才出現，不設則任意星
  cards: CardDropEntry[];   // A/B/C 三種卡片
  drops: DropEntry[];
}

export interface CardDef {
  id: string;
  name: string;
  monsterId: string;
  element: Element;
  tint: number;
  effect: StatBonus;
  desc: string;
}

// ── Element tints ──────────────────────────────────────────────────────────

export const ELEMENT_TINTS: Record<Element, number> = {
  none: 0xffffff,
  grass: 0x88ff88,
  water: 0x88ccff,
  fire: 0xff9966,
};

// ── Enhancement stone item IDs (referenced by game.scene & inventory) ──────
export const ITEM_BLANK_CARD   = 'blank_card';      // 空白卡片
export const ITEM_STONE_BROKEN = 'stone_broken';    // 破損強化石
export const ITEM_STONE_INTACT = 'stone_intact';    // 完整強化石
export const ITEM_STONE_GUARD = 'stone_guard';     // 防退石
export const ITEM_QUEST_REROLL = 'quest_reroll';   // 任務重製石
export const ITEM_POTION_HEALTH_S = 'potion_health_s'; // 小型回復藥水 HP+50
export const ITEM_POTION_HEALTH_M = 'potion_health_m'; // 中型回復藥水 HP+100
export const ITEM_POTION_HEALTH_L = 'potion_health_l'; // 大型回復藥水 HP+200
export const ITEM_POTION_REVIVE = 'potion_revive';   // 復活藥水
export const ITEM_POTION_ATK   = 'potion_atk';      // 攻擊力藥水 ATK+20% 30秒
export const ITEM_POTION_DEF   = 'potion_def';      // 防禦力藥水 DEF+20 30秒
export const ITEM_POTION_SPEED = 'potion_speed';    // 速度藥水 Speed+20 30秒

export function getHealthPotionForStar(questStar: number): { id: string; name: string; healAmt: number } {
  if (questStar >= 5) return { id: ITEM_POTION_HEALTH_L, name: '大型回復藥水', healAmt: 200 };
  if (questStar >= 3) return { id: ITEM_POTION_HEALTH_M, name: '中型回復藥水', healAmt: 100 };
  return { id: ITEM_POTION_HEALTH_S, name: '小型回復藥水', healAmt: 50 };
}

// ── Card drop rates (per card, star multiplier applied separately) ─────────
const CR_S = 0.005;  // 小怪：每張卡 0.5%  → 平均每局約 1.5 張
const CR_E = 0.006;  // 菁英：每張卡 0.6%  → 平均 4 局掉 1 張
const CR_B = 0.010;  // Boss：每張卡 1.0%  → 平均 30 局掉 1 張

// ── Sprite scale constants ─────────────────────────────────────────────────
export const MONSTER_SCALE_SMALL = +(0.78 * DPR).toFixed(4);
export const MONSTER_SCALE_ELITE = +(1.25 * DPR).toFixed(4);
export const MONSTER_SCALE_BOSS = +(2.0 * DPR).toFixed(4);

/** 統一比例：小怪 0.78 / 菁英 1.25 / Boss 2.0 */
export function monsterScale(tier: number): number {
  return tier >= 5 ? MONSTER_SCALE_BOSS : tier === 3 ? MONSTER_SCALE_ELITE : MONSTER_SCALE_SMALL;
}
export const monsterCardScale = monsterScale;
export const monsterDetailScale = monsterScale;

// ── Elite monster multipliers ──────────────────────────────────────────────
export const ELITE_HP_MULT = 1.75;
export const ELITE_SCALE_MOD = +(MONSTER_SCALE_ELITE / MONSTER_SCALE_SMALL).toFixed(4);

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
  { itemId: ITEM_STONE_GUARD, itemName: '防退石', rate: 0.02, qtyMin: 1, qtyMax: 1 },
];

const bossDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 1.00, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 0.30, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_GUARD, itemName: '防退石', rate: 0.10, qtyMin: 1, qtyMax: 1 },
];

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  {
    id: 'slime_green_s', name: '綠史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44ff44, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_green_s_a', rate: CR_S }, { cardId: 'card_slime_green_s_b', rate: CR_S }, { cardId: 'card_slime_green_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_red_s', name: '紅史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 1,
    hp: 65, atk: 10, speed: 85, exp: 18, gold: 6,
    cards: [{ cardId: 'card_slime_red_s_a', rate: CR_S }, { cardId: 'card_slime_red_s_b', rate: CR_S }, { cardId: 'card_slime_red_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_blue_s', name: '藍史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2299ff, tier: 1,
    hp: 55, atk: 8, speed: 100, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_blue_s_a', rate: CR_S }, { cardId: 'card_slime_blue_s_b', rate: CR_S }, { cardId: 'card_slime_blue_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_white_s', name: '白史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xccddee, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 12, gold: 4,
    cards: [{ cardId: 'card_slime_white_s_a', rate: CR_S }, { cardId: 'card_slime_white_s_b', rate: CR_S }, { cardId: 'card_slime_white_s_c', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 殭屍史萊姆小 / 熔岩史萊姆小 ───────────────────
  {
    id: 'slime_zombie_s', name: '殭屍史萊姆', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0x99dd44, tier: 1,
    hp: 80, atk: 10, speed: 70, exp: 20, gold: 7,
    cards: [{ cardId: 'card_slime_zombie_s_a', rate: CR_S }, { cardId: 'card_slime_zombie_s_b', rate: CR_S }, { cardId: 'card_slime_zombie_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_lava_s', name: '熔岩史萊姆', spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 1,
    hp: 70, atk: 12, speed: 100, exp: 22, gold: 8,
    cards: [{ cardId: 'card_slime_lava_s_a', rate: CR_S }, { cardId: 'card_slime_lava_s_b', rate: CR_S }, { cardId: 'card_slime_lava_s_c', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 菁英史萊姆 Tier 3 ──────────────────────────────────
  {
    id: 'elite_slime_green', name: '綠史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x00ff88, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 60, gold: 25,
    cards: [{ cardId: 'card_elite_slime_green_a', rate: CR_E }, { cardId: 'card_elite_slime_green_b', rate: CR_E }, { cardId: 'card_elite_slime_green_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_red', name: '紅史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 3,
    hp: 65, atk: 10, speed: 90, exp: 65, gold: 28,
    cards: [{ cardId: 'card_elite_slime_red_a', rate: CR_E }, { cardId: 'card_elite_slime_red_b', rate: CR_E }, { cardId: 'card_elite_slime_red_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_blue', name: '藍史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x00ddff, tier: 3,
    hp: 55, atk: 8, speed: 110, exp: 60, gold: 25,
    cards: [{ cardId: 'card_elite_slime_blue_a', rate: CR_E }, { cardId: 'card_elite_slime_blue_b', rate: CR_E }, { cardId: 'card_elite_slime_blue_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_white', name: '白史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xeeffff, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 55, gold: 22,
    cards: [{ cardId: 'card_elite_slime_white_a', rate: CR_E }, { cardId: 'card_elite_slime_white_b', rate: CR_E }, { cardId: 'card_elite_slime_white_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_zombie', name: '殭屍史萊姆菁英', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xccff44, tier: 3,
    hp: 80, atk: 10, speed: 78, exp: 75, gold: 32,
    cards: [{ cardId: 'card_elite_slime_zombie_a', rate: CR_E }, { cardId: 'card_elite_slime_zombie_b', rate: CR_E }, { cardId: 'card_elite_slime_zombie_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_lava', name: '熔岩史萊姆菁英', spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 3,
    hp: 70, atk: 12, speed: 110, exp: 80, gold: 36,
    cards: [{ cardId: 'card_elite_slime_lava_a', rate: CR_E }, { cardId: 'card_elite_slime_lava_b', rate: CR_E }, { cardId: 'card_elite_slime_lava_c', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 花怪小怪 Tier 2 (minStar=2) ────────────────────────
  {
    id: 'plant1_s', name: '食人花', spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 63, atk: 7, speed: 0, exp: 28, gold: 10,
    cards: [{ cardId: 'card_plant1_s_a', rate: CR_S }, { cardId: 'card_plant1_s_b', rate: CR_S }, { cardId: 'card_plant1_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant2_s', name: '藤蔓花', spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 65, atk: 9, speed: 0, exp: 30, gold: 11,
    cards: [{ cardId: 'card_plant2_s_a', rate: CR_S }, { cardId: 'card_plant2_s_b', rate: CR_S }, { cardId: 'card_plant2_s_c', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant3_s', name: '不死花', spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 67, atk: 10, speed: 0, exp: 32, gold: 12,
    cards: [{ cardId: 'card_plant3_s_a', rate: CR_S }, { cardId: 'card_plant3_s_b', rate: CR_S }, { cardId: 'card_plant3_s_c', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 花怪菁英 Tier 3 (minStar=2) ─────────────────────────
  {
    id: 'elite_plant1', name: '菁英食人花', spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 63, atk: 7, speed: 0, exp: 90, gold: 38,
    cards: [{ cardId: 'card_elite_plant1_a', rate: CR_E }, { cardId: 'card_elite_plant1_b', rate: CR_E }, { cardId: 'card_elite_plant1_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant2', name: '菁英藤蔓花', spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 65, atk: 9, speed: 0, exp: 95, gold: 40,
    cards: [{ cardId: 'card_elite_plant2_a', rate: CR_E }, { cardId: 'card_elite_plant2_b', rate: CR_E }, { cardId: 'card_elite_plant2_c', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant3', name: '菁英不死花', spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 67, atk: 10, speed: 0, exp: 100, gold: 42,
    cards: [{ cardId: 'card_elite_plant3_a', rate: CR_E }, { cardId: 'card_elite_plant3_b', rate: CR_E }, { cardId: 'card_elite_plant3_c', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 史萊姆王 Tier 5 (Slime1 精靈) ──────────────────────
  {
    id: 'boss_slime_green', name: '綠史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'grass', tint: 0x33ff33, tier: 5,
    hp: 750, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_green_a', rate: CR_B }, { cardId: 'card_boss_slime_green_b', rate: CR_B }, { cardId: 'card_boss_slime_green_c', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_red', name: '紅史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'fire', tint: 0xff1111, tier: 5,
    hp: 750, atk: 30, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_red_a', rate: CR_B }, { cardId: 'card_boss_slime_red_b', rate: CR_B }, { cardId: 'card_boss_slime_red_c', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_blue', name: '藍史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'water', tint: 0x1188ff, tier: 5,
    hp: 720, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_blue_a', rate: CR_B }, { cardId: 'card_boss_slime_blue_b', rate: CR_B }, { cardId: 'card_boss_slime_blue_c', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_white', name: '白史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'none', tint: 0xccddee, tier: 5,
    hp: 750, atk: 25, def: 24, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_boss_slime_white_a', rate: CR_B }, { cardId: 'card_boss_slime_white_b', rate: CR_B }, { cardId: 'card_boss_slime_white_c', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 殭屍史萊姆王 (Slime2 精靈) ─────────────────────────
  {
    id: 'boss_zombie_slime', name: '殭屍史萊姆王', spriteKey: 'slime2', frameEnd: 9,
    element: 'none', tint: 0x99dd44, tier: 5,
    hp: 825, atk: 28, def: 20, speed: 80, exp: 220, gold: 120,
    cards: [{ cardId: 'card_boss_zombie_slime_a', rate: CR_B }, { cardId: 'card_boss_zombie_slime_b', rate: CR_B }, { cardId: 'card_boss_zombie_slime_c', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 熔岩史萊姆王 (Slime3 精靈) ─────────────────────────
  {
    id: 'boss_lava_slime', name: '熔岩史萊姆王', spriteKey: 'slime3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 900, atk: 32, def: 30, speed: 80, exp: 250, gold: 150,
    cards: [{ cardId: 'card_boss_lava_slime_a', rate: CR_B }, { cardId: 'card_boss_lava_slime_b', rate: CR_B }, { cardId: 'card_boss_lava_slime_c', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 花Boss系列 ──────────────────────────────────────────
  {
    id: 'boss_flower_one', name: '食人花王', spriteKey: 'plant1', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 800, atk: 25, def: 15, speed: 0, exp: 200, gold: 110,
    cards: [{ cardId: 'card_boss_flower_one_a', rate: CR_B }, { cardId: 'card_boss_flower_one_b', rate: CR_B }, { cardId: 'card_boss_flower_one_c', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_two', name: '藤蔓花王', spriteKey: 'plant2', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 850, atk: 28, def: 15, speed: 0, exp: 210, gold: 115,
    cards: [{ cardId: 'card_boss_flower_two_a', rate: CR_B }, { cardId: 'card_boss_flower_two_b', rate: CR_B }, { cardId: 'card_boss_flower_two_c', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_three', name: '不死花王', spriteKey: 'plant3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 900, atk: 22, def: 8, speed: 0, exp: 220, gold: 120,
    cards: [{ cardId: 'card_boss_flower_three_a', rate: CR_B }, { cardId: 'card_boss_flower_three_b', rate: CR_B }, { cardId: 'card_boss_flower_three_c', rate: CR_B }],
    drops: bossDrops,
  },
];

// ── Card definitions ───────────────────────────────────────────────────────

export const CARD_DEFS: CardDef[] = [

  // ── 綠史萊姆小卡（生命主題）──
  { id: 'card_slime_green_s_a', name: '綠史萊姆卡片A', monsterId: 'slime_green_s', element: 'none', tint: 0x44cc44, effect: { hpPct: 0.05 }, desc: '最大HP+5%' },
  { id: 'card_slime_green_s_b', name: '綠史萊姆卡片B', monsterId: 'slime_green_s', element: 'none', tint: 0x44cc44, effect: { hpRegen: 0.5 }, desc: 'HP恢復+0.5' },
  { id: 'card_slime_green_s_c', name: '綠史萊姆卡片C', monsterId: 'slime_green_s', element: 'none', tint: 0x44cc44, effect: { maxHpPct: 0.03, hp: 10 }, desc: '最大HP+3% 最大HP+10' },

  // ── 紅史萊姆小卡（爆擊主題）──
  { id: 'card_slime_red_s_a', name: '紅史萊姆卡片A', monsterId: 'slime_red_s', element: 'none', tint: 0xff5522, effect: { atk: 5 }, desc: '攻擊力+5' },
  { id: 'card_slime_red_s_b', name: '紅史萊姆卡片B', monsterId: 'slime_red_s', element: 'none', tint: 0xff5522, effect: { crit: 0.03 }, desc: '爆擊機率+3%' },
  { id: 'card_slime_red_s_c', name: '紅史萊姆卡片C', monsterId: 'slime_red_s', element: 'none', tint: 0xff5522, effect: { critDmg: 0.08 }, desc: '爆擊傷害+8%' },

  // ── 藍史萊姆小卡（防禦主題）──
  { id: 'card_slime_blue_s_a', name: '藍史萊姆卡片A', monsterId: 'slime_blue_s', element: 'none', tint: 0x44aaff, effect: { defPct: 0.10 }, desc: '防禦力+10%' },
  { id: 'card_slime_blue_s_b', name: '藍史萊姆卡片B', monsterId: 'slime_blue_s', element: 'none', tint: 0x44aaff, effect: { evasion: 0.02 }, desc: '閃避率+2%' },
  { id: 'card_slime_blue_s_c', name: '藍史萊姆卡片C', monsterId: 'slime_blue_s', element: 'none', tint: 0x44aaff, effect: { def: 5 }, desc: '防禦力+5' },

  // ── 白史萊姆小卡（速度/效率）──
  { id: 'card_slime_white_s_a', name: '白史萊姆卡片A', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: { speed: 10 }, desc: '移動速度+10' },
  { id: 'card_slime_white_s_b', name: '白史萊姆卡片B', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: { atkSpeed: 0.06 }, desc: '攻擊速度+6%' },
  { id: 'card_slime_white_s_c', name: '白史萊姆卡片C', monsterId: 'slime_white_s', element: 'none', tint: 0xaaaaaa, effect: { speed: 4, atkPct: 0.01 }, desc: '移動速度+4 攻擊力+1%' },

  // ── 殭屍史萊姆小卡（毒/DoT）──
  { id: 'card_slime_zombie_s_a', name: '殭屍史萊姆卡片A', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: { dotBonus: 0.03 }, desc: '持續傷害+3%' },
  { id: 'card_slime_zombie_s_b', name: '殭屍史萊姆卡片B', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: { dotBonus: 0.01, atk: 3 }, desc: '持續傷害+1% 攻擊力+3' },
  { id: 'card_slime_zombie_s_c', name: '殭屍史萊姆卡片C', monsterId: 'slime_zombie_s', element: 'none', tint: 0x88aa44, effect: { lifesteal: 0.002 }, desc: '吸血+0.2%' },

  // ── 熔岩史萊姆小卡（穿甲/燃燒）──
  { id: 'card_slime_lava_s_a', name: '熔岩史萊姆卡片A', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: { penetration: 18 }, desc: '穿甲+18' },
  { id: 'card_slime_lava_s_b', name: '熔岩史萊姆卡片B', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: { penetration: 8, atk: 3 }, desc: '穿甲+8 攻擊力+3' },
  { id: 'card_slime_lava_s_c', name: '熔岩史萊姆卡片C', monsterId: 'slime_lava_s', element: 'none', tint: 0xff6622, effect: { dotBonus: 0.02, speed: 2 }, desc: '持續傷害+2% 移動速度+2' },

  // ── 食人花卡（狩獵/特攻）──
  { id: 'card_plant1_s_a', name: '食人花卡片A', monsterId: 'plant1_s', element: 'grass', tint: 0xffffff, effect: { dmgVsPlant: 0.12 }, desc: '對花草種族傷害+12%' },
  { id: 'card_plant1_s_b', name: '食人花卡片B', monsterId: 'plant1_s', element: 'grass', tint: 0xffffff, effect: { dmgVsEliteOrBoss: 0.08 }, desc: '對菁英/Boss傷害+8%' },
  { id: 'card_plant1_s_c', name: '食人花卡片C', monsterId: 'plant1_s', element: 'grass', tint: 0xffffff, effect: { atkPct: 0.03 }, desc: '攻擊力+3%' },

  // ── 藤蔓花卡（機動/牽制）──
  { id: 'card_plant2_s_a', name: '藤蔓花卡片A', monsterId: 'plant2_s', element: 'water', tint: 0xffffff, effect: { speed: 5, def: 3 }, desc: '移動速度+5 防禦力+3' },
  { id: 'card_plant2_s_b', name: '藤蔓花卡片B', monsterId: 'plant2_s', element: 'water', tint: 0xffffff, effect: { evasion: 0.01, speed: 1, def: 2 }, desc: '閃避率+1% 移動速度+1 防禦力+2' },
  { id: 'card_plant2_s_c', name: '藤蔓花卡片C', monsterId: 'plant2_s', element: 'water', tint: 0xffffff, effect: { evasion: 0.01, atk: 2 }, desc: '閃避率+1% 攻擊力+2' },

  // ── 不死花卡（韌性/復原）──
  { id: 'card_plant3_s_a', name: '不死花卡片A', monsterId: 'plant3_s', element: 'fire',  tint: 0xffffff, effect: { hp: 25 }, desc: '最大HP+25' },
  { id: 'card_plant3_s_b', name: '不死花卡片B', monsterId: 'plant3_s', element: 'fire',  tint: 0xffffff, effect: { hpRegen: 0.2, speed: 2 }, desc: 'HP恢復+0.2 移動速度+2' },
  { id: 'card_plant3_s_c', name: '不死花卡片C', monsterId: 'plant3_s', element: 'fire',  tint: 0xffffff, effect: { crit: 0.02, critDmg: 0.03 }, desc: '爆擊機率+2% 爆擊傷害+3%' },

  // ── 菁英史萊姆卡 A/B/C ──
  { id: 'card_elite_slime_green_a', name: '綠史萊姆菁英卡片A', monsterId: 'elite_slime_green', element: 'none', tint: 0x00ff88, effect: { orbitIceBalls: 2 }, desc: '召喚2顆冰球 (傷害ATKx25%、緩速20%)' },
  { id: 'card_elite_slime_green_b', name: '綠史萊姆菁英卡片B', monsterId: 'elite_slime_green', element: 'none', tint: 0x00ff88, effect: { atk: 8 }, desc: '攻擊力+8' },
  { id: 'card_elite_slime_green_c', name: '綠史萊姆菁英卡片C', monsterId: 'elite_slime_green', element: 'none', tint: 0x00ff88, effect: { dmgVsAnyElement: 0.05 }, desc: '對火/水/草屬性傷害+5%' },

  { id: 'card_elite_slime_red_a', name: '紅史萊姆菁英卡片A', monsterId: 'elite_slime_red', element: 'none', tint: 0xff6600, effect: { divineShieldChance: 0.20 }, desc: '攻擊時20%機率觸發神盾護體 (DEF+20持續1.75秒) (兩張增加機率)' },
  { id: 'card_elite_slime_red_b', name: '紅史萊姆菁英卡片B', monsterId: 'elite_slime_red', element: 'none', tint: 0xff6600, effect: { dmgVsGrass: 0.08 }, desc: '對草屬性傷害+8%' },
  { id: 'card_elite_slime_red_c', name: '紅史萊姆菁英卡片C', monsterId: 'elite_slime_red', element: 'none', tint: 0xff6600, effect: { lifesteal: 0.003 }, desc: '吸血+0.3%' },

  { id: 'card_elite_slime_blue_a', name: '藍史萊姆菁英卡片A', monsterId: 'elite_slime_blue', element: 'none', tint: 0x00ddff, effect: { lightningStrike: 1 }, desc: '每2秒對範圍內隨機敵人施放落雷 (ATK×50%) (兩張同時打2個目標)' },
  { id: 'card_elite_slime_blue_b', name: '藍史萊姆菁英卡片B', monsterId: 'elite_slime_blue', element: 'none', tint: 0x00ddff, effect: { speed: 18 }, desc: '移動速度+18' },
  { id: 'card_elite_slime_blue_c', name: '藍史萊姆菁英卡片C', monsterId: 'elite_slime_blue', element: 'none', tint: 0x00ddff, effect: { hp: 30, weaponEnhance8Hp: 30 }, desc: '最大HP+30 武器≥+8時最大HP再+30' },

  { id: 'card_elite_slime_white_a', name: '白史萊姆菁英卡片A', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: { periodicKnives: 1 }, desc: '每4秒散射飛刀(ATK×40%) (兩張飛刀數量增加)' },
  { id: 'card_elite_slime_white_b', name: '白史萊姆菁英卡片B', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: { penetration: 30 }, desc: '穿甲+30' },
  { id: 'card_elite_slime_white_c', name: '白史萊姆菁英卡片C', monsterId: 'elite_slime_white', element: 'none', tint: 0xaaccdd, effect: { dmgVsEliteOrBoss: 0.10 }, desc: '對菁英/Boss傷害+10%' },

  { id: 'card_elite_slime_zombie_a', name: '殭屍史萊姆菁英卡片A', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: { orbitFireBalls: 2 }, desc: '召喚2顆火球 (傷害ATK×30%)' },
  { id: 'card_elite_slime_zombie_b', name: '殭屍史萊姆菁英卡片B', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: { dotBonus: 0.045 }, desc: '燃燒傷害+4.5%' },
  { id: 'card_elite_slime_zombie_c', name: '殭屍史萊姆菁英卡片C', monsterId: 'elite_slime_zombie', element: 'none', tint: 0xccff44, effect: { dotBonus: 0.03, weaponEnhance8DotBonus: 0.03 }, desc: '燃燒傷害+3% 武器≥+8時燃燒傷害再+3%' },

  { id: 'card_elite_slime_lava_a', name: '熔岩史萊姆菁英卡片A', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: { overkillSplash: 1 }, desc: '傷害溢出時對範圍內造成溢出傷害 (兩張觸發連鎖)' },
  { id: 'card_elite_slime_lava_b', name: '熔岩史萊姆菁英卡片B', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: { dmgVsNone: 0.08 }, desc: '對無屬性傷害+8%' },
  { id: 'card_elite_slime_lava_c', name: '熔岩史萊姆菁英卡片C', monsterId: 'elite_slime_lava', element: 'none', tint: 0xff4400, effect: { lifesteal: 0.001, atk: 5 }, desc: '吸血+0.1% 攻擊力+5' },

  // ── 花怪菁英卡 A/B/C ──
  { id: 'card_elite_plant1_a', name: '菁英食人花卡片A', monsterId: 'elite_plant1', element: 'grass', tint: 0xff88cc, effect: { hpRegen: 2.5 }, desc: 'HP回復+2.5/秒' },
  { id: 'card_elite_plant1_b', name: '菁英食人花卡片B', monsterId: 'elite_plant1', element: 'grass', tint: 0xff88cc, effect: { hp: 40 }, desc: '最大HP+40' },
  { id: 'card_elite_plant1_c', name: '菁英食人花卡片C', monsterId: 'elite_plant1', element: 'grass', tint: 0xff88cc, effect: { dmgVsSlime: 0.15 }, desc: '對史萊姆種族傷害+15%' },

  { id: 'card_elite_plant2_a', name: '菁英藤蔓花卡片A', monsterId: 'elite_plant2', element: 'water', tint: 0x66ff88, effect: { summonFlowerChance: 0.10, summonFlowerCapPair: 1 }, desc: '攻擊有低機率召喚不死花 (ATKx45%、HPx100%、15秒) (兩張機率加倍、召喚物上限+1)' },
  { id: 'card_elite_plant2_b', name: '菁英藤蔓花卡片B', monsterId: 'elite_plant2', element: 'water', tint: 0x66ff88, effect: { evasion: 0.03, hp: 30 }, desc: '閃避率+3% 最大HP+30' },
  { id: 'card_elite_plant2_c', name: '菁英藤蔓花卡片C', monsterId: 'elite_plant2', element: 'water', tint: 0x66ff88, effect: { atk: 6, weaponEnhance8Atk: 6 }, desc: '攻擊力+6 武器≥+8時攻擊力再+6' },

  { id: 'card_elite_plant3_a', name: '菁英不死花卡片A', monsterId: 'elite_plant3', element: 'fire', tint: 0xffaa44, effect: { freeRevive: 1 }, desc: '可復活一次' },
  { id: 'card_elite_plant3_b', name: '菁英不死花卡片B', monsterId: 'elite_plant3', element: 'fire', tint: 0xffaa44, effect: { dmgVsWater: 0.08 }, desc: '對水屬性傷害+8%' },
  { id: 'card_elite_plant3_c', name: '菁英不死花卡片C', monsterId: 'elite_plant3', element: 'fire', tint: 0xffaa44, effect: { dmgVsFire: 0.08 }, desc: '對火屬性傷害+8%' },

  // ── 史萊姆王卡 A/B/C ──
  // 綠史萊姆王：防禦特化 / 條件HP / 條件ATK
  { id: 'card_boss_slime_green_a', name: '綠史萊姆王卡片A', monsterId: 'boss_slime_green', element: 'none', tint: 0x44cc44, effect: { lifesteal: 0.025 }, desc: '吸血+2.5%' },
  { id: 'card_boss_slime_green_b', name: '綠史萊姆王卡片B', monsterId: 'boss_slime_green', element: 'none', tint: 0x44cc44, effect: { hpPct: 0.15, condHpPct: 0.15 }, desc: 'HP+15% 最大HP≥800時HP再+15%' },
  { id: 'card_boss_slime_green_c', name: '綠史萊姆王卡片C', monsterId: 'boss_slime_green', element: 'none', tint: 0x44cc44, effect: { orbitBallDmgPct: 1.00 }, desc: '召喚火球/冰球傷害+100%' },

  // 紅史萊姆王：爆擊特化 / 條件爆傷 / 半月斬
  { id: 'card_boss_slime_red_a', name: '紅史萊姆王卡片A', monsterId: 'boss_slime_red', element: 'none', tint: 0xff5522, effect: { crit: 0.25 }, desc: '爆擊機率+25%' },
  { id: 'card_boss_slime_red_b', name: '紅史萊姆王卡片B', monsterId: 'boss_slime_red', element: 'none', tint: 0xff5522, effect: { critDmg: 0.20, condCritDmgBonus: 0.20 }, desc: '爆擊傷害+20% 爆擊率≥50%時爆擊傷害再+20%' },
  { id: 'card_boss_slime_red_c', name: '紅史萊姆王卡片C', monsterId: 'boss_slime_red', element: 'none', tint: 0xff5522, effect: { multiHitNoStagger: 1, multiHitDmgPct: 0.25 }, desc: '五連斬僵直移除 五連斬傷害+25%' },

  // 藍史萊姆王：瞬步斬 / 風刃 / 旋風斬
  { id: 'card_boss_slime_blue_a', name: '藍史萊姆王卡片A', monsterId: 'boss_slime_blue', element: 'none', tint: 0x44aaff, effect: { dashDistBonus: 45, dashDmgPct: 0.30 }, desc: '瞬步斬距離增加 瞬步斬傷害+30%' },
  { id: 'card_boss_slime_blue_b', name: '藍史萊姆王卡片B', monsterId: 'boss_slime_blue', element: 'none', tint: 0x44aaff, effect: { projectileDistBonus: 50, projectileDmgPct: 0.20 }, desc: '風刃距離增加 風刃傷害+20%' },
  { id: 'card_boss_slime_blue_c', name: '藍史萊姆王卡片C', monsterId: 'boss_slime_blue', element: 'none', tint: 0x44aaff, effect: { speed: 50, maxHpPct: -0.20 }, desc: '移動速度+50 最大HP-20%' },

  // 白史萊姆王：掉落率 / 迴旋飛刃 / 血環
  { id: 'card_boss_slime_white_a', name: '白史萊姆王卡片A', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: { dropRateMult: 1.5 }, desc: '掉落率增加50%' },
  { id: 'card_boss_slime_white_b', name: '白史萊姆王卡片B', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: { slash180DmgPct: 0.30 }, desc: '半月斬傷害+30%' },
  { id: 'card_boss_slime_white_c', name: '白史萊姆王卡片C', monsterId: 'boss_slime_white', element: 'none', tint: 0xaaaaaa, effect: { hp: 30, weaponRefineHp: 30 }, desc: 'HP+30 武器每精煉+2、HP再+30' },

  // 殭屍史萊姆王：玻璃砲 / 條件DoT / 燃燒上限
  { id: 'card_boss_zombie_slime_a', name: '殭屍史萊姆王卡片A', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: { allDmgPct: 0.50, takenDmgPct: 0.40 }, desc: '傷害+50% 受到傷害+40% (燃燒效果不包含)' },
  { id: 'card_boss_zombie_slime_b', name: '殭屍史萊姆王卡片B', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: { condDotStackBonus: 0.03 }, desc: '持續傷害達30%時 每層燃燒傷害+3%' },
  { id: 'card_boss_zombie_slime_c', name: '殭屍史萊姆王卡片C', monsterId: 'boss_zombie_slime', element: 'none', tint: 0x88aa44, effect: { burnMaxStackBonus: 5 }, desc: '燃燒上限+5層' },

  // 熔岩史萊姆王：Boss傷害 / 五連斬無僵直 / 蓄力暈眩
  { id: 'card_boss_lava_slime_a', name: '熔岩史萊姆王卡片A', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: { atk: 15, condPenAtk: 30 }, desc: '攻擊力+15 穿甲≥100時攻擊力再+30' },
  { id: 'card_boss_lava_slime_b', name: '熔岩史萊姆王卡片B', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: { onHitLightningChance: 0.50, lightningDmgBonus: 0.80 }, desc: '攻擊時50%機率對隨機敵人落雷 (ATKx50%) 落雷傷害+80%' },
  { id: 'card_boss_lava_slime_c', name: '熔岩史萊姆王卡片C', monsterId: 'boss_lava_slime', element: 'none', tint: 0xff6622, effect: { chargeSlamStunChance: 0.50, chargeSlamDmgPct: 0.25 }, desc: '蓄力重擊有50%機率造成暈眩2秒 蓄力重擊傷害+25%' },

  // 食人花王：彈幕特化
  { id: 'card_boss_flower_one_a', name: '食人花王卡片A', monsterId: 'boss_flower_one', element: 'none', tint: 0xff88cc, effect: { atk: 4, weaponRefineAtk: 4 }, desc: 'ATK+4 武器每精煉+2、ATK再+4' },
  { id: 'card_boss_flower_one_b', name: '食人花王卡片B', monsterId: 'boss_flower_one', element: 'none', tint: 0xff88cc, effect: { whirlwindRangePct: 0.30, whirlwindDmgPct: 0.30 }, desc: '旋風斬範圍+30% 旋風斬傷害+30%' },
  { id: 'card_boss_flower_one_c', name: '食人花王卡片C', monsterId: 'boss_flower_one', element: 'none', tint: 0xff88cc, effect: { boomerangRangePct: 0.30, boomerangDmgPct: 0.20 }, desc: '迴旋飛刃範圍+30% 迴旋飛刃傷害+20%' },

  // 藤蔓花王：陷阱特化
  { id: 'card_boss_flower_two_a', name: '藤蔓花王卡片A', monsterId: 'boss_flower_two', element: 'none', tint: 0x66ff88, effect: { flowerSummonMode: 1, summonFlowerCap: 1 }, desc: '攻擊模式改為召喚花攻擊 (ATK×45%、HP×100%) 召喚物上限+1' },
  { id: 'card_boss_flower_two_b', name: '藤蔓花王卡片B', monsterId: 'boss_flower_two', element: 'none', tint: 0x66ff88, effect: { auraRadiusPct: 0.40, auraDmgPct: 0.30 }, desc: '血環範圍+40% 血環傷害+30%' },
  { id: 'card_boss_flower_two_c', name: '藤蔓花王卡片C', monsterId: 'boss_flower_two', element: 'none', tint: 0x66ff88, effect: { dmgVsEliteOrBoss: 0.25 }, desc: '對Boss/菁英傷害+25%' },

  // 不死花王：召喚/生存特化
  { id: 'card_boss_flower_three_a', name: '不死花王卡片A', monsterId: 'boss_flower_three', element: 'none', tint: 0xffaa44, effect: { evasion: 0.40 }, desc: '閃避率+40%' },
  { id: 'card_boss_flower_three_b', name: '不死花王卡片B', monsterId: 'boss_flower_three', element: 'none', tint: 0xffaa44, effect: { infiniteDivineShield: 1 }, desc: '無限神盾護體(DEF+20)' },
  { id: 'card_boss_flower_three_c', name: '不死花王卡片C', monsterId: 'boss_flower_three', element: 'none', tint: 0xffaa44, effect: { lavaSlimeCompanion: 1 }, desc: '召喚岩漿史萊姆夥伴（HP×120%、ATK×70%、40px巡邏、100px追擊，死亡8秒後重生）' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}
