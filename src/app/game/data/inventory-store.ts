export interface InventoryItem {
  id:   string;
  name: string;
  qty:  number;
}

const items: Map<string, InventoryItem> = new Map();
let gold = 0;

// Callbacks so UI can react to changes
const listeners: Array<() => void> = [];

export const InventoryStore = {
  // ── Gold ───────────────────────────────────────────────

  getGold(): number {
    return gold;
  },

  addGold(amount: number): void {
    gold = Math.max(0, gold + amount);
    this.notify();
  },

  spendGold(amount: number): boolean {
    if (gold < amount) return false;
    gold -= amount;
    this.notify();
    return true;
  },

  // ── Items ──────────────────────────────────────────────

  addItem(id: string, name: string, qty: number): void {
    const existing = items.get(id);
    if (existing) {
      existing.qty += qty;
    } else {
      items.set(id, { id, name, qty });
    }
    this.notify();
  },

  getItem(id: string): InventoryItem | undefined {
    return items.get(id);
  },

  getItemQty(id: string): number {
    return items.get(id)?.qty ?? 0;
  },

  spendItem(id: string, qty: number): boolean {
    const item = items.get(id);
    if (!item || item.qty < qty) return false;
    item.qty -= qty;
    if (item.qty === 0) items.delete(id);
    this.notify();
    return true;
  },

  getAllItems(): InventoryItem[] {
    return Array.from(items.values());
  },

  // ── Internal load helper (used by SaveStore only) ─────

  setGold(amount: number): void {
    gold = amount;
  },

  // ── Change listeners ───────────────────────────────────

  onChange(fn: () => void): void {
    listeners.push(fn);
  },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void {
    listeners.forEach(fn => fn());
  },
};
