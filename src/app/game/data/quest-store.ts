import { MONSTER_DEFS } from './monster-data';
import { PlayerStore } from './player-store';

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

export const STAR_HP_MULT: Record<number, number> = {
  1: 1.0, 2: 2.5, 3: 6.0, 4: 10.5, 5: 16.0,
};

export const STAR_DROP_MULT: Record<number, number> = {
  1: 1.0, 2: 1.3, 3: 1.7, 4: 2.2, 5: 3.0,
};

// Equipment quality weights by star (for quest equip rewards)
export const STAR_EQUIP_QUALITY: Record<number, Record<string, number>> = {
  1: { normal: 0.60, good: 0.30, fine: 0.10, perfect: 0.00 },
  2: { normal: 0.40, good: 0.40, fine: 0.18, perfect: 0.02 },
  3: { normal: 0.20, good: 0.40, fine: 0.30, perfect: 0.10 },
  4: { normal: 0.05, good: 0.25, fine: 0.50, perfect: 0.20 },
  5: { normal: 0.00, good: 0.10, fine: 0.50, perfect: 0.40 },
};

// Weight for each star when picking quest difficulty (higher = more frequent)
const STAR_WEIGHT: Record<number, number> = {
  1: 5, 2: 4, 3: 3, 4: 2, 5: 1,
};

// ── Helpers ────────────────────────────────────────────────────────────────

const BOSS_POOL = [
  'boss_zombie_slime',
];

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
  const available = Object.entries(STAR_UNLOCK_LEVEL)
    .filter(([, req]) => playerLevel >= req)
    .map(([star]) => Number(star));

  const totalWeight = available.reduce((s, star) => s + STAR_WEIGHT[star], 0);
  let roll = Math.random() * totalWeight;
  for (const star of available) {
    roll -= STAR_WEIGHT[star];
    if (roll <= 0) return star;
  }
  return available[available.length - 1];
}

function generateQuests(): Quest[] {
  const playerLevel = PlayerStore.getLevel();
  const shuffled    = [...BOSS_POOL].sort(() => Math.random() - 0.5);
  const picked      = shuffled.slice(0, 3);

  return picked.map((bossId, i) => {
    const def  = MONSTER_DEFS.find(m => m.id === bossId)!;
    const tmpl = FLAVOR_TEMPLATES[Math.floor(Math.random() * FLAVOR_TEMPLATES.length)];
    const star = pickStar(playerLevel);
    const base = (Math.floor(Math.random() * 21) + 30) * 10;
    const reward = Math.round(base * STAR_REWARD_MULT[star] / 10) * 10;

    const isEquipReward = Math.random() < 0.20;
    return {
      id:            `q_${Date.now()}_${i}`,
      bossId,
      reward:        isEquipReward ? 0 : reward,
      flavorText:    tmpl(def.name, star),
      status:        'available' as QuestStatus,
      star,
      isEquipReward,
    };
  });
}

// ── Store ──────────────────────────────────────────────────────────────────

let _quests: Quest[] = [];
const _listeners: Array<() => void> = [];

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

  claimQuest(questId: string): number {
    const idx = _quests.findIndex(q => q.id === questId && q.status === 'completed');
    if (idx === -1) return 0;
    const reward = _quests[idx].reward;
    // 直接用新任務替換，不需要消耗重製券
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
    const playerLevel = PlayerStore.getLevel();
    const [replacement] = [...Array(1)].map(() => {
      const pool    = ['boss_slime_white'];
      const used    = _quests.filter((_, i) => i !== idx).map(q => q.bossId);
      const choices = pool.filter(id => !used.includes(id));
      const bossId  = choices[Math.floor(Math.random() * choices.length)] ?? pool[0];
      const def     = MONSTER_DEFS.find(m => m.id === bossId)!;
      const star    = (() => {
        const available = Object.entries(STAR_UNLOCK_LEVEL)
          .filter(([, req]) => playerLevel >= req).map(([s]) => Number(s));
        const total = available.reduce((s, st) => s + ({ 1:5,2:4,3:3,4:2,5:1 } as Record<number,number>)[st], 0);
        let roll = Math.random() * total;
        for (const st of available) { roll -= ({ 1:5,2:4,3:3,4:2,5:1 } as Record<number,number>)[st]; if (roll <= 0) return st; }
        return available[available.length - 1];
      })();
      const base = (Math.floor(Math.random() * 21) + 30) * 10;
      const isEquipReward = Math.random() < 0.20;
      const FLAVOR_TEMPLATES: Array<(name: string, star: number) => string> = [
        (n, s) => `國王下令：${n}橫行東方森林，急需${s >= 3 ? '精英' : ''}勇者前往討伐！`,
        (n)    => `懸賞通告：北方山脈出現${n}，嚴重威脅居民安全。`,
        (n)    => `緊急召集：${n}侵擾邊境村莊，徵召勇者出征！`,
      ];
      const tmpl = FLAVOR_TEMPLATES[Math.floor(Math.random() * FLAVOR_TEMPLATES.length)];
      return {
        id: `q_${Date.now()}_r`,
        bossId,
        reward: isEquipReward ? 0 : Math.round(base * STAR_REWARD_MULT[star] / 10) * 10,
        flavorText: tmpl(def.name, star),
        status: 'available' as QuestStatus,
        star,
        isEquipReward,
      };
    });
    _quests[idx] = replacement;
    this.notify();
  },

  rerollQuests(): void {
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
