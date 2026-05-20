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

export type CardType = 'n' | 'e' | 'b';  // normal / elite / boss

export interface CardDef {
  id: string;
  name: string;
  monsterId: string;
  family: string;    // e.g. 'slime_green' — 同家族卡片共用
  race: string;      // e.g. 'slime' | 'flower'
  cardType: CardType;
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
export const ITEM_STONE_RECAST = 'stone_guard';    // 重鑄石（id 保持 stone_guard 避免存檔破壞）
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
const CR_S = 0.0017; // 小怪：每張卡 0.17% → 平均 2 局掉 1 張
const CR_E = 0.0024; // 菁英：每張卡 0.24% → 平均 10 局掉 1 張
const CR_B = 0.0075; // Boss：每張卡 0.75% → 平均 40 局掉 1 張

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
// 目標：+7 ≈ 10 趟、+10 ≈ 43 趟（含重鑄石全保護）
// 每趟估計：~60小怪、~8菁英、1Boss
// 破損石/趟 = 60×0.02×1 + 8×0.04×2.5 + 0.35×4.5 = 1.2+0.8+1.575 ≈ 3.58

const smallDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 0.03, qtyMin: 1, qtyMax: 1 },
];

const eliteDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 0.10, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 0.02, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_RECAST, itemName: '重鑄石', rate: 0.02, qtyMin: 1, qtyMax: 1 },
];

const bossDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: '破損強化石', rate: 1.00, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: '完整強化石', rate: 0.30, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_RECAST, itemName: '重鑄石', rate: 0.10, qtyMin: 1, qtyMax: 1 },
];

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  {
    id: 'slime_green_s', name: '綠史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44ff44, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_green_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_red_s', name: '紅史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 1,
    hp: 65, atk: 10, speed: 85, exp: 18, gold: 6,
    cards: [{ cardId: 'card_slime_red_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_blue_s', name: '藍史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2299ff, tier: 1,
    hp: 55, atk: 8, speed: 100, exp: 15, gold: 5,
    cards: [{ cardId: 'card_slime_blue_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_white_s', name: '白史萊姆', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xccddee, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 12, gold: 4,
    cards: [{ cardId: 'card_slime_white_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 殭屍史萊姆小 / 熔岩史萊姆小 ───────────────────
  {
    id: 'slime_zombie_s', name: '殭屍史萊姆', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0x99dd44, tier: 1,
    hp: 80, atk: 10, speed: 70, exp: 20, gold: 7,
    cards: [{ cardId: 'card_slime_zombie_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_lava_s', name: '熔岩史萊姆', spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 1,
    hp: 70, atk: 12, speed: 100, exp: 22, gold: 8,
    cards: [{ cardId: 'card_slime_lava_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 菁英史萊姆 Tier 3 ──────────────────────────────────
  {
    id: 'elite_slime_green', name: '綠史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44dd44, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 60, gold: 25,
    cards: [{ cardId: 'card_slime_green_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_red', name: '紅史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 3,
    hp: 65, atk: 10, speed: 90, exp: 65, gold: 28,
    cards: [{ cardId: 'card_slime_red_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_blue', name: '藍史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2288ee, tier: 3,
    hp: 55, atk: 8, speed: 110, exp: 60, gold: 25,
    cards: [{ cardId: 'card_slime_blue_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_white', name: '白史萊姆菁英', spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xeeffff, tier: 3,
    hp: 60, atk: 8, speed: 95, exp: 55, gold: 22,
    cards: [{ cardId: 'card_slime_white_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_zombie', name: '殭屍史萊姆菁英', spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xccff44, tier: 3,
    hp: 80, atk: 10, speed: 78, exp: 75, gold: 32,
    cards: [{ cardId: 'card_slime_zombie_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_lava', name: '熔岩史萊姆菁英', spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 3,
    hp: 70, atk: 12, speed: 110, exp: 80, gold: 36,
    cards: [{ cardId: 'card_slime_lava_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 花怪小怪 Tier 2 (minStar=2) ────────────────────────
  {
    id: 'plant1_s', name: '食人花', spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 63, atk: 7, speed: 0, exp: 28, gold: 10,
    cards: [{ cardId: 'card_plant1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant2_s', name: '藤蔓花', spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 65, atk: 9, speed: 0, exp: 30, gold: 11,
    cards: [{ cardId: 'card_plant2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant3_s', name: '不死花', spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 67, atk: 10, speed: 0, exp: 32, gold: 12,
    cards: [{ cardId: 'card_plant3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 花怪菁英 Tier 3 (minStar=2) ─────────────────────────
  {
    id: 'elite_plant1', name: '菁英食人花', spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 63, atk: 7, speed: 0, exp: 90, gold: 38,
    cards: [{ cardId: 'card_plant1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant2', name: '菁英藤蔓花', spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 65, atk: 9, speed: 0, exp: 95, gold: 40,
    cards: [{ cardId: 'card_plant2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant3', name: '菁英不死花', spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 67, atk: 10, speed: 0, exp: 100, gold: 42,
    cards: [{ cardId: 'card_plant3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 獸人小怪 Tier 1 (minStar=3) ───────────────────────
  {
    id: 'orc1_s', name: '獸人', spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 130, atk: 20, speed: 80, exp: 35, gold: 12,
    cards: [{ cardId: 'card_orc1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'orc2_s', name: '獸人戰士', spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 150, atk: 17, speed: 85, exp: 38, gold: 13,
    cards: [{ cardId: 'card_orc2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'orc3_s', name: '獸人武士', spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 110, atk: 22, speed: 90, exp: 40, gold: 14,
    cards: [{ cardId: 'card_orc3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 獸人菁英 Tier 3 (minStar=3) ────────────────────────
  {
    id: 'elite_orc1', name: '菁英獸人', spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 130, atk: 20, speed: 85, exp: 110, gold: 45,
    cards: [{ cardId: 'card_orc1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_orc2', name: '菁英獸人戰士', spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 150, atk: 17, speed: 90, exp: 115, gold: 48,
    cards: [{ cardId: 'card_orc2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_orc3', name: '菁英獸人武士', spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 120, atk: 25, speed: 95, exp: 120, gold: 50,
    cards: [{ cardId: 'card_orc3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 史萊姆王 Tier 5 ────────────────────────────────────
  {
    id: 'boss_slime_green', name: '綠史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'grass', tint: 0x33ff33, tier: 5,
    hp: 750, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_slime_green_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_red', name: '紅史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'fire', tint: 0xff1111, tier: 5,
    hp: 750, atk: 30, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_slime_red_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_blue', name: '藍史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'water', tint: 0x1188ff, tier: 5,
    hp: 720, atk: 25, def: 18, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_slime_blue_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_white', name: '白史萊姆王', spriteKey: 'slime', frameEnd: 9,
    element: 'none', tint: 0xccddee, tier: 5,
    hp: 750, atk: 25, def: 24, speed: 80, exp: 200, gold: 100,
    cards: [{ cardId: 'card_slime_white_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_zombie_slime', name: '殭屍史萊姆王', spriteKey: 'slime2', frameEnd: 9,
    element: 'none', tint: 0x99dd44, tier: 5,
    hp: 825, atk: 28, def: 20, speed: 80, exp: 220, gold: 120,
    cards: [{ cardId: 'card_slime_zombie_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_lava_slime', name: '熔岩史萊姆王', spriteKey: 'slime3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 900, atk: 32, def: 30, speed: 80, exp: 250, gold: 150,
    cards: [{ cardId: 'card_slime_lava_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 獸人Boss系列 ────────────────────────────────────────
  {
    id: 'boss_orc1', name: '獸人族長', spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 900, atk: 27, def: 18, speed: 95, exp: 280, gold: 160,
    cards: [{ cardId: 'card_orc1_b', rate: CR_B }],
    drops: bossDrops,
  },

  {
    id: 'boss_orc2', name: '獸人戰士長', spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 990, atk: 25, def: 19, speed: 85, exp: 295, gold: 175,
    cards: [{ cardId: 'card_orc2_b', rate: CR_B }],
    drops: bossDrops,
  },

  {
    id: 'boss_orc3', name: '獸人武士長', spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 880, atk: 30, def: 15, speed: 105, exp: 300, gold: 180,
    cards: [{ cardId: 'card_orc3_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 吸血鬼小怪 Tier 1 (minStar=4) ──────────────────────
  {
    id: 'vampire1_s', name: '吸血鬼', spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 110, atk: 18, def: 5, speed: 85, exp: 40, gold: 15,
    cards: [{ cardId: 'card_vampire1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'vampire2_s', name: '吸血鬼法師', spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 127, atk: 15, def: 6, speed: 90, exp: 42, gold: 16,
    cards: [{ cardId: 'card_vampire2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'vampire3_s', name: '吸血鬼術士', spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 93, atk: 20, def: 5, speed: 95, exp: 45, gold: 17,
    cards: [{ cardId: 'card_vampire3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 吸血鬼菁英 Tier 3 (minStar=4) ───────────────────────
  {
    id: 'elite_vampire1', name: '菁英吸血鬼', spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 110, atk: 18, def: 8, speed: 88, exp: 125, gold: 55,
    cards: [{ cardId: 'card_vampire1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_vampire2', name: '菁英吸血鬼法師', spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 127, atk: 15, def: 9, speed: 93, exp: 130, gold: 58,
    cards: [{ cardId: 'card_vampire2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_vampire3', name: '菁英吸血鬼術士', spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 102, atk: 22, def: 8, speed: 98, exp: 135, gold: 60,
    cards: [{ cardId: 'card_vampire3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 吸血鬼Boss系列 (minStar=4) ──────────────────────────
  {
    id: 'boss_vampire1', name: '吸血鬼伯爵', spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 765, atk: 25, def: 25, speed: 100, exp: 320, gold: 200,
    cards: [{ cardId: 'card_vampire1_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_vampire2', name: '血族法王', spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 841, atk: 22, def: 27, speed: 92, exp: 335, gold: 210,
    cards: [{ cardId: 'card_vampire2_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_vampire3', name: '血族魔王', spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 748, atk: 28, def: 21, speed: 108, exp: 350, gold: 220,
    cards: [{ cardId: 'card_vampire3_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 花Boss系列 ──────────────────────────────────────────
  {
    id: 'boss_flower_one', name: '食人花王', spriteKey: 'plant1', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 800, atk: 28, def: 14, speed: 0, exp: 200, gold: 110,
    cards: [{ cardId: 'card_plant1_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_two', name: '藤蔓花王', spriteKey: 'plant2', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 850, atk: 31, def: 14, speed: 0, exp: 210, gold: 115,
    cards: [{ cardId: 'card_plant2_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_three', name: '不死花王', spriteKey: 'plant3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 900, atk: 24, def: 7, speed: 0, exp: 220, gold: 120,
    cards: [{ cardId: 'card_plant3_b', rate: CR_B }],
    drops: bossDrops,
  },
];

// ── Card definitions ───────────────────────────────────────────────────────
// 每種怪物只掉一種卡，共 9 家族 × 3 階 = 27 張
// 命名規則: card_<family>_<n|e|b>

export const CARD_DEFS: CardDef[] = [

  // ════════════════════════════════════════════════════
  // 史萊姆族（6 家族）
  // ════════════════════════════════════════════════════

  // ── 綠史萊姆家族（生命主題）──
  { id: 'card_slime_green_n', name: '綠史萊姆卡', monsterId: 'slime_green_s',
    family: 'slime_green', race: 'slime', cardType: 'n',
    element: 'grass', tint: 0x44ff44,
    effect: { hp: 30 },
    desc: '最大HP+30' },
  { id: 'card_slime_green_e', name: '綠史萊姆菁英卡', monsterId: 'elite_slime_green',
    family: 'slime_green', race: 'slime', cardType: 'e',
    element: 'grass', tint: 0x00ff88,
    effect: { hp: 50, hpRegen: 0.6 },
    desc: '最大HP+50  回血速+0.6/s' },
  { id: 'card_slime_green_b', name: '綠史萊姆王卡', monsterId: 'boss_slime_green',
    family: 'slime_green', race: 'slime', cardType: 'b',
    element: 'grass', tint: 0x33ff33,
    effect: { hpPct: 0.10, hpRegen: 0.8 },
    desc: '最大HP+10%  回血速+0.8/s' },

  // ── 紅史萊姆家族（爆擊主題）──
  { id: 'card_slime_red_n', name: '紅史萊姆卡', monsterId: 'slime_red_s',
    family: 'slime_red', race: 'slime', cardType: 'n',
    element: 'fire', tint: 0xff5522,
    effect: { crit: 0.05 },
    desc: '爆擊率+5%' },
  { id: 'card_slime_red_e', name: '紅史萊姆菁英卡', monsterId: 'elite_slime_red',
    family: 'slime_red', race: 'slime', cardType: 'e',
    element: 'fire', tint: 0xff6600,
    effect: { crit: 0.06, critDmg: 0.12 },
    desc: '爆擊率+6%  爆擊傷害+12%' },
  { id: 'card_slime_red_b', name: '紅史萊姆王卡', monsterId: 'boss_slime_red',
    family: 'slime_red', race: 'slime', cardType: 'b',
    element: 'fire', tint: 0xff1111,
    effect: { critDmg: 0.20 },
    desc: '爆擊傷害+20%' },

  // ── 藍史萊姆家族（防禦主題）──
  { id: 'card_slime_blue_n', name: '藍史萊姆卡', monsterId: 'slime_blue_s',
    family: 'slime_blue', race: 'slime', cardType: 'n',
    element: 'water', tint: 0x2299ff,
    effect: { def: 8 },
    desc: '防禦力+8' },
  { id: 'card_slime_blue_e', name: '藍史萊姆菁英卡', monsterId: 'elite_slime_blue',
    family: 'slime_blue', race: 'slime', cardType: 'e',
    element: 'water', tint: 0x00ddff,
    effect: { def: 12, takenDmgPct: -0.05 },
    desc: '防禦力+12  受到傷害-5%' },
  { id: 'card_slime_blue_b', name: '藍史萊姆王卡', monsterId: 'boss_slime_blue',
    family: 'slime_blue', race: 'slime', cardType: 'b',
    element: 'water', tint: 0x1188ff,
    effect: { divineShieldChance: 0.10, executeBelow15: 1 },
    desc: '受擊10%機率觸發護盾2秒  敵人HP<12%直接斬殺' },

  // ── 白史萊姆家族（速度主題）──
  { id: 'card_slime_white_n', name: '白史萊姆卡', monsterId: 'slime_white_s',
    family: 'slime_white', race: 'slime', cardType: 'n',
    element: 'none', tint: 0xaaaaaa,
    effect: { atkSpeed: 0.07 },
    desc: '攻擊速度+7%' },
  { id: 'card_slime_white_e', name: '白史萊姆菁英卡', monsterId: 'elite_slime_white',
    family: 'slime_white', race: 'slime', cardType: 'e',
    element: 'none', tint: 0xaaccdd,
    effect: { atkSpeed: 0.10, speed: 12 },
    desc: '攻擊速度+10%  移動速度+12' },
  { id: 'card_slime_white_b', name: '白史萊姆王卡', monsterId: 'boss_slime_white',
    family: 'slime_white', race: 'slime', cardType: 'b',
    element: 'none', tint: 0xccddee,
    effect: { atkSpeed: 0.08, speed: 18 },
    desc: '攻擊速度+8%  移動速度+18' },

  // ── 殭屍史萊姆家族（燃燒主題）──
  { id: 'card_slime_zombie_n', name: '殭屍史萊姆卡', monsterId: 'slime_zombie_s',
    family: 'slime_zombie', race: 'slime', cardType: 'n',
    element: 'none', tint: 0x88aa44,
    effect: { dotBonus: 0.07 },
    desc: '燃燒傷害+7%' },
  { id: 'card_slime_zombie_e', name: '殭屍史萊姆菁英卡', monsterId: 'elite_slime_zombie',
    family: 'slime_zombie', race: 'slime', cardType: 'e',
    element: 'none', tint: 0xccff44,
    effect: { dotBonus: 0.10, burnMaxStackBonus: 2 },
    desc: '燃燒傷害+10%  燃燒堆疊上限+2' },
  { id: 'card_slime_zombie_b', name: '殭屍史萊姆王卡', monsterId: 'boss_zombie_slime',
    family: 'slime_zombie', race: 'slime', cardType: 'b',
    element: 'none', tint: 0x99dd44,
    effect: { dotBonus: 0.08, allDmgPct: 0.08, burnedEnemyDmgAmp: 0.15 },
    desc: '燃燒傷害+8%  全傷害+8%  對燃燒中敵人傷+15%' },

  // ── 熔岩史萊姆家族（穿透主題）──
  { id: 'card_slime_lava_n', name: '熔岩史萊姆卡', monsterId: 'slime_lava_s',
    family: 'slime_lava', race: 'slime', cardType: 'n',
    element: 'fire', tint: 0xff6622,
    effect: { penetration: 20 },
    desc: '穿透力+20' },
  { id: 'card_slime_lava_e', name: '熔岩史萊姆菁英卡', monsterId: 'elite_slime_lava',
    family: 'slime_lava', race: 'slime', cardType: 'e',
    element: 'fire', tint: 0xff4400,
    effect: { penetration: 28, dotBonus: 0.04 },
    desc: '穿透力+28  燃燒傷害+4%' },
  { id: 'card_slime_lava_b', name: '熔岩史萊姆王卡', monsterId: 'boss_lava_slime',
    family: 'slime_lava', race: 'slime', cardType: 'b',
    element: 'fire', tint: 0xffffff,
    effect: { penetration: 22, atk: 12 },
    desc: '穿透力+22  攻擊力+12' },

  // ════════════════════════════════════════════════════
  // 花怪族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 食人花家族（強攻主題）──
  { id: 'card_plant1_n', name: '食人花卡', monsterId: 'plant1_s',
    family: 'plant1', race: 'flower', cardType: 'n',
    element: 'grass', tint: 0xff88cc,
    effect: { atk: 8 },
    desc: '攻擊力+8' },
  { id: 'card_plant1_e', name: '菁英食人花卡', monsterId: 'elite_plant1',
    family: 'plant1', race: 'flower', cardType: 'e',
    element: 'grass', tint: 0xff66aa,
    effect: { atk: 12, dmgVsEliteOrBoss: 0.10 },
    desc: '攻擊力+12  對菁英/Boss傷害+10%' },
  { id: 'card_plant1_b', name: '食人花王卡', monsterId: 'boss_flower_one',
    family: 'plant1', race: 'flower', cardType: 'b',
    element: 'grass', tint: 0xff4488,
    effect: { dmgVsEliteOrBoss: 0.18 },
    desc: '對菁英/Boss傷害+18%' },

  // ── 藤蔓花家族（迴避主題）──
  { id: 'card_plant2_n', name: '藤蔓花卡', monsterId: 'plant2_s',
    family: 'plant2', race: 'flower', cardType: 'n',
    element: 'water', tint: 0x66ff88,
    effect: { evasion: 0.04 },
    desc: '迴避率+4%' },
  { id: 'card_plant2_e', name: '菁英藤蔓花卡', monsterId: 'elite_plant2',
    family: 'plant2', race: 'flower', cardType: 'e',
    element: 'water', tint: 0x44ee66,
    effect: { evasion: 0.05, hp: 35 },
    desc: '迴避率+5%  最大HP+35' },
  { id: 'card_plant2_b', name: '藤蔓花王卡', monsterId: 'boss_flower_two',
    family: 'plant2', race: 'flower', cardType: 'b',
    element: 'water', tint: 0x22cc44,
    effect: { evasion: 0.06, atk: 8, condLowHpAtk: 15 },
    desc: '迴避率+6%  攻擊力+8  血量<40%時攻擊額外+15' },

  // ── 不死花家族（召喚主題）──
  { id: 'card_plant3_n', name: '不死花卡', monsterId: 'plant3_s',
    family: 'plant3', race: 'flower', cardType: 'n',
    element: 'fire', tint: 0xffaa44,
    effect: { summonFlowerDmgPct: 0.10 },
    desc: '召喚物傷害+10%' },
  { id: 'card_plant3_e', name: '菁英不死花卡', monsterId: 'elite_plant3',
    family: 'plant3', race: 'flower', cardType: 'e',
    element: 'fire', tint: 0xff8822,
    effect: { summonFlowerDmgPct: 0.15, skillFlowerHpPct: 0.25 },
    desc: '召喚物傷害+15%  召喚物血量+25%' },
  { id: 'card_plant3_b', name: '不死花王卡', monsterId: 'boss_flower_three',
    family: 'plant3', race: 'flower', cardType: 'b',
    element: 'fire', tint: 0xff6600,
    effect: { summonFlowerDmgPct: 0.30, summonFlowerCap: 1 },
    desc: '召喚物傷+30%  友軍花怪上限+1' },

  // ════════════════════════════════════════════════════
  // 獸人族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 獸人 菁英獸人 獸人族長（蠻力法則：暴擊→攻擊轉換）──
  { id: 'card_orc1_n', name: '獸人卡', monsterId: 'orc1_s',
    family: 'orc1', race: 'orc', cardType: 'n',
    element: 'none', tint: 0xcc8833,
    effect: { atk: 12, critToAtk: 0.6 },
    desc: '攻擊力+12  每1%暴擊率→+0.6攻擊（暴擊判定關閉）' },
  { id: 'card_orc1_e', name: '菁英獸人卡', monsterId: 'elite_orc1',
    family: 'orc1', race: 'orc', cardType: 'e',
    element: 'none', tint: 0xdd9944,
    effect: { atk: 16, critToAtk: 1.0 },
    desc: '攻擊力+16  每1%暴擊率→+1.0攻擊（暴擊判定關閉）' },
  { id: 'card_orc1_b', name: '獸人族長卡', monsterId: 'boss_orc1',
    family: 'orc1', race: 'orc', cardType: 'b',
    element: 'none', tint: 0xffaa22,
    effect: { atk: 20, critToAtk: 1.4, allDmgPct: 0.08 },
    desc: '攻擊力+20  每1%暴擊率→+1.4攻擊  全傷害+8%（暴擊判定關閉）' },

  // ── 獸人戰士家族（業火盾：受擊觸發ATK爆衝）──
  { id: 'card_orc2_n', name: '獸人戰士卡', monsterId: 'orc2_s',
    family: 'orc2', race: 'orc', cardType: 'n',
    element: 'none', tint: 0x997744,
    effect: { blazingShieldChance: 0.15, blazingShieldAtkPct: 0.40, blazingShieldMs: 1500 },
    desc: '受擊15%觸發業火盾：ATK+40%持續1.5秒' },
  { id: 'card_orc2_e', name: '菁英獸人戰士卡', monsterId: 'elite_orc2',
    family: 'orc2', race: 'orc', cardType: 'e',
    element: 'none', tint: 0xaa8855,
    effect: { blazingShieldChance: 0.20, blazingShieldAtkPct: 0.55, blazingShieldMs: 1500, hp: 40 },
    desc: '受擊20%觸發業火盾：ATK+55%持續1.5秒  最大HP+40' },
  { id: 'card_orc2_b', name: '獸人戰士長卡', monsterId: 'boss_orc2',
    family: 'orc2', race: 'orc', cardType: 'b',
    element: 'none', tint: 0xcc9933,
    effect: { blazingShieldChance: 0.25, blazingShieldAtkPct: 0.70, blazingShieldMs: 2000, blazingShieldHealPct: 0.05 },
    desc: '受擊25%觸發業火盾：ATK+70%持續2秒  觸發時回復5%HP' },

  // ── 獸人武士家族（蓄勁一閃：每N刀蓄力爆發）──
  { id: 'card_orc3_n', name: '獸人武士卡', monsterId: 'orc3_s',
    family: 'orc3', race: 'orc', cardType: 'n',
    element: 'none', tint: 0x6688aa,
    effect: { impaleCharge: 5, impaleDmgPct: 0.70 },
    desc: '每5次攻擊蓄勁，第6刀+70%傷害' },
  { id: 'card_orc3_e', name: '菁英獸人武士卡', monsterId: 'elite_orc3',
    family: 'orc3', race: 'orc', cardType: 'e',
    element: 'none', tint: 0x7799bb,
    effect: { impaleCharge: 4, impaleDmgPct: 0.90, atkSpeed: 0.08 },
    desc: '每4次攻擊蓄勁，第5刀+90%傷害  攻擊速度+8%' },
  { id: 'card_orc3_b', name: '獸人武士長卡', monsterId: 'boss_orc3',
    family: 'orc3', race: 'orc', cardType: 'b',
    element: 'none', tint: 0x99bbdd,
    effect: { impaleCharge: 3, impaleDmgPct: 1.00 },
    desc: '每3次攻擊蓄勁，第4刀+100%傷害' },

  // ════════════════════════════════════════════════════
  // 吸血鬼族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 吸血鬼家族（生命汲取）──
  { id: 'card_vampire1_n', name: '吸血鬼卡', monsterId: 'vampire1_s',
    family: 'vampire1', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0xcc44ff,
    effect: { lifesteal: 0.015 },
    desc: '生命竊取+1.5%' },
  { id: 'card_vampire1_e', name: '菁英吸血鬼卡', monsterId: 'elite_vampire1',
    family: 'vampire1', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xdd66ff,
    effect: { lifesteal: 0.025, hp: 30 },
    desc: '生命竊取+2.5%  最大HP+30' },
  { id: 'card_vampire1_b', name: '吸血鬼伯爵卡', monsterId: 'boss_vampire1',
    family: 'vampire1', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xee88ff,
    effect: { lifesteal: 0.04, hp: 60 },
    desc: '生命竊取+4%  最大HP+60' },

  // ── 吸血鬼法師家族（韌性防禦）──
  { id: 'card_vampire2_n', name: '吸血鬼法師卡', monsterId: 'vampire2_s',
    family: 'vampire2', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0xff4466,
    effect: { def: 8 },
    desc: '防禦力+8' },
  { id: 'card_vampire2_e', name: '菁英吸血鬼法師卡', monsterId: 'elite_vampire2',
    family: 'vampire2', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xff6688,
    effect: { def: 14, hp: 25 },
    desc: '防禦力+14  最大HP+25' },
  { id: 'card_vampire2_b', name: '血族法王卡', monsterId: 'boss_vampire2',
    family: 'vampire2', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xff88aa,
    effect: { def: 20, evasion: 0.06 },
    desc: '防禦力+20  閃避+6%' },

  // ── 吸血鬼術士家族（暴擊爆發）──
  { id: 'card_vampire3_n', name: '吸血鬼術士卡', monsterId: 'vampire3_s',
    family: 'vampire3', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0x8866dd,
    effect: { crit: 0.06 },
    desc: '暴擊率+6%' },
  { id: 'card_vampire3_e', name: '菁英吸血鬼術士卡', monsterId: 'elite_vampire3',
    family: 'vampire3', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xaa88ff,
    effect: { crit: 0.10, critDmg: 0.15 },
    desc: '暴擊率+10%  暴擊傷害+15%' },
  { id: 'card_vampire3_b', name: '血族魔王卡', monsterId: 'boss_vampire3',
    family: 'vampire3', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xccaaff,
    effect: { crit: 0.14, critDmg: 0.25, atk: 10 },
    desc: '暴擊率+14%  暴擊傷害+25%  攻擊力+10' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}

/** 根據卡片在同 monsterId 群組中的排序位置，返回正確 A/B/C 結尾的顯示名稱 */
export function getCardDisplayName(cardId: string): string {
  const def = CARD_DEFS.find(c => c.id === cardId);
  if (!def) return '';
  const group = CARD_DEFS.filter(c => c.monsterId === def.monsterId);
  const idx = group.findIndex(c => c.id === cardId);
  if (idx < 0) return def.name;
  return def.name.replace(/[A-Z]$/, String.fromCharCode(65 + idx));
}
