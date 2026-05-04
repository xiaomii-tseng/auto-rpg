export type EquipSlot     = 'hat' | 'outfit' | 'shoes' | 'ring1' | 'ring2' | 'sword';
export type EquipCategory = 'hat' | 'outfit' | 'shoes' | 'ring'  | 'sword';
export type EquipQuality  = 'normal' | 'good' | 'fine' | 'perfect';
export type StatKey       = 'atk' | 'hp' | 'def' | 'crit' | 'speed' | 'atkSpeed' | 'lifesteal' | 'evasion';
export type AttackBehavior = 'slash180' | 'whirlwind' | 'dashPierce' | 'projectile' | 'aura' | 'multiHit' | 'chargeSlam' | 'boomerang' | 'magicFire';

export type Element = 'none' | 'water' | 'fire' | 'grass';

export const ELEMENT_NAMES: Record<Element, string> = {
  none: '無', water: '水', fire: '火', grass: '草',
};

export const ELEMENT_COLORS: Record<Element, number> = {
  none: 0x888888, water: 0x44aaff, fire: 0xff5522, grass: 0x44cc44,
};

export function getElementMultiplier(atk: Element, def: Element): number {
  if (atk === 'none' || def === 'none') return 1;
  if ((atk === 'water' && def === 'fire')  ||
      (atk === 'fire'  && def === 'grass') ||
      (atk === 'grass' && def === 'water')) return 1.35;
  if ((atk === 'fire'  && def === 'water') ||
      (atk === 'grass' && def === 'fire')  ||
      (atk === 'water' && def === 'grass')) return 0.75;
  return 1;
}

// Kept for card system compatibility
export interface StatBonus {
  atk?:       number;
  hp?:        number;
  speed?:     number;
  def?:       number;
  crit?:      number;
  attackArc?: number;
}

// ── Affix system ───────────────────────────────────────────────────────────────

export interface Affix {
  stat:  StatKey;
  value: number;
}

export interface EquipmentItem {
  id:          string;
  name:        string;
  slot:        EquipSlot;
  texture:     string;          // Phaser texture key, e.g. 'equip_hat3'
  quality:     EquipQuality;
  affixes:     Affix[];         // always 2
  behavior?:   AttackBehavior;  // sword slot only
  enhancement: number;          // 0~5
}

// ── Constants ──────────────────────────────────────────────────────────────────

export const QUALITY_RANGES: Record<EquipQuality, [number, number]> = {
  normal:  [0.6, 1.0],
  good:    [0.8, 1.2],
  fine:    [1.0, 1.4],
  perfect: [1.4, 1.4],
};

export const QUALITY_NAMES: Record<EquipQuality, string> = {
  normal: '普通', good: '良好', fine: '精良', perfect: '完美',
};

export const QUALITY_COLORS: Record<EquipQuality, number> = {
  normal:  0xaaaaaa,
  good:    0x44dd44,
  fine:    0x4488ff,
  perfect: 0xffdd00,
};

export const SLOT_NAMES: Record<EquipSlot, string> = {
  hat: '頭盔', outfit: '衣服', shoes: '鞋子',
  ring1: '戒指', ring2: '戒指', sword: '武器',
};

export const STAT_NAMES: Record<StatKey, string> = {
  atk:       '攻擊力',
  hp:        '最大HP',
  def:       '防禦力',
  crit:      '爆擊率',
  speed:     '移動速度',
  atkSpeed:  '攻擊速度',
  lifesteal: '吸血',
  evasion:   '閃避率',
};

export const BEHAVIOR_NAMES: Record<AttackBehavior, string> = {
  slash180:   '半月斬',
  whirlwind:  '旋風斬',
  dashPierce: '瞬步斬',
  projectile: '風刃',
  aura:       '血環',
  multiHit:   '五連斬',
  chargeSlam: '蓄力重擊',
  boomerang:  '迴旋飛刃',
  magicFire:  '地獄火',
};

export interface BehaviorInfo {
  desc:         string;
  formula:      string[];
  relatedStats: { stat: StatKey; note: string }[];
}

export const BEHAVIOR_INFO: Record<AttackBehavior, BehaviorInfo> = {
  slash180: {
    desc:    '向目標方向揮出一道扇形斬擊，覆蓋前方180°範圍。',
    formula: ['傷害：攻擊力 × 100%', '冷卻：650ms', '範圍：扇形 180°'],
    relatedStats: [
      { stat: 'atk',      note: '決定傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  whirlwind: {
    desc:    '原地旋轉揮砍，對周圍所有敵人造成傷害。',
    formula: ['傷害：攻擊力 × 80%', '冷卻：650ms', '範圍：360° 全向（66px）'],
    relatedStats: [
      { stat: 'atk',      note: '決定傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  dashPierce: {
    desc:    '瞬間向前衝刺並刺穿路徑上的所有敵人。',
    formula: ['傷害：攻擊力 × 91%（每個敵人）', '冷卻：650ms', '衝刺距離：78px'],
    relatedStats: [
      { stat: 'atk',      note: '決定傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  projectile: {
    desc:    '射出一道飛行刀風，穿透路徑上所有敵人。',
    formula: ['傷害：攻擊力 × 55%', '冷卻：650ms', '射程：155px'],
    relatedStats: [
      { stat: 'atk',      note: '決定傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  aura: {
    desc:    '持續釋放血氣光環，對範圍內的敵人造成持續傷害，無需手動攻擊。',
    formula: ['傷害：最大HP × 7.5% / 次', '頻率：每 250ms（攻速越高越快）', '範圍：56px'],
    relatedStats: [
      { stat: 'hp',       note: '決定傷害' },
      { stat: 'atkSpeed', note: '提升攻擊頻率' },
    ],
  },
  multiHit: {
    desc:    '快速連續揮砍五下，每段都能命中範圍內的敵人。',
    formula: ['傷害：攻擊力 × 29% × 5段', '總傷：攻擊力 × 145%', '冷卻：650ms'],
    relatedStats: [
      { stat: 'atk',      note: '決定每段傷害' },
      { stat: 'crit',     note: '每段獨立觸發' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  chargeSlam: {
    desc:    '蓄力後釋放強力震地衝擊，對周圍大範圍造成高額傷害。蓄力期間移動速度 -60%。',
    formula: ['傷害：攻擊力 × 123.5%', '冷卻：650ms（蓄力中）', '範圍：360° 全向 AoE'],
    relatedStats: [
      { stat: 'atk',      note: '決定傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
      { stat: 'speed',    note: '蓄力中移速-60%' },
    ],
  },
  boomerang: {
    desc:    '投出迴旋飛刃，命中敵人後原地旋轉，再自動飛回。去回程皆可造成傷害。',
    formula: ['飛出：攻擊力 × 60%', '旋轉：攻擊力 × 30% × 4次（範圍：26px）', '飛回：攻擊力 × 60%', '冷卻：1500ms'],
    relatedStats: [
      { stat: 'atk',      note: '決定各段傷害' },
      { stat: 'crit',     note: '每段獨立觸發' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
  magicFire: {
    desc:    '射出火球，命中後在地面留下火焰區域，使敵人持續疊加燃燒層數造成傷害。',
    formula: ['火球：攻擊力 × 50%', '燃燒：攻擊力 × 3.2% × 層數 / 400ms', '最大層數：15層', '燃燒持續：4秒', '冷卻：1100ms'],
    relatedStats: [
      { stat: 'atk',      note: '決定燃燒傷害' },
      { stat: 'crit',     note: '觸發暴擊' },
      { stat: 'atkSpeed', note: '縮短冷卻' },
    ],
  },
};

export const STAT_BASE: Record<StatKey, number> = {
  atk:       12,
  hp:        40,
  def:        4,
  crit:       0.05,
  speed:     15,
  atkSpeed:   0.10,
  lifesteal:  0.03,
  evasion:    0.05,
};

export const ENHANCE_INCREMENT: Record<StatKey, number> = {
  atk:       2,
  hp:        6,
  def:       1,
  crit:      0.005,
  speed:     2,
  atkSpeed:  0.01,
  lifesteal: 0.005,
  evasion:   0.005,
};

// Affix pools per slot category (user-defined)
export const SLOT_AFFIX_POOL: Record<EquipCategory, StatKey[]> = {
  sword:  ['atk', 'hp', 'crit', 'atkSpeed', 'lifesteal', 'evasion'],
  hat:    ['atk', 'hp', 'def',  'crit',     'atkSpeed'],
  outfit: ['hp',  'def', 'lifesteal', 'evasion'],
  shoes:  ['hp',  'def', 'speed',     'evasion'],
  ring:   ['atk', 'hp', 'def', 'crit', 'atkSpeed', 'lifesteal', 'evasion'],
};

export const ATTACK_BEHAVIORS: AttackBehavior[] = [
  'slash180', 'whirlwind', 'dashPierce', 'projectile', 'aura', 'multiHit', 'chargeSlam', 'boomerang', 'magicFire',
];

const TEXTURE_COUNT: Record<EquipCategory, number> = {
  hat: 5, outfit: 5, shoes: 5, ring: 5, sword: 5,
};

const PCT_STATS = new Set<StatKey>(['crit', 'atkSpeed', 'lifesteal', 'evasion']);

// ── Helpers ────────────────────────────────────────────────────────────────────

export function slotToCategory(slot: EquipSlot): EquipCategory {
  return (slot === 'ring1' || slot === 'ring2') ? 'ring' : slot as EquipCategory;
}

function pickAffixes(category: EquipCategory, quality: EquipQuality): Affix[] {
  const pool = [...SLOT_AFFIX_POOL[category]];
  const [lo, hi] = QUALITY_RANGES[quality];
  const chosen: StatKey[] = [];
  while (chosen.length < 2 && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen.map(stat => {
    const raw = STAT_BASE[stat] * (lo + Math.random() * (hi - lo));
    const value = PCT_STATS.has(stat)
      ? Math.round(raw * 1000) / 1000
      : Math.round(raw);
    return { stat, value };
  });
}

// ── Generation ─────────────────────────────────────────────────────────────────

export function generateEquipment(slot: EquipSlot, quality: EquipQuality): EquipmentItem {
  const cat     = slotToCategory(slot);
  const texNum  = Math.floor(Math.random() * TEXTURE_COUNT[cat]) + 1;
  const affixes = pickAffixes(cat, quality);
  const behavior: AttackBehavior | undefined = slot === 'sword'
    ? ATTACK_BEHAVIORS[Math.floor(Math.random() * ATTACK_BEHAVIORS.length)]
    : undefined;

  return {
    id:          `${slot}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name:        SLOT_NAMES[slot],
    slot,
    texture:     `equip_${cat}${texNum}`,
    quality,
    affixes,
    behavior,
    enhancement: 0,
  };
}

export function randomQuality(weights?: Partial<Record<EquipQuality, number>>): EquipQuality {
  const w = { normal: 0.50, good: 0.30, fine: 0.15, perfect: 0.05, ...weights };
  const roll = Math.random();
  if (roll < w.normal!)                          return 'normal';
  if (roll < w.normal! + w.good!)                return 'good';
  if (roll < w.normal! + w.good! + w.fine!)      return 'fine';
  return 'perfect';
}

export function getItemStats(item: EquipmentItem): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const a of item.affixes) {
    out[a.stat] = (out[a.stat] ?? 0) + a.value;
  }
  return out;
}

// Apply one enhancement to a random affix in-place; returns the affix that was boosted
export function applyEnhancement(item: EquipmentItem): Affix | null {
  if (item.enhancement >= 5) return null;
  const target = item.affixes[Math.floor(Math.random() * item.affixes.length)];
  target.value = PCT_STATS.has(target.stat)
    ? Math.round((target.value + ENHANCE_INCREMENT[target.stat]) * 1000) / 1000
    : target.value + ENHANCE_INCREMENT[target.stat];
  item.enhancement++;
  return target;
}
