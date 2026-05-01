import { EquipmentItem, EquipSlot, Element } from './equipment-data';

export const BASE_ATK        = 30;
export const BASE_HP         = 100;
export const BASE_SPEED      = 150;
export const BASE_DEF        = 0;
export const BASE_CRIT       = 0;
export const BASE_ATTACK_ARC = 180;  // degrees, half = ±90°

export interface EffectiveStats {
  atk:       number;
  maxHp:     number;
  speed:     number;
  def:       number;
  crit:      number;  // 0~1
  attackArc: number;  // degrees (total cone width)
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
const crafted  = new Set<string>();
const owned:     EquipmentItem[] = [];
const listeners: Array<() => void> = [];

export const PlayerStore = {
  // ── Level / Exp ────────────────────────────────────────

  getLevel(): number { return level; },
  getExp():   number { return exp; },

  expToNext(lv = level): number { return Math.round(1000 * Math.pow(1.05, lv - 1)); },

  addExp(amount: number): void {
    exp += amount;
    while (exp >= PlayerStore.expToNext()) {
      exp -= PlayerStore.expToNext();
      level++;
    }
    this.notify();
  },

  // ── Internal load helpers (used by SaveStore only) ────

  setLevelExp(lv: number, ex: number): void {
    level = lv;
    exp   = ex;
  },

  equipDirect(slot: EquipSlot, item: EquipmentItem): void {
    equipped[slot] = item;
  },

  // ── Crafting ───────────────────────────────────────────

  isCrafted(itemId: string): boolean { return crafted.has(itemId); },

  markCrafted(itemId: string): void {
    crafted.add(itemId);
    this.notify();
  },

  // ── Owned (crafted, not yet equipped) ─────────────────

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
    // Auto-fill ring2 when ring1 is occupied
    let targetSlot = item.slot;
    if (targetSlot === 'ring1' && equipped['ring1'] && !equipped['ring2']) targetSlot = 'ring2';
    const prev = equipped[targetSlot];
    if (prev) owned.push(prev);
    equipped[targetSlot] = item;
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

  getWeaponElement(): Element {
    return equipped['sword']?.element ?? 'none';
  },

  getStats(): EffectiveStats {
    let atk       = BASE_ATK;
    let maxHp     = BASE_HP;
    let speed     = BASE_SPEED;
    let def       = BASE_DEF;
    let crit      = BASE_CRIT;
    let attackArc = BASE_ATTACK_ARC;

    for (const [, item] of Object.entries(equipped) as [EquipSlot, EquipmentItem | null][]) {
      if (!item) continue;
      atk       += item.stats.atk       ?? 0;
      maxHp     += item.stats.hp        ?? 0;
      speed     += item.stats.speed     ?? 0;
      def       += item.stats.def       ?? 0;
      crit      += item.stats.crit      ?? 0;
      attackArc += item.stats.attackArc ?? 0;
    }

    return { atk, maxHp, speed, def, crit: Math.min(crit, 1), attackArc: Math.min(attackArc, 360) };
  },

  // ── Listeners ──────────────────────────────────────────

  onChange(fn: () => void): void { listeners.push(fn); },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void { listeners.forEach(fn => fn()); },
};
