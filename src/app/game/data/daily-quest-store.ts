import { PlayerStore } from './player-store';
import { CARD_DEFS, MONSTER_DEFS } from './monster-data';
import { generateEquipment, randomQuality, EquipmentItem, EquipSlot } from './equipment-data';
import { getMaxNaturalStar, BOSS_MIN_STAR, STAR_EQUIP_QUALITY } from './quest-store';

export type DailyQuestType =
  | 'kill_normal' | 'kill_elite' | 'kill_boss' | 'kill_specific'
  | 'deal_damage' | 'clear_no_death' | 'clear_no_potion'
  | 'pickup_loot' | 'open_chest'
  | 'enhance_success' | 'shop_purchase' | 'use_potion';

export type DailyQuestDifficulty = 'easy' | 'normal' | 'hard';
export type DailyQuestStatus = 'active' | 'completed' | 'claimed';

export interface DailyReward {
  gold?:      number;
  items?:     { id: string; name: string; qty: number }[];
  cardId?:    string;
  cardName?:  string;
  equip?:     EquipmentItem;
}

export interface DailyQuest {
  id:                string;
  type:              DailyQuestType;
  difficulty:        DailyQuestDifficulty;
  label:             string;
  target:            number;
  progress:          number;
  status:            DailyQuestStatus;
  reward:            DailyReward;
  specificType?:     'normal' | 'elite' | 'boss';
  specificMonsterId?: string;
}

interface QuestTemplate {
  type:          DailyQuestType;
  target:        number;
  label:         string;
  specificType?: 'normal' | 'elite' | 'boss';
}

const EASY_POOL: QuestTemplate[] = [
  { type: 'kill_normal',    target: 50,    label: '擊殺 50 隻普通怪' },
  { type: 'kill_specific',  target: 40,    label: '擊殺 40 隻普通怪（指定）', specificType: 'normal' },
  { type: 'kill_elite',     target: 5,     label: '擊殺 5 隻精英怪' },
  { type: 'kill_boss',      target: 1,     label: '擊殺 1 隻 BOSS' },
  { type: 'deal_damage',    target: 0,     label: '累計造成 {lv}×1000 點傷害' },
  { type: 'clear_no_death', target: 1,     label: '不死亡通關 1 場' },
  { type: 'pickup_loot',    target: 30,    label: '拾取 30 個掉落物' },
  { type: 'open_chest',     target: 5,     label: '開啟 5 個寶箱' },
  { type: 'enhance_success',target: 2,     label: '精煉成功 2 次' },
  { type: 'shop_purchase',  target: 3,     label: '在商店購買 3 次' },
  { type: 'use_potion',     target: 5,     label: '使用藥水 5 次' },
];

const NORMAL_POOL: QuestTemplate[] = [
  { type: 'kill_normal',    target: 120,    label: '擊殺 120 隻普通怪' },
  { type: 'kill_specific',  target: 8,      label: '擊殺 8 隻精英怪（指定）', specificType: 'elite' },
  { type: 'kill_elite',     target: 12,     label: '擊殺 12 隻精英怪' },
  { type: 'kill_boss',      target: 2,      label: '擊殺 2 隻 BOSS' },
  { type: 'deal_damage',    target: 0,      label: '累計造成 {lv}×1000 點傷害' },
  { type: 'clear_no_death', target: 2,      label: '不死亡通關 2 場' },
  { type: 'clear_no_potion',target: 1,      label: '不使用藥水通關 1 場' },
  { type: 'pickup_loot',    target: 60,     label: '拾取 60 個掉落物' },
  { type: 'open_chest',     target: 12,     label: '開啟 12 個寶箱' },
  { type: 'enhance_success',target: 5,      label: '精煉成功 5 次' },
  { type: 'shop_purchase',  target: 6,      label: '在商店購買 6 次' },
  { type: 'use_potion',     target: 12,     label: '使用藥水 12 次' },
];

const HARD_POOL: QuestTemplate[] = [
  { type: 'kill_normal',    target: 220,    label: '擊殺 220 隻普通怪' },
  { type: 'kill_specific',  target: 2,      label: '擊殺 2 隻 BOSS（指定）', specificType: 'boss' },
  { type: 'kill_elite',     target: 25,     label: '擊殺 25 隻精英怪' },
  { type: 'kill_boss',      target: 3,      label: '擊殺 3 隻 BOSS' },
  { type: 'deal_damage',    target: 0,      label: '累計造成 {lv}×1000 點傷害' },
  { type: 'clear_no_death', target: 3,      label: '不死亡通關 3 場' },
  { type: 'pickup_loot',    target: 100,    label: '拾取 100 個掉落物' },
  { type: 'open_chest',     target: 20,     label: '開啟 20 個寶箱' },
  { type: 'enhance_success',target: 10,     label: '精煉成功 10 次' },
  { type: 'shop_purchase',  target: 10,     label: '在商店購買 10 次' },
  { type: 'use_potion',     target: 20,     label: '使用藥水 20 次' },
];

const EQUIP_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'sword'];

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getAccessibleFamilies(maxStar: number): Set<string> {
  const families = new Set<string>();
  for (const card of CARD_DEFS) {
    if (card.cardType !== 'b') continue;
    const minStar = (BOSS_MIN_STAR as Record<string, number>)[card.monsterId] ?? 1;
    if (minStar <= maxStar) families.add(card.family);
  }
  return families;
}

function pickCard(difficulty: DailyQuestDifficulty): { cardId: string; cardName: string } {
  const level   = PlayerStore.getLevel();
  const maxStar = getMaxNaturalStar(level);
  const families = getAccessibleFamilies(maxStar);

  let tier: 'n' | 'e' | 'b';
  if (difficulty === 'easy') {
    tier = 'n';
  } else if (difficulty === 'normal') {
    tier = Math.random() < (85 / 98) ? 'n' : 'e';
  } else {
    const r = Math.random();
    tier = r < 0.85 ? 'n' : r < 0.98 ? 'e' : 'b';
  }

  let pool = CARD_DEFS.filter(c => c.cardType === tier && families.has(c.family));
  if (pool.length === 0) pool = CARD_DEFS.filter(c => c.cardType === tier);
  if (pool.length === 0) pool = CARD_DEFS;
  const picked = pool[Math.floor(Math.random() * pool.length)];
  return { cardId: picked.id, cardName: picked.name };
}

function pickEquip(difficulty: 'normal' | 'hard'): EquipmentItem {
  const level   = PlayerStore.getLevel();
  const maxStar = getMaxNaturalStar(level);
  const base    = { ...(STAR_EQUIP_QUALITY[maxStar] ?? { normal: 1, good: 0, fine: 0 }) };
  if (difficulty === 'hard') base['normal'] = 0;
  const slot = EQUIP_SLOTS[Math.floor(Math.random() * EQUIP_SLOTS.length)];
  return generateEquipment(slot, randomQuality(base));
}

function buildReward(difficulty: DailyQuestDifficulty): DailyReward {
  if (difficulty === 'easy') {
    const r = Math.floor(Math.random() * 4);
    if (r === 0) return { gold: 1000 };
    if (r === 1) return { items: [{ id: 'stone_broken', name: '破損強化石', qty: 3 }] };
    if (r === 2) return { gold: 200, items: [{ id: 'potion_health_m', name: '中型回復藥水', qty: 1 }] };
    const { cardId, cardName } = pickCard('easy');
    return { cardId, cardName };
  }
  if (difficulty === 'normal') {
    const r = Math.floor(Math.random() * 6);
    if (r === 0) return { gold: 2000 };
    if (r === 1) return { items: [{ id: 'stone_broken', name: '破損強化石', qty: 5 }] };
    if (r === 2) return { gold: 500, items: [{ id: 'stone_intact', name: '完整強化石', qty: 1 }] };
    if (r === 3) return { gold: 500, items: [{ id: 'potion_health_l', name: '大型回復藥水', qty: 1 }] };
    if (r === 4) { const { cardId, cardName } = pickCard('normal'); return { cardId, cardName }; }
    return { equip: pickEquip('normal') };
  }
  // hard
  const r = Math.floor(Math.random() * 6);
  if (r === 0) return { gold: 3000 };
  if (r === 1) return { items: [{ id: 'stone_intact', name: '完整強化石', qty: 3 }] };
  if (r === 2) return { gold: 1000, items: [{ id: 'stone_guard', name: '重鑄石', qty: 1 }] };
  if (r === 3) return { gold: 300, items: [{ id: 'potion_revive', name: '復活藥水', qty: 1 }] };
  if (r === 4) { const { cardId, cardName } = pickCard('hard'); return { cardId, cardName }; }
  return { equip: pickEquip('hard') };
}

function pickFrom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

const ALL_POOLS: [DailyQuestDifficulty, QuestTemplate[]][] = [
  ['easy', EASY_POOL], ['normal', NORMAL_POOL], ['hard', HARD_POOL],
];

function pickSpecificMonster(specificType: 'normal' | 'elite' | 'boss'): { id: string; name: string } {
  let candidates = MONSTER_DEFS.filter(m =>
    specificType === 'normal' ? (m.tier >= 1 && m.tier < 3) :
    specificType === 'elite'  ? (m.tier >= 3 && m.tier < 5) :
                                 m.tier === 5,
  );
  if (candidates.length === 0) candidates = MONSTER_DEFS;
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return { id: picked.id, name: picked.name };
}

function generateQuests(): DailyQuest[] {
  return Array.from({ length: 3 }, () => {
    const [diff, pool] = ALL_POOLS[Math.floor(Math.random() * ALL_POOLS.length)];
    const tmpl = pickFrom(pool);
    let label = tmpl.label;
    let specificMonsterId: string | undefined;
    if (tmpl.type === 'kill_specific' && tmpl.specificType) {
      const monster = pickSpecificMonster(tmpl.specificType);
      specificMonsterId = monster.id;
      label = `擊殺 ${tmpl.target} 隻 ${monster.name}`;
    }
    let target = tmpl.target;
    if (tmpl.type === 'deal_damage') {
      target = PlayerStore.getLevel() * 1000;
      label  = `累計造成 ${target.toLocaleString()} 點傷害`;
    }
    return {
      id:                `dq_${diff}_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type:              tmpl.type,
      difficulty:        diff,
      label,
      target,
      progress:          0,
      status:            'active' as DailyQuestStatus,
      reward:            buildReward(diff),
      specificType:      tmpl.specificType,
      specificMonsterId,
    };
  });
}

// ── Persistence ────────────────────────────────────────────────────────────

export interface DailyQuestSaveData {
  date:   string;
  quests: DailyQuest[];
}

let _date:   string       = '';
let _quests: DailyQuest[] = [];
const _listeners: Array<() => void> = [];

export const DailyQuestStore = {
  getQuests(): DailyQuest[] {
    const today = todayStr();
    if (_date !== today || _quests.length === 0) {
      _date   = today;
      _quests = generateQuests();
      this.notify();
    }
    return _quests;
  },

  addProgress(type: DailyQuestType, amount: number, monsterId?: string): void {
    this.getQuests();
    let changed = false;
    for (const q of _quests) {
      if (q.status !== 'active') continue;
      let matches = q.type === type;
      if (q.type === 'kill_specific') {
        matches = q.specificMonsterId
          ? !!(monsterId && monsterId === q.specificMonsterId)
          : (type === 'kill_normal' && q.specificType === 'normal') ||
            (type === 'kill_elite'  && q.specificType === 'elite')  ||
            (type === 'kill_boss'   && q.specificType === 'boss');
      }
      if (!matches) continue;
      q.progress = Math.min(q.target, q.progress + amount);
      if (q.progress >= q.target) q.status = 'completed';
      changed = true;
    }
    if (changed) this.notify();
  },

  hasCompletedUnclaimed(): boolean {
    return this.getQuests().some(q => q.status === 'completed');
  },

  claimQuest(id: string): DailyReward | null {
    const q = _quests.find(q => q.id === id && q.status === 'completed');
    if (!q) return null;
    q.status = 'claimed';
    this.notify();
    return q.reward;
  },

  getSaveData(): DailyQuestSaveData {
    return { date: _date, quests: _quests.map(q => ({ ...q })) };
  },

  loadSaveData(data: DailyQuestSaveData): void {
    if (!data?.quests?.length) return;
    const today = todayStr();
    if (data.date !== today) return; // expired → will regenerate on next getQuests()
    _date   = data.date;
    _quests = data.quests;
  },

  onChange(fn: () => void): void  { _listeners.push(fn); },
  offChange(fn: () => void): void {
    const i = _listeners.indexOf(fn);
    if (i !== -1) _listeners.splice(i, 1);
  },
  notify(): void { _listeners.forEach(fn => fn()); },
};
