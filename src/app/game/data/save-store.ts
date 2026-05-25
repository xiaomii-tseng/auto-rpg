import { EquipmentItem, EquipSlot } from './equipment-data';
import { PlayerStore } from './player-store';
import { InventoryStore } from './inventory-store';
import { CardStore } from './card-store';
import { QuestStore } from './quest-store';
import { PotionBarStore } from './potion-bar-store';
import { SkillTreeStore } from './skill-tree-store';
import { TowerStore } from './tower-store';
import { DailyQuestStore } from './daily-quest-store';
import { AudioService } from './audio.service';
import { SkinStore } from './skin-store';
import { DismantlePrefsStore } from './dismantle-prefs-store';
import { VERSION as _V } from '../version';

// ─────────────────────────────────────────────────────────────────────────────
// 所有需要持久化的資料，一律存入 SAVE_KEY（'auto_rpg_save'）這一筆 JSON。
// 禁止在其他地方另開 localStorage key 存遊戲資料。
// 新增任何 store 或設定時，在 SaveData interface、save()、load() 三處同步更新。
// ─────────────────────────────────────────────────────────────────────────────
const SAVE_KEY = 'auto_rpg_save';
const VERSION  = _V.replace(/^v/, '');
let   _loaded  = false;

// ── localStorage 加密（XOR + Base64）────────────────────────────────────────
// 防止玩家直接編輯 localStorage 中的 JSON 存檔
const _CK = new Uint8Array([
  0x7f, 0x3a, 0xc8, 0x15, 0x9e, 0x42, 0xd7, 0x6b,
  0x28, 0xf4, 0x51, 0x8d, 0xa3, 0x7c, 0x2e, 0xb9,
  0x64, 0x1f, 0x93, 0x5a, 0xe8, 0x37, 0x0c, 0x76,
  0xd5, 0x4b, 0x82, 0x19, 0xac, 0x63, 0xf0, 0x2d,
  0x58, 0x9b, 0xe4, 0x71, 0x3c, 0xa7, 0x06, 0xcd,
  0x85, 0x42, 0xfe, 0x1a, 0x67, 0xb3, 0x90, 0x4e,
  0xd2, 0x7f, 0x38, 0xc5, 0x0b, 0x91, 0x56, 0xe3,
  0xaa, 0x2c, 0x78, 0xf1, 0x43, 0x8e, 0xbd, 0x60,
]);

export function encryptSave(plain: string): string {
  const bytes = new TextEncoder().encode(plain);
  const out   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ _CK[i % _CK.length];
  return btoa(String.fromCharCode(...out));
}

export function decryptSave(cipher: string): string {
  const bytes = Uint8Array.from(atob(cipher), c => c.charCodeAt(0));
  const out   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ _CK[i % _CK.length];
  return new TextDecoder().decode(out);
}
let   _onSaveHook: (() => void) | null = null;

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
  potionBar:   { slots: (string | null)[] };
  skillTree?:  { learned: string[]; attackMode: string };
  tower?:      { keys: number; bestFloor: number };
  dailyQuests?:     { date: string; quests: any[] };
  audio?:           { bgm: number; sfx: number };
  dismantlePrefs?:  { qualities: string[]; slots: string[] };
}

export function makeInitialSave(playerName = ''): SaveData {
  return {
    version:    VERSION,
    playerName,
    skinId:     0,
    player: {
      level:    1,
      exp:      0,
      equipped: { hat: null, outfit: null, shoes: null, ring1: null, ring2: null, sword: null },
      owned:    [],
    },
    inventory: { gold: 0, items: [] },
    cards:     { equipped: [null, null, null], inventory: [] },
    quests:    { quests: [] },
    potionBar: { slots: [null, null] },
    skillTree: { learned: [], attackMode: 'projectile' },
    tower:     { keys: 0, bestFloor: 0 },
  };
}

export const SaveStore = {
  setOnSaveHook(fn: () => void): void { _onSaveHook = fn; },

  save(): void {
    const data: SaveData = {
      version:    VERSION,
      playerName: localStorage.getItem('playerName') ?? '',
      skinId:     SkinStore.get(),
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
      quests:      QuestStore.getSaveData(),
      potionBar:   PotionBarStore.getSaveData(),
      skillTree:   SkillTreeStore.getSaveData(),
      tower:       TowerStore.getSaveData(),
      dailyQuests:    DailyQuestStore.getSaveData(),
      audio:          { bgm: AudioService.bgmVolume, sfx: AudioService.sfxVolume },
      dismantlePrefs: DismantlePrefsStore.getSaveData(),
    };
    try {
      localStorage.setItem(SAVE_KEY, encryptSave(JSON.stringify(data)));
      _onSaveHook?.();
    } catch (_) {}
  },

  load(): boolean {
    if (_loaded) return true;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data: SaveData = JSON.parse(decryptSave(raw));
      const majorVer = parseInt(String(data.version).split('.')[0], 10);
      if (isNaN(majorVer) || majorVer < 17) return false;

      // Restore consolidated fields so existing getPlayerName() / SkinStore.get() still work
      if (data.playerName) localStorage.setItem('playerName', data.playerName);
      if (data.skinId)     SkinStore.set(data.skinId);

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

      if (data.quests)      QuestStore.loadSaveData(data.quests as any);
      if (data.potionBar)   PotionBarStore.loadSaveData(data.potionBar);
      if (data.skillTree)   SkillTreeStore.loadSaveData(data.skillTree as any);
      if (data.tower)          TowerStore.loadSaveData(data.tower);
      if (data.dailyQuests)    DailyQuestStore.loadSaveData(data.dailyQuests as any);
      if (data.dismantlePrefs) DismantlePrefsStore.loadSaveData(data.dismantlePrefs);
      if (data.audio) {
        AudioService.setBgmVolume(data.audio.bgm);
        AudioService.setSfxVolume(data.audio.sfx);
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
