import { StatBonus } from './equipment-data';
import { PlayerStore, EffectiveStats } from './player-store';
import { getCardDef } from './monster-data';

export const CARD_SLOT_COUNT = 5;

// 5個裝備槽 (cardId or null)
const equipped: (string | null)[] = Array(CARD_SLOT_COUNT).fill(null);

// 卡片庫存: cardId → 數量 (可疊加)
const inventory: Map<string, number> = new Map();

const listeners: Array<() => void> = [];

export const CardStore = {

  // ── Inventory ──────────────────────────────────────────────

  addCard(cardId: string, qty = 1): void {
    inventory.set(cardId, (inventory.get(cardId) ?? 0) + qty);
    this.notify();
  },

  getInventoryQty(cardId: string): number {
    return inventory.get(cardId) ?? 0;
  },

  getInventory(): { cardId: string; qty: number }[] {
    return Array.from(inventory.entries())
      .filter(([, qty]) => qty > 0)
      .map(([cardId, qty]) => ({ cardId, qty }));
  },

  // ── Equip / Unequip ────────────────────────────────────────

  equip(cardId: string, slot: number): void {
    if (slot < 0 || slot >= CARD_SLOT_COUNT) return;
    if ((inventory.get(cardId) ?? 0) <= 0) return;

    const current = equipped[slot];
    if (current) {
      inventory.set(current, (inventory.get(current) ?? 0) + 1);
    }

    const newQty = (inventory.get(cardId) ?? 0) - 1;
    if (newQty <= 0) inventory.delete(cardId);
    else inventory.set(cardId, newQty);

    equipped[slot] = cardId;
    this.notify();
  },

  equipAuto(cardId: string): void {
    const slot = equipped.findIndex(s => s === null);
    if (slot !== -1) this.equip(cardId, slot);
  },

  unequip(slot: number): void {
    const cardId = equipped[slot];
    if (!cardId) return;
    inventory.set(cardId, (inventory.get(cardId) ?? 0) + 1);
    equipped[slot] = null;
    this.notify();
  },

  getEquipped(): ReadonlyArray<string | null> {
    return equipped;
  },

  // ── Stats ──────────────────────────────────────────────────

  getEquippedBonus(): StatBonus {
    const b: StatBonus = {};
    for (const cardId of equipped) {
      if (!cardId) continue;
      const def = getCardDef(cardId);
      if (!def) continue;
      b.atk       = (b.atk       ?? 0) + (def.effect.atk       ?? 0);
      b.hp        = (b.hp        ?? 0) + (def.effect.hp        ?? 0);
      b.def       = (b.def       ?? 0) + (def.effect.def       ?? 0);
      b.speed     = (b.speed     ?? 0) + (def.effect.speed     ?? 0);
      b.crit      = (b.crit      ?? 0) + (def.effect.crit      ?? 0);
      b.attackArc = (b.attackArc ?? 0) + (def.effect.attackArc ?? 0);
    }
    return b;
  },

  /** 裝備 + 卡片的完整數值，遊戲場景使用此函式 */
  getTotalStats(): EffectiveStats {
    const base  = PlayerStore.getStats();
    const bonus = this.getEquippedBonus();
    return {
      atk:       base.atk       + (bonus.atk       ?? 0),
      maxHp:     base.maxHp     + (bonus.hp         ?? 0),
      speed:     base.speed     + (bonus.speed      ?? 0),
      def:       base.def       + (bonus.def        ?? 0),
      crit:      Math.min(base.crit + (bonus.crit   ?? 0), 1),
      attackArc: Math.min(base.attackArc + (bonus.attackArc ?? 0), 360),
      atkSpeed:  base.atkSpeed,
      lifesteal: base.lifesteal,
      evasion:   base.evasion,
    };
  },

  // ── Internal load helpers (used by SaveStore only) ────────

  setEquippedDirect(slots: (string | null)[]): void {
    for (let i = 0; i < CARD_SLOT_COUNT; i++) equipped[i] = slots[i] ?? null;
  },

  setInventoryDirect(entries: { cardId: string; qty: number }[]): void {
    inventory.clear();
    for (const { cardId, qty } of entries) {
      if (qty > 0) inventory.set(cardId, qty);
    }
  },

  // ── Change listeners ───────────────────────────────────────

  onChange(fn: () => void): void { listeners.push(fn); },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void { listeners.forEach(fn => fn()); },
};

