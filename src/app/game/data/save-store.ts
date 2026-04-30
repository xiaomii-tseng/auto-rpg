import { EQUIPMENT_ITEMS, EquipSlot } from './equipment-data';
import { PlayerStore } from './player-store';
import { InventoryStore } from './inventory-store';

const SAVE_KEY = 'auto_rpg_save';
const VERSION  = 1;

interface SaveData {
  version: number;
  player: {
    level:       number;
    exp:         number;
    equippedIds: Record<EquipSlot, string | null>;
    ownedIds:    string[];
  };
  inventory: {
    gold:  number;
    items: { id: string; name: string; qty: number }[];
  };
}

export const SaveStore = {
  save(): void {
    const eq = PlayerStore.getEquipped();
    const data: SaveData = {
      version: VERSION,
      player: {
        level: PlayerStore.getLevel(),
        exp:   PlayerStore.getExp(),
        equippedIds: {
          hat:    eq.hat?.id    ?? null,
          outfit: eq.outfit?.id ?? null,
          shoes:  eq.shoes?.id  ?? null,
          ring:   eq.ring?.id   ?? null,
          sword:  eq.sword?.id  ?? null,
        },
        ownedIds: PlayerStore.getOwned().map(i => i.id),
      },
      inventory: {
        gold:  InventoryStore.getGold(),
        items: InventoryStore.getAllItems().map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      },
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {}
  },

  load(): boolean {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data: SaveData = JSON.parse(raw);
      if (data.version !== VERSION) return false;

      // Player level / exp
      const p = data.player;
      PlayerStore.setLevelExp(p.level, p.exp);

      // Equipped items
      for (const [slot, id] of Object.entries(p.equippedIds) as [EquipSlot, string | null][]) {
        if (!id) continue;
        const item = EQUIPMENT_ITEMS.find(e => e.id === id);
        if (item) PlayerStore.equipDirect(slot, item);
      }

      // Owned items
      for (const id of p.ownedIds) {
        const item = EQUIPMENT_ITEMS.find(e => e.id === id);
        if (item) PlayerStore.addOwned(item);
      }

      // Inventory
      InventoryStore.setGold(data.inventory.gold);
      for (const it of data.inventory.items) {
        InventoryStore.addItem(it.id, it.name, it.qty);
      }

      return true;
    } catch (_) {
      return false;
    }
  },

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};
