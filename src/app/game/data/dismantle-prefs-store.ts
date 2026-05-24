export const DismantlePrefsStore = {
  qualities: new Set<string>(['normal']),
  slots:     new Set<string>(['sword', 'hat', 'outfit', 'shoes', 'ring']),

  getSaveData() {
    return { qualities: [...this.qualities], slots: [...this.slots] };
  },

  loadSaveData(d: { qualities: string[]; slots: string[] }): void {
    this.qualities = new Set(d.qualities);
    this.slots     = new Set(d.slots);
  },
};
