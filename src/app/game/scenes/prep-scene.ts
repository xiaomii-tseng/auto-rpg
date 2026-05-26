import Phaser from 'phaser';
import { InventoryStore } from '../data/inventory-store';
import { PlayerStore } from '../data/player-store';
import { PotionBarStore } from '../data/potion-bar-store';
import { ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L, ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED, ITEM_STONE_BROKEN, ITEM_STONE_INTACT, ITEM_BLANK_CARD, ITEM_QUEST_REROLL, ITEM_TICKET_SLIME, ITEM_TICKET_FLOWER, ITEM_TICKET_ORC, ITEM_TICKET_VAMPIRE } from '../data/monster-data';
import { generateEquipment, randomQuality, QUALITY_NAMES, QUALITY_COLORS, SLOT_NAMES, STAT_NAMES, BEHAVIOR_INFO, BEHAVIOR_NAMES, EquipSlot, EquipmentItem, applyEnhancement, recastItem, ENHANCE_COST, ENHANCE_RATE, ENHANCE_COMPLETE_BONUS, ENHANCE_MAX, fmtAffixValue, StatBonus, REFINE_INCREMENT_RANGE, calcEquipSellPrice, LEGENDARY_BOSS_WEAPON, generateLegendaryWeapon } from '../data/equipment-data';
import { SaveStore } from '../data/save-store';
import { CardStore, CARD_SLOT_COUNT } from '../data/card-store';

import { getCardDef, getMonsterDef, getCardDisplayName, monsterCardScale, monsterDetailScale, CARD_DEFS, CardDef } from '../data/monster-data';
import { QuestStore, Quest, STAR_EQUIP_QUALITY, getStarWeights, BOSS_POOL } from '../data/quest-store';
import { TutorialStore, TutorialKey } from '../data/tutorial-store';
import { SkillTreeStore, SKILL_NODES, SKILL_NODE_MAP, ATTACK_MODES, MODE_COLORS } from '../data/skill-tree-store';
import { NetworkService } from '../network/network.service';
import { AudioService } from '../data/audio.service';
import { DailyQuestStore } from '../data/daily-quest-store';
import { DismantlePrefsStore as _DismantlePrefsStore } from '../data/dismantle-prefs-store';
import { SkinStore, SKINS, getSkinFile } from '../data/skin-store';
import { VirtualJoystick } from '../ui/joystick';
import { VERSION } from '../version';
import { TowerStore } from '../data/tower-store';


const DPR = (window as any).__gameDpr as number;
const F = (n: number): string => `${Math.round(n * DPR)}px`;
const P = (n: number): number => Math.round(n * DPR);

const TOP_H    = 0;
const BOTTOM_H = 0;

const QUEST_MAP_THEMES = ['grassland', 'desert', 'snow', 'lava', 'forest', 'dungeon'] as const;
function randomQuestTheme(): string {
  return QUEST_MAP_THEMES[Math.floor(Math.random() * QUEST_MAP_THEMES.length)];
}

// Wood palette
const WB   = 0x2e1a0a; // panel bg (dark base)
const WBD  = 0x1a0e06; // panel bg deeper / shadow fill
const WD   = 0x3c2210; // dark wood
const WM   = 0x5a3420; // medium dark
const WMI  = 0x5c3418; // medium
const WL   = 0x8b5e3c; // light wood
const WH   = 0xb07030; // highlight grain
const GOLD = 0xd4a044;
const IRON = 0x4a5560;

// Per-enhancement glow definition: radius (physical px), tint color, optional rainbow flag
const GLOW_DEF: Record<number, { r: number; color: number; rainbow?: true }> = {
  3:  { r: P(28), color: 0xffffff },
  4:  { r: P(28), color: 0x00ff44 },
  5:  { r: P(28), color: 0x00ffff },
  6:  { r: P(28), color: 0x0055ff },
  7:  { r: P(30), color: 0xffdd00 },
  8:  { r: P(32), color: 0xdd00ff },
  9:  { r: P(34), color: 0xff0000 },
  10: { r: P(38), color: 0xffffff, rainbow: true },
};

// White radial-gradient canvas texture, keyed by radius. Built once, reused.
function _ensureGlowTex(scene: Phaser.Scene, radius: number): string {
  const key = `__enhglow_${radius}`;
  if (scene.textures.exists(key)) return key;
  const size = radius * 2 + 2;
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx  = canvas.getContext('2d')!;
  const cx   = size / 2;
  const grad = ctx.createRadialGradient(cx, cx, 0, cx, cx, radius);
  grad.addColorStop(0,    'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.65)');
  grad.addColorStop(0.70, 'rgba(255,255,255,0.20)');
  grad.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  scene.textures.addCanvas(key, canvas);
  return key;
}

// Returns an Image aura to be added to the container BEFORE the item image.
function applyEnhanceGlow(
  scene: Phaser.Scene,
  item:  import('../data/equipment-data').EquipmentItem,
  x: number, y: number,
): Phaser.GameObjects.Image | null {
  const enh = item.quality === 'legendary' ? 10 : (item.enhancement ?? 0);
  const def = GLOW_DEF[enh];
  if (!def) return null;

  const t        = (enh - 3) / 7;
  const alphaMax = 0.45 + t * 0.50;   // 0.45 → 0.95
  const alphaMin = 0.12 + t * 0.10;   // 0.12 → 0.22

  const sprite = scene.add.image(x, y, _ensureGlowTex(scene, def.r));
  sprite.setBlendMode(Phaser.BlendModes.ADD);
  sprite.setTint(def.color);
  sprite.setAlpha(alphaMin);

  // Unified pulse speed: 1200ms all levels
  scene.tweens.add({
    targets:  sprite,
    alpha:    alphaMax,
    yoyo:     true,
    repeat:   -1,
    duration: 1200,
    ease:     'Sine.easeInOut',
  });

  // +10 rainbow: cycle hue continuously
  if (def.rainbow) {
    const hue = { v: 0 };
    scene.tweens.add({
      targets:  hue,
      v:        1,
      duration: 1600,
      repeat:   -1,
      ease:     'Linear',
      onUpdate: () => {
        const c = Phaser.Display.Color.HSVToRGB(hue.v, 1, 1) as { r: number; g: number; b: number };
        sprite.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      },
    });
  }

  return sprite;
}

const _dismantlePrefs = _DismantlePrefsStore;
const _saveDismantlePrefs = () => SaveStore.save();

export function getPlayerName(): string {
  return localStorage.getItem('playerName') ?? '';
}
export function setPlayerName(name: string): void {
  localStorage.setItem('playerName', name.slice(0, 8));
}

export class PrepScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;
  private roomOverlayObjs: Phaser.GameObjects.GameObject[] = [];
  private _partnerIn = false;
  private _partnerNick = '';
  private _partnerLevel = 0;
  private _partnerSkinId = 0;
  // Party invite state
  private _partyState: 'none' | 'open' | 'in_party' = 'none';
  private _amPartyLeader = false;
  private _partyMembers: { sid: string; nick: string; level: number }[] = [];
  private _partyPendingInvites: { sid: string; nick: string }[] = [];
  private _partyRoomCode = '';
  private _pendingInviteRoomCode = '';  // guest stores roomCode from incoming invite
  private _questPanelCloseAll: (() => void) | null = null;
  private _toastStack: Phaser.GameObjects.Text[] = [];
  private _partyCreateBtnObjs: Phaser.GameObjects.GameObject[] = [];
  private _partyPanelObjs: Phaser.GameObjects.GameObject[] = [];
  private _invitePopupObjs: Phaser.GameObjects.GameObject[] = [];
  private _inviteCountdown?: ReturnType<typeof setTimeout>;
  private _sceneW = 0;
  private _sceneH = 0;
  private _heroY = 0;
  private _multiBtnTxt?: Phaser.GameObjects.Text;
  private _multiBtnHit?: Phaser.GameObjects.Rectangle;

  // ── Town world ────────────────────────────────────────────
  private _townContainer?: Phaser.GameObjects.Container;
  private _townPlayer?: Phaser.GameObjects.Sprite;
  private _townPlayerX  = 0;
  private _townPlayerY  = 0;
  private _townPlayerDir: 'down' | 'left' | 'right' | 'up' = 'down';
  private _townMoveSendTimer = 0;
  private _townLastSentX = -1;
  private _townLastSentY = -1;
  private _townLastSentDir = '';
  private _townRemotePlayers = new Map<string, {
    sprite: Phaser.GameObjects.Sprite;
    nameLabel: Phaser.GameObjects.Text;
    level: number;
    fromX: number; fromY: number;
    targetX: number; targetY: number;
    lerpT: number; lerpDur: number;
  }>();
  private _townInteractLabel?: Phaser.GameObjects.Text;
  private _townNearZone: string | null = null;
  private _townActiveZone: string | null = null;
  private _townViewW = 0;
  private _townViewH = 0;
  private _townViewY = 0;
  private _townWorldW = 0;
  private _townWorldH = 0;
  private _townZones: Array<{ wx: number; wy: number; hw: number; hh: number; ring: Phaser.GameObjects.Graphics; label: string; onActivate: () => void }> = [];
  private _townStoneRects: { x: number; y: number; r: number }[] = [];
  private _townBuildingRects: { cx: number; cy: number; hw: number; hh: number }[] = [];
  private _townJoystick?: VirtualJoystick;
  private _townCursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private _townLocalNameLabel?: Phaser.GameObjects.Text;
  private _townPlayerDebug?: Phaser.GameObjects.Graphics;
  private _townAnimals: Array<{
    sprite: Phaser.GameObjects.Sprite;
    state: 'idle' | 'walk';
    wx: number; wy: number;
    targetX: number; targetY: number;
    speed: number;
    dir: 'down' | 'up' | 'left' | 'right';
    idleTimer: number;
    kind: string;
  }> = [];
  private _isAnimalHost  = true;
  private _animalSyncTimer = 2000;

  static fmtGold(n: number): string {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(1)}萬`;
    return n.toLocaleString();
  }

  constructor() {
    super({ key: 'PrepScene' });
  }

  preload(): void {
    const cfg = { frameWidth: 64, frameHeight: 64 };
    const _skin = SKINS[SkinStore.get()];
    // Always remove and reload player textures + animations so they reflect the current skin.
    // Safe here because preload runs before any rendering.
    ['player_idle_shadow', 'player_run_shadow'].forEach(k => {
      if (this.textures.exists(k)) this.textures.remove(k);
    });
    ['player_idle_shadow', '_lobby_idle',
     'player_idle_down', 'player_idle_left', 'player_idle_right', 'player_idle_up',
     'player_run_down',  'player_run_left',  'player_run_right',  'player_run_up',
    ].forEach(k => { if (this.anims.exists(k)) this.anims.remove(k); });
    this.load.spritesheet('player_idle_shadow', getSkinFile(_skin, 'idle'), cfg);
    this.load.spritesheet('player_run_shadow',  getSkinFile(_skin, 'run'),  cfg);
    // Load all skin idle + run previews for wardrobe panel and town remote players
    SKINS.forEach((s, i) => {
      const key = `skin_preview_${i}`;
      if (!this.textures.exists(key))
        this.load.spritesheet(key, getSkinFile(s, 'idle'), cfg);
      const runKey = `skin_run_preview_${i}`;
      if (!this.textures.exists(runKey))
        this.load.spritesheet(runKey, getSkinFile(s, 'run'), cfg);
    });
    // Town ground tiles
    if (!this.textures.exists('tile_grass'))
      this.load.image('tile_grass', 'tilesets/1 Tiles/FieldsTile_38.png');
    if (!this.textures.exists('tileset_fields'))
      this.load.spritesheet('tileset_fields', 'tilesets/1 Tiles/FieldsTileset.png', { frameWidth: 32, frameHeight: 32 });
    // Town grass decorations
    for (let n = 1; n <= 6; n++) {
      if (!this.textures.exists(`deco_grass${n}`))
        this.load.image(`deco_grass${n}`, `tilesets/2 Objects/5 Grass/${n}.png`);
    }
    if (!this.textures.exists('tree_oak'))
      this.load.image('tree_oak', 'tilesets/2 Objects/7 Decor/Tree1.png');
    if (!this.textures.exists('building_shop'))
      this.load.image('building_shop', 'tilesets2/2 Objects/7 House/1.png');
    if (!this.textures.exists('deco_tent'))
      this.load.image('deco_tent', 'tilesets2/2 Objects/6 Tent/3.png');
    if (!this.textures.exists('deco_tent_shadow'))
      this.load.image('deco_tent_shadow', 'tilesets2/2 Objects/1 Shadow/5.png');
    if (!this.textures.exists('building_forge'))
      this.load.image('building_forge', 'tilesets2/2 Objects/7 House/4.png');
    if (!this.textures.exists('building_battle'))
      this.load.image('building_battle', 'tilesets2/2 Objects/7 House/3.png');
    if (!this.textures.exists('campfire'))
      this.load.spritesheet('campfire', 'tilesets/3 Animated Objects/2 Campfire/2.png', { frameWidth: 32, frameHeight: 32 });
    if (!this.textures.exists('building_warehouse'))
      this.load.image('building_warehouse', 'tilesets2/2 Objects/6 Tent/4.png');
    if (!this.textures.exists('tx_props'))
      this.load.image('tx_props', 'texture/TX Props.png');
    if (!this.textures.exists('tx_shadow'))
      this.load.image('tx_shadow', 'texture/TX Shadow.png');
    if (!this.textures.exists('deco_warehouse_box'))
      this.load.image('deco_warehouse_box', 'tilesets2/2 Objects/4 Box/3.png');
    if (!this.textures.exists('deco_shadow5'))
      this.load.image('deco_shadow5', 'tilesets/2 Objects/1 Shadow/5.png');
    if (!this.textures.exists('deco_stump'))
      this.load.image('deco_stump', 'tilesets/2 Objects/7 Decor/Tree2.png');
    if (!this.textures.exists('deco_stump_shadow'))
      this.load.image('deco_stump_shadow', 'tilesets/2 Objects/1 Shadow/4.png');
    if (!this.textures.exists('tree_shadow'))
      this.load.image('tree_shadow', 'tilesets/2 Objects/1 Shadow/6.png');
    for (let n = 1; n <= 6; n++) {
      if (!this.textures.exists(`deco_stone${n}`))
        this.load.image(`deco_stone${n}`, `tilesets/2 Objects/4 Stone/${n}.png`);
    }
    for (let n = 1; n <= 12; n++) {
      if (!this.textures.exists(`deco_flower${n}`))
        this.load.image(`deco_flower${n}`, `tilesets/2 Objects/6 Flower/${n}.png`);
    }
    if (!this.textures.exists('bg_prep'))
      this.load.image('bg_prep', 'other/bg1.png');
    if (!this.textures.exists('icon_fight'))
      this.load.image('icon_fight', 'other/fight.webp');
    if (!this.textures.exists('icon_coin'))
      this.load.image('icon_coin', 'other/coin.webp');
    ['hat', 'outfit', 'shoes', 'ring'].forEach(cat => {
      for (let i = 1; i <= 5; i++) {
        const key = `equip_${cat}${i}`;
        if (!this.textures.exists(key))
          this.load.image(key, `equip/${cat}${i}.webp`);
      }
    });
    for (let i = 1; i <= 39; i++) {
      if (i === 13 || i === 17) continue;
      const key = `equip_sword${i}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/Iicon_32_${String(i).padStart(2, '0')}.png`);
    }
    for (let i = 1; i <= 30; i++) {
      if (i === 18) continue;
      const key = `equip_sword${i + 40}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/icon_32_2_${String(i).padStart(2, '0')}.png`);
    }
    for (let i = 1; i <= 4; i++) {
      const key = `equip_legendary_sw${i}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/red/sw${i}.png`);
    }
    // Boss idle sprites for quest panel
    const bossSprites: [string, string][] = [
      ['slime_idle', 'sprite/slime/PNG/Slime1/With_shadow/Slime1_Idle_with_shadow.png'],
      ['slime2_idle', 'sprite/slime/PNG/Slime2/With_shadow/Slime2_Idle_with_shadow.png'],
      ['slime3_idle', 'sprite/slime/PNG/Slime3/With_shadow/Slime3_Idle_with_shadow.png'],
      ['plant1_idle', 'sprite/flower/PNG/Plant1/With_shadow/Plant1_Idle_with_shadow.png'],
      ['plant2_idle', 'sprite/flower/PNG/Plant2/With_shadow/Plant2_Idle_with_shadow.png'],
      ['plant3_idle', 'sprite/flower/PNG/Plant3/With_shadow/Plant3_Idle_with_shadow.png'],
      ['orc1_idle', 'sprite/orc/PNG/Orc1/With_shadow/orc1_idle_with_shadow.png'],
      ['orc2_idle', 'sprite/orc/PNG/Orc2/With_shadow/orc2_idle_with_shadow.png'],
      ['orc3_idle', 'sprite/orc/PNG/Orc3/With_shadow/orc3_idle_with_shadow.png'],
      ['vampire1_idle', 'sprite/vampire/PNG/Vampires1/With_shadow/Vampires1_Idle_with_shadow.png'],
      ['vampire2_idle', 'sprite/vampire/PNG/Vampires2/With_shadow/Vampires2_Idle_with_shadow.png'],
      ['vampire3_idle', 'sprite/vampire/PNG/Vampires3/With_shadow/Vampires3_Idle_with_shadow.png'],
    ];
    bossSprites.forEach(([key, path]) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, path, cfg);
    });
    if (!this.textures.exists('icon_stone_broken')) this.load.image('icon_stone_broken', 'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact')) this.load.image('icon_stone_intact', 'other/ore1.webp');
    if (!this.textures.exists('icon_stone_guard')) this.load.image('icon_stone_guard', 'other/ore3.webp');
    if (!this.textures.exists('icon_quest_reroll')) this.load.image('icon_quest_reroll', 'other/ore4.webp');
    if (!this.textures.exists('icon_ticket_slime'))   this.load.image('icon_ticket_slime',   'icon1/PNG/Transperent/Icon21.png');
    if (!this.textures.exists('icon_ticket_flower'))  this.load.image('icon_ticket_flower',  'icon1/PNG/Transperent/Icon37.png');
    if (!this.textures.exists('icon_ticket_orc'))     this.load.image('icon_ticket_orc',     'icon1/PNG/Transperent/Icon44.png');
    if (!this.textures.exists('icon_ticket_vampire')) this.load.image('icon_ticket_vampire', 'icon1/PNG/Transperent/Icon42.png');
    if (!this.textures.exists('potions_sheet')) this.load.spritesheet('potions_sheet', 'items/potions.png', { frameWidth: 16, frameHeight: 16 });
    if (!this.textures.exists('icon_gold')) this.load.image('icon_gold', 'other/coin.webp');
    if (!this.textures.exists('icon_blank_card')) this.load.image('icon_blank_card', 'other/card.webp');
    // Town decorative animals
    const animalCfg = { frameWidth: 32, frameHeight: 32 };
    const animalDefs: [string, string, string][] = [
      ['Fox',          'Fox_Idle_with_shadow.png',          'Fox_walk_with_shadow.png'],
      ['Deer',         'Deer_Idle_with_shadow.png',         'Deer_Walk_with_shadow.png'],
      ['Hare',         'Hare_Idle_with_shadow.png',         'Hare_Walk_with_shadow.png'],
      ['Boar',         'Boar_Idle_with_shadow.png',         'Boar_Walk_with_shadow.png'],
      ['Black_grouse', 'Black_grouse_Idle_with_shadow.png', 'Black_grouse_Walk_with_shadow.png'],
    ];
    for (const [name, idleFile, walkFile] of animalDefs) {
      const base = `animal/PNG/With_Shadow/${name}`;
      if (!this.textures.exists(`animal_${name}_idle`))
        this.load.spritesheet(`animal_${name}_idle`, `${base}/${idleFile}`, animalCfg);
      if (!this.textures.exists(`animal_${name}_walk`))
        this.load.spritesheet(`animal_${name}_walk`, `${base}/${walkFile}`, animalCfg);
    }
    if (!this.cache.audio.exists('sfx_town_bgm'))   this.load.audio('sfx_town_bgm',    'sound/map2.mp3');
    if (!this.cache.audio.exists('sfx_ui_click'))   this.load.audio('sfx_ui_click',    'sound/plus.mp3');
    if (!this.cache.audio.exists('sfx_enhance_ok'))    this.load.audio('sfx_enhance_ok',    'sound/test-success.mp3');
    if (!this.cache.audio.exists('sfx_daily_claim'))   this.load.audio('sfx_daily_claim',   'sound/skill-2.mp3');
    if (!this.cache.audio.exists('sfx_enhance_ng')) this.load.audio('sfx_enhance_ng',  'sound/test-fail.mp3');
    if (!this.cache.audio.exists('sfx_purchase'))     this.load.audio('sfx_purchase',     'sound/openChest.mp3');
    if (!this.cache.audio.exists('sfx_battle_start')) this.load.audio('sfx_battle_start', 'sound/openMap.mp3');
    if (!this.cache.audio.exists('sfx_shop_open'))    this.load.audio('sfx_shop_open',    'sound/opendoor.mp3');
  }

  create(): void {
    if (!this.textures.exists('icon_potion_health_s')) {
      const POTION_FRAMES: Record<string, number> = {
        icon_potion_health_s: 89, icon_potion_health_m: 90,
        icon_potion_health_l: 101, icon_potion_revive: 93,
        icon_potion_atk: 91, icon_potion_def: 99, icon_potion_speed: 95,
      };
      const sheet = this.textures.get('potions_sheet');
      for (const [key, fi] of Object.entries(POTION_FRAMES)) {
        const frame = sheet.get(fi);
        const ct = this.textures.createCanvas(key, 16, 16);
        if (!ct) continue;
        (ct.getContext() as CanvasRenderingContext2D).drawImage(
          frame.source.image as HTMLImageElement, frame.cutX, frame.cutY, 16, 16, 0, 0, 16, 16);
        ct.refresh();
      }
    }
    const W = this.scale.width;
    const H = this.scale.height;
    this._sceneW = W;
    this._sceneH = H;

    this.add.text(P(6), H - P(6), VERSION, {
      fontSize: F(11), fontStyle: 'bold', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 1).setDepth(10);

    // 防止前一個 scene 的 pointerdown 穿透到本場景的按鈕
    this.input.enabled = false;
    this.time.delayedCall(300, () => { this.input.enabled = true; });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (this._townJoystick?.isInZone(p.x, p.y)) return;
      AudioService.playSfx(this, 'sfx_ui_click', 0.5, 100);
    });

    // 瀏覽器執行時嘗試觸控觸發全螢幕；PWA 已由 manifest 處理，失敗時靜默忽略
    // 使用 document.documentElement 而非 game-container，讓 Angular overlay 在全螢幕下仍可存取
    if (!document.fullscreenElement) {
      this.input.once('pointerdown', () => {
        try {
          if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        } catch { /* PWA manifest fullscreen 已接管，忽略 */ }
      });
    }

    const hasSave = SaveStore.load();
    if (!hasSave) {
      // 新玩家：隨機送一把普通品質武器
      const startSword = generateEquipment('sword', 'normal');
      PlayerStore.equipDirect('sword', startSword);
      InventoryStore.addItem('quest_reroll', '任務重製石', 10);
    }

    // 新玩家：自動進入教學關卡（1 星隨機地圖）
    if (TutorialStore.isNewPlayer()) {
      this.scene.start('BattleLoadScene', {
        ownSkinId:      SkinStore.get(),
        questStar:      1,
        bossMonsterId:  BOSS_POOL[0],
        mapTheme:       randomQuestTheme(),
        isTutorial:     true,
      });
      return;
    }

    this.generateItemIcons();

    // Always rebuild so frames reference the currently loaded texture (texture may have been
    // removed and reloaded by GameScene between visits to PrepScene)
    if (this.anims.exists('player_idle_shadow')) this.anims.remove('player_idle_shadow');
    this.anims.create({
      key: 'player_idle_shadow',
      frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }),
      frameRate: 5,
      repeat: 0,
    });

    this.createTownWorld(W, H);
    this.drawTopBar(W);
    this.drawBottomNav(W, H);

    const onGoldChange = () => {
      this.goldText?.setText(InventoryStore.getGold().toLocaleString());
    };
    InventoryStore.onChange(onGoldChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => InventoryStore.offChange(onGoldChange));

    // Auto-save on any store change
    const autoSave = () => SaveStore.save();
    PlayerStore.onChange(autoSave);
    InventoryStore.onChange(autoSave);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      PlayerStore.offChange(autoSave);
      InventoryStore.offChange(autoSave);
    });

    // Restore room state if returning from game while still connected.
    if (NetworkService.connected) {
      if (NetworkService.partyMode) {
        // Returned from game via party invite — restore party panel
        this._partyState    = 'in_party';
        this._amPartyLeader = NetworkService.isHost;
        const partners = NetworkService.getPartnersState() as any[];
        this._partnerIn   = partners.length > 0;
        // Sort: leader first so _partyMembers[0] is always the host (guest panel depends on this)
        const hostSid = NetworkService.hostSessionId;
        const sorted  = [
          ...partners.filter((p: any) => p.sessionId === hostSid),
          ...partners.filter((p: any) => p.sessionId !== hostSid),
        ];
        this._partnerNick = sorted[0]?.nickname ?? '';
        // Pre-populate _partyMembers from current room state so panel renders immediately
        this._partyMembers = sorted
          .filter((p: any) => p.sessionId)
          .map((p: any) => ({ sid: p.sessionId, nick: p.nickname ?? '隊友', level: p.level ?? 0 }));
        this._setupGameRoomCallbacks();
        // sendPlayerInfo triggers server to re-send all partners' partnerJoined → names update
        NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
        this.time.delayedCall(100, () => this._buildPartyPanel());
      } else {
        NetworkService.onPartnerJoined(data => {
          this._partnerIn = true;
          this._partnerNick = data.nickname || this._partnerNick || '?';
          this._partnerLevel = data.level || this._partnerLevel || 1;
          this._partnerSkinId = data.skinId ?? this._partnerSkinId ?? 0;
          this.refreshRoomOverlay();
        });
        NetworkService.onPartnerLeft(() => { this._partnerIn = false; this.refreshRoomOverlay(); });
        NetworkService.onRoomClosed(() => { NetworkService.disconnect(); this._partnerIn = false; this.refreshRoomOverlay(); this._showToast('房主已離開，房間關閉'); });
        NetworkService.onGameStart(p => {
          if (NetworkService.isHost) {
            AudioService.playSfx(this, 'sfx_battle_start');
          this.scene.start('BattleLoadScene', {
              seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
              mapParams: p.mapParams, partnerNickname: p.guestNickname,
              ownSkinId: p.hostSkinId, partnerSkinId: p.guestSkinId,
              playerCount: p.playerCount ?? 2, mapTheme: p.mapTheme,
            });
          } else {
            try { if (p.questId) QuestStore.acceptQuest(p.questId); } catch { /* guest */ }
            AudioService.playSfx(this, 'sfx_battle_start');
          this.scene.start('BattleLoadScene', {
              seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
              mapParams: p.mapParams, partnerNickname: p.hostNickname,
              ownSkinId: p.guestSkinId, partnerSkinId: p.hostSkinId,
              playerCount: p.playerCount ?? 2, mapTheme: p.mapTheme,
            });
          }
        });
        NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
        this.time.delayedCall(100, () => this.refreshRoomOverlay());
      }
    } else {
      this.time.delayedCall(100, () => this.refreshRoomOverlay());
    }

    if (!sessionStorage.getItem('changelog_shown')) {
      sessionStorage.setItem('changelog_shown', '1');
      this.showChangelog();
    } else {
      AudioService.playBgm(this, 'sfx_town_bgm', 0.5);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => AudioService.stopBgm());
  }

  // ── Item icon textures (shared with GameScene) ──────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateItemIcons(): void {
    const mk = (fn: (g: Phaser.GameObjects.Graphics) => void, key: string, sz = 32) => {
      if (this.textures.exists(key)) return;
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      fn(g);
      g.generateTexture(key, sz, sz);
      g.destroy();
    };

    mk(g => {
      g.fillStyle(0x44cc44, 1); g.fillCircle(16, 18, 13);
      g.fillStyle(0x22aa22, 1); g.fillCircle(10, 22, 8); g.fillCircle(22, 22, 8);
      g.fillStyle(0x88ff88, 0.5); g.fillCircle(12, 12, 5);
    }, 'icon_slime_chunk');

    mk(g => {
      g.fillStyle(0x44ddaa, 1); g.fillCircle(16, 20, 10);
      g.fillStyle(0x22bbaa, 1); g.fillTriangle(16, 4, 8, 20, 24, 20);
      g.fillStyle(0xaaffee, 0.6); g.fillCircle(13, 14, 4);
    }, 'icon_slime_essence');

    // icon_gold 已在 preload 以真實圖片載入
  }

  // ── 更新日誌 popup ──────────────────────────────────────

  private showChangelog(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const DEPTH = 200;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const track = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

    const PW = Math.min(P(320), Math.round(W * 0.88));
    const PH = Math.min(Math.round(H * 0.82), P(400));
    const PX = Math.round((W - PW) / 2);
    const PY = Math.max(Math.round(H * 0.05), Math.round((H - PH) / 2));
    const CR = P(10);

    // Full-screen input blocker — only button can close
    track(this.add.rectangle(W / 2, H / 2, W, H).setDepth(DEPTH).setInteractive());

    const dim = track(this.add.graphics().setDepth(DEPTH + 1));
    dim.fillStyle(0x000000, 0.72);
    dim.fillRect(0, 0, W, H);

    const panel = track(this.add.graphics().setDepth(DEPTH + 2));
    panel.fillStyle(0x000000, 0.45);
    panel.fillRoundedRect(PX + P(3), PY + P(3), PW, PH, CR);
    panel.fillStyle(WB, 1);
    panel.fillRoundedRect(PX, PY, PW, PH, CR);
    panel.fillStyle(WD, 0.3);
    panel.fillRoundedRect(PX + P(2), PY + P(2), PW - P(4), PH - P(4), CR - P(2));
    panel.lineStyle(P(2), GOLD, 0.9);
    panel.strokeRoundedRect(PX, PY, PW, PH, CR);
    panel.lineStyle(P(1), WL, 0.35);
    panel.lineBetween(PX + P(14), PY + P(46), PX + PW - P(14), PY + P(46));

    // Title
    const TITLE_CY = PY + P(23);
    track(this.add.text(W / 2, TITLE_CY, '更新日誌', {
      fontSize: F(15), fontStyle: 'bold', color: '#d4a044',
      stroke: '#1a0e06', strokeThickness: P(3),
    }).setOrigin(0.5).setDepth(DEPTH + 3));

    track(this.add.text(PX + PW - P(12), TITLE_CY, VERSION, {
      fontSize: F(15), fontStyle: 'bold', color: '#7a5030',
    }).setOrigin(1, 0.5).setDepth(DEPTH + 3));

    // Scroll area
    const BTN_AREA = P(52);
    const SX = PX + P(12);
    const SY = PY + P(50);
    const SBW = P(5);
    const SBX = PX + PW - P(10) - SBW;
    const SW = SBX - SX - P(4);   // content width, leaves gap before scrollbar
    const SH = PH - P(50) - BTN_AREA;

    // Content
    const ENTRIES: { text: string; header?: boolean }[] = [
      { text: '── 先行版 ──', header: true },
      { text: '目前開始不刪檔測試' },
      { text: '如果有BUG請到右上角點選錯誤回報' },
      { text: '有什麼建議也都可以跟我說' },
    ];

    const content = track(this.add.container(SX, SY).setDepth(DEPTH + 3)) as Phaser.GameObjects.Container;
    let totalH = 0;
    for (const e of ENTRIES) {
      if (!e.text) { totalH += P(10); continue; }
      const t = this.make.text({ x: P(2), y: totalH, text: e.text, style: {
        fontSize: F(15), fontStyle: 'bold',
        color: e.header ? '#d4a044' : '#b89060',
        wordWrap: { width: SW - P(4) },
      }, add: false });
      content.add(t);
      totalH += t.height + P(6);
    }

    // Geometry mask (clips content to scroll area)
    const maskGfx = this.make.graphics({ x: 0, y: 0 });
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(SX, SY, SW, SH);
    content.setMask(maskGfx.createGeometryMask());

    // Scrollbar track
    const sbTrack = track(this.add.graphics().setDepth(DEPTH + 3));
    sbTrack.fillStyle(WBD, 0.8);
    sbTrack.fillRoundedRect(SBX, SY, SBW, SH, P(2));

    const sbThumb = track(this.add.graphics().setDepth(DEPTH + 4));
    const maxScroll = Math.max(0, totalH - SH);
    const updateScrollbar = (sy: number) => {
      sbThumb.clear();
      if (maxScroll <= 0) return;
      const thumbH = Math.max(P(24), SH * (SH / totalH));
      const thumbY = SY + (sy / maxScroll) * (SH - thumbH);
      sbThumb.fillStyle(WL, 0.85);
      sbThumb.fillRoundedRect(SBX, thumbY, SBW, thumbH, P(2));
    };
    updateScrollbar(0);

    // Drag scroll — 用座標判斷取代 zone，避免 blocker 吃掉事件
    let scrollY = 0;
    let isDragging = false;
    let lastPY = 0;

    const inScrollArea = (ptr: Phaser.Input.Pointer) =>
      ptr.x >= SX && ptr.x <= SX + SW && ptr.y >= SY && ptr.y <= SY + SH;

    const onDown = (ptr: Phaser.Input.Pointer) => {
      if (inScrollArea(ptr)) { isDragging = true; lastPY = ptr.y; }
    };
    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (!isDragging) return;
      scrollY = Phaser.Math.Clamp(scrollY + (lastPY - ptr.y), 0, maxScroll);
      lastPY = ptr.y;
      content.y = SY - scrollY;
      updateScrollbar(scrollY);
    };
    const onUp = () => { isDragging = false; };
    const onWheel = (_p: unknown, _go: unknown, _dx: number, dy: number) => {
      scrollY = Phaser.Math.Clamp(scrollY + dy * 0.6, 0, maxScroll);
      content.y = SY - scrollY;
      updateScrollbar(scrollY);
    };
    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup',   onUp);
    this.input.on('wheel',       onWheel);

    // Confirm button
    const BTN_W = P(130), BTN_H = P(38);
    const BCX = W / 2;
    const BCY = PY + PH - P(28);
    const bx = BCX - BTN_W / 2;
    const by = BCY - BTN_H / 2;

    const btnGfx = track(this.add.graphics().setDepth(DEPTH + 3));
    const drawBtn = (hover: boolean) => {
      btnGfx.clear();
      btnGfx.fillStyle(0x000000, 0.4);
      btnGfx.fillRoundedRect(bx + P(2), by + P(2), BTN_W, BTN_H, P(8));
      btnGfx.fillStyle(hover ? WL : WM, 1);
      btnGfx.fillRoundedRect(bx, by, BTN_W, BTN_H, P(8));
      btnGfx.lineStyle(P(2), GOLD, hover ? 1 : 0.75);
      btnGfx.strokeRoundedRect(bx, by, BTN_W, BTN_H, P(8));
    };
    drawBtn(false);

    track(this.add.text(BCX, BCY, '確  定', {
      fontSize: F(15), fontStyle: 'bold', color: '#d4a044',
      stroke: '#1a0e06', strokeThickness: P(2),
    }).setOrigin(0.5).setDepth(DEPTH + 4));

    const hit = track(this.add.rectangle(BCX, BCY, BTN_W, BTN_H)
      .setDepth(DEPTH + 5).setInteractive({ useHandCursor: true }));
    hit.on('pointerover', () => drawBtn(true));
    hit.on('pointerout',  () => drawBtn(false));
    hit.on('pointerdown', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup',   onUp);
      this.input.off('wheel',       onWheel);
      maskGfx.destroy();
      AudioService.playBgm(this, 'sfx_town_bgm', 0.5);
      objs.forEach(o => o.destroy());
    });
  }

  // ── Background ──────────────────────────────────────────

  private drawBackground(W: number, H: number): void {
    const img = this.add.image(W / 2, H / 2 - 60, 'bg_prep');
    img.setDisplaySize(W * 1.4, H * 1.4).setOrigin(0.5);

    // Dark overlay
    const ov = this.add.graphics();
    ov.fillStyle(0x000000, 0.15);
    ov.fillRect(0, 0, W, H);

    // Vignette — top, bottom, left, right edges
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0);
    vig.fillRect(0, 0, W, H / 3);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.55, 0.55);
    vig.fillRect(0, H * 0.65, W, H * 0.35);
    // Side vignettes
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    vig.fillRect(0, 0, W * 0.18, H);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    vig.fillRect(W * 0.82, 0, W * 0.18, H);

    // Warm ground light pool — where the hero stands
    const heroPoolY = H * 0.58;
    const pool = this.add.graphics().setDepth(2);
    pool.fillStyle(0xff6622, 0.07);
    pool.fillEllipse(W / 2, heroPoolY, W * 0.55, H * 0.22);
    pool.fillStyle(0xff9944, 0.04);
    pool.fillEllipse(W / 2, heroPoolY, W * 0.75, H * 0.30);
    this.tweens.add({
      targets: pool, alpha: { from: 0.8, to: 1.15 },
      duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ── Top bar: compact floating player card ──────────────

  private drawTopBar(W: number): void {
    const H = this.scale.height;

    // ── Player card (top-left) — level | name / exp / gold ─
    const CARD_W = P(196), CARD_H = P(76);
    const CX = P(4), CY = P(4);
    const AV_R  = P(22);
    const AV_CX = CX + P(10) + AV_R;
    const AV_CY = CY + CARD_H / 2;
    const TXT_X = AV_CX + AV_R + P(10);
    const TXT_W = CARD_W - (TXT_X - CX) - P(8);

    // Card bg
    const gfx = this.add.graphics().setDepth(30);
    gfx.fillStyle(0x000000, 0.5);
    gfx.fillRoundedRect(CX + P(2), CY + P(2), CARD_W, CARD_H, P(10));
    gfx.fillStyle(WB, 0.92);
    gfx.fillRoundedRect(CX, CY, CARD_W, CARD_H, P(10));
    gfx.lineStyle(1.5, GOLD, 0.55);
    gfx.strokeRoundedRect(CX, CY, CARD_W, CARD_H, P(10));
    gfx.fillStyle(GOLD, 0.08);
    gfx.fillRoundedRect(CX + P(1), CY + P(1), CARD_W - P(2), P(10),
      { tl: P(10), tr: P(10), bl: 0, br: 0 });
    // Divider between avatar and text
    gfx.lineStyle(1, GOLD, 0.2);
    gfx.lineBetween(AV_CX + AV_R + P(5), CY + P(10), AV_CX + AV_R + P(5), CY + CARD_H - P(10));

    // Level circle
    const avG = this.add.graphics().setDepth(31);
    avG.fillStyle(WMI, 1);
    avG.fillCircle(AV_CX, AV_CY, AV_R);
    avG.lineStyle(2.5, GOLD, 0.9);
    avG.strokeCircle(AV_CX, AV_CY, AV_R);
    avG.lineStyle(1, WH, 0.25);
    avG.strokeCircle(AV_CX, AV_CY, AV_R - P(4));

    const lvAvatar = this.add.text(AV_CX, AV_CY, `${PlayerStore.getLevel()}`, {
      fontSize: F(19), fontStyle: 'bold',
      color: '#ffe0a0', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(32);

    // Name
    this.add.text(TXT_X, CY + P(12), getPlayerName(), {
      fontSize: F(15), fontStyle: 'bold',
      color: '#ffe8b0', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0).setDepth(32);

    // EXP bar
    const EXP_Y = CY + P(34);
    const expTrack = this.add.graphics().setDepth(32);
    expTrack.fillStyle(0x080402, 1);
    expTrack.fillRoundedRect(TXT_X, EXP_Y, TXT_W, P(8), P(4));
    expTrack.lineStyle(1, GOLD, 0.3);
    expTrack.strokeRoundedRect(TXT_X, EXP_Y, TXT_W, P(8), P(4));
    const expFillGfx = this.add.graphics().setDepth(33);

    // Gold row
    const GOLD_Y = CY + P(54);
    this.add.image(TXT_X + P(7), GOLD_Y, 'icon_coin')
      .setDisplaySize(P(14), P(14)).setDepth(31);
    this.goldText = this.add.text(TXT_X + P(19), GOLD_Y,
      InventoryStore.getGold().toLocaleString(), {
      fontSize: F(13), fontStyle: 'bold',
      color: '#f0d090', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(31);

    // Tap card → edit name
    this.add.rectangle(CX + CARD_W / 2, CY + CARD_H / 2, CARD_W, CARD_H)
      .setInteractive({ useHandCursor: true }).setDepth(34).setAlpha(0.001)
      .on('pointerdown', () => this.showNameEditDialog(W, H));

    // ── Settings button (top-right only) ──────────────────
    const SET_S = P(36);
    const SET_X = W - SET_S - P(4), SET_Y = P(4);
    const sg = this.add.graphics().setDepth(30);
    sg.fillStyle(0x000000, 0.5);
    sg.fillRoundedRect(SET_X + P(2), SET_Y + P(2), SET_S, SET_S, P(8));
    sg.fillStyle(WB, 0.92);
    sg.fillRoundedRect(SET_X, SET_Y, SET_S, SET_S, P(8));
    sg.fillStyle(0xffffff, 0.04);
    sg.fillRoundedRect(SET_X + P(1), SET_Y + P(1), SET_S - P(2), SET_S * 0.45,
      { tl: P(7), tr: P(7), bl: 0, br: 0 });
    sg.lineStyle(1.5, GOLD, 0.4);
    sg.strokeRoundedRect(SET_X, SET_Y, SET_S, SET_S, P(8));
    this.add.text(SET_X + SET_S / 2, SET_Y + SET_S / 2 + P(1), '≡', {
      fontSize: F(20), color: '#d4a050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(31);
    this.add.rectangle(SET_X + SET_S / 2, SET_Y + SET_S / 2, SET_S, SET_S)
      .setInteractive({ useHandCursor: true }).setDepth(35).setAlpha(0.001)
      .on('pointerup', () => { AudioService.suppressClickSfx(); this._showAudioPanel(W, H); });

    // ── Quick-access buttons (horizontal, bottom-right) ───
    const QB_S   = SET_S * 1.5;
    const QB_GAP = P(6);
    const qbItems: { label: string; onClick: () => void }[] = [
      { label: '裝備', onClick: () => this.showEquipmentPanel(W, H) },
      { label: '技能', onClick: () => this._showTutorialHint('skill', '✦', '技能樹',
          '每達到 5 等可獲得一個技能點。你也可以在這裡切換攻擊模式（投射／近戰／範圍），找到最適合你的打法！',
          () => this.showSkillTree(W, H)) },
      { label: '卡片', onClick: () => this.openCardWindow(W, H) },
      { label: '物品', onClick: () => this.showItemPanel(W, H) },
      { label: '任務', onClick: () => { AudioService.suppressClickSfx(); this.showDailyQuestPanel(W, H); } },
    ];
    const qbGfx = this.add.graphics().setDepth(30);
    const QB_BOT = H - P(8);
    qbItems.slice().reverse().forEach((item, ri) => {
      const bx = W - P(8) - QB_S * (ri + 1) - QB_GAP * ri;
      const by = QB_BOT - QB_S;
      qbGfx.fillStyle(0x000000, 0.45);
      qbGfx.fillRoundedRect(bx + P(2), by + P(2), QB_S, QB_S, P(10));
      qbGfx.fillStyle(WB, 0.92);
      qbGfx.fillRoundedRect(bx, by, QB_S, QB_S, P(10));
      qbGfx.fillStyle(0xffffff, 0.04);
      qbGfx.fillRoundedRect(bx + P(1), by + P(1), QB_S - P(2), QB_S * 0.45, P(9));
      qbGfx.lineStyle(1.5, GOLD, 0.45);
      qbGfx.strokeRoundedRect(bx, by, QB_S, QB_S, P(10));
      this.add.text(bx + QB_S / 2, by + QB_S / 2, item.label, {
        fontSize: F(15), fontStyle: 'bold', color: '#e8cc90', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(31);
      this.add.rectangle(bx + QB_S / 2, by + QB_S / 2, QB_S, QB_S)
        .setInteractive({ useHandCursor: true }).setDepth(35).setAlpha(0.001)
        .on('pointerdown', item.onClick);
    });

    // 任務紅點（'任務' is at ri=0, rightmost position）
    const dqBx = W - P(8) - QB_S;
    const dqBy = QB_BOT - QB_S;
    const dqDot = this.add.graphics().setDepth(36);
    const refreshDqDot = () => {
      dqDot.clear();
      if (DailyQuestStore.hasCompletedUnclaimed()) {
        dqDot.fillStyle(0xff2222, 1);
        dqDot.fillCircle(dqBx + QB_S - P(5), dqBy + P(5), P(5));
      }
    };
    refreshDqDot();
    DailyQuestStore.onChange(refreshDqDot);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => DailyQuestStore.offChange(refreshDqDot));

    // ── Reactive updates ──────────────────────────────────
    const drawExpBar = () => {
      const pct = Phaser.Math.Clamp(PlayerStore.getExp() / PlayerStore.expToNext(), 0, 1);
      expFillGfx.clear();
      if (pct > 0) {
        const fillW = Math.max(P(3), (TXT_W - 2) * pct);
        expFillGfx.fillStyle(0xc87020, 1);
        expFillGfx.fillRoundedRect(TXT_X + 1, EXP_Y + 1, fillW, P(6), P(3));
        expFillGfx.fillStyle(0xffcc44, 0.4);
        expFillGfx.fillRoundedRect(TXT_X + 1, EXP_Y + 1, fillW, P(3),
          { tl: P(3), tr: P(3), bl: 0, br: 0 });
      }
      lvAvatar.setText(`${PlayerStore.getLevel()}`);
    };
    drawExpBar();
    PlayerStore.onChange(drawExpBar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PlayerStore.offChange(drawExpBar));
  }

  // ── Wardrobe panel ─────────────────────────────────────

  private _openWardrobePanel(): void {
    const W = this._sceneW, H = this.scale.height;
    const PD = 30;
    const COLS = 2;
    const CARD_W = P(100), CARD_H = P(110);
    const GAP = P(12);
    const panelW = COLS * CARD_W + (COLS + 1) * GAP;
    const panelH = Math.ceil(SKINS.length / COLS) * (CARD_H + GAP) + GAP + P(PD);
    const px = W / 2, py = H / 2 - P(20);
    const wardObjs: Phaser.GameObjects.GameObject[] = [];
    const bg = this.add.graphics().setDepth(60);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(0, 0, W, H);
    bg.fillStyle(WB, 1);
    bg.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, P(12));
    bg.lineStyle(1.5, 0xffd060, 0.6);
    bg.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, P(12));
    wardObjs.push(bg);
    const title = this.add.text(px, py - panelH / 2 + P(14), '選擇造型', {
      fontSize: F(15), color: '#ffd060', fontStyle: 'bold',
    }).setOrigin(0.5, 0).setDepth(61);
    wardObjs.push(title);
    const currentSkin = SkinStore.get();
    SKINS.forEach((skin, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cardCx = px - panelW / 2 + GAP + col * (CARD_W + GAP) + CARD_W / 2;
      const cardCy = py - panelH / 2 + P(PD) + GAP + row * (CARD_H + GAP) + CARD_H / 2;
      const isSelected = i === currentSkin;
      const cardGfx = this.add.graphics().setDepth(61);
      const drawCard = (hover: boolean) => {
        cardGfx.clear();
        cardGfx.fillStyle(isSelected ? 0x3a2200 : (hover ? 0x2a1800 : WBD), 1);
        cardGfx.fillRoundedRect(cardCx - CARD_W / 2, cardCy - CARD_H / 2, CARD_W, CARD_H, P(8));
        cardGfx.lineStyle(1.5, isSelected ? 0xffd060 : (hover ? 0xaa7722 : 0x554422), isSelected ? 1 : 0.7);
        cardGfx.strokeRoundedRect(cardCx - CARD_W / 2, cardCy - CARD_H / 2, CARD_W, CARD_H, P(8));
      };
      drawCard(false);
      wardObjs.push(cardGfx);
      const previewKey = `skin_preview_${i}`;
      const sp = this.add.sprite(cardCx, cardCy - P(14), previewKey)
        .setScale(1.6 * DPR).setDepth(62).setFrame(0);
      wardObjs.push(sp);
      const lbl = this.add.text(cardCx, cardCy + CARD_H / 2 - P(18), skin.label, {
        fontSize: F(15), color: isSelected ? '#ffd060' : '#c8a060',
      }).setOrigin(0.5).setDepth(62);
      wardObjs.push(lbl);
      const hit = this.add.rectangle(cardCx, cardCy, CARD_W, CARD_H)
        .setInteractive({ useHandCursor: true }).setDepth(63);
      wardObjs.push(hit);
      hit.on('pointerover', () => { if (!isSelected) drawCard(true); });
      hit.on('pointerout', () => { if (!isSelected) drawCard(false); });
      hit.on('pointerdown', () => {
        wardObjs.forEach(o => o.destroy());
        if (i === currentSkin) return;
        if (this._partyState !== 'none') {
          this._showToast('組隊中無法換造型');
          return;
        }
        SkinStore.set(i);
        SaveStore.save();
        this.scene.restart();
      });
    });
    const closeBg = this.add.rectangle(W / 2, H / 2, W, H)
      .setInteractive().setDepth(59).setAlpha(0.001);
    wardObjs.push(closeBg);
    closeBg.on('pointerdown', () => wardObjs.forEach(o => o.destroy()));
  }

  // ── Multi button infrastructure (party system deferred) ─

  private drawBottomNav(_W: number, _H: number): void {
    // Multi button kept as invisible stub so network overlay code compiles
    this._multiBtnTxt = this.add.text(0, 0, '').setVisible(false);
    this._multiBtnHit = this.add.rectangle(0, 0, 1, 1) as Phaser.GameObjects.Rectangle;
    this._multiBtnHit.on('pointerdown', () => this.showMultiPopup());
    const drawMultiBtn = (_connected: boolean) => { /* party system TBD */ };
    drawMultiBtn(false);
    (this as any)._drawMultiBtn = drawMultiBtn;
  }


  // ── Craft panel ─────────────────────────────────────────



  // ── Quest panel (wanted posters, horizontal scroll) ────

  private _showAudioPanel(W: number, H: number): void {
    const D   = 9000;
    const PW  = Math.min(W - P(16), P(300));
    const PH  = P(335);
    const px  = (W - PW) / 2;
    const py  = (H - PH) / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => objs.forEach(o => o.destroy());

    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
      .setInteractive().setDepth(D);
    objs.push(bd);
    bd.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < px || ptr.x > px + PW || ptr.y < py || ptr.y > py + PH) close();
    });

    const bg = this.add.graphics().setDepth(D + 1);
    objs.push(bg);
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(px + P(4), py + P(4), PW, PH);
    bg.fillStyle(0xa06810, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(0x160e04, 1);
    bg.fillRect(px, py, PW, PH);
    bg.fillStyle(0x241408, 1);
    bg.fillRect(px, py, PW, P(38));
    bg.fillStyle(0x3a2010, 1);
    bg.fillRect(px, py, PW, P(16));

    const addTxt = (txt: string, x: number, y: number, style: object, ox = 0.5, oy = 0) => {
      const o = this.add.text(x, y, txt, style).setOrigin(ox, oy).setDepth(D + 2);
      objs.push(o); return o;
    };

    addTxt('功能選項', px + PW / 2, py + P(10), {
      fontSize: F(17), fontStyle: 'bold', color: '#ffe08a', stroke: '#1a0800', strokeThickness: 2,
    });
    const closeX = this.add.text(px + PW - P(8), py + P(8), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc7744',
    }).setOrigin(1, 0).setDepth(D + 2);
    objs.push(closeX);
    const closeXHit = this.add.rectangle(px + PW - P(16), py + P(16), P(44), P(44)).setDepth(D + 3).setInteractive({ useHandCursor: true }).setAlpha(0.001);
    objs.push(closeXHit);
    closeXHit.on('pointerup', close);

    const STEP = 0.05;
    const rows: { key: '背景音樂' | '音效'; get: () => number; set: (v: number) => void }[] = [
      { key: '背景音樂', get: () => AudioService.bgmVolume, set: v => AudioService.setBgmVolume(v) },
      { key: '音效',    get: () => AudioService.sfxVolume,  set: v => AudioService.setSfxVolume(v)  },
    ];

    rows.forEach((row, i) => {
      const ry = py + P(50) + i * P(66);

      addTxt(row.key, px + P(14), ry, { fontSize: F(15), fontStyle: 'bold', color: '#e8cc90' }, 0, 0);

      const barX = px + P(14), barW = PW - P(28), barH = P(10), barY = ry + P(22);
      const barBg = this.add.graphics().setDepth(D + 2);
      objs.push(barBg);

      const valTxt = addTxt('', px + PW / 2, ry + P(36), {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe08a',
      });

      const redraw = () => {
        const v = row.get();
        barBg.clear();
        barBg.fillStyle(0x0a0604, 1);
        barBg.fillRoundedRect(barX, barY, barW, barH, P(4));
        barBg.fillStyle(0xcc8822, 1);
        barBg.fillRoundedRect(barX, barY, Math.round(barW * v), barH, P(4));
        (valTxt as Phaser.GameObjects.Text).setText(`${Math.round(v * 100)}%`);
      };
      redraw();

      // draggable bar
      const barHit = this.add.rectangle(barX + barW / 2, barY + barH / 2, barW, barH + P(10))
        .setDepth(D + 3).setAlpha(0.001).setInteractive({ useHandCursor: true, draggable: true });
      objs.push(barHit);
      barHit.on('drag', (ptr: Phaser.Input.Pointer) => {
        const localX = Phaser.Math.Clamp(ptr.x - barX, 0, barW);
        row.set(Math.round((localX / barW) * 20) / 20);
        SaveStore.save();
        redraw();
      });
      barHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        const localX = Phaser.Math.Clamp(ptr.x - barX, 0, barW);
        row.set(Math.round((localX / barW) * 20) / 20);
        SaveStore.save();
        redraw();
      });

      // − + buttons
      const btnStyle = { fontSize: F(17), fontStyle: 'bold', color: '#ffe08a', stroke: '#1a0800', strokeThickness: 1 };
      const minusBtn = addTxt('−', px + P(14), ry + P(36), btnStyle, 0, 0.5);
      minusBtn.setInteractive({ useHandCursor: true })
        .on('pointerup', () => { row.set(Math.max(0, Math.round((row.get() - STEP) * 20) / 20)); SaveStore.save(); redraw(); });

      const plusBtn = addTxt('+', px + PW - P(14), ry + P(36), btnStyle, 1, 0.5);
      plusBtn.setInteractive({ useHandCursor: true })
        .on('pointerup', () => { row.set(Math.min(1, Math.round((row.get() + STEP) * 20) / 20)); redraw(); });
    });

    // ── 修改密碼按鈕 ──────────────────────────────────────────
    const BTN_H = P(32);
    const BTN_W = PW - P(28);
    const BTN_X = px + P(14);
    const CPBTN_Y = py + PH - P(14) - BTN_H - P(10) - BTN_H - P(10) - BTN_H;

    const cpbg = this.add.graphics().setDepth(D + 2);
    objs.push(cpbg);
    cpbg.fillStyle(0x0a1a0a, 1);
    cpbg.fillRoundedRect(BTN_X, CPBTN_Y, BTN_W, BTN_H, P(6));
    cpbg.lineStyle(1, 0x2a8a2a, 0.8);
    cpbg.strokeRoundedRect(BTN_X, CPBTN_Y, BTN_W, BTN_H, P(6));

    const cpTxt = this.add.text(BTN_X + BTN_W / 2, CPBTN_Y + BTN_H / 2, '修改密碼', {
      fontSize: F(15), fontStyle: 'bold', color: '#77ff99', stroke: '#001a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(cpTxt);

    const cpHit = this.add.rectangle(BTN_X + BTN_W / 2, CPBTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(cpHit);
    cpHit.on('pointerup', () => { close(); this._showChangePasswordPanel(W, H); });

    // ── 回報問題按鈕 ──────────────────────────────────────────
    const RBTN_Y = py + PH - P(14) - BTN_H - P(10) - BTN_H;

    const rbg = this.add.graphics().setDepth(D + 2);
    objs.push(rbg);
    rbg.fillStyle(0x0a1a2a, 1);
    rbg.fillRoundedRect(BTN_X, RBTN_Y, BTN_W, BTN_H, P(6));
    rbg.lineStyle(1, 0x2a5a8a, 0.8);
    rbg.strokeRoundedRect(BTN_X, RBTN_Y, BTN_W, BTN_H, P(6));

    const rTxt = this.add.text(BTN_X + BTN_W / 2, RBTN_Y + BTN_H / 2, '回報問題', {
      fontSize: F(15), fontStyle: 'bold', color: '#77bbff', stroke: '#001a2a', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(rTxt);

    const rHit = this.add.rectangle(BTN_X + BTN_W / 2, RBTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(rHit);
    rHit.on('pointerup', () => { close(); (window as any).__openReport?.(); });

    // ── 登出按鈕 ──────────────────────────────────────────────
    const LBTN_H = P(32);
    const LBTN_Y = py + PH - P(14) - LBTN_H;
    const LBTN_X = px + P(14);
    const LBTN_W = PW - P(28);

    const lbg = this.add.graphics().setDepth(D + 2);
    objs.push(lbg);
    lbg.fillStyle(0x3a1008, 1);
    lbg.fillRoundedRect(LBTN_X, LBTN_Y, LBTN_W, LBTN_H, P(6));
    lbg.lineStyle(1, 0xa04020, 0.8);
    lbg.strokeRoundedRect(LBTN_X, LBTN_Y, LBTN_W, LBTN_H, P(6));

    const lTxt = this.add.text(LBTN_X + LBTN_W / 2, LBTN_Y + LBTN_H / 2, '登出', {
      fontSize: F(15), fontStyle: 'bold', color: '#ff9977', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(lTxt);

    const lHit = this.add.rectangle(LBTN_X + LBTN_W / 2, LBTN_Y + LBTN_H / 2, LBTN_W, LBTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(lHit);
    lHit.on('pointerup', () => {
      localStorage.removeItem('rg_user');
      localStorage.removeItem('rg_auto_login');
      localStorage.removeItem('rg_remember');
      localStorage.removeItem('auto_rpg_save');
      localStorage.removeItem('rg_save_ts');
      localStorage.removeItem('playerName');
      window.location.reload();
    });

    objs.forEach(o => { if ('setScrollFactor' in o) (o as any).setScrollFactor(0); });
  }

  private _showTutorialHint(
    key: TutorialKey,
    _icon: string,
    title: string,
    body: string,
    then: () => void,
  ): void {
    if (TutorialStore.isDone(key)) { then(); return; }

    const vw = Math.min(window.innerWidth, window.innerHeight) < 500
      ? window.innerWidth : window.innerWidth;
    const bw = Math.min(vw - 32, 320);

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '99000',
      background: 'rgba(0,0,0,0.72)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      width: `${bw}px`,
      maxHeight: `${window.innerHeight * 0.8}px`,
      background: '#160e04',
      border: '2px solid #a06810',
      borderRadius: '12px',
      fontFamily: 'sans-serif',
      boxShadow: '0 0 24px rgba(160,104,16,0.4)',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    });

    const header = document.createElement('div');
    Object.assign(header.style, {
      background: '#241408',
      padding: '13px 18px',
      borderBottom: '1px solid #3a2010',
      fontSize: '17px', fontWeight: 'bold', color: '#ffe08a',
      flexShrink: '0',
    });
    header.textContent = title;

    const bodyEl = document.createElement('p');
    Object.assign(bodyEl.style, {
      color: '#ddd0b0', fontSize: '15px', fontWeight: 'bold',
      lineHeight: '1.8', margin: '16px 18px 18px',
      whiteSpace: 'pre-line', flexShrink: '1', overflowY: 'auto',
    });
    bodyEl.textContent = body;

    const btn = document.createElement('button');
    btn.textContent = '知道了';
    Object.assign(btn.style, {
      display: 'block', margin: '0 auto 18px',
      background: '#5a3400', color: '#ffe08a',
      border: '1px solid #cc9030', borderRadius: '8px',
      padding: '10px 48px', fontSize: '15px',
      fontWeight: 'bold', cursor: 'pointer', flexShrink: '0',
    });

    const confirm = () => {
      overlay.remove();
      TutorialStore.markDone(key);
      SaveStore.save();
      then();
    };
    btn.addEventListener('click', confirm);

    box.appendChild(header);
    box.appendChild(bodyEl);
    box.appendChild(btn);
    overlay.appendChild(box);

    document.body.appendChild(overlay);
  }

  private _showChangePasswordPanel(W: number, H: number): void {
    const D  = 9100;
    const PW = Math.min(W - P(16), P(320));
    const PH = P(310);
    const px = (W - PW) / 2;
    const py = (H - PH) / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const domObjs: HTMLElement[] = [];
    const close = () => { objs.forEach(o => o.destroy()); domObjs.forEach(e => e.remove()); };

    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
      .setInteractive().setDepth(D);
    objs.push(bd);

    const bg = this.add.graphics().setDepth(D + 1);
    objs.push(bg);
    bg.fillStyle(0x000000, 0.5);
    bg.fillRect(px + P(4), py + P(4), PW, PH);
    bg.fillStyle(0x2a8a2a, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(0x060e06, 1);
    bg.fillRect(px, py, PW, PH);
    bg.fillStyle(0x0a1e0a, 1);
    bg.fillRect(px, py, PW, P(38));
    bg.fillStyle(0x122812, 1);
    bg.fillRect(px, py, PW, P(16));

    const addTxt = (txt: string, x: number, y: number, style: object, ox = 0.5) => {
      const o = this.add.text(x, y, txt, style).setOrigin(ox, 0).setDepth(D + 2);
      objs.push(o); return o;
    };

    addTxt('修改密碼', px + PW / 2, py + P(10), {
      fontSize: F(17), fontStyle: 'bold', color: '#77ff99', stroke: '#001000', strokeThickness: 2,
    });

    const closeX = this.add.text(px + PW - P(8), py + P(8), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#55cc55',
    }).setOrigin(1, 0).setDepth(D + 2);
    objs.push(closeX);
    const closeHit = this.add.rectangle(px + PW - P(16), py + P(16), P(44), P(44))
      .setDepth(D + 3).setInteractive({ useHandCursor: true }).setAlpha(0.001);
    objs.push(closeHit);
    closeHit.on('pointerup', close);

    const domContainer: HTMLElement = (this.sys.game as any).domContainer ?? document.body;
    const INP_W = PW - P(24);
    const INP_H = P(34);
    const dpr   = window.devicePixelRatio;

    const makeInput = (placeholder: string, yPx: number): HTMLInputElement => {
      const inp = document.createElement('input');
      inp.type        = 'password';
      inp.placeholder = placeholder;
      Object.assign(inp.style, {
        position: 'absolute',
        left:     `${(px + P(12)) / dpr}px`,
        top:      `${yPx / dpr}px`,
        width:    `${INP_W / dpr}px`,
        height:   `${INP_H / dpr}px`,
        fontSize: `${P(14) / dpr}px`,
        padding:  '4px 8px',
        background:   '#0a180a',
        color:        '#c8ffc8',
        border:       '1px solid #2a8a2a',
        borderRadius: '6px',
        outline:      'none',
        zIndex:       String(D + 4),
        boxSizing:    'border-box',
      });
      domContainer.appendChild(inp);
      domObjs.push(inp);
      return inp;
    };

    const Y1 = py + P(48);
    const Y2 = Y1 + INP_H + P(8);
    const Y3 = Y2 + INP_H + P(8);

    addTxt('舊密碼', px + P(12), Y1 - P(18), { fontSize: F(13), color: '#99cc99' }, 0);
    const oldInp = makeInput('請輸入舊密碼', Y1);

    addTxt('新密碼', px + P(12), Y2 - P(18), { fontSize: F(13), color: '#99cc99' }, 0);
    const newInp = makeInput('至少 6 個字元', Y2);

    addTxt('確認新密碼', px + P(12), Y3 - P(18), { fontSize: F(13), color: '#99cc99' }, 0);
    const confInp = makeInput('再輸入一次新密碼', Y3);

    const SB_Y = py + PH - P(14) - P(36);
    const SB_W = PW - P(24);
    const sbBg  = this.add.graphics().setDepth(D + 2);
    objs.push(sbBg);
    const sbTxt = addTxt('確認修改', px + P(12) + SB_W / 2, SB_Y + P(9), {
      fontSize: F(16), fontStyle: 'bold', color: '#ffffff', stroke: '#001000', strokeThickness: 1,
    }) as Phaser.GameObjects.Text;

    const drawBtn = (state: 'idle' | 'loading' | 'done' | 'error', msg?: string) => {
      sbBg.clear();
      const colors: Record<string, [number, number]> = {
        idle:    [0x0d3a0d, 0x1a8a1a],
        loading: [0x1a3a1a, 0x2a6a2a],
        done:    [0x0d3a18, 0x1a8a3a],
        error:   [0x3a0d0d, 0x8a1a1a],
      };
      const [fill, border] = colors[state];
      sbBg.fillStyle(fill, 1);
      sbBg.fillRoundedRect(px + P(12), SB_Y, SB_W, P(36), P(8));
      sbBg.lineStyle(1, border, 0.9);
      sbBg.strokeRoundedRect(px + P(12), SB_Y, SB_W, P(36), P(8));
      const labels: Record<string, string> = {
        idle: '確認修改', loading: '更新中…', done: '✔ 密碼已更新！', error: msg ?? '修改失敗',
      };
      sbTxt.setText(labels[state]);
    };
    drawBtn('idle');

    const sbHit = this.add.rectangle(px + P(12) + SB_W / 2, SB_Y + P(18), SB_W, P(36))
      .setDepth(D + 3).setInteractive({ useHandCursor: true }).setAlpha(0.001);
    objs.push(sbHit);

    sbHit.on('pointerup', async () => {
      const oldPw  = oldInp.value.trim();
      const newPw  = newInp.value.trim();
      const confPw = confInp.value.trim();

      if (!oldPw || !newPw || !confPw) { drawBtn('error', '請填寫所有欄位'); return; }
      if (newPw.length < 6)            { drawBtn('error', '新密碼至少 6 個字元'); return; }
      if (newPw !== confPw)            { drawBtn('error', '兩次密碼不一致'); return; }

      drawBtn('loading');
      sbHit.disableInteractive();

      const rguRaw = localStorage.getItem('rg_user');
      const token  = rguRaw ? (JSON.parse(rguRaw)?.accessToken ?? '') : '';
      const apiUrl = (window as any).__apiUrl as string ?? '';

      try {
        const res = await fetch(`${apiUrl}/auth/change-password`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ oldPassword: oldPw, newPassword: newPw }),
        });
        const data = await res.json();
        if (res.ok) {
          drawBtn('done');
          this.time.delayedCall(1800, close);
        } else {
          drawBtn('error', data.error ?? '修改失敗');
          sbHit.setInteractive({ useHandCursor: true });
        }
      } catch {
        drawBtn('error', '網路錯誤');
        sbHit.setInteractive({ useHandCursor: true });
      }
    });

    objs.forEach(o => { if ('setScrollFactor' in o) (o as any).setScrollFactor(0); });
  }


  private showDailyQuestPanel(W: number, H: number): void {
    const PW       = Math.min(W - P(8), P(420));
    const HEADER_H = P(48);
    const ROW_PAD  = P(8);
    const FOOTER_H = P(8);
    const ROW_H    = P(76);   // fixed height; scroll handles small screens
    const PH       = Math.min(H - P(16), HEADER_H + 3 * ROW_H + 2 * ROW_PAD + FOOTER_H);
    const D   = 8000;
    const px  = (W - PW) / 2;
    const py  = Math.max(P(4), (H - PH) / 2);

    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => objs.forEach(o => o.destroy());

    const tt = (txt: string, x: number, y: number, style: object, ox = 0, oy = 0, depth = D + 2): Phaser.GameObjects.Text => {
      const o = this.add.text(x, y, txt, style).setOrigin(ox, oy).setDepth(depth);
      objs.push(o);
      return o;
    };

    // Backdrop
    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setInteractive().setDepth(D);
    objs.push(bd);
    bd.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < px || ptr.x > px + PW || ptr.y < py || ptr.y > py + PH) close();
    });

    // Panel background
    const bg = this.add.graphics().setDepth(D + 1);
    objs.push(bg);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(px + P(5), py + P(5), PW, PH);
    bg.fillStyle(0xa06810, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(0xffd060, 0.7);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), P(2));
    bg.fillStyle(0x160e04, 1);
    bg.fillRect(px, py, PW, PH);
    for (let i = 0; i < 14; i++) {
      const gy = py + P(8) + i * (PH / 14);
      bg.fillStyle(0xffffff, i % 4 === 0 ? 0.025 : 0.01);
      bg.fillRect(px + P(4), gy, PW - P(8), P(1));
    }
    bg.fillStyle(0x241408, 1);
    bg.fillRect(px, py, PW, HEADER_H);
    bg.fillStyle(0x3a2010, 1);
    bg.fillRect(px, py, PW, P(18));

    // Title
    tt('每日任務', px + PW / 2, py + P(12), {
      fontSize: F(17), fontStyle: 'bold', color: '#ffe08a',
      stroke: '#1a0800', strokeThickness: 2,
    }, 0.5, 0);

    const closeBtn = this.add.text(px + PW - P(8), py + P(8), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc7744', stroke: '#0a0000', strokeThickness: 1,
    }).setOrigin(1, 0).setDepth(D + 3);
    objs.push(closeBtn);
    const closeBtnHit = this.add.rectangle(px + PW - P(16), py + P(16), P(44), P(44)).setDepth(D + 4).setInteractive({ useHandCursor: true }).setAlpha(0.001);
    objs.push(closeBtnHit);
    closeBtnHit.on('pointerup', close);

    // ── Quest rows (scrollable container) ───────────────────
    const STATUS_COLOR: Record<string, string> = { active: '#aaaaaa', completed: '#ffe066', claimed: '#556655' };

    const rewardText = (reward: import('../data/daily-quest-store').DailyReward): string => {
      const parts: string[] = [];
      if (reward.gold)   parts.push(`金幣 ×${reward.gold.toLocaleString()}`);
      if (reward.items)  parts.push(...reward.items.map(i => `${i.name} ×${i.qty}`));
      if (reward.cardId) parts.push('隨機卡片');
      if (reward.equip)  parts.push('隨機裝備');
      return parts.join(' ') || '—';
    };

    const VIEWPORT_H = PH - HEADER_H - FOOTER_H;
    const CONTENT_H  = 3 * ROW_H + 2 * ROW_PAD;
    const maxScroll  = Math.max(0, CONTENT_H - VIEWPORT_H);

    // Geometry mask: clips container children to the content viewport
    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff, 1);
    maskGfx.fillRect(px, py + HEADER_H, PW, VIEWPORT_H);
    objs.push(maskGfx);

    // Container holds all scrollable content at scene coords; move by -scrollY to scroll
    const scrollCont = this.add.container(0, 0).setDepth(D + 2).setScrollFactor(0);
    scrollCont.setMask(new Phaser.Display.Masks.GeometryMask(this, maskGfx));
    objs.push(scrollCont);

    let scrollY = 0;
    const applyScroll = () => scrollCont.setY(-scrollY);

    // Helper: create text, add to scrollCont
    const ts = (txt: string, x: number, y: number, style: object, ox = 0, oy = 0, depth = D + 2) => {
      const o = this.add.text(x, y, txt, style).setOrigin(ox, oy).setDepth(depth);
      scrollCont.add(o);
      return o;
    };

    const quests  = DailyQuestStore.getQuests();
    const startY  = py + HEADER_H + P(6);
    const INNER_W = PW - P(16);
    const rx0     = px + P(8);

    quests.forEach((q, i) => {
      const ry = startY + i * (ROW_H + ROW_PAD);
      const rg = this.add.graphics().setDepth(D + 2);
      scrollCont.add(rg);
      rg.fillStyle(0x1e1206, 1);
      rg.fillRoundedRect(rx0, ry, INNER_W, ROW_H, P(6));
      rg.lineStyle(1, 0x3a2800, 0.8);
      rg.strokeRoundedRect(rx0, ry, INNER_W, ROW_H, P(6));

      const tx = rx0 + P(6);
      const tr = rx0 + INNER_W - P(6);

      const countTxt = q.status === 'claimed' ? '已領取'
        : q.status === 'completed' ? '✔ 完成'
        : `${q.progress.toLocaleString()} / ${q.target.toLocaleString()}`;
      ts(q.label, tx, ry + P(8),
        { fontSize: F(15), fontStyle: 'bold', color: '#e8d8b0', stroke: '#0a0000', strokeThickness: 1 }, 0, 0);
      ts(countTxt, tr, ry + P(8),
        { fontSize: F(15), fontStyle: 'bold', color: STATUS_COLOR[q.status] }, 1, 0);

      const barX = tx, barW = INNER_W - P(12), barH = P(7), barY = ry + P(30);
      rg.fillStyle(0x0a0604, 1);
      rg.fillRoundedRect(barX, barY, barW, barH, P(3));
      const pct = q.status === 'claimed' ? 1 : Math.min(1, q.progress / q.target);
      rg.fillStyle(q.status === 'claimed' ? 0x446633 : q.status === 'completed' ? 0xcc9900 : 0x5588cc, 1);
      if (pct > 0) rg.fillRoundedRect(barX, barY, Math.max(barH * 2, Math.round(barW * pct)), barH, P(3));

      const rewardY  = ry + P(45);
      const btnW = P(78), btnH = P(24);
      const hasClaim = q.status === 'completed';
      ts(`獎勵：${rewardText(q.reward)}`, tx, rewardY, {
        fontSize: F(15), fontStyle: 'bold', color: '#c8a860',
        wordWrap: { width: hasClaim ? INNER_W - P(12) - btnW - P(6) : INNER_W - P(12) },
      }, 0, 0);

      if (hasClaim) {
        const btnX = rx0 + INNER_W - btnW - P(4);
        const btnY = rewardY - Math.round((btnH - P(15)) / 2);
        const btnG = this.add.graphics().setDepth(D + 3);
        scrollCont.add(btnG);
        btnG.fillStyle(0x6a4200, 1).fillRoundedRect(btnX, btnY, btnW, btnH, P(5));
        btnG.lineStyle(P(1), GOLD, 0.9).strokeRoundedRect(btnX, btnY, btnW, btnH, P(5));
        scrollCont.add(
          this.add.text(btnX + btnW / 2, btnY + btnH / 2, '領取獎勵', {
            fontSize: F(15), fontStyle: 'bold', color: '#ffe088', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5).setDepth(D + 4),
        );
        const btnHit = this.add.rectangle(btnX + btnW / 2, btnY + btnH / 2, btnW, btnH)
          .setDepth(D + 5).setAlpha(0.001).setInteractive({ useHandCursor: true });
        scrollCont.add(btnHit);
        btnHit.on('pointerup', () => {
          const reward = DailyQuestStore.claimQuest(q.id);
          if (!reward) return;
          if (reward.gold)   InventoryStore.addGold(reward.gold);
          if (reward.items)  reward.items.forEach(it => InventoryStore.addItem(it.id, it.name, it.qty));
          if (reward.cardId) CardStore.addCard(reward.cardId);
          if (reward.equip)  PlayerStore.addOwned(reward.equip);
          SaveStore.save();
          AudioService.playSfx(this, 'sfx_daily_claim');
          close();
          this.showDailyQuestPanel(W, H);
        });
      }
    });

    // Drag-to-scroll zone over the content area
    if (maxScroll > 0) {
      let dragStart = 0, scrollStart = 0;
      const zone = this.add.zone(px + PW / 2, py + HEADER_H + VIEWPORT_H / 2, PW, VIEWPORT_H)
        .setDepth(D + 1).setInteractive({ draggable: true });
      objs.push(zone);
      zone.on('dragstart', (ptr: Phaser.Input.Pointer) => { dragStart = ptr.y; scrollStart = scrollY; });
      zone.on('drag',      (ptr: Phaser.Input.Pointer) => {
        scrollY = Phaser.Math.Clamp(scrollStart - (ptr.y - dragStart), 0, maxScroll);
        applyScroll();
      });
    }

    objs.forEach(o => {
      if ('setScrollFactor' in o) (o as any).setScrollFactor(0);
    });
  }

  private showQuestPanel(W: number, H: number, baseDepth = 500): void {
    const PW = Math.min(W - P(16), P(500));
    const PH = Math.min(H - P(20), P(370));
    const D = baseDepth;

    const panelX = (W - PW) / 2;
    const panelY = (H - PH) / 2;

    this._questPanelCloseAll?.();
    this._questPanelCloseAll = null;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const closeAll = () => {
      this._questPanelCloseAll = null;
      objs.forEach(o => o.destroy());
    };
    this._questPanelCloseAll = closeAll;

    // ── Backdrop ──────────────────────────────────────────
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setInteractive().setDepth(D);
    objs.push(backdrop);
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < panelX || ptr.x > panelX + PW ||
        ptr.y < panelY || ptr.y > panelY + PH) closeAll();
    });

    // ── Panel shell ───────────────────────────────────────
    const bg = this.add.graphics().setDepth(D + 1);
    objs.push(bg);

    // Drop shadow
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(panelX + P(5), panelY + P(5), PW, PH);

    // Outer gold border
    bg.fillStyle(0xa06810, 1);
    bg.fillRect(panelX - P(3), panelY - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(0xffd060, 0.7);
    bg.fillRect(panelX - P(3), panelY - P(3), PW + P(6), P(2));
    bg.fillStyle(0xffd060, 0.3);
    bg.fillRect(panelX - P(3), panelY - P(1), P(2), PH + P(4));

    // Panel body
    bg.fillStyle(0x160e04, 1);
    bg.fillRect(panelX, panelY, PW, PH);

    // Subtle wood grain
    for (let i = 0; i < 14; i++) {
      const gy = panelY + P(8) + i * (PH / 14);
      bg.fillStyle(0xffffff, i % 4 === 0 ? 0.025 : 0.01);
      bg.fillRect(panelX + P(4), gy, PW - P(8), P(1));
    }

    // Header bar
    bg.fillStyle(0x241408, 1);
    bg.fillRect(panelX, panelY, PW, P(44));
    bg.fillStyle(0x3a2010, 1);
    bg.fillRect(panelX, panelY, PW, P(18));

    // Gold divider under header
    bg.fillStyle(0xc88020, 1);
    bg.fillRect(panelX, panelY + P(44), PW, P(2));
    bg.fillStyle(0xffe080, 0.35);
    bg.fillRect(panelX, panelY + P(44), PW, P(1));

    // Corner rivets
    ([
      [panelX - P(3), panelY - P(3)], [panelX + PW - P(7), panelY - P(3)],
      [panelX - P(3), panelY + PH - P(7)], [panelX + PW - P(7), panelY + PH - P(7)],
    ] as [number, number][]).forEach(([rx, ry]) => {
      bg.fillStyle(0xffe080, 1); bg.fillRect(rx, ry, P(10), P(10));
      bg.fillStyle(0x7a4a08, 1); bg.fillRect(rx + P(2), ry + P(2), P(6), P(6));
      bg.fillStyle(0xffe080, 0.5); bg.fillRect(rx + P(3), ry + P(3), P(2), P(2));
    });

    // Panel title
    objs.push(this.add.text(W / 2, panelY + P(22), '✦  懸 賞 告 示  ✦', {
      fontSize: F(16), fontStyle: 'bold',
      color: '#ffe080', stroke: '#2a1000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 2));

    const closeBtn = this.add.text(panelX + PW - P(18), panelY + P(22), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#ff6644', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(D + 2);
    objs.push(closeBtn);
    closeBtn.on('pointerdown', closeAll);

    // Reroll stone count — 左側 header，不壓到右邊叉叉
    const ticketQty = InventoryStore.getItemQty('quest_reroll');
    const rerollY = panelY + P(22);
    const rerollX = panelX + P(12);
    if (this.textures.exists('icon_quest_reroll')) {
      objs.push(this.add.image(rerollX + P(14), rerollY, 'icon_quest_reroll')
        .setDisplaySize(P(28), P(28)).setDepth(D + 2));
    }
    objs.push(this.add.text(rerollX + P(30), rerollY, `×${ticketQty}`, {
      fontSize: F(15), fontStyle: 'bold', color: ticketQty > 0 ? '#ffdd44' : '#665533',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── 3 Bounty cards ───────────────────────────────────
    const quests = QuestStore.getQuests();
    const GAP = P(12);
    const cardAreaX = panelX + P(12);
    const cardAreaY = panelY + P(52);
    const cardAreaW = PW - P(24);
    const CARD_W = Math.floor((cardAreaW - GAP * 2) / 3);
    const CARD_H = PH - P(64);

    const renderCard = (quest: Quest, idx: number) => {
      const cx = cardAreaX + idx * (CARD_W + GAP);
      const def = getMonsterDef(quest.bossId);
      const status = quest.status;
      const dimmed = status === 'claimed';
      const canDismiss = status !== 'completed';

      // Layout
      const BANNER_H = P(32);
      const CIRCLE_Y = cardAreaY + BANNER_H + P(50);
      const CIRCLE_R = P(38);
      const NAME_Y = CIRCLE_Y + CIRCLE_R + P(14);
      const DIV_Y = NAME_Y + P(17);
      const FLAVOR_TOP = DIV_Y + P(7);
      const FLAVOR_H = CARD_H - (FLAVOR_TOP - cardAreaY) - P(76);
      const GOLD_Y = cardAreaY + CARD_H - P(52);
      const BTN_Y = cardAreaY + CARD_H - P(22);
      const BTN_H = P(24);

      const cg = this.add.graphics().setDepth(D + 2);
      objs.push(cg);

      // Card shadow
      cg.fillStyle(0x000000, 0.4);
      cg.fillRect(cx + P(3), cardAreaY + P(3), CARD_W, CARD_H);

      // Parchment body
      cg.fillStyle(dimmed ? 0xb0946a : 0xf0dcac, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, CARD_H);
      // Edge darkening
      cg.fillStyle(0x000000, 0.08);
      cg.fillRect(cx, cardAreaY, CARD_W, P(4));
      cg.fillRect(cx, cardAreaY + CARD_H - P(4), CARD_W, P(4));
      cg.fillRect(cx, cardAreaY, P(4), CARD_H);
      cg.fillRect(cx + CARD_W - P(4), cardAreaY, P(4), CARD_H);

      // Card outer border (double-line)
      cg.lineStyle(2.5, dimmed ? 0x664422 : 0x7a3200, 1);
      cg.strokeRect(cx + P(1), cardAreaY + P(1), CARD_W - P(2), CARD_H - P(2));
      cg.lineStyle(1, dimmed ? 0x997744 : 0xdd8844, 0.4);
      cg.strokeRect(cx + P(4), cardAreaY + P(4), CARD_W - P(8), CARD_H - P(8));

      // ── Red banner ──
      cg.fillStyle(dimmed ? 0x3a1212 : 0x780606, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, BANNER_H);
      cg.fillStyle(dimmed ? 0x552222 : 0xaa1010, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, P(5));
      cg.fillStyle(0x000000, 0.25);
      cg.fillRect(cx, cardAreaY + BANNER_H - P(4), CARD_W, P(4));
      cg.lineStyle(1, dimmed ? 0x886644 : 0xffcc44, 0.65);
      cg.lineBetween(cx + P(5), cardAreaY + P(1), cx + CARD_W - P(5), cardAreaY + P(1));
      cg.lineBetween(cx + P(5), cardAreaY + BANNER_H - P(2), cx + CARD_W - P(5), cardAreaY + BANNER_H - P(2));

      // Star rating row — centred in banner
      const starStr = '★'.repeat(quest.star);
      const starColors: Record<number, string> = { 1: '#aabbcc', 2: '#88ccff', 3: '#88ff88', 4: '#ffdd44', 5: '#ff8844' };
      objs.push(this.add.text(cx + CARD_W / 2, cardAreaY + BANNER_H / 2, starStr, {
        fontSize: F(20), fontStyle: 'bold',
        color: dimmed ? '#776655' : (starColors[quest.star] ?? '#ffffff'),
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 3));

      // ── Dismiss X (top-right of card) ──
      if (canDismiss) {
        const hasTicket = InventoryStore.getItemQty('quest_reroll') > 0;
        const xColor = hasTicket ? '#ff6666' : '#554433';
        const xTxt = this.add.text(cx + CARD_W - P(6), cardAreaY + P(6), '✕', {
          fontSize: F(15), fontStyle: 'bold', color: xColor, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(D + 5);
        objs.push(xTxt);
        if (hasTicket) {
          xTxt.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(32), -P(4), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
          xTxt.on('pointerover', () => xTxt.setColor('#ffffff'));
          xTxt.on('pointerout', () => xTxt.setColor(xColor));
          xTxt.on('pointerdown', () => {
            InventoryStore.spendItem('quest_reroll', 1);
            if (status === 'accepted') QuestStore.abandonQuest(quest.id);
            QuestStore.dismissQuest(quest.id);
            SaveStore.save();
            closeAll();
            this.showQuestPanel(W, H);
          });
        }
      }

      // ── Portrait circle ──
      cg.fillStyle(0x000000, 0.2);
      cg.fillCircle(cx + CARD_W / 2 + P(2), CIRCLE_Y + P(2), CIRCLE_R);
      cg.fillStyle(dimmed ? 0x8a6030 : 0xb87820, 1);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.fillStyle(dimmed ? 0xa07840 : 0xf0d898, 0.5);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - P(4));
      cg.lineStyle(2.5, dimmed ? 0xb09060 : 0xffe080, 0.9);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xc89030, 0.4);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - P(5));

      // Boss sprite
      const spriteKey = def ? `${def.spriteKey}_idle` : 'slime_idle';
      const isPlantBoss   = def?.spriteKey?.startsWith('plant');
      const isOrcBoss     = def?.spriteKey?.startsWith('orc');
      const isVampireBoss = def?.spriteKey?.startsWith('vampire');
      const idleFrames = (isPlantBoss || isOrcBoss || isVampireBoss) ? 3 : 5;
      const bossScale = isPlantBoss ? 3.0 * DPR * 0.8 : isOrcBoss ? 3.0 * DPR * 0.85 : 3.0 * DPR;
      const animKey = `q_${quest.bossId}`;
      if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: idleFrames }),
          frameRate: 8, repeat: -1,
        });
      }
      if (this.textures.exists(spriteKey)) {
        const spriteY = CIRCLE_Y + (isOrcBoss ? P(8) : 0);
        const sp = this.add.sprite(cx + CARD_W / 2, spriteY, spriteKey, 0)
          .setScale(bossScale).setDepth(D + 3);
        if (def?.tint) def.fillTint ? sp.setTintFill(def.tint) : sp.setTint(def.tint);
        if (this.anims.exists(animKey)) sp.play(animKey);
        if (dimmed) sp.setAlpha(0.4);
        objs.push(sp);
      }

      // ── Boss name ──
      objs.push(this.add.text(cx + CARD_W / 2, NAME_Y, def?.name ?? '???', {
        fontSize: F(15), fontStyle: 'bold',
        color: dimmed ? '#7a5030' : '#1e0c00',
        stroke: dimmed ? '#00000000' : '#e8c070', strokeThickness: 1,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 3));

      // Name underline
      cg.lineStyle(1.5, dimmed ? 0xaa7744 : 0xcc7722, 0.7);
      cg.lineBetween(cx + P(10), DIV_Y, cx + CARD_W - P(10), DIV_Y);

      // ── Flavor text box ──
      const flavorClipX = cx + P(7);
      const flavorClipW = CARD_W - P(14);

      cg.fillStyle(0x000000, 0.06);
      cg.fillRect(flavorClipX + P(1), FLAVOR_TOP + P(1), flavorClipW, FLAVOR_H);
      cg.fillStyle(dimmed ? 0x7a5a28 : 0xcc9840, 0.22);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.fillStyle(0xffffff, 0.1);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, P(2));
      cg.lineStyle(1.5, dimmed ? 0x664422 : 0x7a3400, 0.85);
      cg.strokeRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xdd7722, 0.35);
      cg.strokeRect(flavorClipX + P(2), FLAVOR_TOP + P(2), flavorClipW - P(4), FLAVOR_H - P(4));

      const flavorTxt = this.add.text(
        cx + CARD_W / 2, FLAVOR_TOP + P(5), quest.flavorText, {
        fontSize: F(15), fontStyle: 'bold', lineSpacing: 3,
        color: dimmed ? '#6a5030' : '#3a1c04',
        wordWrap: { width: flavorClipW - P(12), useAdvancedWrap: true }, align: 'center',
        padding: { top: 4, bottom: 4 },
      }).setOrigin(0.5, 0).setDepth(D + 3);
      objs.push(flavorTxt);

      const maskGfx = this.make.graphics({ add: false } as any);
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillRect(flavorClipX + P(1), FLAVOR_TOP - P(3), flavorClipW - P(2), FLAVOR_H + P(3));
      flavorTxt.setMask(maskGfx.createGeometryMask());
      objs.push(maskGfx);

      if (flavorTxt.height > FLAVOR_H - P(8)) {
        const arrow = this.add.text(cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H - P(8), '▼', {
          fontSize: F(15), fontStyle: 'bold', color: '#aa6622',
        }).setOrigin(0.5).setDepth(D + 4);
        objs.push(arrow);
        const dz = this.add.zone(
          cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H / 2, flavorClipW, FLAVOR_H,
        ).setInteractive().setDepth(D + 5);
        objs.push(dz);
        const minY = FLAVOR_TOP + P(5) - (flavorTxt.height - (FLAVOR_H - P(10)));
        const maxY = FLAVOR_TOP + 5;
        let ds = 0, ts = 0;
        dz.on('pointerdown', (p: Phaser.Input.Pointer) => { ds = p.y; ts = flavorTxt.y; });
        dz.on('pointermove', (p: Phaser.Input.Pointer) => {
          if (!p.isDown) return;
          flavorTxt.y = Phaser.Math.Clamp(ts + (p.y - ds), minY, maxY);
          arrow.setVisible(flavorTxt.y > minY + 2);
        });
      }

      // ── Gold row ──
      cg.fillStyle(dimmed ? 0x442200 : 0x6a3800, 0.25);
      cg.fillRect(cx + P(6), GOLD_Y - P(12), CARD_W - P(12), P(23));
      cg.lineStyle(1, dimmed ? 0x886644 : 0xcc8822, 0.6);
      cg.strokeRect(cx + P(6), GOLD_Y - P(12), CARD_W - P(12), P(23));

      if (quest.isEquipReward) {
        objs.push(this.add.text(cx + CARD_W / 2, GOLD_Y, '裝備獎勵', {
          fontSize: F(16), fontStyle: 'bold',
          color: dimmed ? '#776655' : '#ffe8a0',
          strokeThickness: 0,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 3));
      } else {
        const coinImg = this.add.image(cx + CARD_W / 2 - P(18), GOLD_Y, 'icon_coin')
          .setDisplaySize(P(18), P(18)).setDepth(D + 3);
        if (dimmed) coinImg.setAlpha(0.5);
        objs.push(coinImg);
        objs.push(this.add.text(cx + CARD_W / 2 - P(7), GOLD_Y, `${quest.reward}`, {
          fontSize: F(16), fontStyle: 'bold',
          color: dimmed ? '#776644' : '#e8c060',
          stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(D + 3));
      }

      // ── Action button ──
      const btnW = CARD_W - 28;
      const btnX = cx + CARD_W / 2;

      {
        let bgC = 0x1a3a0c, ltC = 0x44cc22, txtC = '#88ee44', label = '接  受';
        if (status === 'completed') { bgC = 0x382000; ltC = 0xddaa00; txtC = '#ffdd44'; label = '領  取'; }
        if (status === 'claimed') { bgC = 0x1c1810; ltC = 0x554433; txtC = '#665544'; label = '已領取'; }

        const bg2 = this.add.graphics().setDepth(D + 3);
        objs.push(bg2);
        bg2.fillStyle(0x000000, 0.35);
        bg2.fillRect(btnX - btnW / 2 + P(2), BTN_Y - BTN_H / 2 + P(2), btnW, BTN_H);
        bg2.fillStyle(bgC, 1);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);
        bg2.fillStyle(0xffffff, 0.12);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, P(3));
        bg2.lineStyle(1.5, ltC, 0.9);
        bg2.strokeRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);

        objs.push(this.add.text(btnX, BTN_Y, label, {
          fontSize: F(15), fontStyle: 'bold',
          color: txtC, stroke: '#000000', strokeThickness: 2,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 4));

        if (status === 'available' || status === 'accepted' || status === 'completed') {
          const hit = this.add.rectangle(btnX, BTN_Y, btnW, BTN_H)
            .setInteractive({ useHandCursor: true }).setDepth(D + 5);
          objs.push(hit);
          hit.on('pointerdown', () => {
            if (status === 'available' || status === 'accepted') showConfirm(quest);
            else if (quest.isEquipReward) showEquipRewardModal(quest, closeAll);
            else claimQuest(quest, closeAll);
          });
        }
      }
    };

    quests.forEach((q, i) => renderCard(q, i));

    // ── Star probability panel (right of quest board) ─────
    const spW = (W - PW) / 2 - P(12);
    if (spW >= P(55)) {
      const spX = panelX + PW + P(6);
      const spY = panelY;
      const spH = PH;
      const spBg = this.add.graphics().setDepth(D + 1);
      objs.push(spBg);
      spBg.fillStyle(0x000000, 0.5);
      spBg.fillRect(spX + P(3), spY + P(3), spW, spH);
      spBg.fillStyle(0x1a0e00, 1);
      spBg.fillRect(spX, spY, spW, spH);
      spBg.lineStyle(P(1.5), 0x7a5020, 1);
      spBg.strokeRect(spX, spY, spW, spH);

      objs.push(this.add.text(spX + spW / 2, spY + P(16), '出現率', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe080',
        stroke: '#2a1000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 2));

      const weights = getStarWeights(PlayerStore.getLevel());
      const total = Object.values(weights).reduce((s, w) => s + w, 0);
      const starChar = ['★', '★★', '★★★', '★★★★', '★★★★★'];
      const rowH = (spH - P(38)) / 5;

      for (let i = 0; i < 5; i++) {
        const star = i + 1;
        const pct = total > 0 ? weights[star] / total : 0;
        const ry = spY + P(36) + i * rowH;
        const pad = P(5);
        const barW = spW - pad * 2;
        const barH = P(7);

        // star label
        const starColor = ['#aaffaa', '#ffdd88', '#88ccff', '#ff99ff', '#ffaa44'][i];
        objs.push(this.add.text(spX + spW / 2, ry, starChar[i], {
          fontSize: F(15), color: starColor,
        }).setOrigin(0.5, 0).setDepth(D + 2));

        // percentage text
        const pctText = pct < 0.005 ? '—' : `${Math.round(pct * 100)}%`;
        objs.push(this.add.text(spX + spW / 2, ry + P(18), pctText, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(D + 2));

        // bar
        const barG = this.add.graphics().setDepth(D + 2);
        objs.push(barG);
        barG.fillStyle(0x333333, 1);
        barG.fillRect(spX + pad, ry + P(36), barW, barH);
        if (pct > 0) {
          const fillColor = [0x44cc44, 0xddcc22, 0x2299ff, 0xcc44cc, 0xff8822][i];
          barG.fillStyle(fillColor, 1);
          barG.fillRect(spX + pad, ry + P(36), Math.round(barW * pct), barH);
        }
      }
    }

    // ── Confirm dialog ────────────────────────────────────
    const showConfirm = (quest: Quest) => {
      const cW = P(240), cH = P(96);
      const cX = W / 2 - cW / 2, cY = H / 2 - cH / 2;
      const co: Phaser.GameObjects.GameObject[] = [];
      const closeCo = () => co.forEach(o => o.destroy());

      const cbg = this.add.graphics().setDepth(D + 10);
      co.push(cbg);
      cbg.fillStyle(0x000000, 0.5);
      cbg.fillRect(cX + P(4), cY + P(4), cW, cH);
      cbg.fillStyle(0xa06810, 1);
      cbg.fillRect(cX - P(3), cY - P(3), cW + P(6), cH + P(6));
      cbg.fillStyle(0xffe080, 0.6);
      cbg.fillRect(cX - P(3), cY - P(3), cW + P(6), P(2));
      cbg.fillStyle(0x160e04, 1);
      cbg.fillRect(cX, cY, cW, cH);
      ([
        [cX - P(3), cY - P(3)], [cX + cW - P(7), cY - P(3)],
        [cX - P(3), cY + cH - P(7)], [cX + cW - P(7), cY + cH - P(7)],
      ] as [number, number][]).forEach(([rx, ry]) => {
        cbg.fillStyle(0xffe080, 1); cbg.fillRect(rx, ry, P(10), P(10));
        cbg.fillStyle(0x7a4a08, 1); cbg.fillRect(rx + P(2), ry + P(2), P(6), P(6));
      });

      co.push(this.add.text(W / 2, cY + P(28), '確定接受這份懸賞？', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));

      const drawBtn = (
        gfx: Phaser.GameObjects.Graphics,
        bx: number, by: number, bw: number, bh: number,
        bgCol: number, ltCol: number,
      ) => {
        gfx.fillStyle(0x000000, 0.35); gfx.fillRect(bx + P(2), by + P(2), bw, bh);
        gfx.fillStyle(bgCol, 1); gfx.fillRect(bx, by, bw, bh);
        gfx.fillStyle(0xffffff, 0.14); gfx.fillRect(bx, by, bw, P(3));
        gfx.lineStyle(1.5, ltCol, 0.9); gfx.strokeRect(bx, by, bw, bh);
      };

      const yg = this.add.graphics().setDepth(D + 11);
      co.push(yg);
      drawBtn(yg, cX + P(14), cY + P(58), P(96), P(26), 0x1a3a0c, 0x44cc22);
      co.push(this.add.text(cX + P(62), cY + P(71), '出  發', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#88ee44', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const yHit = this.add.rectangle(cX + P(62), cY + P(71), P(96), P(26))
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(yHit);
      yHit.on('pointerdown', () => {
        QuestStore.acceptQuest(quest.id);
        closeCo(); closeAll();
        const mapTheme = randomQuestTheme();
        if (NetworkService.connected && NetworkService.isHost) {
          NetworkService.sendReady(getPlayerName(), PlayerStore.getLevel(), quest.id, quest.star, quest.bossId, mapTheme);
        } else {
          AudioService.playSfx(this, 'sfx_battle_start');
          this.scene.start('BattleLoadScene', { ownSkinId: SkinStore.get(), questStar: quest.star, bossMonsterId: quest.bossId, mapTheme });
        }
      });

      const ng = this.add.graphics().setDepth(D + 11);
      co.push(ng);
      drawBtn(ng, cX + P(130), cY + P(58), P(96), P(26), 0x3a0808, 0xcc2222);
      co.push(this.add.text(cX + P(178), cY + P(71), '取  消', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#ff6644', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const nHit = this.add.rectangle(cX + P(178), cY + P(71), P(96), P(26))
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(nHit);
      nHit.on('pointerdown', closeCo);
    };

    // ── Equip reward modal ────────────────────────────────
    const showEquipRewardModal = (quest: Quest, afterClose: () => void) => {
      const items = QuestStore.getEquipOptions(quest.id);

      const CARD_W = P(155);
      const CARD_H = P(255);
      const GAP = P(10);
      const MW = CARD_W * 3 + GAP * 4;
      const MH = CARD_H + P(44) + GAP * 2;
      const mx = W / 2 - MW / 2;
      const my = H / 2 - MH / 2;
      const MD = D + 10;
      const mo: Phaser.GameObjects.GameObject[] = [];
      const closeMo = () => mo.forEach(o => o.destroy());

      // Backdrop
      const mbk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
        .setDepth(MD).setInteractive();
      mbk.on('pointerdown', closeMo);
      mo.push(mbk);

      // Panel
      const mg = this.add.graphics().setDepth(MD + 1);
      mo.push(mg);
      mg.fillStyle(WD, 1); mg.fillRect(mx, my, MW, MH);
      mg.lineStyle(2, GOLD, 0.9); mg.strokeRect(mx, my, MW, MH);
      mg.fillStyle(WB, 1); mg.fillRect(mx, my, MW, P(44));
      mg.lineStyle(1, GOLD, 0.4); mg.lineBetween(mx, my + P(44), mx + MW, my + P(44));

      mo.push(this.add.text(W / 2, my + P(22), '選擇獎勵裝備', {
        fontSize: F(16), fontStyle: 'bold',
        color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(MD + 2));

      // 右上角叉叉（可晚點再選）
      const xBtn = this.add.text(mx + MW - P(14), my + P(22), '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(MD + 3);
      xBtn.on('pointerdown', closeMo);
      mo.push(xBtn);

      items.forEach((item, idx) => {
        const cx = mx + GAP + idx * (CARD_W + GAP);
        const cy = my + P(44) + GAP;
        const qColor = QUALITY_COLORS[item.quality];
        const qHex = '#' + qColor.toString(16).padStart(6, '0');

        // Card bg
        const rg = this.add.graphics().setDepth(MD + 2);
        mo.push(rg);
        const drawCard = (hover: boolean) => {
          rg.clear();
          rg.fillStyle(hover ? WL : WM, 1);
          rg.fillRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
          rg.lineStyle(hover ? 2.5 : 1.5, qColor, hover ? 1 : 0.75);
          rg.strokeRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
          rg.fillStyle(qColor, 0.35);
          rg.fillRoundedRect(cx, cy, CARD_W, P(5), { tl: P(7), tr: P(7), bl: 0, br: 0 });
        };
        drawCard(false);

        // Image box — 80×80
        const imgBg = this.add.graphics().setDepth(MD + 3);
        mo.push(imgBg);
        imgBg.fillStyle(0x0a0600, 0.7);
        imgBg.fillRoundedRect(cx + (CARD_W - P(90)) / 2, cy + P(14), P(90), P(90), P(5));
        imgBg.lineStyle(1.5, qColor, 0.5);
        imgBg.strokeRoundedRect(cx + (CARD_W - P(90)) / 2, cy + P(14), P(90), P(90), P(5));

        if (this.textures.exists(item.texture))
          mo.push(this.add.image(cx + CARD_W / 2, cy + P(59), item.texture)
            .setDisplaySize(P(76), P(76)).setDepth(MD + 4));

        // Slot name
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(106), SLOT_NAMES[item.slot], {
          fontSize: F(15), fontStyle: 'bold',
          color: '#e8c070', stroke: '#0a0600', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Quality badge
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(126), QUALITY_NAMES[item.quality], {
          fontSize: F(15), fontStyle: 'bold',
          color: qHex, stroke: '#0a0600', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Affixes
        const affixLines = item.affixes.map(a => {
          return `${STAT_NAMES[a.stat]} +${fmtAffixValue(a.stat, a.value)}`;
        });
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(146), affixLines.join('\n'), {
          fontSize: F(15), fontStyle: 'bold', color: '#88cc88',
          stroke: '#0a0600', strokeThickness: 2,
          align: 'center', lineSpacing: 4,
          wordWrap: { width: CARD_W - P(12) },
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Hit zone
        const hit = this.add.rectangle(cx + CARD_W / 2, cy + CARD_H / 2, CARD_W, CARD_H)
          .setInteractive({ useHandCursor: true }).setDepth(MD + 5);
        mo.push(hit);
        hit.on('pointerover', () => drawCard(true));
        hit.on('pointerout', () => drawCard(false));
        hit.on('pointerdown', () => {
          PlayerStore.addOwned(item);
          QuestStore.claimQuest(quest.id);
          SaveStore.save();
          closeMo();
          afterClose();
          this.showQuestPanel(W, H);
        });
      });
    };

    // ── Claim ─────────────────────────────────────────────
    const claimQuest = (quest: Quest, afterClose: () => void) => {
      const gold = QuestStore.claimQuest(quest.id);
      InventoryStore.addGold(gold);
      SaveStore.save();
      afterClose();
      this.showQuestPanel(W, H);
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, closeAll);
  }

  // ── Equipment panel (wooden cabinet) ───────────────────

  private showEquipmentPanel(W: number, H: number): void {
    const PW = Math.min(W - P(16), P(700));
    const PH = Math.min(H - P(16), P(620));
    const D = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
        ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        PlayerStore.offChange(onStoreChange);
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1); bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL, 1); bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD, 1); bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5); bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08); bg.lineBetween(px + P(2), ry + 1, px + PW - P(2), ry + 1);
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, P(42));
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + P(40), PW, P(2));
    bg.fillStyle(WB, 1); bg.fillRect(px, py + P(42), PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + P(21), '裝  備', {
      fontSize: F(17), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    // Close button lives OUTSIDE the container at depth D+1 so it is always the
    // topmost interactive object regardless of container child ordering.
    const closeBtn = this.add.text(W / 2 + px + PW - P(22), H / 2 + py + P(21), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(D + 1).setScrollFactor(0);
    const closePanelFn = () => {
      if (closeBtn.active) closeBtn.destroy();
      PlayerStore.offChange(onStoreChange);
      if (container.active) container.destroy();
    };
    closeBtn.on('pointerup', closePanelFn);
    container.once('destroy', () => { if (closeBtn.active) closeBtn.destroy(); });

    // ── Slot definitions ──────────────────────────────────
    const slotDefs: { label: string; color: number; slotKey: EquipSlot }[] = [
      { label: '武器', color: 0xdd8844, slotKey: 'sword' },
      { label: '頭盔', color: 0xddcc88, slotKey: 'hat' },
      { label: '衣服', color: 0x88aadd, slotKey: 'outfit' },
      { label: '鞋子', color: 0xaa8866, slotKey: 'shoes' },
      { label: '飾品1', color: 0xff88cc, slotKey: 'ring1' },
      { label: '飾品2', color: 0xff66aa, slotKey: 'ring2' },
    ];
    const tabDefs: { label: string; color: number; slotKeys: EquipSlot[] }[] = [
      { label: '武器', color: 0xdd8844, slotKeys: ['sword'] },
      { label: '頭盔', color: 0xddcc88, slotKeys: ['hat'] },
      { label: '衣服', color: 0x88aadd, slotKeys: ['outfit'] },
      { label: '鞋子', color: 0xaa8866, slotKeys: ['shoes'] },
      { label: '飾品', color: 0xff88cc, slotKeys: ['ring1', 'ring2'] },
    ];

    // ── 裝備格子：3 欄 × 2 列 ────────────────────────────
    const slotSz = P(76);
    const slotGap = P(8);
    const ECOLS = 3;
    const EROWS = 2;
    const eGridX = px + P(12);
    const eGridY = py + P(50);
    const eGridH = EROWS * slotSz + (EROWS - 1) * slotGap;

    // ── 人物屬性區（裝備格下方，左欄同寬）───────────────
    const eGridW = ECOLS * slotSz + (ECOLS - 1) * slotGap;
    const statsX = eGridX;
    const statsY = eGridY + eGridH + P(10);
    const statsW = eGridW;
    const statsH = P(140);

    // ── 右欄（清單區）────────────────────────────────────
    const rightColX = eGridX + eGridW + P(26);
    const rightColW = px + PW - P(10) - rightColX;
    const rightColTop = py + P(50);

    // ── Top equipped slots (reactive) ─────────────────────
    const topSlotsLayer = this.add.container(0, 0);
    container.add(topSlotsLayer);

    // ── Stats layer (reactive) ────────────────────────────
    const statsLayer = this.add.container(0, 0);
    container.add(statsLayer);

    // ── Equipped slot detail overlay ──────────────────────
    // ── 共用按鈕繪製 ──────────────────────────────────────
    const drawBtn = (
      det: Phaser.GameObjects.Container,
      cx: number, cy: number, bw: number, bh: number,
      label: string, bgClr: number, borderClr: number, txtClr: string,
      onClick: () => void,
    ) => {
      const g = this.add.graphics();
      g.fillStyle(bgClr, 1); g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(borderClr, 0.12); g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.lineStyle(2, borderClr, 0.85); g.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(borderClr, 0.35); g.fillRect(cx - bw / 2, cy - bh / 2, bw, 2);
      det.add(g);
      const t = this.add.text(cx, cy, label, {
        fontSize: F(15), fontStyle: 'bold', color: txtClr, stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5);
      det.add(t);
      const hit = this.add.rectangle(cx, cy, bw, bh).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onClick);
      det.add(hit);
    };

    const drawSellBtn = (
      det: Phaser.GameObjects.Container,
      cx: number, cy: number, bw: number, bh: number,
      price: number,
      onClick: () => void,
    ) => {
      const g = this.add.graphics();
      g.fillStyle(0x2a1a0a, 1); g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(0x996633, 0.12); g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.lineStyle(2, 0x996633, 0.85); g.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(0x996633, 0.35); g.fillRect(cx - bw / 2, cy - bh / 2, bw, 2);
      det.add(g);
      det.add(this.add.text(cx - P(30), cy, '販  售', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc9955', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
      det.add(this.add.text(cx + P(6), cy, '+', {
        fontSize: F(14), fontStyle: 'bold', color: '#ffcc44', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5, 0.5));
      det.add(this.add.image(cx + P(18), cy, 'icon_coin').setDisplaySize(P(14), P(14)));
      det.add(this.add.text(cx + P(28), cy, `${price}`, {
        fontSize: F(14), fontStyle: 'bold', color: '#ffcc44', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));
      const hit = this.add.rectangle(cx, cy, bw, bh).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onClick);
      det.add(hit);
    };

    const showRefineChoiceModal = (item: EquipmentItem, onClose: () => void) => {
      const { width: W, height: H } = this.scale;
      const D = 970;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const o = <T extends Phaser.GameObjects.GameObject>(x: T): T => { objs.push(x); return x; };
      const closeChoice = () => { objs.forEach(x => x.destroy()); };

      const bw = P(160), bh = P(42), gap = P(10);
      const cx = W / 2, cy = H / 2;

      o(this.add.graphics().setDepth(D)).fillStyle(0x000000, 0.55).fillRect(0, 0, W, H);
      o(this.add.graphics().setDepth(D + 1))
        .fillStyle(0x1a1208, 0.97).fillRoundedRect(cx - P(180), cy - P(60), P(360), P(120), P(10))
        .lineStyle(P(2), 0x997733, 0.8).strokeRoundedRect(cx - P(180), cy - P(60), P(360), P(120), P(10));

      o(this.add.text(cx, cy - P(38), '選擇操作', {
        fontSize: F(16), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 2));

      // 強化按鈕
      const refineG = o(this.add.graphics().setDepth(D + 2));
      refineG.fillStyle(0x3a2800, 1).fillRect(cx - bw - gap / 2, cy - bh / 2, bw, bh);
      refineG.lineStyle(P(2), 0xf0c040, 0.8).strokeRect(cx - bw - gap / 2, cy - bh / 2, bw, bh);
      o(this.add.text(cx - bw / 2 - gap / 2, cy, '強  化', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3));
      o(this.add.rectangle(cx - bw / 2 - gap / 2, cy, bw, bh).setDepth(D + 4).setInteractive({ useHandCursor: true }))
        .on('pointerdown', () => { closeChoice(); showEnhanceModal(item, onClose); });

      // 重鑄按鈕
      const recastG = o(this.add.graphics().setDepth(D + 2));
      recastG.fillStyle(0x1a0a2a, 1).fillRect(cx + gap / 2, cy - bh / 2, bw, bh);
      recastG.lineStyle(P(2), 0xbb66ff, 0.8).strokeRect(cx + gap / 2, cy - bh / 2, bw, bh);
      o(this.add.text(cx + bw / 2 + gap / 2, cy, '重  鑄', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc88ff', stroke: '#0a0018', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3));
      o(this.add.rectangle(cx + bw / 2 + gap / 2, cy, bw, bh).setDepth(D + 4).setInteractive({ useHandCursor: true }))
        .on('pointerdown', () => { closeChoice(); showRecastModal(item, onClose); });

      // 關閉背景點擊
      o(this.add.rectangle(cx, cy, W, H).setDepth(D).setInteractive())
        .on('pointerdown', () => { closeChoice(); onClose(); });
    };

    const showRecastModal = (item: EquipmentItem, onClose: () => void) => {
      const { width: W, height: H } = this.scale;
      const mw = P(500);
      const RD = 960;
      const ro: Phaser.GameObjects.GameObject[] = [];
      const rs = <T extends Phaser.GameObjects.GameObject>(o: T): T => { ro.push(o); return o; };
      const closeRecast = () => { ro.forEach(o => o.destroy()); onClose(); };

      const TITLE_H  = P(44);
      const LEVEL_H  = P(38);
      const AFFIX_ROW = P(30);
      const MAT_HDR_H = P(30);
      const MAT_QTY_H = P(22);
      const RATE_H    = P(24);
      const BTN_H     = P(42);
      const RESULT_H  = P(28);
      const PAD       = P(10);
      const lw = P(260);
      const rw = mw - lw;
      const leftH  = LEVEL_H + PAD + item.affixes.length * AFFIX_ROW + PAD;
      const rightH = PAD + RATE_H + PAD / 2 + MAT_HDR_H + MAT_QTY_H + PAD + BTN_H + RESULT_H + PAD;
      const mh = TITLE_H + Math.max(leftH, rightH);
      const mx = W / 2 - mw / 2;
      const my = H / 2 - mh / 2;
      const rx = mx + lw;

      const isRefined = item.enhancement > 0 || (item.baseAffixes !== undefined && item.baseAffixes !== null);

      rs(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(RD));

      const bg = rs(this.add.graphics().setDepth(RD + 1));
      bg.fillStyle(WD, 0.97); bg.fillRect(mx, my, mw, mh);
      bg.lineStyle(P(2), 0xbb66ff, 0.85); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(0x12082a, 1); bg.fillRect(mx, my, mw, TITLE_H);
      bg.lineStyle(P(1), 0xbb66ff, 0.4);
      bg.lineBetween(mx, my + TITLE_H, mx + mw, my + TITLE_H);
      bg.lineBetween(mx + lw, my + TITLE_H, mx + lw, my + mh);

      rs(this.add.text(W / 2, my + TITLE_H / 2, '重 鑄 裝 備', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc88ff', stroke: '#0a0018', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(RD + 2));
      rs(this.add.text(mx + mw - P(16), my + TITLE_H / 2, '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#0a0018', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(RD + 3))
        .on('pointerdown', closeRecast);

      // ── 左欄：強化等級 + 詞綴前後對比 ──────────────────────
      rs(this.add.text(mx + lw / 2, my + TITLE_H + LEVEL_H / 2,
        isRefined ? `+${item.enhancement}  →  +0` : '尚未精煉', {
        fontSize: F(19), fontStyle: 'bold',
        color: isRefined ? '#ffe066' : '#887766', stroke: '#0a0018', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(RD + 2));

      const affixStartY = my + TITLE_H + LEVEL_H + PAD;
      const baseAff = item.baseAffixes ?? item.affixes;
      item.affixes.forEach((cur, i) => {
        const base = baseAff[i];
        const ay = affixStartY + i * AFFIX_ROW + AFFIX_ROW / 2;
        // stat name
        rs(this.add.text(mx + P(10), ay, STAT_NAMES[cur.stat], {
          fontSize: F(14), fontStyle: 'bold', color: '#ccbbaa', stroke: '#0a0018', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(RD + 2));
        if (isRefined && base && base.value !== cur.value) {
          // current (before) → base (after)
          rs(this.add.text(mx + lw - P(115), ay, fmtAffixValue(cur.stat, cur.value), {
            fontSize: F(14), fontStyle: 'bold', color: '#ffe8a0', stroke: '#0a0018', strokeThickness: 1,
          }).setOrigin(1, 0.5).setDepth(RD + 2));
          rs(this.add.text(mx + lw - P(95), ay, '→', {
            fontSize: F(13), color: '#998877',
          }).setOrigin(0.5, 0.5).setDepth(RD + 2));
          rs(this.add.text(mx + lw - P(10), ay, fmtAffixValue(base.stat, base.value), {
            fontSize: F(14), fontStyle: 'bold', color: '#888888', stroke: '#0a0018', strokeThickness: 1,
          }).setOrigin(1, 0.5).setDepth(RD + 2));
        } else {
          rs(this.add.text(mx + lw - P(10), ay, fmtAffixValue(cur.stat, cur.value), {
            fontSize: F(14), fontStyle: 'bold', color: '#888888', stroke: '#0a0018', strokeThickness: 1,
          }).setOrigin(1, 0.5).setDepth(RD + 2));
        }
      });

      // ── 右欄：素材 + 機率 + 按鈕 ─────────────────────────────
      let rcy = my + TITLE_H + PAD;

      // 成功率（最上方）
      const rateCY = rcy + RATE_H / 2;
      rs(this.add.text(rx + P(14), rateCY, '成功率', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaccff', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(RD + 2));
      rs(this.add.text(rx + rw - P(14), rateCY, '100%', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(1, 0.5).setDepth(RD + 2));
      rcy += RATE_H + PAD / 2;

      // 重鑄石素材卡
      rs(this.add.graphics().setDepth(RD + 1))
        .fillStyle(0x160d22, 0.85).fillRoundedRect(rx + P(6), rcy, rw - P(12), MAT_HDR_H + MAT_QTY_H, P(6))
        .lineStyle(P(1), 0x884ab8, 0.6).strokeRoundedRect(rx + P(6), rcy, rw - P(12), MAT_HDR_H + MAT_QTY_H, P(6));

      const matHdrCY = rcy + MAT_HDR_H / 2;
      rs(this.add.image(rx + P(22), matHdrCY, 'icon_stone_guard').setDisplaySize(P(24), P(24)).setDepth(RD + 2));
      rs(this.add.text(rx + P(40), matHdrCY, '重鑄石', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc88ff', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(RD + 2));
      rcy += MAT_HDR_H;

      const matQtyCY = rcy + MAT_QTY_H / 2;
      const guardQty = InventoryStore.getItemQty('stone_guard');
      const matHoldTxt = rs(this.add.text(rx + P(14), matQtyCY, `持有  ${guardQty} 顆`, {
        fontSize: F(14), fontStyle: 'bold', color: guardQty >= 1 ? '#cc88ff' : '#ff6666', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(RD + 2));
      rs(this.add.text(rx + rw - P(14), matQtyCY, '消耗  1 顆', {
        fontSize: F(14), fontStyle: 'bold', color: '#888877', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(1, 0.5).setDepth(RD + 2));
      rcy += MAT_QTY_H + PAD;

      // ── 重鑄按鈕 ─────────────────────────────────────────────
      const bx   = rx + P(8);
      const btnY  = rcy;
      const btnW  = rw - P(16);
      const enabled = isRefined && guardQty >= 1;
      const btnG  = rs(this.add.graphics().setDepth(RD + 2));
      const drawBtn = (on: boolean) => {
        btnG.clear();
        btnG.fillStyle(on ? 0x2a1040 : 0x150820, 1); btnG.fillRect(bx, btnY, btnW, BTN_H);
        btnG.lineStyle(P(2), on ? 0xbb66ff : 0x443355, on ? 0.9 : 0.3);
        btnG.strokeRect(bx, btnY, btnW, BTN_H);
      };
      drawBtn(enabled);
      const btnLbl = rs(this.add.text(rx + rw / 2, btnY + BTN_H / 2, '重  鑄', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc88ff', stroke: '#0a0018', strokeThickness: 2,
      }).setOrigin(0.5).setAlpha(enabled ? 1 : 0.35).setDepth(RD + 3));
      const btnHit = rs(this.add.rectangle(rx + rw / 2, btnY + BTN_H / 2, btnW, BTN_H)
        .setDepth(RD + 4));
      if (enabled) btnHit.setInteractive({ useHandCursor: true });

      const resultTxt = rs(this.add.text(rx + rw / 2, btnY + BTN_H + RESULT_H / 2, '', {
        fontSize: F(15), fontStyle: 'bold', stroke: '#0a0018', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(RD + 2));

      if (!isRefined) {
        resultTxt.setText('尚未精煉，無法重鑄').setColor('#887766');
      } else if (guardQty < 1) {
        resultTxt.setText('重鑄石不足').setColor('#ff6666');
      }

      btnHit.on('pointerdown', () => {
        if (item.quality === 'legendary') {
          resultTxt.setText('傳說武器無法重鑄').setColor('#ff4444'); return;
        }
        if (InventoryStore.getItemQty('stone_guard') < 1) {
          matHoldTxt.setText('持有  0 顆').setColor('#ff6666');
          resultTxt.setText('重鑄石不足！').setColor('#ff4444');
          return;
        }
        InventoryStore.spendItem('stone_guard', 1);
        recastItem(item);
        PlayerStore.notify();
        SaveStore.save();
        btnHit.removeInteractive();
        drawBtn(false);
        btnLbl.setAlpha(0.35);
        resultTxt.setText('✓ 重鑄完成！').setColor('#cc88ff');
        matHoldTxt.setText('持有  0 顆').setColor('#ff6666');
      });
    };

    const showEnhanceModal = (item: EquipmentItem, onClose: () => void) => {
      const { width: W, height: H } = this.scale;
      const mw = P(500);
      const ED = 960;
      const eo: Phaser.GameObjects.GameObject[] = [];
      const es = <T extends Phaser.GameObjects.GameObject>(o: T): T => { eo.push(o); return o; };
      const closeEnhance = () => { eo.forEach(o => o.destroy()); onClose(); };

      const fmtVal  = (stat: string, val: number)  => fmtAffixValue(stat, val);
      const fmtGain = (stat: string, gain: number) => `+${fmtAffixValue(stat, gain)}`;

      let useComplete = false;
      let selectedAffixIdx = 0;

      const TITLE_H = P(44);
      const LEVEL_H = P(38);
      const AFFIX_ROW = P(30);
      const BEH_ROW = P(30);
      const MAT_HDR_H  = P(30);
      const MAT_QTY_H  = P(22);
      const RATE_H     = P(24);
      const OPT_ROW_H  = P(28);
      const OPT_DESC_H = P(18);
      const BTN_H = P(42);
      const RESULT_H = P(28);
      const PAD = P(10);
      const lw = P(260);
      const rw = mw - lw;
      const leftH  = LEVEL_H + PAD + item.affixes.length * AFFIX_ROW + BEH_ROW + PAD;
      const rightH = PAD + MAT_HDR_H + MAT_QTY_H + RATE_H + PAD + OPT_ROW_H + OPT_DESC_H + PAD + BTN_H + RESULT_H + PAD;
      const mh = TITLE_H + Math.max(leftH, rightH);
      const mx = W / 2 - mw / 2;
      const my = H / 2 - mh / 2;
      const rx = mx + lw;

      es(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(ED));

      const bg = es(this.add.graphics().setDepth(ED + 1));
      bg.fillStyle(WD, 0.97); bg.fillRect(mx, my, mw, mh);
      bg.lineStyle(P(2), GOLD, 0.85); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(WB, 1); bg.fillRect(mx, my, mw, TITLE_H);
      bg.lineStyle(P(1), GOLD, 0.4);
      bg.lineBetween(mx, my + TITLE_H, mx + mw, my + TITLE_H);
      bg.lineBetween(mx + lw, my + TITLE_H, mx + lw, my + mh);

      es(this.add.text(W / 2, my + TITLE_H / 2, '強 化 裝 備', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(ED + 2));
      es(this.add.text(mx + mw - P(16), my + TITLE_H / 2, '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(ED + 3))
        .on('pointerdown', closeEnhance);

      const levelTxt = es(this.add.text(mx + lw / 2, my + TITLE_H + LEVEL_H / 2, '', {
        fontSize: F(19), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(ED + 2));

      // ── 詞綴列（左欄，單列垂直）────────────────────────────
      const affixStartY = my + TITLE_H + LEVEL_H + PAD;
      const valTexts: Phaser.GameObjects.Text[] = [];

      // 選中高亮（共用一個 graphics 物件）
      const selHlG = es(this.add.graphics().setDepth(ED + 1));
      const drawSelHL = (idx: number) => {
        selHlG.clear();
        const ay = affixStartY + idx * AFFIX_ROW;
        selHlG.fillStyle(0x3a2c00, 0.75).fillRect(mx + P(4), ay, lw - P(8), AFFIX_ROW);
        selHlG.lineStyle(P(2), 0xf0c040, 0.9).strokeRect(mx + P(4), ay, lw - P(8), AFFIX_ROW);
      };
      drawSelHL(selectedAffixIdx);

      item.affixes.forEach((a, i) => {
        const ay = affixStartY + i * AFFIX_ROW + AFFIX_ROW / 2;
        es(this.add.text(mx + P(10), ay, STAT_NAMES[a.stat], {
          fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(ED + 2));
        valTexts.push(es(this.add.text(mx + lw - P(10), ay, '', {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(1, 0.5).setDepth(ED + 2)));

        // hit area for selection
        es(this.add.rectangle(mx + lw / 2, ay, lw, AFFIX_ROW)
          .setDepth(ED + 3).setInteractive({ useHandCursor: true }))
          .on('pointerdown', () => {
            selectedAffixIdx = i;
            drawSelHL(i);
            updateRangeTxt();
          });
      });

      // Range 文字（左欄底部）
      const rangeAreaY = affixStartY + item.affixes.length * AFFIX_ROW + P(5);
      const rangeTxt = es(this.add.text(mx + P(10), rangeAreaY + P(10), '', {
        fontSize: F(15), fontStyle: 'bold', color: '#88dd88', stroke: '#001100', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const updateRangeTxt = () => {
        const a = item.affixes[selectedAffixIdx];
        if (a) {
          const [lo, hi] = REFINE_INCREMENT_RANGE[a.stat];
          rangeTxt.setText(`追加範圍：+${fmtAffixValue(a.stat, lo)} ~ +${fmtAffixValue(a.stat, hi)}`);
        }
      };
      updateRangeTxt();

      // ── 右欄：素材介面 ──────────────────────────────────────
      let rcy = my + TITLE_H + PAD;

      // 成功率（最上方）
      const rateCY = rcy + RATE_H / 2;
      const rateTxt = es(this.add.text(rx + P(14), rateCY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaccff', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const ratePctTxt = es(this.add.text(rx + rw - P(14), rateCY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(1, 0.5).setDepth(ED + 2));
      rcy += RATE_H + PAD / 2;

      // 主素材卡背景（破損強化石）
      es(this.add.graphics().setDepth(ED + 1))
        .fillStyle(0x221a0a, 0.85).fillRoundedRect(rx + P(6), rcy, rw - P(12), MAT_HDR_H + MAT_QTY_H, P(6))
        .lineStyle(P(1), 0x5a4010, 0.6).strokeRoundedRect(rx + P(6), rcy, rw - P(12), MAT_HDR_H + MAT_QTY_H, P(6));

      // 圖示 + 名稱
      const matHdrCY = rcy + MAT_HDR_H / 2;
      es(this.add.image(rx + P(22), matHdrCY, 'icon_stone_broken').setDisplaySize(P(24), P(24)).setDepth(ED + 2));
      es(this.add.text(rx + P(40), matHdrCY, '破損強化石', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffcc66', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      rcy += MAT_HDR_H;

      // 持有 / 消耗
      const matQtyCY = rcy + MAT_QTY_H / 2;
      const matHoldTxt = es(this.add.text(rx + P(14), matQtyCY, '', {
        fontSize: F(14), fontStyle: 'bold', color: '#ffcc66', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const matCostTxt = es(this.add.text(rx + rw - P(14), matQtyCY, '', {
        fontSize: F(14), fontStyle: 'bold', color: '#aaaaaa', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(1, 0.5).setDepth(ED + 2));
      rcy += MAT_QTY_H;

      // 分隔線
      rcy += PAD;
      es(this.add.graphics().setDepth(ED + 1))
        .lineStyle(P(1), 0x554433, 0.4).lineBetween(rx + P(10), rcy - PAD / 2, rx + rw - P(10), rcy - PAD / 2);

      // 可選素材卡背景（完整強化石）
      es(this.add.graphics().setDepth(ED + 1))
        .fillStyle(0x16101e, 0.85).fillRoundedRect(rx + P(6), rcy, rw - P(12), OPT_ROW_H + OPT_DESC_H, P(6))
        .lineStyle(P(1), 0x6633aa, 0.5).strokeRoundedRect(rx + P(6), rcy, rw - P(12), OPT_ROW_H + OPT_DESC_H, P(6));

      const optRowCY = rcy + OPT_ROW_H / 2;
      es(this.add.image(rx + P(22), optRowCY, 'icon_stone_intact').setDisplaySize(P(22), P(22)).setDepth(ED + 2));
      const optLbl = es(this.add.text(rx + P(40), optRowCY, '', {
        fontSize: F(14), fontStyle: 'bold', color: '#ccbbaa', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const optChkSz = P(16);
      const optChkX  = rx + rw - P(12) - optChkSz;
      const optChkY  = optRowCY - optChkSz / 2;
      const optChkG  = es(this.add.graphics().setDepth(ED + 2));
      const optChkT  = es(this.add.text(optChkX + optChkSz / 2, optRowCY, '', {
        fontSize: F(14), fontStyle: 'bold', color: '#44ff88', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(ED + 3));
      const optHit = es(this.add.rectangle(rx + rw / 2, optRowCY, rw - P(12), OPT_ROW_H).setDepth(ED + 4));
      rcy += OPT_ROW_H;

      const optDescCY = rcy + OPT_DESC_H / 2;
      const optDescTxt = es(this.add.text(rx + P(40), optDescCY, '消耗 1 顆 → 成功率 +8%', {
        fontSize: F(13), fontStyle: 'bold', color: '#aa9977', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      rcy += OPT_DESC_H;

      // ── 強化按鈕 ────────────────────────────────────────────
      rcy += PAD;
      const bx  = rx + P(8);
      const btnY = rcy;
      const bw  = rw - P(16);
      const btnG = es(this.add.graphics().setDepth(ED + 2));
      const drawEnhBtn = (enabled: boolean) => {
        btnG.clear();
        btnG.fillStyle(enabled ? 0x5a3800 : 0x2a1a08, 1); btnG.fillRect(bx, btnY, bw, BTN_H);
        btnG.lineStyle(P(2), enabled ? GOLD : 0x443322, enabled ? 0.9 : 0.3);
        btnG.strokeRect(bx, btnY, bw, BTN_H);
        if (enabled) { btnG.fillStyle(GOLD, 0.3); btnG.fillRect(bx, btnY, bw, P(2)); }
      };
      const btnLbl = es(this.add.text(rx + rw / 2, btnY + BTN_H / 2, '強  化', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(ED + 3));
      const btnHit = es(this.add.rectangle(rx + rw / 2, btnY + BTN_H / 2, bw, BTN_H)
        .setInteractive({ useHandCursor: true }).setDepth(ED + 4));

      const resultTxt = es(this.add.text(rx + rw / 2, btnY + BTN_H + RESULT_H / 2, '', {
        fontSize: F(15), fontStyle: 'bold', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(ED + 2));

      // ── 畫面特效 ──────────────────────────────────────
      const playFlash = (color: number) => {
        const fl = es(this.add.rectangle(W / 2, my + mh / 2, mw - 4, mh - 4, color, 0.4)
          .setDepth(ED + 9));
        this.tweens.add({ targets: fl, alpha: 0, duration: 500, ease: 'Power2' });
      };

      // ── Refresh ───────────────────────────────────────
      const refresh = () => {
        const lv = item.enhancement;
        const maxed = lv >= ENHANCE_MAX || item.quality === 'legendary';
        const base = maxed ? 0 : ENHANCE_RATE[lv];
        const rate = Math.min(1, base + (useComplete ? ENHANCE_COMPLETE_BONUS : 0));

        levelTxt.setText(`+${lv}${!maxed ? `  →  +${lv + 1}` : '  （最高）'}`);
        levelTxt.setColor('#ffe066');
        item.affixes.forEach((a, i) => valTexts[i]?.setText(fmtVal(a.stat, a.value)));

        // 主素材
        const brokenQty = InventoryStore.getItemQty('stone_broken');
        const needStones = !maxed ? ENHANCE_COST[lv] : 0;
        const enoughBrk  = brokenQty >= needStones;
        matHoldTxt.setText(`持有  ${brokenQty} 顆`).setColor(enoughBrk ? '#ffcc66' : '#ff6666');
        matCostTxt.setText(!maxed ? `消耗  ${needStones} 顆` : '').setColor(enoughBrk ? '#888877' : '#ff6666');

        // 成功率
        if (!maxed) {
          const rc = rate >= 0.5 ? '#88ff88' : rate >= 0.3 ? '#ffcc44' : '#ff8866';
          rateTxt.setText('成功率').setColor('#aaccff');
          ratePctTxt.setText(useComplete
            ? `${(base * 100).toFixed(0)}% +8% = ${(rate * 100).toFixed(0)}%`
            : `${(rate * 100).toFixed(0)}%`).setColor(rc);
        } else {
          rateTxt.setText('已強化至最高').setColor('#888877');
          ratePctTxt.setText('');
        }
        drawEnhBtn(!maxed);
        btnLbl.setAlpha(maxed ? 0.4 : 1);
        if (maxed) btnHit.removeInteractive(); else btnHit.setInteractive({ useHandCursor: true });

        // 可選素材
        const intactQty = InventoryStore.getItemQty('stone_intact');
        const canOpt = !maxed && intactQty > 0;
        optLbl.setText(`完整強化石  ×${intactQty}`).setColor(intactQty === 0 ? '#ff6666' : '#ccbbaa');
        optChkG.clear();
        optChkG.fillStyle(useComplete ? 0x1a4428 : 0x15100e, 1);
        optChkG.lineStyle(P(1), useComplete ? 0x44cc88 : 0x554433, 1);
        optChkG.fillRect(optChkX, optChkY, optChkSz, optChkSz);
        optChkG.strokeRect(optChkX, optChkY, optChkSz, optChkSz);
        optChkT.setText(useComplete ? '✓' : '');
        [optChkG, optChkT, optLbl, optDescTxt].forEach(o => o.setAlpha(canOpt ? 1 : 0.3));
        if (canOpt) optHit.setInteractive({ useHandCursor: true }); else optHit.removeInteractive();
        if (!canOpt) useComplete = false;
      };
      refresh();

      optHit.on('pointerdown', () => {
        if (InventoryStore.getItemQty('stone_intact') > 0) { useComplete = !useComplete; refresh(); }
      });

      // 每條詞綴的持久綠色加成文字（再次強化或關閉時清除）
      const gainTexts: (Phaser.GameObjects.Text | null)[] = item.affixes.map(() => null);
      const clearGainTexts = () => {
        for (let i = 0; i < gainTexts.length; i++) {
          gainTexts[i]?.destroy();
          gainTexts[i] = null;
          valTexts[i]?.setX(mx + lw - P(10));
        }
      };

      btnHit.on('pointerdown', () => {
        clearGainTexts();   // 每次按下清除上次的加成提示
        const lv = item.enhancement;
        if (item.quality === 'legendary') return;
        if (lv >= ENHANCE_MAX) return;
        const cost = ENHANCE_COST[lv];
        if (InventoryStore.getItemQty('stone_broken') < cost) {
          resultTxt.setText('破損強化石不足！').setColor('#ff4444'); return;
        }
        if (useComplete && InventoryStore.getItemQty('stone_intact') < 1) {
          resultTxt.setText('完整強化石不足！').setColor('#ff4444'); return;
        }
        InventoryStore.spendItem('stone_broken', cost);
        if (useComplete) InventoryStore.spendItem('stone_intact', 1);
        const rate = Math.min(1, ENHANCE_RATE[lv] + (useComplete ? ENHANCE_COMPLETE_BONUS : 0));

        if (Math.random() < rate) {
          const beforeVals = item.affixes.map(a => a.value);
          const boosted = applyEnhancement(item, selectedAffixIdx);
          PlayerStore.notify(); SaveStore.save(); refresh();
          AudioService.playSfx(this, 'sfx_enhance_ok');
          DailyQuestStore.addProgress('enhance_success', 1);
          playFlash(0x00cc55);
          for (const idx of boosted) {
            const gain = item.affixes[idx].value - beforeVals[idx];
            const gy = affixStartY + idx * AFFIX_ROW + AFFIX_ROW / 2;
            // 浮動文字：從詞綴上方飄起消失
            const ft = es(this.add.text(mx + lw / 2, gy, fmtGain(item.affixes[idx].stat, gain), {
              fontSize: F(15), fontStyle: 'bold', color: '#aaffcc',
              stroke: '#002200', strokeThickness: 2,
            }).setOrigin(0.5, 1).setDepth(ED + 10));
            this.tweens.add({
              targets: ft, y: gy - P(30), alpha: 0, duration: 700, ease: 'Power2',
              onComplete: () => ft.destroy(),
            });
            // 持久顯示：數字往左移，右側放綠色加成
            valTexts[idx].setX(mx + lw - P(80));
            const gt = es(this.add.text(mx + lw - P(10), gy, fmtGain(item.affixes[idx].stat, gain), {
              fontSize: F(15), fontStyle: 'bold', color: '#44ff88',
              stroke: '#003300', strokeThickness: 2,
            }).setOrigin(1, 0.5).setDepth(ED + 10));
            gainTexts[idx] = gt;
          }
          const names = boosted.map(idx => STAT_NAMES[item.affixes[idx].stat]).join('、');
          resultTxt.setText(`✓ 成功！${names} 提升`).setColor('#44ff88');
        } else {
          AudioService.playSfx(this, 'sfx_enhance_ng');
          playFlash(0xff4422);
          resultTxt.setText('✗ 強化失敗').setColor('#ff6644');
          SaveStore.save(); refresh();
        }
      });
    };

    let activeDetail: Phaser.GameObjects.Container | null = null;

    const showEquippedDetail = (item: import('../data/equipment-data').EquipmentItem, equipSlot: EquipSlot) => {
      if (activeDetail) { activeDetail.destroy(); activeDetail = null; }
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH = py + PH - areaTop - P(6);
      const rcx = rightColX + rightColW / 2;   // centre of right column

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - P(4), areaTop, rightColW + P(8), areaH);
      det.add(detBg);
      // 只擋右欄，讓左欄裝備格可直接點擊切換
      det.add(this.add.rectangle(rcx, areaTop + areaH / 2, rightColW + P(8), areaH, 0, 0).setInteractive());

      const backBtn = this.add.text(rightColX + P(8), areaTop + P(16), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeEquipped = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeEquipped());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + P(32), areaTop + P(60), item.texture).setDisplaySize(P(56), P(56)));

      det.add(this.add.text(rightColX + P(72), areaTop + P(38), item.enhancement > 0 ? `【+${item.enhancement}】${item.name}` : item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY = areaTop + P(58);
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        statParts.push(`${STAT_NAMES[a.stat]} +${fmtAffixValue(a.stat, a.value)}`);
      });
      det.add(this.add.text(rightColX + P(72), statOffsetY, statParts.join('\n'), {
        fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = statParts.length * P(18) + P(12);
      dg.fillStyle(WB, 1); dg.fillRect(rightColX, areaTop + P(50) + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + P(51) + statBlockH, rightColW, 1);
      det.add(dg);

      // 脫下 | 精煉 | 販售
      const btnH = P(38), btnW = P(136), btnGap = P(8);
      const btnY = areaTop + areaH - P(28);
      drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY - P(46), btnW, btnH,
        '脫  下', 0x3a1a1a, 0xcc4444, '#ee8888',
        () => { PlayerStore.unequip(equipSlot); closeEquipped(); });
      drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY - P(46), btnW, btnH,
        '精  煉', 0x3a2800, 0xf0c040, '#ffe066',
        () => showRefineChoiceModal(item, () => { closeEquipped(); showEquippedDetail(item, equipSlot); }));
      drawSellBtn(det, rcx, btnY, P(200), btnH, calcEquipSellPrice(item),
        () => {
          PlayerStore.unequip(equipSlot);
          PlayerStore.removeOwned(item);
          InventoryStore.addGold(calcEquipSellPrice(item));
          SaveStore.save();
          closeEquipped();
        });
    };

    // ── buildTopSlots：3欄×2列六宮格 ─────────────────────
    const buildTopSlots = () => {
      topSlotsLayer.removeAll(true);
      const eq = PlayerStore.getEquipped();
      slotDefs.forEach((s, i) => {
        const col = i % ECOLS;
        const row = Math.floor(i / ECOLS);
        const sx = eGridX + col * (slotSz + slotGap);
        const sy = eGridY + row * (slotSz + slotGap);
        const item = eq[s.slotKey];

        const qColor = item ? (QUALITY_COLORS[item.quality] ?? GOLD) : WL;
        const sg = this.add.graphics();
        sg.fillStyle(WB, 1); sg.fillRect(sx, sy, slotSz, slotSz);
        sg.fillStyle(item ? WMI : WM, 1); sg.fillRect(sx + P(2), sy + P(2), slotSz - P(4), slotSz - P(4));
        sg.lineStyle(item ? P(2) : 1.5, item ? qColor : WL, item ? 0.85 : 0.4);
        sg.strokeRect(sx, sy, slotSz, slotSz);
        if (item) {
          sg.lineStyle(P(1), qColor, 0.35);
          sg.strokeRect(sx + P(2), sy + P(2), slotSz - P(4), slotSz - P(4));
          sg.fillStyle(qColor, 0.5); sg.fillRect(sx, sy, slotSz, P(3));
        } else {
          sg.fillStyle(s.color, 0.55); sg.fillRect(sx, sy, slotSz, P(3));
        }
        topSlotsLayer.add(sg);

        if (item && this.textures.exists(item.texture)) {
          const eGlow = applyEnhanceGlow(this, item, sx + slotSz / 2, sy + slotSz / 2 - P(8));
          if (eGlow) topSlotsLayer.add(eGlow);
          const eImg = this.add.image(sx + slotSz / 2, sy + slotSz / 2 - P(8), item.texture)
            .setDisplaySize(P(48), P(48));
          topSlotsLayer.add(eImg);
          sg.fillStyle(0x000000, 0.5); sg.fillRect(sx, sy + slotSz - P(18), slotSz, P(18));
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz - P(10), item.enhancement > 0 ? `+${item.enhancement} ${item.name}` : item.name, {
            fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));

          const tap = this.add.rectangle(sx + slotSz / 2, sy + slotSz / 2, slotSz, slotSz)
            .setInteractive({ useHandCursor: true });
          tap.on('pointerdown', () => showEquippedDetail(item, s.slotKey));
          topSlotsLayer.add(tap);
        } else {
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz / 2 - P(4), s.label, {
            fontSize: F(15), fontStyle: 'bold', color: '#b08040', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));
        }
      });
    };
    buildTopSlots();

    // ── buildStats：人物屬性（全寬 2列×3欄）──────────────────
    const buildStats = () => {
      statsLayer.removeAll(true);
      const s = CardStore.getTotalStats();

      const sg = this.add.graphics();
      sg.fillStyle(WD, 0.55); sg.fillRect(statsX, statsY, statsW, statsH);
      sg.lineStyle(1, WL, 0.25); sg.strokeRect(statsX, statsY, statsW, statsH);
      sg.fillStyle(WB, 0.6); sg.fillRect(statsX, statsY, statsW, P(20));
      statsLayer.add(sg);

      statsLayer.add(this.add.text(statsX + statsW / 2, statsY + P(10), '人 物 屬 性', {
        fontSize: F(15), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));

      const allRows = [
        [{ label: 'HP', value: `${s.maxHp}`, color: '#88ee88' }, { label: '攻擊', value: `${s.atk}`, color: '#ff8855' }],
        [{ label: 'HP回復', value: `${s.hpRegen.toFixed(2)}/s`, color: '#55ffaa' }, { label: '暴擊', value: `${(s.crit * 100).toFixed(0)}%`, color: '#ffaa44' }],
        [{ label: '防禦', value: `${s.def}`, color: '#88aaff' }, { label: '攻速', value: `${(s.atkSpeed * 100).toFixed(0)}%`, color: '#ff88ff' }],
        [{ label: '閃避', value: `${(s.evasion * 100).toFixed(1)}%`, color: '#aaddff' }, { label: '爆傷', value: `${((1 + s.critDmg) * 100).toFixed(0)}%`, color: '#ffdd44' }],
        [{ label: '吸血', value: `${(s.lifesteal * 100).toFixed(2)}%`, color: '#ff6699' }, { label: '持續傷害', value: `+${(s.dotBonus * 100).toFixed(0)}%`, color: '#cc88ff' }],
        [{ label: '速度', value: `${s.speed}`, color: '#ffff88' }, { label: '穿甲', value: `${s.penetration}`, color: '#ff9944' }],
      ];
      const colW2 = statsW / 2;
      const rowH = (statsH - P(20)) / 6;

      allRows.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const cx = statsX + ci * colW2;
          const ry = statsY + P(20) + ri * rowH + rowH / 2;
          statsLayer.add(this.add.text(cx + P(6), ry, cell.label, { fontSize: F(15), fontStyle: 'bold', color: '#888888', stroke: '#000', strokeThickness: 1 }).setOrigin(0, 0.5));
          statsLayer.add(this.add.text(cx + colW2 - P(6), ry, cell.value, { fontSize: F(15), fontStyle: 'bold', color: cell.color, stroke: '#000', strokeThickness: 1 }).setOrigin(1, 0.5));
        });
      });
    };
    buildStats();

    // ── 批量分解 modal ────────────────────────────────────
    const showBatchDismantleModal = () => {
      const BD = 700;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const o = <T extends Phaser.GameObjects.GameObject>(x: T): T => { objs.push(x); return x; };
      const prevTopOnly = this.input.topOnly;
      this.input.topOnly = true;
      const closeModal = () => {
        this.input.topOnly = prevTopOnly;
        objs.forEach(x => x.destroy());
      };

      const QUAL_OPTS = [
        { key: 'normal',  label: '普通', color: '#aaaaaa' },
        { key: 'good',    label: '良好', color: '#55cc55' },
        { key: 'fine',    label: '精良', color: '#4488ff' },
        { key: 'perfect', label: '完美', color: '#ffdd00' },
      ];
      const SLOT_OPTS = [
        { key: 'sword',  label: '武器' },
        { key: 'hat',    label: '頭盔' },
        { key: 'outfit', label: '衣服' },
        { key: 'shoes',  label: '鞋子' },
        { key: 'ring',   label: '飾品' },
      ];

      const mw = P(360);
      const TITLE_H = P(44);
      const LABEL_H = P(22);
      const ROW_H   = P(38);
      const PREV_H  = P(28);
      const BTN_H   = P(40);
      const PAD     = P(12);
      const mh = TITLE_H + PAD + LABEL_H + ROW_H + PAD + LABEL_H + ROW_H + PAD + PREV_H + PAD + BTN_H + PAD;
      const mx = W / 2 - mw / 2;
      const my = H / 2 - mh / 2;

      o(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.68).setInteractive().setDepth(BD))
        .on('pointerdown', closeModal);

      // 擋住視窗內部空白區域，避免點擊穿透到背後的遮罩
      o(this.add.rectangle(W / 2, H / 2, mw, mh).setInteractive().setDepth(BD + 1));

      const bg = o(this.add.graphics().setDepth(BD + 1));
      bg.fillStyle(0x1a1008, 0.97); bg.fillRect(mx, my, mw, mh);
      bg.lineStyle(P(2), 0x997733, 0.85); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(WB, 1); bg.fillRect(mx, my, mw, TITLE_H);
      bg.lineStyle(1, GOLD, 0.4); bg.lineBetween(mx, my + TITLE_H, mx + mw, my + TITLE_H);

      o(this.add.text(W / 2, my + TITLE_H / 2, '批 量 販 售', {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(BD + 2));

      o(this.add.text(mx + mw - P(16), my + TITLE_H / 2, '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({
        hitArea: new Phaser.Geom.Rectangle(-P(16), -P(14), P(36), P(36)),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true,
      }).setDepth(BD + 3)).on('pointerdown', closeModal);

      // ── Quality row ─────────────────────────────────────
      const qualLabelY = my + TITLE_H + PAD;
      o(this.add.text(mx + P(12), qualLabelY + LABEL_H / 2, '品質', {
        fontSize: F(14), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(BD + 2));

      const qualRowCY  = qualLabelY + LABEL_H + ROW_H / 2;
      const qualItemW  = (mw - P(24)) / QUAL_OPTS.length;

      type ChkEntry = { key: string; g: Phaser.GameObjects.Graphics; t: Phaser.GameObjects.Text; cx: number; cy: number };
      const qualItems: ChkEntry[] = [];
      QUAL_OPTS.forEach((q, i) => {
        const cx = mx + P(12) + i * qualItemW + qualItemW / 2;
        const g = o(this.add.graphics().setDepth(BD + 2));
        const t = o(this.add.text(cx - P(10), qualRowCY, '', {
          fontSize: F(12), fontStyle: 'bold', color: '#44ff88', stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(BD + 4));
        o(this.add.text(cx + P(9), qualRowCY + P(1), q.label, {
          fontSize: F(13), fontStyle: 'bold', color: q.color, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(BD + 3));
        qualItems.push({ key: q.key, g, t, cx, cy: qualRowCY });
        o(this.add.rectangle(cx, qualRowCY, qualItemW - P(2), ROW_H)
          .setInteractive({ useHandCursor: true }).setDepth(BD + 5))
          .on('pointerdown', () => {
            if (_dismantlePrefs.qualities.has(q.key)) _dismantlePrefs.qualities.delete(q.key);
            else _dismantlePrefs.qualities.add(q.key);
            _saveDismantlePrefs(); redrawChks(); updatePreview();
          });
      });

      // ── Slot row ─────────────────────────────────────────
      const slotLabelY = qualLabelY + LABEL_H + ROW_H + PAD;
      o(this.add.text(mx + P(12), slotLabelY + LABEL_H / 2, '種類', {
        fontSize: F(14), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(BD + 2));

      const slotRowCY = slotLabelY + LABEL_H + ROW_H / 2;
      const slotItemW = (mw - P(24)) / SLOT_OPTS.length;

      const slotItems: ChkEntry[] = [];
      SLOT_OPTS.forEach((s, i) => {
        const cx = mx + P(12) + i * slotItemW + slotItemW / 2;
        const g = o(this.add.graphics().setDepth(BD + 2));
        const t = o(this.add.text(cx - P(10), slotRowCY, '', {
          fontSize: F(12), fontStyle: 'bold', color: '#44ff88', stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(BD + 4));
        o(this.add.text(cx + P(9), slotRowCY + P(1), s.label, {
          fontSize: F(14), fontStyle: 'bold', color: '#ccbbaa', stroke: '#000', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(BD + 3));
        slotItems.push({ key: s.key, g, t, cx, cy: slotRowCY });
        o(this.add.rectangle(cx, slotRowCY, slotItemW - P(2), ROW_H)
          .setInteractive({ useHandCursor: true }).setDepth(BD + 5))
          .on('pointerdown', () => {
            if (_dismantlePrefs.slots.has(s.key)) _dismantlePrefs.slots.delete(s.key);
            else _dismantlePrefs.slots.add(s.key);
            _saveDismantlePrefs(); redrawChks(); updatePreview();
          });
      });

      // ── Preview count ─────────────────────────────────────
      const prevY = slotLabelY + LABEL_H + ROW_H + PAD;
      const previewCY = prevY + PREV_H / 2;
      const previewTxt = o(this.add.text(W / 2, previewCY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffcc66', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(BD + 2));
      const previewCoinImg = o(this.add.image(0, previewCY, 'icon_coin')
        .setDisplaySize(P(14), P(14)).setDepth(BD + 3).setVisible(false));
      const previewGoldTxt = o(this.add.text(0, previewCY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffcc44', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(BD + 2).setVisible(false));

      // ── Confirm / Cancel ──────────────────────────────────
      const btnBaseY = prevY + PREV_H + PAD;
      const BW = P(130);

      const cancelG = o(this.add.graphics().setDepth(BD + 2));
      cancelG.fillStyle(0x2a1a0a, 1); cancelG.fillRect(W / 2 - BW - P(8), btnBaseY, BW, BTN_H);
      cancelG.lineStyle(P(2), 0x997733, 0.7); cancelG.strokeRect(W / 2 - BW - P(8), btnBaseY, BW, BTN_H);
      o(this.add.text(W / 2 - BW / 2 - P(8), btnBaseY + BTN_H / 2, '取  消', {
        fontSize: F(14), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(BD + 3));
      o(this.add.rectangle(W / 2 - BW / 2 - P(8), btnBaseY + BTN_H / 2, BW, BTN_H)
        .setInteractive({ useHandCursor: true }).setDepth(BD + 5))
        .on('pointerdown', closeModal);

      const confirmG = o(this.add.graphics().setDepth(BD + 2));
      confirmG.fillStyle(0x3a1008, 1); confirmG.fillRect(W / 2 + P(8), btnBaseY, BW, BTN_H);
      confirmG.lineStyle(P(2), 0xcc4422, 0.85); confirmG.strokeRect(W / 2 + P(8), btnBaseY, BW, BTN_H);
      o(this.add.text(W / 2 + BW / 2 + P(8), btnBaseY + BTN_H / 2, '確認販售', {
        fontSize: F(14), fontStyle: 'bold', color: '#ff8855', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(BD + 3));
      o(this.add.rectangle(W / 2 + BW / 2 + P(8), btnBaseY + BTN_H / 2, BW, BTN_H)
        .setInteractive({ useHandCursor: true }).setDepth(BD + 5))
        .on('pointerdown', () => executeBatchDismantle());

      // ── Helpers ───────────────────────────────────────────
      const drawChk = (entry: ChkEntry, checked: boolean) => {
        const sz = P(14);
        entry.g.clear();
        entry.g.fillStyle(checked ? 0x1a3a1a : 0x2a1a0a, 1);
        entry.g.fillRect(entry.cx - P(10) - sz / 2, entry.cy - sz / 2, sz, sz);
        entry.g.lineStyle(1, checked ? 0x44aa66 : 0x554422, 1);
        entry.g.strokeRect(entry.cx - P(10) - sz / 2, entry.cy - sz / 2, sz, sz);
        entry.t.setText(checked ? '✓' : '');
      };

      const redrawChks = () => {
        qualItems.forEach(qi => drawChk(qi, _dismantlePrefs.qualities.has(qi.key)));
        slotItems.forEach(si => drawChk(si, _dismantlePrefs.slots.has(si.key)));
      };

      const getEligibleItems = () => {
        const equippedIds = new Set(
          (Object.values(PlayerStore.getEquipped()) as (import('../data/equipment-data').EquipmentItem | null)[])
            .filter((e): e is import('../data/equipment-data').EquipmentItem => e !== null)
            .map(e => e.id),
        );
        return PlayerStore.getOwned().filter(item => {
          const inSlot = _dismantlePrefs.slots.has(item.slot) ||
            ((item.slot === 'ring1' || item.slot === 'ring2') && _dismantlePrefs.slots.has('ring'));
          return _dismantlePrefs.qualities.has(item.quality) && inSlot && !equippedIds.has(item.id);
        });
      };

      const updatePreview = () => {
        const items = getEligibleItems();
        const gold = items.reduce((s, i) => s + calcEquipSellPrice(i), 0);
        if (items.length > 0) {
          previewTxt.setText(`將販售 ${items.length} 件  +`).setColor('#ffcc66').setOrigin(0, 0.5);
          previewGoldTxt.setText(`${gold}`).setVisible(true);
          const coinSz = P(14), gap = P(4);
          const total = previewTxt.width + gap + coinSz + gap + previewGoldTxt.width;
          const sx = W / 2 - total / 2;
          previewTxt.setX(sx);
          previewCoinImg.setX(sx + previewTxt.width + gap + coinSz / 2).setVisible(true);
          previewGoldTxt.setX(sx + previewTxt.width + gap + coinSz + gap);
        } else {
          previewTxt.setText('尚無符合條件的裝備').setColor('#887766').setOrigin(0.5, 0.5).setX(W / 2);
          previewCoinImg.setVisible(false);
          previewGoldTxt.setVisible(false);
        }
      };

      const executeBatchDismantle = () => {
        const toDismantle = getEligibleItems();
        if (toDismantle.length === 0) { closeModal(); return; }

        // ── 販售中提示 ────────────────────────────────────────
        const LD = BD + 20;
        const loadObjs: Phaser.GameObjects.GameObject[] = [];
        const loadBg = this.add.graphics().setDepth(LD);
        loadBg.fillStyle(0x000000, 0.72);
        loadBg.fillRect(0, 0, W, H);
        const boxW = P(200), boxH = P(64);
        const bx = W / 2 - boxW / 2, by = H / 2 - boxH / 2;
        loadBg.fillStyle(0x1a1008, 0.97); loadBg.fillRoundedRect(bx, by, boxW, boxH, P(8));
        loadBg.lineStyle(P(2), 0x997733, 0.85); loadBg.strokeRoundedRect(bx, by, boxW, boxH, P(8));
        loadObjs.push(loadBg);
        const loadTxt = this.add.text(W / 2, H / 2, '販售中…', {
          fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(LD + 1);
        loadObjs.push(loadTxt);

        // 讓瀏覽器先繪製提示框，再執行販售
        this.time.delayedCall(50, () => {
          const totalGold = toDismantle.reduce((s, i) => s + calcEquipSellPrice(i), 0);
          toDismantle.forEach(item => PlayerStore.removeOwned(item));
          InventoryStore.addGold(totalGold);
          SaveStore.save();
          loadObjs.forEach(x => x.destroy());
          closeModal();
        });
      };

      redrawChks();
      updatePreview();
    };

    // ── 垂直分隔線 ────────────────────────────────────────
    const divGfx = this.add.graphics();
    const divX = rightColX - P(13);
    divGfx.fillStyle(WB, 1); divGfx.fillRect(divX, py + P(44), 2, PH - P(52));
    divGfx.fillStyle(WH, 0.3); divGfx.fillRect(divX + P(2), py + P(44), 1, PH - P(52));
    container.add(divGfx);

    // ── Tabs（右欄頂部）──────────────────────────────────
    const tabH = P(30);
    const tabY = rightColTop;
    const tabW = rightColW / tabDefs.length;
    let activeTab = 0;

    const tabGfx = this.add.graphics();
    const tabLabels: Phaser.GameObjects.Text[] = [];

    const redrawTabs = (active: number) => {
      tabGfx.clear();
      tabDefs.forEach((t, i) => {
        const tx = rightColX + i * tabW;
        tabGfx.fillStyle(i === active ? WMI : WD, 1); tabGfx.fillRect(tx, tabY, tabW, tabH);
        tabGfx.lineStyle(1, WB, 0.25); tabGfx.lineBetween(tx + 2, tabY + tabH / 2, tx + tabW - 2, tabY + tabH / 2);
        tabGfx.lineStyle(1, i === active ? WH : WM, i === active ? 0.7 : 0.3);
        tabGfx.strokeRect(tx, tabY, tabW, tabH);
        if (i === active) { tabGfx.fillStyle(t.color, 0.65); tabGfx.fillRect(tx, tabY, tabW, 3); }
      });
    };
    redrawTabs(0);
    container.add(tabGfx);

    // ── Grid（右欄）─────────────────────────────────────
    const gridY = tabY + tabH + P(6);
    const cellSz = P(68);
    const cellGap = P(7);
    const cols = Math.floor((rightColW + cellGap) / (cellSz + cellGap));
    const gridLeft = rightColX + Math.floor((rightColW - (cols * cellSz + (cols - 1) * cellGap)) / 2);
    const batchBtnH = P(30);
    const gridH = PH / 2 - P(10) - gridY - batchBtnH - P(8);

    // ── 批量分解按鈕（右欄底部，建立後延遲加入 container 確保在 gridLayer 之上）
    const batchBtnCY = PH / 2 - P(6) - batchBtnH / 2;
    const batchBtnG = this.add.graphics();
    batchBtnG.fillStyle(0x2a1208, 1);
    batchBtnG.fillRect(rightColX, batchBtnCY - batchBtnH / 2, rightColW, batchBtnH);
    batchBtnG.lineStyle(P(1), 0x7a4a22, 0.6);
    batchBtnG.strokeRect(rightColX, batchBtnCY - batchBtnH / 2, rightColW, batchBtnH);
    const batchBtnTxt = this.add.text(rightColX + rightColW / 2, batchBtnCY, '批量販售', {
      fontSize: F(14), fontStyle: 'bold', color: '#aa7744', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5);
    const batchBtnHit = this.add.rectangle(rightColX + rightColW / 2, batchBtnCY, rightColW, batchBtnH)
      .setInteractive({ useHandCursor: true });
    batchBtnHit.on('pointerdown', () => showBatchDismantleModal());

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridWheelHandler: ((...args: any[]) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridMoveHandler: ((...args: any[]) => void) | null = null;

    const gridLayer = this.add.container(0, 0);
    container.add(gridLayer);
    // 加在 gridLayer 之後，確保按鈕的 renderOrder 高於格子，點擊不會穿透
    container.add(batchBtnG);
    container.add(batchBtnTxt);
    container.add(batchBtnHit);

    // ── Equip comparison popup ────────────────────────────
    const showEquipComparison = (
      newItem: import('../data/equipment-data').EquipmentItem,
      currentItem: import('../data/equipment-data').EquipmentItem,
      onConfirm: () => void,
    ) => {
      const compD = D + 20;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const s = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };
      const closeComp = () => objs.forEach(o => o.destroy());

      // 對齊詞綴：相同 stat 先排（對齊），其次 cur-only，最後 nxt-only
      const curMap = new Map(currentItem.affixes.map(a => [a.stat, a.value]));
      const nxtMap = new Map(newItem.affixes.map(a => [a.stat, a.value]));
      type ARow = { stat: string; cur?: number; nxt?: number };
      const rows: ARow[] = [];
      for (const a of currentItem.affixes)
        if (nxtMap.has(a.stat)) rows.push({ stat: a.stat, cur: a.value, nxt: nxtMap.get(a.stat) });
      for (const a of currentItem.affixes)
        if (!nxtMap.has(a.stat)) rows.push({ stat: a.stat, cur: a.value });
      for (const a of newItem.affixes)
        if (!curMap.has(a.stat)) rows.push({ stat: a.stat, nxt: a.value });

      const AFFIX_H = P(18);
      const HEADER_H = P(62);
      const CW = P(158), GAP = P(24);
      const CH = HEADER_H + rows.length * AFFIX_H + P(24);
      const PDW = P(380);
      const TITLE_H = P(28);
      const PDH = TITLE_H + P(10) + CH + P(52);
      const mx = W / 2 - PDW / 2;
      const my = H / 2 - PDH / 2;
      const pcx = W / 2;
      const CARD_CY = my + TITLE_H + P(10) + CH / 2;
      const BTN_Y = my + PDH - P(26);

      // 全螢幕遮罩
      s(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65)
        .setInteractive().setDepth(compD))
        .on('pointerdown', closeComp);

      const bg = s(this.add.graphics().setDepth(compD + 1));
      bg.fillStyle(WD, 0.97); bg.fillRect(mx, my, PDW, PDH);
      bg.lineStyle(2, GOLD, 0.85); bg.strokeRect(mx, my, PDW, PDH);
      bg.lineStyle(1, GOLD, 0.3); bg.strokeRect(mx + 4, my + 4, PDW - 8, PDH - 8);
      bg.fillStyle(WB, 1); bg.fillRect(mx, my, PDW, TITLE_H);
      bg.lineStyle(1, GOLD, 0.4); bg.lineBetween(mx, my + TITLE_H, mx + PDW, my + TITLE_H);

      s(this.add.text(pcx, my + TITLE_H / 2, '替換裝備', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 2));

      s(this.add.text(pcx, CARD_CY, '→', {
        fontSize: F(20), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 2));

      const fmtV = (stat: string, v: number) => fmtAffixValue(stat, v);

      const drawItemCard = (
        item: import('../data/equipment-data').EquipmentItem,
        cx: number, labelTxt: string, labelColor: string,
        side: 'cur' | 'nxt',
      ) => {
        const cy = CARD_CY;
        const qColorNum = QUALITY_COLORS[item.quality] ?? 0xffffff;
        const qColorStr = '#' + qColorNum.toString(16).padStart(6, '0');

        const mg = s(this.add.graphics().setDepth(compD + 2));
        mg.fillStyle(0x1a0e06, 1); mg.fillRect(cx - CW / 2, cy - CH / 2, CW, CH);
        mg.lineStyle(2, qColorNum, 0.8); mg.strokeRect(cx - CW / 2, cy - CH / 2, CW, CH);

        s(this.add.text(cx, cy - CH / 2 + P(8), labelTxt, {
          fontSize: F(15), fontStyle: 'bold', color: labelColor, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        s(this.add.text(cx, cy - CH / 2 + P(24), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: qColorStr, stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: CW - P(12) }, align: 'center',
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        s(this.add.text(cx, cy - CH / 2 + P(44), item.enhancement > 0 ? `+${item.enhancement} 強化` : '未強化', {
          fontSize: F(15), fontStyle: 'bold', color: item.enhancement > 0 ? '#ffd060' : '#667766', stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        let ay = cy - CH / 2 + HEADER_H;
        for (const row of rows) {
          const val = row[side];
          if (val !== undefined) {
            const isMatched = row.cur !== undefined && row.nxt !== undefined;
            let color: string;
            if (isMatched) {
              if (side === 'nxt' && row.nxt! > row.cur!) color = '#aaffaa';
              else if (side === 'nxt' && row.nxt! < row.cur!) color = '#ff9999';
              else color = '#88cc88';
            } else {
              color = side === 'cur' ? '#cc8888' : '#aaffaa';
            }
            s(this.add.text(cx, ay, `${(STAT_NAMES as Record<string, string>)[row.stat]}  +${fmtV(row.stat, val)}`, {
              fontSize: F(15), fontStyle: 'bold', color, stroke: '#000', strokeThickness: 1,
            }).setOrigin(0.5, 0).setDepth(compD + 3));
          }
          ay += AFFIX_H;
        }
      };

      const cardCX = CW / 2 + GAP / 2;
      drawItemCard(currentItem, pcx - cardCX, '現有', '#ff9999', 'cur');
      drawItemCard(newItem, pcx + cardCX, '新增', '#99ff99', 'nxt');

      // ── Buttons ─────────────────────────────────────────
      const BW = P(118), BH = P(30);

      const confirmBg = s(this.add.graphics().setDepth(compD + 2));
      confirmBg.fillStyle(0x0e2a0e, 1); confirmBg.fillRect(pcx - BW - 4, BTN_Y - BH / 2, BW, BH);
      confirmBg.lineStyle(1.5, 0x44cc44, 0.9); confirmBg.strokeRect(pcx - BW - 4, BTN_Y - BH / 2, BW, BH);
      s(this.add.text(pcx - BW / 2 - 4, BTN_Y, '確認替換', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 3));
      s(this.add.rectangle(pcx - BW / 2 - 4, BTN_Y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(compD + 4))
        .on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); closeComp(); onConfirm(); });

      const cancelBg = s(this.add.graphics().setDepth(compD + 2));
      cancelBg.fillStyle(0x1a1a1a, 1); cancelBg.fillRect(pcx + 4, BTN_Y - BH / 2, BW, BH);
      cancelBg.lineStyle(1.5, 0x666666, 0.9); cancelBg.strokeRect(pcx + 4, BTN_Y - BH / 2, BW, BH);
      s(this.add.text(pcx + BW / 2 + 4, BTN_Y, '取  消', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 3));
      s(this.add.rectangle(pcx + BW / 2 + 4, BTN_Y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(compD + 4))
        .on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); closeComp(); });
    };

    // ── Detail overlay ────────────────────────────────────
    const showItemDetail = (item: import('../data/equipment-data').EquipmentItem) => {
      if (activeDetail) { activeDetail.destroy(); activeDetail = null; }
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH = py + PH - areaTop - P(6);
      const rcx = rightColX + rightColW / 2;

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - P(4), areaTop, rightColW + P(8), areaH);
      det.add(detBg);
      // 只擋右欄，讓左欄裝備格可直接點擊切換
      det.add(this.add.rectangle(rcx, areaTop + areaH / 2, rightColW + P(8), areaH, 0, 0).setInteractive());

      const backBtn = this.add.text(rightColX + P(8), areaTop + P(16), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeItem = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeItem());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + P(32), areaTop + P(60), item.texture).setDisplaySize(P(56), P(56)));

      det.add(this.add.text(rightColX + P(72), areaTop + P(38), item.enhancement > 0 ? `【+${item.enhancement}】${item.name}` : item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY2 = areaTop + P(58);
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        statParts.push(`${STAT_NAMES[a.stat]} +${fmtAffixValue(a.stat, a.value)}`);
      });
      if (item.quality === 'legendary') statParts.push('無法精煉');
      det.add(this.add.text(rightColX + P(72), statOffsetY2, statParts.join('\n'), {
        fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = statParts.length * P(18) + P(12);
      dg.fillStyle(WB, 1); dg.fillRect(rightColX, areaTop + P(50) + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + P(51) + statBlockH, rightColW, 1);
      det.add(dg);

      const btnH = P(38), btnW = P(136), btnGap = P(8);
      const btnY = areaTop + areaH - P(28);
      const dismantleBtn = () => drawSellBtn(det, rcx, btnY, P(200), btnH, calcEquipSellPrice(item),
        () => {
          PlayerStore.removeOwned(item);
          InventoryStore.addGold(calcEquipSellPrice(item));
          SaveStore.save();
          closeItem();
        });

      if (item.slot === 'ring1' || item.slot === 'ring2') {
        // ── 飾品：飾品1/2 兩個槽位按鈕 + 強化 + 分解 ────────
        const slotBtnY = btnY - P(92);
        const hW = (btnW - 4) / 2;
        const cx1 = rcx - btnW / 2 + hW / 2;
        const cx2 = rcx + btnW / 2 - hW / 2;
        const eq1 = PlayerStore.getEquipped()['ring1'];
        const eq2 = PlayerStore.getEquipped()['ring2'];

        const drawSlotBtn = (g: Phaser.GameObjects.Graphics, cx: number, occupied: boolean) => {
          g.fillStyle(0x5a3800, 1); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          g.fillStyle(GOLD, occupied ? 0.06 : 0.14); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          g.lineStyle(occupied ? 1.5 : 2, GOLD, occupied ? 0.5 : 0.85);
          g.strokeRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          if (!occupied) { g.fillStyle(GOLD, 0.35); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, 2); }
        };
        const slotBtnGfx = this.add.graphics();
        drawSlotBtn(slotBtnGfx, cx1, !!eq1);
        drawSlotBtn(slotBtnGfx, cx2, !!eq2);
        det.add(slotBtnGfx);

        det.add(this.add.text(cx1, slotBtnY - P(7), '飾品 1', { fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx1, slotBtnY + P(9), eq1 ? eq1.name.slice(0, 6) : '空', { fontSize: F(15), fontStyle: 'bold', color: eq1 ? '#cc8888' : '#558855' }).setOrigin(0.5));
        det.add(this.add.text(cx2, slotBtnY - P(7), '飾品 2', { fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx2, slotBtnY + P(9), eq2 ? eq2.name.slice(0, 6) : '空', { fontSize: F(15), fontStyle: 'bold', color: eq2 ? '#cc8888' : '#558855' }).setOrigin(0.5));

        const hit1 = this.add.rectangle(cx1, slotBtnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit1.on('pointerdown', () => {
          if (eq1) { showEquipComparison(item, eq1, () => { PlayerStore.equipToSlot(item, 'ring1'); SaveStore.save(); closeItem(); }); }
          else { PlayerStore.equipToSlot(item, 'ring1'); SaveStore.save(); closeItem(); }
        });
        det.add(hit1);
        const hit2 = this.add.rectangle(cx2, slotBtnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit2.on('pointerdown', () => {
          if (eq2) { showEquipComparison(item, eq2, () => { PlayerStore.equipToSlot(item, 'ring2'); SaveStore.save(); closeItem(); }); }
          else { PlayerStore.equipToSlot(item, 'ring2'); SaveStore.save(); closeItem(); }
        });
        det.add(hit2);
        drawBtn(det, rcx, btnY - P(46), btnW, btnH,
          '精  煉', 0x3a2800, 0xf0c040, '#ffe066',
          () => showRefineChoiceModal(item, () => { closeItem(); showItemDetail(item); }));
        dismantleBtn();
      } else {
        // ── 一般裝備：裝備 | 精煉 + 分解 ──────────────────────
        const currentEquipped = PlayerStore.getEquipped()[item.slot as import('../data/equipment-data').EquipSlot];
        drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY - P(46), btnW, btnH,
          '裝  備', 0x5a3800, GOLD, '#e8c070',
          () => {
            if (currentEquipped) {
              showEquipComparison(item, currentEquipped, () => { PlayerStore.equip(item); SaveStore.save(); closeItem(); });
            } else {
              PlayerStore.equip(item); SaveStore.save(); closeItem();
            }
          });
        drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY - P(46), btnW, btnH,
          '精  煉', 0x3a2800, 0xf0c040, '#ffe066',
          () => showRefineChoiceModal(item, () => { closeItem(); showItemDetail(item); }));
        dismantleBtn();
      }
    };

    const buildGrid = () => {
      if (gridWheelHandler) { this.input.off('wheel', gridWheelHandler); gridWheelHandler = null; }
      if (gridMoveHandler) { this.input.off('pointermove', gridMoveHandler); gridMoveHandler = null; }
      gridLayer.removeAll(true);

      const slotKeys = tabDefs[activeTab].slotKeys;
      const items = PlayerStore.getOwned().filter(it => slotKeys.includes(it.slot));

      if (items.length === 0) {
        gridLayer.add(this.add.text(rightColX + rightColW / 2, gridY + 32, '尚無裝備', {
          fontSize: F(15), fontStyle: 'bold', color: '#5a3820', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const GCOLS   = 2;
      const CARD_GAP = P(6);
      const cardW   = Math.floor((rightColW - CARD_GAP) / GCOLS);
      const ROW_H   = P(86);
      const ROW_GAP = P(5);
      const totalRows = Math.ceil(items.length / GCOLS);
      const contentH  = totalRows * (ROW_H + ROW_GAP) - ROW_GAP;
      let scrollY = 0;
      const maxScroll = Math.max(0, contentH - gridH);

      const scrollCnt = this.add.container(0, gridY);
      gridLayer.add(scrollCnt);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      maskShape.fillStyle(0xffffff);
      maskShape.fillRect(W / 2 + rightColX, H / 2 + gridY, rightColW, gridH);
      scrollCnt.setMask(maskShape.createGeometryMask());

      const applyScroll = (dy: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy, 0, maxScroll);
        scrollCnt.y = gridY - scrollY;
      };

      const gg = this.add.graphics();
      scrollCnt.add(gg);

      items.forEach((item, idx) => {
        const col  = idx % GCOLS;
        const row  = Math.floor(idx / GCOLS);
        const cx   = rightColX + col * (cardW + CARD_GAP);
        const rowY = row * (ROW_H + ROW_GAP);
        const qc    = QUALITY_COLORS[item.quality] ?? WL;
        const qcStr = '#' + qc.toString(16).padStart(6, '0');

        // Card background
        gg.fillStyle(WB, 1);    gg.fillRect(cx, rowY, cardW, ROW_H);
        gg.fillStyle(WM, 0.85); gg.fillRect(cx + P(2), rowY + P(1), cardW - P(4), ROW_H - P(2));
        // Quality colour left bar
        gg.fillStyle(qc, 0.9);  gg.fillRect(cx, rowY, P(3), ROW_H);
        // Border
        gg.lineStyle(P(1), qc, 0.45); gg.strokeRect(cx, rowY, cardW, ROW_H);

        // Item image
        const imgX = cx + P(28);
        const imgY = rowY + ROW_H / 2;
        if (this.textures.exists(item.texture)) {
          const gGlow = applyEnhanceGlow(this, item, imgX, imgY);
          if (gGlow) scrollCnt.add(gGlow);
          scrollCnt.add(this.add.image(imgX, imgY, item.texture).setDisplaySize(P(42), P(42)));
        }

        // Name (+enhancement)
        const textX   = cx + P(58);
        const nameStr = item.enhancement > 0 ? `+${item.enhancement} ${item.name}` : item.name;
        scrollCnt.add(this.add.text(textX, rowY + P(10), nameStr, {
          fontSize: F(14), fontStyle: 'bold', color: qcStr, stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: cardW - P(62), useAdvancedWrap: false },
        }).setOrigin(0, 0));

        // Affixes
        item.affixes.forEach((a, ai) => {
          scrollCnt.add(this.add.text(textX, rowY + P(28) + ai * P(14), `${STAT_NAMES[a.stat]} +${fmtAffixValue(a.stat, a.value)}`, {
            fontSize: F(12), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0, 0));
        });

        // Tap to open detail
        const tap = this.add.rectangle(cx + cardW / 2, rowY + ROW_H / 2, cardW, ROW_H)
          .setInteractive({ useHandCursor: true });
        let _tapStartY = 0;
        tap.on('pointerdown', (ptr: Phaser.Input.Pointer) => { _tapStartY = ptr.y; });
        tap.on('pointerup',   (ptr: Phaser.Input.Pointer) => { if (Math.abs(ptr.y - _tapStartY) < P(8)) showItemDetail(item); });
        scrollCnt.add(tap);
      });

      gridMoveHandler = (ptr: Phaser.Input.Pointer) => {
        if (!ptr.isDown) return;
        applyScroll(ptr.prevPosition.y - ptr.y);
      };
      gridWheelHandler = (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
        applyScroll((dy as number) * 0.6);
      };
      this.input.on('pointermove', gridMoveHandler!);
      this.input.on('wheel', gridWheelHandler!);
    };
    buildGrid();

    // ── Tab bar ───────────────────────────────────────────
    tabDefs.forEach((t, i) => {
      const lbl = this.add.text(rightColX + i * tabW + tabW / 2, tabY + tabH / 2, t.label, {
        fontSize: F(15), fontStyle: 'bold', color: i === 0 ? '#e8c070' : '#7a5830',
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5);
      tabLabels.push(lbl);
      container.add(lbl);

      const hit = this.add.rectangle(rightColX + i * tabW + tabW / 2, tabY + tabH / 2, tabW, tabH)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        tabLabels[activeTab].setStyle({ color: '#7a5830' });
        activeTab = i;
        tabLabels[activeTab].setStyle({ color: '#e8c070' });
        redrawTabs(activeTab);
        buildGrid();
      });
      container.add(hit);
    });

    // ── Reactive refresh ──────────────────────────────────
    const onStoreChange = () => {
      if (!container.active) return;
      buildTopSlots();
      buildStats();
      buildGrid();
    };
    PlayerStore.onChange(onStoreChange);
    CardStore.onChange(onStoreChange);
    const cleanupGrid = () => {
      PlayerStore.offChange(onStoreChange);
      CardStore.offChange(onStoreChange);
      if (gridWheelHandler) this.input.off('wheel', gridWheelHandler);
      if (gridMoveHandler) this.input.off('pointermove', gridMoveHandler);
    };
    container.once('destroy', cleanupGrid);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupGrid);
  }

  // ── Skill Tree ──────────────────────────────────────────

  private showSkillTree(W: number, H: number): void {
    const D = 600;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const s = <T extends Phaser.GameObjects.GameObject>(o: T) => { objs.push(o); return o; };
    const close = () => { objs.forEach(o => o.destroy()); this.tweens.killAll(); };

    // ── Overlay ──────────────────────────────────────────────────────────
    s(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88).setDepth(D).setInteractive());
    const panel = s(this.add.graphics().setDepth(D + 1));
    const PW = W, PH = H;
    const px = 0, py = 0;
    panel.fillStyle(0x0d0808, 1);   panel.fillRect(px, py, PW, PH);
    panel.lineStyle(P(1.5), GOLD, 0.5); panel.strokeRect(px, py, PW, PH);

    // ── Header ────────────────────────────────────────────────────────────
    const hdrH = P(46);
    const hdrG = s(this.add.graphics().setDepth(D + 2));
    hdrG.fillStyle(WD, 1); hdrG.fillRect(px, py, PW, hdrH);
    hdrG.lineStyle(1, GOLD, 0.3); hdrG.lineBetween(px, py + hdrH, px + PW, py + hdrH);
    s(this.add.zone(px + PW / 2, py + hdrH / 2, PW, hdrH).setDepth(D + 2).setInteractive());
    s(this.add.text(px + PW / 2, py + hdrH / 2, '技 能 星 盤', { fontSize: F(17), fontStyle: 'bold', color: '#ffe8a0', stroke: '#0a0400', strokeThickness: 2 }).setOrigin(0.5).setDepth(D + 3));

    const ptsTxt = s(this.add.text(px + P(12), py + hdrH / 2, '', { fontSize: F(15), fontStyle: 'bold', color: '#88ddff', stroke: '#000', strokeThickness: 2 }).setOrigin(0, 0.5).setDepth(D + 3));
    const updatePts = () => ptsTxt.setText(`技能點 ${SkillTreeStore.getAvailablePoints()} / ${SkillTreeStore.getTotalPoints()}`);
    updatePts();

    const xBtn = s(this.add.text(px + PW - P(18), py + hdrH / 2, '✕', { fontSize: F(18), fontStyle: 'bold', color: '#cc4444', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(D + 3));
    const xHit = s(this.add.rectangle(px + PW - P(18), py + hdrH / 2, P(44), P(44)).setDepth(D + 4).setInteractive({ useHandCursor: true }).setAlpha(0.001));
    xHit.on('pointerup', close);

    // ── Reset button (right of skill-points text) ─────────────────────────
    const resetBg = s(this.add.graphics().setDepth(D + 3));
    const resetBtnW = P(76), resetBtnH = P(28);
    const resetBtnX = px + P(12) + P(170);
    const resetBtnY = py + hdrH / 2;
    const resetTxt = s(this.add.text(resetBtnX, resetBtnY, '重置技能', { fontSize: F(15), fontStyle: 'bold', color: '#ffcc66', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5).setDepth(D + 4).setInteractive({ useHandCursor: true }));
    const drawResetBg = (hover: boolean) => {
      resetBg.clear();
      resetBg.fillStyle(hover ? 0x7a3300 : 0x3a1a00, 0.9);
      resetBg.fillRoundedRect(resetBtnX - resetBtnW / 2, resetBtnY - resetBtnH / 2, resetBtnW, resetBtnH, P(4));
      resetBg.lineStyle(P(1), hover ? 0xffaa33 : 0xaa6622, 1);
      resetBg.strokeRoundedRect(resetBtnX - resetBtnW / 2, resetBtnY - resetBtnH / 2, resetBtnW, resetBtnH, P(4));
    };
    drawResetBg(false);
    resetTxt.on('pointerover',  () => drawResetBg(true));
    resetTxt.on('pointerout',   () => drawResetBg(false));

    // ── Star map area ─────────────────────────────────────────────────────
    const mapTop  = py + hdrH + P(6);
    const mapH    = py + PH - mapTop;
    const mapW    = PW;
    const mapCx   = px + mapW / 2;
    const mapCy   = mapTop + mapH / 2;

    // Clip mask
    const maskShape = this.make.graphics({ x: 0, y: 0 });
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(px, mapTop, mapW, mapH);
    objs.push(maskShape);

    // Deep-space background for map area
    const mapBg = s(this.add.graphics().setDepth(D + 1));
    mapBg.fillStyle(0x04090f, 1);
    mapBg.fillRect(px, mapTop, mapW, mapH);
    // Starfield dots
    const rng = Phaser.Math.RND;
    for (let i = 0; i < 120; i++) {
      const sx = px + rng.frac() * mapW;
      const sy = mapTop + rng.frac() * mapH;
      const sa = 0.15 + rng.frac() * 0.55;
      const sr = rng.frac() < 0.15 ? P(1.2) : P(0.7);
      mapBg.fillStyle(0xffffff, sa);
      mapBg.fillCircle(sx, sy, sr);
    }

    // Map container — all star map objects live here; translate for pan
    const mapCnt = s(this.add.container(mapCx, mapCy).setDepth(D + 2));
    mapCnt.setMask(maskShape.createGeometryMask());

    const linesGfx = this.add.graphics();
    mapCnt.add(linesGfx);

    // Node labels
    const NS = 1.5;   // node-position scale factor — spread nodes apart
    const NP = (v: number) => P(v * NS);
    const NODE_R_ROOT = P(20), NODE_R = P(15);
    const labelTxts: Map<string, Phaser.GameObjects.Text> = new Map();
    // Per-node tap zones live inside mapCnt so Phaser handles the coordinate transform
    const nodeDownAt  = new Map<string, { x: number; y: number }>();
    for (const node of SKILL_NODES) {
      const r     = (node.isRoot) ? NODE_R_ROOT : NODE_R;
      const label = node.id === '1'
        ? (ATTACK_MODES.find(a => a.id === SkillTreeStore.getAttackMode())?.label ?? node.label)
        : node.label;
      const tx  = this.add.text(NP(node.x), NP(node.y) + r + P(5), label, {
        fontSize: F(15), fontStyle: 'bold', color: '#aabbcc', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0);
      mapCnt.add(tx);
      labelTxts.set(node.id, tx);

      // Tap zone: circle hit-area centered on node
      const hitD = (r + P(14)) * 2;
      const zone = this.add.zone(NP(node.x), NP(node.y), hitD, hitD)
        .setInteractive(new Phaser.Geom.Circle(hitD / 2, hitD / 2, hitD / 2), Phaser.Geom.Circle.Contains);
      mapCnt.add(zone);
      zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        nodeDownAt.set(node.id, { x: ptr.x, y: ptr.y });
      });
      zone.on('pointerup', (ptr: Phaser.Input.Pointer) => {
        const down = nodeDownAt.get(node.id);
        if (!down) return;
        nodeDownAt.delete(node.id);
        if (Math.hypot(ptr.x - down.x, ptr.y - down.y) > 12) return;
        if (node.id === '1') { hideTip(); showModePicker(); }
        else { closePicker(); showTip(node); }
      });
    }

    const drawMap = () => {
      linesGfx.clear();
      // Connection lines
      for (const node of SKILL_NODES) {
        const parents: string[] = [];
        if (node.parentId) parents.push(node.parentId);
        if (node.extraParentIds) parents.push(...node.extraParentIds);
        for (const pid of parents) {
          const par = SKILL_NODE_MAP[pid];
          if (!par) continue;
          const lit = SkillTreeStore.isLearned(node.id) && SkillTreeStore.isLearned(pid);
          linesGfx.lineStyle(P(1.5), lit ? 0xddcc88 : 0x3a5a78, lit ? 0.85 : 0.55);
          linesGfx.lineBetween(NP(node.x), NP(node.y), NP(par.x), NP(par.y));
        }
      }
      // Node circles
      const CLR_LEARNED   = 0xffe066;  // gold — learned
      const CLR_AVAILABLE = 0x44aaff;  // blue — can learn
      for (const node of SKILL_NODES) {
        const r = node.isRoot ? NODE_R_ROOT : NODE_R;
        if (node.id === '1') {
          // Hub = attack mode selector: always pulsing with current mode colour
          const mc = MODE_COLORS[SkillTreeStore.getAttackMode()] ?? 0xffffff;
          linesGfx.fillStyle(mc, 0.35);
          linesGfx.lineStyle(P(2.5), mc, 1.0);
          linesGfx.fillCircle(NP(node.x), NP(node.y), r);
          linesGfx.strokeCircle(NP(node.x), NP(node.y), r);
          const lbl = labelTxts.get('1');
          if (lbl) {
            lbl.setStyle({ color: '#' + mc.toString(16).padStart(6, '0') });
            lbl.setText(ATTACK_MODES.find(a => a.id === SkillTreeStore.getAttackMode())?.label ?? node.label);
          }
          continue;
        }
        const learned   = SkillTreeStore.isLearned(node.id);
        const available = SkillTreeStore.canLearn(node.id);
        if (learned) {
          linesGfx.fillStyle(CLR_LEARNED, 1.0);
          linesGfx.lineStyle(P(2), 0xffffff, 0.85);
        } else if (available) {
          linesGfx.fillStyle(CLR_AVAILABLE, 0.25);
          linesGfx.lineStyle(P(2), CLR_AVAILABLE, 1.0);
        } else {
          linesGfx.fillStyle(0x0d1e2e, 1.0);
          linesGfx.lineStyle(P(1.5), 0x4a7090, 0.65);
        }
        linesGfx.fillCircle(NP(node.x), NP(node.y), r);
        linesGfx.strokeCircle(NP(node.x), NP(node.y), r);
        const lbl = labelTxts.get(node.id);
        if (lbl) lbl.setStyle({ color: learned ? '#ffe066' : available ? '#88ccff' : '#445566' });
      }
    };
    drawMap();
    resetTxt.on('pointerdown', () => {
      if (InventoryStore.getItemQty('stone_guard') < 1) {
        this._showToast?.('重鑄石不足，無法重置技能星盤');
        return;
      }

      // ── 確認對話框（獨立陣列管理，不用 s() 避免 double-destroy 問題）──
      const cfmObjs: Phaser.GameObjects.GameObject[] = [];
      const ca = <T extends Phaser.GameObjects.GameObject>(o: T): T => { cfmObjs.push(o); return o; };
      const closeConfirm = () => cfmObjs.forEach(o => o.destroy());

      const CW = P(240), CH = P(110), D2 = D + 20;
      const cx = px + PW / 2, cy = py + P(160);

      const dimHit = ca(this.add.rectangle(px + PW / 2, py + PH / 2, PW, PH).setDepth(D2).setInteractive().setAlpha(0.001));
      dimHit.on('pointerdown', Phaser.Utils.NOOP);

      const cfmG = ca(this.add.graphics().setDepth(D2));
      cfmG.fillStyle(0x0a0a14, 0.97); cfmG.fillRoundedRect(cx - CW / 2, cy - CH / 2, CW, CH, P(8));
      cfmG.lineStyle(P(1.5), 0xffaa33, 0.8); cfmG.strokeRoundedRect(cx - CW / 2, cy - CH / 2, CW, CH, P(8));

      ca(this.add.text(cx, cy - CH / 2 + P(18), '確認重置技能星盤？', {
        fontSize: F(14), fontStyle: 'bold', color: '#ffe8a0', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D2 + 1));
      ca(this.add.text(cx, cy - CH / 2 + P(38), '將消耗 1 顆重鑄石', {
        fontSize: F(13), color: '#aabbcc', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5, 0).setDepth(D2 + 1));

      const BW = P(88), BH = P(30), BY = cy + CH / 2 - BH - P(10);

      // 取消
      const cancelG = ca(this.add.graphics().setDepth(D2 + 1));
      cancelG.fillStyle(0x1a1a2a, 1); cancelG.fillRoundedRect(cx - CW / 2 + P(12), BY, BW, BH, P(5));
      cancelG.lineStyle(P(1), 0x445566, 0.8); cancelG.strokeRoundedRect(cx - CW / 2 + P(12), BY, BW, BH, P(5));
      const cancelHit = ca(this.add.rectangle(cx - CW / 2 + P(12) + BW / 2, BY + BH / 2, BW, BH).setDepth(D2 + 2).setInteractive({ useHandCursor: true }).setAlpha(0.001));
      ca(this.add.text(cx - CW / 2 + P(12) + BW / 2, BY + BH / 2, '取消', {
        fontSize: F(14), fontStyle: 'bold', color: '#778899', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D2 + 2));

      // 確認
      const okG = ca(this.add.graphics().setDepth(D2 + 1));
      okG.fillStyle(0x3a1a00, 1); okG.fillRoundedRect(cx + CW / 2 - P(12) - BW, BY, BW, BH, P(5));
      okG.lineStyle(P(1), 0xffaa33, 0.8); okG.strokeRoundedRect(cx + CW / 2 - P(12) - BW, BY, BW, BH, P(5));
      const okHit = ca(this.add.rectangle(cx + CW / 2 - P(12) - BW / 2, BY + BH / 2, BW, BH).setDepth(D2 + 2).setInteractive({ useHandCursor: true }).setAlpha(0.001));
      ca(this.add.text(cx + CW / 2 - P(12) - BW / 2, BY + BH / 2, '確認重置', {
        fontSize: F(14), fontStyle: 'bold', color: '#ffcc66', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D2 + 2));

      cancelHit.on('pointerup', closeConfirm);
      okHit.on('pointerup', () => {
        closeConfirm();
        InventoryStore.spendItem('stone_guard', 1);
        SkillTreeStore.resetAll();
        updatePts();
        drawMap();
        SaveStore.save();
      });
    });

    // ── Tooltip popup ─────────────────────────────────────────────────────
    const TW = PW - P(20), TH = P(110);
    const tipG      = s(this.add.graphics().setDepth(D + 5));
    const tipBlocker = s(this.add.rectangle(0, 0, TW, TH).setDepth(D + 5).setVisible(false).setInteractive());
    tipBlocker.on('pointerdown', Phaser.Utils.NOOP); // 消費事件，防止穿透
    const tipT1 = s(this.add.text(0, 0, '', { fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#000', strokeThickness: 2 }).setDepth(D + 6));
    const tipT2 = s(this.add.text(0, 0, '', { fontSize: F(15), fontStyle: 'bold', color: '#aaccdd', stroke: '#000', strokeThickness: 1, wordWrap: { width: TW - P(20) } }).setDepth(D + 6));
    const tipBtnG = s(this.add.graphics().setDepth(D + 6));
    const tipBtn  = s(this.add.text(0, 0, '', { fontSize: F(15), fontStyle: 'bold', color: '#88ffaa', stroke: '#000', strokeThickness: 2 }).setDepth(D + 7).setInteractive({ useHandCursor: true }));
    let _tipNodeId = '';
    const showTip = (node: import('../data/skill-tree-store').SkillNode) => {
      _tipNodeId = node.id;
      const tx = px + P(10), ty = py + PH - TH - P(8);
      tipBlocker.setPosition(tx + TW / 2, ty + TH / 2).setVisible(true).setInteractive();
      tipG.clear();
      tipG.fillStyle(0x0a0a14, 0.97); tipG.fillRoundedRect(tx, ty, TW, TH, P(6));
      tipG.lineStyle(P(1.5), 0x44aaff, 0.6); tipG.strokeRoundedRect(tx, ty, TW, TH, P(6));
      tipT1.setPosition(tx + P(10), ty + P(8)).setText(node.label);
      tipT2.setPosition(tx + P(10), ty + P(26)).setText(node.desc);
      const learned   = SkillTreeStore.isLearned(node.id);
      const available = SkillTreeStore.canLearn(node.id);
      const btnTxt = learned ? '✓ 已學習' : available ? '學習（消耗 1 點）' : '（未解鎖）';
      const btnCol = learned ? '#aaaaaa' : available ? '#ccffdd' : '#778899';
      // Button geometry
      const BTN_W = P(160), BTN_H = P(30);
      const bx = tx + TW / 2 - BTN_W / 2, by = ty + TH - BTN_H - P(8);
      tipBtnG.clear();
      if (available) {
        tipBtnG.fillStyle(0x1a6633, 1);    tipBtnG.fillRoundedRect(bx, by, BTN_W, BTN_H, P(5));
        tipBtnG.lineStyle(P(1.5), 0x44ff88, 0.9); tipBtnG.strokeRoundedRect(bx, by, BTN_W, BTN_H, P(5));
      } else if (learned) {
        tipBtnG.fillStyle(0x222222, 1);    tipBtnG.fillRoundedRect(bx, by, BTN_W, BTN_H, P(5));
        tipBtnG.lineStyle(P(1.5), 0x555555, 0.7); tipBtnG.strokeRoundedRect(bx, by, BTN_W, BTN_H, P(5));
      } else {
        tipBtnG.fillStyle(0x1a1a2a, 1);    tipBtnG.fillRoundedRect(bx, by, BTN_W, BTN_H, P(5));
        tipBtnG.lineStyle(P(1.5), 0x334455, 0.6); tipBtnG.strokeRoundedRect(bx, by, BTN_W, BTN_H, P(5));
      }
      tipBtn.setPosition(tx + TW / 2, by + BTN_H / 2).setText(btnTxt).setStyle({ color: btnCol }).setOrigin(0.5);
      // Expand interactive hit area to cover the full button rect
      tipBtn.setInteractive(new Phaser.Geom.Rectangle(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H), Phaser.Geom.Rectangle.Contains);
    };
    const hideTip = () => {
      _tipNodeId = '';
      tipG.clear(); tipBtnG.clear(); tipT1.setText(''); tipT2.setText(''); tipBtn.setText('');
      tipBlocker.setVisible(false).removeInteractive();
    };
    hideTip();

    tipBtn.on('pointerdown', () => {
      if (!_tipNodeId) return;
      const node = SKILL_NODE_MAP[_tipNodeId];
      if (!node || !SkillTreeStore.canLearn(_tipNodeId)) return;
      SkillTreeStore.learn(_tipNodeId);
      SaveStore.save();
      updatePts();
      drawMap();
      showTip(node);
    });

    // ── Mode picker popup ─────────────────────────────────────────────────
    // behaviorKey: skill-tree uses 'hellfire', BEHAVIOR_INFO uses 'magicFire'
    const toBehaviorKey = (id: import('../data/skill-tree-store').AttackModeId) =>
      id === 'hellfire' ? 'magicFire' : id as import('../data/equipment-data').AttackBehavior;

    let modePickerObjs: Phaser.GameObjects.GameObject[] = [];
    let modeInfoObjs:   Phaser.GameObjects.GameObject[] = [];
    const closeModeInfo = () => { modeInfoObjs.forEach(o => o.destroy()); modeInfoObjs = []; };
    const closePicker   = () => {
      closeModeInfo();
      modePickerObjs.forEach(o => o.destroy()); modePickerObjs = [];
    };

    const showModeInfo = (m: import('../data/skill-tree-store').AttackModeInfo) => {
      closeModeInfo();
      const mi = <T extends Phaser.GameObjects.GameObject>(o: T) => { modeInfoObjs.push(o); objs.push(o); return o; };
      const info = BEHAVIOR_INFO[toBehaviorKey(m.id)];
      const mc   = MODE_COLORS[m.id] ?? 0xaaaaaa;
      const mcHex = '#' + mc.toString(16).padStart(6, '0');
      const active = SkillTreeStore.getAttackMode() === m.id;

      const IW = Math.min(PW - P(32), P(340));
      const probe = this.add.text(-9999, -9999, info.desc, {
        fontSize: F(15), fontStyle: 'bold', wordWrap: { width: IW - P(32), useAdvancedWrap: true }, lineSpacing: 3,
      });
      const descH = probe.height; probe.destroy();

      const titleH   = P(48);
      const sepGap   = P(12);
      const formulaH = P(26) + info.formula.length * P(20);
      const closeBtnH = P(48);
      const IH = titleH + descH + sepGap + P(12) + formulaH + closeBtnH;
      const ix = W / 2 - IW / 2, iy = mapTop + mapH / 2 - IH / 2;

      // dim overlay (above picker)
      mi(this.add.rectangle(W / 2, mapTop + mapH / 2, W, mapH, 0x000000, 0.55)
        .setDepth(D + 10).setInteractive())
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { ev?.stopPropagation?.(); closeModeInfo(); });

      const bg = mi(this.add.graphics().setDepth(D + 11));
      bg.fillStyle(0x04090f, 0.98); bg.fillRoundedRect(ix, iy, IW, IH, P(8));
      bg.lineStyle(P(2), mc, 0.85);  bg.strokeRoundedRect(ix, iy, IW, IH, P(8));
      bg.fillStyle(mc, 0.25); bg.fillRect(ix, iy, IW, P(3));
      // 攔截 panel 範圍內的點擊，防止穿透到後方遮罩
      mi(this.add.rectangle(ix + IW / 2, iy + IH / 2, IW, IH, 0x000000, 0)
        .setDepth(D + 11).setInteractive())
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { ev?.stopPropagation?.(); });

      mi(this.add.text(W / 2, iy + P(18), BEHAVIOR_NAMES[toBehaviorKey(m.id)], {
        fontSize: F(17), fontStyle: 'bold', color: mcHex, stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D + 12));

      mi(this.add.text(ix + P(14), iy + titleH, info.desc, {
        fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa',
        wordWrap: { width: IW - P(28), useAdvancedWrap: true }, lineSpacing: 3,
      }).setOrigin(0, 0).setDepth(D + 12));

      const sepY = iy + titleH + descH + sepGap;
      const sepG = mi(this.add.graphics().setDepth(D + 12));
      sepG.fillStyle(mc, 0.3); sepG.fillRect(ix + P(10), sepY, IW - P(20), 1);
      mi(this.add.text(ix + P(14), sepY + P(8), '傷害公式', {
        fontSize: F(15), fontStyle: 'bold', color: mcHex,
      }).setOrigin(0, 0).setDepth(D + 12));
      info.formula.forEach((line, i) => {
        mi(this.add.text(ix + P(14), sepY + P(26) + i * P(20), `• ${line}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#aaddaa',
        }).setOrigin(0, 0).setDepth(D + 12));
      });

      // ── 確認 / 取消 ──────────────────────────────────────────
      const btnY  = iy + IH - P(28);
      const btnW2 = P(100), btnH2 = P(32), gap = P(12);
      const confirmX = W / 2 - btnW2 - gap / 2;
      const cancelX  = W / 2 + gap / 2;

      const drawInfoBtn = (bx: number, label: string, col: number, textCol: string, onTap: () => void) => {
        const g = mi(this.add.graphics().setDepth(D + 12));
        g.fillStyle(col, 1); g.fillRoundedRect(bx, btnY - btnH2 / 2, btnW2, btnH2, P(5));
        g.lineStyle(P(1.5), 0xffffff, 0.25); g.strokeRoundedRect(bx, btnY - btnH2 / 2, btnW2, btnH2, P(5));
        const t = mi(this.add.text(bx + btnW2 / 2, btnY, label, {
          fontSize: F(15), fontStyle: 'bold', color: textCol, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(D + 13).setInteractive({ useHandCursor: true }));
        t.on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { ev?.stopPropagation?.(); onTap(); });
      };

      if (!active) {
        drawInfoBtn(confirmX, '確認使用', 0x1a4030, '#55ffaa', () => {
          SkillTreeStore.setAttackMode(m.id);
          SaveStore.save();
          const hubLbl = labelTxts.get('1');
          if (hubLbl) hubLbl.setText(m.label);
          drawMap();
          closePicker();
        });
      }
      drawInfoBtn(active ? W / 2 - btnW2 / 2 : cancelX, active ? '已使用中' : '取  消',
        active ? 0x2a2a2a : 0x2a1010, active ? '#888888' : '#ff8888', closeModeInfo);
    };

    const showModePicker = () => {
      closePicker();
      hideTip();
      const sp = <T extends Phaser.GameObjects.GameObject>(o: T) => { modePickerObjs.push(o); objs.push(o); return o; };

      sp(this.add.rectangle(W / 2, mapTop + mapH / 2, W, mapH, 0x000000, 0.78)
        .setDepth(D + 6).setInteractive())
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { ev?.stopPropagation?.(); closePicker(); });

      const MPW = Math.min(PW - P(40), P(320));
      const cols = 3, btnH = P(46);
      const btnW = Math.floor((MPW - P(16)) / cols);
      const rows = Math.ceil(ATTACK_MODES.length / cols);
      const MPH = P(44) + rows * (btnH + P(6));
      const mpx = W / 2 - MPW / 2, mpy = mapTop + mapH / 2 - MPH / 2;

      const mpG = sp(this.add.graphics().setDepth(D + 7));
      mpG.fillStyle(0x060c18, 1); mpG.fillRoundedRect(mpx, mpy, MPW, MPH, P(8));
      mpG.lineStyle(P(1.5), 0x44aaff, 0.7); mpG.strokeRoundedRect(mpx, mpy, MPW, MPH, P(8));
      sp(this.add.text(W / 2, mpy + P(14), '選擇攻擊模式', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ccff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D + 8));
      ATTACK_MODES.forEach((m, i) => {
        const col = i % cols, row = Math.floor(i / cols);
        const bx = mpx + P(8) + col * btnW;
        const by = mpy + P(38) + row * (btnH + P(6));
        const isLocked = !!m.unlockedBy && !SkillTreeStore.isLearned(m.unlockedBy);
        const active = !isLocked && SkillTreeStore.getAttackMode() === m.id;
        const mc = MODE_COLORS[m.id] ?? 0xaaaaaa;
        const mcHex = '#' + mc.toString(16).padStart(6, '0');
        const bW = btnW - P(4);

        const bg = sp(this.add.graphics().setDepth(D + 7));
        bg.fillStyle(isLocked ? 0x080808 : (active ? 0x1a3050 : 0x0d1828), 1);
        bg.fillRoundedRect(bx, by, bW, btnH, P(5));
        bg.lineStyle(active ? P(2) : 1, active ? mc : (isLocked ? 0x222222 : 0x334455), active ? 1 : 0.5);
        bg.strokeRoundedRect(bx, by, bW, btnH, P(5));

        sp(this.add.text(bx + bW / 2, by + btnH / 2, m.label, {
          fontSize: F(15), fontStyle: 'bold',
          color: isLocked ? '#333333' : (active ? mcHex : '#667788'),
          stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5).setDepth(D + 8));

        sp(this.add.rectangle(bx + bW / 2, by + btnH / 2, bW, btnH)
          .setDepth(D + 9).setInteractive({ useHandCursor: !isLocked }))
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => {
            ev.stopPropagation();
            if (!isLocked) showModeInfo(m);
          });
      });
    };

    // ── Pan & tap ─────────────────────────────────────────────────────────
    let panX = 0, panY = 0;
    let dragStartX = 0, dragStartY = 0;
    let dragStartPanX = 0, dragStartPanY = 0;
    let isDrag = false;

    const MAP_HALF_W = P(600), MAP_HALF_H = P(750);
    const clampPan = () => {
      panX = Phaser.Math.Clamp(panX, -MAP_HALF_W, MAP_HALF_W);
      panY = Phaser.Math.Clamp(panY, -MAP_HALF_H, MAP_HALF_H);
      mapCnt.setPosition(mapCx + panX, mapCy + panY);
    };

    // Drag-capture layer — depth BELOW mapCnt so node zones take priority
    s(this.add.rectangle(mapCx, mapTop + mapH / 2, mapW, mapH)
      .setDepth(D + 1).setInteractive({ useHandCursor: false }));

    const onDown = (ptr: Phaser.Input.Pointer) => {
      dragStartX = ptr.x; dragStartY = ptr.y;
      dragStartPanX = panX; dragStartPanY = panY;
      isDrag = false;
    };
    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown || modePickerObjs.length > 0) return;
      const dx = ptr.x - dragStartX, dy = ptr.y - dragStartY;
      if (!isDrag && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) isDrag = true;
      if (isDrag) { panX = dragStartPanX + dx; panY = dragStartPanY + dy; clampPan(); }
    };
    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (isDrag) { isDrag = false; return; }
      if (modePickerObjs.length > 0) return;
      // Only hide tooltip when tapping empty space; node taps handled by zone events
      const wp  = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
      const lx  = wp.x - mapCnt.x;
      const ly  = wp.y - mapCnt.y;
      const hit = SKILL_NODES.find(n =>
        Math.hypot(NP(n.x) - lx, NP(n.y) - ly) < ((n.isRoot ? NODE_R_ROOT : NODE_R) + P(14))
      );
      if (!hit) { closePicker(); hideTip(); }
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup',   onUp);

    // Cleanup on close
    const origClose = close;
    objs[0].once('destroy', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup',   onUp);
    });
    void origClose;
  }

  // ── Item panel ──────────────────────────────────────────

  private showItemPanel(W: number, H: number): void {
    const PW = Math.min(P(480), W - P(20));
    const PH = Math.min(P(500), H - P(40));
    const D = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
        ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        InventoryStore.offChange(onItemChange);
        PotionBarStore.offChange(redrawPotionSlots);
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL, 1);
    bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + P(2), ry + P(1), px + PW - P(2), ry + P(1));
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9);
    bg.fillRect(px, py, PW, P(36));
    bg.fillStyle(WH, 0.4);
    bg.fillRect(px, py + P(34), PW, P(2));
    bg.fillStyle(WB, 1);
    bg.fillRect(px, py + P(36), PW, P(1));
    container.add(bg);

    container.add(this.add.text(0, py + P(18), '物  品', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - P(20), py + P(18), '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      InventoryStore.offChange(onItemChange);
      PotionBarStore.offChange(redrawPotionSlots);
      container.destroy();
    });
    container.add(closeBtn);

    // ── Potion bar config ─────────────────────────────────
    const HEAL_IDS = new Set([ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L]);
    const POTION_ITEMS = [
      { id: ITEM_POTION_HEALTH_S, name: '小型回復藥水' },
      { id: ITEM_POTION_HEALTH_M, name: '中型回復藥水' },
      { id: ITEM_POTION_HEALTH_L, name: '大型回復藥水' },
      { id: ITEM_POTION_ATK, name: '攻擊力藥水' },
      { id: ITEM_POTION_DEF, name: '防禦力藥水' },
      { id: ITEM_POTION_SPEED, name: '速度藥水' },
      { id: ITEM_POTION_REVIVE, name: '復活藥水' },
    ];
    const potionSecY = py + P(44);
    const potionSlotSZ = P(80), potionSlotGap = P(8);

    container.add(this.add.text(0, potionSecY + P(10), '快捷藥水配置', {
      fontSize: F(13), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5, 0));

    const potionSlotObjs: Array<{
      bg: Phaser.GameObjects.Graphics;
      icon: Phaser.GameObjects.Image | null;
      lbl: Phaser.GameObjects.Text;
    }> = [];

    const redrawPotionSlots = () => {
      potionSlotObjs.forEach((obj, idx) => {
        const itemId = PotionBarStore.getSlot(idx as 0 | 1);
        const qty = itemId ? InventoryStore.getItemQty(itemId) : 0;
        const cx2 = px + P(10) + idx * (potionSlotSZ + potionSlotGap) + potionSlotSZ / 2;
        const sy = potionSecY + P(28);
        const bx2 = cx2 - potionSlotSZ / 2;
        obj.bg.clear();
        obj.bg.fillStyle(0x1a1200, 1);
        obj.bg.fillRoundedRect(bx2, sy, potionSlotSZ, potionSlotSZ, P(6));
        obj.bg.lineStyle(P(2), itemId ? 0xddaa00 : 0x554422, itemId ? 0.85 : 0.4);
        obj.bg.strokeRoundedRect(bx2, sy, potionSlotSZ, potionSlotSZ, P(6));
        if (obj.icon) { obj.icon.destroy(); obj.icon = null; }
        if (itemId && this.textures.exists(`icon_${itemId}`)) {
          const img = this.add.image(cx2, sy + potionSlotSZ / 2 - P(10), `icon_${itemId}`)
            .setDisplaySize(P(36), P(36)).setAlpha(qty > 0 ? 1 : 0.35);
          container.add(img);
          obj.icon = img;
        }
        const itemName = POTION_ITEMS.find(p => p.id === itemId)?.name ?? '（空）';
        obj.lbl.setText(itemName).setPosition(cx2, sy + potionSlotSZ - P(8));
      });
    };

    [0, 1].forEach(idx => {
      const cx2 = px + P(10) + idx * (potionSlotSZ + potionSlotGap) + potionSlotSZ / 2;
      const sy = potionSecY + P(28);
      const bx2 = cx2 - potionSlotSZ / 2;

      const bg = this.add.graphics();
      container.add(bg);
      const lbl = this.add.text(cx2, sy + potionSlotSZ - P(8), '', {
        fontSize: F(12), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
        wordWrap: { width: potionSlotSZ - P(4) }, align: 'center',
      }).setOrigin(0.5, 1);
      container.add(lbl);
      potionSlotObjs.push({ bg, icon: null, lbl });

      // slot label number
      container.add(this.add.text(bx2 + P(5), sy + P(5), `${idx + 1}`, {
        fontSize: F(12), fontStyle: 'bold', color: '#888866', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));

      // hit zone → open picker
      const hit = this.add.rectangle(cx2, sy + potionSlotSZ / 2, potionSlotSZ, potionSlotSZ)
        .setInteractive({ useHandCursor: true });
      container.add(hit);
      hit.on('pointerup', () => {
        // show picker overlay inside the panel
        const pickObjs: Phaser.GameObjects.GameObject[] = [];
        const closePick = () => pickObjs.forEach(o => o.destroy());

        const pickBg = this.add.graphics();
        pickBg.fillStyle(0x1a1200, 0.97);
        pickBg.fillRoundedRect(px + P(4), py + P(37), PW - P(8), PH - P(41), P(6));
        pickBg.lineStyle(P(2), 0x554422, 0.8);
        pickBg.strokeRoundedRect(px + P(4), py + P(37), PW - P(8), PH - P(41), P(6));
        pickObjs.push(pickBg);
        container.add(pickBg);

        const pickBlocker = this.add.rectangle(
          px + P(4) + (PW - P(8)) / 2,
          py + P(37) + (PH - P(41)) / 2,
          PW - P(8), PH - P(41),
        ).setInteractive()
          .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => ev.stopPropagation());
        pickObjs.push(pickBlocker);
        container.add(pickBlocker);

        const backBtn = this.add.text(px + P(18), py + P(52), '← 返回', {
          fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', closePick);
        pickObjs.push(backBtn);
        container.add(backBtn);

        const titleTxt = this.add.text(0, py + P(52), `選擇藥水槽 ${idx + 1}`, {
          fontSize: F(14), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        pickObjs.push(titleTxt);
        container.add(titleTxt);

        // "清除" button
        const clearBtn = this.add.text(px + PW - P(18), py + P(52), '清除', {
          fontSize: F(13), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
        clearBtn.on('pointerdown', () => {
          PotionBarStore.setSlot(idx as 0 | 1, null);
          SaveStore.save();
          redrawPotionSlots();
          closePick();
        });
        pickObjs.push(clearBtn);
        container.add(clearBtn);

        // list available potions (exclude whatever the other slot already has;
        // also exclude all heal types if the other slot is already a heal type)
        const otherSlot = PotionBarStore.getSlot(idx === 0 ? 1 : 0 as 0 | 1);
        const otherIsHeal = otherSlot !== null && HEAL_IDS.has(otherSlot);
        const available = POTION_ITEMS.filter(p =>
          InventoryStore.getItemQty(p.id) > 0 &&
          p.id !== otherSlot &&
          !(otherIsHeal && HEAL_IDS.has(p.id))
        );
        if (available.length === 0) {
          const empty = this.add.text(0, py + P(100), '背包中沒有藥水', {
            fontSize: F(15), fontStyle: 'bold', color: '#7a5830', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5);
          pickObjs.push(empty);
          container.add(empty);
        } else {
          const rowH = P(70) + P(8);
          const listTop = py + P(88);
          const listVisH = PH - P(92);
          const totalH = available.length * rowH;
          const maxScroll = Math.max(0, totalH - listVisH);

          // mask: world coords (container is centred at W/2, H/2)
          const maskGfx = this.add.graphics();
          maskGfx.fillRect(W / 2 + px + P(4), H / 2 + listTop, PW - P(8), listVisH);
          const listMask = new Phaser.Display.Masks.GeometryMask(this, maskGfx);
          pickObjs.push(maskGfx);

          // sub-container holds scrollable rows (coords relative to container)
          const listCt = this.add.container(0, 0);
          pickObjs.push(listCt);
          container.add(listCt);

          let scrollY = 0;
          let dragStartPY = 0;
          let dragStartScroll = 0;
          let isDragging = false;

          available.forEach((p, pi) => {
            const ey = listTop + pi * rowH;
            const rowBg = this.add.graphics();
            rowBg.fillStyle(0x2a1e00, 1);
            rowBg.fillRoundedRect(px + P(10), ey, PW - P(20), P(64), P(6));
            rowBg.lineStyle(P(1), 0x554422, 0.6);
            rowBg.strokeRoundedRect(px + P(10), ey, PW - P(20), P(64), P(6));
            rowBg.setMask(listMask);
            listCt.add(rowBg);

            if (this.textures.exists(`icon_${p.id}`)) {
              const img = this.add.image(px + P(46), ey + P(32), `icon_${p.id}`)
                .setDisplaySize(P(44), P(44)).setMask(listMask);
              listCt.add(img);
            }

            const nameTxt = this.add.text(px + P(80), ey + P(18), p.name, {
              fontSize: F(14), fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 2,
            }).setMask(listMask);
            listCt.add(nameTxt);

            const qtyTxt = this.add.text(px + P(80), ey + P(38), `數量：${InventoryStore.getItemQty(p.id)}`, {
              fontSize: F(13), color: '#ffe866', stroke: '#1a0800', strokeThickness: 1,
            }).setMask(listMask);
            listCt.add(qtyTxt);

            const rowHit = this.add.rectangle(px + P(10) + (PW - P(20)) / 2, ey + P(32), PW - P(20), P(64))
              .setInteractive({ useHandCursor: true }).setMask(listMask);
            listCt.add(rowHit);
            rowHit.on('pointerover', () => { if (!isDragging) rowBg.setAlpha(0.7); });
            rowHit.on('pointerout', () => rowBg.setAlpha(1));
            rowHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
              dragStartPY = ptr.y;
              dragStartScroll = scrollY;
              isDragging = false;
            });
            rowHit.on('pointermove', (ptr: Phaser.Input.Pointer) => {
              if (!ptr.isDown) return;
              const dist = ptr.y - dragStartPY;
              if (Math.abs(dist) > P(6)) {
                isDragging = true;
                rowBg.setAlpha(1);
                scrollY = Phaser.Math.Clamp(dragStartScroll - dist, 0, maxScroll);
                listCt.y = -scrollY;
              }
            });
            rowHit.on('pointerup', () => {
              if (!isDragging) {
                PotionBarStore.setSlot(idx as 0 | 1, p.id);
                SaveStore.save();
                redrawPotionSlots();
                closePick();
              }
              isDragging = false;
            });
          });
        }
      });
    });

    redrawPotionSlots();
    PotionBarStore.onChange(redrawPotionSlots);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PotionBarStore.offChange(redrawPotionSlots));

    // ── Item grid ─────────────────────────────────────────
    const gridY = py + P(44) + P(120);
    const cellSz = P(80);
    const cellGap = P(8);
    const gridLeft = px + P(10);
    const cols = Math.floor((PW - P(20) + cellGap) / (cellSz + cellGap));
    const gridVisH = PH - P(44) - P(120) - P(4);

    const gridContainer = this.add.container(0, 0);
    container.add(gridContainer);

    // Mask clips grid to its visible area (world coords)
    const gridMaskGfx = this.add.graphics();
    gridMaskGfx.fillRect(W / 2 + px, H / 2 + gridY, PW, gridVisH);
    const gridMask = new Phaser.Display.Masks.GeometryMask(this, gridMaskGfx);

    let gridScrollY   = 0;
    let gridMaxScroll = 0;
    let gridDragStartPY     = 0;
    let gridDragStartScroll = 0;
    let gridIsDragging      = false;

    // ── Item detail overlay ───────────────────────────────
    interface ItemMeta { category: string; categoryColor: string; desc: string; descColor: string }
    const ITEM_META: Record<string, ItemMeta> = {
      stone_broken:    { category: '精煉材料', categoryColor: '#aaccaa', desc: '精煉裝備的基礎材料', descColor: '#8aaa88' },
      stone_intact:    { category: '精煉材料', categoryColor: '#aaccaa', desc: '品質較好的精煉材料\n可以增加8%成功率', descColor: '#8aaa88' },
      stone_guard:     { category: '精煉材料', categoryColor: '#aaccaa', desc: '重鑄石\n將裝備重\n重置技能星盤', descColor: '#8aaa88' },
      quest_reroll:    { category: '任務道具', categoryColor: '#aacc88', desc: '任務重製石\n可重新抽取懸賞任務', descColor: '#aabb88' },
      blank_card:      { category: '卡片材料', categoryColor: '#aabbee', desc: '空白卡片\n可用於兌換卡片', descColor: '#88aacc' },
      potion_health_s: { category: '回復藥水', categoryColor: '#88ddaa', desc: '小型回復藥水\n使用後立即恢復 100 HP', descColor: '#88ccaa' },
      potion_health_m: { category: '回復藥水', categoryColor: '#88ddaa', desc: '中型回復藥水\n使用後立即恢復 200 HP', descColor: '#88ccaa' },
      potion_health_l: { category: '回復藥水', categoryColor: '#88ddaa', desc: '大型回復藥水\n使用後立即恢復 300 HP', descColor: '#88ccaa' },
      potion_revive:   { category: '特殊藥水', categoryColor: '#ddaa88', desc: '復活藥水\n死亡時自動復活並恢復 50% HP', descColor: '#ddaa88' },
      potion_atk:      { category: '增益藥水', categoryColor: '#ffcc88', desc: '攻擊力藥水\n攻擊力 +20%，持續 30 秒', descColor: '#ffcc66' },
      potion_def:      { category: '增益藥水', categoryColor: '#ffcc88', desc: '防禦力藥水\n防禦力 +20，持續 30 秒', descColor: '#ffcc66' },
      potion_speed:    { category: '增益藥水', categoryColor: '#ffcc88', desc: '速度藥水\n移動速度 +20，持續 30 秒', descColor: '#ffcc66' },
      ticket_slime:    { category: '★  地圖門票', categoryColor: '#ffdd55', desc: '史萊姆系列門票\n可挑戰一次 6 星史萊姆王', descColor: '#ffee88' },
      ticket_flower:   { category: '★  地圖門票', categoryColor: '#ffdd55', desc: '花怪系列門票\n可挑戰一次 6 星花王', descColor: '#ffee88' },
      ticket_orc:      { category: '★  地圖門票', categoryColor: '#ffdd55', desc: '獸人系列門票\n可挑戰一次 6 星獸人王', descColor: '#ffee88' },
      ticket_vampire:  { category: '★  地圖門票', categoryColor: '#ffdd55', desc: '吸血鬼系列門票\n可挑戰一次 6 星吸血鬼王', descColor: '#ffee88' },
    };

    const showItemDetail = (item: import('../data/inventory-store').InventoryItem) => {
      const det = this.add.container(0, 0);
      container.add(det);

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.97); detBg.fillRect(px + P(4), py + P(37), PW - P(8), PH - P(41));
      det.add(detBg);

      // Invisible blocker — prevents clicks from passing through to item grid behind
      const blocker = this.add.rectangle(
        px + P(4) + (PW - P(8)) / 2,
        py + P(37) + (PH - P(41)) / 2,
        PW - P(8), PH - P(41),
      ).setInteractive()
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => ev.stopPropagation());
      det.add(blocker);

      const backBtn = this.add.text(px + P(16), py + P(51), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => det.destroy());
      det.add(backBtn);

      const meta = ITEM_META[item.id];

      const iconKey = `icon_${item.id}`;
      if (this.textures.exists(iconKey)) {
        const iconBg = this.add.graphics();
        iconBg.fillStyle(WM, 1); iconBg.fillRect(-P(36), py + P(76), P(72), P(72));
        iconBg.lineStyle(2, WL, 0.6); iconBg.strokeRect(-P(36), py + P(76), P(72), P(72));
        det.add(iconBg);
        det.add(this.add.image(0, py + P(112), iconKey).setDisplaySize(P(56), P(56)));
      }

      det.add(this.add.text(0, py + P(160), item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));

      const qtyBg = this.add.graphics();
      qtyBg.fillStyle(WM, 1); qtyBg.fillRect(-P(40), py + P(182), P(80), P(26));
      qtyBg.lineStyle(1, WL, 0.4); qtyBg.strokeRect(-P(40), py + P(182), P(80), P(26));
      det.add(qtyBg);
      det.add(this.add.text(0, py + P(195), `數量：${item.qty}`, {
        fontSize: F(15), fontStyle: 'bold', color: '#e8e070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      const dg = this.add.graphics();
      dg.fillStyle(WB, 1); dg.fillRect(px + P(16), py + P(218), PW - P(32), P(1));
      dg.fillStyle(WH, 0.3); dg.fillRect(px + P(16), py + P(219), PW - P(32), P(1));
      det.add(dg);

      if (meta) {
        det.add(this.add.text(0, py + P(233), meta.category, {
          fontSize: F(13), fontStyle: 'bold', color: meta.categoryColor, stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        det.add(this.add.text(0, py + P(255), meta.desc, {
          fontSize: F(14), fontStyle: 'bold', color: meta.descColor, stroke: '#1a0800', strokeThickness: 1,
          align: 'center', wordWrap: { width: PW - P(32) },
        }).setOrigin(0.5, 0));
      } else {
        det.add(this.add.text(0, py + P(232), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: '#8aaa88', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
      }

      // ── 配置快捷欄按鈕（藥水限定）────────────────────────
      if (item.id.startsWith('potion_')) {
        const assignBtnY = py + P(318);
        const assignBtnW = P(150), assignBtnH = P(40);

        const assignBg = this.add.graphics();
        assignBg.fillStyle(WB, 1);
        assignBg.fillRoundedRect(-assignBtnW / 2, assignBtnY - assignBtnH / 2, assignBtnW, assignBtnH, P(6));
        assignBg.lineStyle(P(2), WL, 0.85);
        assignBg.strokeRoundedRect(-assignBtnW / 2, assignBtnY - assignBtnH / 2, assignBtnW, assignBtnH, P(6));
        det.add(assignBg);

        det.add(this.add.text(0, assignBtnY, '配置快捷欄', {
          fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5));

        const assignHit = this.add.rectangle(0, assignBtnY, assignBtnW, assignBtnH)
          .setInteractive({ useHandCursor: true });
        det.add(assignHit);

        assignHit.on('pointerup', () => {
          det.destroy();

          const hlObjs: Phaser.GameObjects.GameObject[] = [];
          const closeHl = () => hlObjs.forEach(o => o.destroy());

          // 整個 panel 的取消攔截層（最先加入 = 在下層）
          const cancelBlocker = this.add.rectangle(0, 0, PW, PH)
            .setInteractive()
            .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => {
              ev.stopPropagation();
              closeHl();
            });
          hlObjs.push(cancelBlocker);
          container.add(cancelBlocker);

          // 遮暗藥水格子以外的區域
          const dimGfx = this.add.graphics();
          dimGfx.fillStyle(0x000000, 0.5);
          const dimTop = potionSecY + P(28) + potionSlotSZ + P(4);
          dimGfx.fillRect(px + P(4), dimTop, PW - P(8), py + PH - dimTop - P(4));
          hlObjs.push(dimGfx);
          container.add(dimGfx);

          // 提示文字
          const hintTxt = this.add.text(0, dimTop + P(6), '點選上方格子以配置\n點其他地方取消', {
            fontSize: F(12), fontStyle: 'bold', color: '#aaffaa', stroke: '#001a00', strokeThickness: 1,
            align: 'center',
          }).setOrigin(0.5, 0);
          hlObjs.push(hintTxt);
          container.add(hintTxt);

          // 兩個藥水格子的高亮與點擊區
          [0, 1].forEach(slotIdx => {
            const scx = px + P(10) + slotIdx * (potionSlotSZ + potionSlotGap) + potionSlotSZ / 2;
            const ssy = potionSecY + P(28);
            const sbx = scx - potionSlotSZ / 2;

            const glowGfx = this.add.graphics();
            glowGfx.fillStyle(0x44ff44, 0.2);
            glowGfx.fillRoundedRect(sbx - P(3), ssy - P(3), potionSlotSZ + P(6), potionSlotSZ + P(6), P(8));
            glowGfx.lineStyle(P(3), 0x44ff44, 0.9);
            glowGfx.strokeRoundedRect(sbx - P(3), ssy - P(3), potionSlotSZ + P(6), potionSlotSZ + P(6), P(8));
            hlObjs.push(glowGfx);
            container.add(glowGfx);

            const slotHit = this.add.rectangle(scx, ssy + potionSlotSZ / 2, potionSlotSZ + P(6), potionSlotSZ + P(6))
              .setInteractive({ useHandCursor: true });
            hlObjs.push(slotHit);
            container.add(slotHit);

            slotHit.on('pointerup', () => {
              const otherIdx = slotIdx === 0 ? 1 : 0;
              const otherSlot = PotionBarStore.getSlot(otherIdx as 0 | 1);
              if (otherSlot && HEAL_IDS.has(otherSlot) && HEAL_IDS.has(item.id)) return;
              PotionBarStore.setSlot(slotIdx as 0 | 1, item.id);
              SaveStore.save();
              redrawPotionSlots();
              closeHl();
            });
          });
        });
      }
    };

    const buildGrid = () => {
      gridContainer.removeAll(true);
      gridScrollY = 0;
      gridContainer.y = 0;
      const allItems = InventoryStore.getAllItems();

      if (allItems.length === 0) {
        gridMaxScroll = 0;
        gridContainer.add(this.add.text(0, gridY + 40, '背包是空的', {
          fontSize: F(15), fontStyle: 'bold', color: '#7a5830', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const rowCount = Math.ceil(allItems.length / cols);
      gridMaxScroll = Math.max(0, rowCount * (cellSz + cellGap) - gridVisH);

      const gg = this.add.graphics();
      gg.setMask(gridMask);
      gridContainer.add(gg);

      allItems.forEach((item, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx2 = gridLeft + col * (cellSz + cellGap);
        const cy2 = gridY + row * (cellSz + cellGap);

        gg.fillStyle(WB, 1); gg.fillRect(cx2, cy2, cellSz, cellSz);
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + P(2), cy2 + P(2), cellSz - P(4), cellSz - P(4));
        gg.fillStyle(0x70b858, 0.6); gg.fillRect(cx2, cy2, cellSz, P(3));
        gg.lineStyle(1.5, WL, 0.4); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        const iconKey = `icon_${item.id}`;
        if (this.textures.exists(iconKey)) {
          const isBig = item.id.startsWith('stone_') || item.id === 'quest_reroll' || item.id.startsWith('ticket_');
          const iconSz = isBig ? P(44) : P(28);
          gridContainer.add(
            this.add.image(cx2 + cellSz / 2, cy2 + P(32), iconKey).setDisplaySize(iconSz, iconSz).setMask(gridMask),
          );
        }

        const nameColor = '#ffe090';
        gridContainer.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - P(4), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: nameColor, stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: cellSz - P(6) }, align: 'center',
        }).setOrigin(0.5, 1).setMask(gridMask));

        gridContainer.add(this.add.text(cx2 + cellSz - P(3), cy2 + P(4), `×${item.qty}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe866', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(1, 0).setMask(gridMask));

        const tap = this.add.rectangle(cx2 + cellSz / 2, cy2 + cellSz / 2, cellSz, cellSz)
          .setInteractive({ useHandCursor: true }).setMask(gridMask);
        tap.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          gridDragStartPY     = ptr.y;
          gridDragStartScroll = gridScrollY;
          gridIsDragging      = false;
        });
        tap.on('pointermove', (ptr: Phaser.Input.Pointer) => {
          if (!ptr.isDown) return;
          if (Math.abs(ptr.y - gridDragStartPY) > P(6)) {
            gridIsDragging = true;
            gridScrollY    = Phaser.Math.Clamp(gridDragStartScroll - (ptr.y - gridDragStartPY), 0, gridMaxScroll);
            gridContainer.y = -gridScrollY;
          }
        });
        tap.on('pointerup', () => {
          if (!gridIsDragging) showItemDetail(item);
          gridIsDragging = false;
        });
        gridContainer.add(tap);
      });

    };

    buildGrid();

    const onItemChange = () => {
      if (!container.active) return;
      buildGrid();
    };
    InventoryStore.onChange(onItemChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => InventoryStore.offChange(onItemChange));
  }

  // ── Center hero ─────────────────────────────────────────

  // ── Card Window ─────────────────────────────────────────

  private openCardWindow(W: number, H: number): void {
    const PW = Math.min(W - P(16), P(700));
    const PH = Math.min(H - P(20), P(560));
    const D = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
        ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        cleanup();
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell (same wood style)
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL, 1);
    bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + P(2), ry + 1, px + PW - P(2), ry + 1);
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, P(36));
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + P(34), PW, P(2));
    bg.fillStyle(WB, 1); bg.fillRect(px, py + P(36), PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + P(18), '卡  片', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - P(20), py + P(18), '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtn.on('pointerup', () => { cleanup(); container.destroy(); });
    container.add(closeBtn);

    // Layout constants
    const CARD_W = P(72);
    const CARD_H = P(96);
    const SLOT_GAP = P(8);
    const slotsTotW = CARD_SLOT_COUNT * CARD_W + (CARD_SLOT_COUNT - 1) * SLOT_GAP;
    const slotsY = py + P(58);
    const INV_TOP = slotsY + CARD_H + P(24);
    const INV_H = py + PH - INV_TOP - P(8);
    const INV_COLS = 5;
    const INV_GAP = P(10);
    const invTotW = INV_COLS * CARD_W + (INV_COLS - 1) * INV_GAP;
    // 左右分割：左側卡片區 / 右側加成面板
    const LEFT_W  = P(440);
    const leftCX  = px + LEFT_W / 2;
    const RIGHT_X = px + LEFT_W;
    const RIGHT_W = PW - LEFT_W;
    const rightCX = RIGHT_X + RIGHT_W / 2;
    const slotsX0 = leftCX - slotsTotW / 2;
    const invX0   = leftCX - invTotW / 2;

    // ── Equipped slots label ──────────────────────────────
    container.add(this.add.text(leftCX, slotsY - P(14), '裝備中', {
      fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5));

    // ── Right panel: static bg + header ───────────────────
    const rightBg = this.add.graphics();
    rightBg.fillStyle(0x000000, 0.18);
    rightBg.fillRect(RIGHT_X, py + P(36), RIGHT_W, PH - P(36));
    rightBg.lineStyle(1, WM, 0.5);
    rightBg.lineBetween(RIGHT_X, py + P(36), RIGHT_X, py + PH - P(4));
    container.add(rightBg);
    container.add(this.add.text(rightCX, py + P(44), '卡片加成', {
      fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5, 0));

    // ── Content sub-container (rebuilt on change) ──────────
    let contentCnt = this.add.container(0, 0);
    container.add(contentCnt);

    // ── Helper: 持有欄卡片（木質風格）────────────────────────
    const drawInvCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x = cx - w / 2, y = cy - h / 2;
      const SILV = 0xb87333;   // 銅色框
      // 陰影
      g.fillStyle(0x000000, 0.35);
      g.fillRect(x + P(2), y + P(2), w, h);
      // 底色
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：銀灰色
      g.lineStyle(2.5, SILV, 0.9);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, SILV, 0.4);
      g.strokeRect(x + P(3), y + P(3), w - P(6), h - P(6));
      // 四角裝飾點
      const cr = P(3);
      g.fillStyle(SILV, 0.85);
      g.fillCircle(x + cr + P(1), y + cr + P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + cr + P(1), cr);
      g.fillCircle(x + cr + P(1), y + h - cr - P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + h - cr - P(1), cr);
      // 上下橫紋
      g.lineStyle(1.5, SILV, 0.45);
      g.lineBetween(x + P(10), y + P(8), x + w - P(10), y + P(8));
      g.lineBetween(x + P(10), y + h - P(8), x + w - P(10), y + h - P(8));
    };

    // ── Helper: 菁英卡片（銀框質感）─────────────────────────
    const drawEliteCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x = cx - w / 2, y = cy - h / 2;
      const SILV = 0x9aacb8;   // 銀色框
      // 陰影
      g.fillStyle(0x000000, 0.4);
      g.fillRect(x + 2, y + 2, w, h);
      // 底色
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：銀色
      g.lineStyle(2.5, SILV, 0.95);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, SILV, 0.45);
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      // 四角裝飾點
      const cr = 3;
      g.fillStyle(SILV, 0.9);
      g.fillCircle(x + cr + 1, y + cr + 1, cr);
      g.fillCircle(x + w - cr - 1, y + cr + 1, cr);
      g.fillCircle(x + cr + 1, y + h - cr - 1, cr);
      g.fillCircle(x + w - cr - 1, y + h - cr - 1, cr);
      // 上下橫紋
      g.lineStyle(1.5, SILV, 0.5);
      g.lineBetween(x + 10, y + 8, x + w - 10, y + 8);
      g.lineBetween(x + 10, y + h - 8, x + w - 10, y + h - 8);
    };

    // ── Helper: Boss 卡片（金框質感）─────────────────────────
    const drawBossCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x = cx - w / 2, y = cy - h / 2;
      const GOLD = 0xf0c040;
      // 陰影
      g.fillStyle(0x000000, 0.5);
      g.fillRect(x + P(3), y + P(3), w, h);
      // 底色（同小怪卡）
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：金色粗框
      g.lineStyle(2.5, GOLD, 0.95);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, GOLD, 0.45);
      g.strokeRect(x + P(3), y + P(3), w - P(6), h - P(6));
      // 四角裝飾點
      const cr = P(3);
      g.fillStyle(GOLD, 0.9);
      g.fillCircle(x + cr + P(1), y + cr + P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + cr + P(1), cr);
      g.fillCircle(x + cr + P(1), y + h - cr - P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + h - cr - P(1), cr);
      // 上下橫紋
      g.lineStyle(1.5, GOLD, 0.55);
      g.lineBetween(x + P(10), y + P(8), x + w - P(10), y + P(8));
      g.lineBetween(x + P(10), y + h - P(8), x + w - P(10), y + h - P(8));
    };

    // ── Slot-pick overlay ─────────────────────────────────
    let slotPickLayer: Phaser.GameObjects.Container | null = null;

    const clearSlotPick = () => { slotPickLayer?.destroy(); slotPickLayer = null; };

    const showComparison = (
      newCardId: string,
      newDef: NonNullable<ReturnType<typeof getCardDef>>,
      oldCardId: string,
      slot: number,
    ) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 6);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      const oldDef = getCardDef(oldCardId)!;

      // ── fixed layout ──────────────────────────────────────
      const PDW = P(340), PDH = P(310);
      const CW = P(130), CH = P(175);
      const GAP = P(20);
      const CARD_Y = -P(20);
      const BTN_Y = PDH / 2 - P(24);
      const popY = 0;

      // backdrop
      const pbg = this.add.graphics();
      pbg.fillStyle(0x1a0e06, 0.97);
      pbg.fillRect(-PDW / 2, popY - PDH / 2, PDW, PDH);
      pbg.lineStyle(2, 0xc89040, 0.8);
      pbg.strokeRect(-PDW / 2, popY - PDH / 2, PDW, PDH);
      pbg.lineStyle(1, 0xc89040, 0.3);
      pbg.strokeRect(-PDW / 2 + P(4), popY - PDH / 2 + P(4), PDW - P(8), PDH - P(8));
      // title bar
      pbg.fillStyle(0x2a1608, 1);
      pbg.fillRect(-PDW / 2, popY - PDH / 2, PDW, P(26));
      pbg.lineStyle(1, 0xc89040, 0.4);
      pbg.lineBetween(-PDW / 2, popY - PDH / 2 + P(26), PDW / 2, popY - PDH / 2 + P(26));
      slotPickLayer.add(pbg);

      slotPickLayer.add(this.add.text(0, popY - PDH / 2 + P(13), '替換卡片', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));

      // arrow
      slotPickLayer.add(this.add.text(0, popY + CARD_Y, '→', {
        fontSize: F(20), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));

      // mini card
      const drawMiniCard = (def: NonNullable<ReturnType<typeof getCardDef>>, cx: number, label: string, labelColor: string) => {
        const cy = popY + CARD_Y;
        const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
        const frameC = monTier >= 5 ? 0xf0c040 : monTier === 3 ? 0x60a8e0 : 0x9aacb8;
        const mg = this.add.graphics();
        mg.fillStyle(0x2a1a08, 1);
        mg.fillRect(cx - CW / 2, cy - CH / 2, CW, CH);
        mg.lineStyle(2, frameC, 0.9);
        mg.strokeRect(cx - CW / 2, cy - CH / 2, CW, CH);
        slotPickLayer!.add(mg);

        // label (現有 / 新增)
        slotPickLayer!.add(this.add.text(cx, cy - CH / 2 + P(8), label, {
          fontSize: F(15), fontStyle: 'bold', color: labelColor, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0));

        // card name
        slotPickLayer!.add(this.add.text(cx, cy - CH / 2 + P(24), getCardDisplayName(def.id), {
          fontSize: F(15), fontStyle: 'bold', color: '#f0d080', stroke: '#000', strokeThickness: 2,
          wordWrap: { width: CW - P(12) }, align: 'center',
        }).setOrigin(0.5, 0));

        // monster sprite — same scale logic as detail popup
        const monDef = getMonsterDef(def.monsterId);
        if (monDef) {
          try {
            const sprScale = monsterCardScale(monTier);
            const sp = this.add.sprite(cx, cy - P(8), `${monDef.spriteKey}_idle`, 0).setScale(sprScale);
            if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
            slotPickLayer!.add(sp);
          } catch { /* */ }
        }

        // effect desc
        slotPickLayer!.add(this.add.text(cx, cy + CH / 2 - P(8), def.desc, {
          fontSize: F(15), fontStyle: 'bold', color: '#c8a060', stroke: '#000', strokeThickness: 1,
          wordWrap: { width: CW - P(12), useAdvancedWrap: true }, align: 'center', maxLines: 3,
        }).setOrigin(0.5, 1));
      };

      const cardCX = CW / 2 + GAP / 2;
      drawMiniCard(oldDef, -cardCX, '現有', '#ff9999');
      drawMiniCard(newDef, cardCX, '新增', '#99ff99');

      // ── Buttons (inside frame) ──────────────────────────
      const BW = P(118), BH = P(30);
      const btnY = popY + BTN_Y;

      const confirmBg = this.add.graphics();
      confirmBg.fillStyle(0x0e2a0e, 1); confirmBg.fillRect(-BW - P(4), btnY - BH / 2, BW, BH);
      confirmBg.lineStyle(1.5, 0x44cc44, 0.9); confirmBg.strokeRect(-BW - P(4), btnY - BH / 2, BW, BH);
      slotPickLayer.add(confirmBg);
      slotPickLayer.add(this.add.text(-BW / 2 - P(4), btnY, '確認替換', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));
      const confirmHit = this.add.rectangle(-BW / 2 - P(4), btnY, BW, BH).setInteractive({ useHandCursor: true });
      confirmHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        CardStore.equip(newCardId, slot);
        SaveStore.save();
        clearSlotPick();
      });
      slotPickLayer.add(confirmHit);

      const cancelBg = this.add.graphics();
      cancelBg.fillStyle(0x1a1a1a, 1); cancelBg.fillRect(P(4), btnY - BH / 2, BW, BH);
      cancelBg.lineStyle(1.5, 0x666666, 0.9); cancelBg.strokeRect(P(4), btnY - BH / 2, BW, BH);
      slotPickLayer.add(cancelBg);
      slotPickLayer.add(this.add.text(BW / 2 + P(4), btnY, '取  消', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));
      const cancelHit = this.add.rectangle(BW / 2 + P(4), btnY, BW, BH).setInteractive({ useHandCursor: true });
      cancelHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); clearSlotPick(); });
      slotPickLayer.add(cancelHit);
    };

    // 從裝備槽出發，選庫存卡片來比較/替換
    const enterInventoryPick = (fromSlot: number, fromCardId: string) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 5);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      slotPickLayer.add(this.add.text(0, slotsY - P(18), '請選擇要替換進來的卡片　（點擊空白處取消）', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1));

      const invItems = CardStore.getInventory();
      const INV_COLS2 = INV_COLS, ROW_H2 = CARD_H + INV_GAP;

      invItems.forEach(({ cardId, qty }, idx) => {
        const def = getCardDef(cardId);
        if (!def) return;
        const col = idx % INV_COLS2;
        const row = Math.floor(idx / INV_COLS2);
        const cx = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
        const cy = INV_TOP + row * ROW_H2 + CARD_H / 2;

        // 疊帶上限檢查（排除 fromSlot 本身）
        const eq = CardStore.getEquipped();
        const countElsewhere = eq.filter((s, i) => s === cardId && i !== fromSlot).length;
        const canEquip = countElsewhere < CardStore.getStackLimit(cardId);

        const cg = this.add.graphics();
        const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
        monTier >= 5 ? drawBossCard(cg, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(cg, cx, cy, CARD_W, CARD_H) : drawInvCard(cg, cx, cy, CARD_W, CARD_H);
        slotPickLayer!.add(cg);
        drawCardFace(slotPickLayer!, def, cx, cy, '', qty);

        if (canEquip) {
          const hg = this.add.graphics();
          hg.lineStyle(2.5, 0x44ff88, 1);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
          hg.fillStyle(0x44ff88, 0.12);
          hg.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotPickLayer!.add(hg);

          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            showComparison(cardId, def as NonNullable<ReturnType<typeof getCardDef>>, fromCardId, fromSlot);
          });
          slotPickLayer!.add(hit);
        } else {
          const dimOvl = this.add.graphics();
          dimOvl.fillStyle(0x000000, 0.5);
          dimOvl.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotPickLayer!.add(dimOvl);
        }
      });
    };

    const enterSlotPick = (pickCardId: string, pickDef: NonNullable<ReturnType<typeof getCardDef>>) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 5);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      slotPickLayer.add(this.add.text(0, slotsY - P(18), '請選擇要配置的格子　（點擊空白處取消）', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1));

      const eq = CardStore.getEquipped();
      for (let i = 0; i < CARD_SLOT_COUNT; i++) {
        const cx = slotsX0 + i * (CARD_W + SLOT_GAP) + CARD_W / 2;
        const cy = slotsY + CARD_H / 2;

        const countElsewhere = eq.filter((s, idx) => s === pickCardId && idx !== i).length;
        const canEquip = countElsewhere < CardStore.getStackLimit(pickCardId);

        const hg = this.add.graphics();
        if (canEquip) {
          hg.lineStyle(2.5, 0x44ff88, 1);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
          hg.fillStyle(0x44ff88, 0.18);
          hg.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
        } else {
          hg.lineStyle(2, 0x666666, 0.5);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
        }
        slotPickLayer.add(hg);

        if (canEquip) {
          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            const currentId = eq[i];
            if (currentId) {
              const currentDef = getCardDef(currentId);
              if (currentDef) showComparison(pickCardId, pickDef, currentId, i);
              else { CardStore.equip(pickCardId, i); SaveStore.save(); clearSlotPick(); }
            } else {
              CardStore.equip(pickCardId, i);
              SaveStore.save();
              clearSlotPick();
            }
          });
          slotPickLayer.add(hit);
        }
      }
    };

    // ── Card detail popup (card-styled) ───────────────────
    let detailPopup: Phaser.GameObjects.Container | null = null;
    const showCardDetail = (
      def: ReturnType<typeof getCardDef> & object,
      equippedSlot: number | null,   // null = from inventory
      cardId: string,
    ) => {
      detailPopup?.destroy();
      const PDW = P(200);
      const PDH = P(360);
      const BANNER_H = P(52);
      const D2 = D + 10;

      const pop = this.add.container(0, 0).setDepth(D2);
      container.add(pop);
      detailPopup = pop;

      // Full-panel dim backdrop — click to close
      const dimBg = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setInteractive();
      dimBg.on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { ev.stopPropagation(); pop.destroy(); detailPopup = null; });
      pop.add(dimBg);

      // ── Card body ─────────────────────────────────────
      const monDefPre = getMonsterDef(def.monsterId);
      const monTierPre = monDefPre?.tier ?? 1;
      const isBoss = monTierPre >= 5;
      const isElite = monTierPre === 3;
      // Boss=金, 菁英=銀, 小怪=銅
      const FRAME_CLR = isBoss ? 0xf0c040 : isElite ? 0x9aacb8 : 0xb87333;
      const FRAME_CLR2 = isBoss ? 0xffee88 : isElite ? 0xc8d8e0 : 0xd4a070;
      const cg = this.add.graphics();

      // 陰影
      cg.fillStyle(0x000000, 0.5);
      cg.fillRect(-PDW / 2 + P(4), -PDH / 2 + P(4), PDW, PDH);

      // 底色（亮木色）
      cg.fillStyle(WMI, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 外框粗線（加外發光層）
      cg.lineStyle(6, FRAME_CLR, 0.2);
      cg.strokeRect(-PDW / 2 - P(2), -PDH / 2 - P(2), PDW + P(4), PDH + P(4));
      cg.lineStyle(4, FRAME_CLR, 0.95);
      cg.strokeRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 內框細線
      cg.lineStyle(1.5, FRAME_CLR2, 0.6);
      cg.strokeRect(-PDW / 2 + P(5), -PDH / 2 + P(5), PDW - P(10), PDH - P(10));

      // 四角裝飾點
      const PCR = P(4);
      cg.fillStyle(FRAME_CLR, 0.9);
      cg.fillCircle(-PDW / 2 + PCR + P(1), -PDH / 2 + PCR + P(1), PCR);
      cg.fillCircle(PDW / 2 - PCR - P(1), -PDH / 2 + PCR + P(1), PCR);
      cg.fillCircle(-PDW / 2 + PCR + P(1), PDH / 2 - PCR - P(1), PCR);
      cg.fillCircle(PDW / 2 - PCR - P(1), PDH / 2 - PCR - P(1), PCR);

      // Banner（標題區）
      cg.fillStyle(WM, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, BANNER_H);

      // Banner 上下橫紋
      cg.lineStyle(1.5, FRAME_CLR, 0.6);
      cg.lineBetween(-PDW / 2 + P(14), -PDH / 2 + P(6), PDW / 2 - P(14), -PDH / 2 + P(6));
      cg.lineBetween(-PDW / 2 + P(14), -PDH / 2 + BANNER_H - P(6), PDW / 2 - P(14), -PDH / 2 + BANNER_H - P(6));

      // 底部橫紋
      cg.lineStyle(1.5, FRAME_CLR2, 0.4);
      cg.lineBetween(-PDW / 2 + P(14), PDH / 2 - P(10), PDW / 2 - P(14), PDH / 2 - P(10));
      pop.add(cg);

      // ── Banner: card name (vertically centered) ───────
      pop.add(this.add.text(0, -PDH / 2 + BANNER_H / 2, getCardDisplayName(def.id), {
        fontSize: F(15), fontStyle: 'bold',
        color: '#f0d080',
        stroke: '#1a0800', strokeThickness: 2,
        wordWrap: { width: PDW - P(20), useAdvancedWrap: true }, align: 'center',
        maxLines: 2,
      }).setOrigin(0.5, 0.5));

      // ── Monster sprite (animated) ─────────────────────
      const SPRITE_Y = -PDH / 2 + BANNER_H + P(62);
      const monDef = getMonsterDef(def.monsterId);
      if (monDef) {
        const spriteKey = `${monDef.spriteKey}_idle`;
        const animKey = `card_idle_${def.monsterId}`;
        const spriteScale = monsterDetailScale(monDef.tier);
        const idleEnd = monDef.spriteKey.startsWith('plant') ? 3 : 5;
        try {
          if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
            this.anims.create({
              key: animKey,
              frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: idleEnd }),
              frameRate: 8, repeat: -1,
            });
          }
          const sp = this.add.sprite(0, SPRITE_Y, spriteKey, 0).setScale(spriteScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          if (this.anims.exists(animKey)) sp.play(animKey);
          pop.add(sp);
        } catch { /* texture not loaded */ }
      }

      // ── Divider ──────────────────────────────────────
      const DIVIDER_Y = SPRITE_Y + P(56);
      const dg = this.add.graphics();
      dg.lineStyle(1, WH, 0.4);
      dg.lineBetween(-PDW / 2 + P(16), DIVIDER_Y, PDW / 2 - P(16), DIVIDER_Y);
      pop.add(dg);

      // ── Effect description（可捲動）────────────────────
      const DESC_TOP = DIVIDER_Y + P(10);
      const DESC_BOT = PDH / 2 - P(110);  // 留給裝備上限 + 兩排按鈕的空間
      const DESC_H = DESC_BOT - DESC_TOP;
      const descWrap = PDW - P(28);

      // 先用小字測量實際高度
      const descTxt = this.add.text(0, DESC_TOP, def.desc, {
        fontSize: F(15), fontStyle: 'bold', color: '#c8a060',
        stroke: '#1a0800', strokeThickness: 1,
        wordWrap: { width: descWrap, useAdvancedWrap: true }, align: 'center',
      }).setOrigin(0.5, 0);
      pop.add(descTxt);

      // 卡片面板攔截點擊（防止穿透到後方元素）
      const cardBlocker = this.add.rectangle(0, 0, PDW, PDH, 0x000000, 0)
        .setInteractive()
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => ev.stopPropagation());
      pop.add(cardBlocker);

      // 若文字超出區域，加裁切遮罩並支援拖動捲動
      if (descTxt.height > DESC_H) {
        // 遮罩使用世界座標（container 位於 W/2, H/2）
        const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(W / 2 - PDW / 2 + P(4), H / 2 + DESC_TOP, PDW - P(8), DESC_H);
        descTxt.setMask(maskShape.createGeometryMask());

        let dragStartY = 0, txtStartY = 0;
        const minY = DESC_TOP - (descTxt.height - DESC_H);
        const maxY = DESC_TOP;

        // 拖動區域：透明互動矩形覆蓋描述文字區域
        const scrollHit = this.add.rectangle(0, DESC_TOP + DESC_H / 2, PDW - P(8), DESC_H, 0x000000, 0)
          .setInteractive()
          .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => {
            ev.stopPropagation();
            dragStartY = (_p as Phaser.Input.Pointer).y;
            txtStartY = descTxt.y;
          })
          .on('pointermove', (ptr: Phaser.Input.Pointer) => {
            if (!ptr.isDown) return;
            descTxt.setY(Phaser.Math.Clamp(txtStartY + (ptr.y - dragStartY), minY, maxY));
          });
        pop.add(scrollHit);
      }

      // ── Tier & stack limit info ────────────────────────
      const detMonTier = getMonsterDef(def.monsterId)?.tier ?? 1;
      const detTierName = detMonTier >= 5 ? 'Boss' : detMonTier === 3 ? '菁英' : '一般';
      const detLimit = CardStore.getStackLimit(cardId);
      const detEquipped = CardStore.getEquipped().filter(s => s === cardId).length;
      const detTierColor = detMonTier >= 5 ? '#ffd060' : detMonTier === 3 ? '#80c8ff' : '#88dd88';
      pop.add(this.add.text(0, PDH / 2 - P(100), `裝備上限 ${detEquipped}/${detLimit}`, {
        fontSize: F(15), fontStyle: 'bold', color: detTierColor,
        stroke: '#1a0800', strokeThickness: 1, align: 'center',
      }).setOrigin(0.5, 0.5));

      // ── Action buttons ────────────────────────────────
      const isEquipped = equippedSlot !== null;
      const atDetLimit = !isEquipped && detEquipped >= detLimit;
      const BH = P(30), btnY = PDH / 2 - P(68), dismantleY = PDH / 2 - P(28);

      // 分解按鈕（共用）
      const dismantleQty = detMonTier >= 5 ? 10 : detMonTier === 3 ? 5 : 1;
      const addDismantleBtn = () => {
        const BW2 = PDW - P(40);
        const dg = this.add.graphics();
        dg.fillStyle(0x2a1a0a, 1); dg.fillRect(-BW2 / 2, dismantleY - BH / 2, BW2, BH);
        dg.lineStyle(P(1.5), 0x996633, 0.85); dg.strokeRect(-BW2 / 2, dismantleY - BH / 2, BW2, BH);
        pop.add(dg);
        pop.add(this.add.text(0, dismantleY, `分  解  (+${dismantleQty} 空白卡片)`, {
          fontSize: F(13), fontStyle: 'bold', color: '#cc9955', stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5));
        const hit = this.add.rectangle(0, dismantleY, BW2, BH).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          ptr.event.stopPropagation();
          if (isEquipped) CardStore.unequip(equippedSlot!);
          else CardStore.removeFromInventory(cardId, 1);
          InventoryStore.addItem(ITEM_BLANK_CARD, '空白卡片', dismantleQty);
          SaveStore.save();
          pop.destroy(); detailPopup = null;
        });
        pop.add(hit);
      };

      if (isEquipped) {
        // 裝備中：「取下」左、「替換」右
        const HBW = (PDW - P(48)) / 2;
        const makeBtn = (ox: number, label: string, bgC: number, borderC: number, txtC: string, cb: () => void) => {
          const bg = this.add.graphics();
          bg.fillStyle(bgC, 1); bg.fillRect(ox - HBW / 2, btnY - BH / 2, HBW, BH);
          bg.lineStyle(1.5, borderC, 0.9); bg.strokeRect(ox - HBW / 2, btnY - BH / 2, HBW, BH);
          pop.add(bg);
          pop.add(this.add.text(ox, btnY, label, {
            fontSize: F(15), fontStyle: 'bold', color: txtC, stroke: '#000', strokeThickness: 2,
          }).setOrigin(0.5));
          const hit = this.add.rectangle(ox, btnY, HBW, BH).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); cb(); });
          pop.add(hit);
        };
        const ox0 = -(HBW / 2 + P(4)), ox1 = HBW / 2 + P(4);
        makeBtn(ox0, '取  下', 0x3a1010, 0xcc4444, '#ff8888', () => {
          CardStore.unequip(equippedSlot!);
          SaveStore.save();
          pop.destroy(); detailPopup = null;
        });
        const hasInv = CardStore.getInventory().some(({ cardId: cid }) => {
          const eq = CardStore.getEquipped();
          return eq.filter((s, i) => s === cid && i !== equippedSlot!).length < CardStore.getStackLimit(cid);
        });
        if (hasInv) {
          makeBtn(ox1, '替  換', 0x0a1e30, 0x4488cc, '#88ccff', () => {
            pop.destroy(); detailPopup = null;
            enterInventoryPick(equippedSlot!, cardId);
          });
        }
        addDismantleBtn();
      } else {
        // 庫存中：「配置」或「已達上限」
        const BW = PDW - P(40);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(atDetLimit ? 0x2a2a2a : 0x0e2a0e, 1);
        btnBg.fillRect(-BW / 2, btnY - BH / 2, BW, BH);
        btnBg.lineStyle(1.5, atDetLimit ? 0x666666 : 0x44cc44, 0.9);
        btnBg.strokeRect(-BW / 2, btnY - BH / 2, BW, BH);
        pop.add(btnBg);
        pop.add(this.add.text(0, btnY, atDetLimit ? '已達上限' : '配  置', {
          fontSize: F(15), fontStyle: 'bold',
          color: atDetLimit ? '#666666' : '#88ff88', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));
        if (!atDetLimit) {
          const btnHit = this.add.rectangle(0, btnY, BW, BH).setInteractive({ useHandCursor: true });
          btnHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            pop.destroy(); detailPopup = null;
            enterSlotPick(cardId, def as NonNullable<ReturnType<typeof getCardDef>>);
          });
          pop.add(btnHit);
        }
        addDismantleBtn();
      }
    };

    // ── Helper: draw card face (name only) ─────────────────
    const drawCardFace = (
      target: Phaser.GameObjects.Container,
      def: ReturnType<typeof getCardDef> & object,
      cx: number, cy: number,
      _slotLabel: string,
      qty?: number,
    ) => {
      // A/B/C 浮水印 — 用在同 monsterId 裡的排序位置決定字母
      const _sameGroup = CARD_DEFS.filter(c => c.monsterId === def.monsterId);
      const _groupIdx = _sameGroup.findIndex(c => c.id === def.id);
      const variant = _groupIdx >= 0 && _groupIdx < 26 ? String.fromCharCode(65 + _groupIdx) : '';
      if (variant) {
        target.add(this.add.text(cx, cy, variant, {
          fontSize: F(88), fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5).setAlpha(0.15));
      }

      // 數量標籤（右上角）
      if (qty !== undefined && qty > 1) {
        target.add(this.add.text(cx + CARD_W / 2 - P(2), cy - CARD_H / 2 + P(3), `×${qty}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000000', strokeThickness: 1,
        }).setOrigin(1, 0));
      }
      // 怪物精靈圖，播放 idle 動畫
      const monDef = getMonsterDef(def.monsterId);
      if (monDef) {
        const spriteKey = `${monDef.spriteKey}_idle`;
        const animKey = `card_idle_${def.monsterId}`;
        const idleEnd = monDef.spriteKey.startsWith('plant') ? 3 : 5;
        try {
          if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
            this.anims.create({
              key: animKey,
              frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: idleEnd }),
              frameRate: 8, repeat: -1,
            });
          }
          const baseScale = monsterCardScale(monDef.tier);
          const sp = this.add.sprite(cx, cy, spriteKey, 0).setScale(baseScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          if (this.anims.exists(animKey)) sp.play(animKey);
          target.add(sp);
        } catch { /* 紋理尚未載入 */ }
      }
    };

    // ── Rebuild function ───────────────────────────────────
    let savedScrollY = 0;   // 保留 scroll 位置跨 rebuild
    let rightSavedScrollY = 0;
    const rebuild = () => {
      detailPopup?.destroy();
      detailPopup = null;
      contentCnt.destroy();
      contentCnt = this.add.container(0, 0);
      container.add(contentCnt);

      const eq = CardStore.getEquipped();
      const invItems = CardStore.getInventory();

      // ── Equipped row ──────────────────────────────────
      for (let i = 0; i < CARD_SLOT_COUNT; i++) {
        const cx = slotsX0 + i * (CARD_W + SLOT_GAP) + CARD_W / 2;
        const cy = slotsY + CARD_H / 2;
        const cardId = eq[i];
        const def = cardId ? getCardDef(cardId) : null;

        const slotGfx = this.add.graphics();
        if (def) {
          const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
          monTier >= 5 ? drawBossCard(slotGfx, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(slotGfx, cx, cy, CARD_W, CARD_H) : drawInvCard(slotGfx, cx, cy, CARD_W, CARD_H);
        } else {
          slotGfx.lineStyle(1, WM, 0.5);
          slotGfx.strokeRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotGfx.fillStyle(WD, 0.3);
          slotGfx.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
        }
        contentCnt.add(slotGfx);

        if (def) {
          drawCardFace(contentCnt, def, cx, cy, `${i + 1}`);
          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => showCardDetail(def, i, cardId!));
          contentCnt.add(hit);
        } else {
          contentCnt.add(this.add.text(cx, cy, `${i + 1}`, {
            fontSize: F(15), fontStyle: 'bold', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5));
        }
      }

      // Separator
      const sepGfx = this.add.graphics();
      sepGfx.fillStyle(WB, 1); sepGfx.fillRect(px + P(8), INV_TOP - P(10), LEFT_W - P(16), 1);
      sepGfx.fillStyle(WH, 0.2); sepGfx.fillRect(px + P(8), INV_TOP - P(9), LEFT_W - P(16), 1);
      contentCnt.add(sepGfx);
      contentCnt.add(this.add.text(leftCX, INV_TOP - P(5), '持有卡片', {
        fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5, 1));

      // ── Inventory scroll area ──────────────────────────
      let maxScroll = 0;
      let applyScroll = (_dy: number) => {};

      if (invItems.length === 0) {
        contentCnt.add(this.add.text(leftCX, INV_TOP + INV_H / 2, '尚未獲得任何卡片', {
          fontSize: F(15), fontStyle: 'bold', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
      } else {
        // 過濾掉存檔中已不存在的舊卡片 ID
        const validInvItems = invItems.filter(({ cardId }) => !!getCardDef(cardId));

        const ROWS = Math.ceil(validInvItems.length / INV_COLS);
        const ROW_H = CARD_H + INV_GAP;
        const contentH = ROWS * ROW_H;
        maxScroll = Math.max(0, contentH - INV_H);
        savedScrollY = Phaser.Math.Clamp(savedScrollY, 0, maxScroll);

        const scrollCnt = this.add.container(0, INV_TOP - savedScrollY);
        contentCnt.add(scrollCnt);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
        maskShape.fillStyle(0xffffff);
        maskShape.fillRect(W / 2 + px + P(4), H / 2 + INV_TOP, LEFT_W - P(8), INV_H);
        scrollCnt.setMask(maskShape.createGeometryMask());

        applyScroll = (dy: number) => {
          savedScrollY = Phaser.Math.Clamp(savedScrollY + dy, 0, maxScroll);
          scrollCnt.y = INV_TOP - savedScrollY;
        };

        // Build cards once at fixed positions
        validInvItems.forEach(({ cardId, qty }, idx) => {
          const def = getCardDef(cardId)!;
          const col = idx % INV_COLS;
          const row = Math.floor(idx / INV_COLS);
          const cx = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
          const cy = row * ROW_H + CARD_H / 2;

          const cg = this.add.graphics();
          const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
          monTier >= 5 ? drawBossCard(cg, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(cg, cx, cy, CARD_W, CARD_H) : drawInvCard(cg, cx, cy, CARD_W, CARD_H);
          scrollCnt.add(cg);

          drawCardFace(scrollCnt, def, cx, cy, '', qty);

          // Stack limit badge (bottom-left)
          const equippedCount = eq.filter(s => s === cardId).length;
          const stackLimit = CardStore.getStackLimit(cardId);
          const atLimit = equippedCount >= stackLimit;
          const badgeColor = atLimit ? '#cc2222' : equippedCount > 0 ? '#cc8800' : '#226622';
          scrollCnt.add(this.add.text(cx - CARD_W / 2 + P(2), cy + CARD_H / 2 - P(2), `${equippedCount}/${stackLimit}`, {
            fontSize: F(15), fontStyle: 'bold', color: '#ffffff',
            stroke: '#000000', strokeThickness: 1,
            backgroundColor: badgeColor, padding: { x: 2, y: 1 },
          }).setOrigin(0, 1));

          // Dim overlay if at stack limit
          if (atLimit) {
            const dimOvl = this.add.graphics();
            dimOvl.fillStyle(0x000000, 0.45);
            dimOvl.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
            scrollCnt.add(dimOvl);
          }

        });

        // Single hit zone covering the inventory area — avoids overlapping equipped-slot hits
        const invZone = this.add.rectangle(leftCX, INV_TOP + INV_H / 2, LEFT_W - P(16), INV_H)
          .setInteractive({ useHandCursor: true });
        contentCnt.add(invZone);
        invZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
          // Convert screen pointer to contentCnt-local coords
          const localX = ptr.x - (W / 2);
          const localY = ptr.y - (H / 2) - scrollCnt.y;
          validInvItems.forEach(({ cardId }, idx) => {
            const col = idx % INV_COLS;
            const row = Math.floor(idx / INV_COLS);
            const cx = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
            const cy = row * ROW_H + CARD_H / 2;
            if (Math.abs(localX - cx) <= CARD_W / 2 && Math.abs(localY - cy) <= CARD_H / 2) {
              const def = getCardDef(cardId);
              if (def) showCardDetail(def, null, cardId);
            }
          });
        });
      }

      // ── Right panel scroll container ──────────────────────
      const RPANEL_CLIP_TOP = py + P(58);
      const RPANEL_CLIP_H = PH - P(62) - P(4);
      const rightScrollCnt = this.add.container(0, -rightSavedScrollY);
      contentCnt.add(rightScrollCnt);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rightMaskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      rightMaskShape.fillStyle(0xffffff);
      rightMaskShape.fillRect(W / 2 + RIGHT_X, H / 2 + RPANEL_CLIP_TOP, RIGHT_W, RPANEL_CLIP_H);
      rightScrollCnt.setMask(rightMaskShape.createGeometryMask());

      // ── Right panel: card effects + combo bonuses ─────────
      const statLines = (b: StatBonus): string[] => {
        const lines: string[] = [];
        const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;
        const num = (v: number) => `${v >= 0 ? '+' : ''}${v}`;
        if (b.atk)                lines.push(`攻擊力 ${num(b.atk)}`);
        if (b.hp)                 lines.push(`最大HP ${num(b.hp)}`);
        if (b.def)                lines.push(`防禦力 ${num(b.def)}`);
        if (b.crit)               lines.push(`爆擊率 ${pct(b.crit)}`);
        if (b.critDmg)            lines.push(`爆擊傷害 ${pct(b.critDmg)}`);
        if (b.atkSpeed)           lines.push(`攻擊速度 ${pct(b.atkSpeed)}`);
        if (b.speed)              lines.push(`移動速度 ${num(b.speed)}`);
        if (b.evasion)            lines.push(`迴避率 ${pct(b.evasion)}`);
        if (b.penetration)        lines.push(`穿透力 ${num(b.penetration)}`);
        if (b.dotBonus)           lines.push(`燃燒傷害 ${pct(b.dotBonus)}`);
        if (b.hpRegen)            lines.push(`HP回復 +${b.hpRegen.toFixed(1)}/s`);
        if (b.lifesteal)          lines.push(`吸血 ${pct(b.lifesteal)}`);
        if (b.hpPct)              lines.push(`最大HP ${pct(b.hpPct)}`);
        if (b.atkPct)             lines.push(`攻擊力 ${pct(b.atkPct)}`);
        if (b.allDmgPct)          lines.push(`全傷害 ${pct(b.allDmgPct)}`);
        if (b.takenDmgPct)        lines.push(`受傷 ${pct(b.takenDmgPct)}`);
        if (b.dmgVsEliteOrBoss)   lines.push(`對菁英/Boss傷 ${pct(b.dmgVsEliteOrBoss)}`);
        if (b.dmgVsBoss)          lines.push(`對Boss傷 ${pct(b.dmgVsBoss)}`);
        if (b.dmgVsSlime)         lines.push(`對史萊姆傷 ${pct(b.dmgVsSlime)}`);
        if (b.dmgVsPlant)         lines.push(`對花怪傷 ${pct(b.dmgVsPlant)}`);
        if (b.dmgVsAnyElement)    lines.push(`對火/水/草傷 ${pct(b.dmgVsAnyElement)}`);
        if (b.burnedEnemyDmgAmp)  lines.push(`對燃燒敵人傷 ${pct(b.burnedEnemyDmgAmp)}`);
        if (b.condLowHpAtk)       lines.push(`低血量時攻擊+${b.condLowHpAtk}`);
        if (b.burnMaxStackBonus)  lines.push(`燃燒上限 +${b.burnMaxStackBonus}層`);
        if (b.summonFlowerDmgPct) lines.push(`召喚物傷 ${pct(b.summonFlowerDmgPct)}`);
        if (b.skillFlowerHpPct)   lines.push(`召喚物血 ${pct(b.skillFlowerHpPct)}`);
        if (b.freeRevive)         lines.push(`復活 ${b.freeRevive}次/局`);
        if (b.divineShieldChance) lines.push(`護盾觸發 ${pct(b.divineShieldChance)}`);
        if (b.executeBelow15)     lines.push(`斬殺 HP<12%`);
        if (b.critDmgMult  && b.critDmgMult  !== 1) lines.push(`爆擊傷害 ×${b.critDmgMult.toFixed(2)}`);
        if (b.atkSpeedMult && b.atkSpeedMult !== 1) lines.push(`攻擊速度 ×${b.atkSpeedMult.toFixed(2)}`);
        if (b.summonDmgMult && b.summonDmgMult !== 1) lines.push(`召喚傷害 ×${b.summonDmgMult.toFixed(2)}`);
        if (b.defToEvasion)       lines.push(`每${b.defToEvasion}防禦 迴避+3%`);
        if (b.condPenAtk)         lines.push(`穿透≥100 攻擊+${b.condPenAtk}`);
        if (b.condCritDmgBonus)   lines.push(`爆擊≥50% 爆傷${pct(b.condCritDmgBonus)}`);
        return lines;
      };

      const RP_PAD  = P(8);
      const RP_TX   = RIGHT_X + RP_PAD;
      const RP_W    = RIGHT_W - RP_PAD * 2;
      const LINE_H  = P(17);
      let ry = py + P(62);

      // — 卡片效果 —
      for (let i = 0; i < CARD_SLOT_COUNT; i++) {
        const cardId = eq[i];
        const def = cardId ? getCardDef(cardId) : null;
        if (!def) {
          rightScrollCnt.add(this.add.text(RP_TX, ry, `${i + 1}. （空）`, {
            fontSize: F(15), fontStyle: 'bold', color: '#5a3818',
          }).setOrigin(0, 0));
          ry += LINE_H + P(3);
          continue;
        }
        const nameColor = def.cardType === 'b' ? '#f0c040' : def.cardType === 'e' ? '#aaccdd' : '#c8a060';
        rightScrollCnt.add(this.add.text(RP_TX, ry, `${i + 1}. ${def.name}`, {
          fontSize: F(15), fontStyle: 'bold', color: nameColor,
          stroke: '#1a0800', strokeThickness: 1,
          wordWrap: { width: RP_W },
        }).setOrigin(0, 0));
        ry += LINE_H + P(1);
        for (const line of statLines(def.effect)) {
          rightScrollCnt.add(this.add.text(RP_TX + P(6), ry, line, {
            fontSize: F(15), fontStyle: 'bold', color: '#a8d0a8',
          }).setOrigin(0, 0));
          ry += LINE_H;
        }
        ry += P(4);
      }

      // — 組合效果分隔線 —
      const combos = CardStore.getComboInfos();
      const sepGfx2 = this.add.graphics();
      sepGfx2.fillStyle(WB, 1);
      sepGfx2.fillRect(RIGHT_X + P(4), ry + P(2), RIGHT_W - P(8), 1);
      sepGfx2.fillStyle(WH, 0.2);
      sepGfx2.fillRect(RIGHT_X + P(4), ry + P(3), RIGHT_W - P(8), 1);
      rightScrollCnt.add(sepGfx2);
      ry += P(10);

      rightScrollCnt.add(this.add.text(rightCX, ry, '組合效果', {
        fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5, 0));
      ry += P(20);

      if (combos.length === 0) {
        rightScrollCnt.add(this.add.text(RP_TX, ry, '（未觸發）', {
          fontSize: F(15), fontStyle: 'bold', color: '#5a3818',
        }).setOrigin(0, 0));
        ry += LINE_H;
      } else {
        for (const combo of combos) {
          rightScrollCnt.add(this.add.text(RP_TX, ry, combo.name, {
            fontSize: F(15), fontStyle: 'bold', color: '#e8c070',
            stroke: '#1a0800', strokeThickness: 1,
            wordWrap: { width: RP_W },
          }).setOrigin(0, 0));
          ry += LINE_H + P(1);
          for (const line of statLines(combo.bonus)) {
            rightScrollCnt.add(this.add.text(RP_TX + P(6), ry, line, {
              fontSize: F(15), fontStyle: 'bold', color: '#a8d0a8',
            }).setOrigin(0, 0));
            ry += LINE_H;
          }
          ry += P(4);
        }
      }

      // Compute right panel scroll limits
      const totalRightH = ry - (py + P(62));
      const maxRightScroll = Math.max(0, totalRightH - RPANEL_CLIP_H);
      rightSavedScrollY = Phaser.Math.Clamp(rightSavedScrollY, 0, maxRightScroll);
      rightScrollCnt.y = -rightSavedScrollY;

      const applyRightScroll = (dy: number) => {
        rightSavedScrollY = Phaser.Math.Clamp(rightSavedScrollY + dy, 0, maxRightScroll);
        rightScrollCnt.y = -rightSavedScrollY;
      };

      // Drag & wheel scroll (left vs right panel)
      const dividerWorldX = W / 2 + RIGHT_X;
      cardScrollHandler = (ptr: Phaser.Input.Pointer) => {
        if (!ptr.isDown || detailPopup) return;
        const dy = ptr.prevPosition.y - ptr.y;
        if (ptr.x >= dividerWorldX) {
          applyRightScroll(dy);
        } else {
          applyScroll(dy);
        }
      };

      cardWheelHandler = (ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
        if (detailPopup) return;
        const scroll = (dy as number) * 0.6;
        if ((ptr as Phaser.Input.Pointer).x >= dividerWorldX) {
          applyRightScroll(scroll);
        } else {
          applyScroll(scroll);
        }
      };

      this.input.on('pointermove', cardScrollHandler);
      this.input.on('wheel', cardWheelHandler);
    };

    let cardScrollHandler: ((ptr: Phaser.Input.Pointer) => void) | null = null;
    let cardWheelHandler: ((...args: any[]) => void) | null = null;

    rebuild();

    // Auto-update on card change
    const onCardChange = () => {
      if (cardScrollHandler) this.input.off('pointermove', cardScrollHandler);
      if (cardWheelHandler)  this.input.off('wheel', cardWheelHandler);
      rebuild();
    };
    CardStore.onChange(onCardChange);

    const cleanup = () => {
      CardStore.offChange(onCardChange);
      if (cardScrollHandler) this.input.off('pointermove', cardScrollHandler);
      if (cardWheelHandler)  this.input.off('wheel', cardWheelHandler);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  }

  private makeTextInput(
    objs: Phaser.GameObjects.GameObject[],
    x: number, y: number, w: number, h: number,
    placeholder: string, depth: number,
    initialValue = '',
  ): { getValue(): string; setValue(v: string): void } {
    // Hidden real input for keyboard — positioned off-screen to avoid DPR issues
    const el = document.createElement('input');
    el.type = 'text'; el.maxLength = 12;
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0',
      width: '1px', height: '1px', opacity: '0',
      pointerEvents: 'none', fontSize: '16px',
    });
    document.body.appendChild(el);
    (this as any)._domInputs = (this as any)._domInputs ?? [];
    (this as any)._domInputs.push(el);

    // Visual box
    const gfx = this.add.graphics().setDepth(depth);
    objs.push(gfx);
    gfx.fillStyle(0x1a1208, 1); gfx.fillRect(x, y, w, h);
    gfx.lineStyle(P(2), 0x886622, 1); gfx.strokeRect(x, y, w, h);

    const txt = this.add.text(x + P(8), y + h / 2, placeholder, {
      fontSize: F(15), color: '#886644',
    }).setOrigin(0, 0.5).setDepth(depth + 1);
    objs.push(txt);

    // Invisible hit area — click to focus hidden input
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    objs.push(hit);
    hit.on('pointerdown', () => el.focus());

    el.addEventListener('input', () => {
      const val = el.value.slice(0, 8); el.value = val;
      txt.setText(val || placeholder).setColor(val ? '#ffe0a0' : '#886644');
    });

    const setValue = (v: string) => {
      el.value = v.slice(0, 8);
      txt.setText(v || placeholder).setColor(v ? '#ffe0a0' : '#886644');
    };
    if (initialValue) setValue(initialValue);

    return { getValue: () => el.value.trim().slice(0, 8), setValue };
  }

  private showNameEditDialog(W: number, H: number): void {
    const D = 950;
    const bw = Math.min(P(260), W - P(32));
    const bh = P(130);
    const bx = W / 2 - bw / 2;
    const by = H / 2 - bh / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => { objs.forEach(o => o.destroy()); this.cleanDomInputs(); };

    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65)
      .setInteractive().setDepth(D);
    objs.push(bk);
    bk.on('pointerdown', close);

    const box = this.add.graphics().setDepth(D + 1);
    objs.push(box);
    box.fillStyle(WB, 0.97); box.fillRoundedRect(bx, by, bw, bh, P(8));
    box.lineStyle(P(2), GOLD, 0.85); box.strokeRoundedRect(bx, by, bw, bh, P(8));

    objs.push(this.add.text(W / 2, by + P(18), '設定名稱', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe080', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2));

    const inp = this.makeTextInput(objs, bx + P(16), by + P(36), bw - P(32), P(30), '名稱（最多8字）', D + 2, getPlayerName());

    // Confirm button
    const btnW = P(100), btnH = P(28);
    const btnX = W / 2, btnY = by + bh - P(20);
    const btnG = this.add.graphics().setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x2a4a10, 1); btnG.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(5));
    btnG.lineStyle(P(1.5), GOLD, 0.7); btnG.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(5));
    objs.push(this.add.text(btnX, btnY, '確  定', {
      fontSize: F(14), fontStyle: 'bold', color: '#ccff88', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3));
    const btnHit = this.add.rectangle(btnX, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(btnHit);
    btnHit.on('pointerdown', () => {
      if (this._partyState !== 'none') {
        this._showToast('組隊中無法改名');
        close();
        return;
      }
      const name = inp.getValue().trim() || getPlayerName();
      if (name) setPlayerName(name);
      SaveStore.save();
      close();
      this.scene.restart();
    });
  }

  private cleanDomInputs(): void {
    ((this as any)._domInputs ?? []).forEach((el: HTMLElement) => el.remove());
    (this as any)._domInputs = [];
  }

  private showComingSoon(W: number, H: number, label: string): void {
    const D = 900;
    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().setDepth(D);
    const box = this.add.graphics().setDepth(D + 1);
    const bw = 260, bh = 100;
    box.fillStyle(0x1a1208, 0.97); box.fillRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
    box.lineStyle(2, 0xd4a044, 0.8); box.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
    const txt = this.add.text(W / 2, H / 2 - 14, `${label}`, {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2);
    const sub = this.add.text(W / 2, H / 2 + 14, '功能待開發', {
      fontSize: F(15), fontStyle: 'bold', color: '#886644', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 2);
    const close = () => { bk.destroy(); box.destroy(); txt.destroy(); sub.destroy(); };
    bk.on('pointerdown', close);
  }

  private showShopPanel(W: number, H: number): void {
    const PW = W - P(16);
    const PH = H - P(16);
    const D = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
        ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2)
        container.destroy();
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell (wood style)
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - 3, py - 3, PW + 6, PH + 6);
    bg.fillStyle(WL, 1);
    bg.fillRect(px - 2, py - 2, PW + 4, PH + 4);
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / 24); row++) {
      const ry = py + row * 24;
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + 2, ry, px + PW - 2, ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + 2, ry + 1, px + PW - 2, ry + 1);
    }
    [[px, py], [px + PW - 8, py], [px, py + PH - 8], [px + PW - 8, py + PH - 8]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx!, ry!, 8, 8);
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx! + 2, ry! + 2, 4, 4);
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1); bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '商  店', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({
      hitArea: new Phaser.Geom.Rectangle(-P(22), -P(22), P(44), P(44)),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      useHandCursor: true,
    });
    closeBtn.on('pointerup', () => container.destroy());
    container.add(closeBtn);

    // Floating toast notification
    const showToast = (msg: string, success = false) => {
      const t = this.add.text(0, P(10), msg, {
        fontSize: F(14), fontStyle: 'bold', color: success ? '#88ff88' : '#ff6644',
        stroke: '#1a0800', strokeThickness: 2,
        backgroundColor: '#2a0800cc', padding: { x: P(10), y: P(5) },
      }).setOrigin(0.5, 0.5).setAlpha(0);
      container.add(t);
      this.tweens.add({
        targets: t, alpha: 1, y: 0,
        duration: 180, ease: 'Power2',
        onComplete: () => this.tweens.add({
          targets: t, alpha: 0, delay: 900, duration: 350,
          onComplete: () => t.destroy(),
        }),
      });
    };

    // Gold display
    let goldLabel: Phaser.GameObjects.Text;
    let blankCardLabel: Phaser.GameObjects.Text;
    const labelY = py + P(48);
    const refreshGold = () => {
      goldLabel?.setText(`${InventoryStore.getGold().toLocaleString()} 金幣`);
      blankCardLabel?.setText(`空白卡片 ×${InventoryStore.getItemQty(ITEM_BLANK_CARD)}`);
    };
    const goldIcon = this.add.image(-PW / 4 - P(36), labelY, 'icon_coin').setDisplaySize(P(14), P(14));
    goldLabel = this.add.text(-PW / 4 - P(24), labelY, '', {
      fontSize: F(13), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0, 0.5);
    const cardIcon = this.add.image(PW / 4 - P(52), labelY, 'icon_blank_card').setDisplaySize(P(14), P(14));
    blankCardLabel = this.add.text(PW / 4 - P(40), labelY, '', {
      fontSize: F(13), fontStyle: 'bold', color: '#cc88ff', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0, 0.5);
    refreshGold();
    container.add([goldIcon, goldLabel, cardIcon, blankCardLabel]);
    const onInvChange = () => refreshGold();
    InventoryStore.onChange(onInvChange);
    container.once(Phaser.GameObjects.Events.DESTROY, () => InventoryStore.offChange(onInvChange));

    // ── Tab definitions ────────────────────────────────────
    type ShopItem = { id: string; name: string; price: number; desc: string; color: number };
    const POTION_ITEMS: ShopItem[] = [
      { id: ITEM_POTION_HEALTH_S, name: '小型回復藥水', price: 225,  desc: '回復 100 HP', color: 0x44ff88 },
      { id: ITEM_POTION_HEALTH_M, name: '中型回復藥水', price: 495,  desc: '回復 200 HP', color: 0x44ddff },
      { id: ITEM_POTION_HEALTH_L, name: '大型回復藥水', price: 1050, desc: '回復 300 HP', color: 0xff88ff },
      { id: ITEM_POTION_ATK, name: '攻擊力藥水', price: 2000, desc: '傷害+20%，持續30秒', color: 0xff6644 },
      { id: ITEM_POTION_DEF, name: '防禦力藥水', price: 2000, desc: 'DEF+20，持續30秒', color: 0x44aaff },
      { id: ITEM_POTION_SPEED, name: '速度藥水', price: 2000, desc: '移動速度+20，持續30秒', color: 0xffdd22 },
      { id: ITEM_POTION_REVIVE, name: '復活藥水', price: 5000, desc: '戰鬥中自動復活一次', color: 0xffee44 },
    ];
    const STONE_ITEMS: ShopItem[] = [
      { id: ITEM_STONE_BROKEN, name: '破損強化石', price: 1000, desc: '強化裝備時消耗', color: 0x88ccff },
      { id: ITEM_STONE_INTACT, name: '完整強化石', price: 1800, desc: '強化成功率 +8%', color: 0x66ffcc },
      { id: 'stone_guard', name: '重鑄石', price: 4500, desc: '重鑄裝備\n可重置技能星盤', color: 0xbb66ff },
      { id: ITEM_QUEST_REROLL, name: '任務重製石', price: 250, desc: '重置當前任務列表', color: 0xffcc44 },
    ];
    const TAB_DEFS: { label: string; items: ShopItem[] | null }[] = [
      { label: '藥水', items: POTION_ITEMS },
      { label: '強化石', items: STONE_ITEMS },
      { label: '卡片交換', items: null },
    ];

    // ── Tab bar ───────────────────────────────────────────
    const TAB_BAR_TOP = py + P(62);
    const TAB_H = P(30);
    const TAB_W = PW / TAB_DEFS.length;
    const HEADER_H = P(62) + TAB_H + P(8);
    const viewH = PH - HEADER_H;

    let activeTab = 0;
    const tabGfx = this.add.graphics();
    container.add(tabGfx);
    let hideExchangeFilters: () => void = () => { };

    const tabLabels: Phaser.GameObjects.Text[] = TAB_DEFS.map((tab, i) => {
      const lbl = this.add.text(px + i * TAB_W + TAB_W / 2, TAB_BAR_TOP + TAB_H / 2, tab.label, {
        fontSize: F(13), fontStyle: 'bold', color: '#a08050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5);
      container.add(lbl);

      const hit = this.add.rectangle(px + i * TAB_W + TAB_W / 2, TAB_BAR_TOP + TAB_H / 2, TAB_W, TAB_H)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { if (activeTab !== i) { activeTab = i; drawTabs(); hideExchangeFilters(); const ti = TAB_DEFS[i].items; if (ti) buildContent(ti); else buildExchangeContent(); } });
      container.add(hit);

      return lbl;
    });

    const drawTabs = () => {
      tabGfx.clear();
      TAB_DEFS.forEach((_, i) => {
        const tx = px + i * TAB_W;
        const isActive = i === activeTab;
        tabGfx.fillStyle(isActive ? 0x3a2010 : 0x180c02, 1);
        tabGfx.fillRect(tx, TAB_BAR_TOP, TAB_W, TAB_H);
        if (isActive) {
          tabGfx.lineStyle(P(2), GOLD, 0.9);
          tabGfx.lineBetween(tx, TAB_BAR_TOP, tx, TAB_BAR_TOP + TAB_H);
          tabGfx.lineBetween(tx + TAB_W, TAB_BAR_TOP, tx + TAB_W, TAB_BAR_TOP + TAB_H);
          tabGfx.lineBetween(tx, TAB_BAR_TOP, tx + TAB_W, TAB_BAR_TOP);
          tabGfx.lineStyle(P(2), 0x3a2010, 1);
          tabGfx.lineBetween(tx + 1, TAB_BAR_TOP + TAB_H, tx + TAB_W - 1, TAB_BAR_TOP + TAB_H);
        } else {
          tabGfx.lineStyle(1, WB, 0.5);
          tabGfx.strokeRect(tx, TAB_BAR_TOP, TAB_W, TAB_H);
        }
        tabLabels[i]?.setColor(isActive ? '#ffe066' : '#a08050');
      });
    };
    drawTabs();

    // ── Scroll mask ───────────────────────────────────────
    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(W / 2 + px, H / 2 + py + HEADER_H, PW, viewH);
    const scrollMask = maskGfx.createGeometryMask();
    container.once(Phaser.GameObjects.Events.DESTROY, () => maskGfx.destroy());

    const FILTER_H = P(28);
    let exchangeFilterObjs: Phaser.GameObjects.GameObject[] = [];

    const showExchangeFilters = (active: 'small' | 'elite' | 'boss') => {
      exchangeFilterObjs.forEach(o => o.destroy());
      exchangeFilterObjs = [];
      maskGfx.clear(); maskGfx.fillStyle(0xffffff);
      maskGfx.fillRect(W / 2 + px, H / 2 + py + HEADER_H + FILTER_H, PW, viewH - FILTER_H);
      const filterDefs: { label: string; v: 'small' | 'elite' | 'boss' }[] = [
        { label: '一般', v: 'small' },
        { label: '菁英', v: 'elite' }, { label: 'BOSS', v: 'boss' },
      ];
      const FTW = Math.floor(PW / filterDefs.length);
      const FY = py + HEADER_H;
      filterDefs.forEach((fd, fi) => {
        const fx = -PW / 2 + fi * FTW;
        const isAct = fd.v === active;
        const fg = this.add.graphics();
        fg.fillStyle(isAct ? 0x3a1a00 : 0x1a0c00, 1);
        fg.fillRect(fx, FY, FTW, FILTER_H);
        fg.lineStyle(1, isAct ? GOLD : WB, isAct ? 0.8 : 0.3);
        fg.strokeRect(fx, FY, FTW, FILTER_H);
        exchangeFilterObjs.push(fg); container.add(fg);
        const lbl = this.add.text(fx + FTW / 2, FY + FILTER_H / 2, fd.label, {
          fontSize: F(13), fontStyle: isAct ? 'bold' : 'normal',
          color: isAct ? '#ffe066' : '#a08050', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5);
        exchangeFilterObjs.push(lbl); container.add(lbl);
        const fHit = this.add.rectangle(fx + FTW / 2, FY + FILTER_H / 2, FTW, FILTER_H)
          .setInteractive({ useHandCursor: true });
        fHit.on('pointerdown', (_p: any, _lx: any, _ly: any, ev: Phaser.Types.Input.EventData) => {
          ev.stopPropagation();
          if (fd.v !== active) buildExchangeContent(fd.v);
        });
        exchangeFilterObjs.push(fHit); container.add(fHit);
      });
    };

    hideExchangeFilters = () => {
      exchangeFilterObjs.forEach(o => o.destroy());
      exchangeFilterObjs = [];
      maskGfx.clear(); maskGfx.fillStyle(0xffffff);
      maskGfx.fillRect(W / 2 + px, H / 2 + py + HEADER_H, PW, viewH);
    };

    // ── Scrollable content ────────────────────────────────
    const COLS = 3;
    const CELL_PAD = P(6);
    const CELL_GAP = P(7);
    const CELL_W = Math.floor((PW - CELL_PAD * 2 - CELL_GAP * (COLS - 1)) / COLS);
    const CELL_H = P(108);
    const ROW_PAD = P(9);
    const ICON_SZ = P(28);
    const BW = P(44), BH = P(20);
    const startX = -PW / 2 + CELL_PAD;

    let scrollCont: Phaser.GameObjects.Container = this.add.container(0, 0);
    let scrollY = 0;
    let maxScroll = 0;
    let scrollBaseY = py + HEADER_H;

    const buildContent = (items: ShopItem[]) => {
      scrollBaseY = py + HEADER_H;
      scrollCont.destroy();
      scrollY = 0;
      maxScroll = Math.max(0, Math.ceil(items.length / COLS) * (CELL_H + ROW_PAD) - ROW_PAD - viewH);
      scrollCont = this.add.container(0, scrollBaseY);
      scrollCont.setMask(scrollMask);
      container.add(scrollCont);

      items.forEach((item, i) => {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const cx = startX + col * (CELL_W + CELL_GAP);
        const cy = row * (CELL_H + ROW_PAD);
        const colorHex = `#${item.color.toString(16).padStart(6, '0')}`;

        const cellGfx = this.add.graphics();
        cellGfx.fillStyle(WM, 0.6);
        cellGfx.fillRoundedRect(cx, cy, CELL_W, CELL_H, P(6));
        cellGfx.lineStyle(P(1), WL, 0.3);
        cellGfx.strokeRoundedRect(cx, cy, CELL_W, CELL_H, P(6));
        cellGfx.fillStyle(item.color, 0.8);
        cellGfx.fillRoundedRect(cx, cy, P(4), CELL_H, P(3));
        scrollCont.add(cellGfx);

        const iconCX = cx + P(7) + ICON_SZ / 2;
        const iconCY = cy + P(8) + ICON_SZ / 2;
        const iconBg = this.add.graphics();
        iconBg.fillStyle(0x0a0800, 0.6);
        iconBg.fillRoundedRect(cx + P(7), cy + P(8), ICON_SZ, ICON_SZ, P(5));
        iconBg.lineStyle(P(1), item.color, 0.45);
        iconBg.strokeRoundedRect(cx + P(7), cy + P(8), ICON_SZ, ICON_SZ, P(5));
        scrollCont.add(iconBg);
        const iconKey = `icon_${item.id}`;
        if (this.textures.exists(iconKey))
          scrollCont.add(this.add.image(iconCX, iconCY, iconKey).setDisplaySize(P(24), P(24)));

        const tx = cx + P(7) + ICON_SZ + P(5);
        const txtMaxW = CELL_W - ICON_SZ - P(18);
        scrollCont.add(this.add.text(tx, cy + P(7), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: colorHex,
          stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: txtMaxW },
        }).setOrigin(0, 0));
        scrollCont.add(this.add.text(tx, cy + P(27), item.desc, {
          fontSize: F(15), fontStyle: 'bold', color: '#b09070', stroke: '#1a0800', strokeThickness: 1,
          wordWrap: { width: txtMaxW },
        }).setOrigin(0, 0));

        const priceIconKey = 'icon_coin';
        const priceLabel = `${item.price.toLocaleString()}金`;
        const priceColor = '#d4a044';
        const priceIconSz = P(12);
        const priceY = cy + CELL_H - P(22);
        const priceIconX = cx + P(7) + priceIconSz / 2;
        if (this.textures.exists(priceIconKey))
          scrollCont.add(this.add.image(priceIconX, priceY, priceIconKey)
            .setDisplaySize(priceIconSz, priceIconSz).setOrigin(0.5, 1));
        scrollCont.add(this.add.text(cx + P(7) + priceIconSz + P(2), priceY, priceLabel, {
          fontSize: F(15), fontStyle: 'bold', color: priceColor, stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 1));

        const btnCX = cx + CELL_W / 2;
        const btnCY = cy + CELL_H - BH / 2 - P(4);
        const btnGfx = this.add.graphics();
        const drawBtn = (hover: boolean) => {
          btnGfx.clear();
          btnGfx.fillStyle(hover ? 0x5a3008 : 0x2a1800, 1);
          btnGfx.fillRoundedRect(btnCX - BW / 2, btnCY - BH / 2, BW, BH, P(5));
          btnGfx.lineStyle(P(1), GOLD, hover ? 1 : 0.6);
          btnGfx.strokeRoundedRect(btnCX - BW / 2, btnCY - BH / 2, BW, BH, P(5));
        };
        drawBtn(false);
        scrollCont.add(btnGfx);
        scrollCont.add(this.add.text(btnCX, btnCY, '購買', {
          fontSize: F(15), fontStyle: 'bold', color: '#e8c870', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5));

        const hit = this.add.rectangle(btnCX, btnCY, BW, BH).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => drawBtn(true));
        hit.on('pointerout', () => drawBtn(false));
        hit.on('pointerdown', () => {
          this.showQtyBuyPopup(item, (qty) => {
            if (!InventoryStore.spendGold(item.price * qty)) { showToast('金幣不足'); return; }
            InventoryStore.addItem(item.id, item.name, qty);
            SaveStore.save();
            refreshGold();
            DailyQuestStore.addProgress('shop_purchase', 1);
            AudioService.playSfx(this, 'sfx_purchase', 0.7);
            showToast(`購買成功：${item.name} ×${qty}`, true);
          });
        });
        scrollCont.add(hit);
      });
    };

    // ── Card Exchange tab ─────────────────────────────────────
    const getExchangeCost = (monsterId: string) =>
      monsterId.startsWith('boss') ? 30 : monsterId.startsWith('elite') ? 15 : 3;

    const buildExchangeContent = (filter: 'small' | 'elite' | 'boss' = 'small') => {
      scrollBaseY = py + HEADER_H + FILTER_H;
      scrollCont.destroy();
      scrollY = 0;
      scrollCont = this.add.container(0, scrollBaseY);
      scrollCont.setMask(scrollMask);
      container.add(scrollCont);  // scrollCont first → lower input priority
      showExchangeFilters(filter); // filter tabs last → on top → intercept input first

      // Group CARD_DEFS by monsterId (preserving order)
      const groupMap = new Map<string, CardDef[]>();
      for (const card of CARD_DEFS) {
        if (!groupMap.has(card.monsterId)) groupMap.set(card.monsterId, []);
        groupMap.get(card.monsterId)!.push(card);
      }

      const COLS3 = 3;
      const EX_PAD = CELL_PAD;
      const EX_CW = Math.floor((PW - EX_PAD * 2 - CELL_GAP * (COLS3 - 1)) / COLS3);

      const ICON_SZ = P(28);

      // Pre-measure all desc heights to find the tallest card in this filter, then use a uniform EX_CH
      const _txtW = EX_CW - ICON_SZ - P(18);
      let EX_CH = P(108);
      for (const [monsterId, measCards] of groupMap) {
        const _tier = monsterId.startsWith('boss') ? 'boss' : monsterId.startsWith('elite') ? 'elite' : 'small';
        if (_tier !== filter) continue;
        for (const measCard of measCards) {
          const t = this.make.text({
            x: 0, y: 0, text: measCard.desc,
            style: { fontSize: F(15), fontStyle: 'bold', wordWrap: { width: _txtW } }, add: false
          });
          EX_CH = Math.max(EX_CH, P(27) + t.height + P(30));
          t.destroy();
        }
      }
      const BW = P(44), BH = P(20);

      const refreshOwned = () => refreshGold();

      let curY = 0;
      let lastTier = '';
      let col = 0;

      for (const [monsterId, cards] of groupMap) {
        const monDef = getMonsterDef(monsterId);
        if (!monDef) continue;
        const cost = getExchangeCost(monsterId);
        const tier = monsterId.startsWith('boss') ? 'boss' : monsterId.startsWith('elite') ? 'elite' : 'small';
        if (tier !== filter) continue;
        const tierColor = tier === 'boss' ? 0xf0c040 : tier === 'elite' ? 0x9aacb8 : 0xb87333;

        if (tier !== lastTier) {
          if (col > 0) { curY += EX_CH + ROW_PAD; col = 0; }
          lastTier = tier;
        }

        // Each card placed in flowing 3-column grid
        for (const [cardIdx, card] of cards.entries()) {
          const cx = -PW / 2 + EX_PAD + col * (EX_CW + CELL_GAP);
          const cy = curY;
          const tintHex = `#${card.tint.toString(16).padStart(6, '0')}`;

          // Cell bg — left stripe uses tier colour
          const cellGfx = this.add.graphics();
          cellGfx.fillStyle(WM, 0.6);
          cellGfx.fillRoundedRect(cx, cy, EX_CW, EX_CH, P(6));
          cellGfx.lineStyle(P(1), WL, 0.3);
          cellGfx.strokeRoundedRect(cx, cy, EX_CW, EX_CH, P(6));
          cellGfx.fillStyle(tierColor, 0.8);
          cellGfx.fillRoundedRect(cx, cy, P(4), EX_CH, P(3));
          scrollCont.add(cellGfx);

          // Icon area (mirrors shop cell style)
          const iconCX = cx + P(7) + ICON_SZ / 2;
          const iconCY = cy + P(8) + ICON_SZ / 2;
          const iconBg = this.add.graphics();
          iconBg.fillStyle(0x0a0800, 0.6);
          iconBg.fillRoundedRect(cx + P(7), cy + P(8), ICON_SZ, ICON_SZ, P(5));
          iconBg.lineStyle(P(1), card.tint, 0.45);
          iconBg.strokeRoundedRect(cx + P(7), cy + P(8), ICON_SZ, ICON_SZ, P(5));
          scrollCont.add(iconBg);

          if (this.textures.exists(monDef.spriteKey)) {
            const spr = this.add.sprite(iconCX, iconCY, monDef.spriteKey, 0);
            spr.setDisplaySize(P(20), P(20)).setTint(card.tint);
            scrollCont.add(spr);
          }

          // Grade badge (corner of icon) — always A/B/C by position in group
          const grade = String.fromCharCode(65 + cardIdx);
          scrollCont.add(this.add.text(cx + P(7) + P(2), cy + P(8) + P(2), grade, {
            fontSize: F(15), fontStyle: 'bold', color: tintHex, stroke: '#000', strokeThickness: 2,
          }).setOrigin(0, 0));

          // Name + desc (right of icon)
          const tx = cx + P(7) + ICON_SZ + P(5);
          const txtW = EX_CW - ICON_SZ - P(18);
          scrollCont.add(this.add.text(tx, cy + P(7), getCardDisplayName(card.id), {
            fontSize: F(15), fontStyle: 'bold', color: tintHex,
            stroke: '#1a0800', strokeThickness: 2,
            wordWrap: { width: txtW }, maxLines: 1,
          }).setOrigin(0, 0));
          const descTxt = this.add.text(tx, cy + P(27), card.desc, {
            fontSize: F(15), fontStyle: 'bold', color: '#b09070', stroke: '#1a0800', strokeThickness: 1,
            wordWrap: { width: txtW },
          }).setOrigin(0, 0);
          scrollCont.add(descTxt);

          // Price row (blank card icon + cost)
          const priceY = cy + EX_CH - P(22);
          if (this.textures.exists('icon_blank_card'))
            scrollCont.add(this.add.image(cx + P(7) + P(6), priceY, 'icon_blank_card').setDisplaySize(P(12), P(12)).setOrigin(0.5, 1));
          scrollCont.add(this.add.text(cx + P(7) + P(14), priceY, `×${cost}`, {
            fontSize: F(15), fontStyle: 'bold', color: '#cc88ff', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0, 1));

          // Buy button (full-width, centered at bottom)
          const btnCX = cx + EX_CW / 2;
          const btnCY = cy + EX_CH - BH / 2 - P(4);
          const btnGfx = this.add.graphics();
          const drawBtn = (hover: boolean) => {
            btnGfx.clear();
            btnGfx.fillStyle(hover ? 0x5a3008 : 0x2a1800, 1);
            btnGfx.fillRoundedRect(btnCX - BW / 2, btnCY - BH / 2, BW, BH, P(5));
            btnGfx.lineStyle(P(1), GOLD, hover ? 1 : 0.6);
            btnGfx.strokeRoundedRect(btnCX - BW / 2, btnCY - BH / 2, BW, BH, P(5));
          };
          drawBtn(false);
          scrollCont.add(btnGfx);
          scrollCont.add(this.add.text(btnCX, btnCY, '兌換', {
            fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5, 0.5));

          const hit = this.add.rectangle(btnCX, btnCY, BW + P(6), BH + P(6)).setInteractive({ useHandCursor: true });
          hit.on('pointerover', () => drawBtn(true));
          hit.on('pointerout', () => drawBtn(false));
          hit.on('pointerdown', () => {
            if (InventoryStore.getItemQty(ITEM_BLANK_CARD) < cost) { showToast('空白卡片不足'); return; }
            InventoryStore.spendItem(ITEM_BLANK_CARD, cost);
            CardStore.addCard(card.id);
            SaveStore.save();
            refreshOwned();
            drawBtn(false);
            DailyQuestStore.addProgress('shop_purchase', 1);
            AudioService.playSfx(this, 'sfx_purchase', 0.7);
            showToast(`兌換成功：${getCardDisplayName(card.id)}`, true);
          });
          scrollCont.add(hit);

          col++;
          if (col >= COLS3) { col = 0; curY += EX_CH + ROW_PAD; }
        }
      }
      if (col > 0) curY += EX_CH + ROW_PAD;

      maxScroll = Math.max(0, curY - (viewH - FILTER_H));
    };

    buildContent(POTION_ITEMS);

    // ── Scroll input ──────────────────────────────────────
    const onWheel = (_ptr: any, _gos: any, _dx: any, dy: number) => {
      if (!container.active) return;
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy * 0.6));
      scrollCont.y = scrollBaseY - scrollY;
    };
    this.input.on('wheel', onWheel);
    container.once(Phaser.GameObjects.Events.DESTROY, () => this.input.off('wheel', onWheel));

    let dragStartY = 0, dragStartScroll = 0;
    const onDragStart = (ptr: Phaser.Input.Pointer) => {
      if (!container.active) return;
      dragStartY = ptr.y; dragStartScroll = scrollY;
    };
    const onDragMove = (ptr: Phaser.Input.Pointer) => {
      if (!container.active || !ptr.isDown) return;
      scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll - (ptr.y - dragStartY)));
      scrollCont.y = scrollBaseY - scrollY;
    };
    this.input.on('pointerdown', onDragStart);
    this.input.on('pointermove', onDragMove);
    container.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('pointerdown', onDragStart);
      this.input.off('pointermove', onDragMove);
    });
  }

  private showQtyBuyPopup(
    item: { id: string; name: string; price: number; desc: string; color: number },
    onConfirm: (qty: number) => void,
  ): void {
    const W = this.scale.width, H = this.scale.height;
    const PW = P(310), PH = P(240);
    const D = 1100;

    const pop = this.add.container(W / 2, H / 2).setDepth(D);

    // Overlay
    const overlay = this.add.rectangle(0, 0, W, H, 0x000000, 0.55).setInteractive();
    overlay.on('pointerdown', () => pop.destroy());
    pop.add(overlay);

    // Panel
    const bg = this.add.graphics();
    bg.fillStyle(WD, 0.97);
    bg.fillRoundedRect(-PW / 2, -PH / 2, PW, PH, P(10));
    bg.lineStyle(P(1.5), item.color, 0.75);
    bg.strokeRoundedRect(-PW / 2, -PH / 2, PW, PH, P(10));
    pop.add(bg);

    const colorHex = `#${item.color.toString(16).padStart(6, '0')}`;

    // Title
    pop.add(this.add.text(0, -PH / 2 + P(22), item.name, {
      fontSize: F(16), fontStyle: 'bold', color: colorHex,
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    // Player gold
    const goldText = this.add.text(0, -PH / 2 + P(50), `💰 ${InventoryStore.getGold().toLocaleString()} 金幣`, {
      fontSize: F(13), color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5);
    pop.add(goldText);
    const onGoldChange = () => goldText.setText(`💰 ${InventoryStore.getGold().toLocaleString()} 金幣`);
    InventoryStore.onChange(onGoldChange);
    pop.once(Phaser.GameObjects.Events.DESTROY, () => InventoryStore.offChange(onGoldChange));

    // Qty state
    let qty = 1;
    const MAX_QTY = 99;

    const qtyLabel = this.add.text(0, -PH / 2 + P(94), '1', {
      fontSize: F(22), fontStyle: 'bold', color: '#ffffff', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);
    pop.add(qtyLabel);

    const totalLabel = this.add.text(0, -PH / 2 + P(168), '', {
      fontSize: F(14), fontStyle: 'bold', color: '#e8c870', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5);
    pop.add(totalLabel);

    const updateDisplay = () => {
      qtyLabel.setText(qty.toString());
      const total = qty * item.price;
      const canAfford = InventoryStore.getGold() >= total;
      totalLabel.setText(`合計：${total.toLocaleString()} 金幣`);
      totalLabel.setColor(canAfford ? '#e8c870' : '#ff5555');
    };
    updateDisplay();

    // Helper: small button
    const BW = P(40), BH = P(32);
    const makeBtn = (x: number, y: number, label: string, w: number, h: number,
      fgColor: string, borderColor: number, onClick: () => void) => {
      const g = this.add.graphics();
      const draw = (hover: boolean) => {
        g.clear();
        g.fillStyle(hover ? 0x5a3008 : 0x2a1800, 1);
        g.fillRoundedRect(x - w / 2, y - h / 2, w, h, P(4));
        g.lineStyle(P(1), borderColor, hover ? 1 : 0.55);
        g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, P(4));
      };
      draw(false);
      pop.add(g);
      pop.add(this.add.text(x, y, label, {
        fontSize: F(15), fontStyle: 'bold', color: fgColor, stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));
      const hit = this.add.rectangle(x, y, w, h).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => draw(true));
      hit.on('pointerout', () => draw(false));
      hit.on('pointerdown', onClick);
      pop.add(hit);
    };

    const qtyY = -PH / 2 + P(94);
    makeBtn(-P(70), qtyY, '－', BW, BH, '#e8c870', GOLD, () => { if (qty > 1) { qty--; updateDisplay(); } });
    makeBtn(P(70), qtyY, '＋', BW, BH, '#e8c870', GOLD, () => { if (qty < MAX_QTY) { qty++; updateDisplay(); } });

    // Quick-add row
    const quickVals = [1, 5, 10];
    const QBW = P(64), QBH = P(26);
    const qRow = -PH / 2 + P(136);
    quickVals.forEach((v, i) => {
      const qx = (i - 1) * (QBW + P(10));
      makeBtn(qx, qRow, `+${v}`, QBW, QBH, '#ccaa66', 0x886622, () => { qty = Math.min(MAX_QTY, qty + v); updateDisplay(); });
    });

    // Cancel / Confirm
    const CBW = P(108), CBH = P(36), cbY = PH / 2 - P(28);
    makeBtn(-P(68), cbY, '取消', CBW, CBH, '#cc6666', 0x883333, () => pop.destroy());
    makeBtn(P(68), cbY, '確認購買', CBW, CBH, '#e8c870', GOLD, () => {
      if (InventoryStore.getGold() < qty * item.price) return;
      AudioService.playSfx(this, 'sfx_purchase', 0.7);
      DailyQuestStore.addProgress('shop_purchase', 1);
      onConfirm(qty);
      pop.destroy();
    });
  }

  private drawCenterHero(W: number, H: number): void {
    const cx = W / 2;
    // BOTTOM_H from global constant
    const availH = H - TOP_H - BOTTOM_H;
    const heroY = TOP_H + availH * 0.50;
    this._heroY = heroY;
    const scale = 1.75 * 1.5 * DPR;


    // ── Animated hero sprite ───────────────────────────────
    this.textures.get('player_idle_shadow').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const hero = this.add.sprite(cx, heroY, 'player_idle_shadow', 0)
      .setScale(scale)
      .setTint(0xffddaa)
      .setDepth(11);

    const playIdle = () => {
      hero.play('player_idle_shadow');
      hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        hero.setFrame(0);
        this.time.delayedCall(Phaser.Math.Between(2200, 4000), playIdle);
      });
    };
    playIdle();

  }


  private drawAmbientParticles(W: number, H: number): void {
    // BOTTOM_H from global constant
    const zoneTop = TOP_H + P(40);
    const zoneBot = H - BOTTOM_H - P(20);
    const colors = [0xffd060, 0x88ddff, 0xffaa44, 0xaaffcc, 0xff88cc];

    for (let i = 0; i < 22; i++) {
      const g = this.add.graphics().setDepth(7);
      const size = Phaser.Math.FloatBetween(1.2, 3.2);
      const x = Phaser.Math.Between(10, W - 10);
      const y = Phaser.Math.Between(zoneTop, zoneBot);
      const alpha = Phaser.Math.FloatBetween(0.18, 0.55);
      const color = Phaser.Utils.Array.GetRandom(colors);

      // Star shape: cross of 2 rects
      g.fillStyle(color, 1);
      g.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
      g.fillRect(-size * 0.35, -size, size * 0.7, size * 2);

      g.setPosition(x, y).setAlpha(0);

      this.tweens.add({
        targets: g,
        alpha: { from: 0, to: alpha },
        duration: Phaser.Math.Between(700, 1600),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 2500),
      });

      this.tweens.add({
        targets: g,
        x: x + Phaser.Math.Between(-40, 40),
        y: y - Phaser.Math.Between(50, 130),
        angle: Phaser.Math.Between(-45, 45),
        duration: Phaser.Math.Between(3500, 8000),
        ease: 'Sine.easeInOut',
        repeat: -1, yoyo: true,
        delay: Phaser.Math.Between(0, 3000),
      });
    }
  }

  /** Small popup to create or join a multiplayer room. */
  private showMultiPopup(): void {
    const W = this._sceneW;
    const H = this._sceneH;
    const D = 400;
    const PW = Math.min(W - P(32), P(320));
    const PH = P(280);
    const px = W / 2 - PW / 2;
    const py = H / 2 - PH / 2;
    const P2 = P;
    const objs: Phaser.GameObjects.GameObject[] = [];

    const closePopup = () => { objs.forEach(o => o.destroy()); this.cleanDomInputs(); };

    // Backdrop
    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(D).setInteractive();
    objs.push(bd);
    bd.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < px || ptr.x > px + PW || ptr.y < py || ptr.y > py + PH) closePopup();
    });

    // Panel
    const pg = this.add.graphics().setDepth(D + 1);
    objs.push(pg);
    pg.fillStyle(WBD, 0.97); pg.fillRoundedRect(px, py, PW, PH, P2(12));
    pg.lineStyle(2, GOLD, 0.6); pg.strokeRoundedRect(px, py, PW, PH, P2(12));

    objs.push(this.add.text(W / 2, py + P2(24), '多人連線', {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2));

    // Nickname input
    objs.push(this.add.text(W / 2, py + P2(56), '你的名稱', {
      fontSize: F(13), color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(D + 2));

    const nameInput = this.makeTextInput(
      objs, W / 2 - P2(80), py + P2(70), P2(160), P2(36), '輸入名稱', D + 2,
      getPlayerName(),
    );

    const errTxt = this.add.text(W / 2, py + P2(122), '', {
      fontSize: F(13), color: '#ff6644',
    }).setOrigin(0.5).setDepth(D + 5);
    objs.push(errTxt);

    // Create room
    const cgfx = this.add.graphics().setDepth(D + 2); objs.push(cgfx);
    cgfx.fillStyle(0x1a3a08, 1); cgfx.fillRoundedRect(W / 2 - P2(130), py + P2(140), P2(120), P2(36), P2(6));
    cgfx.lineStyle(1.5, 0x66aa22, 0.8); cgfx.strokeRoundedRect(W / 2 - P2(130), py + P2(140), P2(120), P2(36), P2(6));
    objs.push(this.add.text(W / 2 - P2(70), py + P2(158), '建立房間', {
      fontSize: F(14), fontStyle: 'bold', color: '#88ee44',
    }).setOrigin(0.5).setDepth(D + 3));
    const cHit = this.add.rectangle(W / 2 - P2(70), py + P2(158), P2(120), P2(36))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(cHit);
    cHit.on('pointerdown', async () => {
      const nick = nameInput.getValue().trim() || getPlayerName();
      setPlayerName(nick);
      errTxt.setText('建立中…').setColor('#ffdd44');
      try {
        await NetworkService.createRoom(nick);
        NetworkService.sendPlayerInfo(nick, PlayerStore.getLevel(), SkinStore.get());
        closePopup();
        NetworkService.onPartnerJoined(data => {
          this._partnerIn = true;
          this._partnerNick = data.nickname || this._partnerNick || '?';
          this._partnerLevel = data.level || this._partnerLevel || 1;
          this._partnerSkinId = data.skinId ?? this._partnerSkinId ?? 0;
          this.refreshRoomOverlay();
        });
        NetworkService.onPartnerLeft(() => { this._partnerIn = false; this.refreshRoomOverlay(); });
        NetworkService.onRoomClosed(() => { NetworkService.disconnect(); this._partnerIn = false; this.refreshRoomOverlay(); this._showToast('房主已離開，房間關閉'); });
        NetworkService.onGameStart(p => {
          AudioService.playSfx(this, 'sfx_battle_start');
          this.scene.start('BattleLoadScene', {
            seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
            mapParams: p.mapParams, partnerNickname: p.guestNickname,
            ownSkinId: p.hostSkinId, partnerSkinId: p.guestSkinId,
            playerCount: p.playerCount ?? 2, mapTheme: p.mapTheme,
          });
        });
        this.refreshRoomOverlay();
      } catch {
        errTxt.setText('建立失敗，請重試').setColor('#ff4444');
      }
    });

    // Join room
    const jgfx = this.add.graphics().setDepth(D + 2); objs.push(jgfx);
    jgfx.fillStyle(0x0a1a3a, 1); jgfx.fillRoundedRect(W / 2 + P2(10), py + P2(140), P2(120), P2(36), P2(6));
    jgfx.lineStyle(1.5, 0x4488cc, 0.8); jgfx.strokeRoundedRect(W / 2 + P2(10), py + P2(140), P2(120), P2(36), P2(6));
    objs.push(this.add.text(W / 2 + P2(70), py + P2(158), '加入房間', {
      fontSize: F(14), fontStyle: 'bold', color: '#88ccff',
    }).setOrigin(0.5).setDepth(D + 3));
    const jHit = this.add.rectangle(W / 2 + P2(70), py + P2(158), P2(120), P2(36))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(jHit);
    jHit.on('pointerdown', () => {
      // Replace popup with join code input
      closePopup();
      this.showJoinCodePopup(nameInput.getValue().trim() || getPlayerName());
    });

    // Close button
    const xHit = this.add.rectangle(px + PW - P2(18), py + P2(18), P2(28), P2(28))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(xHit);
    objs.push(this.add.text(px + PW - P2(18), py + P2(18), '✕', {
      fontSize: F(16), color: '#886644',
    }).setOrigin(0.5).setDepth(D + 3));
    xHit.on('pointerdown', closePopup);
  }

  /** Join code entry popup */
  private showJoinCodePopup(nick: string): void {
    const W = this._sceneW;
    const H = this._sceneH;
    const D = 400;
    const PW = Math.min(W - P(32), P(280));
    const PH = P(220);
    const px = W / 2 - PW / 2;
    const py = H / 2 - PH / 2;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const closePopup = () => { objs.forEach(o => o.destroy()); this.cleanDomInputs(); };

    const bd = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(D).setInteractive();
    objs.push(bd);
    const pg = this.add.graphics().setDepth(D + 1); objs.push(pg);
    pg.fillStyle(WBD, 0.97); pg.fillRoundedRect(px, py, PW, PH, P(12));
    pg.lineStyle(2, GOLD, 0.6); pg.strokeRoundedRect(px, py, PW, PH, P(12));

    objs.push(this.add.text(W / 2, py + P(24), '輸入房間代碼', {
      fontSize: F(16), fontStyle: 'bold', color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2));

    const codeInput = this.makeTextInput(objs, W / 2 - P(60), py + P(52), P(120), P(36), '4位代碼', D + 2);

    const errTxt = this.add.text(W / 2, py + P(104), '', {
      fontSize: F(13), color: '#ff6644',
    }).setOrigin(0.5).setDepth(D + 5);
    objs.push(errTxt);

    const jgfx = this.add.graphics().setDepth(D + 2); objs.push(jgfx);
    jgfx.fillStyle(0x0a1a3a, 1); jgfx.fillRoundedRect(W / 2 - P(55), py + P(124), P(110), P(36), P(6));
    jgfx.lineStyle(1.5, 0x4488cc, 0.8); jgfx.strokeRoundedRect(W / 2 - P(55), py + P(124), P(110), P(36), P(6));
    objs.push(this.add.text(W / 2, py + P(142), '確認加入', {
      fontSize: F(14), fontStyle: 'bold', color: '#88ccff',
    }).setOrigin(0.5).setDepth(D + 3));
    const jHit = this.add.rectangle(W / 2, py + P(142), P(110), P(36))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(jHit);
    jHit.on('pointerdown', async () => {
      const code = codeInput.getValue().trim();
      if (!code) { errTxt.setText('請輸入代碼'); return; }
      setPlayerName(nick);
      errTxt.setText('加入中…').setColor('#ffdd44');
      try {
        await NetworkService.joinRoom(code, nick);
        // Register callbacks BEFORE sendPlayerInfo — server sends partnerJoined back
        // with host's info as soon as it receives playerInfo, so callback must be ready first.
        NetworkService.onPartnerJoined(data => {
          this._partnerIn = true;
          this._partnerNick = data.nickname || this._partnerNick || '?';
          this._partnerLevel = data.level || this._partnerLevel || 1;
          this._partnerSkinId = data.skinId ?? this._partnerSkinId ?? 0;
          this.refreshRoomOverlay();
        });
        NetworkService.onPartnerLeft(() => { this._partnerIn = false; this.refreshRoomOverlay(); });
        NetworkService.onRoomClosed(() => { NetworkService.disconnect(); this._partnerIn = false; this.refreshRoomOverlay(); this._showToast('房主已離開，房間關閉'); });
        NetworkService.onGameStart(payload => {
          try { if (payload.questId) QuestStore.acceptQuest(payload.questId); } catch { /* guest */ }
          AudioService.playSfx(this, 'sfx_battle_start');
          this.scene.start('BattleLoadScene', {
            seed: payload.seed, questStar: payload.questStar, bossMonsterId: payload.bossMonsterId,
            mapParams: payload.mapParams, partnerNickname: payload.hostNickname,
            ownSkinId: payload.guestSkinId, partnerSkinId: payload.hostSkinId,
            playerCount: payload.playerCount ?? 2, mapTheme: payload.mapTheme,
          });
        });
        NetworkService.sendPlayerInfo(nick, PlayerStore.getLevel(), SkinStore.get());
        closePopup();
        this.refreshRoomOverlay();
      } catch {
        errTxt.setText('加入失敗，代碼錯誤').setColor('#ff4444');
      }
    });

    const xHit = this.add.rectangle(px + PW - P(18), py + P(18), P(28), P(28))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(xHit);
    objs.push(this.add.text(px + PW - P(18), py + P(18), '✕', {
      fontSize: F(16), color: '#886644',
    }).setOrigin(0.5).setDepth(D + 3));
    xHit.on('pointerdown', closePopup);
    objs.push(this.add.rectangle(px + PW / 2 - P(65), py + P(185), P(60), P(26))
      .setInteractive({ useHandCursor: true }).setDepth(D + 4)
      .on('pointerdown', () => { closePopup(); this.showMultiPopup(); }));
    objs.push(this.add.text(px + PW / 2 - P(65), py + P(185), '← 返回', {
      fontSize: F(13), color: '#886644',
    }).setOrigin(0.5).setDepth(D + 3));
  }

  private async _showRankingPanel(W: number, H: number): Promise<void> {
    const PW      = Math.min(W - P(8), P(360));
    const PH      = Math.min(H - P(16), P(460));
    const D       = 8000;
    const px      = -PW / 2, py = -PH / 2;
    const HEADER_H = P(68);
    const FOOTER_H = P(38);
    const ROW_H   = P(42);
    const ROW_PAD = P(3);
    const ROW_L   = px + P(12);
    const ROW_W   = PW - P(24);
    const BODY_TOP = py + HEADER_H;   // local Y where body starts
    const BODY_H  = PH - HEADER_H - FOOTER_H;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Click-outside-to-close (coordinate check, not blocking interior clicks)
    const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setInteractive();
    dim.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - W / 2) < PW / 2 && Math.abs(p.y - H / 2) < PH / 2) return;
      container.destroy();
    });
    container.add(dim);

    // ── Background ────────────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillStyle(0x8899aa, 1);
    bg.fillRoundedRect(px - P(2), py - P(2), PW + P(4), PH + P(4), P(13));
    bg.fillStyle(0x445566, 0.6);
    bg.fillRoundedRect(px - P(1), py - P(1), PW + P(2), PH + P(2), P(12));
    bg.fillStyle(0x141824, 1);
    bg.fillRoundedRect(px, py, PW, PH, P(11));
    bg.fillStyle(0x1c2235, 1);
    bg.fillRoundedRect(px, py, PW, HEADER_H, P(11));
    bg.fillRect(px, py + P(10), PW, HEADER_H - P(10));
    bg.lineStyle(P(1), 0x556688, 0.9);
    bg.lineBetween(px + P(14), py + HEADER_H, px + PW - P(14), py + HEADER_H);
    bg.lineStyle(P(1), 0x334455, 0.4);
    bg.lineBetween(px + P(14), py + HEADER_H + P(1), px + PW - P(14), py + HEADER_H + P(1));
    container.add(bg);

    // ── Header ────────────────────────────────────────────────────
    container.add(this.add.text(0, py + P(24), '等級排行榜', {
      fontSize: F(20), fontStyle: 'bold', color: '#ccd8ee',
      stroke: '#080c18', strokeThickness: P(2),
    }).setOrigin(0.5, 0.5));
    container.add(this.add.text(0, py + P(50), '— 全服玩家 —', {
      fontSize: F(11), color: '#667788',
      stroke: '#080c18', strokeThickness: P(1),
    }).setOrigin(0.5, 0.5));

    // ── Close button ─────────────────────────────────────────────
    const closeBtn = this.add.text(px + PW - P(14), py + P(14), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#778899',
      stroke: '#080c18', strokeThickness: P(1),
    }).setOrigin(1, 0);
    const closeBtnHit = this.add.rectangle(px + PW - P(22), py + P(22), P(44), P(44)).setInteractive({ useHandCursor: true }).setAlpha(0.001);
    closeBtnHit.on('pointerdown', () => container.destroy());
    container.add(closeBtn);
    container.add(closeBtnHit);

    // ── Footer (fixed) ────────────────────────────────────────────
    const footerY = py + PH - FOOTER_H;
    const footerDivG = this.add.graphics();
    footerDivG.lineStyle(P(1), 0x334455, 0.6);
    footerDivG.lineBetween(px + P(20), footerY, px + PW - P(20), footerY);
    container.add(footerDivG);
    const footerText = this.add.text(0, footerY + P(10), '讀取中…', {
      fontSize: F(15), fontStyle: 'bold', color: '#445566',
    }).setOrigin(0.5, 0);
    container.add(footerText);

    // ── Loading text ──────────────────────────────────────────────
    const loadingText = this.add.text(0, BODY_TOP + BODY_H / 2, '讀取中…', {
      fontSize: F(15), fontStyle: 'bold', color: '#667788',
    }).setOrigin(0.5, 0.5);
    container.add(loadingText);

    // ── Fetch leaderboard ─────────────────────────────────────────
    interface LBEntry { playerId: string; level: number; }
    let entries: LBEntry[] = [];
    let fetchError = false;
    try {
      const raw    = localStorage.getItem('rg_user');
      const token  = raw ? (JSON.parse(raw) as { accessToken: string }).accessToken : '';
      const apiUrl = (window as any).__apiUrl as string ?? '';
      const resp   = await fetch(`${apiUrl}/leaderboard/level`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) entries = await resp.json();
      else fetchError = true;
    } catch { fetchError = true; }

    if (!container.active) return;
    loadingText.destroy();

    // ── Error / empty ─────────────────────────────────────────────
    if (fetchError || entries.length === 0) {
      container.add(this.add.text(0, BODY_TOP + BODY_H / 2,
        fetchError ? '讀取失敗，請稍後再試' : '暫無資料', {
        fontSize: F(15), fontStyle: 'bold', color: '#667788',
      }).setOrigin(0.5, 0.5));
      footerText.setText('點擊外框關閉');
      return;
    }

    // ── Current player ────────────────────────────────────────────
    const myRaw      = localStorage.getItem('rg_user');
    const myPlayerId = myRaw ? (JSON.parse(myRaw) as any).playerId ?? '' : '';

    // ── Scrollable rows container ─────────────────────────────────
    const scrollCnt = this.add.container(0, BODY_TOP);
    container.add(scrollCnt);

    // Geometry mask (clips rows to body area) — in world coordinates
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(W / 2 + px, H / 2 + BODY_TOP, PW, BODY_H);
    scrollCnt.setMask(maskGfx.createGeometryMask());

    // ── Build rows (Y relative to scrollCnt) ──────────────────────
    const RANK_COLORS = ['#d4aa30', '#cccccc', '#cc7733'];
    let myRank = -1;

    entries.forEach((entry, i) => {
      if (entry.playerId === myPlayerId) myRank = i + 1;
      const ry   = P(6) + i * (ROW_H + ROW_PAD);
      const isMe = entry.playerId === myPlayerId;

      const rowBg = this.add.graphics();
      rowBg.fillStyle(isMe ? 0x1a2c1a : (i % 2 === 0 ? 0x1c2233 : 0x192030), 1);
      rowBg.fillRoundedRect(ROW_L, ry, ROW_W, ROW_H, P(6));
      if (isMe) {
        rowBg.lineStyle(P(1), 0x44aa44, 0.7);
        rowBg.strokeRoundedRect(ROW_L, ry, ROW_W, ROW_H, P(6));
      }
      rowBg.fillStyle(0xffffff, 0.03);
      rowBg.fillRoundedRect(ROW_L, ry, ROW_W, P(3), P(3));
      scrollCnt.add(rowBg);

      // Rank number
      scrollCnt.add(this.add.text(ROW_L + P(18), ry + ROW_H / 2, `${i + 1}`, {
        fontSize: F(15), fontStyle: 'bold',
        color: i < 3 ? RANK_COLORS[i] : (isMe ? '#88cc88' : '#556677'),
        stroke: '#080c18', strokeThickness: P(1),
      }).setOrigin(0.5, 0.5));

      // Player name
      const nameStr = entry.playerId.length > 11 ? entry.playerId.slice(0, 10) + '…' : entry.playerId;
      scrollCnt.add(this.add.text(ROW_L + P(36), ry + ROW_H / 2, nameStr, {
        fontSize: F(15), fontStyle: 'bold', color: isMe ? '#aaddaa' : '#99aabb',
        stroke: '#080c18', strokeThickness: P(1),
      }).setOrigin(0, 0.5));

      // Level
      const lvColor = i < 3 ? RANK_COLORS[i] : (isMe ? '#88cc88' : '#aabbcc');
      scrollCnt.add(this.add.text(ROW_L + ROW_W - P(12), ry + ROW_H / 2, `Lv. ${entry.level}`, {
        fontSize: F(15), fontStyle: 'bold', color: lvColor,
        stroke: '#080c18', strokeThickness: P(2),
      }).setOrigin(1, 0.5));
    });

    // ── Footer text ───────────────────────────────────────────────
    if (myRank > 0) {
      footerText.setText(`我的排名：第 ${myRank} 名`);
      footerText.setColor('#88cc88');
    } else {
      footerText.setText('點擊外框關閉');
    }

    // ── Scroll logic ──────────────────────────────────────────────
    const totalH   = P(6) + entries.length * (ROW_H + ROW_PAD);
    const maxScroll = Math.max(0, totalH - BODY_H);

    let scrollY    = 0;
    let isDragging = false;
    let lastPY     = 0;

    const inBody = (p: Phaser.Input.Pointer) =>
      p.x >= W / 2 + px && p.x <= W / 2 + px + PW &&
      p.y >= H / 2 + BODY_TOP && p.y <= H / 2 + BODY_TOP + BODY_H;

    const onDown = (p: Phaser.Input.Pointer) => {
      if (!container.active || !inBody(p)) return;
      isDragging = true; lastPY = p.y;
    };
    const onMove = (p: Phaser.Input.Pointer) => {
      if (!isDragging || !container.active) return;
      scrollY = Phaser.Math.Clamp(scrollY + (lastPY - p.y), 0, maxScroll);
      lastPY  = p.y;
      scrollCnt.y = BODY_TOP - scrollY;
    };
    const onUp   = () => { isDragging = false; };
    const onWheel = (_p: unknown, _go: unknown, _dx: number, dy: number) => {
      if (!container.active) return;
      scrollY = Phaser.Math.Clamp(scrollY + dy * 0.6, 0, maxScroll);
      scrollCnt.y = BODY_TOP - scrollY;
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup',   onUp);
    this.input.on('wheel',       onWheel);

    container.once('destroy', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup',   onUp);
      this.input.off('wheel',       onWheel);
      maskGfx.destroy();
    });
  }

  /** Destroys and redraws room overlay: room code, leave button, partner sprite, guest overlay */
  private _showAltarPanel(W: number, H: number): void {
    const PW = Math.min(P(400), W - P(24));
    const PH = Math.min(P(500), H - P(40));
    const D  = 600;
    const px = -PW / 2, py = -PH / 2;

    const HEADER_H = P(72);
    const FOOTER_H = P(24);
    const CLIP_TOP  = py + HEADER_H;
    const CLIP_H    = PH - HEADER_H - FOOTER_H;

    // ── 神秘石壇配色 ────────────────────────────────────────────────
    const AC_BG      = 0x0c0818;  // 極深紫黑
    const AC_BORDER  = 0x7744cc;  // 外框紫
    const AC_BORDER2 = 0x3a1e88;  // 內框深紫
    const AC_HEAD    = 0x18083a;  // 標題欄深紫

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.85).setInteractive();
    backdrop.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (Math.abs(p.x - W / 2) < PW / 2 && Math.abs(p.y - H / 2) < PH / 2) return;
      container.destroy();
    });
    container.add(backdrop);

    // Panel shell（紫色邊框＋深紫背景）
    const bg = this.add.graphics();
    bg.fillStyle(AC_BORDER, 1);  bg.fillRoundedRect(px - P(3), py - P(3), PW + P(6), PH + P(6), P(14));
    bg.fillStyle(AC_BORDER2, 1); bg.fillRoundedRect(px - P(1), py - P(1), PW + P(2), PH + P(2), P(12));
    bg.fillStyle(AC_BG, 1);      bg.fillRoundedRect(px, py, PW, PH, P(12));
    // 標題欄底色
    bg.fillStyle(AC_HEAD, 1);    bg.fillRoundedRect(px, py, PW, HEADER_H, P(12));
    bg.fillStyle(AC_HEAD, 1);    bg.fillRect(px, py + P(8), PW, HEADER_H - P(8));
    // 標題欄底線
    bg.lineStyle(P(1), AC_BORDER, 0.6); bg.lineBetween(px + P(12), py + HEADER_H, px + PW - P(12), py + HEADER_H);
    container.add(bg);

    // 標題
    container.add(this.add.text(0, py + P(22), '✦  祭 祀 台  ✦', {
      fontSize: F(17), fontStyle: 'bold', color: '#ffdd55',
      stroke: '#2a0066', strokeThickness: P(3),
    }).setOrigin(0.5));

    // ℹ 資訊按鈕
    let infoTooltip: Phaser.GameObjects.Container | null = null;
    const infoBtnX = px + P(22), infoBtnY = py + P(22);
    const infoBtnSz = P(24);
    const infoBtnGfx = this.add.graphics();
    infoBtnGfx.fillStyle(0x2a1255, 1); infoBtnGfx.fillRoundedRect(infoBtnX - infoBtnSz/2, infoBtnY - infoBtnSz/2, infoBtnSz, infoBtnSz, P(5));
    infoBtnGfx.lineStyle(P(1.5), 0xaa66ff, 0.9); infoBtnGfx.strokeRoundedRect(infoBtnX - infoBtnSz/2, infoBtnY - infoBtnSz/2, infoBtnSz, infoBtnSz, P(5));
    infoBtnGfx.fillStyle(0xaa66ff, 0.15); infoBtnGfx.fillRect(infoBtnX - infoBtnSz/2 + P(2), infoBtnY - infoBtnSz/2 + P(2), infoBtnSz - P(4), P(2));
    container.add(infoBtnGfx);
    const infoBtn = this.add.text(infoBtnX, infoBtnY, 'ℹ', {
      fontSize: F(13), fontStyle: 'bold', color: '#cc99ff',
      stroke: '#0a0018', strokeThickness: P(1),
    }).setOrigin(0.5).setInteractive({ useHandCursor: true,
      hitArea: new Phaser.Geom.Rectangle(-infoBtnSz/2, -infoBtnSz/2, infoBtnSz, infoBtnSz),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains });
    infoBtn.on('pointerdown', () => {
      if (infoTooltip) { infoTooltip.destroy(); infoTooltip = null; return; }
      const tw = P(210), th = P(44);
      const tx = infoBtnX + tw / 2 + P(8), ty = infoBtnY + th / 2 + P(14);
      infoTooltip = this.add.container(tx, ty).setDepth(D + 30);

      const tbg = this.add.graphics();
      // 外發光框
      tbg.fillStyle(0xaa66ff, 0.5); tbg.fillRoundedRect(-tw/2 - P(3), -th/2 - P(3), tw + P(6), th + P(6), P(9));
      // 主背景
      tbg.fillStyle(0x1e0e3a, 1);   tbg.fillRoundedRect(-tw/2, -th/2, tw, th, P(7));
      // 頂部高光條
      tbg.fillStyle(0xaa66ff, 0.25); tbg.fillRect(-tw/2 + P(2), -th/2 + P(2), tw - P(4), P(3));
      // 外框線
      tbg.lineStyle(P(1.5), 0xaa66ff, 0.9); tbg.strokeRoundedRect(-tw/2, -th/2, tw, th, P(7));
      // 內細框
      tbg.lineStyle(P(1), 0xffffff, 0.08); tbg.strokeRoundedRect(-tw/2 + P(2), -th/2 + P(2), tw - P(4), th - P(4), P(5));
      infoTooltip.add(tbg);

      infoTooltip.add(this.add.text(0, 0, '門票來源：5星BOSS機率掉落', {
        fontSize: F(12), fontStyle: 'bold', color: '#ddbbff',
        stroke: '#0a0018', strokeThickness: P(1),
      }).setOrigin(0.5));

      const hit = this.add.rectangle(0, 0, tw, th).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => { infoTooltip?.destroy(); infoTooltip = null; });
      infoTooltip.add(hit);
      container.add(infoTooltip);
    });
    container.add(infoBtn);

    // 關閉按鈕
    const closeBtn = this.add.text(px + PW - P(18), py + P(22), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc55aa',
      stroke: '#1a0033', strokeThickness: P(2),
    }).setOrigin(0.5)
      .setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(22), -P(22), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtn.on('pointerdown', () => container.destroy());
    container.add(closeBtn);

    const SERIES: { itemId: string; iconKey: string; seriesName: string; bossName: string; color: number }[] = [
      { itemId: ITEM_TICKET_SLIME,   iconKey: 'icon_ticket_slime',   seriesName: '史萊姆黏液',  bossName: '傳說史萊姆王',   color: 0x44ee99 },
      { itemId: ITEM_TICKET_FLOWER,  iconKey: 'icon_ticket_flower',  seriesName: '植物精隨',    bossName: '傳說花王',       color: 0x99ee44 },
      { itemId: ITEM_TICKET_ORC,     iconKey: 'icon_ticket_orc',     seriesName: '獸人王冠',    bossName: '傳說獸人王',     color: 0xeebb44 },
      { itemId: ITEM_TICKET_VAMPIRE, iconKey: 'icon_ticket_vampire', seriesName: '邀請函',      bossName: '傳說吸血鬼王',   color: 0xdd77ff },
    ];

    const ROW_H = P(84), ROW_GAP = P(8);
    const BTN_W = P(76), BTN_H = P(32);
    const ICON_SZ = P(52);
    const ROW_L   = px + P(10);
    const ROW_W   = PW - P(20);
    const ICON_CX = ROW_L + P(10) + ICON_SZ / 2;
    const TEXT_X  = ROW_L + P(10) + ICON_SZ + P(10);
    const BTN_CX  = px + PW - P(14) - BTN_W / 2;
    const CONTENT_H = SERIES.length * ROW_H + (SERIES.length - 1) * ROW_GAP;
    const maxScroll = Math.max(0, CONTENT_H - CLIP_H);

    let scrollY = 0;
    const scrollCnt = this.add.container(0, CLIP_TOP);
    container.add(scrollCnt);

    const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskShape.fillStyle(0xffffff);
    maskShape.fillRect(W / 2 + px, H / 2 + CLIP_TOP, PW, CLIP_H);
    scrollCnt.setMask(maskShape.createGeometryMask());

    const applyScroll = (dy: number) => {
      scrollY = Phaser.Math.Clamp(scrollY + dy, 0, maxScroll);
      scrollCnt.y = CLIP_TOP - scrollY;
    };

    const LEGENDARY_BOSS_MAP: Record<string, string> = {
      [ITEM_TICKET_SLIME]:   'boss_slime_legendary',
      [ITEM_TICKET_FLOWER]:  'boss_flower_legendary',
      [ITEM_TICKET_ORC]:     'boss_orc_legendary',
      [ITEM_TICKET_VAMPIRE]: 'boss_vampire_legendary',
    };

    const popCenterY = py + HEADER_H + CLIP_H / 2;
    let weaponPopup: Phaser.GameObjects.Container | null = null;

    const showWeaponPopup = (s: typeof SERIES[0]) => {
      weaponPopup?.destroy();
      const bossId   = LEGENDARY_BOSS_MAP[s.itemId];
      const weaponId = bossId ? LEGENDARY_BOSS_WEAPON[bossId] : undefined;
      if (!weaponId) return;
      const weapon = generateLegendaryWeapon(weaponId);

      const popW   = P(240);
      const rowH   = P(26);
      const iSz    = P(52);
      const bodyH  = (weapon.affixes.length + 1) * rowH;
      const popH   = P(48) + P(8) + iSz + P(8) + bodyH + P(28);

      weaponPopup = this.add.container(0, popCenterY).setDepth(D + 20);
      container.add(weaponPopup);

      // 半透明遮罩，點任意處關閉
      const dim = this.add.rectangle(0, 0, PW - P(6), CLIP_H, 0x000000, 0.6).setInteractive();
      dim.on('pointerdown', () => { weaponPopup?.destroy(); weaponPopup = null; });
      weaponPopup.add(dim);

      // ── 外框 + 背景 ─────────────────────────────────────────
      const bg = this.add.graphics();
      // 金色外邊框
      bg.fillStyle(GOLD, 1);
      bg.fillRoundedRect(-popW / 2 - P(2), -popH / 2 - P(2), popW + P(4), popH + P(4), P(11));
      // 深木色內框
      bg.fillStyle(WL, 0.5);
      bg.fillRoundedRect(-popW / 2 - P(1), -popH / 2 - P(1), popW + P(2), popH + P(2), P(10));
      // 主背景
      bg.fillStyle(WB, 1);
      bg.fillRoundedRect(-popW / 2, -popH / 2, popW, popH, P(9));
      // 標題欄底色
      bg.fillStyle(WD, 1);
      bg.fillRoundedRect(-popW / 2, -popH / 2, popW, P(48), P(9));
      bg.fillRect(-popW / 2, -popH / 2 + P(30), popW, P(18));
      // 標題底線：金色主線 + 高光
      bg.fillStyle(GOLD, 0.8);
      bg.fillRect(-popW / 2 + P(10), -popH / 2 + P(48), popW - P(20), P(1));
      bg.fillStyle(WH, 0.25);
      bg.fillRect(-popW / 2 + P(10), -popH / 2 + P(49), popW - P(20), P(1));
      weaponPopup.add(bg);

      // ── 標題區 ───────────────────────────────────────────────
      weaponPopup.add(this.add.text(0, -popH / 2 + P(18), weapon.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070',
        stroke: '#1a0800', strokeThickness: P(2),
      }).setOrigin(0.5, 0.5));

      weaponPopup.add(this.add.text(-popW / 2 + P(12), -popH / 2 + P(36), '傳說武器', {
        fontSize: F(11), fontStyle: 'bold', color: '#ee4444',
        stroke: '#1a0800', strokeThickness: P(1),
      }).setOrigin(0, 0.5));

      weaponPopup.add(this.add.text(popW / 2 - P(12), -popH / 2 + P(36), '掉落率 35%', {
        fontSize: F(11), fontStyle: 'bold', color: '#a87840',
        stroke: '#1a0800', strokeThickness: P(1),
      }).setOrigin(1, 0.5));

      // ── 武器圖示 ─────────────────────────────────────────────
      const iconY = -popH / 2 + P(48) + P(8) + iSz / 2;
      if (this.textures.exists(weapon.texture)) {
        const wIcon = this.add.image(0, iconY, weapon.texture).setDisplaySize(iSz, iSz);
        if (wIcon.postFX) wIcon.postFX.addGlow(0xee2222, 5, 0, false, 0.1, 14);
        weaponPopup.add(wIcon);
      }

      // ── 詞綴列（無交錯，統一細線分隔）──────────────────────────
      const bodyTop = iconY + iSz / 2 + P(8);
      weapon.affixes.forEach((a, idx) => {
        const rowY = bodyTop + idx * rowH;
        if (idx > 0) {
          const div = this.add.graphics();
          div.fillStyle(WL, 0.15);
          div.fillRect(-popW / 2 + P(14), rowY, popW - P(28), P(1));
          weaponPopup!.add(div);
        }
        weaponPopup!.add(this.add.text(-popW / 2 + P(16), rowY + rowH / 2, '◆', {
          fontSize: F(9), color: '#c49050', stroke: '#1a0800', strokeThickness: P(1),
        }).setOrigin(0, 0.5));
        weaponPopup!.add(this.add.text(-popW / 2 + P(28), rowY + rowH / 2, STAT_NAMES[a.stat], {
          fontSize: F(13), fontStyle: 'bold', color: '#c8a070',
          stroke: '#1a0800', strokeThickness: P(1),
        }).setOrigin(0, 0.5));
        weaponPopup!.add(this.add.text(popW / 2 - P(12), rowY + rowH / 2, `+${fmtAffixValue(a.stat, a.value)}`, {
          fontSize: F(13), fontStyle: 'bold', color: '#88cc88',
          stroke: '#1a0800', strokeThickness: P(1),
        }).setOrigin(1, 0.5));
      });

      // ── 無法精煉 ─────────────────────────────────────────────
      const noEnhY = bodyTop + weapon.affixes.length * rowH;
      const noEnhDiv = this.add.graphics();
      noEnhDiv.fillStyle(WL, 0.15);
      noEnhDiv.fillRect(-popW / 2 + P(14), noEnhY, popW - P(28), P(1));
      weaponPopup.add(noEnhDiv);
      weaponPopup.add(this.add.text(-popW / 2 + P(28), noEnhY + rowH / 2, '無法精煉', {
        fontSize: F(12), fontStyle: 'bold', color: '#7a5830',
        stroke: '#1a0800', strokeThickness: P(1),
      }).setOrigin(0, 0.5));

      // ── Footer 分隔 + 提示 ────────────────────────────────────
      const footerG = this.add.graphics();
      footerG.fillStyle(GOLD, 0.35);
      footerG.fillRect(-popW / 2 + P(10), noEnhY + rowH + P(2), popW - P(20), P(1));
      weaponPopup.add(footerG);

      weaponPopup.add(this.add.text(0, popH / 2 - P(14), '點擊任意處關閉', {
        fontSize: F(10), fontStyle: 'bold', color: '#6a5030',
        stroke: '#1a0800', strokeThickness: P(1),
      }).setOrigin(0.5, 0.5));
    };

    SERIES.forEach((s, i) => {
      const ry = i * (ROW_H + ROW_GAP);
      const qty = InventoryStore.getItemQty(s.itemId);
      const hasTicket = qty > 0;
      const cHex = `#${s.color.toString(16).padStart(6, '0')}`;

      // ── 行底色（有無門票均亮色顯示）──────────────────────────
      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x18103a, 1);
      rowBg.fillRoundedRect(ROW_L, ry, ROW_W, ROW_H, P(10));
      rowBg.fillStyle(s.color, 1);
      rowBg.fillRoundedRect(ROW_L, ry + P(10), P(5), ROW_H - P(20), P(2));
      rowBg.lineStyle(P(1.5), s.color, hasTicket ? 0.7 : 0.35);
      rowBg.strokeRoundedRect(ROW_L, ry, ROW_W, ROW_H, P(10));
      scrollCnt.add(rowBg);

      // ── 圖示 ────────────────────────────────────────────────
      if (this.textures.exists(s.iconKey)) {
        scrollCnt.add(
          this.add.image(ICON_CX, ry + ROW_H / 2, s.iconKey)
            .setDisplaySize(ICON_SZ, ICON_SZ),
        );
      }

      // ── 文字 ────────────────────────────────────────────────
      scrollCnt.add(this.add.text(TEXT_X, ry + P(24), s.seriesName, {
        fontSize: F(16), fontStyle: 'bold', color: cHex,
        stroke: '#08001a', strokeThickness: P(2),
      }).setOrigin(0, 0.5));

      scrollCnt.add(this.add.text(TEXT_X, ry + P(44), s.bossName, {
        fontSize: F(14), fontStyle: 'bold', color: '#c0a8e8',
        stroke: '#08001a', strokeThickness: P(1),
      }).setOrigin(0, 0.5));

      // ── 查看掉落按鈕 ────────────────────────────────────────
      const infoBW = P(88), infoBH = P(22), infoBX = TEXT_X + infoBW / 2, infoBY = ry + P(66);
      const infoBg = this.add.graphics();
      infoBg.fillStyle(WM, 1);
      infoBg.fillRoundedRect(infoBX - infoBW / 2, infoBY - infoBH / 2, infoBW, infoBH, P(4));
      infoBg.lineStyle(P(1.5), GOLD, 0.65);
      infoBg.strokeRoundedRect(infoBX - infoBW / 2, infoBY - infoBH / 2, infoBW, infoBH, P(4));
      infoBg.fillStyle(WH, 0.12);
      infoBg.fillRect(infoBX - infoBW / 2, infoBY - infoBH / 2, infoBW, P(2));
      scrollCnt.add(infoBg);
      scrollCnt.add(this.add.text(infoBX, infoBY, '掉落裝備', {
        fontSize: F(11), fontStyle: 'bold', color: '#c49050',
        stroke: '#1a0800', strokeThickness: P(1),
      }).setOrigin(0.5, 0.5));
      const infoHit = this.add.rectangle(infoBX, infoBY, infoBW, infoBH).setInteractive({ useHandCursor: true });
      infoHit.on('pointerdown', () => showWeaponPopup(s));
      scrollCnt.add(infoHit);

      // ── 數量 ────────────────────────────────────────────────
      scrollCnt.add(this.add.text(BTN_CX, ry + P(20), `×${qty}`, {
        fontSize: F(15), fontStyle: 'bold', color: '#ffdd44',
        stroke: '#08001a', strokeThickness: P(2),
      }).setOrigin(0.5));

      // ── 挑戰按鈕 ────────────────────────────────────────────
      const btnY = ry + ROW_H - P(20);
      const btnG = this.add.graphics();
      if (hasTicket) {
        btnG.fillStyle(0x7722aa, 1);
        btnG.fillRoundedRect(BTN_CX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, P(6));
        btnG.lineStyle(P(1.5), s.color, 0.9);
        btnG.strokeRoundedRect(BTN_CX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, P(6));
      } else {
        btnG.fillStyle(0x140c28, 1);
        btnG.fillRoundedRect(BTN_CX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, P(6));
        btnG.lineStyle(P(1), 0x2a1e44, 0.5);
        btnG.strokeRoundedRect(BTN_CX - BTN_W / 2, btnY - BTN_H / 2, BTN_W, BTN_H, P(6));
      }
      scrollCnt.add(btnG);

      scrollCnt.add(this.add.text(BTN_CX, btnY, hasTicket ? '⚔ 挑戰' : '需門票', {
        fontSize: F(14), fontStyle: 'bold',
        color: hasTicket ? '#eeccff' : '#2e2244',
        stroke: '#08001a', strokeThickness: P(2),
      }).setOrigin(0.5).setAlpha(hasTicket ? 1 : 0.35));

      if (hasTicket) {
        const hit = this.add.rectangle(BTN_CX, btnY, BTN_W, BTN_H).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => {
          const bossId = LEGENDARY_BOSS_MAP[s.itemId];
          if (!bossId) return;
          if (InventoryStore.getItemQty(s.itemId) <= 0) { this._showToast('門票不足'); return; }
          InventoryStore.spendItem(s.itemId, 1);
          SaveStore.save();
          AudioService.playSfx(this, 'sfx_battle_start');
          container.destroy();
          this.scene.start('BattleLoadScene', {
            questStar: 6, bossMonsterId: bossId,
            ownSkinId: SkinStore.get(), legendaryMode: true,
          });
        });
        scrollCnt.add(hit);
      }
    });

    // Drag-to-scroll: use scene-level pointer events to avoid blocking hit zones
    let _dragY = -1;
    const onPD = (p: Phaser.Input.Pointer) => {
      const ly = p.y - H / 2;
      _dragY = (ly >= CLIP_TOP && ly <= CLIP_TOP + CLIP_H) ? p.y : -1;
    };
    const onPM = (p: Phaser.Input.Pointer) => {
      if (!p.isDown || _dragY < 0) return;
      applyScroll(_dragY - p.y);
      _dragY = p.y;
    };
    const onW = (_p: unknown, _o: unknown, _dx: number, dy: number) => applyScroll((dy as number) * 0.6);
    this.input.on('pointerdown', onPD);
    this.input.on('pointermove', onPM);
    this.input.on('wheel', onW);
    container.once('destroy', () => {
      this.input.off('pointerdown', onPD);
      this.input.off('pointermove', onPM);
      this.input.off('wheel', onW);
    });

  }

  private _showToast(msg: string): void {
    const W = this._sceneW, H = this._sceneH;
    const STEP = P(28), MAX = 3;
    const baseY = H / 2 - P(60);

    // Push existing toasts up
    this._toastStack.forEach((t, i) => {
      this.tweens.add({ targets: t, y: baseY - STEP * (this._toastStack.length - i), duration: 150 });
    });

    // Remove oldest if already at max
    if (this._toastStack.length >= MAX) {
      const old = this._toastStack.shift()!;
      this.tweens.killTweensOf(old);
      old.destroy();
    }

    const t = this.add.text(W / 2, baseY, msg, {
      fontSize: F(15), fontStyle: 'bold', color: '#ffcc44',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(500);
    this._toastStack.push(t);

    this.tweens.add({
      targets: t, alpha: 0, delay: 1800, duration: 600,
      onComplete: () => {
        t.destroy();
        const idx = this._toastStack.indexOf(t);
        if (idx !== -1) this._toastStack.splice(idx, 1);
      },
    });
  }

  private refreshRoomOverlay(): void {
    if (this._partyState === 'in_party') return;
    this.roomOverlayObjs.forEach(o => o.destroy());
    this.roomOverlayObjs = [];

    const W = this._sceneW;
    const H = this._sceneH;
    const cx = W / 2;
    const heroY = this._heroY;
    const D = 30;

    // Multi button state — hide base button when connected, overlay handles display
    const connected = NetworkService.connected;
    const drawFn = (this as any)._drawMultiBtn as ((c: boolean) => void) | undefined;
    drawFn?.(connected);
    if (this._multiBtnTxt) this._multiBtnTxt.setVisible(!connected);
    if (this._multiBtnHit) {
      if (connected) this._multiBtnHit.disableInteractive();
      else this._multiBtnHit.setInteractive({ useHandCursor: true });
    }

    if (!connected) return;

    // ── Room code + leave button in the bottom-right corner ──────
    const panelW = P(108);
    const panelH = P(82);
    const panelCX = W - P(10) - panelW / 2;
    const panelY = H - BOTTOM_H - P(6) - panelH;

    const rpgfx = this.add.graphics().setDepth(25);
    this.roomOverlayObjs.push(rpgfx);
    rpgfx.fillStyle(0x000000, 0.35);
    rpgfx.fillRoundedRect(panelCX - panelW / 2 + P(2), panelY + P(2), panelW, panelH, P(8));
    rpgfx.fillStyle(WBD, 1);
    rpgfx.fillRoundedRect(panelCX - panelW / 2, panelY, panelW, panelH, P(8));
    rpgfx.lineStyle(1.5, 0xffcc44, 0.5);
    rpgfx.strokeRoundedRect(panelCX - panelW / 2, panelY, panelW, panelH, P(8));

    // "房間代碼" label
    this.roomOverlayObjs.push(this.add.text(panelCX, panelY + P(14), '房間代碼', {
      fontSize: F(12), color: '#888888',
    }).setOrigin(0.5).setDepth(26));

    // Room code digits
    this.roomOverlayObjs.push(this.add.text(panelCX, panelY + P(32), NetworkService.gameCode, {
      fontSize: F(22), fontStyle: 'bold', color: '#ffe080', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(26));

    // Leave room button
    const lBtnW = panelW - P(16);
    const lBtnH = P(22);
    const lBtnY = panelY + P(61);
    const lgfx = this.add.graphics().setDepth(25);
    this.roomOverlayObjs.push(lgfx);
    lgfx.fillStyle(0x3a0a04, 1);
    lgfx.fillRoundedRect(panelCX - lBtnW / 2, lBtnY - lBtnH / 2, lBtnW, lBtnH, P(5));
    lgfx.lineStyle(1, 0x883322, 0.8);
    lgfx.strokeRoundedRect(panelCX - lBtnW / 2, lBtnY - lBtnH / 2, lBtnW, lBtnH, P(5));
    this.roomOverlayObjs.push(this.add.text(panelCX, lBtnY, '離開房間', {
      fontSize: F(13), color: '#ff8866',
    }).setOrigin(0.5).setDepth(26));
    const lHit = this.add.rectangle(panelCX, lBtnY, lBtnW, lBtnH)
      .setInteractive({ useHandCursor: true }).setDepth(27);
    this.roomOverlayObjs.push(lHit);
    lHit.on('pointerdown', () => {
      NetworkService.disconnect();
      this._partnerIn = false;
      this.refreshRoomOverlay();
    });

    if (this._partnerIn) {
      const partnerX = cx - P(90);
      const skinKey = `skin_preview_${this._partnerSkinId}`;
      if (this.textures.exists(skinKey)) {
        this.textures.get(skinKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
        const partnerSprite = this.add.sprite(partnerX, heroY, skinKey, 0)
          .setScale(1.75 * 1.5 * DPR).setDepth(D);
        this.roomOverlayObjs.push(partnerSprite);
        const animKey = `multi_partner_idle_${this._partnerSkinId}`;
        if (!this.anims.exists(animKey)) {
          this.anims.create({
            key: animKey,
            frames: this.anims.generateFrameNumbers(skinKey, { start: 0, end: 3 }),
            frameRate: 5, repeat: -1,
          });
        }
        partnerSprite.play(animKey);
      }
      const pNameTxt = this.add.text(partnerX, heroY + P(56), this._partnerNick || '?', {
        fontSize: F(13), fontStyle: 'bold', color: '#88ccff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 1);
      this.roomOverlayObjs.push(pNameTxt);
      const pLvTxt = this.add.text(partnerX, heroY + P(70), `Lv.${this._partnerLevel || 1}`, {
        fontSize: F(12), color: '#aaccff',
      }).setOrigin(0.5).setDepth(D + 1);
      this.roomOverlayObjs.push(pLvTxt);
    }

    // Guest overlay on battle button (blocks 出戰)
    if (!NetworkService.isHost) {
      const BTN_W = P(88);
      const BTN_H = P(52);
      const bcy = H - BOTTOM_H / 2;
      const overlayGfx = this.add.graphics().setDepth(28);
      this.roomOverlayObjs.push(overlayGfx);
      overlayGfx.fillStyle(0x000000, 0.7);
      overlayGfx.fillRoundedRect(cx - BTN_W / 2, bcy - BTN_H / 2, BTN_W, BTN_H, P(14));
      const waitTxt = this.add.text(cx, bcy, '等待房主', {
        fontSize: F(15), fontStyle: 'bold', color: '#886644', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(29);
      this.roomOverlayObjs.push(waitTxt);
      // Intercept clicks on the button area
      const blocker = this.add.rectangle(cx, bcy, BTN_W, BTN_H)
        .setInteractive().setDepth(30);
      this.roomOverlayObjs.push(blocker);
    }
  }

  // ── Town world ───────────────────────────────────────────────────────────

  private createTownWorld(W: number, H: number): void {
    // BOTTOM_H from global constant
    const VIEW_Y   = TOP_H;
    const VIEW_W   = W;
    const VIEW_H   = H - TOP_H - BOTTOM_H;
    this._townViewW = VIEW_W;
    this._townViewH = VIEW_H;
    this._townViewY = VIEW_Y;
    this._heroY     = VIEW_Y + VIEW_H / 2;

    // Container for all scrollable world objects, clipped to viewport
    this._townContainer = this.add.container(0, VIEW_Y).setDepth(2);
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(0, VIEW_Y, VIEW_W, VIEW_H);
    this._townContainer.setMask(maskGfx.createGeometryMask());

    const VW = VIEW_W, VH = VIEW_H;
    const WW = Math.round(VW * 1.3), WH = Math.round(VH * 1.8);
    this._townWorldW = WW;
    this._townWorldH = WH;

    // Ground
    this._drawTownGround(WW, WH);
    this._createForestBorder(WW, WH);
    this._createTownStumps(WW, WH);

    // Local player (spawns at world centre)
    this._createTownLocalPlayer(WW, WH);

    // Input
    if (this.input.keyboard) {
      this._townCursors  = this.input.keyboard.createCursorKeys();
    }

    // D-pad for mobile
    this._createTownDpad(H, VIEW_Y, VIEW_H);

    // World interactive objects
    this._createTownObjects(WW, WH);

    // Interaction prompt (bottom-center of viewport)
    this._townInteractLabel = this.add.text(W / 2, VIEW_Y + VIEW_H - P(12), '', {
      fontSize: F(15), color: '#ffffa0', stroke: '#1a0800', strokeThickness: 2,
      backgroundColor: '#00000099', padding: { x: P(8), y: P(3) },
    }).setOrigin(0.5, 1).setDepth(55).setVisible(false);

    // Party create button (bottom-right)
    this._buildPartyCreateBtn(W, H);

    // Join TownRoom (non-blocking)
    this._joinTownRoom();

    // Decorative animals
    this._createAnimalAnims();
    this._spawnTownAnimals(WW, WH);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      NetworkService.leaveTown();
      this._townRemotePlayers.forEach(r => { r.sprite.destroy(); r.nameLabel.destroy(); });
      this._townRemotePlayers.clear();
      this._townZones = [];
      this._townAnimals.forEach(a => a.sprite.destroy());
      this._townAnimals = [];
    });
  }

  private _drawTownGround(WW: number, WH: number): void {
    // ── Layer 1: grass base (single tileSprite, very cheap) ──────────────────
    if (this.textures.exists('tile_grass')) {
      this.textures.get('tile_grass').setFilter(Phaser.Textures.FilterMode.NEAREST);
      this._townContainer?.add(
        this.add.tileSprite(0, 0, WW, WH, 'tile_grass')
          .setOrigin(0, 0).setTileScale(DPR, DPR).setDepth(1),
      );
    }
    if (!this.textures.exists('tileset_fields')) return;
    this.textures.get('tileset_fields').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // ── Autotile frame pools (0-indexed: FieldsTile_XX → frame XX-1) ─────────
    // Bitmask: N=8  S=4  W=2  E=1  (bit set = that neighbour is grass)
    const POOL: Record<number, number[]> = {
      0b0000: [0, 10, 17, 19, 26],    // interior cobble
      0b1000: [6, 33, 34, 35, 36],    // grass N  (top edge)
      0b0100: [1,  2,  3],            // grass S  (bottom edge)
      0b0010: [12, 20, 28],           // grass W  (left edge)
      0b0001: [8,  16, 24],           // grass E  (right edge)
      0b1010: [5,  9],                // grass N+W (TL outer corner)
      0b1001: [7,  11],               // grass N+E (TR outer corner)
      0b0110: [21, 25],               // grass S+W (BL outer corner)
      0b0101: [23, 27],               // grass S+E (BR outer corner)
      0b1100: [29, 30, 38],           // grass N+S (thin vertical path)
      0b0011: [31, 39],               // grass E+W (thin horizontal path)
      0b1110: [40],                   // grass N+S+W (cobble E only)
      0b1101: [41],                   // grass N+S+E (cobble W only)
      0b1011: [42],                   // grass N+E+W (cobble S only)
      0b0111: [43],                   // grass S+E+W (cobble N only)
      0b1111: [46],                   // isolated single tile
    };

    const TS    = Math.round(32 * DPR);
    const COLS  = Math.ceil(WW / TS);
    const ROWS  = Math.ceil(WH / TS);

    // ── Build cobblestone grid ────────────────────────────────────────────────
    const grid = new Uint8Array(COLS * ROWS);
    const fill = (xf: number, yf: number, wf: number, hf: number) => {
      const c0 = Math.floor(xf * COLS), c1 = Math.ceil((xf + wf) * COLS);
      const r0 = Math.floor(yf * ROWS), r1 = Math.ceil((yf + hf) * ROWS);
      for (let r = Math.max(0, r0); r < Math.min(ROWS, r1); r++)
        for (let c = Math.max(0, c0); c < Math.min(COLS, c1); c++)
          grid[r * COLS + c] = 1;
    };

    // ── Road network ─────────────────────────────────────────────────────────
    // Road widths in tiles so they stay consistent across screen sizes
    const rW = TS / WW;   // 1 tile as fraction of WW
    const rH = TS / WH;   // 1 tile as fraction of WH
    const R  = 2.0;        // main road width (tiles) — 2 guarantees ≥2 rows/cols regardless of yf alignment

    fill(0.42, 0.00, rW * R, 0.93);      // V_main: N-S spine (gate → 出戰 → spawn → 造型)

    fill(0.20, 0.28, 0.24, rH * R);      // H_warehouse: → 倉庫  (xf=0.23, yf=0.30)
    fill(0.42, 0.50, 0.28, rH * R);      // H_forge:     → 鍛造  (xf=0.65, yf=0.50)
    fill(0.18, 0.65, 0.26, rH * R);      // H_shop:      → 商店  (xf=0.33, yf=0.65)

    // ── Stamp tiles into a single RenderTexture (drawn once, then static) ─────
    const rt = this.add.renderTexture(0, 0, WW, WH).setOrigin(0, 0).setDepth(2);
    const stamper = this.add.image(0, 0, 'tileset_fields', 0)
      .setScale(DPR).setOrigin(0, 0).setVisible(false);

    const isC = (r: number, c: number) =>
      r >= 0 && r < ROWS && c >= 0 && c < COLS && grid[r * COLS + c] === 1;

    rt.beginDraw();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isC(r, c)) continue;
        const mask =
          (isC(r - 1, c) ? 0 : 8) |
          (isC(r + 1, c) ? 0 : 4) |
          (isC(r, c - 1) ? 0 : 2) |
          (isC(r, c + 1) ? 0 : 1);
        const pool  = POOL[mask] ?? POOL[0b0000];
        const frame = pool[(r * 7 + c * 13) % pool.length];
        stamper.setFrame(frame).setPosition(c * TS, r * TS);
        rt.batchDraw(stamper);
      }
    }
    rt.endDraw();

    stamper.destroy();
    this._townContainer?.add(rt);

    // ── Scatter decorations on grass tiles ───────────────────────────────────
    this._townStoneRects = [];
    // keep a 3-tile clear zone around the player spawn (world centre)
    const spawnC = Math.round(COLS / 2), spawnR = Math.round(ROWS / 2);

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isC(r, c)) continue;
        // no decorations within 3 tiles of spawn
        if (Math.abs(c - spawnC) <= 3 && Math.abs(r - spawnR) <= 3) continue;

        const wx = c * TS + TS / 2;
        const wy = r * TS + TS / 2;
        const h1 = (r * 1619 + c * 3167 + r * c * 7)   % 100;
        const h2 = (r * 2311 + c * 1447 + r * c * 13)  % 100;
        const h3 = (r * 3571 + c * 2741 + r * c * 17)  % 100;

        // stones ~6 % (decorative only, no collision)
        if (h1 < 6) {
          const n = h2 % 6 + 1;
          const key = `deco_stone${n}`;
          if (this.textures.exists(key)) {
            this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
            this._townContainer?.add(
              this.add.image(wx, wy, key).setScale(DPR).setOrigin(0.5, 1).setDepth(3),
            );
          }
          continue;
        }

        // flowers ~10 %
        if (h2 < 10) {
          const n = h3 % 12 + 1;
          const key = `deco_flower${n}`;
          if (this.textures.exists(key)) {
            this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
            this._townContainer?.add(
              this.add.image(wx, wy, key).setScale(DPR).setOrigin(0.5, 1).setDepth(3),
            );
          }
          continue;
        }

        // grass tufts ~15 %
        if (h3 < 15) {
          const n = (r * 13 + c * 7) % 6 + 1;
          const key = `deco_grass${n}`;
          if (this.textures.exists(key)) {
            this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
            this._townContainer?.add(
              this.add.image(wx, wy, key).setScale(DPR).setOrigin(0.5, 1).setDepth(3),
            );
          }
        }
      }
    }
  }

  private _createTownLocalPlayer(WW: number, WH: number): void {
    const mk = (key: string, tex: string, s: number, e: number, rate: number) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start: s, end: e }), frameRate: rate, repeat: -1 });
    };
    mk('player_idle_down',  'player_idle_shadow', 0,  3,  8);
    mk('player_idle_left',  'player_idle_shadow', 12, 15, 8);
    mk('player_idle_right', 'player_idle_shadow', 24, 27, 8);
    mk('player_idle_up',    'player_idle_shadow', 36, 39, 8);
    if (this.textures.exists('player_run_shadow')) {
      mk('player_run_down',  'player_run_shadow', 0,  7,  10);
      mk('player_run_left',  'player_run_shadow', 8,  15, 10);
      mk('player_run_right', 'player_run_shadow', 16, 23, 10);
      mk('player_run_up',    'player_run_shadow', 24, 31, 10);
    }

    this._townPlayerX = WW * 0.50;
    this._townPlayerY = WH * 0.50;

    this.textures.get('player_idle_shadow').setFilter(Phaser.Textures.FilterMode.NEAREST);
    this._townPlayer = this.add.sprite(this._townPlayerX, this._townPlayerY, 'player_idle_shadow', 0)
      .setScale(1.5 * DPR).setDepth(10);
    this._townPlayer.play('player_idle_down');
    this._townContainer?.add(this._townPlayer);

    this._townLocalNameLabel = this.add.text(this._townPlayerX, this._townPlayerY - P(28), getPlayerName(), {
      fontSize: F(11), color: '#ffffff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(11);
    this._townContainer?.add(this._townLocalNameLabel);

    this._townPlayerDebug = this.add.graphics().setDepth(999);
    this._townContainer?.add(this._townPlayerDebug);
  }

  private _createTownDpad(_H: number, _VIEW_Y: number, _VIEW_H: number): void {
    this._townJoystick = new VirtualJoystick(this);
  }

  private _createForestBorder(WW: number, WH: number): void {
    if (!this.textures.exists('tree_oak')) return;
    const TS   = Math.round(32 * DPR);
    const STEP = Math.round(TS * 1.5);
    const EDGE = Math.round(TS * 0.6);

    const gateX  = WW * 0.44;
    const gateHW = TS * 1.2;

    // Deterministic pseudo-random from world position + salt
    const rng = (x: number, y: number, s: number) =>
      Math.abs((Math.sin(x * 127.1 + y * 311.7 + s * 74.3) * 43758.5453) % 1);

    const place = (bx: number, by: number, isBottom = false, depthCap = Infinity) => {
      // Random positional jitter
      const px = bx + (rng(bx, by, 1) - 0.5) * STEP * 0.65;
      const py = by + (rng(bx, by, 2) - 0.5) * STEP * 0.45;
      // Random scale ±15%
      const sc = 1.0 + (rng(bx, by, 3) - 0.5) * 0.3;
      // Float depth: random within ±0.7 of y-based tier so same-row trees overlap
      // chaotically, while trees one STEP further south (Δ=1.5 tiers) always win.
      const depth = Math.min(4 + py / TS + (rng(bx, by, 4) - 0.5) * 1.4, depthCap);

      if (this.textures.exists('tree_shadow')) {
        this._townContainer?.add(
          this.add.image(px + TS * 0.1, py - TS * 0.1, 'tree_shadow')
            .setScale(DPR * sc).setOrigin(0.5, 0.5).setDepth(2).setAlpha(0.45),
        );
      }
      // Bottom-row trees: origin 0.35 so trunk extends below world boundary (masked),
      // only the canopy remains visible
      const originY = isBottom ? 0.35 : 1;
      this._townContainer?.add(
        this.add.image(px, py, 'tree_oak')
          .setScale(DPR * sc * 1.2).setOrigin(0.5, originY).setDepth(depth),
      );
    };

    const BOTTOM_Y = WH - EDGE * 0.2;
    // Max depth the bottom row can reach (used to cap side-tree depth at bottom)
    const bottomDepthCap = 4 + Math.floor(BOTTOM_Y / TS) + 3;

    // Top edge — gate gap for 出戰 exit; depth capped so trees never cover player
    for (let x = -STEP / 2; x <= WW + STEP / 2; x += STEP) {
      if (Math.abs(x - gateX) < gateHW) continue;
      place(x, EDGE + TS * 0.5, false, 4.5);
    }

    // Bottom edge — fully filled (no gate)
    for (let x = -STEP / 2; x <= WW + STEP / 2; x += STEP)
      place(x, BOTTOM_Y, true);

    // Left/right edges — extend one extra step past the bottom row for corner coverage;
    // trees below BOTTOM_Y use isBottom origin and are depth-capped so they don't
    // render on top of the bottom-row trees
    const placeSide = (bx: number, by: number) => {
      const isBot = by >= BOTTOM_Y - STEP * 0.5;
      const bxOrig = bx, byOrig = by;
      const px = bx + (rng(bx, by, 1) - 0.5) * STEP * 0.65;
      const py = by + (rng(bx, by, 2) - 0.5) * STEP * 0.45;
      const sc = 1.0 + (rng(bxOrig, byOrig, 3) - 0.5) * 0.3;
      const rawDepth = 4 + py / TS + (rng(bxOrig, byOrig, 4) - 0.5) * 1.4;
      const depth = isBot ? Math.min(rawDepth, bottomDepthCap) : rawDepth;
      if (this.textures.exists('tree_shadow')) {
        this._townContainer?.add(
          this.add.image(px + TS * 0.1, py - TS * 0.1, 'tree_shadow')
            .setScale(DPR * sc).setOrigin(0.5, 0.5).setDepth(2).setAlpha(0.45),
        );
      }
      const originY = isBot ? 0.35 : 1;
      this._townContainer?.add(
        this.add.image(px, py, 'tree_oak')
          .setScale(DPR * sc * 1.2).setOrigin(0.5, originY).setDepth(depth),
      );
    };

    for (let y = STEP; y <= BOTTOM_Y + STEP; y += STEP)
      placeSide(EDGE * 0.5, y);
    placeSide(EDGE * 0.5, BOTTOM_Y + STEP * 0.6);
    // Corner fill: 2 trees to bridge gap between side column and bottom row
    place(EDGE * 0.5,  BOTTOM_Y, true);
    place(STEP * 0.35, BOTTOM_Y, true);

    for (let y = STEP; y <= BOTTOM_Y + STEP; y += STEP)
      placeSide(WW - EDGE * 0.5, y);
    place(WW - EDGE * 0.5,  BOTTOM_Y, true);
    place(WW - STEP * 0.35, BOTTOM_Y, true);

    // Top wall collision — two rects either side of the gate gap
    const wallY  = EDGE + TS * 0.5;
    const wallH  = TS * 1.2;  // collision thickness
    const leftW  = gateX - gateHW;
    const rightW = WW - (gateX + gateHW);
    if (leftW > 0)
      this._townBuildingRects.push({ cx: leftW / 2, cy: wallY, hw: leftW / 2, hh: wallH / 2 });
    if (rightW > 0)
      this._townBuildingRects.push({ cx: gateX + gateHW + rightW / 2, cy: wallY, hw: rightW / 2, hh: wallH / 2 });

    // Bottom wall collision — full-width block behind bottom tree row
    this._townBuildingRects.push({ cx: WW / 2, cy: BOTTOM_Y, hw: WW / 2, hh: TS * 0.8 });

    // Path trees — flank the entrance corridor from gate down to 出戰 building
    const PATH_END_Y = WH * 0.30;         // ↓ 調這裡：停在建築前多高
    const PATH_L_X   = gateX - gateHW * 2.2;  // ↓ 調這裡：左排 x
    const PATH_R_X   = gateX + gateHW * 2.8;  // ↓ 調這裡：右排 x
    const PCW = P(20), PCH = P(12); // path tree collision size (same as stumps)
    const placePathTree = (bx: number, by: number) => {
      place(bx, by, false);
      this._townBuildingRects.push({ cx: bx, cy: by - PCH / 2, hw: PCW / 2, hh: PCH / 2 });
    };

    let li = 0;
    for (let y = EDGE + STEP * 1.2; y < PATH_END_Y; y += STEP, li++)
      if (li !== 2) placePathTree(PATH_L_X, y);
    let ri = 0, rCount = 0;
    for (let y = EDGE + STEP * 1.2; y < PATH_END_Y; y += STEP) rCount++;
    for (let y = EDGE + STEP * 1.2; y < PATH_END_Y; y += STEP, ri++)
      if (ri !== rCount - 1) placePathTree(PATH_R_X, y);
  }

  private _createTownStumps(WW: number, WH: number): void {
    if (!this.textures.exists('deco_stump')) return;
    this.textures.get('deco_stump').setFilter(Phaser.Textures.FilterMode.NEAREST);

    // ↓ 調這裡：每棵樹墩的位置 (xf, yf)，避開道路和建築
    const STUMPS: { xf: number; yf: number }[] = [
      { xf: 0.14, yf: 0.42 },
      { xf: 0.78, yf: 0.32 },
      { xf: 0.12, yf: 0.78 },
      { xf: 0.72, yf: 0.72 },
      { xf: 0.26, yf: 0.88 },
    ];

    const CW = P(31), CH = P(19); // collision box half-width / half-height × 2 ← adjust here

    for (const s of STUMPS) {
      const sx = WW * s.xf, sy = WH * s.yf;
      const depth = 4 + sy / Math.round(32 * DPR) + 0.3;
      if (this.textures.exists('deco_stump_shadow'))
        this._townContainer?.add(
          this.add.image(sx, sy - P(8), 'deco_stump_shadow')
            .setScale(DPR * 1.2).setOrigin(0.5, 0.5).setAlpha(0.5).setDepth(2),
        );
      this._townContainer?.add(
        this.add.image(sx, sy, 'deco_stump')
          .setScale(DPR * 1.2).setOrigin(0.5, 1).setDepth(depth),
      );
      this._townBuildingRects.push({ cx: sx, cy: sy - CH / 2, hw: CW / 2, hh: CH / 2 });

    }
  }

  private _createTownObjects(WW: number, WH: number): void {
    const W = this._sceneW, H = this.scale.height;
    const TS = Math.round(32 * DPR);

    // Extract ritual circle frame from TX Props / TX Shadow spritesheets
    // Adjust crop coords if sprite doesn't align perfectly
    if (this.textures.exists('tx_props') && !this.textures.get('tx_props').has('ritual_circle')) {
      this.textures.get('tx_props').add('ritual_circle', 0, 350, 263, 108, 100);
    }
    if (this.textures.exists('tx_props') && !this.textures.get('tx_props').has('stone_pillar')) {
      this.textures.get('tx_props').add('stone_pillar', 0, 227, 91, 38, 66);
    }
    if (this.textures.exists('tx_shadow') && !this.textures.get('tx_shadow').has('ritual_circle_shadow')) {
      this.textures.get('tx_shadow').add('ritual_circle_shadow', 0, 335, 253, 120, 90);
    }

    const objs: Array<{
      xf: number; yf: number;
      icon: string; label: string; color: number;
      buildingKey?: string; buildingFrame?: string;
      tapW?: number; tapH?: number;
      collW?: number; collH?: number;  // collision rect size (defaults to tapW/tapH)
      buildingScale?: number;
      tent?: boolean;
      shadow?: boolean;
      shadowKey?: string; shadowFrame?: string;
      shadowOX?: number; shadowOY?: number;
      animKey?: string;
      labelBelow?: boolean; labelOX?: number;
      decoKey?: string; decoOX?: number; decoOY?: number; decoScale?: number;
      debugBox?: boolean;
      onActivate: () => void;
    }> = [
      { xf: 0.45, yf: 0.20, icon: '⚔', label: '出戰',  color: 0xcc4400, buildingKey: 'building_battle',
        tapW: P(80), tapH: P(72), collW: P(120), collH: P(55), shadow: true, buildingScale: 1.4, labelBelow: true, onActivate: () => {
          if (this._partyState === 'in_party' && !this._amPartyLeader) { this._showToast('你不是隊長'); return; }
          this._showTutorialHint('quest', '⚔', '選擇關卡',
            '星數越高，掉落品質越好但難度也越高。\n每個關卡有種族屬性，搭配對應的技能或卡片可獲得大幅加成！',
            () => this.showQuestPanel(W, H));
        } },
      { xf: 0.33, yf: 0.65, icon: '✦', label: '商店',  color: 0xd47820, buildingKey: 'building_shop',
        tapW: P(80), tapH: P(72), collW: P(130), collH: P(55), tent: true, onActivate: () => {
          AudioService.playSfx(this, 'sfx_shop_open', 0.7);
          this._showTutorialHint('shop', '✦', '商店',
            '用金幣購買藥水補充戰鬥用品，或購買強化石來提升裝備的精煉等級。',
            () => this.showShopPanel(W, H));
        } },
      { xf: 0.78, yf: 0.65, icon: '', label: '祭祀台', color: 0xffdd44, buildingKey: 'tx_props', buildingFrame: 'ritual_circle',
        tapW: P(110), tapH: P(100), collW: P(130), collH: P(60), buildingScale: 0.85,
        shadow: true, shadowKey: 'tx_shadow', shadowFrame: 'ritual_circle_shadow', shadowOX: P(-8), shadowOY: P(-12),
        onActivate: () => this._showTutorialHint('altar', '🔮', '祭祀台',
          '擊敗 5 星BOSS，有機率獲得特殊門票，即可挑戰傳說級BOSS取得傳說裝備',
          () => this._showAltarPanel(W, H)) },
      { xf: 0.60, yf: 0.49, icon: '★', label: '排行榜', color: 0xaabbdd, buildingKey: 'tx_props', buildingFrame: 'stone_pillar',
        tapW: P(40), tapH: P(90), collW: P(44), collH: P(30), buildingScale: 0.8, labelOX: -P(8),
        onActivate: () => this._showTutorialHint('ranking', '★', '排行榜',
          '查看所有玩家的等級排名。努力提升，爭取登上榜首！',
          () => this._showRankingPanel(W, H)) },
      { xf: 0.23, yf: 0.30, icon: '⊕', label: '市場',  color: 0x70b858, buildingKey: 'building_warehouse',
        tapW: P(80), tapH: P(60), collW: P(85), collH: P(20), buildingScale: 1.4,
        shadow: true, shadowKey: 'deco_shadow5', shadowOX: P(0), shadowOY: P(10),
        decoKey: 'deco_warehouse_box', decoOX: P(10), decoOY: P(0), decoScale: 1.2,
        onActivate: () => this._showTutorialHint('market', '⊕', '市場',
          '市場可以與其他玩家進行裝備/道具/卡片的買賣！',
          () => (window as any).__openMarket?.()) },
      { xf: 0.45, yf: 0.90, icon: '✧', label: '造型',  color: 0xdd88aa, animKey: 'campfire',
        tapW: P(48), tapH: P(40), collW: P(48), collH: P(20), onActivate: () =>
          this._showTutorialHint('wardrobe', '✧', '更換造型',
            '選擇你喜歡的角色外觀。更換造型完全免費，且不影響任何戰力！',
            () => this._openWardrobePanel()) },
    ];

    for (const obj of objs) {
      const wx = WW * obj.xf;
      const wy = WH * obj.yf;
      const PAD_W = P(64), PAD_H = P(26);
      const colorHex = `#${obj.color.toString(16).padStart(6, '0')}`;

      if (obj.buildingKey && this.textures.exists(obj.buildingKey)) {
        // Building sprite — depth = base Y so player sorts correctly by feet position
        const bDepth = 4 + wy / TS;
        const bImg = this.add.image(wx, wy, obj.buildingKey, obj.buildingFrame)
          .setScale(DPR * (obj.buildingScale ?? 1.4)).setOrigin(0.5, 1).setDepth(bDepth)
          .setInteractive({ useHandCursor: true })
          .on('pointerdown', () => AudioService.suppressClickSfx())
          .on('pointerup', (p: Phaser.Input.Pointer, _lx: any, _ly: any, ev: any) => {
            ev?.stopPropagation?.();
            if (!this._townJoystick?.ownsPointer(p.id)) obj.onActivate();
          });

        // Collision rect (red debug box — adjust collW/collH to fit)
        const cW = obj.collW ?? (obj.tapW ?? PAD_W + P(20));
        const cH = obj.collH ?? (obj.tapH ?? PAD_H + P(40));
        const cCX = wx, cCY = wy - cH / 2;
        this._townBuildingRects.push({ cx: cCX, cy: cCY, hw: cW / 2, hh: cH / 2 });

        // Building shadow — adjust shadowOX/shadowOY in the zone entry to reposition
        const _shadowTex = obj.shadowKey ?? 'deco_tent_shadow';
        if (obj.shadow && this.textures.exists(_shadowTex)) {
          const sox = obj.shadowOX ?? P(0), soy = obj.shadowOY ?? P(10);
          this._townContainer?.add(
            this.add.image(wx + sox, wy + soy, _shadowTex, obj.shadowFrame)
              .setScale(DPR * (obj.buildingScale ?? 1.4)).setOrigin(0.5, 1).setAlpha(0.5).setDepth(2),
          );
        }

        this._townContainer?.add(bImg);

        // Secondary deco image (e.g. box in front of warehouse tent)
        // ↓ 調 decoOX/decoOY/decoScale 在 zone entry
        if (obj.decoKey && this.textures.exists(obj.decoKey)) {
          const dox = obj.decoOX ?? P(0), doy = obj.decoOY ?? P(0);
          const dsc = obj.decoScale ?? 1.2;
          this._townContainer?.add(
            this.add.image(wx + dox, wy + doy, obj.decoKey)
              .setScale(DPR * dsc).setOrigin(0.5, 1).setDepth(bDepth + 0.01),
          );
        }

        if (obj.debugBox) {
          const dbg = this.add.graphics().setDepth(20);
          dbg.lineStyle(2, 0xff0000, 1);
          dbg.strokeRect(cCX - cW / 2, cCY - cH / 2, cW, cH);
          this._townContainer?.add(dbg);
        }

        // Tent — placed to the left of the building
        // ↓ 調這裡：位置 OX/OY，碰撞框 TCW(寬) TCH(高) TCOX/TCOY(框中心偏移)
        if (obj.tent && this.textures.exists('deco_tent')) {
          const TENT_OX = -P(100), TENT_OY = P(0);
          const TCW = P(70),  TCH = P(15);   // collision half-width / half-height × 2
          const TCOX = P(0),  TCOY = P(0);   // collision center offset from tent base

          const tx = wx + TENT_OX, ty = wy + TENT_OY;

          // Shadow — adjust SHADOW_OX/SHADOW_OY to reposition
          if (this.textures.exists('deco_tent_shadow')) {
            const SHADOW_OX = P(0), SHADOW_OY = P(6);
            this._townContainer?.add(
              this.add.image(tx + SHADOW_OX, ty + SHADOW_OY, 'deco_tent_shadow')
                .setScale(DPR * 1.1).setOrigin(0.5, 1).setAlpha(0.5).setDepth(2),
            );
          }

          const tentImg = this.add.image(tx, ty, 'deco_tent')
            .setScale(DPR * 1.1).setOrigin(0.5, 1)
            .setDepth(bDepth - 0.000001);
          this._townContainer?.add(tentImg);

          // Collision rect
          const tCX = tx + TCOX, tCY = ty - TCH / 2 + TCOY;
          this._townBuildingRects.push({ cx: tCX, cy: tCY, hw: TCW / 2, hh: TCH / 2 });

        }

        // Sign label — above or below building
        const signY = obj.labelBelow ? wy - P(22) : wy - bImg.displayHeight - P(4);
        const signTxt = this.add.text(wx + (obj.labelOX ?? 0), signY, obj.label, {
          fontSize: F(15), fontStyle: 'bold',
          color: colorHex, stroke: '#1a0800', strokeThickness: 2,
          backgroundColor: '#00000088',
          padding: { x: P(6), y: P(3) },
        }).setOrigin(0.5, obj.labelBelow ? 0 : 1).setDepth(obj.labelBelow ? 3 : bDepth + 1);
        this._townContainer?.add(signTxt);
      } else if (obj.animKey && this.textures.exists(obj.animKey)) {
        // Animated sprite (e.g. campfire)
        const aDepth = 4 + wy / TS;
        const animSprite = this.add.sprite(wx, wy, obj.animKey)
          .setScale(DPR * 2).setOrigin(0.5, 1).setDepth(aDepth)
          .setInteractive({ useHandCursor: true })
          .on('pointerup', (p: Phaser.Input.Pointer, _lx: any, _ly: any, ev: any) => {
            ev?.stopPropagation?.();
            if (!this._townJoystick?.ownsPointer(p.id)) obj.onActivate();
          });
        const animKey = obj.animKey + '_anim';
        if (!this.anims.exists(animKey))
          this.anims.create({ key: animKey, frames: this.anims.generateFrameNumbers(obj.animKey, { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
        animSprite.play(animKey);
        this._townContainer?.add(animSprite);

        // Collision rect
        const cW = obj.collW ?? P(40), cH = obj.collH ?? P(20);
        this._townBuildingRects.push({ cx: wx, cy: wy - cH / 2, hw: cW / 2, hh: cH / 2 });

        if (obj.debugBox) {
          const dbg = this.add.graphics().setDepth(20);
          dbg.lineStyle(2, 0xff0000, 1);
          dbg.strokeRect(wx - cW / 2, wy - cH, cW, cH);
          this._townContainer?.add(dbg);
        }

        // Label above sprite
        const signTxtA = this.add.text(wx, wy - animSprite.displayHeight - P(4), obj.label, {
          fontSize: F(15), fontStyle: 'bold',
          color: colorHex, stroke: '#1a0800', strokeThickness: 2,
          backgroundColor: '#00000088', padding: { x: P(6), y: P(3) },
        }).setOrigin(0.5, 1).setDepth(aDepth + 1);
        this._townContainer?.add(signTxtA);
      } else {
        // Platform
        const padGfx = this.add.graphics().setDepth(5);
        padGfx.fillStyle(0x000000, 0.40);
        padGfx.fillRoundedRect(wx - PAD_W / 2 + P(2), wy - PAD_H / 2 + P(2), PAD_W, PAD_H, P(6));
        padGfx.fillStyle(WD, 1);
        padGfx.fillRoundedRect(wx - PAD_W / 2, wy - PAD_H / 2, PAD_W, PAD_H, P(6));
        padGfx.lineStyle(2, obj.color, 0.85);
        padGfx.strokeRoundedRect(wx - PAD_W / 2, wy - PAD_H / 2, PAD_W, PAD_H, P(6));
        this._townContainer?.add(padGfx);

        // Icon above platform
        const iconTxt = this.add.text(wx, wy - PAD_H / 2 - P(20), obj.icon, {
          fontSize: F(22), color: colorHex, stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(6);
        this._townContainer?.add(iconTxt);

        // Name label inside platform
        const nameTxt = this.add.text(wx, wy, obj.label, {
          fontSize: F(15), fontStyle: 'bold',
          color: '#ffe8b0', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(6);
        this._townContainer?.add(nameTxt);
      }

    }
  }

  private _applySkin(skinId: number): void {
    const idleTex = `skin_preview_${skinId}`;
    const runTex  = `skin_run_preview_${skinId}`;
    if (!this.textures.exists(idleTex)) return;

    // Redefine player animations to use the new skin's pre-loaded textures
    const animDefs: [string, string, number, number, number][] = [
      ['player_idle_down',  idleTex, 0,  3,  8],
      ['player_idle_left',  idleTex, 12, 15, 8],
      ['player_idle_right', idleTex, 24, 27, 8],
      ['player_idle_up',    idleTex, 36, 39, 8],
      ['player_run_down',   runTex,  0,  7,  10],
      ['player_run_left',   runTex,  8,  15, 10],
      ['player_run_right',  runTex,  16, 23, 10],
      ['player_run_up',     runTex,  24, 31, 10],
    ];
    animDefs.forEach(([key, tex, s, e, rate]) => {
      if (!this.textures.exists(tex)) return;
      if (this.anims.exists(key)) this.anims.remove(key);
      this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start: s, end: e }), frameRate: rate, repeat: -1 });
    });

    // Swap the local player sprite to the new skin texture
    if (this._townPlayer) {
      this._townPlayer.setTexture(idleTex, 0);
      this._townPlayer.play(`player_idle_${this._townPlayerDir}`, true);
    }

    // Notify town and game room of new skin
    NetworkService.sendTownInfo(getPlayerName(), PlayerStore.getLevel(), skinId);
    if (NetworkService.connected) NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), skinId);
  }

  private _joinTownRoom(): void {
    console.log('[Town] joining town room...');
    NetworkService.joinTown().then(payload => {
      console.log('[Town] joined, sessionId=', payload.sessionId, 'existing=', payload.existing?.length);
      if (!this.scene.isActive()) return;
      NetworkService.sendTownInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
      NetworkService.onTownDisconnected(() => {
        console.warn('[Town] disconnected unexpectedly, retrying in 15s...');
        this._townRemotePlayers.forEach(r => { r.sprite.destroy(); r.nameLabel.destroy(); });
        this._townRemotePlayers.clear();
        this.time.delayedCall(15000, () => {
          if (this.scene.isActive()) this._joinTownRoom();
        });
      });

      NetworkService.onTownPos(data => {
        const r = this._townRemotePlayers.get(data.sessionId);
        if (!r) return;
        r.fromX = r.sprite.x;
        r.fromY = r.sprite.y;
        r.targetX = data.x * this._townWorldW;
        r.targetY = data.y * this._townWorldH;
        r.lerpT = 0;
        r.lerpDur = 110;
        const sk = (r.sprite as any).__skinId ?? 0;
        const runKey  = `town_remote_run_${sk}_${data.lastDir}`;
        const idleKey = `town_remote_idle_${sk}_${data.lastDir}`;
        if (this.anims.exists(runKey)) r.sprite.play(runKey, true);
        clearTimeout((r.sprite as any).__idleTimer);
        (r.sprite as any).__idleTimer = setTimeout(() => {
          if (!r.sprite.active) return;
          if (this.anims.exists(idleKey)) r.sprite.play(idleKey, true);
        }, 400);
      });

      NetworkService.onTownPlayerJoined(data => {
        if (data.sessionId === NetworkService.townSessionId) return;
        this._spawnTownRemotePlayer(data.sessionId, data.x, data.y, data.lastDir, data.nickname, data.level, data.skinId);
      });

      NetworkService.onTownPlayerLeft(data => {
        const r = this._townRemotePlayers.get(data.sessionId);
        if (!r) return;
        r.sprite.destroy(); r.nameLabel.destroy();
        this._townRemotePlayers.delete(data.sessionId);
        // If all others left, reclaim host role
        if (!this._isAnimalHost && this._townRemotePlayers.size === 0)
          this._isAnimalHost = true;
      });

      NetworkService.onTownPlayerInfo(data => {
        const r = this._townRemotePlayers.get(data.sessionId);
        if (r) { r.nameLabel.setText(data.nickname || '?'); r.level = data.level ?? r.level; }
      });

      payload.existing?.forEach((p: any) =>
        this._spawnTownRemotePlayer(p.sessionId, p.x, p.y, p.lastDir, p.nickname, p.level, p.skinId),
      );

      // Animal host: first player in room; others receive sync from host
      this._isAnimalHost = !payload.existing?.length;
      NetworkService.onTownAnimal(data => {
        if (this._isAnimalHost) return;
        this._applyAnimalSync(data);
      });

      // ── Party invite callbacks ──────────────────────────────
      NetworkService.onPartyInvite(data => {
        if (this._partyState !== 'none') {
          NetworkService.sendPartyInviteResponse(false, data.fromSessionId);
          return;
        }
        this._pendingInviteRoomCode = data.roomCode;
        this._showInvitePopup(data.fromSessionId, data.fromNickname);
      });

      // Leader: a guest accepted — move from pending to confirmed
      NetworkService.onPartyAccepted(async data => {
        const pendingIdx = this._partyPendingInvites.findIndex(p => p.sid === data.guestSessionId);
        if (pendingIdx >= 0) {
          const pending = this._partyPendingInvites[pendingIdx];
          this._partyPendingInvites.splice(pendingIdx, 1);
          // onPartnerJoined may have already promoted this player (race: GameRoom WS faster than TownRoom WS).
          // Match by any known nickname variant to guard against label-update timing differences.
          const guestInfo = this._townRemotePlayers.get(data.guestSessionId);
          const labelNick = guestInfo?.nameLabel.text ?? '';
          const alreadyIn = this._partyMembers.find(
            m => m.nick === pending.nick || (labelNick && m.nick === labelNick),
          );
          if (!alreadyIn) {
            this._partyMembers.push({
              sid:   data.guestSessionId,
              nick:  labelNick || pending.nick,
              level: guestInfo?.level ?? 0,
            });
          }
          if (this._partyState === 'open') this._partyState = 'in_party';
          this._buildPartyPanel();
        }
      });

      // Guest: accepted, join GameRoom directly using roomCode from the invite
      NetworkService.onPartyRoomCode(async data => {
        try {
          await NetworkService.joinRoom(data.roomCode, getPlayerName());
          NetworkService.partyMode = true;
          this._setupGameRoomCallbacks();
          NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
          this._partyState = 'in_party';
          this._amPartyLeader = false;
          this._buildPartyPanel();
        } catch { this._showToast('加入房間失敗'); }
      });

      NetworkService.onPartyDeclined(data => {
        // Remove the pending invite slot for the target that declined
        if (data.targetSessionId) {
          this._partyPendingInvites = this._partyPendingInvites.filter(p => p.sid !== data.targetSessionId);
          if (this._partyState === 'open' || this._partyState === 'in_party') this._buildPartyPanel();
        }
        this._showToast(
          data.reason === 'declined'  ? '對方拒絕了邀請' :
          data.reason === 'timeout'   ? '邀請逾時未回應' : '對方不在線上',
        );
      });

      NetworkService.onPartyCancelled(() => {
        this._clearInvitePopup();
        if (this._partyState !== 'none') {
          this._partyState = 'none';
          this._partyMembers = [];
          this._partyPendingInvites = [];
          this._destroyPartyPanel();
          NetworkService.disconnect();
          this._showToast('隊伍已解散');
          this._buildPartyCreateBtn(this._sceneW, this._sceneH);
        }
      });
    }).catch((err: any) => {
      console.warn('[Town] joinTown failed, retrying in 15s...', err);
      this.time.delayedCall(15000, () => {
        if (this.scene.isActive()) this._joinTownRoom();
      });
    });
  }

  // ── Party system ─────────────────────────────────────────────────────────

  private _setupGameRoomCallbacks(): void {
    NetworkService.onPartnerJoined(data => {
      if (data.sessionId && data.nickname) {
        // Match by sid first; fall back to nickname to handle town-sid → game-room-sid migration
        let m = this._partyMembers.find(m => m.sid === data.sessionId);
        if (!m) {
          m = this._partyMembers.find(pm => pm.nick === data.nickname);
          if (m) m.sid = data.sessionId; // migrate to game-room sid
        }
        if (m) {
          m.nick = data.nickname;
          if (data.level) m.level = data.level;
        } else {
          this._partyMembers.push({ sid: data.sessionId, nick: data.nickname, level: data.level ?? 0 });
        }
        // Leader: if this player is still in pending (race — partyAccepted not yet arrived),
        // skip rebuild now to avoid showing them in both sections simultaneously.
        // partyAccepted will clear pending and rebuild. For guests there is no partyAccepted,
        // so always rebuild.
        const stillPending = this._amPartyLeader &&
          this._partyPendingInvites.some(p => p.nick === data.nickname);
        if (!stillPending && this._partyState === 'in_party') this._buildPartyPanel();
      }
    });
    NetworkService.onPartnerLeft(() => {
      this._partyState = 'none';
      this._partyMembers = [];
      this._partyPendingInvites = [];
      this._destroyPartyPanel();
      NetworkService.disconnect();
      this._showToast('隊伍已解散');
      this._buildPartyCreateBtn(this._sceneW, this._sceneH);
    });
    NetworkService.onRoomClosed(() => {
      this._partyState = 'none';
      this._partyMembers = [];
      this._partyPendingInvites = [];
      this._destroyPartyPanel();
      NetworkService.disconnect();
      this._showToast('房間已關閉');
      this._buildPartyCreateBtn(this._sceneW, this._sceneH);
    });
    NetworkService.onGameStart(p => {
      NetworkService.clearLobbyCallbacks();
      if (NetworkService.isHost) {
        this.scene.start('BattleLoadScene', {
          seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
          mapParams: p.mapParams, partnerNickname: p.guestNickname,
          ownSkinId: p.hostSkinId, partnerSkinId: p.guestSkinId,
          playerCount: p.playerCount ?? 2, mapTheme: p.mapTheme,
        });
      } else {
        try { if (p.questId) QuestStore.acceptQuest(p.questId); } catch { /* guest */ }
        this.scene.start('BattleLoadScene', {
          seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
          mapParams: p.mapParams, partnerNickname: p.hostNickname,
          ownSkinId: p.guestSkinId, partnerSkinId: p.hostSkinId,
          playerCount: p.playerCount ?? 2, mapTheme: p.mapTheme,
        });
      }
    });
  }

  private _onTownPlayerClick(sessionId: string, nickname: string): void {
    const totalSlots = this._partyMembers.length + this._partyPendingInvites.length;
    const alreadyPending = this._partyPendingInvites.some(p => p.sid === sessionId);
    const alreadyMember  = this._partyMembers.some(m => m.sid === sessionId);

    if (this._partyState === 'none') return;

    // Party open/in_party — leader confirms then invites
    if (!this._amPartyLeader) return;
    if (alreadyMember)  { this._showToast('對方已是隊員'); return; }
    if (alreadyPending) { this._showToast('已送出邀請，等待回應中'); return; }
    if (totalSlots >= 2) { this._showToast('隊伍已滿'); return; }

    // Confirm popup
    this._invitePopupObjs.forEach(o => o.destroy());
    this._invitePopupObjs = [];

    const W = this._sceneW, H = this._sceneH;
    const PW = P(220), PH = P(80);
    const px = W / 2 - PW / 2, py = H / 2 - PH / 2;
    const D = 600;

    const bg = this.add.graphics().setDepth(D);
    bg.fillStyle(0x1a1200, 0.95);
    bg.fillRoundedRect(px, py, PW, PH, P(8));
    bg.lineStyle(P(2), 0x887733, 0.9);
    bg.strokeRoundedRect(px, py, PW, PH, P(8));

    const title = this.add.text(W / 2, py + P(18), `邀請 ${nickname} 加入隊伍？`, {
      fontSize: F(13), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 1);

    const BTN_W = P(70), BTN_H = P(26);
    const confirmHit = this.add.rectangle(W / 2 - P(44), py + PH - P(20), BTN_W, BTN_H, 0x336633)
      .setOrigin(0.5).setDepth(D + 1).setInteractive({ useHandCursor: true });
    const confirmTxt = this.add.text(W / 2 - P(44), py + PH - P(20), '邀請', {
      fontSize: F(13), fontStyle: 'bold', color: '#aaffaa',
    }).setOrigin(0.5).setDepth(D + 2);

    const cancelHit = this.add.rectangle(W / 2 + P(44), py + PH - P(20), BTN_W, BTN_H, 0x553333)
      .setOrigin(0.5).setDepth(D + 1).setInteractive({ useHandCursor: true });
    const cancelTxt = this.add.text(W / 2 + P(44), py + PH - P(20), '取消', {
      fontSize: F(13), fontStyle: 'bold', color: '#ffaaaa',
    }).setOrigin(0.5).setDepth(D + 2);

    const close = () => { this._invitePopupObjs.forEach(o => o.destroy()); this._invitePopupObjs = []; };

    confirmHit.on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => {
      ev?.stopPropagation?.();
      close();
      this._sendPartyInvite(sessionId, nickname);
      this._buildPartyPanel();
    });
    cancelHit.on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => { ev?.stopPropagation?.(); close(); });

    this._invitePopupObjs = [bg, title, confirmHit, confirmTxt, cancelHit, cancelTxt];
  }

  private _sendPartyInvite(sessionId: string, nickname: string): void {
    this._partyPendingInvites.push({ sid: sessionId, nick: nickname });
    NetworkService.sendPartyInvite(sessionId, getPlayerName(), this._partyRoomCode);
  }

  private _showInvitePopup(fromSessionId: string, fromNickname: string): void {
    this._clearInvitePopup();

    const W = this._sceneW, H = this._sceneH;
    const PW = P(260), PH = P(110);
    const px = W / 2 - PW / 2, py = H / 2 - PH / 2;
    const D = 610;

    const bg = this.add.graphics().setDepth(D);
    bg.fillStyle(0x1a1200, 0.97);
    bg.fillRoundedRect(px, py, PW, PH, P(8));
    bg.lineStyle(P(2), 0xcc9933, 0.9);
    bg.strokeRoundedRect(px, py, PW, PH, P(8));

    const title = this.add.text(W / 2, py + P(22), `${fromNickname} 邀請你組隊`, {
      fontSize: F(14), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 1);

    let secs = 30;
    const countdown = this.add.text(W / 2, py + P(46), `(${secs}秒後自動拒絕)`, {
      fontSize: F(11), color: '#aaaaaa',
    }).setOrigin(0.5).setDepth(D + 1);

    const acceptHit = this.add.rectangle(W / 2 - P(50), py + PH - P(22), P(80), P(28), 0x336633)
      .setOrigin(0.5).setDepth(D + 1).setInteractive({ useHandCursor: true });
    const acceptTxt = this.add.text(W / 2 - P(50), py + PH - P(22), '接受', {
      fontSize: F(13), fontStyle: 'bold', color: '#aaffaa',
    }).setOrigin(0.5).setDepth(D + 2);

    const declineHit = this.add.rectangle(W / 2 + P(50), py + PH - P(22), P(80), P(28), 0x553333)
      .setOrigin(0.5).setDepth(D + 1).setInteractive({ useHandCursor: true });
    const declineTxt = this.add.text(W / 2 + P(50), py + PH - P(22), '拒絕', {
      fontSize: F(13), color: '#ffaaaa',
    }).setOrigin(0.5).setDepth(D + 2);

    this._invitePopupObjs = [bg, title, countdown, acceptHit, acceptTxt, declineHit, declineTxt];

    this._inviteCountdown = setInterval(() => {
      secs--;
      if (countdown.active) countdown.setText(`(${secs}秒後自動拒絕)`);
      if (secs <= 0) this._clearInvitePopup();
    }, 1000) as unknown as ReturnType<typeof setTimeout>;

    acceptHit.on('pointerup', async (_p: any, _lx: any, _ly: any, ev: any) => {
      ev?.stopPropagation?.();
      this._clearInvitePopup();
      NetworkService.sendPartyInviteResponse(true, fromSessionId);
      try {
        await NetworkService.joinRoom(this._pendingInviteRoomCode, getPlayerName());
        NetworkService.partyMode = true;
        this._setupGameRoomCallbacks();
        NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
        this._partyState = 'in_party';
        this._amPartyLeader = false;
        this._partyCreateBtnObjs.forEach(o => o.destroy());
        this._partyCreateBtnObjs = [];
        const leaderInfo = this._townRemotePlayers.get(fromSessionId);
        this._partyMembers = [{
          sid:   fromSessionId,
          nick:  leaderInfo?.nameLabel.text ?? '隊長',
          level: leaderInfo?.level ?? 0,
        }];
        this._buildPartyPanel();
      } catch { this._showToast('加入隊伍失敗'); }
    });
    declineHit.on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => {
      ev?.stopPropagation?.();
      this._clearInvitePopup();
      NetworkService.sendPartyInviteResponse(false, fromSessionId);
    });
  }

  private _buildPartyCreateBtn(W: number, H: number): void {
    this._partyCreateBtnObjs.forEach(o => o.destroy());
    this._partyCreateBtnObjs = [];
    if (this._partyState !== 'none') return;

    const BW = P(84), BH = P(32);
    const SET_S = P(36);
    const bx = W - SET_S - P(4) - P(6) - BW / 2;
    const by = P(4) + SET_S / 2;
    const D  = 56;

    const bg = this.add.graphics().setDepth(D);
    bg.fillStyle(0x1a3a10, 0.92);
    bg.fillRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, P(6));
    bg.lineStyle(P(2), 0x44aa33, 0.85);
    bg.strokeRoundedRect(bx - BW / 2, by - BH / 2, BW, BH, P(6));

    const txt = this.add.text(bx, by, '建立隊伍', {
      fontSize: F(14), fontStyle: 'bold', color: '#88ee66', stroke: '#0a1a04', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 1);

    const hit = this.add.rectangle(bx, by, BW, BH)
      .setOrigin(0.5).setDepth(D + 2).setInteractive({ useHandCursor: true });

    hit.on('pointerup', async (_p: any, _lx: any, _ly: any, ev: any) => {
      ev?.stopPropagation?.();
      try {
        await NetworkService.createRoom(getPlayerName());
        NetworkService.partyMode = true;
        this._setupGameRoomCallbacks();
        NetworkService.sendPlayerInfo(getPlayerName(), PlayerStore.getLevel(), SkinStore.get());
        this._partyRoomCode = NetworkService.gameCode;
        this._partyState = 'open';
        this._amPartyLeader = true;
        this._partyCreateBtnObjs.forEach(o => o.destroy());
        this._partyCreateBtnObjs = [];
        this._buildPartyPanel();
      } catch { this._showToast('建立隊伍失敗'); }
    });

    this._partyCreateBtnObjs = [bg, txt, hit];
  }

  private _clearInvitePopup(): void {
    if (this._inviteCountdown) { clearInterval(this._inviteCountdown as any); this._inviteCountdown = undefined; }
    this._invitePopupObjs.forEach(o => o.destroy());
    this._invitePopupObjs = [];
  }

  private _buildPartyPanel(): void {
    this._destroyPartyPanel();
    const W = this._sceneW, H = this._sceneH;
    const fmtName = (nick: string, level: number) => {
      const n = nick.length > 8 ? nick.slice(0, 8) + '…' : nick;
      return level > 0 ? `Lv.${level} ${n}` : n;
    };

    // Rows: confirmed members + pending invites (leader view) or self + other guests (guest view)
    // Guest: _partyMembers[0] = leader (shown in leader section), [1+] = other guests
    const confirmedRows: { nick: string; level: number; pending?: boolean; sid?: string }[] =
      this._amPartyLeader
        ? [
            ...this._partyMembers.map(m => ({ nick: m.nick, level: m.level, sid: m.sid })),
            ...this._partyPendingInvites.map(p => ({ nick: p.nick, level: 0, pending: true, sid: p.sid })),
          ]
        : [
            { nick: '你', level: 0 },
            ...this._partyMembers.slice(1).map(m => ({ nick: m.nick, level: m.level, sid: m.sid })),
          ];

    const rowCount = Math.max(confirmedRows.length, 1);
    const PW = P(200), PH = P(58) + P(22) * rowCount + P(46);
    const px = W - PW - P(8), py = H / 2 - PH / 2;
    const D = 55;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const o = <T extends Phaser.GameObjects.GameObject>(x: T) => { objs.push(x); return x; };

    const bg = o(this.add.graphics().setDepth(D));
    bg.fillStyle(0x1a1200, 0.92);
    bg.fillRoundedRect(px, py, PW, PH, P(6));
    bg.lineStyle(P(2), 0x887733, 0.85);
    bg.strokeRoundedRect(px, py, PW, PH, P(6));

    // Leader row
    o(this.add.text(px + P(10), py + P(10), '隊長', {
      fontSize: F(11), color: '#aa8833', stroke: '#1a0800', strokeThickness: 1,
    }).setDepth(D + 1));
    const leaderName = this._amPartyLeader ? '你' : fmtName(this._partyMembers[0]?.nick ?? '隊長', 0);
    o(this.add.text(px + P(10), py + P(22), leaderName, {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
    }).setDepth(D + 1));

    // Member section
    o(this.add.text(px + P(10), py + P(44), '隊員', {
      fontSize: F(11), color: '#778877', stroke: '#1a0800', strokeThickness: 1,
    }).setDepth(D + 1));

    confirmedRows.forEach((row, i) => {
      const rowY = py + P(56) + i * P(22);
      if (row.pending) {
        // Pending invite slot
        o(this.add.text(px + P(10), rowY, `⋯ ${row.nick}`, {
          fontSize: F(13), color: '#888866', stroke: '#1a0800', strokeThickness: 1,
        }).setDepth(D + 1));
        // Cancel button
        const cancelX = px + PW - P(20);
        const cancelHit = o(this.add.text(cancelX, rowY, '✕', {
          fontSize: F(13), color: '#cc4444',
        }).setOrigin(1, 0).setDepth(D + 2).setInteractive({ useHandCursor: true }));
        cancelHit.on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => {
          ev?.stopPropagation?.();
          this._partyPendingInvites = this._partyPendingInvites.filter(p => p.sid !== row.sid);
          this._buildPartyPanel();
        });
      } else {
        o(this.add.text(px + P(10), rowY, fmtName(row.nick, row.level), {
          fontSize: F(15), fontStyle: 'bold', color: '#ccddcc', stroke: '#1a0800', strokeThickness: 2,
        }).setDepth(D + 1));
      }
    });

    if (confirmedRows.length === 0) {
      o(this.add.text(px + P(10), py + P(56), '點擊玩家來邀請', {
        fontSize: F(12), color: '#666655', stroke: '#1a0800', strokeThickness: 1,
      }).setDepth(D + 1));
    }

    const disbandHit = o(this.add.rectangle(px + PW - P(34), py + PH - P(27), P(52), P(26), 0x553333)
      .setOrigin(0.5, 0.5).setDepth(D + 1).setInteractive({ useHandCursor: true }));
    o(this.add.text(px + PW - P(34), py + PH - P(27), '解散', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffaaaa', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(D + 2));

    (disbandHit as Phaser.GameObjects.Rectangle).on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => {
      ev?.stopPropagation?.();
      this._partyMembers.forEach(m => NetworkService.sendPartyDisband(m.sid));
      this._partyState = 'none';
      this._partyMembers = [];
      this._partyPendingInvites = [];
      this._destroyPartyPanel();
      NetworkService.disconnect();
      this._showToast('已解散隊伍');
      this._buildPartyCreateBtn(this._sceneW, this._sceneH);
    });

    o(this.add.text(px + P(10), py + PH - P(44),
      this._amPartyLeader ? '按出戰選關卡' : '等待隊長出發', {
        fontSize: F(15), fontStyle: 'bold', color: '#888866', stroke: '#1a0800', strokeThickness: 1,
      }).setDepth(D + 1));

    this._partyPanelObjs = objs;
  }

  private _destroyPartyPanel(): void {
    this._partyPanelObjs.forEach(o => o.destroy());
    this._partyPanelObjs = [];
  }

  private _spawnTownRemotePlayer(
    sessionId: string, nx: number, ny: number, lastDir: string,
    nickname: string, _level: number, skinId: number,
  ): void {
    console.log('[Town] spawn remote player', sessionId, nx, ny);
    if (this._townRemotePlayers.has(sessionId)) return;
    const sx = nx * this._townWorldW, sy = ny * this._townWorldH;

    const skinKey = `skin_preview_${skinId}`;
    const runSkinKey = `skin_run_preview_${skinId}`;
    if (this.textures.exists(skinKey)) {
      this.textures.get(skinKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
      (['down', 'left', 'right', 'up'] as const).forEach((dir, i) => {
        const idleStart = i * 12;
        const akey = `town_remote_idle_${skinId}_${dir}`;
        if (!this.anims.exists(akey))
          this.anims.create({ key: akey, frames: this.anims.generateFrameNumbers(skinKey, { start: idleStart, end: idleStart + 3 }), frameRate: 5, repeat: -1 });
      });
    }
    if (this.textures.exists(runSkinKey)) {
      this.textures.get(runSkinKey).setFilter(Phaser.Textures.FilterMode.NEAREST);
      (['down', 'left', 'right', 'up'] as const).forEach((dir, i) => {
        const runStart = i * 8;
        const rkey = `town_remote_run_${skinId}_${dir}`;
        if (!this.anims.exists(rkey))
          this.anims.create({ key: rkey, frames: this.anims.generateFrameNumbers(runSkinKey, { start: runStart, end: runStart + 7 }), frameRate: 10, repeat: -1 });
      });
    }

    const texKey = this.textures.exists(skinKey) ? skinKey : 'player_idle_shadow';
    const sprite = this.add.sprite(sx, sy, texKey, 0).setScale(1.5 * DPR).setDepth(10);
    (sprite as any).__skinId = skinId;
    const initAnim = `town_remote_idle_${skinId}_${lastDir}`;
    if (this.anims.exists(initAnim)) sprite.play(initAnim, true);
    sprite.setInteractive({ useHandCursor: true })
      .on('pointerup', (_p: any, _lx: any, _ly: any, ev: any) => {
        ev?.stopPropagation?.();
        const current = this._townRemotePlayers.get(sessionId);
        this._onTownPlayerClick(sessionId, current?.nameLabel.text || nickname);
      });
    this._townContainer?.add(sprite);

    const nameTxt = this.add.text(sx, sy - P(28), nickname || '?', {
      fontSize: F(11), color: '#aaddff', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(11);
    this._townContainer?.add(nameTxt);

    this._townRemotePlayers.set(sessionId, { sprite, nameLabel: nameTxt, level: _level, fromX: sx, fromY: sy, targetX: sx, targetY: sy, lerpT: 1, lerpDur: 110 });
  }

  private _updateTownInteractions(): void {
    const MARGIN = P(32);
    let nearest: (typeof this._townZones)[0] | null = null;
    let nearestDist = Infinity;

    for (const zone of this._townZones) {
      zone.ring.setAlpha(0);
      const dx = Math.abs(this._townPlayerX - zone.wx);
      const dy = this._townPlayerY - (zone.wy - zone.hh);
      const inRange = dx < zone.hw + MARGIN && Math.abs(dy) < zone.hh + MARGIN;
      const dist = Math.hypot(dx, dy);
      if (inRange && dist < nearestDist) { nearestDist = dist; nearest = zone; }
    }

    this._townInteractLabel?.setVisible(false);

    const currLabel = nearest?.label ?? null;
    if (currLabel !== this._townActiveZone) {
      this._townActiveZone = currLabel;
      if (nearest) nearest.onActivate();
    }
  }

  override update(_time: number, delta: number): void {
    if (!this._townPlayer || !this._townContainer) return;

    const dt  = delta / 1000;
    const VW  = this._townViewW, VH = this._townViewH;
    const WW  = this._townWorldW, WH = this._townWorldH;
    const SPEED  = Math.min(VW, VH) * 0.45 * dt;
    const MARGIN = P(20);

    const keys = this._townCursors;
    const joy  = this._townJoystick?.value;
    let dx = joy?.x ?? 0;
    let dy = joy?.y ?? 0;
    if (keys?.left.isDown)  dx -= 1;
    if (keys?.right.isDown) dx += 1;
    if (keys?.up.isDown)    dy -= 1;
    if (keys?.down.isDown)  dy += 1;
    const dlen = Math.sqrt(dx * dx + dy * dy);
    if (dlen > 1) { dx /= dlen; dy /= dlen; }

    const PHW = P(13), PHH = P(5), PHY = P(10); // ← 半寬/半高/中心往下偏移
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const overlapsStone = (nx: number, ny: number) =>
      this._townStoneRects.some(s => Math.hypot(nx - s.x, ny + PHY - s.y) < PHW + s.r) ||
      this._townBuildingRects.some(b =>
        Math.abs(nx - b.cx) < b.hw + PHW && Math.abs((ny + PHY) - b.cy) < b.hh + PHH);

    let nx = clamp(this._townPlayerX + dx * SPEED, MARGIN, WW - MARGIN);
    let ny = clamp(this._townPlayerY + dy * SPEED, MARGIN, WH - MARGIN);
    if (overlapsStone(nx, ny)) {
      // try slide: X only, then Y only
      if (!overlapsStone(nx, this._townPlayerY)) ny = this._townPlayerY;
      else if (!overlapsStone(this._townPlayerX, ny)) nx = this._townPlayerX;
      else { nx = this._townPlayerX; ny = this._townPlayerY; }
    }
    this._townPlayerX = nx;
    this._townPlayerY = ny;
    this._townPlayer.setPosition(this._townPlayerX, this._townPlayerY);

    // Update depth after final position — higher Y (lower on screen) = higher depth = in front
    const TS2 = Math.round(32 * DPR);
    const playerDepth = 4 + this._townPlayerY / TS2 + 0.5;
    this._townPlayer.setDepth(playerDepth);
    this._townLocalNameLabel?.setDepth(playerDepth + 0.1);
    // Container children render in insertion order, not by depth — re-sort every frame
    this._townContainer.sort('depth');

    // Camera: keep player centred, clamped to world bounds
    const camX = Math.max(0, Math.min(this._townPlayerX - VW / 2, WW - VW));
    const camY = Math.max(0, Math.min(this._townPlayerY - VH / 2, WH - VH));
    this._townContainer.setPosition(-camX, this._townViewY - camY);

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      this._townPlayerDir = Math.abs(dx) >= Math.abs(dy)
        ? (dx > 0 ? 'right' : 'left')
        : (dy > 0 ? 'down'  : 'up');
    }
    const hasRun = this.anims.exists(`player_run_${this._townPlayerDir}`);
    const animKey = (moving && hasRun) ? `player_run_${this._townPlayerDir}` : `player_idle_${this._townPlayerDir}`;
    if (this._townPlayer.anims.currentAnim?.key !== animKey)
      this._townPlayer.play(animKey, true);

    this._townLocalNameLabel?.setPosition(this._townPlayerX, this._townPlayerY - P(28));
    if (this._townPlayerDebug) this._townPlayerDebug.clear();

    this._townMoveSendTimer += delta;
    if (this._townMoveSendTimer >= 80 && NetworkService.townConnected) {
      this._townMoveSendTimer = 0;
      const nx = this._townPlayerX / WW;
      const ny = this._townPlayerY / WH;
      const nd = this._townPlayerDir;
      if (nx !== this._townLastSentX || ny !== this._townLastSentY || nd !== this._townLastSentDir) {
        this._townLastSentX = nx;
        this._townLastSentY = ny;
        this._townLastSentDir = nd;
        NetworkService.sendTownMove(nx, ny, nd);
      }
    }

    // linear interpolation: travel from→target over lerpDur ms (slightly longer than send interval)
    const tileSize = Math.round(32 * DPR);
    this._townRemotePlayers.forEach(r => {
      if (r.lerpT < 1) {
        r.lerpT = Math.min(1, r.lerpT + delta / r.lerpDur);
        const nx = Phaser.Math.Linear(r.fromX, r.targetX, r.lerpT);
        const ny = Phaser.Math.Linear(r.fromY, r.targetY, r.lerpT);
        r.sprite.setPosition(nx, ny);
        r.nameLabel.setPosition(nx, ny - P(28));
      }
      const remoteDepth = 4 + r.sprite.y / tileSize + 0.5;
      r.sprite.setDepth(remoteDepth);
      r.nameLabel.setDepth(remoteDepth + 0.1);
    });

    // Update animals (host only runs simulation; non-host only renders)
    const ts = Math.round(32 * DPR);
    if (this._isAnimalHost) {
      for (const a of this._townAnimals) {
        if (a.state === 'walk') {
          const dx = a.targetX - a.wx;
          const dy = a.targetY - a.wy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < a.speed * delta / 1000 + 1) {
            a.wx = a.targetX; a.wy = a.targetY;
            a.sprite.setPosition(a.wx, a.wy);
            this._animalStartIdle(a);
          } else {
            const step = a.speed * delta / 1000;
            a.wx += (dx / dist) * step;
            a.wy += (dy / dist) * step;
            a.sprite.setPosition(a.wx, a.wy);
            a.sprite.setDepth(4 + a.wy / ts + 0.3);
          }
        } else {
          a.idleTimer -= delta;
          if (a.idleTimer <= 0) this._animalStartWalk(a);
        }
      }
      // Broadcast state to other clients periodically
      this._animalSyncTimer -= delta;
      if (this._animalSyncTimer <= 0) {
        this._animalSyncTimer = 2000;
        NetworkService.sendTownAnimal(this._townAnimals.map(a => ({
          kind: a.kind, state: a.state, wx: a.wx / this._townWorldW, wy: a.wy / this._townWorldH,
          dir: a.dir,
        })));
      }
    }

  }

  private _createAnimalAnims(): void {
    const dirs: Array<['down' | 'up' | 'left' | 'right', number]> = [
      ['down', 0], ['up', 1], ['left', 2], ['right', 3],
    ];
    const animals = ['Fox', 'Deer', 'Hare', 'Boar', 'Black_grouse'];
    const walkFrames: Record<string, number> = { Hare: 5 };

    for (const name of animals) {
      const idleKey = `animal_${name}_idle`;
      const walkKey = `animal_${name}_walk`;
      if (!this.textures.exists(idleKey) || !this.textures.exists(walkKey)) continue;
      const wf = walkFrames[name] ?? 6;

      for (const [dir, row] of dirs) {
        const idleAnimKey = `animal_${name}_idle_${dir}`;
        const walkAnimKey = `animal_${name}_walk_${dir}`;
        if (!this.anims.exists(idleAnimKey)) {
          this.anims.create({
            key: idleAnimKey,
            frames: this.anims.generateFrameNumbers(idleKey, { start: row * 4, end: row * 4 + 3 }),
            frameRate: 6,
            repeat: -1,
          });
        }
        if (!this.anims.exists(walkAnimKey)) {
          this.anims.create({
            key: walkAnimKey,
            frames: this.anims.generateFrameNumbers(walkKey, { start: row * wf, end: row * wf + wf - 1 }),
            frameRate: 8,
            repeat: -1,
          });
        }
      }
    }
  }

  private _spawnTownAnimals(WW: number, WH: number): void {
    if (!this._townContainer) return;
    const allKinds = ['Fox', 'Deer', 'Hare', 'Boar', 'Black_grouse'];
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    const MARGIN = P(80);

    for (let i = 0; i < 3; i++) {
      const name = allKinds[Math.floor(Math.random() * allKinds.length)];
      const idleKey = `animal_${name}_idle`;
      if (!this.textures.exists(idleKey)) continue;

      let wx: number, wy: number;
      let attempts = 0;
      do {
        wx = MARGIN + Math.random() * (WW - MARGIN * 2);
        wy = MARGIN + Math.random() * (WH - MARGIN * 2);
        attempts++;
      } while (this._animalPosBlocked(wx, wy) && attempts < 20);

      const dir = dirs[Math.floor(Math.random() * 4)];
      const sprite = this.add.sprite(wx, wy, idleKey, 0);
      sprite.setScale(DPR);
      sprite.setDepth(4 + wy / P(32) + 0.3);
      sprite.play(`animal_${name}_idle_${dir}`, true);
      this._townContainer.add(sprite);

      this._townAnimals.push({
        sprite, state: 'idle', wx, wy,
        targetX: wx, targetY: wy,
        speed: P(28 + Math.random() * 16),
        dir, idleTimer: 1500 + Math.random() * 3000,
        kind: name,
      });
    }
  }

  private _animalStartIdle(a: (typeof this._townAnimals)[0]): void {
    a.state = 'idle';
    a.idleTimer = 2000 + Math.random() * 4000;
    a.sprite.play(`animal_${a.kind}_idle_${a.dir}`, true);
  }

  private _applyAnimalSync(data: Array<{ kind: string; state: string; wx: number; wy: number; dir: string }>): void {
    if (!Array.isArray(data)) return;
    const ts = Math.round(32 * DPR);
    data.forEach((d, i) => {
      const a = this._townAnimals[i];
      if (!a) return;
      const wx = d.wx * this._townWorldW;
      const wy = d.wy * this._townWorldH;
      a.wx = wx; a.wy = wy;
      a.sprite.setPosition(wx, wy);
      a.sprite.setDepth(4 + wy / ts + 0.3);
      const dir = d.dir as 'down' | 'up' | 'left' | 'right';
      if (d.state === 'walk') {
        const key = `animal_${a.kind}_walk_${dir}`;
        if (a.sprite.anims.currentAnim?.key !== key && this.anims.exists(key))
          a.sprite.play(key, true);
      } else {
        const key = `animal_${a.kind}_idle_${dir}`;
        if (a.sprite.anims.currentAnim?.key !== key && this.anims.exists(key))
          a.sprite.play(key, true);
      }
      a.dir = dir;
    });
  }

  private _animalPosBlocked(x: number, y: number): boolean {
    const AR = P(10); // animal half-width for collision
    return (
      this._townStoneRects.some(s => Math.hypot(x - s.x, y - s.y) < AR + s.r) ||
      this._townBuildingRects.some(b =>
        Math.abs(x - b.cx) < b.hw + AR && Math.abs(y - b.cy) < b.hh + AR)
    );
  }

  private _animalStartWalk(a: (typeof this._townAnimals)[0]): void {
    const WW = this._townWorldW;
    const WH = this._townWorldH;
    const MARGIN = P(60);
    const STEP = P(50 + Math.random() * 80);

    let tx = a.wx, ty = a.wy;
    let found = false;
    for (let attempt = 0; attempt < 12; attempt++) {
      const cx = a.wx + (Math.random() - 0.5) * STEP * 2;
      const cy = a.wy + (Math.random() - 0.5) * STEP * 2;
      const cxt = Math.max(MARGIN, Math.min(WW - MARGIN, cx));
      const cyt = Math.max(MARGIN, Math.min(WH - MARGIN, cy));
      if (!this._animalPosBlocked(cxt, cyt)) { tx = cxt; ty = cyt; found = true; break; }
    }
    if (!found) { this._animalStartIdle(a); return; }

    const dx = tx - a.wx;
    const dy = ty - a.wy;
    if (Math.abs(dx) >= Math.abs(dy)) {
      a.dir = dx < 0 ? 'left' : 'right';
    } else {
      a.dir = dy < 0 ? 'up' : 'down';
    }

    a.state = 'walk';
    a.targetX = tx;
    a.targetY = ty;
    a.sprite.play(`animal_${a.kind}_walk_${a.dir}`, true);
  }
}
