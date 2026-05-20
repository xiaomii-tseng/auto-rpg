const listeners: Array<() => void> = [];

let _keys      = 0;
let _bestFloor = 0;

function notifyAll() { listeners.forEach(fn => fn()); }

export const TowerStore = {
  getKeys():      number  { return _keys; },
  getBestFloor(): number  { return _bestFloor; },
  hasKey():       boolean { return _keys > 0; },

  addKey():  void { _keys++; notifyAll(); },
  useKey():  void { if (_keys > 0) { _keys--; notifyAll(); } },

  recordFloor(floor: number): void {
    if (floor > _bestFloor) { _bestFloor = floor; notifyAll(); }
  },

  getSaveData(): { keys: number; bestFloor: number } {
    return { keys: _keys, bestFloor: _bestFloor };
  },

  loadSaveData(data: { keys?: number; bestFloor?: number }): void {
    _keys      = data.keys      ?? 0;
    _bestFloor = data.bestFloor ?? 0;
  },

  onChange(fn: () => void):  void { listeners.push(fn); },
  offChange(fn: () => void): void {
    const i = listeners.indexOf(fn);
    if (i !== -1) listeners.splice(i, 1);
  },
};
