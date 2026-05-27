import { PlayerStore } from './player-store';
import { StatBonus } from './equipment-data';
import { t } from '../i18n/i18n';

export type AttackModeId =
  'aura' | 'projectile' | 'boomerang' | 'hellfire' |
  'whirlwind' | 'slash180' | 'chargeSlam' | 'dashPierce' | 'multiHit' | 'knifeThrow' | 'flowerMode';

export interface AttackModeInfo { id: AttackModeId; label: string; unlockedBy?: string; }

export const ATTACK_MODES: AttackModeInfo[] = [
  { id: 'slash180',    label: t('mode.slash180')   },
  { id: 'aura',        label: t('mode.aura')       },
  { id: 'projectile',  label: t('mode.projectile') },
  { id: 'boomerang',   label: t('mode.boomerang')  },
  { id: 'hellfire',    label: t('mode.hellfire')   },
  { id: 'whirlwind',   label: t('mode.whirlwind')  },
  { id: 'chargeSlam',  label: t('mode.chargeSlam') },
  { id: 'dashPierce',  label: t('mode.dashPierce') },
  { id: 'multiHit',    label: t('mode.multiHit')   },
  { id: 'knifeThrow',  label: t('mode.knifeThrow'), unlockedBy: '6-1-2-1-2' },
  { id: 'flowerMode',  label: t('mode.flowerMode'), unlockedBy: '9-1-1-1'   },
];

export interface SkillNode {
  id:              string;
  label:           string;
  desc:            string;
  parentId?:       string;
  extraParentIds?: string[];
  x:               number;   // CSS pixels from hub center
  y:               number;
  attackMode?:     AttackModeId;
  isRoot?:         boolean;
}

// ── Node definitions ───────────────────────────────────────────────────────
// Positions in CSS pixels; UI multiplies by DPR via P().
// Hub at (0,0). Branch angles: aura=270°, projectile=310°, boomerang=350°,
// hellfire=30°, whirlwind=70°, slash180=110°, chargeSlam=150°,
// dashPierce=190°, multiHit=230°.  Radii: L1=70, L2=135, L3=200.

export const SKILL_NODES: SkillNode[] = [
  // ── Hub ──────────────────────────────────────────────────────────────────
  { id: '1', label: t('skill.1.label'), desc: t('skill.1.desc'), x: 0, y: 0, isRoot: true },

  // ── 血環 branch (270°) ───────────────────────────────────────────────────
  { id: '1-1',     label: t('skill.1-1.label'),     desc: t('skill.1-1.desc'),     x:   0, y:  -70, parentId: '1',     attackMode: 'aura' },
  { id: '1-1-1',   label: t('skill.1-1-1.label'),   desc: t('skill.1-1-1.desc'),   x:   0, y: -135, parentId: '1-1',   attackMode: 'aura' },
  { id: '1-1-1-1', label: t('skill.1-1-1-1.label'), desc: t('skill.1-1-1-1.desc'), x:   0, y: -200, parentId: '1-1-1', attackMode: 'aura' },

  // ── 風刃 branch (310°, split ±22°) ───────────────────────────────────────
  { id: '1-2',     label: t('skill.1-2.label'),     desc: t('skill.1-2.desc'),     x:  45, y:  -54, parentId: '1',     attackMode: 'projectile' },
  { id: '1-2-1',   label: t('skill.1-2-1.label'),   desc: t('skill.1-2-1.desc'),   x:  48, y: -128, parentId: '1-2',   attackMode: 'projectile' },
  { id: '1-2-1-1', label: t('skill.1-2-1-1.label'), desc: t('skill.1-2-1-1.desc'), x:  71, y: -188, parentId: '1-2-1', attackMode: 'projectile' },
  { id: '1-2-2',   label: t('skill.1-2-2.label'),   desc: t('skill.1-2-2.desc'),   x: 118, y:  -68, parentId: '1-2',   attackMode: 'projectile' },
  { id: '1-2-2-1', label: t('skill.1-2-2-1.label'), desc: t('skill.1-2-2-1.desc'), x: 174, y: -100, parentId: '1-2-2', attackMode: 'projectile' },

  // ── 迴旋飛刃 branch (350°) ────────────────────────────────────────────────
  { id: '1-3',     label: t('skill.1-3.label'),     desc: t('skill.1-3.desc'),     x:  69, y:  -12, parentId: '1',     attackMode: 'boomerang' },
  { id: '1-3-1',   label: t('skill.1-3-1.label'),   desc: t('skill.1-3-1.desc'),   x: 133, y:  -23, parentId: '1-3',   attackMode: 'boomerang' },
  { id: '1-3-1-1', label: t('skill.1-3-1-1.label'), desc: t('skill.1-3-1-1.desc'), x: 197, y:  -35, parentId: '1-3-1', attackMode: 'boomerang' },

  // ── 地獄火 branch (30°) ───────────────────────────────────────────────────
  { id: '1-4',     label: t('skill.1-4.label'),     desc: t('skill.1-4.desc'),     x:  61, y:  35, parentId: '1',     attackMode: 'hellfire' },
  { id: '1-4-1',   label: t('skill.1-4-1.label'),   desc: t('skill.1-4-1.desc'),   x: 117, y:  68, parentId: '1-4',   attackMode: 'hellfire' },
  { id: '1-4-1-1', label: t('skill.1-4-1-1.label'), desc: t('skill.1-4-1-1.desc'), x: 173, y: 100, parentId: '1-4-1', attackMode: 'hellfire' },
  { id: '1-4-2',   label: t('skill.1-4-2.label'),   desc: t('skill.1-4-2.desc'),   x: 118, y:  18, parentId: '1-4',   attackMode: 'hellfire' },
  { id: '1-4-2-1', label: t('skill.1-4-2-1.label'), desc: t('skill.1-4-2-1.desc'), x: 175, y:   5, parentId: '1-4-2', attackMode: 'hellfire' },

  // ── 旋風斬 branch (70°) ───────────────────────────────────────────────────
  { id: '1-5',     label: t('skill.1-5.label'),     desc: t('skill.1-5.desc'),     x:  24, y:  66, parentId: '1',     attackMode: 'whirlwind' },
  { id: '1-5-1',   label: t('skill.1-5-1.label'),   desc: t('skill.1-5-1.desc'),   x:  46, y: 127, parentId: '1-5',   attackMode: 'whirlwind' },
  { id: '1-5-1-1', label: t('skill.1-5-1-1.label'), desc: t('skill.1-5-1-1.desc'), x:  68, y: 188, parentId: '1-5-1', attackMode: 'whirlwind' },

  // ── 半月斬 branch (110°) ──────────────────────────────────────────────────
  { id: '1-6',     label: t('skill.1-6.label'),     desc: t('skill.1-6.desc'),     x: -24, y:  66, parentId: '1',     attackMode: 'slash180' },
  { id: '1-6-1',   label: t('skill.1-6-1.label'),   desc: t('skill.1-6-1.desc'),   x: -46, y: 127, parentId: '1-6',   attackMode: 'slash180' },
  { id: '1-6-1-1', label: t('skill.1-6-1-1.label'), desc: t('skill.1-6-1-1.desc'), x: -68, y: 188, parentId: '1-6-1', attackMode: 'slash180' },

  // ── 蓄力重擊 branch (150°) ────────────────────────────────────────────────
  { id: '1-7',     label: t('skill.1-7.label'),     desc: t('skill.1-7.desc'),     x:  -61, y:  35, parentId: '1',     attackMode: 'chargeSlam' },
  { id: '1-7-1',   label: t('skill.1-7-1.label'),   desc: t('skill.1-7-1.desc'),   x: -117, y:  68, parentId: '1-7',   attackMode: 'chargeSlam' },
  { id: '1-7-1-1', label: t('skill.1-7-1-1.label'), desc: t('skill.1-7-1-1.desc'), x: -173, y: 100, parentId: '1-7-1', attackMode: 'chargeSlam' },

  // ── 瞬步斬 branch (190°) ──────────────────────────────────────────────────
  { id: '1-8',     label: t('skill.1-8.label'),     desc: t('skill.1-8.desc'),     x:  -69, y:  -12, parentId: '1',     attackMode: 'dashPierce' },
  { id: '1-8-1',   label: t('skill.1-8-1.label'),   desc: t('skill.1-8-1.desc'),   x: -133, y:  -23, parentId: '1-8',   attackMode: 'dashPierce' },
  { id: '1-8-1-1', label: t('skill.1-8-1-1.label'), desc: t('skill.1-8-1-1.desc'), x: -197, y:  -35, parentId: '1-8-1', attackMode: 'dashPierce' },

  // ── 五連斬 branch (230°) ──────────────────────────────────────────────────
  { id: '1-9',     label: t('skill.1-9.label'),     desc: t('skill.1-9.desc'),     x:  -45, y:  -54, parentId: '1',     attackMode: 'multiHit' },
  { id: '1-9-1',   label: t('skill.1-9-1.label'),   desc: t('skill.1-9-1.desc'),   x:  -86, y: -104, parentId: '1-9',   attackMode: 'multiHit' },
  { id: '1-9-1-1', label: t('skill.1-9-1-1.label'), desc: t('skill.1-9-1-1.desc'), x: -128, y: -153, parentId: '1-9-1', attackMode: 'multiHit' },

  // ── Cluster 2: 傷害濺射 (bottom-left, 225°) ──────────────────────────────
  { id: '2',     label: t('skill.2.label'),     desc: t('skill.2.desc'),     x: -175, y:  175, isRoot: true },
  { id: '2-1',   label: t('skill.2-1.label'),   desc: t('skill.2-1.desc'),   x: -215, y:  215, parentId: '2'   },
  { id: '2-1-1', label: t('skill.2-1-1.label'), desc: t('skill.2-1-1.desc'), x: -255, y:  255, parentId: '2-1' },

  // ── Cluster 3: 召喚火球 (top-right, 45°) ─────────────────────────────────
  { id: '3',     label: t('skill.3.label'),     desc: t('skill.3.desc'),     x:  175, y: -175, isRoot: true },
  { id: '3-1',   label: t('skill.3-1.label'),   desc: t('skill.3-1.desc'),   x:  215, y: -215, parentId: '3'   },
  { id: '3-1-1', label: t('skill.3-1-1.label'), desc: t('skill.3-1-1.desc'), x:  255, y: -255, parentId: '3-1' },

  // ── Cluster 4: 召喚冰球 (top-left, 135°) ─────────────────────────────────
  { id: '4',     label: t('skill.4.label'),     desc: t('skill.4.desc'),     x: -175, y: -125, isRoot: true },
  { id: '4-1',   label: t('skill.4-1.label'),   desc: t('skill.4-1.desc'),   x: -215, y: -165, parentId: '4'   },
  { id: '4-1-1', label: t('skill.4-1-1.label'), desc: t('skill.4-1-1.desc'), x: -255, y: -205, parentId: '4-1' },

  // ── Cluster 5: 落雷 (bottom-right, 315°) ─────────────────────────────────
  { id: '5',       label: t('skill.5.label'),       desc: t('skill.5.desc'),       x:  175, y:  175, isRoot: true },
  { id: '5-1',     label: t('skill.5-1.label'),     desc: t('skill.5-1.desc'),     x:  195, y:  225, parentId: '5'     },
  { id: '5-1-1',   label: t('skill.5-1-1.label'),   desc: t('skill.5-1-1.desc'),   x:  195, y:  270, parentId: '5-1'   },
  { id: '5-1-1-1', label: t('skill.5-1-1-1.label'), desc: t('skill.5-1-1-1.desc'), x:  195, y:  315, parentId: '5-1-1' },
  { id: '5-2',     label: t('skill.5-2.label'),     desc: t('skill.5-2.desc'),     x:  225, y:  195, parentId: '5'     },
  { id: '5-2-1',   label: t('skill.5-2-1.label'),   desc: t('skill.5-2-1.desc'),   x:  270, y:  195, parentId: '5-2'   },

  // ── Cluster 6: 散射飛刀 (RIGHT) ──────────────────────────────────────────
  { id: '6',         label: t('skill.6.label'),         desc: t('skill.6.desc'),         x:  240, y:   50, isRoot: true },
  { id: '6-1',       label: t('skill.6-1.label'),       desc: t('skill.6-1.desc'),       x:  290, y:    5, parentId: '6'           },
  { id: '6-2',       label: t('skill.6-2.label'),       desc: t('skill.6-2.desc'),       x:  290, y:   50, parentId: '6'           },
  { id: '6-1-2-1',   label: t('skill.6-1-2-1.label'),   desc: t('skill.6-1-2-1.desc'),   x:  340, y:   28, parentId: '6-1', extraParentIds: ['6-2'] },
  { id: '6-1-2-1-1', label: t('skill.6-1-2-1-1.label'), desc: t('skill.6-1-2-1-1.desc'), x:  390, y:   28, parentId: '6-1-2-1'    },
  { id: '6-1-2-1-2', label: t('skill.6-1-2-1-2.label'), desc: t('skill.6-1-2-1-2.desc'), x:  440, y:   28, parentId: '6-1-2-1-1'  },

  // ── Cluster 7: 暴徒/嗜血 (LEFT) ─────────────────────────────────────────
  { id: '7',     label: t('skill.7.label'),     desc: t('skill.7.desc'),     x: -240, y:   15, isRoot: true },
  { id: '7-1',   label: t('skill.7-1.label'),   desc: t('skill.7-1.desc'),   x: -305, y:   15, parentId: '7'   },
  { id: '7-1-1', label: t('skill.7-1-1.label'), desc: t('skill.7-1-1.desc'), x: -370, y:   15, parentId: '7-1' },
  { id: '7-2',   label: t('skill.7-2.label'),   desc: t('skill.7-2.desc'),   x: -240, y:   80, isRoot: true },
  { id: '7-2-1', label: t('skill.7-2-1.label'), desc: t('skill.7-2-1.desc'), x: -305, y:   80, parentId: '7-2' },
  { id: '7-2-2', label: t('skill.7-2-2.label'), desc: t('skill.7-2-2.desc'), x: -370, y:   80, parentId: '7-2-1' },

  // ── Cluster 9: 不死花召喚 (TOP CENTER, arc shape) ────────────────────────
  { id: '9',           label: t('skill.9.label'),           desc: t('skill.9.desc'),           x: -140, y: -250, isRoot: true       },
  { id: '9-1',         label: t('skill.9-1.label'),         desc: t('skill.9-1.desc'),         x:  -95, y: -295, parentId: '9'         },
  { id: '9-1-1',       label: t('skill.9-1-1.label'),       desc: t('skill.9-1-1.desc'),       x:  -30, y: -320, parentId: '9-1'       },
  { id: '9-1-1-1',     label: t('skill.9-1-1-1.label'),     desc: t('skill.9-1-1-1.desc'),     x:   30, y: -320, parentId: '9-1-1'     },
  { id: '9-1-1-1-1',   label: t('skill.9-1-1-1-1.label'),   desc: t('skill.9-1-1-1-1.desc'),   x:   95, y: -295, parentId: '9-1-1-1'   },
  { id: '9-1-1-1-1-1', label: t('skill.9-1-1-1-1-1.label'), desc: t('skill.9-1-1-1-1-1.desc'), x:  140, y: -250, parentId: '9-1-1-1-1' },

  // ── Cluster 8: 傷害溢出 (BOTTOM CENTER) ──────────────────────────────────
  { id: '8',     label: t('skill.8.label'),     desc: t('skill.8.desc'),     x:   0, y:  240, isRoot: true },
  { id: '8-1',   label: t('skill.8-1.label'),   desc: t('skill.8-1.desc'),   x:   0, y:  305, parentId: '8'   },
  { id: '8-1-1', label: t('skill.8-1-1.label'), desc: t('skill.8-1-1.desc'), x:   0, y:  370, parentId: '8-1' },

  // ── Cluster 10: 吸血天賦 (top-right) ─────────────────────────────────────
  { id: '10',     label: t('skill.10.label'),     desc: t('skill.10.desc'),     x:  305, y:  -95, isRoot: true   },
  { id: '10-1',   label: t('skill.10-1.label'),   desc: t('skill.10-1.desc'),   x:  360, y: -135, parentId: '10'   },
  { id: '10-1-1', label: t('skill.10-1-1.label'), desc: t('skill.10-1-1.desc'), x:  415, y: -175, parentId: '10-1' },
];

export const SKILL_NODE_MAP: Record<string, SkillNode> = {};
for (const n of SKILL_NODES) SKILL_NODE_MAP[n.id] = n;

// ── Colors ─────────────────────────────────────────────────────────────────

export const MODE_COLORS: Record<string, number> = {
  aura:        0xff4444,
  projectile:  0x44ddff,
  boomerang:   0x44ffcc,
  hellfire:    0xff8844,
  whirlwind:   0x44ff66,
  slash180:    0x4488ff,
  chargeSlam:  0xcc44ff,
  dashPierce:  0xffdd44,
  multiHit:    0xff66cc,
  knifeThrow:  0xddbbff,
  flowerMode:  0x66ff88,
};

export const CLUSTER_COLORS: Record<string, number> = {
  '1': 0xd4a044,
  '2': 0x66bbff,
  '3': 0xff8844,
  '4': 0x88ccff,
  '5': 0xffee44,
  '6': 0xaaaacc,
  '7': 0xff4466,
  '8': 0xcc66ff,
  '9':  0x44ee88,
  '10': 0xcc2255,
};

export function skillNodeColor(node: SkillNode): number {
  if (node.attackMode) return MODE_COLORS[node.attackMode] ?? 0xffffff;
  const cluster = node.id.split('-')[0];
  return CLUSTER_COLORS[cluster] ?? 0xffffff;
}

// ── Save data ──────────────────────────────────────────────────────────────

export interface SkillTreeSaveData {
  learned:    string[];
  attackMode: string;
}

// ── State ──────────────────────────────────────────────────────────────────

let _learned    = new Set<string>();
let _attackMode: AttackModeId = 'projectile';

export const SkillTreeStore = {
  getTotalPoints():     number { return Math.floor(PlayerStore.getLevel() / 5); },
  getSpentPoints():     number { return _learned.size; },
  getAvailablePoints(): number { return this.getTotalPoints() - _learned.size; },

  isLearned(id: string): boolean { return id === '1' || _learned.has(id); },

  canLearn(id: string): boolean {
    if (id === '1') return false;  // hub 永遠免費，不可「學習」
    if (_learned.has(id) || this.getAvailablePoints() <= 0) return false;
    const node = SKILL_NODE_MAP[id];
    if (!node) return false;
    if (!node.parentId) return true;
    if (this.isLearned(node.parentId)) return true;
    return node.extraParentIds?.some(pid => this.isLearned(pid)) ?? false;
  },

  learn(id: string): boolean {
    if (!this.canLearn(id)) return false;
    _learned.add(id);
    return true;
  },

  resetAll(): void {
    _learned.clear();
    _attackMode = 'slash180';
  },

  /** 將已學技能轉換為 StatBonus，由 CardStore.getTotalStats() 合併使用 */
  getBonus(): StatBonus {
    const L = (id: string) => _learned.has(id);
    return {
      // ── 地獄火 ────────────────────────────────────────────
      dotBonus:           (L('1-4') ? 0.15 : 0),
      burnMaxStackBonus:  (L('1-4-1') ? 5 : 0),
      burnDoubleStack:    (L('1-4-1-1') ? 1 : 0),
      burnSpreadSkillPx:  L('1-4-2-1') ? 40 : L('1-4-2') ? 12 : 0,
      // ── 血環 ──────────────────────────────────────────────
      auraRadiusPct:    (L('1-1') ? 0.15 : 0) + (L('1-1-1') ? 0.25 : 0),
      auraDmgPct:       (L('1-1-1-1') ? 0.30 : 0),
      // ── 五連斬 ────────────────────────────────────────────
      multiHitDmgPct:    (L('1-9') ? 0.10 : 0) + (L('1-9-1') ? 0.25 : 0),
      multiHitNoStagger: (L('1-9-1-1') ? 1 : 0),
      // ── 瞬步斬 ────────────────────────────────────────────
      dashDistPct:          (L('1-8') ? 0.30 : 0),
      dashDmgPct:           (L('1-8-1') ? 0.30 : 0),
      dashDoubleHit:        (L('1-8-1-1') ? 1 : 0),
      // ── 蓄力重擊 ──────────────────────────────────────────
      chargeSlamStunChance: (L('1-7') ? 0.50 : 0),
      chargeSlamDmgPct:     (L('1-7-1') ? 0.25 : 0),
      chargeSlamOverload:   (L('1-7-1-1') ? 1 : 0),
      // ── 半月斬 ────────────────────────────────────────────
      slash180DmgPct:       (L('1-6') ? 0.10 : 0) + (L('1-6-1') ? 0.15 : 0) + (L('1-6-1-1') ? 0.20 : 0),
      // ── 旋風斬 ────────────────────────────────────────────
      whirlwindRangePct:    (L('1-5') ? 0.10 : 0) + (L('1-5-1') ? 0.20 : 0),
      whirlwindDmgPct:      (L('1-5-1-1') ? 0.30 : 0),
      // ── 迴旋飛刃 ──────────────────────────────────────────
      boomerangRangePct:    (L('1-3') ? 0.15 : 0) + (L('1-3-1') ? 0.15 : 0),
      boomerangDmgPct:      (L('1-3-1-1') ? 0.20 : 0),
      // ── 呼喚雷霆 ──────────────────────────────────────────
      lightningStrike:            (L('5') ? 1 : 0) + (L('5-1') ? 1 : 0),
      lightningDmgBonus:          (L('5-1-1') ? 0.40 : 0) + (L('5-1-1-1') ? 0.90 : 0),
      lightningSingleTarget:      (L('5-1-1-1') ? 1 : 0),
      lightningIntervalReduction: (L('5-2') ? 400 : 0) + (L('5-2-1') ? 700 : 0),
      // ── 傷害溢出 ──────────────────────────────────────────
      overkillSplash:        (L('8') ? 1 : 0),
      overkillInfiniteChain: (L('8-1') ? 1 : 0),
      overkillDmgPct:        (L('8-1-1') ? 0.20 : 0),
      // ── 暴徒本能（爆擊→傷害）─────────────────────────────
      bloodlust:                  (L('7') ? 1 : 0),
      bloodlustDmgPerStack:       (L('7') ? 0.005 : 0) + (L('7-1') ? 0.010 : 0),
      bloodlustMaxStacks:         (L('7') ? 5 : 0) + (L('7-1-1') ? 5 : 0),
      // ── 嗜血本能（命中→攻速）─────────────────────────────
      sanguine:                   (L('7-2') ? 1 : 0),
      sanguineMaxStacks:          (L('7-2') ? 5 : 0) + (L('7-2-2') ? 5 : 0),
      bloodlustAtkSpeedPerStack:  (L('7-2') ? 0.015 : 0) + (L('7-2-1') ? 0.010 : 0),
      // ── 傷害濺射 ──────────────────────────────────────────
      damageSplash:          (L('2') ? 1 : 0),
      damageSplashPct:       (L('2') ? 0.10 : 0) + (L('2-1') ? 0.10 : 0),
      damageSplashCount:     (L('2') ? 3 : 0) + (L('2-1-1') ? 3 : 0),
      // ── 風刃 ──────────────────────────────────────────────
      projectileDistPct:    (L('1-2') ? 0.10 : 0) + (L('1-2-1') ? 0.20 : 0),
      projectileDmgPct:     (L('1-2-1-1') ? 0.30 : 0) + (L('1-2-2-1') ? 0.20 : 0),
      projectileFan:        (L('1-2-2') ? 1 : 0),
      // ── 散射飛刀 ──────────────────────────────────────────
      periodicKnives:          (L('6') ? 1 : 0),
      knifeIntervalReduction:  (L('6-1') ? 2000 : 0),
      knifeDoubleCount:        (L('6-2') ? 1 : 0),
      knifeHoming:             (L('6-1-2-1-1') ? 1 : 0),
      knifeDmgPct:             (L('6-1-2-1') ? 0.15 : 0) + (L('6-1-2-1-2') ? 0.35 : 0),
      // ── 召喚火球 ──────────────────────────────────────────
      orbitFireBalls:       (L('3') ? 2 : 0) + (L('3-1-1') ? 2 : 0),
      // ── 召喚冰球 ──────────────────────────────────────────
      orbitIceBalls:        (L('4') ? 2 : 0) + (L('4-1-1') ? 2 : 0),
      // ── 火球/冰球各自強化 ────────────────────────────────
      orbitFireBallDmgPct:  (L('3-1') ? 0.30 : 0),
      orbitIceBallDmgPct:   (L('4-1') ? 0.30 : 0),
      // ── 不死花召喚 ────────────────────────────────────
      skillFlowerChance:    (L('9') && !L('9-1-1-1') ? 0.065 : 0),
      skillFlowerCap:       (L('9') ? 1 : 0) + (L('9-1-1') ? 1 : 0) + (L('9-1-1-1-1-1') ? 1 : 0),
      skillFlowerHpPct:     (L('9-1-1-1-1') ? 1.50 : 0),
      summonFlowerDmgPct:   (L('9-1') ? 0.30 : 0) + (L('9-1-1-1') ? 0.50 : 0),
      // ── 吸血天賦 ──────────────────────────────────────
      lifesteal:          (L('10') ? 0.003 : 0) + (L('10-1') ? 0.005 : 0),
      lifestealInstant:   (L('10-1-1') ? 1 : 0),
    };
  },

  getAttackMode():             AttackModeId { return _attackMode; },
  setAttackMode(m: AttackModeId): void      { _attackMode = m; },

  getSaveData(): SkillTreeSaveData {
    return { learned: [..._learned], attackMode: _attackMode };
  },

  loadSaveData(data: SkillTreeSaveData): void {
    if (data?.learned)     _learned    = new Set(data.learned);
    if (data?.attackMode)  _attackMode = data.attackMode as AttackModeId;
  },
};
