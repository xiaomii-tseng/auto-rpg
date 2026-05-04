import { EquipmentItem, EquipSlot, getItemStats } from './equipment-data';

export const BASE_ATK        = 30;
export const BASE_HP         = 80;
export const BASE_SPEED      = 120;
export const BASE_DEF        = 0;
export const BASE_CRIT       = 0;
export const BASE_ATTACK_ARC = 180;

const LEVEL_ATK = 1;
const LEVEL_HP  = 10;

export interface EffectiveStats {
  atk:       number;
  maxHp:     number;
  speed:     number;
  def:       number;
  crit:      number;
  attackArc: number;
  atkSpeed:  number;
  lifesteal: number;
  evasion:   number;
  critDmg:   number;
  hpRegen:   number;
}

type EquippedMap = { [K in EquipSlot]: EquipmentItem | null };

const equipped: EquippedMap = {
  hat:    null,
  outfit: null,
  shoes:  null,
  ring1:  null,
  ring2:  null,
  sword:  null,
};

let level = 1;
let exp   = 0;
const owned:     EquipmentItem[] = [];
const listeners: Array<() => void> = [];

export const PlayerStore = {
  // ── Level / Exp ────────────────────────────────────────

  getLevel(): number { return level; },
  getExp():   number { return exp; },

  expToNext(lv = level): number { return Math.round(1000 * Math.pow(1.05, lv - 1)); },

  addExp(amount: number): number {
    exp += amount;
    let levelsGained = 0;
    while (exp >= PlayerStore.expToNext()) {
      exp -= PlayerStore.expToNext();
      level++;
      levelsGained++;
    }
    this.notify();
    return levelsGained;
  },

  // ── Internal load helpers (used by SaveStore only) ────

  setLevelExp(lv: number, ex: number): void {
    level = lv;
    exp   = ex;
  },

  equipDirect(slot: EquipSlot, item: EquipmentItem): void {
    equipped[slot] = item;
  },

  // ── Owned (received from quests, not yet equipped) ────

  addOwned(item: EquipmentItem): void {
    owned.push(item);
    this.notify();
  },

  getOwned(): ReadonlyArray<EquipmentItem> {
    return owned;
  },

  // ── Equipment ──────────────────────────────────────────

  equip(item: EquipmentItem): void {
    const idx = owned.indexOf(item);
    if (idx !== -1) owned.splice(idx, 1);
    let targetSlot = item.slot;
    if (targetSlot === 'ring1' && equipped['ring1'] && !equipped['ring2']) targetSlot = 'ring2';
    const prev = equipped[targetSlot];
    if (prev) owned.push(prev);
    equipped[targetSlot] = item;
    this.notify();
  },

  equipToSlot(item: EquipmentItem, slot: 'ring1' | 'ring2'): void {
    const idx = owned.indexOf(item);
    if (idx !== -1) owned.splice(idx, 1);
    const prev = equipped[slot];
    if (prev) owned.push(prev);
    equipped[slot] = item;
    this.notify();
  },

  unequip(slot: EquipSlot): void {
    const prev = equipped[slot];
    if (prev) owned.push(prev);
    equipped[slot] = null;
    this.notify();
  },

  getEquipped(): Readonly<EquippedMap> {
    return equipped;
  },

  isEquipped(itemId: string): boolean {
    return Object.values(equipped).some(e => e?.id === itemId);
  },

  getStats(): EffectiveStats {
    let atk       = BASE_ATK + (level - 1) * LEVEL_ATK;
    let maxHp     = BASE_HP  + (level - 1) * LEVEL_HP;
    let speed     = BASE_SPEED;
    let def       = BASE_DEF;
    let crit      = BASE_CRIT;
    let attackArc = BASE_ATTACK_ARC;
    let atkSpeed  = 0;
    let lifesteal = 0;
    let evasion   = 0;
    let critDmg   = 0.5;
    let hpRegen   = 0;

    for (const [, item] of Object.entries(equipped) as [EquipSlot, EquipmentItem | null][]) {
      if (!item) continue;
      const s = getItemStats(item);
      atk       += s.atk       ?? 0;
      maxHp     += s.hp        ?? 0;
      speed     += s.speed     ?? 0;
      def       += s.def       ?? 0;
      crit      += s.crit      ?? 0;
      atkSpeed  += s.atkSpeed  ?? 0;
      lifesteal += s.lifesteal ?? 0;
      evasion   += s.evasion   ?? 0;
      critDmg   += s.critDmg   ?? 0;
      hpRegen   += s.hpRegen   ?? 0;
    }

    return {
      atk, maxHp, speed, def,
      crit:      Math.min(crit, 1),
      attackArc: Math.min(attackArc, 360),
      atkSpeed:  Math.min(atkSpeed, 1),
      lifesteal: Math.min(lifesteal, 0.5),
      evasion:   Math.min(evasion, 0.75),
      critDmg,
      hpRegen,
    };
  },

  // ── Listeners ──────────────────────────────────────────

  onChange(fn: () => void): void { listeners.push(fn); },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void { listeners.forEach(fn => fn()); },
};
