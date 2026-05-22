import { EquipmentItem, EquipSlot } from './equipment-data';
import { PlayerStore } from './player-store';
import { InventoryStore } from './inventory-store';
import { CardStore } from './card-store';
import { QuestStore } from './quest-store';
import { PotionBarStore } from './potion-bar-store';
import { SkillTreeStore } from './skill-tree-store';
import { TowerStore } from './tower-store';

const SAVE_KEY = 'auto_rpg_save';
const VERSION  = '14.0.1';
let   _loaded  = false;

interface SaveData {
  version: string | number;
  playerName: string;
  skinId:     number;
  player: {
    level:    number;
    exp:      number;
    equipped: Record<EquipSlot, EquipmentItem | null>;
    owned:    EquipmentItem[];
  };
  inventory: {
    gold:  number;
    items: { id: string; name: string; qty: number }[];
  };
  cards: {
    equipped:  (string | null)[];
    inventory: { cardId: string; qty: number }[];
  };
  quests: {
    quests: { id: string; bossId: string; reward: number; flavorText: string; status: string }[];
  };
  potionBar: { slots: (string | null)[] };
  skillTree?: { learned: string[]; attackMode: string };
  tower?: { keys: number; bestFloor: number };
}

export const SaveStore = {
  save(): void {
    const data: SaveData = {
      version:    VERSION,
      playerName: localStorage.getItem('playerName') ?? '',
      skinId:     Number(localStorage.getItem('auto_rpg_skin') ?? '0'),
      player: {
        level:    PlayerStore.getLevel(),
        exp:      PlayerStore.getExp(),
        equipped: { ...PlayerStore.getEquipped() } as Record<EquipSlot, EquipmentItem | null>,
        owned:    [...PlayerStore.getOwned()],
      },
      inventory: {
        gold:  InventoryStore.getGold(),
        items: InventoryStore.getAllItems().map(i => ({ id: i.id, name: i.name, qty: i.qty })),
      },
      cards: {
        equipped:  Array.from(CardStore.getEquipped()),
        inventory: CardStore.getInventory(),
      },
      quests:    QuestStore.getSaveData(),
      potionBar: PotionBarStore.getSaveData(),
      skillTree: SkillTreeStore.getSaveData(),
      tower:     TowerStore.getSaveData(),
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

      // Restore consolidated fields so existing getPlayerName() / SkinStore.get() still work
      if (data.playerName) localStorage.setItem('playerName',    data.playerName);
      if (data.skinId)     localStorage.setItem('auto_rpg_skin', String(data.skinId));

      const p = data.player;
      PlayerStore.setLevelExp(p.level, p.exp);

      if (p.equipped) {
        for (const [slot, item] of Object.entries(p.equipped) as [EquipSlot, EquipmentItem | null][]) {
          if (item) {
            if (!item.enhanceLog) item.enhanceLog = [];
            PlayerStore.equipDirect(slot, item);
          }
        }
      }

      if (p.owned) {
        for (const item of p.owned) {
          if (!item.enhanceLog) item.enhanceLog = [];
          PlayerStore.addOwned(item);
        }
      }

      InventoryStore.setGold(data.inventory.gold);
      for (const it of data.inventory.items) {
        InventoryStore.addItem(it.id, it.name, it.qty);
      }

      if (data.cards) {
        CardStore.setEquippedDirect(data.cards.equipped);
        CardStore.setInventoryDirect(data.cards.inventory);
      }

      if (data.quests)    QuestStore.loadSaveData(data.quests as any);
      if (data.potionBar) PotionBarStore.loadSaveData(data.potionBar);
      if (data.skillTree) SkillTreeStore.loadSaveData(data.skillTree as any);
      if (data.tower)     TowerStore.loadSaveData(data.tower);

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
