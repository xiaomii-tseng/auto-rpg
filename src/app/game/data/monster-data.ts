const DPR = (window as any).__gameDpr as number;
import { Element, StatBonus } from './equipment-data';
import { t } from '../i18n/i18n';

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

export type CardType = 'n' | 'e' | 'b' | 'l';  // normal / elite / boss / legendary

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
export const ITEM_STONE_BREAKTHROUGH = 'stone_breakthrough'; // 突破石（+10→+20）
export const ITEM_QUEST_REROLL = 'quest_reroll';   // 任務重製石
export const ITEM_POTION_HEALTH_S = 'potion_health_s'; // 小型回復藥水 HP+100
export const ITEM_POTION_HEALTH_M = 'potion_health_m'; // 中型回復藥水 HP+200
export const ITEM_POTION_HEALTH_L = 'potion_health_l'; // 大型回復藥水 HP+300
export const ITEM_POTION_REVIVE = 'potion_revive';   // 復活藥水
export const ITEM_POTION_ATK   = 'potion_atk';      // 攻擊力藥水 ATK+20% 30秒
export const ITEM_POTION_DEF   = 'potion_def';      // 防禦力藥水 DEF+20 30秒
export const ITEM_POTION_SPEED = 'potion_speed';    // 速度藥水 Speed+20 30秒

// ── Map tickets (drop from 5-star boss, unlock 6-star challenge) ────────────
export const ITEM_TICKET_SLIME   = 'ticket_slime';   // 史萊姆黏液
export const ITEM_TICKET_FLOWER  = 'ticket_flower';  // 植物精隨
export const ITEM_TICKET_ORC     = 'ticket_orc';     // 獸人王冠
export const ITEM_TICKET_VAMPIRE = 'ticket_vampire'; // 邀請函

export const BOSS_TICKET_MAP: Record<string, { itemId: string; itemName: string }> = {
  boss_slime_green:  { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_slime_red:    { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_slime_blue:   { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_slime_white:  { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_zombie_slime: { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_lava_slime:   { itemId: ITEM_TICKET_SLIME,   itemName: t('item.ticket_slime')   },
  boss_flower_one:   { itemId: ITEM_TICKET_FLOWER,  itemName: t('item.ticket_flower')  },
  boss_flower_two:   { itemId: ITEM_TICKET_FLOWER,  itemName: t('item.ticket_flower')  },
  boss_flower_three: { itemId: ITEM_TICKET_FLOWER,  itemName: t('item.ticket_flower')  },
  boss_orc1:         { itemId: ITEM_TICKET_ORC,     itemName: t('item.ticket_orc')     },
  boss_orc2:         { itemId: ITEM_TICKET_ORC,     itemName: t('item.ticket_orc')     },
  boss_orc3:         { itemId: ITEM_TICKET_ORC,     itemName: t('item.ticket_orc')     },
  boss_vampire1:     { itemId: ITEM_TICKET_VAMPIRE, itemName: t('item.ticket_vampire') },
  boss_vampire2:     { itemId: ITEM_TICKET_VAMPIRE, itemName: t('item.ticket_vampire') },
  boss_vampire3:     { itemId: ITEM_TICKET_VAMPIRE, itemName: t('item.ticket_vampire') },
};

export function getHealthPotionForStar(questStar: number): { id: string; name: string; healAmt: number } {
  if (questStar >= 5) return { id: ITEM_POTION_HEALTH_L, name: t('item.potion_health_l'), healAmt: 300 };
  if (questStar >= 3) return { id: ITEM_POTION_HEALTH_M, name: t('item.potion_health_m'), healAmt: 200 };
  return { id: ITEM_POTION_HEALTH_S, name: t('item.potion_health_s'), healAmt: 100 };
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
  { itemId: ITEM_STONE_BROKEN, itemName: t('item.stone_broken'), rate: 0.03, qtyMin: 1, qtyMax: 1 },
];

const eliteDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: t('item.stone_broken'), rate: 0.075, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: t('item.stone_intact'), rate: 0.015, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_RECAST, itemName: t('item.stone_guard'),  rate: 0.005, qtyMin: 1, qtyMax: 1 },
];

const bossDrops: DropEntry[] = [
  { itemId: ITEM_STONE_BROKEN, itemName: t('item.stone_broken'), rate: 0.60, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_INTACT, itemName: t('item.stone_intact'), rate: 0.15, qtyMin: 1, qtyMax: 1 },
  { itemId: ITEM_STONE_RECAST, itemName: t('item.stone_guard'),  rate: 0.05, qtyMin: 1, qtyMax: 1 },
];

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  // ── 小史萊姆 (Tier 1) ──────────────────────────────────
  {
    id: 'slime_green_s', name: t('monster.slime_green_s'), spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44ff44, tier: 1,
    hp: 87, atk: 48, def: 5, speed: 90, exp: 30, gold: 5,
    cards: [{ cardId: 'card_slime_green_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_red_s', name: t('monster.slime_red_s'), spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 1,
    hp: 83, atk: 48, def: 5, speed: 85, exp: 30, gold: 6,
    cards: [{ cardId: 'card_slime_red_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_blue_s', name: t('monster.slime_blue_s'), spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2299ff, tier: 1,
    hp: 85, atk: 48, def: 5, speed: 100, exp: 30, gold: 5,
    cards: [{ cardId: 'card_slime_blue_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_white_s', name: t('monster.slime_white_s'), spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xccddee, tier: 1,
    hp: 91, atk: 48, def: 5, speed: 90, exp: 30, gold: 4,
    cards: [{ cardId: 'card_slime_white_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 殭屍史萊姆小 / 熔岩史萊姆小 ───────────────────
  {
    id: 'slime_zombie_s', name: t('monster.slime_zombie_s'), spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0x99dd44, tier: 1,
    hp: 89, atk: 48, def: 5, speed: 70, exp: 30, gold: 7,
    cards: [{ cardId: 'card_slime_zombie_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'slime_lava_s', name: t('monster.slime_lava_s'), spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 1,
    hp: 86, atk: 48, def: 5, speed: 100, exp: 30, gold: 8,
    cards: [{ cardId: 'card_slime_lava_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 菁英史萊姆 Tier 3 ──────────────────────────────────
  {
    id: 'elite_slime_green', name: t('monster.elite_slime_green'), spriteKey: 'slime', frameEnd: 5,
    element: 'grass', tint: 0x44dd44, tier: 3,
    hp: 87, atk: 48, def: 8, speed: 95, exp: 75, gold: 25,
    cards: [{ cardId: 'card_slime_green_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_red', name: t('monster.elite_slime_red'), spriteKey: 'slime', frameEnd: 5,
    element: 'fire', tint: 0xff2020, tier: 3,
    hp: 83, atk: 48, def: 8, speed: 90, exp: 75, gold: 28,
    cards: [{ cardId: 'card_slime_red_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_blue', name: t('monster.elite_slime_blue'), spriteKey: 'slime', frameEnd: 5,
    element: 'water', tint: 0x2288ee, tier: 3,
    hp: 85, atk: 48, def: 8, speed: 110, exp: 75, gold: 25,
    cards: [{ cardId: 'card_slime_blue_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_white', name: t('monster.elite_slime_white'), spriteKey: 'slime', frameEnd: 5,
    element: 'none', tint: 0xeeffff, tier: 3,
    hp: 91, atk: 48, def: 8, speed: 95, exp: 75, gold: 22,
    cards: [{ cardId: 'card_slime_white_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_zombie', name: t('monster.elite_slime_zombie'), spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xccff44, tier: 3,
    hp: 89, atk: 48, def: 8, speed: 78, exp: 75, gold: 32,
    cards: [{ cardId: 'card_slime_zombie_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_slime_lava', name: t('monster.elite_slime_lava'), spriteKey: 'slime3', frameEnd: 5,
    element: 'fire', tint: 0xffffff, tier: 3,
    hp: 86, atk: 48, def: 8, speed: 110, exp: 75, gold: 36,
    cards: [{ cardId: 'card_slime_lava_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 花怪小怪 Tier 2 (minStar=2) ────────────────────────
  {
    id: 'plant1_s', name: t('monster.plant1_s'), spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 82, atk: 50, def: 1, speed: 0, exp: 30, gold: 10,
    cards: [{ cardId: 'card_plant1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant2_s', name: t('monster.plant2_s'), spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 80, atk: 50, def: 1, speed: 0, exp: 30, gold: 11,
    cards: [{ cardId: 'card_plant2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'plant3_s', name: t('monster.plant3_s'), spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 2, minStar: 2,
    hp: 79, atk: 50, def: 1, speed: 0, exp: 30, gold: 12,
    cards: [{ cardId: 'card_plant3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 花怪菁英 Tier 3 (minStar=2) ─────────────────────────
  {
    id: 'elite_plant1', name: t('monster.elite_plant1'), spriteKey: 'plant1', frameEnd: 6,
    element: 'grass', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 82, atk: 50, def: 2, speed: 0, exp: 75, gold: 38,
    cards: [{ cardId: 'card_plant1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant2', name: t('monster.elite_plant2'), spriteKey: 'plant2', frameEnd: 6,
    element: 'water', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 80, atk: 50, def: 2, speed: 0, exp: 75, gold: 40,
    cards: [{ cardId: 'card_plant2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_plant3', name: t('monster.elite_plant3'), spriteKey: 'plant3', frameEnd: 6,
    element: 'fire', tint: 0xffffff, tier: 3, minStar: 2,
    hp: 79, atk: 50, def: 2, speed: 0, exp: 75, gold: 42,
    cards: [{ cardId: 'card_plant3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 獸人小怪 Tier 1 (minStar=3) ───────────────────────
  {
    id: 'orc1_s', name: t('monster.orc1_s'), spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 95, atk: 52, def: 8, speed: 80, exp: 30, gold: 12,
    cards: [{ cardId: 'card_orc1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'orc2_s', name: t('monster.orc2_s'), spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 96, atk: 52, def: 8, speed: 85, exp: 30, gold: 13,
    cards: [{ cardId: 'card_orc2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'orc3_s', name: t('monster.orc3_s'), spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 3,
    hp: 94, atk: 52, def: 8, speed: 90, exp: 30, gold: 14,
    cards: [{ cardId: 'card_orc3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 獸人菁英 Tier 3 (minStar=3) ────────────────────────
  {
    id: 'elite_orc1', name: t('monster.elite_orc1'), spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 95, atk: 52, def: 14, speed: 85, exp: 75, gold: 45,
    cards: [{ cardId: 'card_orc1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_orc2', name: t('monster.elite_orc2'), spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 96, atk: 52, def: 14, speed: 90, exp: 75, gold: 48,
    cards: [{ cardId: 'card_orc2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_orc3', name: t('monster.elite_orc3'), spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 3,
    hp: 94, atk: 52, def: 14, speed: 95, exp: 75, gold: 50,
    cards: [{ cardId: 'card_orc3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 史萊姆王 Tier 5 ────────────────────────────────────
  {
    id: 'boss_slime_green', name: t('monster.boss_slime_green'), spriteKey: 'slime', frameEnd: 9,
    element: 'grass', tint: 0x33ff33, tier: 5,
    hp: 825, atk: 26, def: 18, speed: 80, exp: 500, gold: 100,
    cards: [{ cardId: 'card_slime_green_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_red', name: t('monster.boss_slime_red'), spriteKey: 'slime', frameEnd: 9,
    element: 'fire', tint: 0xff1111, tier: 5,
    hp: 800, atk: 26, def: 18, speed: 80, exp: 500, gold: 100,
    cards: [{ cardId: 'card_slime_red_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_blue', name: t('monster.boss_slime_blue'), spriteKey: 'slime', frameEnd: 9,
    element: 'water', tint: 0x1188ff, tier: 5,
    hp: 840, atk: 26, def: 18, speed: 80, exp: 500, gold: 100,
    cards: [{ cardId: 'card_slime_blue_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_slime_white', name: t('monster.boss_slime_white'), spriteKey: 'slime', frameEnd: 9,
    element: 'none', tint: 0xccddee, tier: 5,
    hp: 855, atk: 26, def: 24, speed: 80, exp: 500, gold: 100,
    cards: [{ cardId: 'card_slime_white_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_zombie_slime', name: t('monster.boss_zombie_slime'), spriteKey: 'slime2', frameEnd: 9,
    element: 'none', tint: 0x99dd44, tier: 5,
    hp: 866, atk: 26, def: 20, speed: 80, exp: 500, gold: 120,
    cards: [{ cardId: 'card_slime_zombie_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_lava_slime', name: t('monster.boss_lava_slime'), spriteKey: 'slime3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 784, atk: 26, def: 30, speed: 80, exp: 500, gold: 150,
    cards: [{ cardId: 'card_slime_lava_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 獸人Boss系列 ────────────────────────────────────────
  {
    id: 'boss_orc1', name: t('monster.boss_orc1'), spriteKey: 'orc1', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 900, atk: 27, def: 18, speed: 95, exp: 500, gold: 160,
    cards: [{ cardId: 'card_orc1_b', rate: CR_B }],
    drops: bossDrops,
  },

  {
    id: 'boss_orc2', name: t('monster.boss_orc2'), spriteKey: 'orc2', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 916, atk: 27, def: 19, speed: 85, exp: 500, gold: 175,
    cards: [{ cardId: 'card_orc2_b', rate: CR_B }],
    drops: bossDrops,
  },

  {
    id: 'boss_orc3', name: t('monster.boss_orc3'), spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 883, atk: 27, def: 15, speed: 105, exp: 500, gold: 180,
    cards: [{ cardId: 'card_orc3_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 吸血鬼小怪 Tier 1 (minStar=4) ──────────────────────
  {
    id: 'vampire1_s', name: t('monster.vampire1_s'), spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 87, atk: 50, def: 3, speed: 85, exp: 30, gold: 15,
    cards: [{ cardId: 'card_vampire1_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'vampire2_s', name: t('monster.vampire2_s'), spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 91, atk: 50, def: 3, speed: 90, exp: 30, gold: 16,
    cards: [{ cardId: 'card_vampire2_n', rate: CR_S }],
    drops: smallDrops,
  },
  {
    id: 'vampire3_s', name: t('monster.vampire3_s'), spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 1, minStar: 4,
    hp: 83, atk: 50, def: 3, speed: 95, exp: 30, gold: 17,
    cards: [{ cardId: 'card_vampire3_n', rate: CR_S }],
    drops: smallDrops,
  },

  // ── 吸血鬼菁英 Tier 3 (minStar=4) ───────────────────────
  {
    id: 'elite_vampire1', name: t('monster.elite_vampire1'), spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 87, atk: 50, def: 5, speed: 88, exp: 75, gold: 55,
    cards: [{ cardId: 'card_vampire1_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_vampire2', name: t('monster.elite_vampire2'), spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 91, atk: 50, def: 5, speed: 93, exp: 75, gold: 58,
    cards: [{ cardId: 'card_vampire2_e', rate: CR_E }],
    drops: eliteDrops,
  },
  {
    id: 'elite_vampire3', name: t('monster.elite_vampire3'), spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 3, minStar: 4,
    hp: 83, atk: 50, def: 5, speed: 98, exp: 75, gold: 60,
    cards: [{ cardId: 'card_vampire3_e', rate: CR_E }],
    drops: eliteDrops,
  },

  // ── 吸血鬼Boss系列 (minStar=4) ──────────────────────────
  {
    id: 'boss_vampire1', name: t('monster.boss_vampire1'), spriteKey: 'vampire1', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 820, atk: 29, def: 25, speed: 100, exp: 500, gold: 200,
    cards: [{ cardId: 'card_vampire1_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_vampire2', name: t('monster.boss_vampire2'), spriteKey: 'vampire2', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 850, atk: 29, def: 27, speed: 92, exp: 500, gold: 210,
    cards: [{ cardId: 'card_vampire2_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_vampire3', name: t('monster.boss_vampire3'), spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xffffff, tier: 5,
    hp: 790, atk: 29, def: 21, speed: 108, exp: 500, gold: 220,
    cards: [{ cardId: 'card_vampire3_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 花Boss系列 ──────────────────────────────────────────
  {
    id: 'boss_flower_one', name: t('monster.boss_flower_one'), spriteKey: 'plant1', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 780, atk: 29, def: 14, speed: 0, exp: 500, gold: 110,
    cards: [{ cardId: 'card_plant1_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_two', name: t('monster.boss_flower_two'), spriteKey: 'plant2', frameEnd: 9,
    element: 'grass', tint: 0xffffff, tier: 5,
    hp: 760, atk: 29, def: 14, speed: 0, exp: 500, gold: 115,
    cards: [{ cardId: 'card_plant2_b', rate: CR_B }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_three', name: t('monster.boss_flower_three'), spriteKey: 'plant3', frameEnd: 9,
    element: 'fire', tint: 0xffffff, tier: 5,
    hp: 750, atk: 29, def: 7, speed: 0, exp: 500, gold: 120,
    cards: [{ cardId: 'card_plant3_b', rate: CR_B }],
    drops: bossDrops,
  },

  // ── 傳說系列王 (tier 6，透過祭祀台門票挑戰) ───────────────
  {
    id: 'boss_slime_legendary', name: t('monster.boss_slime_legendary'), spriteKey: 'slime2', frameEnd: 5,
    element: 'none', tint: 0xcc44ff, fillTint: true, tier: 6,
    hp: 1476, atk: 29, def: 25, speed: 100, exp: 1500, gold: 500,
    cards: [{ cardId: 'card_slime_legendary', rate: 0.10 }],
    drops: bossDrops,
  },
  {
    id: 'boss_flower_legendary', name: t('monster.boss_flower_legendary'), spriteKey: 'plant1', frameEnd: 9,
    element: 'grass', tint: 0xff2244, fillTint: true, tier: 6,
    hp: 1404, atk: 29, def: 14, speed: 0, exp: 1500, gold: 500,
    cards: [{ cardId: 'card_flower_legendary', rate: 0.10 }],
    drops: bossDrops,
  },
  {
    id: 'boss_orc_legendary', name: t('monster.boss_orc_legendary'), spriteKey: 'orc3', frameEnd: 7,
    element: 'none', tint: 0x2266ff, fillTint: true, tier: 6,
    hp: 1530, atk: 29, def: 30, speed: 115, exp: 1500, gold: 500,
    cards: [{ cardId: 'card_orc_legendary', rate: 0.10 }],
    drops: bossDrops,
  },
  {
    id: 'boss_vampire_legendary', name: t('monster.boss_vampire_legendary'), spriteKey: 'vampire3', frameEnd: 3,
    element: 'none', tint: 0xdd2222, fillTint: true, tier: 6,
    hp: 1422, atk: 29, def: 21, speed: 108, exp: 1500, gold: 500,
    cards: [{ cardId: 'card_vampire_legendary', rate: 0.10 }],
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
  { id: 'card_slime_green_n', name: t('card.card_slime_green_n'), monsterId: 'slime_green_s',
    family: 'slime_green', race: 'slime', cardType: 'n',
    element: 'grass', tint: 0x44ff44,
    effect: { hp: 12 },
    desc: t('card.card_slime_green_n.desc') },
  { id: 'card_slime_green_e', name: t('card.card_slime_green_e'), monsterId: 'elite_slime_green',
    family: 'slime_green', race: 'slime', cardType: 'e',
    element: 'grass', tint: 0x00ff88,
    effect: { hp: 35, hpRegen: 0.4 },
    desc: t('card.card_slime_green_e.desc') },
  { id: 'card_slime_green_b', name: t('card.card_slime_green_b'), monsterId: 'boss_slime_green',
    family: 'slime_green', race: 'slime', cardType: 'b',
    element: 'grass', tint: 0x33ff33,
    effect: { hp: 25, hpPct: 0.20, hpRegen: 2.5 },
    desc: t('card.card_slime_green_b.desc') },

  // ── 紅史萊姆家族（爆擊主題）──
  { id: 'card_slime_red_n', name: t('card.card_slime_red_n'), monsterId: 'slime_red_s',
    family: 'slime_red', race: 'slime', cardType: 'n',
    element: 'fire', tint: 0xff5522,
    effect: { crit: 0.02 },
    desc: t('card.card_slime_red_n.desc') },
  { id: 'card_slime_red_e', name: t('card.card_slime_red_e'), monsterId: 'elite_slime_red',
    family: 'slime_red', race: 'slime', cardType: 'e',
    element: 'fire', tint: 0xff6600,
    effect: { crit: 0.04, critDmg: 0.08 },
    desc: t('card.card_slime_red_e.desc') },
  { id: 'card_slime_red_b', name: t('card.card_slime_red_b'), monsterId: 'boss_slime_red',
    family: 'slime_red', race: 'slime', cardType: 'b',
    element: 'fire', tint: 0xff1111,
    effect: { crit: 0.07, critDmg: 0.42 },
    desc: t('card.card_slime_red_b.desc') },

  // ── 藍史萊姆家族（防禦主題）──
  { id: 'card_slime_blue_n', name: t('card.card_slime_blue_n'), monsterId: 'slime_blue_s',
    family: 'slime_blue', race: 'slime', cardType: 'n',
    element: 'water', tint: 0x2299ff,
    effect: { def: 4 },
    desc: t('card.card_slime_blue_n.desc') },
  { id: 'card_slime_blue_e', name: t('card.card_slime_blue_e'), monsterId: 'elite_slime_blue',
    family: 'slime_blue', race: 'slime', cardType: 'e',
    element: 'water', tint: 0x00ddff,
    effect: { def: 8, takenDmgPct: -0.03 },
    desc: t('card.card_slime_blue_e.desc') },
  { id: 'card_slime_blue_b', name: t('card.card_slime_blue_b'), monsterId: 'boss_slime_blue',
    family: 'slime_blue', race: 'slime', cardType: 'b',
    element: 'water', tint: 0x1188ff,
    effect: { divineShieldChance: 0.18, takenDmgPct: -0.12, executePct: 0.12 },
    desc: t('card.card_slime_blue_b.desc') },

  // ── 白史萊姆家族（速度主題）──
  { id: 'card_slime_white_n', name: t('card.card_slime_white_n'), monsterId: 'slime_white_s',
    family: 'slime_white', race: 'slime', cardType: 'n',
    element: 'none', tint: 0xaaaaaa,
    effect: { atkSpeed: 0.03, speed: 5 },
    desc: t('card.card_slime_white_n.desc') },
  { id: 'card_slime_white_e', name: t('card.card_slime_white_e'), monsterId: 'elite_slime_white',
    family: 'slime_white', race: 'slime', cardType: 'e',
    element: 'none', tint: 0xaaccdd,
    effect: { atkSpeed: 0.07, speed: 8 },
    desc: t('card.card_slime_white_e.desc') },
  { id: 'card_slime_white_b', name: t('card.card_slime_white_b'), monsterId: 'boss_slime_white',
    family: 'slime_white', race: 'slime', cardType: 'b',
    element: 'none', tint: 0xccddee,
    effect: { atkSpeed: 0.22, speed: 30 },
    desc: t('card.card_slime_white_b.desc') },

  // ── 殭屍史萊姆家族（燃燒主題）──
  { id: 'card_slime_zombie_n', name: t('card.card_slime_zombie_n'), monsterId: 'slime_zombie_s',
    family: 'slime_zombie', race: 'slime', cardType: 'n',
    element: 'none', tint: 0x88aa44,
    effect: { dotBonus: 0.03 },
    desc: t('card.card_slime_zombie_n.desc') },
  { id: 'card_slime_zombie_e', name: t('card.card_slime_zombie_e'), monsterId: 'elite_slime_zombie',
    family: 'slime_zombie', race: 'slime', cardType: 'e',
    element: 'none', tint: 0xccff44,
    effect: { dotBonus: 0.07, burnMaxStackBonus: 1 },
    desc: t('card.card_slime_zombie_e.desc') },
  { id: 'card_slime_zombie_b', name: t('card.card_slime_zombie_b'), monsterId: 'boss_zombie_slime',
    family: 'slime_zombie', race: 'slime', cardType: 'b',
    element: 'none', tint: 0x99dd44,
    effect: { dotBonus: 0.20, allDmgPct: 0.12, burnedEnemyDmgAmp: 0.28, burnMaxStackBonus: 3 },
    desc: t('card.card_slime_zombie_b.desc') },

  // ── 熔岩史萊姆家族（穿透主題）──
  { id: 'card_slime_lava_n', name: t('card.card_slime_lava_n'), monsterId: 'slime_lava_s',
    family: 'slime_lava', race: 'slime', cardType: 'n',
    element: 'fire', tint: 0xff6622,
    effect: { penetration: 10 },
    desc: t('card.card_slime_lava_n.desc') },
  { id: 'card_slime_lava_e', name: t('card.card_slime_lava_e'), monsterId: 'elite_slime_lava',
    family: 'slime_lava', race: 'slime', cardType: 'e',
    element: 'fire', tint: 0xff4400,
    effect: { penetration: 20, dotBonus: 0.03 },
    desc: t('card.card_slime_lava_e.desc') },
  { id: 'card_slime_lava_b', name: t('card.card_slime_lava_b'), monsterId: 'boss_lava_slime',
    family: 'slime_lava', race: 'slime', cardType: 'b',
    element: 'fire', tint: 0xffffff,
    effect: { penetration: 55, atk: 22, allDmgPct: 0.08 },
    desc: t('card.card_slime_lava_b.desc') },

  // ════════════════════════════════════════════════════
  // 花怪族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 食人花家族（強攻主題）──
  { id: 'card_plant1_n', name: t('card.card_plant1_n'), monsterId: 'plant1_s',
    family: 'plant1', race: 'flower', cardType: 'n',
    element: 'grass', tint: 0xff88cc,
    effect: { atk: 4 },
    desc: t('card.card_plant1_n.desc') },
  { id: 'card_plant1_e', name: t('card.card_plant1_e'), monsterId: 'elite_plant1',
    family: 'plant1', race: 'flower', cardType: 'e',
    element: 'grass', tint: 0xff66aa,
    effect: { atk: 8, dmgVsEliteOrBoss: 0.07 },
    desc: t('card.card_plant1_e.desc') },
  { id: 'card_plant1_b', name: t('card.card_plant1_b'), monsterId: 'boss_flower_one',
    family: 'plant1', race: 'flower', cardType: 'b',
    element: 'grass', tint: 0xff4488,
    effect: { atk: 48, dmgVsEliteOrBoss: 0.35 },
    desc: t('card.card_plant1_b.desc') },

  // ── 藤蔓花家族（迴避主題）──
  { id: 'card_plant2_n', name: t('card.card_plant2_n'), monsterId: 'plant2_s',
    family: 'plant2', race: 'flower', cardType: 'n',
    element: 'water', tint: 0x66ff88,
    effect: { evasion: 0.02 },
    desc: t('card.card_plant2_n.desc') },
  { id: 'card_plant2_e', name: t('card.card_plant2_e'), monsterId: 'elite_plant2',
    family: 'plant2', race: 'flower', cardType: 'e',
    element: 'water', tint: 0x44ee66,
    effect: { evasion: 0.03, hp: 20 },
    desc: t('card.card_plant2_e.desc') },
  { id: 'card_plant2_b', name: t('card.card_plant2_b'), monsterId: 'boss_flower_two',
    family: 'plant2', race: 'flower', cardType: 'b',
    element: 'water', tint: 0x22cc44,
    effect: { evasion: 0.14, atk: 15, condLowHpAtk: 30 },
    desc: t('card.card_plant2_b.desc') },

  // ── 不死花家族（召喚主題）──
  { id: 'card_plant3_n', name: t('card.card_plant3_n'), monsterId: 'plant3_s',
    family: 'plant3', race: 'flower', cardType: 'n',
    element: 'fire', tint: 0xffaa44,
    effect: { summonFlowerDmgPct: 0.05 },
    desc: t('card.card_plant3_n.desc') },
  { id: 'card_plant3_e', name: t('card.card_plant3_e'), monsterId: 'elite_plant3',
    family: 'plant3', race: 'flower', cardType: 'e',
    element: 'fire', tint: 0xff8822,
    effect: { summonFlowerDmgPct: 0.10, skillFlowerHpPct: 0.15 },
    desc: t('card.card_plant3_e.desc') },
  { id: 'card_plant3_b', name: t('card.card_plant3_b'), monsterId: 'boss_flower_three',
    family: 'plant3', race: 'flower', cardType: 'b',
    element: 'fire', tint: 0xff6600,
    effect: { summonFlowerDmgPct: 0.50, summonFlowerCap: 2, skillFlowerHpPct: 0.35 },
    desc: t('card.card_plant3_b.desc') },

  // ════════════════════════════════════════════════════
  // 獸人族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 獸人 菁英獸人 獸人族長（盾甲：靜止強化）──
  { id: 'card_orc1_n', name: t('card.card_orc1_n'), monsterId: 'orc1_s',
    family: 'orc1', race: 'orc', cardType: 'n',
    element: 'none', tint: 0xcc8833,
    effect: { regenShieldMaxPct: 0.15 },
    desc: t('card.card_orc1_n.desc') },
  { id: 'card_orc1_e', name: t('card.card_orc1_e'), monsterId: 'elite_orc1',
    family: 'orc1', race: 'orc', cardType: 'e',
    element: 'none', tint: 0xdd9944,
    effect: { standstillDmgPct: 0.07, standstillDmgReductionPct: 0.07 },
    desc: t('card.card_orc1_e.desc') },
  { id: 'card_orc1_b', name: t('card.card_orc1_b'), monsterId: 'boss_orc1',
    family: 'orc1', race: 'orc', cardType: 'b',
    element: 'none', tint: 0xffaa22,
    effect: { atk: 30, critToAtk: 2.2, allDmgPct: 0.15 },
    desc: t('card.card_orc1_b.desc') },

  // ── 獸人戰士家族（靜止強化/飛刀）──
  { id: 'card_orc2_n', name: t('card.card_orc2_n'), monsterId: 'orc2_s',
    family: 'orc2', race: 'orc', cardType: 'n',
    element: 'none', tint: 0x997744,
    effect: { standstillDmgPct: 0.05, standstillDmgReductionPct: 0.03 },
    desc: t('card.card_orc2_n.desc') },
  { id: 'card_orc2_e', name: t('card.card_orc2_e'), monsterId: 'elite_orc2',
    family: 'orc2', race: 'orc', cardType: 'e',
    element: 'none', tint: 0xaa8855,
    effect: { onHitKnifeChance: 0.20 },
    desc: t('card.card_orc2_e.desc') },
  { id: 'card_orc2_b', name: t('card.card_orc2_b'), monsterId: 'boss_orc2',
    family: 'orc2', race: 'orc', cardType: 'b',
    element: 'none', tint: 0xcc9933,
    effect: { regenShieldMaxPct: 1.0 },
    desc: t('card.card_orc2_b.desc') },

  // ── 獸人武士家族（吸血/落雷）──
  { id: 'card_orc3_n', name: t('card.card_orc3_n'), monsterId: 'orc3_s',
    family: 'orc3', race: 'orc', cardType: 'n',
    element: 'none', tint: 0x6688aa,
    effect: { lifesteal: 0.007 },
    desc: t('card.card_orc3_n.desc') },
  { id: 'card_orc3_e', name: t('card.card_orc3_e'), monsterId: 'elite_orc3',
    family: 'orc3', race: 'orc', cardType: 'e',
    element: 'none', tint: 0x7799bb,
    effect: { onHitLightningChance: 0.15 },
    desc: t('card.card_orc3_e.desc') },
  { id: 'card_orc3_b', name: t('card.card_orc3_b'), monsterId: 'boss_orc3',
    family: 'orc3', race: 'orc', cardType: 'b',
    element: 'none', tint: 0x99bbdd,
    effect: { impaleCharge: 3, impaleDmgPct: 1.60, atkSpeed: 0.12 },
    desc: t('card.card_orc3_b.desc') },

  // ════════════════════════════════════════════════════
  // 吸血鬼族（3 家族）
  // ════════════════════════════════════════════════════

  // ── 吸血鬼家族（穿甲/爆傷/旋轉球）──
  { id: 'card_vampire1_n', name: t('card.card_vampire1_n'), monsterId: 'vampire1_s',
    family: 'vampire1', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0xcc44ff,
    effect: { penetration: 7 },
    desc: t('card.card_vampire1_n.desc') },
  { id: 'card_vampire1_e', name: t('card.card_vampire1_e'), monsterId: 'elite_vampire1',
    family: 'vampire1', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xdd66ff,
    effect: { critDmg: 0.12 },
    desc: t('card.card_vampire1_e.desc') },
  { id: 'card_vampire1_b', name: t('card.card_vampire1_b'), monsterId: 'boss_vampire1',
    family: 'vampire1', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xee88ff,
    effect: { orbitBallDmgPct: 0.55, penetration: 18 },
    desc: t('card.card_vampire1_b.desc') },

  // ── 吸血鬼法師家族（攻速/旋轉球/落雷）──
  { id: 'card_vampire2_n', name: t('card.card_vampire2_n'), monsterId: 'vampire2_s',
    family: 'vampire2', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0xff4466,
    effect: { atkSpeed: 0.04 },
    desc: t('card.card_vampire2_n.desc') },
  { id: 'card_vampire2_e', name: t('card.card_vampire2_e'), monsterId: 'elite_vampire2',
    family: 'vampire2', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xff6688,
    effect: { orbitIceBalls: 1, orbitFireBalls: 1 },
    desc: t('card.card_vampire2_e.desc') },
  { id: 'card_vampire2_b', name: t('card.card_vampire2_b'), monsterId: 'boss_vampire2',
    family: 'vampire2', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xff88aa,
    effect: { lightningDmgBonus: 0.60, atkSpeed: 0.08 },
    desc: t('card.card_vampire2_b.desc') },

  // ── 吸血鬼術士家族（回血/迴避/受傷上限）──
  { id: 'card_vampire3_n', name: t('card.card_vampire3_n'), monsterId: 'vampire3_s',
    family: 'vampire3', race: 'vampire', cardType: 'n',
    element: 'none', tint: 0x8866dd,
    effect: { hpRegen: 0.4 },
    desc: t('card.card_vampire3_n.desc') },
  { id: 'card_vampire3_e', name: t('card.card_vampire3_e'), monsterId: 'elite_vampire3',
    family: 'vampire3', race: 'vampire', cardType: 'e',
    element: 'none', tint: 0xaa88ff,
    effect: { evasion: 0.05, speed: 7 },
    desc: t('card.card_vampire3_e.desc') },
  { id: 'card_vampire3_b', name: t('card.card_vampire3_b'), monsterId: 'boss_vampire3',
    family: 'vampire3', race: 'vampire', cardType: 'b',
    element: 'none', tint: 0xccaaff,
    effect: { damageCap: 0.35, hpRegen: 2.0, evasion: 0.08 },
    desc: t('card.card_vampire3_b.desc') },

  // ════════════════════════════════════════════════════
  // 傳說王卡（祭祀台掉落，極稀有）
  // ════════════════════════════════════════════════════
  { id: 'card_slime_legendary', name: t('card.card_slime_legendary'), monsterId: 'boss_slime_legendary',
    family: 'slime_legendary', race: 'slime', cardType: 'l',
    element: 'none', tint: 0xcc44ff,
    effect: { def: 100 },
    desc: t('card.card_slime_legendary.desc') },
  { id: 'card_flower_legendary', name: t('card.card_flower_legendary'), monsterId: 'boss_flower_legendary',
    family: 'flower_legendary', race: 'plant', cardType: 'l',
    element: 'grass', tint: 0xff2244,
    effect: { penetration: 9999 },
    desc: t('card.card_flower_legendary.desc') },
  { id: 'card_orc_legendary', name: t('card.card_orc_legendary'), monsterId: 'boss_orc_legendary',
    family: 'orc_legendary', race: 'orc', cardType: 'l',
    element: 'none', tint: 0x2266ff,
    effect: { maxHpPct: 0.99 },
    desc: t('card.card_orc_legendary.desc') },
  { id: 'card_vampire_legendary', name: t('card.card_vampire_legendary'), monsterId: 'boss_vampire_legendary',
    family: 'vampire_legendary', race: 'vampire', cardType: 'l',
    element: 'none', tint: 0xdd2222,
    effect: { onHitLightningChance: 0.50, onHitKnifeChance: 0.50 },
    desc: t('card.card_vampire_legendary.desc') },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}

export function getAllCardIdsByTier(tier: CardType): string[] {
  return CARD_DEFS.filter(c => c.cardType === tier).map(c => c.id);
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
