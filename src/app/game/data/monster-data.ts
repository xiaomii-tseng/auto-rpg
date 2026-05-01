import { Element, StatBonus } from './equipment-data';

// ── Interfaces ─────────────────────────────────────────────────────────────

export interface MonsterDef {
  id:           string;
  name:         string;
  spriteKey:    string;   // Phaser texture key
  frameEnd:     number;   // last frame index (0-based); -1 = no animation
  element:      Element;
  tint:         number;   // hex tint (0xffffff = no tint)
  tier:         number;   // 1-5
  hp:           number;
  atk:          number;
  speed:        number;
  exp:          number;
  gold:         number;
  cardId:       string;
  cardDropRate: number;   // 0~1
}

export interface CardDef {
  id:        string;
  name:      string;   // e.g. '綠史萊姆卡'
  monsterId: string;
  element:   Element;
  tint:      number;   // accent color for UI
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

// ── Monster definitions ────────────────────────────────────────────────────

export const MONSTER_DEFS: MonsterDef[] = [

  // ── 史萊姆 (Tier 1) ────────────────────────────────────────
  {
    id: 'slime_grass', name: '綠史萊姆', spriteKey: 'slime_idle', frameEnd: 5,
    element: 'grass', tint: 0xffffff, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 15, gold: 5,
    cardId: 'card_slime_grass', cardDropRate: 0.08,
  },
  {
    id: 'slime_water', name: '藍史萊姆', spriteKey: 'slime_idle', frameEnd: 5,
    element: 'water', tint: 0x88ccff, tier: 1,
    hp: 55, atk: 8, speed: 100, exp: 15, gold: 5,
    cardId: 'card_slime_water', cardDropRate: 0.08,
  },
  {
    id: 'slime_fire', name: '紅史萊姆', spriteKey: 'slime_idle', frameEnd: 5,
    element: 'fire', tint: 0xff9966, tier: 1,
    hp: 65, atk: 10, speed: 85, exp: 18, gold: 6,
    cardId: 'card_slime_fire', cardDropRate: 0.08,
  },
  {
    id: 'slime_none', name: '白史萊姆', spriteKey: 'slime_idle', frameEnd: 5,
    element: 'none', tint: 0xdddddd, tier: 1,
    hp: 60, atk: 8, speed: 90, exp: 12, gold: 4,
    cardId: 'card_slime_none', cardDropRate: 0.10,
  },

  // ── 大史萊姆 (Tier 1.5) ────────────────────────────────────
  {
    id: 'slime2_grass', name: '草泥史萊姆', spriteKey: 'slime2_idle', frameEnd: 5,
    element: 'grass', tint: 0xffffff, tier: 2,
    hp: 100, atk: 12, speed: 80, exp: 28, gold: 10,
    cardId: 'card_slime2_grass', cardDropRate: 0.07,
  },
  {
    id: 'slime2_water', name: '水泡史萊姆', spriteKey: 'slime2_idle', frameEnd: 5,
    element: 'water', tint: 0x88ccff, tier: 2,
    hp: 90, atk: 12, speed: 95, exp: 28, gold: 10,
    cardId: 'card_slime2_water', cardDropRate: 0.07,
  },
  {
    id: 'slime2_fire', name: '火焰史萊姆', spriteKey: 'slime2_idle', frameEnd: 5,
    element: 'fire', tint: 0xff9966, tier: 2,
    hp: 110, atk: 15, speed: 75, exp: 32, gold: 12,
    cardId: 'card_slime2_fire', cardDropRate: 0.07,
  },

  // ── 食人花 (Tier 2) ────────────────────────────────────────
  {
    id: 'plant_grass', name: '食人花', spriteKey: 'plant1_idle', frameEnd: 5,
    element: 'grass', tint: 0xffffff, tier: 2,
    hp: 130, atk: 14, speed: 55, exp: 35, gold: 14,
    cardId: 'card_plant_grass', cardDropRate: 0.07,
  },
  {
    id: 'plant_water', name: '水生食人花', spriteKey: 'plant1_idle', frameEnd: 5,
    element: 'water', tint: 0x88ccff, tier: 2,
    hp: 120, atk: 13, speed: 60, exp: 35, gold: 14,
    cardId: 'card_plant_water', cardDropRate: 0.07,
  },
  {
    id: 'plant_fire', name: '火焰食人花', spriteKey: 'plant1_idle', frameEnd: 5,
    element: 'fire', tint: 0xff9966, tier: 2,
    hp: 140, atk: 16, speed: 50, exp: 40, gold: 16,
    cardId: 'card_plant_fire', cardDropRate: 0.07,
  },

  // ── 野蠻人 (Tier 3) ────────────────────────────────────────
  {
    id: 'orc_none', name: '野蠻人', spriteKey: 'orc1_idle', frameEnd: 5,
    element: 'none', tint: 0xffffff, tier: 3,
    hp: 200, atk: 22, speed: 70, exp: 60, gold: 25,
    cardId: 'card_orc_none', cardDropRate: 0.06,
  },
  {
    id: 'orc_fire', name: '火焰野蠻人', spriteKey: 'orc1_idle', frameEnd: 5,
    element: 'fire', tint: 0xff9966, tier: 3,
    hp: 210, atk: 26, speed: 65, exp: 70, gold: 28,
    cardId: 'card_orc_fire', cardDropRate: 0.06,
  },
  {
    id: 'orc_water', name: '水族野蠻人', spriteKey: 'orc1_idle', frameEnd: 5,
    element: 'water', tint: 0x88ccff, tier: 3,
    hp: 190, atk: 20, speed: 80, exp: 65, gold: 26,
    cardId: 'card_orc_water', cardDropRate: 0.06,
  },
  {
    id: 'orc_grass', name: '草原野蠻人', spriteKey: 'orc1_idle', frameEnd: 5,
    element: 'grass', tint: 0x88ff88, tier: 3,
    hp: 220, atk: 20, speed: 68, exp: 65, gold: 26,
    cardId: 'card_orc_grass', cardDropRate: 0.06,
  },

  // ── 吸血鬼 (Tier 4) ────────────────────────────────────────
  {
    id: 'vampire_none', name: '吸血鬼', spriteKey: 'vampire1_idle', frameEnd: 5,
    element: 'none', tint: 0xffffff, tier: 4,
    hp: 300, atk: 30, speed: 85, exp: 100, gold: 40,
    cardId: 'card_vampire_none', cardDropRate: 0.05,
  },
  {
    id: 'vampire_water', name: '藍血鬼', spriteKey: 'vampire1_idle', frameEnd: 5,
    element: 'water', tint: 0x88ccff, tier: 4,
    hp: 280, atk: 28, speed: 95, exp: 105, gold: 42,
    cardId: 'card_vampire_water', cardDropRate: 0.05,
  },
  {
    id: 'vampire_fire', name: '赤血鬼', spriteKey: 'vampire1_idle', frameEnd: 5,
    element: 'fire', tint: 0xff9966, tier: 4,
    hp: 320, atk: 34, speed: 78, exp: 110, gold: 45,
    cardId: 'card_vampire_fire', cardDropRate: 0.05,
  },
];

// ── Card definitions ───────────────────────────────────────────────────────

export const CARD_DEFS: CardDef[] = [

  // ── 史萊姆卡 ──
  {
    id: 'card_slime_grass', name: '綠史萊姆卡', monsterId: 'slime_grass',
    element: 'grass', tint: 0x44cc44,
    effect: { hp: 30 },
    desc: '最大 HP +30',
  },
  {
    id: 'card_slime_water', name: '藍史萊姆卡', monsterId: 'slime_water',
    element: 'water', tint: 0x44aaff,
    effect: { speed: 25 },
    desc: '移動速度 +25',
  },
  {
    id: 'card_slime_fire', name: '紅史萊姆卡', monsterId: 'slime_fire',
    element: 'fire', tint: 0xff5522,
    effect: { atk: 8 },
    desc: '攻擊力 +8',
  },
  {
    id: 'card_slime_none', name: '白史萊姆卡', monsterId: 'slime_none',
    element: 'none', tint: 0xaaaaaa,
    effect: { def: 5 },
    desc: '防禦力 +5',
  },

  // ── 大史萊姆卡 ──
  {
    id: 'card_slime2_grass', name: '草泥史萊姆卡', monsterId: 'slime2_grass',
    element: 'grass', tint: 0x44cc44,
    effect: { hp: 50 },
    desc: '最大 HP +50',
  },
  {
    id: 'card_slime2_water', name: '水泡史萊姆卡', monsterId: 'slime2_water',
    element: 'water', tint: 0x44aaff,
    effect: { speed: 40 },
    desc: '移動速度 +40',
  },
  {
    id: 'card_slime2_fire', name: '火焰史萊姆卡', monsterId: 'slime2_fire',
    element: 'fire', tint: 0xff5522,
    effect: { atk: 14 },
    desc: '攻擊力 +14',
  },

  // ── 食人花卡 ──
  {
    id: 'card_plant_grass', name: '食人花卡', monsterId: 'plant_grass',
    element: 'grass', tint: 0x44cc44,
    effect: { def: 8, hp: 20 },
    desc: '防禦力 +8  最大 HP +20',
  },
  {
    id: 'card_plant_water', name: '水生食人花卡', monsterId: 'plant_water',
    element: 'water', tint: 0x44aaff,
    effect: { speed: 30, hp: 20 },
    desc: '移動速度 +30  最大 HP +20',
  },
  {
    id: 'card_plant_fire', name: '火焰食人花卡', monsterId: 'plant_fire',
    element: 'fire', tint: 0xff5522,
    effect: { atk: 10, crit: 0.03 },
    desc: '攻擊力 +10  爆擊率 +3%',
  },

  // ── 野蠻人卡 ──
  {
    id: 'card_orc_none', name: '野蠻人卡', monsterId: 'orc_none',
    element: 'none', tint: 0xaaaaaa,
    effect: { atk: 15 },
    desc: '攻擊力 +15',
  },
  {
    id: 'card_orc_fire', name: '火焰野蠻人卡', monsterId: 'orc_fire',
    element: 'fire', tint: 0xff5522,
    effect: { atk: 20, crit: 0.03 },
    desc: '攻擊力 +20  爆擊率 +3%',
  },
  {
    id: 'card_orc_water', name: '水族野蠻人卡', monsterId: 'orc_water',
    element: 'water', tint: 0x44aaff,
    effect: { atk: 12, speed: 20 },
    desc: '攻擊力 +12  移動速度 +20',
  },
  {
    id: 'card_orc_grass', name: '草原野蠻人卡', monsterId: 'orc_grass',
    element: 'grass', tint: 0x44cc44,
    effect: { atk: 10, hp: 40 },
    desc: '攻擊力 +10  最大 HP +40',
  },

  // ── 吸血鬼卡 ──
  {
    id: 'card_vampire_none', name: '吸血鬼卡', monsterId: 'vampire_none',
    element: 'none', tint: 0xaaaaaa,
    effect: { crit: 0.08 },
    desc: '爆擊率 +8%',
  },
  {
    id: 'card_vampire_water', name: '藍血鬼卡', monsterId: 'vampire_water',
    element: 'water', tint: 0x44aaff,
    effect: { crit: 0.05, speed: 30 },
    desc: '爆擊率 +5%  移動速度 +30',
  },
  {
    id: 'card_vampire_fire', name: '赤血鬼卡', monsterId: 'vampire_fire',
    element: 'fire', tint: 0xff5522,
    effect: { crit: 0.05, atk: 15 },
    desc: '爆擊率 +5%  攻擊力 +15',
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────

export function getMonsterDef(id: string): MonsterDef | undefined {
  return MONSTER_DEFS.find(m => m.id === id);
}

export function getCardDef(id: string): CardDef | undefined {
  return CARD_DEFS.find(c => c.id === id);
}
