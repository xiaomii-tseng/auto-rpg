import { MONSTER_DEFS } from './monster-data';
import { PlayerStore } from './player-store';
import { generateEquipment, randomQuality, EquipmentItem, EquipSlot } from './equipment-data';

export type QuestStatus = 'available' | 'accepted' | 'completed' | 'claimed';

export interface Quest {
  id:            string;
  bossId:        string;
  reward:        number;
  flavorText:    string;
  status:        QuestStatus;
  star:          number;   // 1~5
  isEquipReward: boolean;
}

export interface QuestSaveData {
  quests: Quest[];
}

// ── Star system constants ──────────────────────────────────────────────────

export const STAR_UNLOCK_LEVEL: Record<number, number> = {
  1: 1, 2: 3, 3: 7, 4: 11, 5: 16,
};

export const STAR_REWARD_MULT: Record<number, number> = {
  1: 1.0, 2: 1.5, 3: 2.2, 4: 3.0, 5: 4.0,
};

export const STAR_STAT_MULT: Record<number, number> = {
  1: 1.0, 2: 1.5, 3: 2.2, 4: 3.2, 5: 4.5,
};

export const STAR_BOSS_DMG_MULT: Record<number, number> = {
  1: 1.0, 2: 1.5, 3: 2.2, 4: 3.2, 5: 5.0,
};

export const STAR_HP_MULT: Record<number, number> = {
  1: 1.0, 2: 2.5, 3: 6.0, 4: 10.5, 5: 16.0,
};

export const STAR_DROP_MULT: Record<number, number> = {
  1: 1.0, 2: 1.3, 3: 1.7, 4: 2.2, 5: 3.0,
};

export const STAR_DEF_MULT: Record<number, number> = {
  1: 0.6, 2: 1.2, 3: 2.2, 4: 3.5, 5: 4.5,
};

export const STAR_EXP_MULT: Record<number, number> = {
  1: 1.0, 2: 1.4, 3: 2.0, 4: 2.8, 5: 3.8,
};

// Equipment quality weights by star (for quest equip rewards)
export const STAR_EQUIP_QUALITY: Record<number, Record<string, number>> = {
  1: { normal: 0.70, good: 0.30, fine: 0.00 },
  2: { normal: 0.55, good: 0.35, fine: 0.10 },
  3: { normal: 0.35, good: 0.35, fine: 0.25 },
  4: { normal: 0.15, good: 0.30, fine: 0.45 },
  5: { normal: 0.00, good: 0.25, fine: 0.50 },
};

function smoothStep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

// Smooth probability weights per star by player level (no hard gates)
export function getStarWeights(level: number): Record<number, number> {
  const ss = smoothStep;
  return {
    1: Math.max(0.1, 5 - 4 * ss(1, 35, level)),
    2: Math.max(0,   5 * ss(5, 14, level) - 3 * ss(18, 38, level)),
    3: Math.max(0,   4 * ss(14, 25, level) - 1 * ss(32, 50, level)),
    4: Math.max(0,   5 * ss(26, 40, level)),
    5: Math.max(0,   4 * ss(38, 48, level)),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

const BOSS_POOL = [
  'boss_slime_green',
  'boss_slime_red',
  'boss_slime_blue',
  'boss_slime_white',
  'boss_zombie_slime',
  'boss_lava_slime',
  'boss_flower_two',
  'boss_flower_one',
  'boss_flower_three',
];

const BOSS_MIN_STAR: Record<string, number> = {
  boss_flower_one:   2,
  boss_flower_two:   2,
  boss_flower_three: 2,
};

const FLAVOR_TEMPLATES: Array<(name: string, star: number) => string> = [
  (n, s) => `國王下令：${n}橫行東方森林，急需${s >= 3 ? '精英' : ''}勇者前往討伐！`,
  (n)    => `懸賞通告：北方山脈出現${n}，嚴重威脅居民安全。`,
  (n)    => `緊急召集：${n}侵擾邊境村莊，徵召勇者出征！`,
  (n)    => `王室令：${n}盤踞古代遺跡阻斷商道，懸賞討伐。`,
  (n)    => `民間疾苦：${n}為禍西部荒野，勇者速往解決！`,
  (n)    => `冒險者公會：消滅出沒於南方沼澤的${n}。`,
  (n, s) => `急件！${s >= 4 ? '【高危】' : ''}${n}對王都周邊村莊發動突襲，請速馳援。`,
  (n, s) => `邊境守備隊求援：${s >= 3 ? '強化版' : ''}${n}攻佔了要塞入口，危在旦夕！`,
];

function pickStar(playerLevel: number): number {
  const weights = getStarWeights(playerLevel);
  const stars   = [1, 2, 3, 4, 5];
  const total   = stars.reduce((s, star) => s + weights[star], 0);
  let roll = Math.random() * total;
  for (const star of stars) {
    roll -= weights[star];
    if (roll <= 0) return star;
  }
  return 5;
}

function generateQuests(): Quest[] {
  const playerLevel = PlayerStore.getLevel();
  const maxNaturalStar = Math.max(...Object.entries(getStarWeights(playerLevel))
    .filter(([, w]) => w > 0).map(([s]) => Number(s)));
  const eligiblePool = BOSS_POOL.filter(id => (BOSS_MIN_STAR[id] ?? 1) <= maxNaturalStar);
  const pool = eligiblePool.length >= 3 ? eligiblePool : BOSS_POOL;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const picked   = shuffled.slice(0, 3);

  return picked.map((bossId, i) => {
    const def  = MONSTER_DEFS.find(m => m.id === bossId)!;
    const tmpl = FLAVOR_TEMPLATES[Math.floor(Math.random() * FLAVOR_TEMPLATES.length)];
    const star = Math.max(BOSS_MIN_STAR[bossId] ?? 1, pickStar(playerLevel));
    const base = (Math.floor(Math.random() * 21) + 30) * 10;
    const reward = Math.round(base * STAR_REWARD_MULT[star] / 10) * 10;

    return {
      id:            `q_${Date.now()}_${i}`,
      bossId,
      reward,
      flavorText:    tmpl(def.name, star),
      status:        'available' as QuestStatus,
      star,
      isEquipReward: false,
    };
  });
}

// ── Store ──────────────────────────────────────────────────────────────────

let _quests: Quest[] = [];
const _listeners: Array<() => void> = [];

// 裝備獎勵選項 cache：同一張任務每次打開 modal 顯示相同三件裝備
const _equipOptionsCache = new Map<string, EquipmentItem[]>();
const EQUIP_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'ring2', 'sword'];

export const QuestStore = {
  getQuests(): Quest[] {
    if (_quests.length === 0) _quests = generateQuests();
    return _quests;
  },

  acceptQuest(questId: string): void {
    _quests.forEach(q => { if (q.status === 'accepted') q.status = 'available'; });
    const q = _quests.find(q => q.id === questId);
    if (q && q.status === 'available') { q.status = 'accepted'; this.notify(); }
  },

  getAcceptedQuest(): Quest | undefined {
    return _quests.find(q => q.status === 'accepted');
  },

  completeQuestByBoss(bossId: string): boolean {
    const q = _quests.find(q => q.bossId === bossId && q.status === 'accepted');
    if (q) { q.status = 'completed'; this.notify(); return true; }
    return false;
  },

  getEquipOptions(questId: string): EquipmentItem[] {
    if (!_equipOptionsCache.has(questId)) {
      const q = _quests.find(q => q.id === questId);
      if (!q) return [];
      const weights    = STAR_EQUIP_QUALITY[q.star] ?? {};
      const pickedSlots = [...EQUIP_SLOTS].sort(() => Math.random() - 0.5).slice(0, 3);
      _equipOptionsCache.set(questId, pickedSlots.map(s =>
        generateEquipment(s, randomQuality(weights as Record<string, number>)),
      ));
    }
    return _equipOptionsCache.get(questId)!;
  },

  claimQuest(questId: string): number {
    const idx = _quests.findIndex(q => q.id === questId && q.status === 'completed');
    if (idx === -1) return 0;
    const reward = _quests[idx].reward;
    _equipOptionsCache.delete(questId);
    this.dismissQuest(questId);
    return reward;
  },

  abandonQuest(questId: string): void {
    const q = _quests.find(q => q.id === questId && q.status === 'accepted');
    if (q) { q.status = 'available'; this.notify(); }
  },

  dismissQuest(questId: string): void {
    const idx = _quests.findIndex(q => q.id === questId && q.status !== 'accepted');
    if (idx === -1) return;
    _equipOptionsCache.delete(questId);
    const playerLevel = PlayerStore.getLevel();
    const maxNaturalStar = Math.max(...Object.entries(getStarWeights(playerLevel))
      .filter(([, w]) => w > 0).map(([s]) => Number(s)));
    const eligiblePool = BOSS_POOL.filter(id => (BOSS_MIN_STAR[id] ?? 1) <= maxNaturalStar);
    const pool    = eligiblePool.length >= 1 ? eligiblePool : BOSS_POOL;
    const used    = _quests.filter((_, i) => i !== idx).map(q => q.bossId);
    const choices = pool.filter(id => !used.includes(id));
    const bossId  = choices.length > 0
      ? choices[Math.floor(Math.random() * choices.length)]
      : pool[Math.floor(Math.random() * pool.length)];
    const def    = MONSTER_DEFS.find(m => m.id === bossId)!;
    const star   = Math.max(BOSS_MIN_STAR[bossId] ?? 1, pickStar(PlayerStore.getLevel()));
    const base   = (Math.floor(Math.random() * 21) + 30) * 10;
    const tmpl   = FLAVOR_TEMPLATES[Math.floor(Math.random() * FLAVOR_TEMPLATES.length)];
    _quests[idx] = {
      id: `q_${Date.now()}_r`,
      bossId,
      reward: Math.round(base * STAR_REWARD_MULT[star] / 10) * 10,
      flavorText: tmpl(def.name, star),
      status: 'available',
      star,
      isEquipReward: false,
    };
    this.notify();
  },

  rerollQuests(): void {
    _equipOptionsCache.clear();
    _quests = generateQuests();
    this.notify();
  },

  // ── Persistence ────────────────────────────────────────

  getSaveData(): QuestSaveData {
    return { quests: _quests.map(q => ({ ...q })) };
  },

  loadSaveData(data: QuestSaveData): void {
    if (data?.quests?.length)
      _quests = data.quests.map(q => ({ ...q, star: q.star ?? 1, isEquipReward: q.isEquipReward ?? false }));
  },

  onChange(fn: () => void): void  { _listeners.push(fn); },
  offChange(fn: () => void): void {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  },
  notify(): void { _listeners.forEach(fn => fn()); },
};
