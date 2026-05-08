type PotionSlots = [string | null, string | null];

let _slots: PotionSlots = [null, null];
const _listeners: (() => void)[] = [];

export const PotionBarStore = {
  getSlots(): PotionSlots  { return [..._slots] as PotionSlots; },
  getSlot(idx: 0 | 1): string | null { return _slots[idx]; },

  setSlot(idx: 0 | 1, itemId: string | null): void {
    _slots[idx] = itemId;
    _listeners.forEach(fn => fn());
  },

  onChange(fn: () => void): void  { _listeners.push(fn); },
  offChange(fn: () => void): void {
    const i = _listeners.indexOf(fn);
    if (i >= 0) _listeners.splice(i, 1);
  },

  getSaveData(): { slots: (string | null)[] } { return { slots: [..._slots] }; },
  loadSaveData(data: { slots?: (string | null)[] }): void {
    if (Array.isArray(data.slots)) {
      _slots[0] = (data.slots[0] as string | null) ?? null;
      _slots[1] = (data.slots[1] as string | null) ?? null;
    }
  },
  reset(): void { _slots = [null, null]; },
};
