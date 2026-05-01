import { EQUIPMENT_ITEMS, EquipSlot } from './equipment-data';
import { PlayerStore } from './player-store';
import { InventoryStore } from './inventory-store';
import { CardStore } from './card-store';

const SAVE_KEY   = 'auto_rpg_save';
const VERSION    = 5;
let   _loaded    = false;

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
  cards: {
    equipped:  (string | null)[];
    inventory: { cardId: string; qty: number }[];
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
          ring1:  eq.ring1?.id  ?? null,
          ring2:  eq.ring2?.id  ?? null,
          sword:  eq.sword?.id  ?? null,
        },
        ownedIds: PlayerStore.getOwned().map(i => i.id),
      },
      inventory: {
        gold:  InventoryStore.getGold(),
        items: InventoryStore.getAllItems().map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      },
      cards: {
        equipped:  Array.from(CardStore.getEquipped()),
        inventory: CardStore.getInventory(),
      },
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch (_) {}
  },

  load(): boolean {
    if (_loaded) return true;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data: SaveData = JSON.parse(raw);
      if (data.version !== VERSION) return false;

      const p = data.player;
      PlayerStore.setLevelExp(p.level, p.exp);

      for (const [slot, id] of Object.entries(p.equippedIds) as [EquipSlot, string | null][]) {
        if (!id) continue;
        const item = EQUIPMENT_ITEMS.find(e => e.id === id);
        if (item) PlayerStore.equipDirect(slot, item);
      }

      for (const id of p.ownedIds) {
        const item = EQUIPMENT_ITEMS.find(e => e.id === id);
        if (item) PlayerStore.addOwned(item);
      }

      InventoryStore.setGold(data.inventory.gold);
      for (const it of data.inventory.items) {
        InventoryStore.addItem(it.id, it.name, it.qty);
      }

      if (data.cards) {
        CardStore.setEquippedDirect(data.cards.equipped);
        CardStore.setInventoryDirect(data.cards.inventory);
      }

      _loaded = true;
      return true;
    } catch (_) {
      return false;
    }
  },

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};
