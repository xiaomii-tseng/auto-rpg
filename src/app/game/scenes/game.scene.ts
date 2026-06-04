import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss } from '../objects/boss';
import { loadSkinTextures } from '../data/skin-store';
import { BossGreenSlime } from '../objects/boss-green-slime';
import { BossRedSlime } from '../objects/boss-red-slime';
import { BossBlueSlime } from '../objects/boss-blue-slime';
import { BossWhiteSlime } from '../objects/boss-white-slime';
import { BossZombieSlime } from '../objects/boss-zombie-slime';
import { BossLavaSlime } from '../objects/boss-lava-slime';
import { BossFlowerOne } from '../objects/boss-flower-one';
import { BossFlowerTwo } from '../objects/boss-flower-two';
import { BossFlowerThree } from '../objects/boss-flower-three';
import { BossOrc1 } from '../objects/boss-orc1';
import { BossOrc2 } from '../objects/boss-orc2';
import { BossOrc3 } from '../objects/boss-orc3';
import { BossVampire1 } from '../objects/boss-vampire1';
import { BossVampire2 } from '../objects/boss-vampire2';
import { BossVampire3 } from '../objects/boss-vampire3';
import { BossOrcLegendary } from '../objects/boss-orc-legendary';
import { BossVampireLegendary } from '../objects/boss-vampire-legendary';
import { BossFlowerLegendary } from '../objects/boss-flower-legendary';
import { BossSlimeLegendary } from '../objects/boss-slime-legendary';
import { MinionSlime } from '../objects/minion-slime';
import { VirtualJoystick } from '../ui/joystick';
import { drawItemCell } from '../ui/item-cell';
import { PlayerStore, STAT_POINT_PER_LEVEL } from '../data/player-store';
import { InventoryStore } from '../data/inventory-store';
import { SaveStore } from '../data/save-store';
import { CardStore } from '../data/card-store';
import { SkillTreeStore } from '../data/skill-tree-store';
import { getMonsterDef, getCardDef, getAllCardIdsByTier, DropEntry, MonsterDef } from '../data/monster-data';
import { getElementMultiplier, ELEMENT_NAMES, ELEMENT_COLORS, QUALITY_NAMES, QUALITY_COLORS, SLOT_NAMES, STAT_NAMES, generateEquipment, randomQuality, getDropQualityWeights, getItemStats, fmtAffixValue, EquipSlot, EquipmentItem, MonsterType, generateLegendaryWeapon, LEGENDARY_BOSS_WEAPON } from '../data/equipment-data';
import { QuestStore, STAR_HP_MULT, STAR_STAT_MULT, STAR_DROP_MULT, STAR_DEF_MULT, STAR_EXP_MULT, STAR_EQUIP_QUALITY, MINION_DEF_MULT } from '../data/quest-store';
import { ELITE_HP_MULT, ELITE_SCALE_MOD } from '../data/monster-data';
import { NetworkService } from '../network/network.service';
import { AudioService } from '../data/audio.service';
import { PotionBarStore } from '../data/potion-bar-store';
import { TowerStore } from '../data/tower-store';
import { DailyQuestStore } from '../data/daily-quest-store';
import { TutorialStore, TutorialKey } from '../data/tutorial-store';
import { ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L, ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED, ITEM_STONE_BROKEN, ITEM_STONE_INTACT, ITEM_STONE_RECAST, ITEM_STONE_BREAKTHROUGH, ITEM_QUEST_REROLL, ITEM_BLANK_CARD, getHealthPotionForStar, BOSS_TICKET_MAP } from '../data/monster-data';
import type { MapParams } from '../../../../shared/types';
import { t as tr } from '../i18n/i18n';
import { openChangePasswordOverlay } from '../ui/change-password-overlay';

const CO_OP_HP_MULTS: number[] = [1, 1, 1.6, 2.4]; // indexed by player count; extend for future 4+ support

/** Deterministic seeded RNG (Park-Miller LCG) — not affected by Phaser or JS RNG state */
class SeededRNG {
  private s: number;
  constructor(seed: number) { this.s = (Math.abs(seed) % 2_147_483_646) + 1; }
  private next(): number { return (this.s = (this.s * 16807) % 2_147_483_647); }
  between(min: number, max: number): number { return Math.floor(min + (this.next() / 2_147_483_647) * (max - min + 1)); }
  float(min: number, max: number): number { return min + (this.next() / 2_147_483_647) * (max - min); }
}

const DPR = (window as any).__gameDpr as number;
const F = (n: number): string => `${Math.round(n * DPR)}px`;
const P = (n: number): number => Math.round(n * DPR);

const MELEE_RANGE = P(60);

interface LootDrop {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  itemId: string;
  itemName: string;
  qty: number;
  cardId?: string;
  equip?: EquipmentItem;
  gold?: number;
  readyAt: number;
  badge?: Phaser.GameObjects.Graphics | Phaser.GameObjects.Container;
}

type ChestType = 'equip' | 'gold' | 'stone' | 'potion' | 'card';
interface ChestEntry {
  zoneIdx: number;
  x: number; y: number;
  type: ChestType;
  sprite: Phaser.GameObjects.Sprite;
  shadow: Phaser.GameObjects.Ellipse;
  zone?: Phaser.GameObjects.Zone;
  unlocked: boolean;
  opening: boolean;
  big?: boolean;
}

// 品質權重 47/35/15/3（正規化）
const EQUIP_ALL_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'sword'];

const ITEM_DESCS: Record<string, string> = {
  [ITEM_STONE_BROKEN]: tr('game.stone.enhance'),
  [ITEM_STONE_INTACT]: tr('game.stone.intact.buff'),
  [ITEM_STONE_RECAST]: tr('game.stone.recast'),
  [ITEM_STONE_BREAKTHROUGH]: tr('game.stone.breakthrough'),
  [ITEM_QUEST_REROLL]: tr('prep.quest.resetList'),
  [ITEM_BLANK_CARD]: tr('game.loot.card10'),
  [ITEM_POTION_HEALTH_S]: tr('game.potion.heal100'),
  [ITEM_POTION_HEALTH_M]: tr('game.potion.heal200'),
  [ITEM_POTION_HEALTH_L]: tr('game.potion.heal300'),
  [ITEM_POTION_REVIVE]: tr('game.potion.reviveAuto'),
  [ITEM_POTION_ATK]: tr('game.buff.atk'),
  [ITEM_POTION_DEF]: tr('game.buff.def'),
  [ITEM_POTION_SPEED]: tr('game.buff.speed'),
};

type SessionLootEntry =
  | { type: 'item'; itemId: string; itemName: string; qty: number }
  | { type: 'card'; cardId: string; itemName: string }
  | { type: 'equip'; equip: EquipmentItem; itemName: string };

interface PartnerData {
  sessionId: string;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  hpBar: Phaser.GameObjects.Graphics;
  auraRing: Phaser.GameObjects.Graphics;
  hp: number;
  maxHp: number;
  isDead: boolean;
  prevX: number;
  prevY: number;
  prevDir: string;
  behavior: string;
  skinId: number;
}

// ── SAO-style maze types ───────────────────────────────────────
type MazeDoorDir = 'N' | 'S' | 'E' | 'W';
type MazeRoomType = 'start' | 'normal' | 'elite' | 'dark' | 'poison' | 'sealed' | 'heal' | 'stairs';
interface MazeRoom {
  row: number; col: number;
  cx: number; cy: number;
  rw: number; rh: number;
  connections: Set<MazeDoorDir>;
  type: MazeRoomType;
  revealed: boolean;
  cleared: boolean;
  enemiesAlive: number;
  doorBlockers: Map<MazeDoorDir, Phaser.GameObjects.Rectangle>;
  fogGfx?: Phaser.GameObjects.Graphics;
}

export class GameScene extends Phaser.Scene {
  protected player!: Player;
  protected boss!: Boss;
  protected joystick!: VirtualJoystick;
  protected keys!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private qKey!: Phaser.Input.Keyboard.Key;
  private eKey!: Phaser.Input.Keyboard.Key;
  private _spaceHoldTimer?: Phaser.Time.TimerEvent;
  protected bossHpGfx!: Phaser.GameObjects.Graphics;
  protected bossHpLabel!: Phaser.GameObjects.Text;
  protected bossDebuffGfx!: Phaser.GameObjects.Graphics;
  protected bossDebuffTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  protected gameOver = false;
  protected _tutPaused = false;
  protected _isTutorial = false;
  private _tutorialDropIdx = 0;
  private _tutorialInitData: any = null;
  private _dqDeathThisBattle = false;
  private _dqPotionThisBattle = false;
  protected teleporting = false;
  protected _hostReconnecting = false;

  // 瞬步斬瞄準模式
  private dashAimAngle = 0;
  protected worldW = 0;
  protected worldH = 0;

  protected allMinions: MinionSlime[] = [];
  private _flowerThreeMinions = new Set<MinionSlime>();
  private _pendingFlowerSeeds = 0;
  // ── Special card effect state ──
  private _orbitBalls: Array<{ gfx: Phaser.GameObjects.Graphics; angle: number; type: 'fire' | 'ice'; lastHit: Map<object, number> }> = [];
  private _orbitAngle = 0;
  private _partnerOrbitBalls: Map<string, Array<{ gfx: Phaser.GameObjects.Graphics; angle: number; type: 'fire' | 'ice' }>> = new Map();
  private _playerKnives: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number; vx: number; vy: number; spawnX: number; spawnY: number; maxDist: number; hitTargets: Set<object>; homing?: boolean; returnToPlayer?: boolean }> = [];
  private _partnerKnives: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number; vx: number; vy: number; spawnX: number; spawnY: number; maxDist: number }> = [];
  private _divineShieldTimer?: Phaser.Time.TimerEvent;
  private _divineShieldGfx?: Phaser.GameObjects.Graphics;
  private _divineShieldRollUntil = 0;  // 每次攻擊動作只判定一次（300ms 鎖）
  private _onHitLightningCooldown = 0;  // 攻擊觸發落雷冷卻
  private _onHitKnifeCooldown     = 0;  // 攻擊觸發飛刀冷卻
  private _freeRevivesUsed = 0;
  // 業火盾
  private _blazingActive = false;
  private _blazingTimer?: Phaser.Time.TimerEvent;
  private _blazingGfx?: Phaser.GameObjects.Graphics;
  // 恐懼光環
  private _fearAuraTimer?: Phaser.Time.TimerEvent;
  private _fearAuraGfx?: Phaser.GameObjects.Graphics;
  // 蓄勁一閃
  private _impaleHitCount = 0;
  protected _reviveDialogActive = false;
  private _atkDragPointerId = -1;
  private _atkDragStartX = 0;
  private _atkDragStartY = 0;
  private _atkDirGfx?: Phaser.GameObjects.Graphics;
  private _atkDragThreshold = 0;  // 初始化後設為 P(15)
  private _holdAttackTimer?: Phaser.Time.TimerEvent;
  private _forceAttackAngle: number | null = null;  // 手動拖動攻擊方向（rad），null = 自動
  private _atkDragAngle: number | null = null;       // 目前正在拖動的角度，null = 未拖動
  protected _allyMinions: MinionSlime[] = [];          // 有序陣列，上限 3，最舊的先移除
  protected _allyGroup!: Phaser.Physics.Arcade.Group;  // 用於 projectile overlap 偵測
  private _slowZones: { x: number; y: number; r: number; expires: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private _rainPuddles: { x: number; y: number; r: number; dmg: number; expires: number }[] = [];
  private _v3IceDomainActive = false;
  private _v3IceDomainCX = 0;
  private _v3IceDomainCY = 0;
  private _rainPuddleHitCd = 0;
  // 黑夜降靈
  private _darkNightActive = false;
  private _darkNightZones: { x: number; y: number; r: number }[] = [];
  private _darkNightRT?: Phaser.GameObjects.RenderTexture;
  private _darkNightBlackGfx?: Phaser.GameObjects.Graphics;  // 離場用，供 RT draw
  private _darkNightEdgeGfx?: Phaser.GameObjects.Graphics;  // 視野邊緣光環（screen space）
  private _darkNightSafeGfx?: Phaser.GameObjects.Graphics;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private waypoints: Phaser.Math.Vector2[] = [];
  private waypointRooms: { x: number; y: number; w: number; h: number }[][] = [];
  private corridorSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  private cornerPts: { x: number; y: number }[] = [];
  private readonly BOSS_ARENA_RADIUS = P(400);
  private bossArenaCenter = new Phaser.Math.Vector2(0, 0);
  private bossArenaShape = 0;   // 0=圓, 1=八角, 2=菱形, 3=圓角矩形
  private bossMonsterId = 'boss_orc1';
  protected questStar = 1;
  private _mapSeed = 0;
  // ── Legendary mode (6-star boss via altar ticket) ───────
  protected _legendaryMode = false;
  // ── Tower mode ──────────────────────────────────────────
  protected _towerFloor = 0;
  protected _towerWalls?: Phaser.Physics.Arcade.StaticGroup;
  protected _towerBoss2?: Boss;
  private _towerEnemyAlive = 0;
  private _towerPortalGfx?: Phaser.GameObjects.Graphics;
  private _towerPortalHit?: Phaser.GameObjects.Zone;
  private _towerPortalX = 0;
  private _towerPortalY = 0;
  private _towerCorridorRects: { x: number, y: number, w: number, h: number }[] = [];
  // ── Maze mode (SAO-style) ───────────────────────────────────
  private _mazeRooms: MazeRoom[][] = [];
  private _mazeRows = 0;
  private _mazeCols = 0;
  private _currentRoomKey = '';
  private _miniMapGfx?: Phaser.GameObjects.Graphics;
  private _mapUpdateFn?: () => void;
  private _mazeDarkRt?: Phaser.GameObjects.RenderTexture;
  private _mazePoisonTimer?: Phaser.Time.TimerEvent;
  private _mazeTrapTimer?: Phaser.Time.TimerEvent;
  private _mazeRoomSealedActive = false;
  private _stairsGfx?: Phaser.GameObjects.Graphics;
  private _stairsZone?: Phaser.GameObjects.Zone;
  private _mapTheme: 'grassland' | 'desert' | 'snow' | 'lava' | 'forest' | 'dungeon' = 'desert';
  private _initBossId?: string;
  private _initQuestStar?: number;
  private _mapParams?: MapParams;
  private _partners = new Map<string, PartnerData>();
  protected _partnerNickname = '';
  protected _playerCount = 1;
  protected _ownSkinId = 0;
  protected _partnerSkinId = 0;
  protected _minionTargets = new Map<string, { x: number; y: number; isDashing: boolean }>();
  protected bossActive = false;
  protected lootDrops: LootDrop[] = [];
  private _chests: ChestEntry[] = [];
  private _zoneAlive: Map<number, number> = new Map();
  private exitBtnGfx!: Phaser.GameObjects.Graphics;
  private exitBtnTxt!: Phaser.GameObjects.Text;
  private exitBtnHit!: Phaser.GameObjects.Rectangle;
  private _sessionLoot: SessionLootEntry[] = [];
  private _lootBadge?: Phaser.GameObjects.Text;
  private exitBlinkTween?: Phaser.Tweens.Tween;
  private completedQuestId?: string;
  private guestReward?: { isEquipReward: boolean; gold: number; star: number };
  private levelText!: Phaser.GameObjects.Text;
  private expBarGfx!: Phaser.GameObjects.Graphics;
  private pickupLog: Phaser.GameObjects.Text[] = [];
  protected playerStartX = 0;
  protected playerStartY = 0;
  private lastSafeX = 0;
  private lastSafeY = 0;
  private readonly CORR_HW = P(100);
  private auraTimer?: Phaser.Time.TimerEvent;
  private auraRing?: Phaser.GameObjects.Graphics;
  private activeFires: { x: number; y: number; r: number; expiresAt: number }[] = [];
  protected _leechPool = 0;
  private _bloodlustStacks = 0;
  private _bloodlustTimer: Phaser.Time.TimerEvent | null = null;
  private _bloodlustExpiry = 0;
  private _bloodlustTickTimer: Phaser.Time.TimerEvent | null = null;
  private _bloodlustSwingHandled = false;
  private _sanguineStacks = 0;
  private _sanguineTimer: Phaser.Time.TimerEvent | null = null;
  private _sanguineExpiry = 0;
  private _sanguineTickTimer: Phaser.Time.TimerEvent | null = null;
  private _sanguineSwingHandled = false;
  private _auraTick = 0;
  private _auraCycleSanguineDone     = false;
  private _auraCycleBloodlustDone    = false;
  private _auraCycleKnifeDone        = false;
  private _auraCycleLightningDone    = false;
  private _auraCycleDivineShieldDone = false;
  private _auraCycleSummonDone       = false;
  protected minionProjGroup!: Phaser.Physics.Arcade.Group;
  protected homingProjs: Phaser.Physics.Arcade.Image[] = [];
  protected hitBatches = new Map<number, number>(); // batchId → hitTimestamp
  // ── 花怪召喚充能 ──────────────────────────────────────────
  private _flowerCharges = 3;
  private _flowerMaxCharges = 3;
  private _flowerChargeAccum = 0;
  private readonly _FLOWER_CHARGE_MS = 3000;
  private _flowerChargeGfx?: Phaser.GameObjects.Graphics;
  private _flowerChargeTxt?: Phaser.GameObjects.Text;
  protected plantZones: { type: 'circle' | 'vine'; x: number; y: number; r: number; len?: number; ang?: number; dmg: number; lastTick: number; tickInterval: number; expiresAt: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  protected _sessionQty: Map<string, number> = new Map();
  protected _potionCdUntil: Map<string, number> = new Map();
  protected _potionBarRedraw?: () => void;
  private _atkBuffActive = false;
  private _atkBuffTimer?: Phaser.Time.TimerEvent;
  protected _buffExpiry: Map<string, number> = new Map();
  private _buffHudTexts: Phaser.GameObjects.Text[] = [];
  protected _lastBuffHudRefresh = 0;
  private _pendingHitWeight = 0;
  private _hitShakePending = false;
  private _pendingDailyDmg = 0;
  private _pendingDailyDmgPending = false;

  constructor(key = 'GameScene') {
    super({ key });
  }

  preload(): void {
    const sBase = 'sprite/slime/PNG/Slime1/With_shadow/';
    const cfg = { frameWidth: 64, frameHeight: 64 };
    loadSkinTextures(this, this._ownSkinId, 'player');
    loadSkinTextures(this, this._partnerSkinId, 'partner');
    if (!this.textures.exists('slime_idle')) this.load.spritesheet('slime_idle', sBase + 'Slime1_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('slime_walk')) this.load.spritesheet('slime_walk', sBase + 'Slime1_Walk_with_shadow.png', cfg);
    if (!this.textures.exists('slime_run')) this.load.spritesheet('slime_run', sBase + 'Slime1_Run_with_shadow.png', cfg);
    if (!this.textures.exists('slime_attack')) this.load.spritesheet('slime_attack', sBase + 'Slime1_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime_hurt')) this.load.spritesheet('slime_hurt', sBase + 'Slime1_Hurt_with_shadow.png', cfg);
    if (!this.textures.exists('slime_death')) this.load.spritesheet('slime_death', sBase + 'Slime1_Death_with_shadow.png', cfg);
    const s2 = 'sprite/slime/PNG/Slime2/With_shadow/';
    if (!this.textures.exists('slime2_idle')) this.load.spritesheet('slime2_idle', s2 + 'Slime2_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_walk')) this.load.spritesheet('slime2_walk', s2 + 'Slime2_Walk_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_run')) this.load.spritesheet('slime2_run', s2 + 'Slime2_Run_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_attack')) this.load.spritesheet('slime2_attack', s2 + 'Slime2_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_hurt')) this.load.spritesheet('slime2_hurt', s2 + 'Slime2_Hurt_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_death')) this.load.spritesheet('slime2_death', s2 + 'Slime2_Death_with_shadow.png', cfg);
    const s3 = 'sprite/slime/PNG/Slime3/With_shadow/';
    if (!this.textures.exists('slime3_idle')) this.load.spritesheet('slime3_idle', s3 + 'Slime3_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_walk')) this.load.spritesheet('slime3_walk', s3 + 'Slime3_Walk_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_run')) this.load.spritesheet('slime3_run', s3 + 'Slime3_Run_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_attack')) this.load.spritesheet('slime3_attack', s3 + 'Slime3_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_hurt')) this.load.spritesheet('slime3_hurt', s3 + 'Slime3_Hurt_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_death')) this.load.spritesheet('slime3_death', s3 + 'Slime3_Death_with_shadow.png', cfg);
    for (const n of [1, 2, 3]) {
      const pb = `sprite/flower/PNG/Plant${n}/With_shadow/Plant${n}`;
      const pk = `plant${n}`;
      if (!this.textures.exists(`${pk}_idle`)) this.load.spritesheet(`${pk}_idle`, `${pb}_Idle_with_shadow.png`, cfg);
      if (!this.textures.exists(`${pk}_attack`)) this.load.spritesheet(`${pk}_attack`, `${pb}_Attack_with_shadow.png`, cfg);
      if (!this.textures.exists(`${pk}_hurt`)) this.load.spritesheet(`${pk}_hurt`, `${pb}_Hurt_with_shadow.png`, cfg);
      if (!this.textures.exists(`${pk}_death`)) this.load.spritesheet(`${pk}_death`, `${pb}_Death_with_shadow.png`, cfg);
    }
    for (const n of [1, 2, 3]) {
      const ob = `sprite/orc/PNG/Orc${n}/With_shadow/orc${n}`;
      const ok = `orc${n}`;
      if (!this.textures.exists(`${ok}_idle`)) this.load.spritesheet(`${ok}_idle`, `${ob}_idle_with_shadow.png`, cfg);
      if (!this.textures.exists(`${ok}_walk`)) this.load.spritesheet(`${ok}_walk`, `${ob}_walk_with_shadow.png`, cfg);
      if (!this.textures.exists(`${ok}_run`)) this.load.spritesheet(`${ok}_run`, `${ob}_run_with_shadow.png`, cfg);
      if (!this.textures.exists(`${ok}_attack`)) this.load.spritesheet(`${ok}_attack`, `${ob}_attack_with_shadow.png`, cfg);
      if (!this.textures.exists(`${ok}_hurt`)) this.load.spritesheet(`${ok}_hurt`, `${ob}_hurt_with_shadow.png`, cfg);
      if (!this.textures.exists(`${ok}_death`)) this.load.spritesheet(`${ok}_death`, `${ob}_death_with_shadow.png`, cfg);
    }
    for (const n of [1, 2, 3]) {
      const vb = `sprite/vampire/PNG/Vampires${n}/With_shadow/Vampires${n}`;
      const vk = `vampire${n}`;
      if (!this.textures.exists(`${vk}_idle`)) this.load.spritesheet(`${vk}_idle`, `${vb}_Idle_with_shadow.png`, cfg);
      if (!this.textures.exists(`${vk}_run`)) this.load.spritesheet(`${vk}_run`, `${vb}_Run_with_shadow.png`, cfg);
      if (!this.textures.exists(`${vk}_attack`)) this.load.spritesheet(`${vk}_attack`, `${vb}_Attack_with_shadow.png`, cfg);
      if (!this.textures.exists(`${vk}_hurt`)) this.load.spritesheet(`${vk}_hurt`, `${vb}_Hurt_with_shadow.png`, cfg);
      if (!this.textures.exists(`${vk}_death`)) this.load.spritesheet(`${vk}_death`, `${vb}_Death_with_shadow.png`, cfg);
    }
    if (!this.textures.exists('icon_stone_broken')) this.load.image('icon_stone_broken', 'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact')) this.load.image('icon_stone_intact', 'other/ore1.webp');
    if (!this.textures.exists('icon_stone_guard')) this.load.image('icon_stone_guard', 'other/ore3.webp');
    if (!this.textures.exists('icon_stone_breakthrough')) this.load.image('icon_stone_breakthrough', 'icon3/PNG/Transperent/Icon28.png');
    if (!this.textures.exists('icon_quest_reroll')) this.load.image('icon_quest_reroll', 'other/ore4.webp');
    if (!this.textures.exists('icon_equip_drop')) this.load.image('icon_equip_drop', 'equip/weapons/Icons/Iicon_32_01.png');
    if (!this.textures.exists('icon_ticket_slime')) this.load.image('icon_ticket_slime', 'icon1/PNG/Transperent/Icon21.png');
    if (!this.textures.exists('icon_ticket_flower')) this.load.image('icon_ticket_flower', 'icon1/PNG/Transperent/Icon37.png');
    if (!this.textures.exists('icon_ticket_orc')) this.load.image('icon_ticket_orc', 'icon1/PNG/Transperent/Icon44.png');
    if (!this.textures.exists('icon_ticket_vampire')) this.load.image('icon_ticket_vampire', 'icon1/PNG/Transperent/Icon42.png');
    for (let i = 1; i <= 40; i++) {
      const key = `equip_sword${i}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/Iicon_32_${String(i).padStart(2, '0')}.png`);
    }
    for (let i = 1; i <= 30; i++) {
      const key = `equip_sword${i + 40}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/icon_32_2_${String(i).padStart(2, '0')}.png`);
    }
    for (let i = 1; i <= 4; i++) {
      const key = `equip_legendary_sw${i}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/weapons/Icons/red/sw${i}.png`);
    }
    if (!this.textures.exists('icon_gold')) this.load.image('icon_gold', 'other/coin.webp');
    if (!this.textures.exists('potions_sheet')) this.load.spritesheet('potions_sheet', 'items/potions.png', { frameWidth: 16, frameHeight: 16 });
    if (!this.textures.exists('chests')) this.load.spritesheet('chests', 'items/RPG Chests.png', { frameWidth: 32, frameHeight: 32 });
    if (!this.cache.audio.exists('sfx_hit')) this.load.audio('sfx_hit', 'sound/hit2.mp3');
    if (!this.cache.audio.exists('sfx_open_chest')) this.load.audio('sfx_open_chest', 'sound/test-openChest.mp3');
    if (!this.cache.audio.exists('sfx_pickup')) this.load.audio('sfx_pickup', 'sound/test-toggle.mp3');
    if (!this.cache.audio.exists('sfx_map3')) this.load.audio('sfx_map3', 'sound/map3.mp3');
    if (!this.cache.audio.exists('sfx_map4')) this.load.audio('sfx_map4', 'sound/map4.mp3');
    if (!this.cache.audio.exists('sfx_boss_bgm')) this.load.audio('sfx_boss_bgm', 'sound/boss-bgm.mp3');
    if (!this.cache.audio.exists('sfx_boss_roar')) this.load.audio('sfx_boss_roar', 'sound/Boss-start.mp3');
    if (!this.cache.audio.exists('sfx_level_up')) this.load.audio('sfx_level_up', 'sound/success.mp3');
    if (!this.cache.audio.exists('sfx_player_hurt')) this.load.audio('sfx_player_hurt', 'sound/test-close.mp3');
    if (!this.cache.audio.exists('sfx_boss_death')) this.load.audio('sfx_boss_death', 'sound/boss-death.mp3');
    if (!this.cache.audio.exists('sfx_player_dead')) this.load.audio('sfx_player_dead', 'sound/test-fail.mp3');
    if (!this.cache.audio.exists('sfx_potion')) this.load.audio('sfx_potion', 'sound/plus.mp3');
    if (!this.cache.audio.exists('sfx_swing1')) this.load.audio('sfx_swing1', 'sound/swing-1.mp3');
    if (!this.cache.audio.exists('sfx_swing2')) this.load.audio('sfx_swing2', 'sound/swing-2.mp3');
    if (!this.cache.audio.exists('sfx_swing3')) this.load.audio('sfx_swing3', 'sound/swing-3.mp3');
    if (!this.cache.audio.exists('sfx_swing4')) this.load.audio('sfx_swing4', 'sound/swing-4.mp3');
    if (!this.cache.audio.exists('sfx_swing5')) this.load.audio('sfx_swing5', 'sound/skill-2.mp3');
    this.generateTextures();
  }

  init(data: { seed?: number; questStar?: number; bossMonsterId?: string; mapParams?: MapParams; partnerNickname?: string; playerCount?: number; ownSkinId?: number; partnerSkinId?: number; mapTheme?: GameScene['_mapTheme']; towerFloor?: number; legendaryMode?: boolean; isTutorial?: boolean }): void {
    this._towerFloor = data?.towerFloor ?? 0;
    this._legendaryMode = data?.legendaryMode ?? false;
    this._mapSeed = data?.seed ?? Math.floor(Math.random() * 1_000_000);
    this._mapTheme = data?.mapTheme ?? 'lava';
    this._initQuestStar = data?.questStar;
    this._initBossId = data?.bossMonsterId;
    this._mapParams = data?.mapParams;
    this._partnerNickname = data?.partnerNickname ?? '';
    this._playerCount = data?.playerCount ?? (this._partnerNickname ? 2 : 1);
    this._ownSkinId = data?.ownSkinId ?? 0;
    this._partnerSkinId = data?.partnerSkinId ?? 0;
    this._isTutorial = data?.isTutorial ?? false;
    if (this._isTutorial) this._tutorialInitData = data;

    // Clear cached skin textures/anims so preload can reload with potentially new skin
    ['player', 'partner'].forEach(prefix => {
      ['idle_shadow', 'run_shadow', 'attack_shadow', 'run_attack_shadow', 'hurt', 'death_shadow'].forEach(suffix => {
        const key = `${prefix}_${suffix}`;
        if (this.textures.exists(key)) this.textures.remove(key);
      });
      ['idle_down', 'idle_up', 'idle_left', 'idle_right',
        'run_down', 'run_up', 'run_left', 'run_right',
        'attack_down', 'attack_up', 'attack_left', 'attack_right',
        'run_attack_down', 'run_attack_up', 'run_attack_left', 'run_attack_right',
        'multihit_down', 'multihit_up', 'multihit_left', 'multihit_right',
        'hurt', 'whirlwind',
      ].forEach(suffix => {
        const key = `${prefix}_${suffix}`;
        if (this.anims.exists(key)) this.anims.remove(key);
      });
    });
  }

  create(): void {
    this._initPotionTextures();
    const W = this.scale.width;

    // 隨機播放其中一首戰鬥背景音樂
    const bgmKey = Math.random() < 0.5 ? 'sfx_map3' : 'sfx_map4';
    AudioService.playBgm(this, bgmKey, 0.45);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => AudioService.stopBgm());

    // 遊戲一開始就清掉大廳 callbacks，避免 Guest 先退出時觸發 stale rebuild
    if (NetworkService.connected) NetworkService.clearLobbyCallbacks();
    this.gameOver = false;
    this.bossActive = false;
    this.teleporting = false;
    this._towerBoss2 = undefined;
    this._towerWalls = undefined;
    this._towerCorridorRects = [];
    this._mazeRooms = [];
    this._mazeRows = 0;
    this._mazeCols = 0;
    this._currentRoomKey = '';
    this._miniMapGfx = undefined;
    this._mazeDarkRt = undefined;
    this._mazePoisonTimer?.destroy();
    this._mazePoisonTimer = undefined;
    this._mazeTrapTimer?.destroy();
    this._mazeTrapTimer = undefined;
    this._mazeRoomSealedActive = false;
    this._stairsGfx = undefined;
    this._stairsZone = undefined;
    this.allMinions = [];
    this.lootDrops = [];
    this._chests = [];
    this._zoneAlive.clear();
    this._sessionLoot = [];
    this._flowerThreeMinions.clear();
    this._pendingFlowerSeeds = 0;
    this._slowZones = [];
    this._rainPuddles = [];
    this._rainPuddleHitCd = 0;
    this._orbitBalls.forEach(b => b.gfx.destroy());
    this._orbitBalls = [];
    this._orbitAngle = 0;
    this._partnerOrbitBalls.forEach(arr => arr.forEach(b => b.gfx.destroy()));
    this._partnerOrbitBalls.clear();
    this._playerKnives.forEach(k => k.gfx.destroy());
    this._playerKnives = [];
    this._partnerKnives.forEach(k => k.gfx.destroy());
    this._partnerKnives = [];
    this._divineShieldTimer?.destroy();
    this._divineShieldTimer = undefined;
    this._freeRevivesUsed = 0;
    this._blazingTimer?.destroy();
    this._blazingTimer = undefined;
    this._blazingActive = false;
    this._blazingGfx?.destroy();
    this._blazingGfx = undefined;
    this._fearAuraTimer?.destroy();
    this._fearAuraTimer = undefined;
    this._fearAuraGfx?.destroy();
    this._fearAuraGfx = undefined;
    this._impaleHitCount = 0;
    this._allyMinions = [];
    this.bossDebuffTexts.clear();
    this.hitBatches.clear();
    this.homingProjs = [];
    this._minionTargets.clear();
    this.activeFires = [];
    this.plantZones.forEach(z => z.gfx?.destroy());
    this.plantZones = [];
    this.pickupLog.forEach(t => t.destroy());
    this.pickupLog = [];
    this._partners.forEach(pd => {
      pd.sprite.destroy(); pd.label.destroy(); pd.hpBar.destroy(); pd.auraRing.destroy();
    });
    this._partners.clear();

    this._atkBuffActive = false;
    this._atkBuffTimer?.destroy();
    this._atkBuffTimer = undefined;
    this._buffExpiry.clear();
    this._buffHudTexts.forEach(t => t.destroy());
    this._buffHudTexts = [];
    this._sessionQty.clear();
    this._potionCdUntil.clear();
    for (const id of [ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L,
                      ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED]) {
      this._sessionQty.set(id, InventoryStore.getItemQty(id));
    }

    if (this._towerFloor > 0) {
      this.buildTowerRoom(); // sets playerStartX/Y internally
    } else if (this._legendaryMode) {
      // 兩個航點：安全區 + 傳送門（緊鄰），其餘全走現有地圖系統
      const PAD = P(500);
      const raw = [
        new Phaser.Math.Vector2(0, 0),
        new Phaser.Math.Vector2(P(300), 0),
      ];
      const offX = -PAD, offY = -PAD;
      this.waypoints = raw.map(p => new Phaser.Math.Vector2(p.x - offX, p.y - offY));
      const ar = this.BOSS_ARENA_RADIUS;
      this.worldW = P(300) + PAD * 2 + ar * 2 + P(700);
      this.worldH = Math.max(PAD * 2, ar * 2 + P(600));
      this.bossArenaCenter.set(this.worldW - ar - P(200), Math.round(this.worldH / 2));
      this.bossArenaShape = 0;
      this.bossMonsterId = this._initBossId ?? 'boss_slime_legendary';
      this.questStar = this._initQuestStar ?? 6;
      this.generateAndDrawMap();
      this.wallLayer = this.buildWallTilemap();
      this.playerStartX = this.waypoints[0].x;
      this.playerStartY = this.waypoints[0].y;
    } else {
      this.generateWaypoints();   // sets this.worldW / worldH / waypoints
      this.generateAndDrawMap();
      this.wallLayer = this.buildWallTilemap();
      const startPt = this.waypoints[0];
      this.playerStartX = startPt.x;
      this.playerStartY = startPt.y;
    }
    this.lastSafeX = this.playerStartX;
    this.lastSafeY = this.playerStartY;

    if (this._towerFloor > 0 && this._towerFloor % 5 === 0) {
      // Boss floor: inset world bounds to match visual walls.
      const TW = P(24);
      this.physics.world.setBounds(TW, 0, this.worldW - TW * 2, this.worldH - TW);
    } else {
      this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    }
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.createPlayerAnims();
    if (NetworkService.connected) this.createPartnerAnims();
    this.createSlimeAnims();
    this._createChestAnims();
    this.player = new Player(this, this.playerStartX, this.playerStartY);
    if (this._isTutorial) this.player.addMaxHp(1000);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.player.onDead = () => this.handlePlayerDead();
    this.player.onEvade = (x, y) => this.spawnEvadeText(x, y);

    // ── Co-op: partner sprites + position sync ─────────────
    if (NetworkService.connected) {
      // Partner sprites are created lazily on first partnerPos / partnerJoined.
      NetworkService.onPartnerJoined(({ sessionId, nickname, level: _l, skinId }) => {
        if (!sessionId) return;
        const pd = this._getOrCreatePartner(sessionId, nickname ?? '', skinId ?? 0);
        if (nickname) pd.label.setText(nickname);
      });

      // Send player info so all partners receive our name via partnerJoined (reliable for 3+ players).
      // Also send behavior/nickname via attack channel as a fast-path fallback.
      this.time.delayedCall(600, () => {
        NetworkService.sendPlayerInfo(
          localStorage.getItem('playerName') ?? '',
          PlayerStore.getLevel(),
          this._ownSkinId,
        );
        const behavior = SkillTreeStore.getAttackMode();
        const nickname = localStorage.getItem('playerName') ?? '';
        NetworkService.sendAttack(`__behavior_init__:${nickname}`, 0, 0, 'down', behavior);
      });

      NetworkService.onPartnerPos(({ sessionId, x, y, lastDir, hp, maxHp }) => {
        const sid = sessionId ?? '__unknown__';
        const pd = this._getOrCreatePartner(sid);
        const wx = x * DPR, wy = y * DPR;  // restore to local DPR space
        if (hp !== undefined) pd.hp = hp;
        if (maxHp !== undefined) pd.maxHp = maxHp;
        this._drawPartnerHpBarFor(pd);
        // Auto-revive: partner sent positive HP after being marked dead
        if (pd.isDead && hp !== undefined && hp > 0) {
          pd.isDead = false;
          pd.sprite.play(`partner_idle_${pd.prevDir}`, true);
        }
        // Don't update position or animation while partner is dead
        if (pd.isDead) return;
        const moved = Math.abs(wx - pd.prevX) > 0.5 || Math.abs(wy - pd.prevY) > 0.5;
        // Don't override a playing attack animation
        if (!pd.sprite.anims.currentAnim?.key.includes('attack') &&
          !pd.sprite.anims.currentAnim?.key.includes('whirlwind') &&
          !pd.sprite.anims.currentAnim?.key.includes('multihit')) {
          const animKey = moved ? `partner_run_${lastDir}` : `partner_idle_${lastDir}`;
          if (pd.sprite.anims.currentAnim?.key !== animKey) pd.sprite.play(animKey, true);
        }
        pd.sprite.setPosition(wx, wy);
        pd.label.setPosition(wx, wy - P(40));
        pd.prevX = wx;
        pd.prevY = wy;
        pd.prevDir = lastDir;
      });

      // Send HP whenever it changes, via the attack channel (no server changes needed)
      this.player.onHpChanged = (hp, maxHp) => {
        NetworkService.sendAttack(`__hp__:${hp}:${maxHp}`, 0, 0, 'down', '');
      };
      // Send initial HP so partner bar starts correct
      NetworkService.sendAttack(`__hp__:${this.player.currentHp}:${this.player.maxHpValue}`, 0, 0, 'down', '');

      NetworkService.onPartnerAttack(({ sessionId, animKey, x: _x, y: _y, dir, behavior }) => {
        // HP update piggybacked on attack channel
        if (animKey.startsWith('__hp__:')) {
          const parts = animKey.split(':');
          const sid = sessionId ?? '__unknown__';
          const pd = this._getOrCreatePartner(sid);
          pd.hp = parseInt(parts[1]);
          pd.maxHp = parseInt(parts[2]);
          this._drawPartnerHpBarFor(pd);
          return;
        }
        // Behavior handshake — store partner's weapon type and nickname
        if (animKey.startsWith('__behavior_init__')) {
          const sid = sessionId ?? '__unknown__';
          const pd = this._getOrCreatePartner(sid);
          pd.behavior = behavior;
          const colon = animKey.indexOf(':');
          if (colon !== -1) pd.label.setText(animKey.slice(colon + 1));
          return;
        }
        const sid = sessionId ?? '__unknown__';
        const pd = this._partners.get(sid);
        if (!pd) return;
        const partnerAnimKey = animKey.replace(/^player_/, 'partner_');
        pd.sprite.play(partnerAnimKey, true);
        pd.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          pd.sprite.play(`partner_idle_${pd.prevDir}`, true);
        });
        this.showPartnerAttackFX(behavior, pd.sprite.x, pd.sprite.y, dir);
      });

      // Send local attack info to partner (DPR-normalised)
      this.player.onAttackAnim = (key, targetAngle?) => {
        let behavior: string = SkillTreeStore.getAttackMode();
        // Encode visual variants so partner can render the correct FX
        if (behavior === 'projectile') {
          const pStats = CardStore.getTotalStats();
          if ((pStats.projectileFan ?? 0) >= 1) behavior = 'projectile_fan';
        }
        // Prefer exact radian angle; fall back to cardinal dir extracted from animKey
        const dir = targetAngle !== undefined ? String(targetAngle) : (key.split('_').pop() ?? this.player.lastDir);
        NetworkService.sendAttack(key, this.player.x / DPR, this.player.y / DPR, dir, behavior);
      };

      NetworkService.onPartnerLeft(() => {
        this._partners.forEach(pd => {
          pd.sprite.setVisible(false);
          pd.label.setVisible(false);
          pd.hpBar.setVisible(false);
        });
      });

      NetworkService.onReconnected(() => this._onReconnected());
      NetworkService.onReconnectFailed(() => this._onReconnectFailed());

      NetworkService.onHostDisconnected(() => {
        this._hostReconnecting = true;
        this._showHostReconnectOverlay();
      });

      NetworkService.onHostReconnected(() => {
        this._hostReconnecting = false;
        this._hideHostReconnectOverlay();
      });

      NetworkService.onPartyExit(() => {
        this._showMissionAbortOverlay(tr('game.hud.partnerLeft'), tr('game.hud.questStop'));
        this.time.delayedCall(1800, () => this.exitToLobby());
      });

      NetworkService.onRunEnd(() => {
        // Host failed to reconnect within timeout
        this._hostReconnecting = false;
        this._hideHostReconnectOverlay();
        this._showMissionAbortOverlay(tr('game.hud.hostDisconnect'), tr('game.hud.battleStop'));
        this.time.delayedCall(2200, () => this.exitToLobby());
      });

      NetworkService.onPartnerDead((data) => {
        const sid = data?.sessionId ?? '';
        if (sid) {
          const pd = this._partners.get(sid);
          if (pd) { pd.isDead = true; pd.sprite.stop(); pd.sprite.setTexture('partner_death_shadow', 6); }
        } else {
          // fallback: mark all partners dead
          this._partners.forEach(pd => { pd.isDead = true; pd.sprite.stop(); pd.sprite.setTexture('partner_death_shadow', 6); });
        }
      });

      NetworkService.onPotionEffect(({ type, amount }) => {
        const firstPartner = this._partners.values().next().value as PartnerData | undefined;
        const sx = firstPartner?.sprite?.x ?? this.player.x;
        const sy = firstPartner?.sprite?.y ?? this.player.y;
        const range = P(this.POTION_RANGE);
        if (type === 'heal') {
          this.player.heal(amount);
          this.showMagicSeal(sx, sy + P(13), range, 0x44ff88, 'heal');
        } else if (type === 'revive' && this.gameOver) {
          this.gameOver = false;
          this.player.revive(amount / 100);
          this.player.play(`player_idle_${this.player.lastDir}`);
          this.showMagicSeal(sx, sy + P(13), range, 0xffee44, 'revive');
        } else if (type === 'atk') {
          this._atkBuffActive = true;
          this._atkBuffTimer?.destroy();
          this._atkBuffTimer = this.time.delayedCall(amount, () => {
            this._atkBuffActive = false;
            this._buffExpiry.delete(ITEM_POTION_ATK);
            this.refreshBuffHud();
          });
          this._buffExpiry.set(ITEM_POTION_ATK, this.time.now + amount);
          this.refreshBuffHud();
        } else if (type === 'def') {
          this.player.defBonus = 20;
          this.time.delayedCall(amount, () => {
            this.player.defBonus = 0;
            this._buffExpiry.delete(ITEM_POTION_DEF);
            this.refreshBuffHud();
          });
          this._buffExpiry.set(ITEM_POTION_DEF, this.time.now + amount);
          this.refreshBuffHud();
        } else if (type === 'speed') {
          this.player.speedBonus = 20;
          this.time.delayedCall(amount, () => {
            this.player.speedBonus = 0;
            this._buffExpiry.delete(ITEM_POTION_SPEED);
            this.refreshBuffHud();
          });
          this._buffExpiry.set(ITEM_POTION_SPEED, this.time.now + amount);
          this.refreshBuffHud();
        }
      });

      // Sync minion HP from server (either player's hit gets broadcast back)
      NetworkService.onMinionHit(({ minionId, hp, isDead }) => {
        const m = this.allMinions.find(mn => mn.minionId === minionId);
        if (m) m.applyServerHp(hp, isDead);
      });

      // Sync boss HP from server
      NetworkService.onBossHit(({ hp, isDead }) => {
        if (!this.bossActive || !this.boss?.active) return;
        this.boss.applyServerHp(hp, isDead);
        this.refreshBossBar();
      });

      // Guest: register bossSync handler (guestMode set after boss is created below)
      if (!NetworkService.isHost) {
        NetworkService.onBossSync((data) => {
          if (!this.boss?.active) return;
          if (!this.bossActive && !this.teleporting) {
            this.bossActive = true;
            this.teleporting = true;
            this.player.move(0, 0);
            (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
            this.teleportToBossArena();
          }
          this.boss.applyServerState(data);
        });

        NetworkService.onRewardSync((data) => {
          this.guestReward = data;
        });
      }

      if (NetworkService.isHost) {
        // Host broadcasts all alive minion positions every 100 ms (DPR-normalised)
        this.time.addEvent({
          delay: 100, loop: true,
          callback: () => {
            const alive = this.allMinions.filter(m => !m.isDead);
            if (alive.length === 0) return;
            NetworkService.sendMinionSync(alive.map(m => ({
              id: m.minionId, x: m.x / DPR, y: m.y / DPR,
              hp: m.currentHp, maxHp: m.maxHpValue, isDead: false, isDashing: m.isDashing,
            })));
          },
        });
      } else {
        // Guest stores lerp targets; actual movement happens in update()
        NetworkService.onMinionSync(({ minions }) => {
          for (const data of minions) {
            this._minionTargets.set(data.id, { x: data.x * DPR, y: data.y * DPR, isDashing: data.isDashing ?? false });
          }
        });

        NetworkService.onAllySpawn(({ minionId, defId }) => {
          if (!this.allMinions.some(m => m.minionId === minionId)) {
            this._spawnGuestAllyFlower(minionId, defId);
          }
        });

        NetworkService.onAllyKill(({ minionId }) => {
          const ally = this.allMinions.find(m => m.minionId === minionId);
          if (ally && !ally.isDead) ally.forceKill();
        });

        NetworkService.onChestSync(({ chests }) => {
          for (const data of chests) {
            const cx = data.x * DPR, cy = data.y * DPR;
            const type = data.type as ChestType;
            const sprite = this._makeChestSprite(cx, cy, type);
            if (data.big) sprite.setDisplaySize(P(65), P(65));
            if (!data.unlocked) sprite.setTint(0x444444);
            const shadow = this._makeChestShadow(cx, cy, !!data.big);
            const entry: ChestEntry = { zoneIdx: data.zoneIdx, x: cx, y: cy, type, sprite, shadow, unlocked: data.unlocked, opening: false, big: !!data.big };
            this._chests.push(entry);
            if (data.unlocked) this._setupChestInteraction(entry);
          }
        });

        NetworkService.onChestUnlock(({ id }) => {
          const chest = this._chests[id];
          if (chest && !chest.unlocked) this._unlockChest(chest);
        });

        NetworkService.onChestOpen(({ id }) => {
          const chest = this._chests[id];
          if (chest) this._openChest(chest, true);
        });
      }

      // Send our own position to server every 50 ms (DPR-normalised so devices match)
      this.time.addEvent({
        delay: 50, loop: true,
        callback: () => NetworkService.sendMove(this.player.x / DPR, this.player.y / DPR, this.player.lastDir, this.player.currentHp, this.player.maxHpValue),
      });

      // Show reconnecting overlay when app returns from background
      const onVisibility = () => {
        if (document.hidden) return;
        if (NetworkService.isReconnecting()) this._showReconnectOverlay();
      };
      document.addEventListener('visibilitychange', onVisibility);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        document.removeEventListener('visibilitychange', onVisibility));
    }

    let bossWp = new Phaser.Math.Vector2(0, 0);

    // 必須在任何 overlap 使用 _allyGroup 之前建立，避免第二場時持有已銷毀的舊群組
    this._allyGroup = this.physics.add.group();
    this.minionProjGroup = this.physics.add.group();

    if (this._towerFloor === 0) {
      bossWp = this.waypoints[this.waypoints.length - 1];
      const bossDef = getMonsterDef(this.bossMonsterId)!;
      const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
      const coopMult = CO_OP_HP_MULTS[this._playerCount] ?? CO_OP_HP_MULTS[2];
      const bossInitHp = Math.round(bossDef.hp * hpMult * coopMult);
      this.boss = this.createBoss(bossDef, bossInitHp);
      this.boss.questStar = this.questStar;
      if (NetworkService.connected && NetworkService.isHost) {
        NetworkService.sendBossInit(bossInitHp);
      }
      if (NetworkService.connected && !NetworkService.isHost) {
        this.boss.guestMode = true;
      }
      this.boss.arenaRadius = this.BOSS_ARENA_RADIUS;
      this.boss.arenaShape = this.bossArenaShape;
      this.boss.def = Math.round((bossDef.def ?? 0) * (STAR_DEF_MULT[this.questStar] ?? 0));
      bossDef.fillTint ? this.boss.setTintFill(bossDef.tint) : this.boss.setTint(bossDef.tint);
      this.boss.setVisible(false);
      this.boss.getTargetPos = () => this.nearestTargetPos(this.boss.x, this.boss.y);
      this.boss.hasValidTarget = () => this.hasAnyValidTarget();
      this.boss.onHpChanged = () => this.refreshBossBar();
      this.boss.onDead = () => this.handleBossDefeated();
      this.boss.onAoeExplode = (x, y) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(this.boss.scaleDmg(75));
        this.damageAlliesNear(x, y, Boss.AOE_RADIUS, this.boss.scaleDmg(75));
      };
      this.boss.onRangedBarrageTrailTick = (x1, y1, x2, y2, radius, dmg) => {
        if (!this.bossActive) return;
        const abx = x2 - x1, aby = y2 - y1;
        const apx = this.player.x - x1, apy = this.player.y - y1;
        const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)));
        const nx = x1 + t * abx - this.player.x;
        const ny = y1 + t * aby - this.player.y;
        if (nx * nx + ny * ny <= radius * radius) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (ally.isDead) continue;
          const apxa = ally.x - x1, apya = ally.y - y1;
          const ta = Math.max(0, Math.min(1, (apxa * abx + apya * aby) / (abx * abx + aby * aby || 1)));
          const nxa = x1 + ta * abx - ally.x, nya = y1 + ta * aby - ally.y;
          if (nxa * nxa + nya * nya <= radius * radius) ally.takeDamage(dmg);
        }
      };

      this.boss.onBarrageOrbHit = (x, y, dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
        this.damageAlliesNear(x, y, P(20), dmg);
      };

      const bossGroup = this.physics.add.group();
      bossGroup.add(this.boss, false);
      (this.boss.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

      this.physics.add.overlap(bossGroup, this.player, () => {
        if (!this.bossActive) return;
        if (this.boss.currentState === 'DASHING') this.player.takeDamage(this.boss.scaleDmg(75));
      });
      this.physics.add.overlap(bossGroup, this._allyGroup, (_b, allyObj) => {
        if (!this.bossActive) return;
        const ally = allyObj as MinionSlime;
        if (this.boss.currentState !== 'DASHING' || ally.isDead) return;
        const now = this.time.now;
        if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
        (ally as any)._lastDashHit = now;
        ally.takeDamage(this.boss.scaleDmg(75));
      });
    }

    this.player.setCollideWorldBounds(true);

    const _wl = this._towerWalls ?? this.wallLayer;
    if (_wl) this.physics.add.collider(this.player, _wl);
    if (this.boss && _wl) this.physics.add.collider(this.boss, _wl);
    this.physics.add.overlap(this.minionProjGroup, this._allyGroup, (proj, _ally) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      const ally = _ally as MinionSlime;
      if (!p.active || ally.isDead) return;
      if ((p as any).isAllyProj) return;  // 友軍發射的彈道不打到友軍
      ally.takeDamage((p as any).dmg as number);
      p.destroy();
    });
    this.physics.add.overlap(this.minionProjGroup, this.player, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (!p.active) return;
      if ((p as any).isAllyProj) return;  // 友軍發射的彈道不打玩家
      const blindDist = (p as any).blindDist as number | undefined;
      if (blindDist && blindDist > 0) {
        const spx = (p as any).spawnX, spy = (p as any).spawnY;
        const bdx = p.x - spx, bdy = p.y - spy;
        if (bdx * bdx + bdy * bdy < blindDist * blindDist) return;
      }
      // 同批彈幕只算一發：100ms 內相同 batchId 不重複傷害
      const batchId = (p as any).batchId as number | undefined;
      if (batchId !== undefined) {
        const lastHit = this.hitBatches.get(batchId);
        if (lastHit !== undefined && this.time.now - lastHit < 100) {
          p.destroy();
          return;
        }
        this.hitBatches.set(batchId, this.time.now);
      }
      this.player.takeDamage((p as any).dmg as number);
      const isHoming = (p as any).blindDist < 0 || this.homingProjs.includes(p);
      if (isHoming) this.petalHitVfx(p.x, p.y, p.texture.key === 'proj_homing_petal_large');
      const idx = this.homingProjs.indexOf(p);
      if (idx !== -1) this.homingProjs.splice(idx, 1);
      p.destroy();
    });

    // Homing projectile steering (every 150ms)
    this.time.addEvent({
      delay: 150, loop: true, callback: () => {
        this.homingProjs = this.homingProjs.filter(p => p.active);
        this.homingProjs.forEach(p => {
          const targetAngle = Phaser.Math.Angle.Between(p.x, p.y, this.player.x, this.player.y);
          const body = p.body as Phaser.Physics.Arcade.Body;
          const curAngle = Math.atan2(body.velocity.y, body.velocity.x);
          const diff = Phaser.Math.Angle.Wrap(targetAngle - curAngle);
          const newAngle = curAngle + diff * 0.28;
          const speed = (p as any).homingSpeed as number;
          (this.physics as Phaser.Physics.Arcade.ArcadePhysics)
            .velocityFromAngle(Phaser.Math.RadToDeg(newAngle), speed, body.velocity);
        });
      },
    });

    if (NetworkService.connected && !NetworkService.isHost) {
      NetworkService.onMinionAttack(data => {
        const before = this.minionProjGroup.getLength();
        if (data.type === 'blood_channel') {
          this.bloodChannelFloorWarn(data.mx, data.my, data.tx, data.ty, data.isElite ?? false, MinionSlime.BLOOD_CHANNEL_WARN_MS);
          this.time.delayedCall(MinionSlime.BLOOD_CHANNEL_WARN_MS, () => {
            this.spawnMinionAttack(data.type, data.mx, data.my, data.tx, data.ty, data.atk, data.isElite);
          });
        } else {
          this.spawnMinionAttack(data.type, data.mx, data.my, data.tx, data.ty, data.atk, data.isElite);
        }
        if (data.isAlly) {
          const projs = this.minionProjGroup.getChildren();
          for (let i = before; i < projs.length; i++) {
            (projs[i] as any).isAllyProj = true;
            (projs[i] as Phaser.Physics.Arcade.Image).setTint(0x44ff88);
          }
        }
      });
    }

    this._initBossBar();

    const kb = this.input.keyboard!;
    this.keys = kb.createCursorKeys();
    this.wasd = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.spaceKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.qKey     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.eKey     = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    // Disable keyboard capture while a text input is focused (e.g. mobile keyboard open)
    const onFocusIn  = (e: FocusEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { kb.enabled = false; kb.disableGlobalCapture(); } };
    const onFocusOut = (e: FocusEvent) => { if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) { kb.enabled = true;  kb.enableGlobalCapture();  } };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      this._spaceHoldTimer?.destroy();
      this._spaceHoldTimer = undefined;
    });

    const onResize = () => this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(this);
    if (!VirtualJoystick.isTouchDevice()) this.joystick.hide();

    if (this._isTutorial) {
      this.time.delayedCall(600, () => this._showBattleTutorial(
        '🕹', tr('game.hud.move'), tr('game.loot.joystick.desc'), 'move',
        () => this._showBattleTutorial(
          '⚔', tr('stat.atk'), tr('game.loot.attack.desc'), 'attack',
        ),
      ));
    }

    this.addHUD();
    this.createExitButton();
    if (this._towerFloor > 0) {
      this.spawnTowerFloor();
    } else if (this._legendaryMode) {
      this.setupPortal(bossWp.x, bossWp.y);  // 不生普通怪，直接放傳送門
    } else {
      this.spawnAllMonsters();
      this.setupPortal(bossWp.x, bossWp.y);
    }

    // 燃燒狀態 tick（400ms，處理疊層與傷害）
    this.time.addEvent({ delay: 400, repeat: -1, callback: this.tickBurns, callbackScope: this });

    // 血環被動計時器（線性：0%攻速=300ms，75%攻速=200ms，超過75%仍維持200ms）
    const scheduleAuraTick = () => {
      const atkSpd = this.getEffectiveAtkSpeed();
      const delay = Math.max(200, Math.round(300 - (atkSpd / 0.75) * 100));
      this.auraTimer = this.time.delayedCall(delay, () => { this.tickAura(); scheduleAuraTick(); });
    };
    scheduleAuraTick();

    // HP恢復計時器（每秒恢復）
    this.time.addEvent({
      delay: 1000, repeat: -1,
      callback: () => {
        const regen = CardStore.getTotalStats().hpRegen;
        if (regen > 0 && this.player.active) this.player.heal(regen);
      },
    });

    this.initSpecialCardEffects();

    // 血環持續視覺圈圈（只有裝備血環時才顯示）
    this.auraRing = this.add.graphics().setDepth(this.player.depth - 1);
    this.tweens.add({
      targets: this.auraRing, alpha: { from: 0.25, to: 0.55 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.auraTimer?.destroy(); this.auraRing?.destroy(); this._fearAuraTimer?.destroy(); this._fearAuraGfx?.destroy(); });
  }

  // ══════════════════════════════════════════════════════════════
  // ── Special card effects ──────────────────────────────────────

  private initSpecialCardEffects(): void {
    const stats = CardStore.getTotalStats();
    this._freeRevivesUsed = 0;
    this._impaleHitCount = 0;
    this._blazingActive = false;

    // 業火盾觸發回調
    this.player.onBlazing = (x, y) => this._triggerBlazing(x, y);

    // 旋轉球：火冰交錯排列
    const nFire = stats.orbitFireBalls ?? 0;
    const nIce = stats.orbitIceBalls ?? 0;
    const types: ('fire' | 'ice')[] = [];
    let fi = 0, ii = 0;
    while (fi < nFire || ii < nIce) {
      if (fi < nFire) { types.push('fire'); fi++; }
      if (ii < nIce) { types.push('ice'); ii++; }
    }
    const total = types.length;
    for (let i = 0; i < total; i++) {
      const gfx = this.add.graphics().setDepth(25);
      this._orbitBalls.push({ gfx, angle: (i / Math.max(total, 1)) * Math.PI * 2, type: types[i], lastHit: new Map() });
    }

    // 週期飛刀計時器
    if ((stats.periodicKnives ?? 0) > 0 && !SkillTreeStore.isLearned('6-1-2-1-2')) {
      const scheduleKnives = () => {
        if (SkillTreeStore.isLearned('6-1-2-1-2')) return;
        const s = CardStore.getTotalStats();
        const delay = Math.max(800, 4000 - (s.knifeIntervalReduction ?? 0));
        this.time.delayedCall(delay, () => { this.firePeriodicKnives(); scheduleKnives(); });
      };
      scheduleKnives();
    }

    // 落雷計時器（間隔動態計算）
    if ((stats.lightningStrike ?? 0) > 0) {
      const scheduleLightning = () => {
        const s = CardStore.getTotalStats();
        const delay = Math.max(500, 2000 - (s.lightningIntervalReduction ?? 0));
        this.time.delayedCall(delay, () => { this.fireLightningStrike(); scheduleLightning(); });
      };
      scheduleLightning();
    }

    // 無限神盾護體：立即啟動
    if ((stats.infiniteDivineShield ?? 0) > 0) {
      this.triggerDivineShield();
    }

    // 岩漿史萊姆夥伴
    if ((stats.lavaSlimeCompanion ?? 0) > 0) {
      this.spawnLavaSlimeCompanion();
    }

    // 恐懼光環
    if ((stats.fearAura ?? 0) >= 1) {
      this._startFearAura();
    }

    // Multiplayer: broadcast own orbit ball config so partner can render them
    if (NetworkService.connected && this._orbitBalls.length > 0) {
      NetworkService.sendOrbitBallsConfig(
        NetworkService.sessionId,
        this._orbitBalls.map(b => ({ type: b.type })),
      );
    }

    // Receive partner ball config
    if (NetworkService.connected) {
      NetworkService.onOrbitBallsConfig(({ sessionId, balls }) => {
        // Destroy old balls for this partner
        this._partnerOrbitBalls.get(sessionId)?.forEach(b => b.gfx.destroy());
        const arr = balls.map((b, i) => ({
          gfx: this.add.graphics().setDepth(25),
          angle: (i / Math.max(balls.length, 1)) * Math.PI * 2,
          type: b.type as 'fire' | 'ice',
        }));
        this._partnerOrbitBalls.set(sessionId, arr);
      });

      NetworkService.onLightningFx(({ targets, isSingle }) => {
        for (const t of targets) this._fxLightningBolt(t.x * DPR, t.y * DPR, isSingle);
      });
    }
  }

  private updatePartnerOrbitBalls(delta: number): void {
    if (this._partnerOrbitBalls.size === 0) return;
    const ORBIT_SPEED = 0.0022;
    const ORBIT_R = P(55);
    const BALL_R = P(8);
    this._partnerOrbitBalls.forEach((balls, sessionId) => {
      const pd = this._partners.get(sessionId);
      if (!pd || !pd.sprite.active) return;
      const px = pd.sprite.x, py = pd.sprite.y;
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        const a = this._orbitAngle + (i / balls.length) * Math.PI * 2;
        const bx = px + Math.cos(a) * ORBIT_R;
        const by = py + Math.sin(a) * ORBIT_R;
        const col = b.type === 'fire' ? 0xff6600 : 0x44bbff;
        const glow = b.type === 'fire' ? 0xffaa00 : 0x88eeff;
        b.gfx.clear().setPosition(bx, by);
        b.gfx.fillStyle(glow, 0.30); b.gfx.fillCircle(0, 0, BALL_R * 1.6);
        b.gfx.fillStyle(col, 0.90); b.gfx.fillCircle(0, 0, BALL_R);
        b.gfx.fillStyle(0xffffff, 0.50); b.gfx.fillCircle(-BALL_R * 0.28, -BALL_R * 0.28, BALL_R * 0.32);
      }
    });
  }

  private updateOrbitBalls(delta: number): void {
    const ORBIT_SPEED = 0.0012;   // rad/ms ≈ 一圈約 5.2 秒
    this._orbitAngle += delta * ORBIT_SPEED;  // always advance so partner balls also rotate

    if (this._orbitBalls.length === 0) return;
    const ORBIT_R = P(55);
    const BALL_R = P(8);
    const HIT_RANGE = P(22);
    const HIT_CD = 1000;
    const now = this.time.now;
    const isAlive = this.player.active && !this.gameOver;

    const nTotal = Math.min(Math.max(this._orbitBalls.length, 2), 8);

    for (let i = 0; i < this._orbitBalls.length; i++) {
      const b = this._orbitBalls[i];
      const a = this._orbitAngle + (i / this._orbitBalls.length) * Math.PI * 2;
      const bx = this.player.x + Math.cos(a) * ORBIT_R;
      const by = this.player.y + Math.sin(a) * ORBIT_R;

      b.gfx.setPosition(bx, by).clear();
      if (!isAlive) continue;

      const col = b.type === 'fire' ? 0xff6600 : 0x44bbff;
      const glow = b.type === 'fire' ? 0xffaa00 : 0x88eeff;
      b.gfx.fillStyle(glow, 0.30); b.gfx.fillCircle(0, 0, BALL_R * 1.6);
      b.gfx.fillStyle(col, 0.90); b.gfx.fillCircle(0, 0, BALL_R);
      b.gfx.fillStyle(0xffffff, 0.50); b.gfx.fillCircle(-BALL_R * 0.28, -BALL_R * 0.28, BALL_R * 0.32);

      for (const t of this.getHittableTargets()) {
        if ((b.lastHit.get(t) ?? 0) + HIT_CD > now) continue;
        if ((bx - t.x) * (bx - t.x) + (by - t.y) * (by - t.y) > HIT_RANGE * HIT_RANGE) continue;
        b.lastHit.set(t, now);
        const s2 = CardStore.getTotalStats();
        const sharedBonus = s2.orbitBallDmgPct ?? 0;
        const typeBonus = b.type === 'fire' ? (s2.orbitFireBallDmgPct ?? 0) : (s2.orbitIceBallDmgPct ?? 0);
        const orbitDmgMult = 1 + sharedBonus + typeBonus;
        const mult = (b.type === 'fire' ? 0.50 : 0.40) / Math.sqrt(nTotal) * orbitDmgMult;
        this.dealDamage(t, mult, bx, by, 'down');
        if (b.type === 'ice' && !(t as MinionSlime).isDead) {
          (t as MinionSlime).slowMult = 0.60;
          this.time.delayedCall(1500, () => { if (!(t as MinionSlime).isDead) (t as MinionSlime).slowMult = 1; });
        }
      }
      // 清理過期 CD 記錄
      b.lastHit.forEach((ts, k) => { if (ts + HIT_CD + 200 < now) b.lastHit.delete(k); });
    }
  }

  private updatePlayerKnives(delta: number): void {
    if (this._playerKnives.length === 0) return;
    const KNIFE_SPEED = P(468);
    const HOMING_TURN = 4.5;  // rad/sec 最大轉向速率
    const dt = delta / 1000;
    const stats = CardStore.getTotalStats();
    const knifeBaseDmgMult = (stats.knifeDmgPct ?? 0);

    for (let i = this._playerKnives.length - 1; i >= 0; i--) {
      const k = this._playerKnives[i];

      if (k.homing) {
        let target: { x: number; y: number } | null = null;
        if (k.returnToPlayer) {
          target = { x: this.player.x, y: this.player.y };
        } else {
          const targets = this.getHittableTargets();
          let nearDistSq = Infinity;
          for (const t of targets) {
            const dSq = (k.x - t.x) * (k.x - t.x) + (k.y - t.y) * (k.y - t.y);
            if (dSq < nearDistSq) { nearDistSq = dSq; target = t; }
          }
        }
        if (target) {
          const desiredAngle = Math.atan2(target.y - k.y, target.x - k.x);
          const currentAngle = Math.atan2(k.vy, k.vx);
          let diff = Phaser.Math.Angle.Wrap(desiredAngle - currentAngle);
          const maxTurn = HOMING_TURN * dt;
          diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const newAngle = currentAngle + diff;
          k.vx = Math.cos(newAngle) * KNIFE_SPEED;
          k.vy = Math.sin(newAngle) * KNIFE_SPEED;
        }
      }

      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const tdx = k.x - k.spawnX, tdy = k.y - k.spawnY;
      if (tdx * tdx + tdy * tdy >= k.maxDist * k.maxDist) {
        k.gfx.destroy();
        this._playerKnives.splice(i, 1);
        continue;
      }

      const angle = Math.atan2(k.vy, k.vx);
      k.gfx.setPosition(k.x, k.y).setRotation(angle);

      for (const t of this.getHittableTargets()) {
        if (k.hitTargets.has(t)) continue;
        const khr = P(14); if ((k.x - t.x) * (k.x - t.x) + (k.y - t.y) * (k.y - t.y) > khr * khr) continue;
        k.hitTargets.add(t);
        this.dealDamage(t, 0.40 * (1 + knifeBaseDmgMult), k.x, k.y, 'down', 'none', true);
      }
    }
  }

  private updatePartnerKnives(delta: number): void {
    if (this._partnerKnives.length === 0) return;
    const KNIFE_SPEED = P(468);
    const HOMING_TURN = 4.5;
    const dt = delta / 1000;
    for (let i = this._partnerKnives.length - 1; i >= 0; i--) {
      const k = this._partnerKnives[i];
      const targets = this.getHittableTargets();
      let target: { x: number; y: number } | null = null;
      let nearDistSq = Infinity;
      for (const t of targets) {
        const dSq = (k.x - t.x) * (k.x - t.x) + (k.y - t.y) * (k.y - t.y);
        if (dSq < nearDistSq) { nearDistSq = dSq; target = t; }
      }
      if (target) {
        const desiredAngle = Math.atan2(target.y - k.y, target.x - k.x);
        const currentAngle = Math.atan2(k.vy, k.vx);
        let diff = Phaser.Math.Angle.Wrap(desiredAngle - currentAngle);
        const maxTurn = HOMING_TURN * dt;
        diff = Math.max(-maxTurn, Math.min(maxTurn, diff));
        const newAngle = currentAngle + diff;
        k.vx = Math.cos(newAngle) * KNIFE_SPEED;
        k.vy = Math.sin(newAngle) * KNIFE_SPEED;
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const tdx = k.x - k.spawnX, tdy = k.y - k.spawnY;
      if (tdx * tdx + tdy * tdy >= k.maxDist * k.maxDist) {
        k.gfx.destroy();
        this._partnerKnives.splice(i, 1);
        continue;
      }
      k.gfx.setPosition(k.x, k.y).setRotation(Math.atan2(k.vy, k.vx));
    }
  }

  private firePeriodicKnives(): void {
    if (!this.player.active || this.gameOver) return;
    const stats = CardStore.getTotalStats();
    const homing = (stats.knifeHoming ?? 0) >= 1;
    const doubled = (stats.knifeDoubleCount ?? 0) >= 1 || (stats.periodicKnives ?? 0) >= 2;
    const count = Math.round((doubled ? 12 : 6) * (homing ? 0.5 : 1));
    const maxDist = P(200);
    const SPEED = P(468);

    // 追蹤模式：朝最近敵人方向 ±90° 扇形出刀；無敵人在 250px 內則 360° 散射並飛回玩家
    const HOMING_RANGE = P(350);
    let baseAngle = Math.random() * Math.PI * 2;
    let returnToPlayer = false;
    if (homing) {
      const targets = this.getHittableTargets();
      let nearest: typeof targets[0] | null = null;
      let nearDistSq = Infinity;
      const HOMING_RANGE_SQ = HOMING_RANGE * HOMING_RANGE;
      for (const t of targets) {
        const dSq = (this.player.x - t.x) * (this.player.x - t.x) + (this.player.y - t.y) * (this.player.y - t.y);
        if (dSq < nearDistSq) { nearDistSq = dSq; nearest = t; }
      }
      if (nearest && nearDistSq <= HOMING_RANGE_SQ) {
        baseAngle = Math.atan2(nearest.y - this.player.y, nearest.x - this.player.x);
      } else {
        returnToPlayer = true;
      }
    }

    const salvoHitTargets = new Set<object>();

    for (let i = 0; i < count; i++) {
      const angle = (homing && !returnToPlayer)
        ? baseAngle + (i / (count - 1 || 1) - 0.5) * Math.PI  // ±90°（共180°扇形）
        : baseAngle + (i / count) * Math.PI * 2;
      const vx = Math.cos(angle) * SPEED;
      const vy = Math.sin(angle) * SPEED;

      const gfx = this.add.graphics({ x: this.player.x, y: this.player.y }).setDepth(26);
      gfx.setRotation(angle);

      // 刀身：細長刀形（刀尖在 +x 方向）
      gfx.fillStyle(0xe8e8ff, 1);
      gfx.fillTriangle(P(8), 0, -P(5), -P(1.5), -P(5), P(1.5));   // 主刀身

      // 刀刃高光
      gfx.lineStyle(P(0.8), 0xffffff, 0.7);
      gfx.beginPath();
      gfx.moveTo(-P(4), -P(0.8));
      gfx.lineTo(P(7), 0);
      gfx.strokePath();

      // 刀柄
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(-P(7), -P(1.2), P(3), P(2.4));

      // 護手
      gfx.fillStyle(0xaaaaaa, 1);
      gfx.fillRect(-P(5), -P(2.5), P(1.5), P(5));

      // 出刀時的光芒拖尾（小亮點）
      const spark = this.add.graphics({ x: this.player.x, y: this.player.y }).setDepth(25);
      spark.fillStyle(0xffffff, 0.6);
      spark.fillCircle(0, 0, P(3));
      this.tweens.add({
        targets: spark, alpha: 0, scaleX: 0.1, scaleY: 0.1,
        x: this.player.x - Math.cos(angle) * P(8),
        y: this.player.y - Math.sin(angle) * P(8),
        duration: 180, ease: 'Quad.Out', onComplete: () => spark.destroy()
      });

      this._playerKnives.push({
        gfx, x: this.player.x, y: this.player.y,
        vx, vy,
        spawnX: this.player.x, spawnY: this.player.y,
        maxDist, hitTargets: salvoHitTargets, homing, returnToPlayer,
      });
    }
  }

  private fireLightningStrike(): void {
    if (!this.player.active || this.gameOver) return;
    const stats = CardStore.getTotalStats();
    const maxR = P(200);
    const dmgMult = 0.50 * (1 + (stats.lightningDmgBonus ?? 0));
    const count = (stats.lightningSingleTarget ?? 0) >= 1 ? 1 : (stats.lightningStrike ?? 1);

    // 從 200px 內隨機選不重複的 count 個目標
    const maxRSq = maxR * maxR;
    const pool = this.getHittableTargets().filter(t => {
      const dx = this.player.x - t.x, dy = this.player.y - t.y;
      return dx * dx + dy * dy <= maxRSq;
    });
    if (pool.length === 0) return;

    // Fisher-Yates shuffle 取前 count 個
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const targets = pool.slice(0, count);

    const isSingle = (stats.lightningSingleTarget ?? 0) >= 1;

    for (const target of targets) {
      const tx = target.x, ty = target.y;
      this._fxLightningBolt(tx, ty, isSingle);

      if (isSingle) {
        this.dealDamage(target, dmgMult, tx, ty, 'down', 'none', true);
      } else {
        const splashR = P(12);
        const splashRSq = splashR * splashR;
        for (const t of this.getHittableTargets()) {
          if ((tx - t.x) * (tx - t.x) + (ty - t.y) * (ty - t.y) <= splashRSq) {
            this.dealDamage(t, dmgMult, tx, ty, 'down', 'none', true);
          }
        }
      }
    }

    // Sync VFX to partner
    if (NetworkService.connected) {
      NetworkService.sendLightningFx(targets.map(t => ({ x: t.x / DPR, y: t.y / DPR })), isSingle);
    }
  }

  private _fxLightningBolt(tx: number, ty: number, isSingle: boolean): void {
    const bolt = this.add.graphics().setDepth(60);
    if (isSingle) {
      // 天罰雷霆：寬大落雷 + 多條分支 + 強光暈
      const drawBolt = (alpha: number) => {
        bolt.clear();
        bolt.lineStyle(P(22), 0x8866ff, alpha * 0.15); bolt.beginPath(); bolt.moveTo(tx, ty - P(140)); bolt.lineTo(tx, ty); bolt.strokePath();
        bolt.lineStyle(P(14), 0xaaddff, alpha * 0.25); bolt.beginPath(); bolt.moveTo(tx, ty - P(140)); bolt.lineTo(tx, ty); bolt.strokePath();
        bolt.lineStyle(P(7), 0xffffff, alpha);
        bolt.beginPath(); bolt.moveTo(tx, ty - P(140));
        bolt.lineTo(tx + P(10), ty - P(100)); bolt.lineTo(tx - P(8), ty - P(70));
        bolt.lineTo(tx + P(6), ty - P(40)); bolt.lineTo(tx - P(4), ty - P(15)); bolt.lineTo(tx, ty);
        bolt.strokePath();
        bolt.lineStyle(P(3), 0xffffff, alpha * 0.8);
        bolt.beginPath(); bolt.moveTo(tx - P(8), ty - P(70)); bolt.lineTo(tx - P(22), ty - P(48)); bolt.lineTo(tx - P(18), ty - P(30)); bolt.strokePath();
        bolt.beginPath(); bolt.moveTo(tx + P(6), ty - P(40)); bolt.lineTo(tx + P(20), ty - P(22)); bolt.lineTo(tx + P(14), ty - P(8)); bolt.strokePath();
        bolt.lineStyle(P(4), 0x88ccff, alpha * 0.6);
        bolt.beginPath(); bolt.moveTo(tx, ty - P(140));
        bolt.lineTo(tx + P(10), ty - P(100)); bolt.lineTo(tx - P(8), ty - P(70));
        bolt.lineTo(tx + P(6), ty - P(40)); bolt.lineTo(tx - P(4), ty - P(15)); bolt.lineTo(tx, ty);
        bolt.strokePath();
      };
      drawBolt(1);
      this.tweens.add({ targets: bolt, alpha: 0, duration: 500, ease: 'Quad.In', onComplete: () => bolt.destroy() });
      const ring = this.add.graphics({ x: tx, y: ty }).setDepth(59);
      ring.lineStyle(P(4), 0xaaddff, 1); ring.strokeCircle(0, 0, P(18));
      ring.lineStyle(P(2), 0xffffff, 0.7); ring.strokeCircle(0, 0, P(8));
      this.tweens.add({ targets: ring, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
      const flash = this.add.graphics({ x: tx, y: ty }).setDepth(61);
      flash.fillStyle(0xffffff, 0.9); flash.fillCircle(0, 0, P(10));
      flash.fillStyle(0xaaddff, 0.6); flash.fillCircle(0, 0, P(18));
      this.tweens.add({ targets: flash, alpha: 0, scaleX: 2, scaleY: 2, duration: 200, onComplete: () => flash.destroy() });
    } else {
      // 普通落雷
      const drawBolt = (alpha: number) => {
        bolt.clear();
        bolt.lineStyle(P(3), 0xffffff, alpha);
        bolt.beginPath(); bolt.moveTo(tx, ty - P(80));
        bolt.lineTo(tx + P(4), ty - P(50)); bolt.lineTo(tx - P(3), ty - P(30));
        bolt.lineTo(tx + P(2), ty - P(10)); bolt.lineTo(tx, ty);
        bolt.strokePath();
        bolt.lineStyle(P(6), 0xaaddff, alpha * 0.4);
        bolt.beginPath(); bolt.moveTo(tx, ty - P(80)); bolt.lineTo(tx, ty);
        bolt.strokePath();
      };
      drawBolt(1);
      this.tweens.add({ targets: bolt, alpha: 0, duration: 350, ease: 'Quad.In', onComplete: () => bolt.destroy() });
      const ring = this.add.graphics({ x: tx, y: ty }).setDepth(59);
      ring.lineStyle(P(2), 0xaaddff, 1); ring.strokeCircle(0, 0, P(12));
      this.tweens.add({ targets: ring, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });
    }
  }

  private fireOnHitLightning(stats: import('../data/player-store').EffectiveStats): void {
    if (!this.player.active || this.gameOver) return;
    const targets = this.getHittableTargets();
    if (targets.length === 0) return;
    const target = targets[Math.floor(Math.random() * targets.length)];
    const tx = target.x, ty = target.y;
    const dmgMult = 0.50 * (1 + (stats.lightningDmgBonus ?? 0));

    const bolt = this.add.graphics().setDepth(60);
    const drawBolt = (alpha: number) => {
      bolt.clear();
      bolt.lineStyle(P(3), 0xffffff, alpha);
      bolt.beginPath(); bolt.moveTo(tx, ty - P(80));
      bolt.lineTo(tx + P(4), ty - P(50)); bolt.lineTo(tx - P(3), ty - P(30));
      bolt.lineTo(tx + P(2), ty - P(10)); bolt.lineTo(tx, ty);
      bolt.strokePath();
      bolt.lineStyle(P(6), 0xaaddff, alpha * 0.4);
      bolt.beginPath(); bolt.moveTo(tx, ty - P(80)); bolt.lineTo(tx, ty);
      bolt.strokePath();
    };
    drawBolt(1);
    this.tweens.add({ targets: bolt, alpha: 0, duration: 350, ease: 'Quad.In', onComplete: () => bolt.destroy() });

    const ring = this.add.graphics({ x: tx, y: ty }).setDepth(59);
    ring.lineStyle(P(2), 0xaaddff, 1); ring.strokeCircle(0, 0, P(12));
    this.tweens.add({ targets: ring, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });

    this.dealDamage(target, dmgMult, this.player.x, this.player.y, 'down', 'none', true);
  }

  private overkillSplash(ox: number, oy: number, overkill: number): void {
    const stats = CardStore.getTotalStats();
    const R = P(18) * (1 + (stats.overkillRadiusMult ?? 0));
    const canChain = (stats.overkillSplash ?? 0) >= 2 || (stats.overkillInfiniteChain ?? 0) >= 1;

    const RSq = R * R;
    for (const t of this.getHittableTargets()) {
      if ((ox - t.x) * (ox - t.x) + (oy - t.y) * (oy - t.y) > RSq) continue;
      this.dealDamage(t, 0, ox, oy, 'down');
      const boostedOverkill = Math.floor(overkill * (2 + (stats.overkillDmgPct ?? 0)));
      const chainOverkill = (t as MinionSlime).takeDamage(boostedOverkill);
      this.spawnDamageNumber(t.x, t.y, boostedOverkill, false, 1);
      if (canChain && chainOverkill > 0) {
        this.time.delayedCall(80, () => this.overkillSplash(t.x, t.y, chainOverkill));
      }
    }
    // 紫色火焰圈 VFX
    const cx = ox, cy = oy;

    // 內爆光核
    const core = this.add.graphics({ x: cx, y: cy }).setDepth(56);
    core.fillStyle(0xdd88ff, 0.9); core.fillCircle(0, 0, P(6));
    this.tweens.add({ targets: core, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => core.destroy() });

    // 擴散火焰環（外圈）
    const ring1 = this.add.graphics({ x: cx, y: cy }).setDepth(55);
    ring1.lineStyle(P(4), 0xcc44ff, 1); ring1.strokeCircle(0, 0, R * 0.6);
    this.tweens.add({ targets: ring1, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring1.destroy() });

    // 內層薄環
    const ring2 = this.add.graphics({ x: cx, y: cy }).setDepth(55);
    ring2.lineStyle(P(2), 0xff88ff, 0.8); ring2.strokeCircle(0, 0, R * 0.4);
    this.tweens.add({ targets: ring2, scaleX: 3.0, scaleY: 3.0, alpha: 0, duration: 300, ease: 'Quad.Out', onComplete: () => ring2.destroy() });

    // 8 道火焰粒子向外飛散
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
      const dist = R * (1.2 + Math.random() * 0.8);
      const p = this.add.graphics({ x: cx, y: cy }).setDepth(57);
      p.fillStyle(i % 2 === 0 ? 0xdd44ff : 0xff99ff, 0.9);
      p.fillCircle(0, 0, P(2.5 + Math.random() * 1.5));
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(a) * dist,
        y: cy + Math.sin(a) * dist,
        scaleX: 0.1, scaleY: 0.1, alpha: 0,
        duration: 300 + Math.random() * 120,
        ease: 'Quad.Out',
        onComplete: () => p.destroy(),
      });
    }
  }

  // ── 靈魂收割：擊殺觸發衝擊波 ──────────────────────────────
  private _soulHarvestProc(ox: number, oy: number): void {
    const stats = CardStore.getTotalStats();
    const R = P(100);
    let hitCount = 0;
    const harvestRSq = R * R;
    for (const t of this.getHittableTargets()) {
      if ((ox - t.x) * (ox - t.x) + (oy - t.y) * (oy - t.y) > harvestRSq) continue;
      const dmg = Math.round(stats.atk * 0.60);
      if (t === this.boss) t.takeDamage(dmg, 0);
      else (t as MinionSlime).takeDamage(dmg);
      this.spawnDamageNumber(t.x, t.y, dmg, false, 1);
      hitCount++;
    }
    if (hitCount > 0) this.player.heal(Math.round(this.player.maxHpValue * 0.03 * hitCount));
    // VFX
    const ring = this.add.graphics({ x: ox, y: oy }).setDepth(58);
    ring.lineStyle(P(3), 0xcc44ff, 0.9); ring.strokeCircle(0, 0, P(12));
    this.tweens.add({ targets: ring, scaleX: P(100) / P(12), scaleY: P(100) / P(12), alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    const core = this.add.graphics({ x: ox, y: oy }).setDepth(59);
    core.fillStyle(0xee88ff, 0.9); core.fillCircle(0, 0, P(5));
    this.tweens.add({ targets: core, scaleX: 3, scaleY: 3, alpha: 0, duration: 250, onComplete: () => core.destroy() });
  }

  // ── 恐懼光環：啟動計時器和視覺環 ──────────────────────────
  private _startFearAura(): void {
    const RADIUS = P(200);
    this._fearAuraGfx = this.add.graphics().setDepth(this.player.depth - 1);
    this._fearAuraGfx.lineStyle(P(2), 0x8800cc, 0.5);
    this._fearAuraGfx.strokeCircle(0, 0, RADIUS);
    this.tweens.add({ targets: this._fearAuraGfx, alpha: { from: 0.35, to: 0.65 }, duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

    this._fearAuraTimer = this.time.addEvent({
      delay: 500, loop: true,
      callback: () => {
        if (!this.player.active) return;
        this._fearAuraGfx?.setPosition(this.player.x, this.player.y);
        for (const m of this.allMinions) {
          if (m.isDead) continue;
          const inRange = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) <= RADIUS;
          m.fearSlowMult = inRange ? 0.85 : 1;
          m.fearAtkExtend = inRange ? 750 : 0;
        }
      },
    });
  }

  private addBloodlustStack(max: number): void {
    if (this._bloodlustStacks < max) this._bloodlustStacks++;
    // 無論是否到頂，每次觸發都重置讀秒
    this._bloodlustTimer?.destroy();
    const DURATION = 3000;
    this._bloodlustExpiry = this.time.now + DURATION;
    this._bloodlustTimer = this.time.delayedCall(DURATION, () => {
      this._bloodlustStacks = 0;
      this._bloodlustExpiry = 0;
      this._bloodlustTimer = null;
      this._bloodlustTickTimer?.destroy();
      this._bloodlustTickTimer = null;
      this.refreshBuffHud();
    });
    // 啟動每 250ms 更新讀秒的 loop
    if (!this._bloodlustTickTimer) {
      this._bloodlustTickTimer = this.time.addEvent({
        delay: 250, loop: true,
        callback: () => this.refreshBuffHud(),
      });
    }
    this.refreshBuffHud();
  }

  private addSanguineStack(max: number): void {
    if (this._sanguineStacks < max) this._sanguineStacks++;
    this._sanguineTimer?.destroy();
    const DURATION = 3000;
    this._sanguineExpiry = this.time.now + DURATION;
    this._sanguineTimer = this.time.delayedCall(DURATION, () => {
      this._sanguineStacks = 0;
      this._sanguineExpiry = 0;
      this._sanguineTimer = null;
      this._sanguineTickTimer?.destroy();
      this._sanguineTickTimer = null;
      this.refreshBuffHud();
    });
    if (!this._sanguineTickTimer) {
      this._sanguineTickTimer = this.time.addEvent({
        delay: 250, loop: true,
        callback: () => this.refreshBuffHud(),
      });
    }
    this.refreshBuffHud();
  }

  private damageSplashProc(origin: MinionSlime | Boss, dmg: number, pct: number, count: number): void {
    const splashDmg = Math.round(dmg * pct);
    if (splashDmg <= 0) return;

    const R = P(60);
    const candidates = this.getHittableTargets().filter(t => t !== origin && Phaser.Math.Distance.Between(origin.x, origin.y, t.x, t.y) <= R);
    Phaser.Utils.Array.Shuffle(candidates);
    const targets = candidates.slice(0, count);

    for (const t of targets) {
      const isDead = (t as MinionSlime).isDead;
      if (isDead) continue;
      (t as MinionSlime).takeDamage(splashDmg);
      t.knockback(origin.x, origin.y);
      this.spawnDamageNumber(t.x, t.y, splashDmg, false, 1);

      // 藍色濺射 VFX：在目標位置爆光圈
      const burst = this.add.graphics({ x: t.x, y: t.y }).setDepth(57);
      burst.fillStyle(0x66ddff, 1); burst.fillCircle(0, 0, P(7));
      this.tweens.add({ targets: burst, scaleX: 2.2, scaleY: 2.2, alpha: 0, duration: 200, onComplete: () => burst.destroy() });
    }
  }

  protected showFreeReviveDialog(): void {
    this._reviveDialogActive = true;
    this.player.setActive(false);
    this.player.stop();
    this.player.setTexture('player_death_shadow', 6);

    const W = this.scale.width, H = this.scale.height;
    const bw = P(240), bh = P(150);
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    const D = 200000;  // 高於 HP bar (100000) 與 debuff (100001)

    const bg = this.add.graphics().setScrollFactor(0).setDepth(D);
    bg.fillStyle(0x1a1a2e, 1); bg.fillRoundedRect(bx, by, bw, bh, P(10));
    bg.lineStyle(P(2), 0xffee44, 1); bg.strokeRoundedRect(bx, by, bw, bh, P(10));

    const title = this.add.text(W / 2, by + P(24), tr('game.hud.died'), {
      fontSize: F(16), fontStyle: 'bold', color: '#ffee44', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const stats = CardStore.getTotalStats();
    const remaining = (stats.freeRevive ?? 0) - this._freeRevivesUsed;
    const sub = this.add.text(W / 2, by + P(46), tr('game.revive.prompt'), {
      fontSize: F(12), color: '#cccccc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const reviveCount = this.add.text(W / 2, by + P(66), tr('game.revive.remaining', { n: remaining }), {
      fontSize: F(12), fontStyle: 'bold', color: '#aaddff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const btnW = P(80), btnH = P(30);
    const yesX = W / 2 - P(50), noX = W / 2 + P(50);
    const btnY = by + P(114);

    const yesBg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    yesBg.fillStyle(0x226622, 1); yesBg.fillRoundedRect(yesX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(6));
    const yesTxt = this.add.text(yesX, btnY, tr('game.revive.btn'), { fontSize: F(13), color: '#88ff88', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    const noBg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    noBg.fillStyle(0x662222, 1); noBg.fillRoundedRect(noX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(6));
    const noTxt = this.add.text(noX, btnY, tr('game.hud.giveUp'), { fontSize: F(13), color: '#ff8888', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    let handled = false;
    const cleanup = () => {
      this._reviveDialogActive = false;
      this.input.off('pointerdown', onPointerDown);
      [bg, title, sub, reviveCount, yesBg, yesTxt, noBg, noTxt].forEach(o => o.destroy());
    };

    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (handled) return;
      const px = pointer.x, py = pointer.y;
      const inYes = px >= yesX - btnW / 2 && px <= yesX + btnW / 2 && py >= btnY - btnH / 2 && py <= btnY + btnH / 2;
      const inNo = px >= noX - btnW / 2 && px <= noX + btnW / 2 && py >= btnY - btnH / 2 && py <= btnY + btnH / 2;
      if (!inYes && !inNo) return;
      handled = true;
      cleanup();
      if (inYes) {
        this._freeRevivesUsed++;
        this.gameOver = false;
        this.player.revive(1.0);
        this.player.play(`player_idle_${this.player.lastDir}`);
        this.player.divineShieldDef = 0;
        (this.player as any).invincible = true;
        if (NetworkService.connected) NetworkService.sendPotionEffect('revive', 100);
        this.time.delayedCall(2500, () => { (this.player as any).invincible = false; });
        this.spawnDamageNumber(this.player.x, this.player.y - P(20), 0, false, 1);
      } else {
        (this.player as any).invincible = false;  // 放棄時解除無敵，進正常死亡
        this.handlePlayerDead();
      }
    };
    this.input.on('pointerdown', onPointerDown);
  }

  private triggerDivineShield(): void {
    if (this._divineShieldTimer) this._divineShieldTimer.destroy();
    this.player.divineShieldDef = 20;

    const px = this.player.x, py = this.player.y;

    // 外爆衝擊波
    const burst = this.add.graphics({ x: px, y: py }).setDepth(30);
    burst.lineStyle(P(4), 0xffd700, 1); burst.strokeCircle(0, 0, P(18));
    this.tweens.add({ targets: burst, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 400, ease: 'Cubic.Out', onComplete: () => burst.destroy() });

    // 內層亮環
    const inner = this.add.graphics({ x: px, y: py }).setDepth(30);
    inner.lineStyle(P(2), 0xffffff, 0.9); inner.strokeCircle(0, 0, P(10));
    this.tweens.add({ targets: inner, alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 250, ease: 'Quad.Out', onComplete: () => inner.destroy() });

    // 四道放射光粒子
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spark = this.add.graphics({ x: px, y: py }).setDepth(30);
      spark.fillStyle(0xffd700, 1); spark.fillCircle(P(16), 0, P(2));
      spark.setRotation(angle);
      this.tweens.add({ targets: spark, scaleX: 0, scaleY: 0, alpha: 0, x: px + Math.cos(angle) * P(28), y: py + Math.sin(angle) * P(28), duration: 350, ease: 'Quad.Out', onComplete: () => spark.destroy() });
    }

    // 持續光圈（跟隨玩家，update 每幀重繪）
    this._divineShieldGfx?.destroy();
    this._divineShieldGfx = this.add.graphics().setDepth(27);

    this._divineShieldTimer = this.time.delayedCall(1750, () => {
      if ((CardStore.getTotalStats().infiniteDivineShield ?? 0) > 0 && !this.gameOver) {
        this.triggerDivineShield();
        return;
      }
      // 消散動畫
      const fade = this._divineShieldGfx;
      this._divineShieldGfx = undefined;
      if (fade) this.tweens.add({ targets: fade, alpha: 0, duration: 300, onComplete: () => fade.destroy() });
      this.player.divineShieldDef = 0;
    });
  }

  // ── 業火盾觸發 ────────────────────────────────────────────────
  private _triggerBlazing(px: number, py: number): void {
    const stats = CardStore.getTotalStats();
    const ms = Math.max(500, stats.blazingShieldMs ?? 1500);

    // 回復HP
    const healPct = stats.blazingShieldHealPct ?? 0;
    if (healPct > 0) this.player.heal(Math.round(this.player.maxHpValue * healPct));

    // 業火盾 ATK 加成
    this._blazingActive = true;
    this._blazingTimer?.destroy();
    this._blazingTimer = this.time.delayedCall(ms, () => {
      this._blazingActive = false;
      this._blazingGfx?.destroy();
      this._blazingGfx = undefined;
    });

    // 視覺效果：紅橙光圈爆衝
    const burst = this.add.graphics({ x: px, y: py }).setDepth(30);
    burst.lineStyle(P(3), 0xff4400, 1);
    burst.strokeCircle(0, 0, P(12));
    this.tweens.add({ targets: burst, scaleX: 3, scaleY: 3, alpha: 0, duration: 350, ease: 'Cubic.Out', onComplete: () => burst.destroy() });

    // 持續橙色光暈（跟隨玩家）
    this._blazingGfx?.destroy();
    this._blazingGfx = this.add.graphics().setDepth(27);
    this.refreshBuffHud();
  }

  // ── 蓄勁一閃爆發特效 ──────────────────────────────────────────
  private _showImpaleEffect(tx: number, ty: number): void {
    const flash = this.add.graphics({ x: tx, y: ty }).setDepth(32);
    flash.fillStyle(0xffffff, 0.85);
    flash.fillCircle(0, 0, P(10));
    this.tweens.add({ targets: flash, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 280, ease: 'Cubic.Out', onComplete: () => flash.destroy() });
    // 金色收縮環
    const ring = this.add.graphics({ x: tx, y: ty }).setDepth(31);
    ring.lineStyle(P(2), 0xffcc00, 1);
    ring.strokeCircle(0, 0, P(18));
    this.tweens.add({ targets: ring, scaleX: 0.2, scaleY: 0.2, alpha: 0, duration: 220, ease: 'Cubic.In', onComplete: () => ring.destroy() });
  }

  private spawnAllyFlower(defId: string, lifetimeMs: number, spawnAngle?: number): void {
    const _capStats = CardStore.getTotalStats();
    const _skillCap = _capStats.skillFlowerCap ?? 0;
    const _hasCardSummon = (_capStats.flowerSummonMode ?? 0) > 0 || (_capStats.summonFlowerChance ?? 0) > 0;
    const ALLY_CAP = Math.max(_hasCardSummon ? 2 : 0, _skillCap) + (_capStats.summonFlowerCap ?? 0) + Math.floor((_capStats.summonFlowerCapPair ?? 0) / 2);
    if (this._allyMinions.length >= ALLY_CAP) return;

    const angle = spawnAngle ?? Math.random() * Math.PI * 2;
    const dist = spawnAngle !== undefined ? P(20) : P(Phaser.Math.Between(40, 70));
    const ax = this.player.x + Math.cos(angle) * dist;
    const ay = this.player.y + Math.sin(angle) * dist;
    const ally = this.spawnMinionAtForBoss(defId, ax, ay, defId.startsWith('elite_'));
    if (!ally) return;

    if (NetworkService.connected && NetworkService.isHost) {
      NetworkService.sendAllySpawn(ally.minionId, defId, lifetimeMs);
    }

    const ps = CardStore.getTotalStats();
    ally.isAlly = true;
    ally.setAllyStats(Math.max(1, Math.round(ps.maxHp * (1.80 + (ps.skillFlowerHpPct ?? 0)))), Math.max(1, Math.round(ps.atk * 0.35 * (1 + (ps.summonFlowerDmgPct ?? 0)))));
    ally.attackCooldownMs = 800;
    ally.rangedRange = P(400);
    this._allyMinions.push(ally);
    this._allyGroup.add(ally);
    ally.setTint(0x88ffcc);

    ally.getTargetPos = () => {
      let bestX = ally.x, bestY = ally.y;
      let minD = Infinity;
      for (const m of this.allMinions) {
        if (m.isDead || this._allyMinions.includes(m)) continue;
        const d = Phaser.Math.Distance.Between(ally.x, ally.y, m.x, m.y);
        if (d < minD) { minD = d; bestX = m.x; bestY = m.y; }
      }
      // 也把 boss 納入候選，選最近的
      if (this.bossActive && this.boss.active) {
        const d = Phaser.Math.Distance.Between(ally.x, ally.y, this.boss.x, this.boss.y);
        if (d < minD) { bestX = this.boss.x; bestY = this.boss.y; }
      }
      return [bestX, bestY];
    };

    ally.onFire = (type, mx, my, tx, ty) => {
      this.spawnMinionAttack(type, mx, my, tx, ty, ally.atk, ally.isElite);
      if (NetworkService.connected && NetworkService.isHost)
        NetworkService.sendMinionAttack({ minionId: ally.minionId, type, mx, my, tx, ty, atk: ally.atk, isElite: ally.isElite ?? false, isAlly: true });
      const wx = mx * DPR, wy = my * DPR;
      const hitTargets = new Set<object>();
      for (const c of this.minionProjGroup.getChildren()) {
        const img = c as Phaser.Physics.Arcade.Image;
        if (!(img as any).isAllyProj && img.active &&
          Phaser.Math.Distance.Between(img.x, img.y, wx, wy) < P(8)) {
          (img as any).isAllyProj = true;
          img.setTint(0x44ff88);
          // 速度 +50%
          const projBody = img.body as Phaser.Physics.Arcade.Body;
          projBody.velocity.x *= 1.5;
          projBody.velocity.y *= 1.5;
          const hitTimer = this.time.addEvent({
            delay: 30, loop: true,
            callback: () => {
              if (!img.active) { hitTimer.destroy(); return; }
              for (const t of this.getHittableTargets()) {
                if (!hitTargets.has(t) && Phaser.Math.Distance.Between(img.x, img.y, t.x, t.y) < P(18)) {
                  hitTargets.add(t);
                  const dmgPct = CardStore.getTotalStats().summonFlowerDmgPct ?? 0;
                  this._bloodlustSwingHandled = false;
                  this._sanguineSwingHandled = false;
                  this.dealDamage(t, 0.35 * (1 + dmgPct), img.x, img.y, 'down');
                  this.time.delayedCall(600, () => hitTargets.delete(t));
                }
              }
            },
          });
        }
      }
    };

    const removeAlly = () => {
      if (ally.isDead) return;
      const i = this._allyMinions.indexOf(ally);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(ally, false, false);
      ally.onDead = undefined;
      if (NetworkService.connected && NetworkService.isHost) NetworkService.sendAllyKill(ally.minionId);
      ally.forceKill();
    };
    this.time.delayedCall(lifetimeMs, removeAlly);

    const origOnDead = ally.onDead;
    ally.onDead = () => {
      const i = this._allyMinions.indexOf(ally);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(ally, false, false);
      if (NetworkService.connected && NetworkService.isHost) NetworkService.sendAllyKill(ally.minionId);
      origOnDead?.();
    };
  }

  private _spawnGuestAllyFlower(minionId: string, defId: string): void {
    // Use the already-known minionSync position so the flower appears at the correct spot
    // immediately — important when update() is skipped (e.g. player is dead).
    const target = this._minionTargets.get(minionId);
    const spawnX = target ? target.x : this.player.x;
    const spawnY = target ? target.y : this.player.y;
    const ally = this.spawnMinionAtForBoss(defId, spawnX, spawnY, defId.startsWith('elite_'));
    if (!ally) return;
    ally.minionId = minionId;
    ally.isAlly = true;
    ally.started = true;
    this._allyMinions.push(ally);
    this._allyGroup.add(ally);
    ally.setTint(0x88ffcc);
    ally.onDead = () => {
      const i = this._allyMinions.indexOf(ally);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(ally, false, false);
    };
  }

  private trySummonAllyFlower(): void {
    const stats = CardStore.getTotalStats();
    const ALLY_CAP = Math.max(((stats.flowerSummonMode ?? 0) > 0 || (stats.summonFlowerChance ?? 0) > 0) ? 2 : 0, stats.skillFlowerCap ?? 0) + (stats.summonFlowerCap ?? 0) + Math.floor((stats.summonFlowerCapPair ?? 0) / 2);

    if (this._allyMinions.length >= ALLY_CAP) {
      const oldest = this._allyMinions.shift()!;
      this._allyGroup.remove(oldest, false, false);
      oldest.onDead = undefined;
      if (NetworkService.connected && NetworkService.isHost) NetworkService.sendAllyKill(oldest.minionId);
      oldest.forceKill();
    }

    this.spawnAllyFlower('plant3_s', 15000);
  }

  protected tryFlowerSummonModeAttack(): void {
    if (this._flowerCharges <= 0) return;

    // 手動拖曳方向優先，否則用玩家面向
    const dirMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const spawnAngle = this._forceAttackAngle ?? dirMap[this.player.lastDir] ?? 0;
    this._forceAttackAngle = null;

    const tx = this.player.x + Math.cos(spawnAngle) * P(80);
    const ty = this.player.y + Math.sin(spawnAngle) * P(80);
    if (this.player.canStartAttackAnim) this.playSfx('sfx_swing3');
    this.player.playAttack(tx, ty, () => {
      if (this._flowerCharges <= 0) return;
      this._flowerCharges--;
      this._flowerChargeAccum = 0;

      const stats = CardStore.getTotalStats();
      const ALLY_CAP = Math.max(((stats.flowerSummonMode ?? 0) > 0 || (stats.summonFlowerChance ?? 0) > 0) ? 2 : 0, stats.skillFlowerCap ?? 0) + (stats.summonFlowerCap ?? 0) + Math.floor((stats.summonFlowerCapPair ?? 0) / 2);

      if (this._allyMinions.length >= ALLY_CAP) {
        const oldest = this._allyMinions.shift()!;
        this._allyGroup.remove(oldest, false, false);
        oldest.onDead = undefined;
        if (NetworkService.connected && NetworkService.isHost) NetworkService.sendAllyKill(oldest.minionId);
        oldest.forceKill();
      }

      this.spawnAllyFlower('plant3_s', 15000, spawnAngle);
    });
  }

  private spawnLavaSlimeCompanion(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = P(Phaser.Math.Between(50, 80));
    const sx = this.player.x + Math.cos(angle) * dist;
    const sy = this.player.y + Math.sin(angle) * dist;
    const companion = this.spawnMinionAtForBoss('slime_lava_s', sx, sy, false);
    if (!companion) return;

    const ps = CardStore.getTotalStats();
    companion.isAlly = true;
    companion.attackMode = 'shoot';
    companion.attackCooldownMs = 1200;
    companion.rangedRange = P(120);
    companion.setAllyStats(Math.max(1, Math.round(ps.maxHp * 1.20)), Math.max(1, Math.round(ps.atk * 0.70)));
    this._allyMinions.push(companion);
    this._allyGroup.add(companion);
    companion.setTint(0xff8844);

    let patrolTarget = { x: sx, y: sy };

    companion.getTargetPos = () => {
      let nearest: MinionSlime | null = null;
      let minD = Infinity;
      for (const m of this.allMinions) {
        if (m.isDead || this._allyMinions.includes(m)) continue;
        const d = Phaser.Math.Distance.Between(companion.x, companion.y, m.x, m.y);
        if (d < minD) { minD = d; nearest = m; }
      }
      if (nearest) return [nearest.x, nearest.y];
      if (this.bossActive && this.boss.active) return [this.boss.x, this.boss.y];
      if (Phaser.Math.Distance.Between(companion.x, companion.y, patrolTarget.x, patrolTarget.y) < P(8)) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * P(40);
        patrolTarget = {
          x: Phaser.Math.Clamp(sx + Math.cos(a) * r, P(32), this.worldW - P(32)),
          y: Phaser.Math.Clamp(sy + Math.sin(a) * r, P(32), this.worldH - P(32)),
        };
      }
      return [patrolTarget.x, patrolTarget.y];
    };

    companion.onFire = (type, mx, my, tx, ty) => {
      this.spawnMinionAttack(type, mx, my, tx, ty, companion.atk, false);
      const hitTargets = new Set<object>();
      for (const c of this.minionProjGroup.getChildren()) {
        const img = c as Phaser.Physics.Arcade.Image;
        if (!(img as any).isAllyProj && img.active &&
          Phaser.Math.Distance.Between(img.x, img.y, mx * DPR, my * DPR) < P(8)) {
          (img as any).isAllyProj = true;
          img.setTint(0xff8844);
          const dmg = companion.atk;
          const hitTimer = this.time.addEvent({
            delay: 30, loop: true,
            callback: () => {
              if (!img.active) { hitTimer.destroy(); return; }
              for (const t of this.getHittableTargets()) {
                if (!hitTargets.has(t) && Phaser.Math.Distance.Between(img.x, img.y, t.x, t.y) < P(18)) {
                  const isBoss = (t as any) === this.boss;
                  (t as any).takeDamage?.(isBoss ? Math.round(dmg * 0.775) : dmg);
                  hitTargets.add(t);
                  this.time.delayedCall(600, () => hitTargets.delete(t));
                }
              }
            },
          });
        }
      }
    };

    companion.onDead = () => {
      const i = this._allyMinions.indexOf(companion);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(companion, false, false);
      if (!this.gameOver) {
        this.time.delayedCall(8000, () => { if (!this.gameOver) this.spawnLavaSlimeCompanion(); });
      }
    };
  }

  // ══════════════════════════════════════════════════════════════

  protected getAttackTarget(): { x: number; y: number } {
    let nearest: { x: number; y: number } | null = null;
    let minDist = Infinity;
    for (const m of this.allMinions) {
      if (m.isDead) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
      if (d < minDist) { minDist = d; nearest = { x: m.x, y: m.y }; }
    }
    if (this.bossActive && this.boss.active) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      if (d < minDist) { nearest = { x: this.boss.x, y: this.boss.y }; }
    }
    return nearest ?? { x: this.player.x, y: this.player.y - 1 };
  }

  override update(): void {
    // Always lerp minion positions on GUEST — continues even when player is dead so
    // the spectator can see enemies still moving while the partner fights on.
    if (NetworkService.connected && !NetworkService.isHost) {
      for (const m of this.allMinions) {
        if (m.isDead) continue;
        const t = this._minionTargets.get(m.minionId);
        if (!t) continue;
        const prevX = m.x, prevY = m.y;
        m.setPosition(m.x + (t.x - m.x) * 0.2, m.y + (t.y - m.y) * 0.2);
        const dx = m.x - prevX, dy = m.y - prevY;
        const moving = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
        const dir: 'down' | 'left' | 'right' | 'up' = Math.abs(dx) >= Math.abs(dy)
          ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
        m.applyGuestState(t.isDashing, dir, moving);
      }
    }

    this._mapUpdateFn?.();

    if (this.gameOver || this.teleporting || this._hostReconnecting || this._tutPaused) return;

    this._updateDarkNight();

    // Drain leech pool at 6% maxHp/s (POE-style life leech)
    if (this._leechPool > 0 && this.player?.active) {
      const delta = this.game.loop.delta;
      const maxRate = this.player.maxHpValue * 0.06 * (delta / 1000);
      const heal = Math.min(this._leechPool, maxRate);
      this._leechPool -= heal;
      this.player.heal(Math.round(heal));
    }

    if (this._buffExpiry.size > 0 && this.time.now - this._lastBuffHudRefresh > 500) {
      this._lastBuffHudRefresh = this.time.now;
      this.refreshBuffHud();
    }

    this.checkLootPickup();

    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    if (this.keys.left.isDown || this.wasd.left.isDown) vx = -1;
    else if (this.keys.right.isDown || this.wasd.right.isDown) vx = 1;
    if (this.keys.up.isDown || this.wasd.up.isDown) vy = -1;
    else if (this.keys.down.isDown || this.wasd.down.isDown) vy = 1;

    // Q / E: use potion slot 0 / 1
    if (Phaser.Input.Keyboard.JustDown(this.qKey)) {
      const id0 = PotionBarStore.getSlot(0);
      if (id0) this.usePotionSlot(id0, this.POTION_COLORS[id0] ?? 0xffffff);
    }
    if (Phaser.Input.Keyboard.JustDown(this.eKey)) {
      const id1 = PotionBarStore.getSlot(1);
      if (id1) this.usePotionSlot(id1, this.POTION_COLORS[id1] ?? 0xffffff);
    }

    // Space bar: start hold-attack timer on press, clear on release
    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && !this.gameOver) {
      this._fireHoldAttack();
      this._spaceHoldTimer = this.time.addEvent({ delay: 100, loop: true, callback: () => this._fireHoldAttack() });
    } else if (Phaser.Input.Keyboard.JustUp(this.spaceKey)) {
      this._spaceHoldTimer?.destroy();
      this._spaceHoldTimer = undefined;
    }

    const isDashBehavior = (SkillTreeStore.getAttackMode()) === 'dashPierce';
    const isFlowerMode = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || SkillTreeStore.getAttackMode() === 'flowerMode';

    this.player.move(vx, vy);


    // 血環火焰圈跟著玩家
    if (this.auraRing) {
      const isAura = (SkillTreeStore.getAttackMode()) === 'aura';
      this.auraRing.setVisible(isAura && !this.gameOver);
      if (isAura) {
        const g = this.auraRing;
        const R = this.AURA_RANGE * (1 + (CardStore.getTotalStats().auraRadiusPct ?? 0));
        const t = this.time.now / 1000;

        // 整體繞玩家旋轉
        g.setPosition(this.player.x, this.player.y + 10);
        g.setRotation(t * 0.4);
        g.clear();

        // ── 地板效果（以 0,0 為中心繪製）──────────────────────

        // 多層同心填充
        g.fillStyle(0xdd0000, 0.28); g.fillCircle(0, 0, R);
        g.fillStyle(0xff2200, 0.22); g.fillCircle(0, 0, R * 0.7);
        g.fillStyle(0xff4400, 0.16); g.fillCircle(0, 0, R * 0.4);

        // 6 條血脈
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.lineStyle(2.5, 0xff3300, 0.65);
          g.beginPath();
          g.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08);
          g.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
          g.strokePath();
          const mid = R * 0.5, ba = a + 0.45;
          g.lineStyle(1.5, 0xff6600, 0.45);
          g.beginPath();
          g.moveTo(Math.cos(a) * mid, Math.sin(a) * mid);
          g.lineTo(Math.cos(ba) * (mid + 10), Math.sin(ba) * (mid + 10));
          g.strokePath();
        }

        // 內六邊形（反向自轉）
        const hex2 = -t * 0.95;
        const hexPts: { x: number; y: number }[] = [];
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2 + hex2;
          hexPts.push({ x: Math.cos(a) * R * 0.48, y: Math.sin(a) * R * 0.48 });
        }
        g.lineStyle(2, 0xff6600, 0.70);
        g.strokePoints(hexPts, true);

        // 脈動內圈
        const pulse = R * 0.28 + Math.sin(t * 4) * 4;
        g.lineStyle(2, 0xff8800, 0.75 + Math.sin(t * 4) * 0.15);
        g.strokeCircle(0, 0, pulse);

        // 中心光核
        const coreA = 0.60 + Math.sin(t * 5) * 0.15;
        g.fillStyle(0xff2200, coreA); g.fillCircle(0, 0, R * 0.14);
        g.fillStyle(0xff9955, coreA * 0.7); g.fillCircle(0, 0, R * 0.06);

        // 底圈範圍線
        g.lineStyle(2.5, 0xff4400, 0.90);
        g.strokeCircle(0, 0, R);

        // 外層大火舌（18 根）
        const N1 = 18;
        for (let i = 0; i < N1; i++) {
          const a = (i / N1) * Math.PI * 2;
          const phase = (i / N1) * Math.PI * 4;
          const h = 9 + Math.sin(t * 5 + phase) * 4 + Math.sin(t * 9 + phase * 1.3) * 2;
          const b1x = Math.cos(a - 0.13) * R, b1y = Math.sin(a - 0.13) * R;
          const b2x = Math.cos(a + 0.13) * R, b2y = Math.sin(a + 0.13) * R;
          const tipX = Math.cos(a) * (R + h), tipY = Math.sin(a) * (R + h);
          g.fillStyle(0xff4400, 0.55 + Math.sin(t * 7 + phase) * 0.2);
          g.fillTriangle(b1x, b1y, b2x, b2y, tipX, tipY);
        }

        // 內層小火舌（24 根）
        const N2 = 24;
        for (let i = 0; i < N2; i++) {
          const a = ((i + 0.5) / N2) * Math.PI * 2;
          const phase = (i / N2) * Math.PI * 6;
          const h = 4 + Math.sin(t * 8 - phase) * 2.5;
          const b1x = Math.cos(a - 0.08) * (R - 1), b1y = Math.sin(a - 0.08) * (R - 1);
          const b2x = Math.cos(a + 0.08) * (R - 1), b2y = Math.sin(a + 0.08) * (R - 1);
          const tipX = Math.cos(a) * (R + h), tipY = Math.sin(a) * (R + h);
          g.fillStyle(0xffaa00, 0.4 + Math.sin(t * 10 + phase) * 0.2);
          g.fillTriangle(b1x, b1y, b2x, b2y, tipX, tipY);
        }
      }
    }

    // 恐懼光環視覺圈跟著玩家
    if (this._fearAuraGfx) {
      const showFear = this.player.active && !this.gameOver;
      this._fearAuraGfx.setVisible(showFear);
      if (showFear) this._fearAuraGfx.setPosition(this.player.x, this.player.y);
    }

    // 夥伴血環（僅在對方裝備 aura 時顯示）
    this._partners.forEach(pd => {
      if (pd.auraRing && pd.sprite.active) {
        const isAura = pd.behavior === 'aura';
        pd.auraRing.setVisible(isAura && !this.gameOver);
        if (isAura) {
          const g = pd.auraRing;
          const R = this.AURA_RANGE;
          const t = this.time.now / 1000;
          g.setPosition(pd.sprite.x, pd.sprite.y + 10);
          g.setRotation(t * 0.4);
          g.clear();
          g.fillStyle(0xdd0000, 0.28); g.fillCircle(0, 0, R);
          g.fillStyle(0xff2200, 0.22); g.fillCircle(0, 0, R * 0.7);
          g.fillStyle(0xff4400, 0.16); g.fillCircle(0, 0, R * 0.4);
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            g.lineStyle(2.5, 0xff3300, 0.65);
            g.beginPath();
            g.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08);
            g.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
            g.strokePath();
          }
          const hexPts: { x: number; y: number }[] = [];
          const hex2 = -t * 0.95;
          for (let i = 0; i <= 6; i++) {
            const a = (i / 6) * Math.PI * 2 + hex2;
            hexPts.push({ x: Math.cos(a) * R * 0.48, y: Math.sin(a) * R * 0.48 });
          }
          g.lineStyle(2, 0xff6600, 0.70); g.strokePoints(hexPts, true);
          const pulse = R * 0.28 + Math.sin(t * 4) * 4;
          g.lineStyle(2, 0xff8800, 0.75 + Math.sin(t * 4) * 0.15);
          g.strokeCircle(0, 0, pulse);
          g.lineStyle(2.5, 0xff4400, 0.90); g.strokeCircle(0, 0, R);
          for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2;
            const phase = (i / 18) * Math.PI * 4;
            const h = 9 + Math.sin(t * 5 + phase) * 4;
            g.fillStyle(0xff4400, 0.55 + Math.sin(t * 7 + phase) * 0.2);
            g.fillTriangle(
              Math.cos(a - 0.13) * R, Math.sin(a - 0.13) * R,
              Math.cos(a + 0.13) * R, Math.sin(a + 0.13) * R,
              Math.cos(a) * (R + h), Math.sin(a) * (R + h),
            );
          }
        }
      }
    });

    // Reveal minions when player walks within range (AI already running since 400ms after spawn)
    const SHOW_DIST = P(500);
    for (const m of this.allMinions) {
      if (m.started && !m.visible && !m.isDead &&
        Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) < SHOW_DIST) {
        m.setVisible(true);
      }
    }

    // Snap player back if they somehow escape the open area (safety net for arena/corridor edges)
    // Tower mode has no tilemap, so skip this check entirely.
    if (this._towerFloor === 0) {
      if (this.isInOpenArea(this.player.x, this.player.y)) {
        this.lastSafeX = this.player.x;
        this.lastSafeY = this.player.y;
      } else {
        this.player.setPosition(this.lastSafeX, this.lastSafeY);
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      }
    }

    // Maze room detection + dark-room overlay update
    if (this._towerFloor > 0 && this._mazeRooms.length > 0 && !this.gameOver) {
      this._updateMazeRoomCheck();
      if (this._mazeDarkRt) this._updateMazeDarkOverlay();
    }

    // Slow zone check — update player.slowMult each frame
    const now = this.time.now;
    const inSlow = this._slowZones.some(z =>
      z.expires > now &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) <= z.r,
    );
    let slowMult = inSlow ? 0.35 : 1;
    if (this._v3IceDomainActive && this.bossActive) {
      const iceDist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this._v3IceDomainCX, this._v3IceDomainCY);
      if (iceDist >= P(170) && iceDist <= P(250)) slowMult = Math.min(slowMult, 0.60);
    }
    this.player.slowMult = slowMult;

    // Rain puddle step-damage check
    if (this._rainPuddles.length > 0) {
      this._rainPuddles = this._rainPuddles.filter(p => p.expires > now);
      if (this._rainPuddleHitCd < now) {
        const hitPuddle = this._rainPuddles.find(p =>
          Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y) <= p.r,
        );
        if (hitPuddle) {
          this.player.takeDamage(hitPuddle.dmg);
          this._rainPuddleHitCd = now + 250;
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && this._rainPuddles.some(p =>
            Phaser.Math.Distance.Between(ally.x, ally.y, p.x, p.y) <= p.r,
          )) { ally.takeDamage(hitPuddle?.dmg ?? this._rainPuddles[0].dmg); }
        }
      }
    }

    // Y-sort: use foot position so objects sort at ground level
    this.player.setDepth(this.player.y + 30);
    if (this.bossActive) this.boss.setDepth(this.boss.y + 20);
    for (const m of this.allMinions) {
      if (!m.isDead) m.setDepth(m.y + 16);
    }

    this.updateOrbitBalls(this.game.loop.delta);
    this.updatePartnerOrbitBalls(this.game.loop.delta);
    this.updatePlayerKnives(this.game.loop.delta);
    this.updatePartnerKnives(this.game.loop.delta);

    if (this._divineShieldGfx && this.player.active) {
      const g = this._divineShieldGfx;
      g.setPosition(this.player.x, this.player.y).clear();
      const t = this.time.now / 1000;
      const pulse = P(24) + Math.sin(t * 5) * P(2);

      // 填充光暈
      g.fillStyle(0xffd700, 0.07 + Math.sin(t * 5) * 0.03);
      g.fillCircle(0, 0, pulse);

      // 外圈（粗，主色）
      g.lineStyle(P(2.5), 0xffd700, 0.85 + Math.sin(t * 5) * 0.12);
      g.strokeCircle(0, 0, pulse);

      // 內圈（細，白色）
      g.lineStyle(P(1), 0xffffff, 0.45);
      g.strokeCircle(0, 0, pulse - P(4));

      // 六道旋轉短弧（鑽石感）
      const spokeCount = 6;
      const rotOffset = t * 1.2;
      for (let i = 0; i < spokeCount; i++) {
        const a = rotOffset + (i / spokeCount) * Math.PI * 2;
        const x1 = Math.cos(a) * (pulse - P(7));
        const y1 = Math.sin(a) * (pulse - P(7));
        const x2 = Math.cos(a) * (pulse + P(3));
        const y2 = Math.sin(a) * (pulse + P(3));
        g.lineStyle(P(1.5), 0xffe066, 0.7);
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.strokePath();
      }
    }

    // 業火盾光暈（跟隨玩家）
    if (this._blazingGfx && this._blazingActive && this.player.active) {
      const g = this._blazingGfx;
      g.setPosition(this.player.x, this.player.y).clear();
      const t = this.time.now / 1000;
      const r = P(20) + Math.sin(t * 8) * P(2);
      g.fillStyle(0xff4400, 0.08 + Math.sin(t * 8) * 0.04);
      g.fillCircle(0, 0, r);
      g.lineStyle(P(2), 0xff6600, 0.80 + Math.sin(t * 8) * 0.15);
      g.strokeCircle(0, 0, r);
    }


    // ── 花怪充能回復 + 按鈕 UI ────────────────────────────────
    if ((CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || SkillTreeStore.getAttackMode() === 'flowerMode') {
      if (this._flowerCharges < this._flowerMaxCharges) {
        this._flowerChargeAccum += this.game.loop.delta;
        if (this._flowerChargeAccum >= this._FLOWER_CHARGE_MS) {
          this._flowerChargeAccum -= this._FLOWER_CHARGE_MS;
          this._flowerCharges = Math.min(this._flowerCharges + 1, this._flowerMaxCharges);
        }
      }
      this.updateFlowerBtnUI();
    }
  }

  // ── 花怪按鈕充能 UI ─────────────────────────────────────────

  private updateFlowerBtnUI(): void {
    const g = this._flowerChargeGfx;
    const t = this._flowerChargeTxt;
    if (!g || !t) return;
    g.clear();
    const cx = this.scale.width - P(70);
    const cy = this.scale.height - P(70);
    const r = P(52);

    // 充能圓弧（從上方順時針，顯示下一格充能進度）
    if (this._flowerCharges < this._flowerMaxCharges) {
      const pct = this._flowerChargeAccum / this._FLOWER_CHARGE_MS;
      const startA = -Math.PI / 2;
      const endA = startA + pct * Math.PI * 2;
      g.lineStyle(P(4), 0x88ffaa, 0.85);
      g.beginPath();
      g.arc(cx, cy, r - P(5), startA, endA, false);
      g.strokePath();
    }

    // 充能圓點（底部 3 點）
    const dotR = P(5);
    const dotSpacing = P(14);
    const dotY = cy + r - P(24);
    for (let i = 0; i < this._flowerMaxCharges; i++) {
      const dx = cx + (i - (this._flowerMaxCharges - 1) / 2) * dotSpacing;
      if (i < this._flowerCharges) {
        g.fillStyle(0x88ffaa, 0.95);
      } else {
        g.fillStyle(0x224422, 0.70);
      }
      g.fillCircle(dx, dotY, dotR);
      g.lineStyle(P(1), 0x44cc66, 0.6);
      g.strokeCircle(dx, dotY, dotR);
    }

    // 充能數字（圓點上方）
    t.setPosition(cx, dotY - P(14));
    t.setText(`${this._flowerCharges}/${this._flowerMaxCharges}`);
    t.setColor(this._flowerCharges === 0 ? '#886644' : '#ccffcc');
  }

  // ── Attack dispatcher ────────────────────────────────────

  private playSfx(key: string, factor = 1.0): void {
    AudioService.playSfx(this, key, factor);
  }

  private getEffectiveAtkSpeed(): number {
    const stats = CardStore.getTotalStats();
    return stats.atkSpeed + this._sanguineStacks * (stats.bloodlustAtkSpeedPerStack ?? 0);
  }

  protected _fireHoldAttack(): void {
    if (this.gameOver || !this.player.active) return;
    const isDash = SkillTreeStore.getAttackMode() === 'dashPierce';
    const isFlowerMode = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || SkillTreeStore.getAttackMode() === 'flowerMode';
    if (isFlowerMode) {
      this.tryFlowerSummonModeAttack();
    } else if (isDash) {
      this.attackDashPierce(0, 0);
    } else {
      const { x: tx, y: ty } = this.getAttackTarget();
      this.meleeAttack(tx, ty);
    }
  }

  protected meleeAttack(tx: number, ty: number): void {
    this._bloodlustSwingHandled = false;
    this._sanguineSwingHandled = false;
    const behavior = SkillTreeStore.getAttackMode();
    if (behavior === 'aura') return;
    if ((CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || behavior === 'flowerMode') {
      this.tryFlowerSummonModeAttack();
      return;
    }
    switch (behavior) {
      case 'whirlwind': this.attackWhirlwind(tx, ty); break;
      case 'dashPierce': this.attackDashPierce(tx, ty); break;
      case 'projectile': this.attackProjectile(tx, ty); break;
      case 'multiHit': this.attackMultiHit(tx, ty); break;
      case 'chargeSlam': this.attackChargeSlam(tx, ty); break;
      case 'boomerang': this.attackBoomerang(tx, ty); break;
      case 'hellfire': this.attackMagicFire(tx, ty); break;
      case 'knifeThrow': this.attackKnifeThrow(); break;
      default: this.attackSlash180(tx, ty);
    }
  }

  // ── Unified damage helpers ────────────────────────────────

  private getHittableTargets(): Array<MinionSlime | Boss> {
    const out: Array<MinionSlime | Boss> = this.allMinions.filter(m => !m.isDead && !this._allyMinions.includes(m)) as Array<MinionSlime | Boss>;
    if (this.bossActive && this.boss.active) {
      out.push(this.boss);
      const vk3 = this.boss as BossVampire3;
      if (vk3._splitActive) {
        for (const c of vk3._splitCloneProxies) {
          if (!c.isDead) out.push(c as unknown as MinionSlime);
        }
      }
    }
    return out;
  }

  private dealDamage(
    target: MinionSlime | Boss,
    dmgMult: number,
    srcX: number, srcY: number,
    dir: 'down' | 'left' | 'right' | 'up',
    attackElem: import('../data/equipment-data').Element = 'none',
    skipOnHitProcs = false,
  ): void {
    const stats = CardStore.getTotalStats();
    const isCrit = Math.random() < stats.crit;
    const isBoss = target === this.boss;
    const tgtElem = isBoss ? this.boss.element : (target as import('../objects/minion-slime').MinionSlime).element;
    const tgtTier = isBoss ? 5 : (target as import('../objects/minion-slime').MinionSlime).tier;
    const elemMult = isBoss ? getElementMultiplier(attackElem, this.boss.element) : 1;

    let targetMult = 1;
    if (stats.dmgVsFire && tgtElem === 'fire') targetMult += stats.dmgVsFire;
    if (stats.dmgVsWater && tgtElem === 'water') targetMult += stats.dmgVsWater;
    if (stats.dmgVsGrass && tgtElem === 'grass') targetMult += stats.dmgVsGrass;
    if (stats.dmgVsNone && tgtElem === 'none') targetMult += stats.dmgVsNone;
    if (stats.dmgVsAnyElement && tgtElem !== 'none') targetMult += stats.dmgVsAnyElement;
    if (stats.dmgVsEliteOrBoss && tgtTier >= 3) targetMult += stats.dmgVsEliteOrBoss;
    if (stats.dmgVsSlime && (target as any).race === 'slime') targetMult += stats.dmgVsSlime;
    if (stats.dmgVsPlant && (target as any).race === 'plant') targetMult += stats.dmgVsPlant;
    if (stats.dmgVsBoss && isBoss) targetMult += stats.dmgVsBoss;
    if (stats.eliteKillerPct && tgtTier >= 3) targetMult += stats.eliteKillerPct;
    if (stats.burnedEnemyDmgAmp && (target as any).burnStacks > 0) targetMult += stats.burnedEnemyDmgAmp;

    // 暴徒本能：爆擊觸發，每次攻擊只計一次
    const bloodlustActive = (stats.bloodlust ?? 0) >= 1;
    if (bloodlustActive && isCrit && !this._bloodlustSwingHandled) {
      this._bloodlustSwingHandled = true;
      this.addBloodlustStack(Math.round(stats.bloodlustMaxStacks ?? 5));
    }
    // 嗜血本能：命中觸發，每次攻擊只計一次
    const sanguineActive = (stats.sanguine ?? 0) >= 1;
    if (sanguineActive && !this._sanguineSwingHandled) {
      this._sanguineSwingHandled = true;
      this.addSanguineStack(Math.round(stats.sanguineMaxStacks ?? 5));
    }
    const bloodlustDmgMult = (bloodlustActive && (stats.bloodlustDmgPerStack ?? 0) > 0)
      ? (1 + this._bloodlustStacks * (stats.bloodlustDmgPerStack ?? 0))
      : 1;

    const allMult = 1 + (stats.allDmgPct ?? 0);
    const atkBuffMult = this._atkBuffActive ? 1.2 : 1;
    const blazingMult = this._blazingActive ? (1 + (stats.blazingShieldAtkPct ?? 0)) : 1;
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    const isStandstill = body.velocity.x === 0 && body.velocity.y === 0;
    const standstillMult = isStandstill ? (1 + (stats.standstillDmgPct ?? 0)) : 1;
    const lowHpAtk = (stats.condLowHpAtk && this.player.currentHp / this.player.maxHpValue < 0.4) ? (stats.condLowHpAtk ?? 0) : 0;
    // 蓄勁一閃：計數器達到 impaleCharge 時爆發
    const impaleCharge = stats.impaleCharge ?? 0;
    let impaleMult = 1;
    if (impaleCharge > 0 && (stats.impaleDmgPct ?? 0) > 0) {
      this._impaleHitCount++;
      if (this._impaleHitCount >= impaleCharge) {
        impaleMult = 1 + (stats.impaleDmgPct ?? 0);
        this._impaleHitCount = 0;
        this._showImpaleEffect(target.x, target.y);
      }
    }
    // 血脈噴張：血量越低傷害和吸血越高
    let bloodRageMult = 1;
    let bloodRageLeech = 0;
    if ((stats.bloodRage ?? 0) >= 1) {
      const hpRatio = this.player.currentHp / this.player.maxHpValue;
      const t = Math.min(Math.max((1 - hpRatio) / 0.8, 0), 1);
      bloodRageMult = 1.10 + 0.40 * t;
      bloodRageLeech = 0.005 + 0.025 * t;
    }
    const tutorialAtkBonus = this._isTutorial ? 250 : 0;
    const dmg = Math.round((stats.atk + lowHpAtk + tutorialAtkBonus) * Phaser.Math.FloatBetween(0.85, 1.15) * dmgMult * (isCrit ? (1 + stats.critDmg) : 1) * elemMult * targetMult * allMult * atkBuffMult * blazingMult * bloodlustDmgMult * impaleMult * bloodRageMult * standstillMult);
    const pen = stats.penetration ?? 0;

    if (isBoss && (this.boss as any).isGuarding) {
      (this.boss as any).onGuardBreak?.();
      this._showBossKanji(tr('game.hud.block'), this.boss.x, this.boss.y);
      return;
    }

    let overkill = 0;
    const bossHpBefore = isBoss ? this.boss.currentHp : 0;
    if (!isBoss) {
      overkill = (target as MinionSlime).takeDamage(dmg, pen);
      // 殘血斬殺：HP低於閾值且尚未死亡時直接擊殺
      if (!(target as MinionSlime).isDead && (stats.executePct ?? 0) > 0) {
        const m = target as MinionSlime;
        if (m.currentHp / m.maxHpValue < stats.executePct!) {
          overkill = m.takeDamage(m.currentHp + 1, pen);
        }
      }
    } else {
      target.takeDamage(dmg, pen);
    }

    target.knockback(srcX, srcY);
    const displayDmg = isBoss ? Math.round(dmg * this.boss.dmgDisplayMult) : dmg;
    if (stats.lifesteal > 0) {
      const leech = Math.round(displayDmg * stats.lifesteal);
      if (stats.lifestealInstant) this.player.heal(leech); else this._leechPool += leech;
    }
    if (bloodRageLeech > 0) this._leechPool += Math.round(displayDmg * bloodRageLeech);
    if (!skipOnHitProcs) {
      const onHitKnife = stats.onHitKnifeChance ?? 0;
      if (onHitKnife > 0 && this.time.now > this._onHitKnifeCooldown && Math.random() < onHitKnife) {
        this._onHitKnifeCooldown = this.time.now + 200;
        this.firePeriodicKnives();
      }
    }
    this.spawnDamageNumber(target.x, target.y, displayDmg, isCrit, elemMult * targetMult);
    this._pendingDailyDmg += displayDmg;
    if (!this._pendingDailyDmgPending) {
      this._pendingDailyDmgPending = true;
      this.time.delayedCall(0, () => {
        DailyQuestStore.addProgress('deal_damage', this._pendingDailyDmg);
        this._pendingDailyDmg = 0;
        this._pendingDailyDmgPending = false;
      });
    }
    if (isCrit) this._pendingHitWeight += 2;
    if (!this._hitShakePending) {
      this._hitShakePending = true;
      this.time.delayedCall(0, () => {
        this.triggerHitShake(this._pendingHitWeight);
        this._pendingHitWeight = 0;
        this._hitShakePending = false;
      });
    }
    if (NetworkService.connected) {
      if (isBoss) NetworkService.sendBossHit(bossHpBefore - this.boss.currentHp);
      else {
        const minion = target as MinionSlime;
        NetworkService.sendMinionHit(minion.minionId, dmg, minion.isDead);
      }
    }

    // 溢出傷害 AOE
    if ((stats.overkillSplash ?? 0) > 0 && overkill > 0) {
      this.overkillSplash(target.x, target.y, overkill);
    }

    // 靈魂收割：擊殺觸發衝擊波+回血
    if ((stats.soulHarvest ?? 0) >= 1 && !isBoss && (target as MinionSlime).isDead) {
      this._soulHarvestProc(target.x, target.y);
    }

    // 擊殺回血 & 擊殺護盾
    if (!isBoss && (target as MinionSlime).isDead) {
      if ((stats.onKillHeal ?? 0) > 0) this.player.heal(Math.round(stats.onKillHeal!));
      if ((stats.killShieldPerKill ?? 0) > 0) this.player.addKillShield(Math.round(stats.killShieldPerKill!));
    }

    // 傷害濺射
    if ((stats.damageSplash ?? 0) > 0) {
      this.damageSplashProc(target, dmg, stats.damageSplashPct ?? 0.20, Math.round(stats.damageSplashCount ?? 3));
    }

    // 神盾護體觸發（每次攻擊動作只判定一次，300ms 鎖避免多目標重複判）
    const shieldChance = stats.divineShieldChance ?? 0;
    if (shieldChance > 0 && this.time.now > this._divineShieldRollUntil) {
      this._divineShieldRollUntil = this.time.now + 300;
      if (Math.random() < shieldChance) this.triggerDivineShield();
    }

    // 召喚友軍花怪觸發（卡片 + 技能樹機率合計）
    const summonChance = (stats.summonFlowerChance ?? 0) + (stats.skillFlowerChance ?? 0);
    if (summonChance > 0 && Math.random() < summonChance) this.trySummonAllyFlower();

    // 攻擊觸發落雷
    if (!skipOnHitProcs) {
      const onHitLightning = stats.onHitLightningChance ?? 0;
      if (onHitLightning > 0 && this.time.now > this._onHitLightningCooldown && Math.random() < onHitLightning) {
        this._onHitLightningCooldown = this.time.now + 200;
        if ((stats.lightningStrike ?? 0) >= 1) this.fireLightningStrike();
        else this.fireOnHitLightning(stats);
      }
    }
  }

  private hitInArea(
    ox: number, oy: number,
    range: number,
    dmgMult: number,
    arcDeg: number,           // 360 = 全向
    facingDeg: number,
    dir: 'down' | 'left' | 'right' | 'up',
  ): void {
    const halfArc = arcDeg / 2;
    const inArc = (ex: number, ey: number) => {
      if (arcDeg >= 360) return true;
      const a = Phaser.Math.RadToDeg(Math.atan2(ey - oy, ex - ox));
      return Math.abs(Phaser.Math.Angle.ShortestBetween(facingDeg, a)) <= halfArc;
    };
    for (const t of this.getHittableTargets()) {
      if (Phaser.Math.Distance.Between(ox, oy, t.x, t.y) > range) continue;
      if (!inArc(t.x, t.y)) continue;
      this.dealDamage(t, dmgMult, ox, oy, dir);
    }
  }

  private resolveAttackDir(range: number): { dir: 'down' | 'left' | 'right' | 'up'; deg: number; rad: number; tx: number; ty: number } {
    const radMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const degMap: Record<string, number> = { right: 0, down: 90, left: 180, up: 270 };

    // 手動拖動方向優先
    if (this._forceAttackAngle !== null) {
      const rad = this._forceAttackAngle;
      this._forceAttackAngle = null;
      const dx = Math.cos(rad), dy = Math.sin(rad);
      const dir: 'down' | 'left' | 'right' | 'up' =
        Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      const deg = Phaser.Math.RadToDeg(rad < 0 ? rad + Math.PI * 2 : rad);
      return { dir, deg, rad, tx: this.player.x + dx * range, ty: this.player.y + dy * range };
    }

    const candidates = [
      ...this.allMinions.filter(m => !m.isDead && !this._allyMinions.includes(m)),
      ...(this.bossActive && this.boss.active ? [this.boss] : []),
    ].filter(m => Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) <= range)
      .sort((a, b) =>
        Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) -
        Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y));

    if (candidates.length > 0) {
      const { dir, deg, rad } = this.attackDir(candidates[0].x, candidates[0].y);
      return { dir, deg, rad, tx: candidates[0].x, ty: candidates[0].y };
    }
    const dir = this.player.lastDir;
    return { dir, deg: degMap[dir], rad: radMap[dir], tx: this.player.x + Math.cos(radMap[dir]), ty: this.player.y + Math.sin(radMap[dir]) };
  }

  private attackDir(tx: number, ty: number): { dir: 'down' | 'left' | 'right' | 'up'; deg: number; rad: number } {
    const dx = tx - this.player.x, dy = ty - this.player.y;
    const dir: 'down' | 'left' | 'right' | 'up' =
      Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const degMap = { right: 0, down: 90, left: 180, up: 270 };
    return { dir, deg: degMap[dir], rad: Math.atan2(dy, dx) };
  }

  // ── 基本攻擊 slash180 ─────────────────────────────────────

  private attackSlash180(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const cd = Math.round(650 / (1 + this.getEffectiveAtkSpeed()));
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing2');
    const { dir, rad, tx, ty } = this.resolveAttackDir(MELEE_RANGE * 3);
    const arc = stats.attackArc;
    this.player.playAttack(tx, ty, () => {
      const px = this.player.x, py = this.player.y;
      const D = this.player.depth;
      const arcRad = Phaser.Math.DegToRad(arc);
      const sa = rad - arcRad / 2;
      const ea = rad + arcRad / 2;
      const R = MELEE_RANGE + P(5);

      const hitTargets = new Set<object>();
      const checkSweepHit = (curEa: number) => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          const dx = t.x - px, dy = t.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const hitR = t instanceof Boss ? P(20) : (t as MinionSlime).isElite ? P(10) : P(5);
          if (dist > R + hitR) continue;
          let tAngle = Math.atan2(dy, dx);
          while (tAngle < sa - 0.01) tAngle += Math.PI * 2;
          if (tAngle > curEa + 0.01) continue;
          hitTargets.add(t);
          this.dealDamage(t, 1.0 * (1 + (stats.slash180DmgPct ?? 0)), px, py, dir);
        }
      };
      this.fxSlash180(px, py, sa, ea, R, D, checkSweepHit);
    });
  }

  // ── 旋風斬 whirlwind ──────────────────────────────────────

  private attackWhirlwind(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const cd = Math.round(650 / (1 + this.getEffectiveAtkSpeed()));
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing1');
    const RANGE = Math.round(MELEE_RANGE * 1.1 * (1 + (stats.whirlwindRangePct ?? 0)));
    const px = this.player.x, py = this.player.y;
    const D = this.player.depth;
    this.player.playWhirlwind(() => {
      this.hitInArea(px, py, RANGE, 0.95 * (1 + (stats.whirlwindDmgPct ?? 0)), 360, 0, 'down');
      this.fxWhirlwind(px, py, RANGE, D);
    });
  }

  // ── 瞬步斬 dashPierce ─────────────────────────────────────

  private calcDashEndpoint(sx: number, sy: number, rad: number): { x: number; y: number } {
    const _ds = CardStore.getTotalStats();
    const DASH = P(78) * (1 + (_ds.dashDistPct ?? 0)) + (_ds.dashDistBonus ?? 0), PAD = P(32), STEP = P(4), PW = P(10), PH = P(8);
    let endX = Phaser.Math.Clamp(sx + Math.cos(rad) * DASH, PAD, this.worldW - PAD);
    let endY = Phaser.Math.Clamp(sy + Math.sin(rad) * DASH, PAD, this.worldH - PAD);
    const steps = Math.ceil(Phaser.Math.Distance.Between(sx, sy, endX, endY) / STEP);
    const dx = (endX - sx) / steps, dy = (endY - sy) / steps;
    let safeX = sx, safeY = sy;
    for (let i = 1; i <= steps; i++) {
      const tx = sx + dx * i, ty = sy + dy * i;
      if (!this.isInOpenArea(tx, ty)) break;
      safeX = tx; safeY = ty;
    }
    return { x: safeX, y: safeY };
  }

  protected attackDashPierce(_tx: number, _ty: number): void {
    const cd = Math.round(650 / (1 + this.getEffectiveAtkSpeed()));
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing2');
    if (this._forceAttackAngle !== null) {
      this.dashAimAngle = this._forceAttackAngle;
      this._forceAttackAngle = null;
    } else {
      const radMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
      this.dashAimAngle = radMap[this.player.lastDir];
    }
    this.executeDashPierce(this.dashAimAngle);
  }

  private executeDashPierce(rad: number): void {
    const stats = CardStore.getTotalStats();
    const isDouble = (stats.dashDoubleHit ?? 0) >= 1;
    const dmgMult = isDouble ? 0.55 : 0.91;
    const dx = Math.cos(rad), dy = Math.sin(rad);
    const dir: 'down' | 'left' | 'right' | 'up' =
      Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    this.player.startAttackAnim(`player_attack_${dir}`);
    const sx = this.player.x, sy = this.player.y;
    const { x: endX, y: endY } = this.calcDashEndpoint(sx, sy, rad);
    const hitTargets = new Set<object>();
    const D = this.player.depth;

    this.fxDashPierce(sx, sy, endX, endY, rad, D);

    // ── 衝刺 + 傷害判定 ──────────────────────────────────
    this.tweens.add({
      targets: this.player, x: endX, y: endY, duration: 160, ease: 'Quad.Out',
      onUpdate: () => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) > P(28)) continue;
          hitTargets.add(t);
          this.dealDamage(t, dmgMult * (1 + (stats.dashDmgPct ?? 0)), this.player.x, this.player.y, dir);
        }
        if (this._towerPortalHit &&
            Phaser.Math.Distance.Between(this.player.x, this.player.y, this._towerPortalX, this._towerPortalY) <= P(40)) {
          this._enterTowerPortal();
        }
      },
      onComplete: () => {
        if (!isDouble) return;
        // 第二刀：對本次衝刺穿過的相同目標補刀
        const px = this.player.x, py = this.player.y;
        for (const t of this.getHittableTargets()) {
          if (!hitTargets.has(t)) continue;
          this.dealDamage(t, dmgMult * (1 + (stats.dashDmgPct ?? 0)), px, py, dir);
        }
      },
    });
  }

  // ── 刀風 projectile ───────────────────────────────────────

  private attackProjectile(_tx: number, _ty: number): void {
    const stats0 = CardStore.getTotalStats();
    const MAX_DIST = P(155) * (1 + (stats0.projectileDistPct ?? 0)) + (stats0.projectileDistBonus ?? 0);
    const SPEED = P(380);
    const { dir, rad } = this.resolveAttackDir(P(240));

    const cd = Math.round(650 / (1 + this.getEffectiveAtkSpeed()));
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing1');
    this.player.startAttackAnim(`player_attack_${dir}`, rad);
    const isFan = (stats0.projectileFan ?? 0) >= 1;
    const HIT_R = P(18) * (isFan ? 0.6 : 1);
    const dmgMult = isFan ? 0.80 : 0.55;
    const FAN_RAD = 11 * (Math.PI / 180);   // 11°
    const angles = isFan ? [rad - FAN_RAD, rad, rad + FAN_RAD] : [rad];
    const hitTargets = new Set<object>();   // 共用，同一目標只算一次

    for (const angle of angles) {
      this.fxProjectile(this.player.x, this.player.y, angle, this.player.depth + 1, SPEED, MAX_DIST, (px, py) => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          if (Phaser.Math.Distance.Between(px, py, t.x, t.y) > HIT_R) continue;
          hitTargets.add(t);
          this.dealDamage(t, dmgMult * (1 + (stats0.projectileDmgPct ?? 0)), px, py, dir);
        }
      });
    }
  }

  // ── 多段連擊 multiHit ─────────────────────────────────────

  private attackMultiHit(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const spd = 1 + this.getEffectiveAtkSpeed();
    const cd = Math.round(650 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir, deg } = this.resolveAttackDir(MELEE_RANGE * 3);
    const arc = stats.attackArc;
    const rootMs = stats.multiHitNoStagger ? 0 : Math.round(450 / spd);
    this.player.setRooted(rootMs);
    this.player.startAttackAnim(`player_multihit_${dir}`);

    const rad0 = Phaser.Math.DegToRad(deg);
    const DELAYS = [55, 115, 175, 235, 310];

    DELAYS.map(d => Math.round(d / spd)).forEach((delay, hitIdx) => {
      this.time.delayedCall(delay, () => {
        this.playSfx('sfx_swing2', 0.88);
        const px = this.player.x, py = this.player.y;
        const D = this.player.depth;
        this.hitInArea(px, py, MELEE_RANGE, 0.29 * (1 + (stats.multiHitDmgPct ?? 0)), arc, deg, dir);
        this.fxMultiHitSlash(px, py, D, rad0, hitIdx, MELEE_RANGE);
      });
    });
  }

  // ── 迴旋飛刃 boomerang ────────────────────────────────────

  private attackBoomerang(_tx: number, _ty: number): void {
    const bStats = CardStore.getTotalStats();
    const spd = 1 + this.getEffectiveAtkSpeed();
    const cd = Math.round(1500 / spd);
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing5');
    const { dir, rad } = this.resolveAttackDir(P(240));
    this.player.startAttackAnim(`player_attack_${dir}`);

    const rangeMult = 1 + (bStats.boomerangRangePct ?? 0);
    const HIT_R = Math.round(P(14) * rangeMult);
    const SPIN_R = Math.round(P(26) * rangeMult);
    const MAX_DIST = P(160);
    const SPIN_MS = Math.round(800 / spd);
    const destX = this.player.x + Math.cos(rad) * MAX_DIST;
    const destY = this.player.y + Math.sin(rad) * MAX_DIST;
    const D = this.player.depth;

    const hitOut = new Set<object>();
    const hitBack = new Set<object>();

    this.fxBoomerang(
      this.player.x, this.player.y, destX, destY,
      rad, D, HIT_R, SPIN_R, SPIN_MS,
      () => ({ x: this.player.x, y: this.player.y }),
      {
        onHitOut: (bx, by) => {
          let hit = false;
          const boomMult = 1 + (bStats.boomerangDmgPct ?? 0);
          for (const t of this.getHittableTargets()) {
            if (hitOut.has(t)) continue;
            if (Phaser.Math.Distance.Between(bx, by, t.x, t.y) > HIT_R) continue;
            hitOut.add(t); hit = true;
            this.dealDamage(t, 0.60 * boomMult, bx, by, dir);
          }
          return hit;
        },
        onSpinTick: (bx, by) => this.hitInArea(bx, by, SPIN_R, 0.30 * (1 + (bStats.boomerangDmgPct ?? 0)), 360, 0, dir),
        onHitBack: (bx, by) => {
          const boomMult = 1 + (bStats.boomerangDmgPct ?? 0);
          for (const t of this.getHittableTargets()) {
            if (hitBack.has(t)) continue;
            if (Phaser.Math.Distance.Between(bx, by, t.x, t.y) > HIT_R) continue;
            hitBack.add(t);
            this.dealDamage(t, 0.60 * boomMult, bx, by, dir);
          }
        },
      },
    );
  }

  // ── 魔法火 magicFire ─────────────────────────────────────

  private attackKnifeThrow(): void {
    const spd = 1 + this.getEffectiveAtkSpeed();
    const cd = Math.round(650 / spd);
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing5');
    const { dir, rad } = this.resolveAttackDir(P(240));
    this.player.startAttackAnim(`player_attack_${dir}`, rad);
    this.time.delayedCall(150, () => this.firePeriodicKnives());
  }

  private attackMagicFire(_tx: number, _ty: number): void {
    const spd = 1 + this.getEffectiveAtkSpeed();
    const cd = Math.round(1100 / spd);
    if (!this.player.lockCooldown(cd)) return;
    this.playSfx('sfx_swing3');
    const { dir, rad } = this.resolveAttackDir(P(260));
    this.player.startAttackAnim(`player_attack_${dir}`);

    const SPEED = P(300);
    const MAX_DIST = P(200);
    const ORB_R = P(14);
    const FIRE_R = P(25);
    const FIRE_DUR = 3000;

    const spawnFire = (fx: number, fy: number) => {
      this.fxMagicFireGround(fx, fy);

      const fireEntry = { x: fx, y: fy, r: FIRE_R, expiresAt: this.time.now + FIRE_DUR };
      this.activeFires.push(fireEntry);

      const now = this.time.now;
      for (const m of this.allMinions) {
        if (!m.isDead && Phaser.Math.Distance.Between(fx, fy, m.x, m.y) <= FIRE_R)
          m.applyBurn(now);
      }
      if (this.bossActive && this.boss.active &&
        Phaser.Math.Distance.Between(fx, fy, this.boss.x, this.boss.y) <= FIRE_R)
        this.boss.applyBurn(now);
    };

    let hit = false;
    this.fxMagicFire(
      this.player.x, this.player.y, rad, this.player.depth,
      SPEED, MAX_DIST,
      (ox, oy) => {
        if (hit) return true;
        for (const t of this.getHittableTargets()) {
          if (Phaser.Math.Distance.Between(ox, oy, t.x, t.y) > ORB_R) continue;
          hit = true;
          this.dealDamage(t, 0.30, ox, oy, dir, 'fire');
          return true;
        }
        return false;
      },
      (fx, fy) => spawnFire(fx, fy),
    );
  }

  // ── 血環 aura（被動，每 0.25 秒） ────────────────────────────

  private readonly AURA_RANGE = P(56);

  // ── Burn constants — future cards can pass different values to applyBurn ──
  private readonly BURN_MAX_STACKS = 15;
  private readonly BURN_DURATION = 4000; // ms
  private readonly BURN_SOFT_CAP = 8;    // stacks above this decay faster each tick

  private tickBurns(): void {
    if (this.gameOver) return;
    const now = this.time.now;
    const stats = CardStore.getTotalStats();

    // 清除過期火焰
    this.activeFires = this.activeFires.filter(f => now < f.expiresAt);

    // 植物陷阱區域傷害
    this.plantZones = this.plantZones.filter(z => {
      if (now >= z.expiresAt) { z.gfx.destroy(); return false; }
      return true;
    });
    for (const z of this.plantZones) {
      if (now < z.lastTick + z.tickInterval) continue;
      z.lastTick = now;
      let playerHit = false;
      const allyHits: MinionSlime[] = [];
      if (z.type === 'circle') {
        playerHit = Phaser.Math.Distance.Between(z.x, z.y, this.player.x, this.player.y) <= z.r;
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(z.x, z.y, ally.x, ally.y) <= z.r)
            allyHits.push(ally);
        }
      } else {
        // vine: line segment check
        const nx = Math.cos(z.ang!), ny = Math.sin(z.ang!);
        const dx = this.player.x - z.x, dy = this.player.y - z.y;
        const proj = dx * nx + dy * ny;
        const perp = Math.abs(dx * (-ny) + dy * nx);
        playerHit = proj >= 0 && proj <= z.len! && perp <= z.r;
        for (const ally of this._allyMinions) {
          if (ally.isDead) continue;
          const adx = ally.x - z.x, ady = ally.y - z.y;
          const ap = adx * nx + ady * ny;
          const aperp = Math.abs(adx * (-ny) + ady * nx);
          if (ap >= 0 && ap <= z.len! && aperp <= z.r) allyHits.push(ally);
        }
      }
      if (playerHit) this.player.takeDamage(z.dmg);
      for (const ally of allyHits) ally.takeDamage(z.dmg);
    }

    // burnMaxStackBonus 卡片效果
    const burnCap = this.BURN_MAX_STACKS + (stats.burnMaxStackBonus ?? 0);

    // condDotStackBonus：dotBonus≥30% 時每層額外加成
    const condDotActive = stats.dotBonus >= 0.30 && (stats.condDotStackBonus ?? 0) > 0;

    // 業火：技能控制是否所有目標每 tick 疊兩層
    const isDoubleStack = (stats.burnDoubleStack ?? 0) >= 1;

    // 對踩在任意火焰內的敵人疊層，同時記錄誰在火裡
    const minionInFire = new Set<(typeof this.allMinions)[number]>();
    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(m.x, m.y, f.x, f.y) <= f.r)) {
        m.applyBurn(now, burnCap, this.BURN_DURATION);
        if (isDoubleStack) m.applyBurn(now, burnCap, this.BURN_DURATION);
        minionInFire.add(m);
      }
    }
    let bossInFire = false;
    if (this.bossActive && this.boss.active) {
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(this.boss.x, this.boss.y, f.x, f.y) <= f.r)) {
        this.boss.applyBurn(now, burnCap, this.BURN_DURATION);
        if (isDoubleStack) this.boss.applyBurn(now, burnCap, this.BURN_DURATION);
        bossInFire = true;
      }
    }

    // burnSpread 卡片效果 + 技能擴散：BFS 連鎖傳播，同一 tick 內整群都能著火
    const cardSpreadR = (stats.burnSpread ?? 0) > 0 ? P(100) : 0;
    const skillSpreadR = P(stats.burnSpreadSkillPx ?? 0);
    const burnSpreadR = Math.max(cardSpreadR, skillSpreadR);
    if (burnSpreadR > 0) {
      // 收集所有當前有燃燒的怪作為初始火源
      const spreadQueue: (typeof this.allMinions)[number][] = [];
      const spreadSeen = new Set<(typeof this.allMinions)[number]>();
      for (const m of this.allMinions) {
        if (!m.isDead && m.burnStacks > 0 && now < m.burnExpiresAt) {
          spreadQueue.push(m);
          spreadSeen.add(m);
        }
      }
      if (this.bossActive && this.boss.active && this.boss.burnStacks > 0 && now < this.boss.burnExpiresAt) {
        for (const m of this.allMinions) {
          if (m.isDead || spreadSeen.has(m)) continue;
          if (Phaser.Math.Distance.Between(this.boss.x, this.boss.y, m.x, m.y) <= burnSpreadR) {
            m.burnStacks = Math.min(burnCap, Math.max(m.burnStacks, this.boss.burnStacks));
            m.burnExpiresAt = now + this.BURN_DURATION;
            minionInFire.add(m);
            spreadQueue.push(m);
            spreadSeen.add(m);
          }
        }
      }
      // BFS：剛著火的怪立刻成為火源，直接繼承來源層數
      let qi = 0;
      while (qi < spreadQueue.length) {
        const src = spreadQueue[qi++];
        for (const other of this.allMinions) {
          if (other.isDead || spreadSeen.has(other)) continue;
          if (Phaser.Math.Distance.Between(src.x, src.y, other.x, other.y) <= burnSpreadR) {
            other.burnStacks = Math.min(burnCap, Math.max(other.burnStacks, src.burnStacks));
            other.burnExpiresAt = now + this.BURN_DURATION;
            minionInFire.add(other);
            spreadQueue.push(other);
            spreadSeen.add(other);
          }
        }
      }
    }

    // 離開火焰才衰減：高層數衰減更快，創造 8-10 層的自然平均值
    const applyDecay = (stacks: number): number =>
      Math.max(0, stacks - Math.max(1, Math.ceil(stacks / this.BURN_SOFT_CAP)));

    // 造成燃燒傷害
    for (const m of this.allMinions) {
      if (m.isDead || m.burnStacks <= 0) continue;
      if (now >= m.burnExpiresAt) { m.burnStacks = 0; continue; }
      if (!minionInFire.has(m)) m.burnStacks = applyDecay(m.burnStacks);
      const dotMult = 1 + stats.dotBonus + (condDotActive ? (stats.condDotStackBonus! * m.burnStacks) : 0);
      const dmg = Math.round(stats.atk * 0.030 * m.burnStacks * dotMult);
      const burnOverkill = m.takeDamage(dmg);
      this.spawnDamageNumber(m.x, m.y, dmg, false, 1);
      if (NetworkService.connected) NetworkService.sendMinionHit(m.minionId, dmg);
      // 燃燒擊殺觸發（護盾/回血/靈魂收割，不觸發落雷/飛刀）
      if (m.isDead) {
        if ((stats.overkillSplash ?? 0) > 0 && burnOverkill > 0) this.overkillSplash(m.x, m.y, burnOverkill);
        if ((stats.soulHarvest ?? 0) >= 1) this._soulHarvestProc(m.x, m.y);
        if ((stats.onKillHeal ?? 0) > 0) this.player.heal(Math.round(stats.onKillHeal!));
        if ((stats.killShieldPerKill ?? 0) > 0) this.player.addKillShield(Math.round(stats.killShieldPerKill!));
      }
    }
    if (this.bossActive && this.boss.active && this.boss.burnStacks > 0) {
      if (now >= this.boss.burnExpiresAt) { this.boss.burnStacks = 0; this.refreshBossBar(); return; }
      if (!bossInFire) this.boss.burnStacks = applyDecay(this.boss.burnStacks);
      const elemMult = getElementMultiplier('fire', this.boss.element);
      const dotMult = 1 + stats.dotBonus + (condDotActive ? (stats.condDotStackBonus! * this.boss.burnStacks) : 0);
      const dmg = Math.round(stats.atk * 0.032 * this.boss.burnStacks * dotMult * elemMult);
      const burnHpBefore = this.boss.currentHp;
      this.boss.takeDamage(dmg, stats.penetration);
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, false, elemMult);
      this.refreshBossBar();
      if (NetworkService.connected) NetworkService.sendBossHit(burnHpBefore - this.boss.currentHp);
    }
  }

  private tickAura(): void {
    if (this.gameOver) return;
    if ((SkillTreeStore.getAttackMode()) !== 'aura') return;

    // 每 3 tick 為一個週期，週期開始時重置觸發旗標
    this._auraTick++;
    if (this._auraTick >= 3) {
      this._auraTick = 0;
      this._auraCycleSanguineDone     = false;
      this._auraCycleBloodlustDone    = false;
      this._auraCycleKnifeDone        = false;
      this._auraCycleLightningDone    = false;
      this._auraCycleDivineShieldDone = false;
      this._auraCycleSummonDone       = false;
    }

    const stats = CardStore.getTotalStats();
    const RANGE = this.AURA_RANGE * (1 + (stats.auraRadiusPct ?? 0));
    const baseDmg = this.player.maxHpValue * 0.125 * (1 + (stats.auraDmgPct ?? 0));
    const px = this.player.x, py = this.player.y;

    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (Phaser.Math.Distance.Between(px, py, m.x, m.y) > RANGE) continue;
      const isCrit = Math.random() < stats.crit;
      const dmg = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1));
      const overkill = m.takeDamage(dmg);
      if (stats.lifesteal > 0) {
        const leech = Math.round(dmg * stats.lifesteal);
        if (stats.lifestealInstant) this.player.heal(leech); else this._leechPool += leech;
      }
      this.spawnDamageNumber(m.x, m.y, dmg, isCrit, 1);
      if (isCrit) this._pendingHitWeight += 2;
      if (NetworkService.connected) NetworkService.sendMinionHit(m.minionId, dmg);
      // 嗜血/暴徒（每週期各只觸發一次）
      if ((stats.sanguine ?? 0) >= 1 && !this._auraCycleSanguineDone) {
        this._auraCycleSanguineDone = true;
        this.addSanguineStack(Math.round(stats.sanguineMaxStacks ?? 5));
      }
      if ((stats.bloodlust ?? 0) >= 1 && isCrit && !this._auraCycleBloodlustDone) {
        this._auraCycleBloodlustDone = true;
        this.addBloodlustStack(Math.round(stats.bloodlustMaxStacks ?? 5));
      }
      // 攻擊觸發散射飛刀（每週期最多一次）
      const onHitKnife = stats.onHitKnifeChance ?? 0;
      if (onHitKnife > 0 && !this._auraCycleKnifeDone && Math.random() < onHitKnife) {
        this._auraCycleKnifeDone = true;
        this.firePeriodicKnives();
      }
      // 攻擊觸發落雷（每週期最多一次）
      const onHitLightning = stats.onHitLightningChance ?? 0;
      if (onHitLightning > 0 && !this._auraCycleLightningDone && Math.random() < onHitLightning) {
        this._auraCycleLightningDone = true;
        if ((stats.lightningStrike ?? 0) >= 1) this.fireLightningStrike();
        else this.fireOnHitLightning(stats);
      }
      // 神盾護體（每週期最多一次）
      const shieldChance = stats.divineShieldChance ?? 0;
      if (shieldChance > 0 && !this._auraCycleDivineShieldDone && Math.random() < shieldChance) {
        this._auraCycleDivineShieldDone = true;
        this.triggerDivineShield();
      }
      // 召喚友軍花怪（每週期最多一次）
      const summonChance = (stats.summonFlowerChance ?? 0) + (stats.skillFlowerChance ?? 0);
      if (summonChance > 0 && !this._auraCycleSummonDone && Math.random() < summonChance) {
        this._auraCycleSummonDone = true;
        this.trySummonAllyFlower();
      }
      // 擊殺類詞墜（每個擊殺都觸發，不受週期限制）
      if (m.isDead) {
        if ((stats.overkillSplash ?? 0) > 0 && overkill > 0) this.overkillSplash(m.x, m.y, overkill);
        if ((stats.soulHarvest ?? 0) >= 1) this._soulHarvestProc(m.x, m.y);
        if ((stats.onKillHeal ?? 0) > 0) this.player.heal(Math.round(stats.onKillHeal!));
        if ((stats.killShieldPerKill ?? 0) > 0) this.player.addKillShield(Math.round(stats.killShieldPerKill!));
      }
    }
    if (this.bossActive && this.boss.active &&
      Phaser.Math.Distance.Between(px, py, this.boss.x, this.boss.y) <= RANGE) {
      const isCrit = Math.random() < stats.crit;
      const elemMult = getElementMultiplier('none', this.boss.element);
      const dmg = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1) * elemMult);
      const auraHpBefore = this.boss.currentHp;
      this.boss.takeDamage(dmg, stats.penetration);
      if (stats.lifesteal > 0) {
        const leech = Math.round(dmg * stats.lifesteal);
        if (stats.lifestealInstant) this.player.heal(leech); else this._leechPool += leech;
      }
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, isCrit, elemMult);
      if (isCrit) this._pendingHitWeight += 2;
      if (NetworkService.connected) NetworkService.sendBossHit(auraHpBefore - this.boss.currentHp);
    }
    if (this._pendingHitWeight > 0 && !this._hitShakePending) {
      this._hitShakePending = true;
      this.time.delayedCall(0, () => {
        this.triggerHitShake(this._pendingHitWeight);
        this._pendingHitWeight = 0;
        this._hitShakePending = false;
      });
    }
  }

  // ── 蓄力重擊 chargeSlam ───────────────────────────────────

  private attackChargeSlam(_tx: number, _ty: number): void {
    const slamStats   = CardStore.getTotalStats();
    const spd         = 1 + this.getEffectiveAtkSpeed();
    const isMultiShot = (slamStats.chargeSlamOverload ?? 0) >= 1;
    const isGiant     = (slamStats.meteorGiant ?? 0) >= 1;
    const hasCharge   = isGiant;
    const baseMs      = Math.round(650 / spd);
    const chargeMs    = hasCharge ? Math.round(baseMs * 0.54) : 0;
    const cd          = baseMs + chargeMs;
    if (!this.player.lockCooldown(cd)) return;

    const METEOR_RANGE = P(200);
    const { dir, tx: fallbackX, ty: fallbackY } = this.resolveAttackDir(METEOR_RANGE);

    const fire = () => {
      // 找最近的敵人；無敵人時打面向最遠處
      let tgtX = fallbackX, tgtY = fallbackY;
      let minDist = Infinity;
      for (const t of this.getHittableTargets()) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y);
        if (d <= METEOR_RANGE && d < minDist) { minDist = d; tgtX = t.x; tgtY = t.y; }
      }

      this.player.startAttackAnim(`player_attack_${dir}`);
      this.time.delayedCall(50, () => this.playSfx('sfx_swing4'));

      const dmgMult    = 0.80 * (1 + (slamStats.chargeSlamDmgPct ?? 0)) * (isGiant ? 1.35 : 1.0);
      const stunChance = slamStats.chargeSlamStunChance ?? 0;
      const tx = tgtX, ty = tgtY;

      this.time.delayedCall(150, () => {
        this.playerMeteorAt(tx, ty, dmgMult, isGiant, stunChance);
        if (isMultiShot && !isGiant) {
          // 找主落點附近最近的怪，最多3顆，各自瞄準
          const nearby = this.getHittableTargets()
            .map(t => ({ t, d: Phaser.Math.Distance.Between(tx, ty, t.x, t.y) }))
            .filter(e => e.d > 1 && e.d <= P(130))
            .sort((a, b) => b.d - a.d)
            .slice(0, 3);
          nearby.forEach(({ t }, i) => {
            const ex = t.x, ey = t.y;
            this.time.delayedCall((i + 1) * 120, () => {
              this.playerMeteorAt(ex, ey, dmgMult, false, stunChance);
            });
          });
        }
      });
    };

    if (hasCharge) {
      // 節點3+ 才有蓄力：緩速 + 綠色充能特效
      this.player.speedMult = 0.6;
      this.player.noInterrupt = true;
      const chargeGfx = this.add.graphics().setDepth(this.player.depth + 1);
      let chargeT = 0;
      const updateCharge = () => {
        if (!chargeGfx.active) return;
        chargeT += 16;
        const prog = Math.min(chargeT / chargeMs, 1);
        chargeGfx.clear();
        const outerR = P(8) + prog * P(isGiant ? 44 : 36);
        chargeGfx.lineStyle(P(3), 0x00cc44, 0.25 + prog * 0.35);
        chargeGfx.strokeCircle(this.player.x, this.player.y, outerR);
        const pulse = Math.sin(chargeT / 80) * P(3);
        chargeGfx.lineStyle(P(2), 0x44ff88, 0.5 + prog * 0.4);
        chargeGfx.strokeCircle(this.player.x, this.player.y, P(10) + pulse + prog * P(isGiant ? 22 : 18));
        chargeGfx.fillStyle(0xaaffcc, 0.6 + prog * 0.4);
        chargeGfx.fillCircle(this.player.x, this.player.y, P(3) + prog * P(3));
      };
      const chargeTicker = this.time.addEvent({ delay: 16, repeat: Math.ceil(chargeMs / 16), callback: updateCharge });
      this.time.delayedCall(chargeMs, () => {
        this.player.speedMult = 1;
        this.player.noInterrupt = false;
        chargeTicker.destroy();
        chargeGfx.destroy();
        fire();
      });
    } else {
      fire();
    }
  }

  private playerMeteorAt(wtx: number, wty: number, dmgMult: number, isGiant: boolean, stunChance: number, rOverride?: number): void {
    const R       = rOverride ?? P(isGiant ? 55 : 30);
    const fallMs  = 520;
    const startY  = wty - P(130);
    const hitR    = R * 1.1;

    // 地板綠圈提示（落點預警）
    const indicator = this.add.graphics({ x: wtx, y: wty }).setDepth(16);
    let indT = 0;
    const indEvt = this.time.addEvent({
      delay: 40, repeat: Math.ceil(fallMs / 40),
      callback: () => {
        if (!indicator.active) return;
        indT += 40;
        indicator.clear();
        const alpha = 0.35 + Math.sin(indT / 70) * 0.25;
        indicator.lineStyle(P(2), 0x44ff88, alpha);
        indicator.strokeCircle(0, 0, hitR);
        indicator.fillStyle(0x00ff44, 0.06);
        indicator.fillCircle(0, 0, hitR);
      },
    });

    const shadow = this.add.graphics({ x: wtx, y: wty }).setDepth(48);

    // 隕石主體（綠色）
    const meteor = this.add.graphics({ x: wtx, y: startY }).setDepth(61);
    meteor.fillStyle(0x33bb55, 0.95);
    meteor.fillCircle(0, 0, R);
    meteor.fillStyle(0x001100, 0.50);
    meteor.fillCircle(R * 0.22, R * 0.18, R * 0.52);
    meteor.lineStyle(P(3.5), 0x66ff88, 0.90);
    meteor.strokeCircle(0, 0, R);
    meteor.lineStyle(P(1.5), 0xaaffcc, 0.50);
    meteor.strokeCircle(0, 0, R * 0.55);
    meteor.setScale(0.3);

    // 墜落火焰軌跡（綠色）
    const fireEvt = this.time.addEvent({
      delay: 80, repeat: Math.floor(fallMs / 80),
      callback: () => {
        if (!meteor.active) return;
        const s      = meteor.scaleX;
        const streak = this.add.graphics({ x: meteor.x, y: meteor.y }).setDepth(60);
        const sLen   = P(30) * s;
        for (let j = 0; j < 3; j++) {
          const a = -Math.PI / 2 + (j - 1) * 0.22 + (Math.random() - 0.5) * 0.12;
          streak.lineStyle(P(2.5 - j * 0.5), j === 0 ? 0x44ff66 : 0x22cc44, 0.65 - j * 0.12);
          streak.beginPath(); streak.moveTo(0, 0);
          streak.lineTo(Math.cos(a) * sLen, Math.sin(a) * sLen); streak.strokePath();
        }
        this.tweens.add({ targets: streak, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => streak.destroy() });
      },
    });

    this.tweens.add({
      targets: meteor, y: wty, scaleX: 1, scaleY: 1,
      duration: fallMs, ease: 'Quad.In',
      onUpdate: () => {
        const t = Math.max(0, (meteor.y - startY) / (wty - startY));
        shadow.clear();
        shadow.fillStyle(0x003300, 0.38 * t);
        shadow.fillEllipse(0, 0, R * 2.4 * t, R * 0.75 * t);
      },
      onComplete: () => {
        fireEvt.destroy();
        indEvt.destroy();
        indicator.destroy();
        meteor.destroy();
        shadow.destroy();

        // ① 焦痕坑洞
        const crater = this.add.graphics({ x: wtx, y: wty }).setDepth(15);
        crater.fillStyle(0x001a00, 0.80); crater.fillCircle(0, 0, R * 1.05);
        crater.fillStyle(0x003300, 0.45); crater.fillCircle(0, 0, R * 1.25);
        crater.lineStyle(P(1.5), 0x226622, 0.55); crater.strokeCircle(0, 0, R * 1.05);
        this.tweens.add({ targets: crater, alpha: 0, duration: 1600, delay: 300, ease: 'Quad.In', onComplete: () => crater.destroy() });

        // ② 中心閃光
        const core = this.add.graphics({ x: wtx, y: wty }).setDepth(65);
        core.fillStyle(0xffffff, 1); core.fillCircle(0, 0, R * 0.6);
        core.fillStyle(0x66ffaa, 0.9); core.fillCircle(0, 0, R * 0.35);
        this.tweens.add({ targets: core, alpha: 0, scaleX: 0.08, scaleY: 0.08, duration: 160, ease: 'Quad.In', onComplete: () => core.destroy() });

        // ③ 衝擊波環
        const shock = this.add.graphics({ x: wtx, y: wty }).setDepth(64);
        shock.lineStyle(P(3), 0x88ffaa, 1); shock.strokeCircle(0, 0, R * 0.75);
        this.tweens.add({ targets: shock, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => shock.destroy() });

        // ④ 光暈環
        const halo = this.add.graphics({ x: wtx, y: wty }).setDepth(63);
        halo.lineStyle(P(7), 0x33dd66, 0.70); halo.strokeCircle(0, 0, R * 0.55);
        this.tweens.add({ targets: halo, scaleX: 2.1, scaleY: 2.1, alpha: 0, duration: 480, ease: 'Quad.Out', onComplete: () => halo.destroy() });

        // ⑤ 岩石碎片
        for (let i = 0; i < 8; i++) {
          const a     = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
          const tDist = P(Phaser.Math.Between(18, 40));
          const piece = this.add.graphics({ x: wtx, y: wty }).setDepth(62);
          const pr    = P(Phaser.Math.Between(3, 6));
          const col   = [0x115522, 0x226633, 0x114422, 0x337744][i % 4];
          piece.fillStyle(col, 0.92);
          piece.fillEllipse(0, 0, pr * 2.2, pr);
          piece.lineStyle(P(0.8), 0x88ffaa, 0.55);
          piece.strokeEllipse(0, 0, pr * 2.2, pr);
          this.tweens.add({
            targets: piece,
            x: wtx + Math.cos(a) * tDist, y: wty + Math.sin(a) * tDist,
            rotation: Phaser.Math.FloatBetween(Math.PI, Math.PI * 3),
            alpha: 0, duration: Phaser.Math.Between(300, 480), ease: 'Quad.Out',
            onComplete: () => piece.destroy(),
          });
        }

        // ⑥ 粉塵
        for (let i = 0; i < 12; i++) {
          const a    = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
          const r0   = R * 0.45;
          const r1   = P(Phaser.Math.Between(20, 48));
          const dust = this.add.graphics({ x: wtx + Math.cos(a) * r0, y: wty + Math.sin(a) * r0 }).setDepth(62);
          dust.fillStyle(0x44cc66, Phaser.Math.FloatBetween(0.45, 0.70));
          dust.fillCircle(0, 0, P(Phaser.Math.Between(2, 4)));
          this.tweens.add({
            targets: dust,
            x: wtx + Math.cos(a) * r1, y: wty + Math.sin(a) * r1,
            alpha: 0, duration: Phaser.Math.Between(380, 620), ease: 'Quad.Out',
            onComplete: () => dust.destroy(),
          });
        }

        // 傷害
        this.hitInArea(wtx, wty, hitR, dmgMult, 360, 0, 'down');
        // 緩速（節點1-7，60% 速度）；巨型隕石對 Boss 也有效
        if (stunChance > 0) {
          for (const t of this.getHittableTargets()) {
            if (Phaser.Math.Distance.Between(wtx, wty, t.x, t.y) <= hitR) {
              const m = t as any;
              if (t instanceof Boss && isGiant) {
                t.slowMult = 0.4;
                this.time.delayedCall(1500, () => { if (t.active) t.slowMult = 1; });
              } else if (typeof m.slowMult === 'number' && !(t instanceof Boss)) {
                m.slowMult = 0.4;
                this.time.delayedCall(3000, () => { if (m.active) m.slowMult = 1; });
              }
            }
          }
        }
      },
    });
  }

  // ── Map / Monster Setup ───────────────────────────────

  protected handleMinionDrop(monsterId: string, x: number, y: number): void {
    const def = getMonsterDef(monsterId);
    if (!def) return;
    const isElite = def.tier >= 3 && def.tier < 5;
    DailyQuestStore.addProgress(isElite ? 'kill_elite' : 'kill_normal', 1, monsterId);

    if (this._isTutorial) {
      const pending: (() => void)[] = [
        ...(!TutorialStore.isDone('equip') ? [() => this.spawnEquipDrop(x, y, generateEquipment('sword', 'normal'))] : []),
        ...(!TutorialStore.isDone('card') ? [() => this.spawnCardDrop(x, y, 'card_slime_green_n')] : []),
        ...(!TutorialStore.isDone('potion') ? [() => this.spawnLoot(x, y, [{ itemId: ITEM_POTION_HEALTH_S, itemName: tr('item.potion_health_s'), rate: 1, qtyMin: 1, qtyMax: 1 }])] : []),
        ...(!TutorialStore.isDone('brokenStone') ? [() => this.spawnLoot(x, y, [{ itemId: ITEM_STONE_BROKEN, itemName: tr('item.stone_broken'), rate: 1, qtyMin: 1, qtyMax: 1 }])] : []),
      ];
      pending[this._tutorialDropIdx++]?.();
      const expMult = STAR_EXP_MULT[this.questStar] ?? 1;
      const gained = PlayerStore.addExp(Math.round(def.exp * expMult));
      if (gained > 0) this.showLevelUp(PlayerStore.getLevel());
      return;
    }

    this.spawnLoot(x, y, def.drops);
    if (this.questStar >= 4) {
      const btRate = isElite
        ? (this.questStar >= 5 ? 0.04 : 0.02)
        : (this.questStar >= 5 ? 0.02 : 0.01);
      if (Math.random() < btRate) {
        this.spawnLoot(x, y, [{ itemId: ITEM_STONE_BREAKTHROUGH, itemName: tr('item.stone_breakthrough'), rate: 1, qtyMin: 1, qtyMax: 1 }]);
      }
    }
    const _pStats = CardStore.getTotalStats();
    const dropBonus = 1 + (_pStats.dropRatePct ?? 0);
    const rarityBonusVal = _pStats.rarityBonus ?? 0;
    for (const card of def.cards) {
      if (Math.random() < card.rate * dropBonus) this.spawnCardDrop(x, y, card.cardId);
    }
    const IQ = Math.pow(1.50, this.questStar - 1);
    const monType: MonsterType = isElite ? 'elite' : 'small';
    const qualW = getDropQualityWeights(monType, this.questStar);
    let dropCount = 0;
    if (Math.random() < Math.min(1, (isElite ? 0.33 : 0.05) * IQ * dropBonus)) dropCount++;
    if (isElite && Math.random() < Math.min(1, 0.083 * IQ * dropBonus)) dropCount++;
    for (let i = 0; i < dropCount; i++) {
      const slot = EQUIP_ALL_SLOTS[Math.floor(Math.random() * EQUIP_ALL_SLOTS.length)];
      this.spawnEquipDrop(x, y, generateEquipment(slot, randomQuality(qualW, rarityBonusVal)));
    }
    const expMult = STAR_EXP_MULT[this.questStar] ?? 1;
    const gained = PlayerStore.addExp(Math.round(def.exp * expMult));
    if (gained > 0) this.showLevelUp(PlayerStore.getLevel());
  }

  private generateWaypoints(): void {
    // In co-op: use server-generated params so both players get identical maps.
    // In solo:  fall back to local SeededRNG.
    const mp = this._mapParams;
    const rng = new SeededRNG(this._mapSeed);

    const PAD = P(500);
    let cx = 0, cy = 0;
    let dir = mp ? mp.angle0 : rng.float(0, Math.PI * 2);
    const count = mp ? mp.segments.length : rng.between(4, 8);
    const raw: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(cx, cy)];

    for (let i = 0; i < count; i++) {
      if (mp) {
        dir += mp.segments[i].angleDelta;
        const dist = Math.round(P(600) + mp.segments[i].distRatio * P(200));
        cx += Math.cos(dir) * dist;
        cy += Math.sin(dir) * dist;
      } else {
        dir += rng.float(-Math.PI * 0.5, Math.PI * 0.5);
        cx += Math.cos(dir) * rng.between(P(600), P(800));
        cy += Math.sin(dir) * rng.between(P(600), P(800));
      }
      raw.push(new Phaser.Math.Vector2(cx, cy));
    }

    const xs = raw.map(p => p.x), ys = raw.map(p => p.y);
    const offX = Math.min(...xs) - PAD, offY = Math.min(...ys) - PAD;
    this.waypoints = raw.map(p => new Phaser.Math.Vector2(p.x - offX, p.y - offY));
    this.worldW = Math.round(Math.max(...xs) - Math.min(...xs) + PAD * 2);
    this.worldH = Math.round(Math.max(...ys) - Math.min(...ys) + PAD * 2);
    const ar = this.BOSS_ARENA_RADIUS;
    const baseH = this.worldH;
    this.worldW += ar * 2 + P(700);
    this.worldH = Math.max(baseH, ar * 2 + P(600));
    this.bossArenaCenter.set(this.worldW - ar - P(200), this.worldH / 2);
    this.bossArenaShape = mp ? mp.bossArenaShape : rng.between(0, 3);

    const questBossId = QuestStore.getAcceptedQuest()?.bossId;
    const BOSS_POOL = [
      'boss_flower_one', 'boss_flower_two', 'boss_flower_three',
      'boss_slime_green', 'boss_slime_red', 'boss_slime_blue', 'boss_slime_white',
      'boss_zombie_slime', 'boss_lava_slime',
    ];
    this.bossMonsterId = this._initBossId ?? questBossId ?? BOSS_POOL[rng.between(0, BOSS_POOL.length - 1)];
    this.questStar = this._initQuestStar ?? QuestStore.getAcceptedQuest()?.star ?? 1;
  }

  private generateAndDrawMap(): void {
    // 牆體用暗石頭色填滿世界，讓整塊牆都有顏色而非純黑洞
    const BG = 0x0d0d1a;
    this.cameras.main.setBackgroundColor(BG);
    const wallTexKey: Partial<Record<GameScene['_mapTheme'], string>> = {
      grassland: 'grassland_wall', desert: 'desert_wall', snow: 'snow_wall',
      lava: 'lava_wall', forest: 'forest_wall', dungeon: 'dungeon_wall',
    };
    const wallTex = wallTexKey[this._mapTheme];
    if (wallTex) {
      this.add.tileSprite(0, 0, this.worldW, this.worldH, wallTex).setOrigin(0, 0).setDepth(-1);
    } else {
      this.add.rectangle(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, BG).setDepth(-1);
    }

    this.buildCorridorSegs();

    const hw = this.CORR_HW;
    const rw = hw * 2.2; // room half-size at waypoints/corners

    // Helper: fill all walkable rects onto a graphics object
    const fillAll = (g: Phaser.GameObjects.Graphics) => {
      for (const s of this.corridorSegs) {
        if (Math.abs(s.y1 - s.y2) < 1) { // horizontal
          g.fillRect(Math.min(s.x1, s.x2) - hw, s.y1 - hw, Math.abs(s.x2 - s.x1) + hw * 2, hw * 2);
        } else {                           // vertical
          g.fillRect(s.x1 - hw, Math.min(s.y1, s.y2) - hw, hw * 2, Math.abs(s.y2 - s.y1) + hw * 2);
        }
      }
      for (const c of this.cornerPts)
        g.fillRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
      for (const rects of this.waypointRooms)
        for (const r of rects) g.fillRect(r.x, r.y, r.w, r.h);
    };

    // Helper: stroke all walkable rects
    const strokeAll = (g: Phaser.GameObjects.Graphics) => {
      for (const s of this.corridorSegs) {
        if (Math.abs(s.y1 - s.y2) < 1) {
          g.strokeRect(Math.min(s.x1, s.x2) - hw, s.y1 - hw, Math.abs(s.x2 - s.x1) + hw * 2, hw * 2);
        } else {
          g.strokeRect(s.x1 - hw, Math.min(s.y1, s.y2) - hw, hw * 2, Math.abs(s.y2 - s.y1) + hw * 2);
        }
      }
      for (const c of this.cornerPts)
        g.strokeRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
      for (const rects of this.waypointRooms)
        for (const r of rects) g.strokeRect(r.x, r.y, r.w, r.h);
    };

    // ── Build shared mask ────────────────────────────────
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    fillAll(maskGfx);
    const sharedMask = maskGfx.createGeometryMask();


    // ── Layer 0: base floor (masked to corridor) ─────────
    const floorSrcKey = { grassland: 'grass', desert: 'desert_floor', snow: 'snow_floor', lava: 'lava_floor', forest: 'forest_floor', dungeon: 'dungeon_floor' }[this._mapTheme];
    const floorTileKey = `${floorSrcKey}_tile`;
    {
      const SZ = P(64);
      if (!this.textures.exists(floorTileKey)) {
        const canvas = document.createElement('canvas');
        canvas.width = SZ; canvas.height = SZ;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage((this.textures.get(floorSrcKey).source[0] as any).image, 0, 0, SZ, SZ);
        this.textures.addCanvas(floorTileKey, canvas);
      }
      const gcols = Math.ceil(this.worldW / SZ) + 1, grows = Math.ceil(this.worldH / SZ) + 1;
      const gMap = this.make.tilemap({ tileWidth: SZ, tileHeight: SZ, width: gcols, height: grows });
      const gLayer = gMap.createBlankLayer('floor_bg', gMap.addTilesetImage(floorTileKey, floorTileKey, SZ, SZ, 0, 0)!, 0, 0)!;
      gMap.fill(0, 0, 0, gcols, grows, false, 'floor_bg');
      gLayer.setDepth(0).setMask(sharedMask);
    }

    // walls handled by buildWallTilemap() after generateAndDrawMap()
    this.placeInteriorDeco();
    this.buildDungeon3DWalls();
    this.drawBossArena();
  }

  private buildCorridorSegs(): void {
    this.corridorSegs = [];
    this.cornerPts = [];
    this.waypointRooms = [];
    const crng = new SeededRNG(this._mapSeed + 3333);
    const srng = new SeededRNG(this._mapSeed + 7777);
    const SHAPE_COUNT = 10;

    this.waypointRooms = this.waypoints.map((wp, i) => {
      // First and last waypoints stay as simple squares (spawn / boss-transition)
      const type = (i === 0 || i === this.waypoints.length - 1) ? 0 : srng.between(0, SHAPE_COUNT - 1);
      return this._makeWaypointRects(wp.x, wp.y, type);
    });

    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const p1 = this.waypoints[i];
      const p2 = this.waypoints[i + 1];
      const hFirst = crng.between(0, 1) === 0;
      const cx = hFirst ? p2.x : p1.x;
      const cy = hFirst ? p1.y : p2.y;
      this.cornerPts.push({ x: cx, y: cy });
      this.corridorSegs.push({ x1: p1.x, y1: p1.y, x2: cx, y2: cy });
      this.corridorSegs.push({ x1: cx, y1: cy, x2: p2.x, y2: p2.y });
    }
  }

  // Returns absolute rects for a waypoint's combat-zone shape.
  // All shapes contain the waypoint center so corridors always connect.
  private _makeWaypointRects(cx: number, cy: number, type: number): { x: number; y: number; w: number; h: number }[] {
    const hw = this.CORR_HW;
    const s = hw * 2;                   // corridor/arm width
    const a = Math.round(hw * 2.2);     // arm extension length from center

    // [dx, dy, w, h] offsets from (cx, cy)
    const SHAPES: [number, number, number, number][][] = [
      // 0: Square (classic)
      [[-hw * 2, -hw * 2, s * 2, s * 2]],
      // 1: L └  (arm up, arm right)
      [[-hw, -(a + hw), s, a + s], [-hw, -hw, a + s, s]],
      // 2: L ┘  (arm up, arm left)
      [[-hw, -(a + hw), s, a + s], [-(a + hw), -hw, a + s, s]],
      // 3: L ┌  (arm down, arm right)
      [[-hw, -hw, s, a + s], [-hw, -hw, a + s, s]],
      // 4: L ┐  (arm down, arm left)
      [[-hw, -hw, s, a + s], [-(a + hw), -hw, a + s, s]],
      // 5: Horizontal passage ─
      [[-(a + hw), -hw, (a + hw) * 2, s]],
      // 6: Vertical passage │
      [[-hw, -(a + hw), s, (a + hw) * 2]],
      // 7: T ⊤  (horizontal bar + stem down)
      [[-(a + hw), -hw, (a + hw) * 2, s], [-hw, -hw, s, a + s]],
      // 8: T ⊥  (horizontal bar + stem up)
      [[-(a + hw), -hw, (a + hw) * 2, s], [-hw, -(a + hw), s, a + s]],
      // 9: ∩  (wide bar at center + two legs extending down)
      [[-(a + hw), -hw, (a + hw) * 2, s], [-(a + hw), -hw, s, a + s], [a - hw, -hw, s, a + s]],
    ];

    const idx = Math.max(0, Math.min(type, SHAPES.length - 1));
    return SHAPES[idx].map(([dx, dy, w, h]) => ({ x: cx + dx, y: cy + dy, w, h }));
  }

  private isInOpenArea(px: number, py: number): boolean {
    const hw = this.CORR_HW;
    const rw = hw * 2.2;
    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1) {
        if (Math.abs(py - s.y1) <= hw && px >= Math.min(s.x1, s.x2) - hw && px <= Math.max(s.x1, s.x2) + hw) return true;
      } else {
        if (Math.abs(px - s.x1) <= hw && py >= Math.min(s.y1, s.y2) - hw && py <= Math.max(s.y1, s.y2) + hw) return true;
      }
    }
    for (const c of this.cornerPts)
      if (Math.abs(px - c.x) <= rw && Math.abs(py - c.y) <= rw) return true;
    for (const rects of this.waypointRooms)
      for (const r of rects)
        if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return true;
    if (this.isInBossArena(px, py)) return true;
    return false;
  }

  private buildWallTilemap(): Phaser.Tilemaps.TilemapLayer {
    const TILE = P(16);
    const cols = Math.ceil(this.worldW / TILE) + 1;
    const rows = Math.ceil(this.worldH / TILE) + 1;

    // Blank 1×1 white texture used as the tile image
    if (!this.textures.exists('wall_tile')) {
      const wg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      wg.fillStyle(0xffffff, 1); wg.fillRect(0, 0, TILE, TILE);
      wg.generateTexture('wall_tile', TILE, TILE);
      wg.destroy();
    }

    const map = this.make.tilemap({ tileWidth: TILE, tileHeight: TILE, width: cols, height: rows });
    const tileset = map.addTilesetImage('wall_tile', 'wall_tile', TILE, TILE, 0, 0)!;
    const layer = map.createBlankLayer('walls', tileset, 0, 0)!;

    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const cx = col * TILE + TILE / 2, cy = row * TILE + TILE / 2;
        // Boss arena boundary is handled by snap-back in update() — skip it here
        // to avoid the staircase jagging from square tiles on a curved boundary.
        if (this.isInBossArena(cx, cy, TILE * 2)) continue; // buffer: snap-back handles exact boundary
        if (!this.isInOpenArea(cx, cy))
          map.putTileAt(0, col, row, false, 'walls');
      }
    }

    layer.setCollisionBetween(0, 0);
    layer.setVisible(false);
    return layer;
  }

  /**
   * 在每一段走廊/房間的「北邊界」繪製假立體牆面。
   *
   * 掃描線邏輯：對每條候選北邊界沿 X 逐步採樣，
   *   只在「上方是牆、下方是地板」的位置才計入面段，
   *   避免 corner/room 重疊區域出現錯誤牆面。
   *
   * 偏移修正：用前後兩個採樣點的中點作為段起終位置，
   *   消除「左凹右凸」的系統性偏移。
   *
   * 立體結構：
   *   牆頂面 (depth -0.5)  — 插在背景(-1)和地板(0)之間，只在牆面區域可見
   *   牆正面 (depth northY) — Y-sort 決定是否遮擋玩家
   */
  private buildDungeon3DWalls(): void {
    const WALL_TOP_H = P(20);   // 牆頂面高度（往上延伸）
    const SCAN = P(8);    // 掃描步距
    const hw = this.CORR_HW;
    const rw = Math.round(hw * 2.2);

    // ── 候選北邊界 ────────────────────────────────────────────
    const candidates: { xLeft: number; northY: number; width: number }[] = [];

    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1) {
        candidates.push({ xLeft: Math.min(s.x1, s.x2) - hw, northY: s.y1 - hw, width: Math.abs(s.x2 - s.x1) + hw * 2 });
      } else {
        candidates.push({ xLeft: s.x1 - hw, northY: Math.min(s.y1, s.y2) - hw, width: hw * 2 });
      }
    }
    for (const c of this.cornerPts)
      candidates.push({ xLeft: c.x - rw, northY: c.y - rw, width: rw * 2 });
    for (const rects of this.waypointRooms)
      for (const r of rects)
        candidates.push({ xLeft: r.x, northY: r.y, width: r.w });

    // ── 繪製：牆頂面 ─────────────────────────────────────────
    // depth -0.5：插在背景(-1)和地板(0)之間
    // 地板(depth 0)有 sharedMask，會蓋住 topG 在地板區的部分，所以直接畫全段即可
    const wallTopColors: Record<string, [number, number, number]> = {
      grassland: [0x3a2e1e, 0x4a3a28, 0x524432],
      desert: [0x5a4220, 0x6a5030, 0x7a5e38],
      snow: [0x2a3a4a, 0x3a4e62, 0x445870],
      lava: [0x4a1810, 0x6a2418, 0x7a2e20],
      forest: [0x2a1e10, 0x3a2a18, 0x443220],
      dungeon: [0x2a2a3e, 0x34344e, 0x3d3d5a],
    };
    const [wc0, wc1, wc2] = wallTopColors[this._mapTheme];
    const topG = this.add.graphics().setDepth(-0.5);

    const CORNER_R = P(6); // rounded corner radius on the top (away from floor)

    for (const { xLeft, northY, width } of candidates) {
      if (width < P(4)) continue;
      const r = Math.min(CORNER_R, width / 2, WALL_TOP_H / 2);
      // Main wall body — round top corners only, bottom stays flush with floor edge
      topG.fillStyle(wc0, 1);
      topG.fillRoundedRect(xLeft, northY - WALL_TOP_H, width, WALL_TOP_H, { tl: r, tr: r, bl: 0, br: 0 });
      // Bright edge strip at floor boundary — stays flat
      topG.fillStyle(wc1, 1);
      topG.fillRect(xLeft, northY - P(3), width, P(3));
      // Horizontal texture lines (clipped to avoid the rounded top caps)
      topG.lineStyle(P(1), wc2, 0.45);
      for (let ly = northY - WALL_TOP_H + P(5); ly < northY - P(4); ly += P(5))
        topG.lineBetween(xLeft + r * 0.4, ly, xLeft + width - r * 0.4, ly);
    }

    // ── 西邊界陰影（往東漸層）────────────────────────────────
    // 在每個走廊/房間左側邊界往右畫半透明漸層，模擬西牆投影到地板
    const westCandidates: { westX: number; yTop: number; height: number }[] = [];

    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) >= 1) {
        // 垂直走廊：左側邊界
        westCandidates.push({ westX: s.x1 - hw, yTop: Math.min(s.y1, s.y2) - hw, height: Math.abs(s.y2 - s.y1) + hw * 2 });
      } else {
        // 水平走廊：左端
        westCandidates.push({ westX: Math.min(s.x1, s.x2) - hw, yTop: s.y1 - hw, height: hw * 2 });
      }
    }
    for (const c of this.cornerPts)
      westCandidates.push({ westX: c.x - rw, yTop: c.y - rw, height: rw * 2 });
    for (const rects of this.waypointRooms)
      for (const r of rects)
        westCandidates.push({ westX: r.x, yTop: r.y, height: r.h });

    // 沿 Y 軸掃描：找出真實西邊界子段（左方是牆、右方是地板）
    const byX = new Map<number, { y0: number; y1: number }[]>();

    for (const { westX, yTop, height } of westCandidates) {
      let segStart = -1;
      let prevEdge = false;

      for (let oy = 0; oy <= height + SCAN; oy += SCAN) {
        const inRange = oy <= height;
        const sy = yTop + (inRange ? oy : height);
        const isEdge = inRange
          && !this.isInOpenArea(westX - P(10), sy)
          && this.isInOpenArea(westX + P(10), sy);

        if (isEdge && !prevEdge) { segStart = sy; }
        else if (!isEdge && prevEdge && segStart >= 0) {
          // 延伸一個 SCAN 補轉角缺口，mask 會裁掉超出地板的部分
          const y1 = sy;
          if (y1 - segStart >= P(4)) {
            if (!byX.has(westX)) byX.set(westX, []);
            byX.get(westX)!.push({ y0: segStart - SCAN, y1 });
          }
          segStart = -1;
        }
        prevEdge = isEdge;
      }
      if (segStart >= 0) {
        const y1 = yTop + height + SCAN;
        if (y1 - segStart >= P(4)) {
          if (!byX.has(westX)) byX.set(westX, []);
          byX.get(westX)!.push({ y0: segStart - SCAN, y1 });
        }
      }
    }

    // geometry mask：與地板同形，裁掉陰影超出地板範圍的部分
    const shadowMaskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    shadowMaskGfx.fillStyle(0xffffff, 1);
    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1)
        shadowMaskGfx.fillRect(Math.min(s.x1, s.x2) - hw, s.y1 - hw, Math.abs(s.x2 - s.x1) + hw * 2, hw * 2);
      else
        shadowMaskGfx.fillRect(s.x1 - hw, Math.min(s.y1, s.y2) - hw, hw * 2, Math.abs(s.y2 - s.y1) + hw * 2);
    }
    for (const c of this.cornerPts)
      shadowMaskGfx.fillRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
    for (const rects of this.waypointRooms)
      for (const r of rects) shadowMaskGfx.fillRect(r.x, r.y, r.w, r.h);

    // 繪製西側陰影漸層（depth 1）
    const SHADOW_W = P(24);
    const shadowG = this.add.graphics().setDepth(1).setMask(shadowMaskGfx.createGeometryMask());

    for (const [westX, segs] of byX) {
      // 合併重疊 segment，避免同一位置畫兩次造成加深
      segs.sort((a, b) => a.y0 - b.y0);
      const merged: { y0: number; y1: number }[] = [];
      for (const s of segs) {
        if (merged.length && s.y0 <= merged[merged.length - 1].y1)
          merged[merged.length - 1].y1 = Math.max(merged[merged.length - 1].y1, s.y1);
        else
          merged.push({ ...s });
      }
      const TOP_OFFSET = P(20);
      const BOTTOM_OFFSET = P(5);
      for (const { y0, y1 } of merged) {
        if (y1 - y0 < P(4)) continue;
        // 頂部/底部接牆則滿，否則縮進
        const topFull = !this.isInOpenArea(westX + P(10), y0 - P(20));
        const bottomFull = !this.isInOpenArea(westX + P(10), y1 + P(20));
        const drawY0 = topFull ? y0 : y0 + TOP_OFFSET;
        const drawY1 = bottomFull ? y1 : y1 - BOTTOM_OFFSET;
        if (drawY1 - drawY0 < P(4)) continue;
        shadowG.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
        shadowG.fillRect(westX, drawY0, SHADOW_W, drawY1 - drawY0);
      }
    }
  }

  private placeInteriorDeco(): void {
    const STEP = P(180);
    for (let gx = 0; gx < this.worldW; gx += STEP) {
      for (let gy = 0; gy < this.worldH; gy += STEP) {
        if (Phaser.Math.Between(0, 9) < 4) continue;
        const jx = gx + Phaser.Math.Between(-P(60), P(60));
        const jy = gy + Phaser.Math.Between(-P(60), P(60));
        if (!this.isInOpenArea(jx, jy)) continue;
        if (this.waypoints.some(wp => Phaser.Math.Distance.Between(jx, jy, wp.x, wp.y) < P(120))) continue;
        this.spawnThemeDeco(jx, jy);
      }
    }
  }

  private spawnThemeDeco(jx: number, jy: number): void {
    const roll = Phaser.Math.Between(0, 9);
    const D = jy + P(8);

    switch (this._mapTheme) {

      case 'grassland':
        if (roll < 6) {
          this.add.image(jx, jy, 'rock').setScale(Phaser.Math.FloatBetween(0.55, 0.85) * DPR).setDepth(D).setTint(0xbbbbaa);
        } else if (roll < 9) {
          // Grass bushes — each blade breathes at a different phase (wind sway)
          for (let k = 0; k < Phaser.Math.Between(2, 4); k++) {
            const ox = Phaser.Math.Between(-P(14), P(14)), oy = Phaser.Math.Between(-P(8), P(8));
            const bush = this.add.graphics().setDepth(D);
            bush.fillStyle(0x3a7a1a, 0.7); bush.fillEllipse(jx + ox, jy + oy, Phaser.Math.Between(P(10), P(18)), Phaser.Math.Between(P(6), P(10)));
            this.tweens.add({ targets: bush, alpha: { from: 0.45, to: 0.90 }, duration: Phaser.Math.Between(900, 1600), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 220 });
          }
        } else {
          for (let k = 0; k < 3; k++) {
            const ox = Phaser.Math.Between(-P(10), P(10)), oy = Phaser.Math.Between(-P(6), P(6));
            this.add.graphics().setDepth(D).fillStyle(0x555544, 0.6).fillCircle(jx + ox, jy + oy, Phaser.Math.Between(P(2), P(4)));
          }
        }
        break;

      case 'desert':
        if (roll < 5) {
          // Cactus — gentle pulse like heat shimmer
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0x4a8a30, 1); g.fillRect(jx - P(3), jy - P(14), P(6), P(18));
          g.fillRect(jx - P(10), jy - P(8), P(7), P(4));
          g.fillRect(jx + P(3), jy - P(6), P(7), P(4));
          this.tweens.add({ targets: g, alpha: { from: 0.75, to: 1.0 }, duration: Phaser.Math.Between(1800, 2800), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1000) });
        } else if (roll < 8) {
          // Sandy rock
          this.add.image(jx, jy, 'rock').setScale(Phaser.Math.FloatBetween(0.5, 0.8) * DPR).setDepth(D).setTint(0xc8a060);
        } else {
          // Sand ripple — fades in and out like wind-driven ridges
          const g = this.add.graphics().setDepth(D);
          for (let k = 0; k < 3; k++) {
            g.lineStyle(P(1), 0xb08040, 0.45 - k * 0.1);
            g.beginPath(); g.arc(jx, jy + P(k * 5), P(10 + k * 4), Math.PI, 0); g.strokePath();
          }
          this.tweens.add({ targets: g, alpha: { from: 0.15, to: 0.85 }, duration: Phaser.Math.Between(1500, 2500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1200) });
        }
        break;

      case 'snow':
        if (roll < 4) {
          // Ice crystal — shimmer
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0xaad8f8, 0.85);
          for (const [a, l] of [[0, P(10)], [60, P(8)], [120, P(9)], [180, P(10)], [240, P(8)], [300, P(9)]] as number[][]) {
            const rad = Phaser.Math.DegToRad(a);
            g.fillRect(jx + Math.cos(rad) * l - P(1), jy + Math.sin(rad) * l - P(1), P(2), P(2));
            g.lineStyle(P(1), 0xaad8f8, 0.7); g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + Math.cos(rad) * l, jy + Math.sin(rad) * l); g.strokePath();
          }
          this.tweens.add({ targets: g, alpha: { from: 0.4, to: 1.0 }, duration: Phaser.Math.Between(1200, 2200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1200) });
        } else if (roll < 7) {
          // Snowdrift — subtle alpha pulse like snow settling
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0xddeeff, 0.60); g.fillEllipse(jx, jy, P(28), P(10));
          g.fillStyle(0xffffff, 0.40); g.fillEllipse(jx - P(4), jy - P(2), P(16), P(7));
          this.tweens.add({ targets: g, alpha: { from: 0.50, to: 0.90 }, duration: Phaser.Math.Between(2000, 3500), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1500) });
        } else {
          // Frozen rock
          this.add.image(jx, jy, 'rock').setScale(Phaser.Math.FloatBetween(0.5, 0.8) * DPR).setDepth(D).setTint(0x88aace);
        }
        break;

      case 'lava':
        if (roll < 4) {
          // Lava pool glow — pulse alpha
          const g = this.add.graphics().setDepth(D - 2);
          g.fillStyle(0xff4400, 0.25); g.fillEllipse(jx, jy, P(22), P(14));
          g.fillStyle(0xff8800, 0.40); g.fillEllipse(jx, jy, P(14), P(9));
          g.fillStyle(0xffcc44, 0.60); g.fillEllipse(jx, jy, P(6), P(4));
          this.tweens.add({ targets: g, alpha: { from: 0.55, to: 1.0 }, duration: Phaser.Math.Between(800, 1400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 800) });
        } else if (roll < 7) {
          // Volcanic rock chunk
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0x1e1008, 1); g.fillEllipse(jx, jy, Phaser.Math.Between(P(14), P(22)), Phaser.Math.Between(P(10), P(16)));
          g.fillStyle(0xff3300, 0.30); g.fillRect(jx - P(2), jy - P(1), P(4), P(2));
        } else {
          // Ember sparks — float upward and reset
          for (let k = 0; k < 4; k++) {
            const ox = Phaser.Math.Between(-P(12), P(12)), oy = Phaser.Math.Between(-P(8), P(8));
            const sp = this.add.graphics().setDepth(D);
            sp.fillStyle(0xff6600, 0.7); sp.fillCircle(ox, oy, Phaser.Math.Between(P(1), P(2)));
            sp.setPosition(jx, jy);
            this.tweens.add({ targets: sp, y: sp.y - P(14), alpha: 0, duration: Phaser.Math.Between(700, 1300), delay: Phaser.Math.Between(0, 700), repeat: -1, onRepeat: (tw: Phaser.Tweens.Tween) => { const t = tw.targets[0] as Phaser.GameObjects.Graphics; t.y = jy + oy; t.setAlpha(0.7); } });
          }
        }
        break;

      case 'forest':
        if (roll < 4) {
          // Tree stump
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0x5a3810, 1); g.fillEllipse(jx, jy, P(18), P(12));
          g.fillStyle(0x7a5028, 0.6); g.fillEllipse(jx, jy - P(2), P(14), P(8));
          g.lineStyle(P(1), 0x3a2008, 0.5); g.strokeEllipse(jx, jy, P(18), P(12));
        } else if (roll < 7) {
          // Mushroom — gently bobs up/down like it's breathing
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0xddd8c8, 1); g.fillRect(jx - P(2), jy - P(6), P(4), P(8));
          g.fillStyle(0xcc4422, 1); g.fillEllipse(jx, jy - P(8), P(14), P(10));
          g.fillStyle(0xffffff, 0.6);
          for (const [ox, oy] of [[-P(3), -P(7)], [P(2), -P(9)], [-P(1), -P(5)]] as number[][])
            g.fillCircle(jx + ox, jy + oy, P(1.5));
        } else {
          // Moss patch — each blob breathes at different phases (moisture shimmer)
          for (let k = 0; k < Phaser.Math.Between(2, 4); k++) {
            const ox = Phaser.Math.Between(-P(12), P(12)), oy = Phaser.Math.Between(-P(8), P(8));
            const moss = this.add.graphics().setDepth(D);
            moss.fillStyle(0x508828, 0.55); moss.fillEllipse(jx + ox, jy + oy, Phaser.Math.Between(P(8), P(16)), Phaser.Math.Between(P(5), P(9)));
            this.tweens.add({ targets: moss, alpha: { from: 0.30, to: 0.75 }, duration: Phaser.Math.Between(1400, 2400), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: k * 350 });
          }
        }
        break;

      case 'dungeon':
        if (roll < 4) {
          // Skull & bones — eerie dim flicker like candlelight reflection
          const g = this.add.graphics().setDepth(D);
          g.fillStyle(0xd8d8c8, 0.80); g.fillCircle(jx, jy - P(4), P(5));
          g.fillRect(jx - P(6), jy, P(12), P(2));
          g.fillRect(jx - P(4), jy + P(3), P(3), P(5));
          g.fillRect(jx + P(1), jy + P(3), P(3), P(5));
          this.tweens.add({ targets: g, alpha: { from: 0.40, to: 0.90 }, duration: Phaser.Math.Between(350, 700), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 500) });
        } else if (roll < 7) {
          // Cobweb — slowly sways as if in a draft
          const g = this.add.graphics().setDepth(D);
          g.lineStyle(P(1), 0xbbbbcc, 0.45);
          for (let k = 0; k < 4; k++) {
            g.beginPath(); g.moveTo(jx, jy); g.lineTo(jx + Phaser.Math.Between(-P(16), P(16)), jy + Phaser.Math.Between(-P(10), P(10))); g.strokePath();
          }
          g.strokeEllipse(jx, jy, P(12), P(8));
          this.tweens.add({ targets: g, alpha: { from: 0.20, to: 0.60 }, duration: Phaser.Math.Between(2000, 3200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Phaser.Math.Between(0, 1000) });
        } else {
          // Rusty chains / debris
          for (let k = 0; k < 3; k++) {
            const ox = Phaser.Math.Between(-P(10), P(10)), oy = Phaser.Math.Between(-P(6), P(6));
            this.add.graphics().setDepth(D).fillStyle(0x6a5030, 0.65).fillRect(jx + ox - P(2), jy + oy - P(1), P(5), P(2));
          }
        }
        break;
    }
  }

  protected damageAlliesNear(x: number, y: number, radius: number, dmg: number): void {
    for (const ally of this._allyMinions) {
      if (ally.isDead) continue;
      if (Phaser.Math.Distance.Between(x, y, ally.x, ally.y) <= radius) ally.takeDamage(dmg);
    }
  }

  // 範圍傷害：同時打 player 和範圍內所有友軍
  protected hitInRadius(x: number, y: number, r: number, dmg: number): void {
    const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
    if (dSq <= r * r) this.player.takeDamage(dmg);
    this.damageAlliesNear(x, y, r, dmg);
  }

  // 全場傷害：打 player 和所有友軍（不依位置）
  protected hitGlobal(dmg: number): void {
    this.player.takeDamage(dmg);
    for (const ally of this._allyMinions) {
      if (!ally.isDead) ally.takeDamage(dmg);
    }
  }

  private farthestTargetPos(fromX: number, fromY: number): [number, number] {
    let best: [number, number] = [this.player.x, this.player.y];
    let bestDist = Phaser.Math.Distance.Between(fromX, fromY, this.player.x, this.player.y);
    if (NetworkService.connected && NetworkService.isHost) {
      this._partners.forEach(pd => {
        if (!pd.sprite.active || pd.isDead) return;
        const d = Phaser.Math.Distance.Between(fromX, fromY, pd.sprite.x, pd.sprite.y);
        if (d > bestDist) { bestDist = d; best = [pd.sprite.x, pd.sprite.y]; }
      });
    }
    return best;
  }

  private _startDarkNight(zones: { x: number; y: number; r: number }[]): void {
    const W = this.scale.width, H = this.scale.height;
    const DPR = (window as any).__gameDpr as number;
    const vR = Math.round(35 * DPR);

    this._darkNightActive = true;
    this._darkNightZones = zones;

    // 視野貼圖：中心清晰、邊緣暈染（只建一次）
    if (!this.textures.exists('__v1_vision')) {
      const cg = this.make.graphics({ x: 0, y: 0 }, false);
      cg.fillStyle(0xffffff, 0.18); cg.fillCircle(vR, vR, vR);
      cg.fillStyle(0xffffff, 0.55); cg.fillCircle(vR, vR, Math.round(vR * 0.72));
      cg.fillStyle(0xffffff, 0.85); cg.fillCircle(vR, vR, Math.round(vR * 0.50));
      cg.fillStyle(0xffffff, 1.00); cg.fillCircle(vR, vR, Math.round(vR * 0.32));
      cg.generateTexture('__v1_vision', vR * 2, vR * 2);
      cg.destroy();
    }

    // 深紫黑底圖（不加入場景，每幀 draw 到 RT 上）
    const bg = this.make.graphics({ x: 0, y: 0 }, false);
    bg.fillStyle(0x05000a, 0.97);
    bg.fillRect(0, 0, W, H);
    this._darkNightBlackGfx = bg;

    // 動態 RT（每幀重繪孔洞跟著玩家走）
    this._darkNightRT = this.add.renderTexture(0, 0, W, H)
      .setScrollFactor(0).setDepth(5000).setOrigin(0, 0);

    // 視野邊緣脈衝光環（screen space，depth 5001）
    this._darkNightEdgeGfx = this.add.graphics().setScrollFactor(0).setDepth(5001);

    // 安全區（world space，depth 4999，透過視野孔才看得到）
    const dp = Math.round(3 * DPR);
    const safeGfx = this.add.graphics().setDepth(4999);
    for (const z of zones) {
      safeGfx.fillStyle(0x00ff88, 0.30); safeGfx.fillCircle(z.x, z.y, z.r);
      safeGfx.lineStyle(dp, 0x00ff88, 0.95); safeGfx.strokeCircle(z.x, z.y, z.r);
    }
    this._darkNightSafeGfx = safeGfx;
  }

  private _updateDarkNight(): void {
    if (!this._darkNightActive || !this._darkNightRT || !this._darkNightBlackGfx || !this.player?.active) return;
    const DPR = (window as any).__gameDpr as number;
    const vR = Math.round(35 * DPR);
    const sx = this.player.x - this.cameras.main.scrollX;
    const sy = this.player.y - this.cameras.main.scrollY;

    // 重繪黑幕 + 挖孔（每幀跟著玩家螢幕座標）
    this._darkNightRT.clear();
    this._darkNightRT.draw(this._darkNightBlackGfx, 0, 0);
    this._darkNightRT.erase('__v1_vision', sx - vR, sy - vR);

    // 脈衝視野邊緣光環
    const pulse = 0.5 + 0.5 * Math.sin(this.time.now * 0.0032);
    const eg = this._darkNightEdgeGfx!;
    eg.clear();
    eg.lineStyle(Math.round(5 * DPR), 0x8800dd, 0.28 + pulse * 0.22);
    eg.strokeCircle(sx, sy, vR + Math.round(3 * DPR));
    eg.lineStyle(Math.round(11 * DPR), 0x440066, 0.10 + pulse * 0.08);
    eg.strokeCircle(sx, sy, vR + Math.round(9 * DPR));
  }

  private _clearAllSkillVfx(): void {
    const FADE = 500;
    const fadeDestroy = (gfx: Phaser.GameObjects.GameObject) => {
      if (!gfx?.active) return;
      this.tweens.add({ targets: gfx, alpha: 0, duration: FADE, onComplete: () => { if (gfx.active) gfx.destroy(); } });
    };

    // Plant zones
    this.plantZones.forEach(z => fadeDestroy(z.gfx));
    this.plantZones = [];

    // Orbit balls (player + partner)
    this._orbitBalls.forEach(b => fadeDestroy(b.gfx));
    this._orbitBalls = [];
    this._partnerOrbitBalls.forEach(arr => arr.forEach(b => fadeDestroy(b.gfx)));
    this._partnerOrbitBalls.clear();

    // Knives
    this._playerKnives.forEach(k => fadeDestroy(k.gfx));
    this._playerKnives = [];
    this._partnerKnives.forEach(k => fadeDestroy(k.gfx));
    this._partnerKnives = [];

    // Slow zones
    this._slowZones.forEach(z => fadeDestroy(z.gfx));
    this._slowZones = [];

    // Timers + named gfx
    this._divineShieldTimer?.destroy(); this._divineShieldTimer = undefined;
    fadeDestroy(this._divineShieldGfx!); this._divineShieldGfx = undefined;
    this._blazingTimer?.destroy(); this._blazingTimer = undefined;
    fadeDestroy(this._blazingGfx!); this._blazingGfx = undefined;
    this._fearAuraTimer?.destroy(); this._fearAuraTimer = undefined;
    fadeDestroy(this._fearAuraGfx!); this._fearAuraGfx = undefined;

    // Flower charge gfx
    if (this._flowerChargeGfx?.active) fadeDestroy(this._flowerChargeGfx);

    // Data-only arrays (rendered via shared gfx, clearing stops them)
    this.activeFires = [];
    this._rainPuddles = [];
  }

  private _endDarkNight(): void {
    this._darkNightActive = false;
    this._darkNightRT?.destroy(); this._darkNightRT = undefined;
    this._darkNightBlackGfx?.destroy(); this._darkNightBlackGfx = undefined;
    this._darkNightEdgeGfx?.destroy(); this._darkNightEdgeGfx = undefined;
    this._darkNightSafeGfx?.destroy(); this._darkNightSafeGfx = undefined;
  }

  private randomTargetPos(): [number, number] {
    const targets: [number, number][] = [[this.player.x, this.player.y]];
    if (NetworkService.connected && NetworkService.isHost) {
      this._partners.forEach(pd => {
        if (pd.sprite.active && !pd.isDead) targets.push([pd.sprite.x, pd.sprite.y]);
      });
    }
    return targets[Math.floor(Math.random() * targets.length)];
  }

  protected hasAnyValidTarget(): boolean {
    if (this.player.active && !this.gameOver) return true;
    if (NetworkService.connected) {
      for (const pd of this._partners.values()) {
        if (pd.sprite.active && !pd.isDead) return true;
      }
    }
    for (const ally of this._allyMinions) {
      if (!ally.isDead) return true;
    }
    return false;
  }

  protected nearestTargetPos(fromX: number, fromY: number): [number, number] {
    const playerAlive = !this.gameOver && this.player.active;
    let best: [number, number] = [this.player.x, this.player.y];
    let bestDist = playerAlive
      ? Phaser.Math.Distance.Between(fromX, fromY, this.player.x, this.player.y)
      : Infinity;

    if (NetworkService.connected && NetworkService.isHost) {
      this._partners.forEach(pd => {
        if (!pd.sprite.active || pd.isDead) return;
        const dg = Phaser.Math.Distance.Between(fromX, fromY, pd.sprite.x, pd.sprite.y);
        if (dg < bestDist) { bestDist = dg; best = [pd.sprite.x, pd.sprite.y]; }
      });
    }

    // 友軍花怪也納入敵人的追擊目標
    for (const ally of this._allyMinions) {
      if (ally.isDead) continue;
      const d = Phaser.Math.Distance.Between(fromX, fromY, ally.x, ally.y);
      if (d < bestDist) { bestDist = d; best = [ally.x, ally.y]; }
    }

    if (bestDist === Infinity) return [fromX, fromY];
    return best;
  }

  protected createBoss(bossDef: MonsterDef, totalHp: number): Boss {
    const cx = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    if (bossDef.id === 'boss_slime_green') {
      const b = new BossGreenSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSummonElite = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_green', x, y, true);
      };
      b.onPoisonTick = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_red') {
      const b = new BossRedSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onJumpHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onFanHit = (bx, by, angle, half, range, dmg) => {
        if (!this.bossActive) return;
        const checkFan = (tx: number, ty: number) => {
          const dx = tx - bx, dy = ty - by;
          if (Math.sqrt(dx * dx + dy * dy) > range) return false;
          return Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle)) <= half;
        };
        if (checkFan(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && checkFan(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_blue') {
      const b = new BossBlueSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSpikeHit = (x, y, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, P(18), dmg);
      };
      b.onMineExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
        if (Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player) <= r * r) {
          this.player.speedMult = 0.4;
          this.player.setTint(0x88ccff);
          this.time.delayedCall(2000, () => { this.player.speedMult = 1; this.player.clearTint(); });
        }
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_white') {
      const b = new BossWhiteSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onCrossHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      b.onOrbExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_zombie_slime') {
      const b = new BossZombieSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSummonZombie = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_zombie', x, y, true);
      };
      b.onPoisonFanHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_lava_slime') {
      const b = new BossLavaSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onBarrageHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      b.onPillarExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_flower_one') {
      const b = new BossFlowerOne(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onFirePetal = (fromX, fromY, angle, speed, dmg, blindDist, large) => {
        if (!this.bossActive) return;
        this.fireBossPetal(fromX, fromY, angle, speed, dmg, blindDist, large);
      };
      b.onRepelPlayer = () => { /* 暫時停用 */ };
      return b;
    }
    if (bossDef.id === 'boss_flower_two') {
      const b = new BossFlowerTwo(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onPlaceBuds = (positions, dmg, r, zoneDur) => {
        if (!this.bossActive) return;
        this.placeBuds(positions, dmg, r, zoneDur);
      };
      b.onSprayMist = (fromX, fromY, angle, range, dmg) => {
        if (!this.bossActive) return;
        this.sprayMist(fromX, fromY, angle, range, dmg);
      };
      b.onSpawnVines = (fromX, fromY, len, w, dmg, baseAngle, count) => {
        if (!this.bossActive) return;
        this.spawnVines(fromX, fromY, len, w, dmg, baseAngle, count);
      };
      b.onPoisonBurst = (fromX, fromY, dist, r, dmg, count) => {
        if (!this.bossActive) return;
        this.poisonBurst(fromX, fromY, dist, r, dmg, count);
      };
      return b;
    }
    if (bossDef.id === 'boss_flower_three') {
      const b = new BossFlowerThree(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.getAliveCount = () => {
        let count = this._pendingFlowerSeeds;
        for (const m of this._flowerThreeMinions) { if (!m.isDead) count++; }
        return count;
      };
      b.onSpawnSeed = (positions, _count) => {
        if (!this.bossActive) return;
        this.spawnFlowerThreeSeeds(positions);
      };
      b.onPlaceSlowZones = (positions, radius, dur, bossX, bossY) => {
        if (!this.bossActive) return;
        this.placeSlowZones(positions, radius, dur, bossX, bossY);
      };
      b.onPlaceSpike = (tx, ty, dmg) => {
        if (!this.bossActive) return;
        this.spikeAt(tx, ty, Math.round(dmg / 3.5), false, 3.15);
      };
      b.onFirePetal = (fromX, fromY, angle, speed, dmg, blindDist) => {
        if (!this.bossActive) return;
        this.fireBossPetal(fromX, fromY, angle, speed, dmg, blindDist);
      };
      return b;
    }
    if (bossDef.id === 'boss_orc1') {
      const b = new BossOrc1(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onWhirlTick = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onWhirlSlash = (wx, wy, tx, ty) => {
        if (!this.bossActive) return;
        this.whirlSlashAt(wx, wy, tx, ty, 0, true, Math.round(52 * DPR), b.scaleDmg(40), 320);
      };
      b.onSummonOrc = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('orc1_s', x, y, false);
      };
      b.onFanSlash = (bx, by, angle, half, range, dmg) => {
        if (!this.bossActive) return;
        const checkFan = (tx: number, ty: number) => {
          const dx = tx - bx, dy = ty - by;
          if (Math.sqrt(dx * dx + dy * dy) > range) return false;
          return Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle)) <= half;
        };
        if (checkFan(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && checkFan(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };
      b.onBoulderLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onSlowZoneTick = (x, y, r) => {
        if (!this.bossActive) return;
        const d = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (d <= r) {
          this.player.speedMult = Math.min(this.player.speedMult, 0.45);
          this.time.delayedCall(200, () => { if (this.player.speedMult < 1) this.player.speedMult = 1; });
        }
      };
      b.onRoar = () => {
        if (!this.bossActive) return;
        this.player.speedMult = 0.5;
        this.player.setTint(0xff8800);
        this.time.delayedCall(3500, () => {
          this.player.speedMult = 1;
          this.player.clearTint();
        });
      };
      return b;
    }
    if (bossDef.id === 'boss_orc2') {
      const b = new BossOrc2(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onJumpLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.fireBossJumpLand(x, y, r, dmg);
      };
      b.onFissure = (bx, by, angle, len, dmg) => {
        if (!this.bossActive) return;
        this.fireBossFissureWithBranches(bx, by, angle, len, dmg);
      };
      b.onFieldFracture = (safeZones, dmg, duration, tickMs) => {
        if (!this.bossActive) return;
        this.fireBossFieldFracture(safeZones, dmg, duration, tickMs);
      };
      b.onBoulderRoll = (bx, by, angle, speed, r, dmg) => {
        if (!this.bossActive) return;
        this.fireBossRollingBoulder(bx, by, angle, speed, r, dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_orc3') {
      const b = new BossOrc3(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);

      b.onShowKanji = (char, bx, by) => {
        this._showBossKanji(char, bx, by);
      };

      b.onBladeStorm = (bx, by, angle, dmg) => {
        if (!this.bossActive) return;
        const tx = bx + Math.cos(angle) * P(320);
        const ty = by + Math.sin(angle) * P(320);
        this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true);
      };

      b.onStormWarn = (bx, by, angles, warnMs) => {
        if (!this.bossActive) return;
        const TRAVEL = P(320);
        angles.forEach(angle => {
          const ex = bx + Math.cos(angle) * TRAVEL;
          const ey = by + Math.sin(angle) * TRAVEL;
          const g = this.add.graphics().setDepth(52);
          g.lineStyle(P(1.5), 0x44aaff, 0.55);
          g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
          g.fillStyle(0x88ddff, 0.7);
          g.fillCircle(ex, ey, P(4));
          this.tweens.add({ targets: g, alpha: 0, duration: warnMs, ease: 'Quad.In', onComplete: () => g.destroy() });
        });
      };

      b.onBushidoGuard = (bx, by) => {
        if (!this.bossActive) return;
        const ring = this.add.graphics().setDepth(55);
        ring.lineStyle(P(3), 0xffd700, 0.9);
        ring.strokeCircle(bx, by, P(28));
        this.tweens.add({
          targets: ring, alpha: 0, scaleX: 1.6, scaleY: 1.6,
          duration: 600, ease: 'Quad.Out', onComplete: () => ring.destroy(),
        });
        const shield = this.add.graphics().setDepth(53).setAlpha(0);
        shield.fillStyle(0xffd700, 0.18);
        shield.fillCircle(bx, by, P(30));
        shield.lineStyle(P(2), 0xffd700, 0.7);
        shield.strokeCircle(bx, by, P(30));
        this.tweens.add({ targets: shield, alpha: 1, duration: 200, ease: 'Quad.Out' });
        this.time.delayedCall(1800, () => {
          this.tweens.add({ targets: shield, alpha: 0, duration: 300, onComplete: () => shield.destroy() });
        });
      };

      b.onBushidoBurst = (bx, by, rounds, dmg) => {
        if (!this.bossActive) return;
        const BLADES = 8;
        for (let r = 0; r < rounds; r++) {
          this.time.delayedCall(r * 500, () => {
            if (!this.bossActive) return;
            const base = Math.random() * Math.PI * 2;
            for (let j = 0; j < BLADES; j++) {
              const angle = base + (j / BLADES) * Math.PI * 2;
              const tx = bx + Math.cos(angle) * P(320);
              const ty = by + Math.sin(angle) * P(320);
              this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true);
            }
          });
        }
      };

      b.onBurial = (warnMs, dmg) => {
        if (!this.bossActive) return;
        const cx = this.bossArenaCenter.x;
        const cy = this.bossArenaCenter.y;
        const R = this.BOSS_ARENA_RADIUS * 0.82;
        const TRAVEL = P(320);

        // 5×3 grid, randomly rotated + small jitter, uniform spacing
        const COLS = 5, ROWS = 3;
        const cell = R * 0.38;
        const gridAngle = Math.random() * Math.PI * 2;
        const gc = Math.cos(gridAngle), gs = Math.sin(gridAngle);
        const jx = (Math.random() - 0.5) * cell * 0.4;
        const jy = (Math.random() - 0.5) * cell * 0.4;
        const entries: Array<{ ox: number; oy: number; angle: number }> = [];
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const lx = (col - (COLS - 1) / 2) * cell + jx;
            const ly = (row - (ROWS - 1) / 2) * cell + jy;
            entries.push({
              ox: cx + lx * gc - ly * gs,
              oy: cy + lx * gs + ly * gc,
              angle: Math.random() * Math.PI * 2,
            });
          }
        }

        // Warning: full trajectory lines + spawn dot
        entries.forEach(e => {
          const ex = e.ox + Math.cos(e.angle) * TRAVEL;
          const ey = e.oy + Math.sin(e.angle) * TRAVEL;
          const g = this.add.graphics().setDepth(52);
          g.lineStyle(P(1.5), 0xff3311, 0.7);
          g.beginPath(); g.moveTo(e.ox, e.oy); g.lineTo(ex, ey); g.strokePath();
          g.fillStyle(0xff5533, 0.85);
          g.fillCircle(e.ox, e.oy, P(4));
          g.fillStyle(0xff8855, 0.55);
          g.fillCircle(ex, ey, P(3));
          this.tweens.add({
            targets: g, alpha: 0, duration: warnMs * 0.85,
            ease: 'Quad.In', onComplete: () => g.destroy(),
          });
        });

        // Staggered blade fires after warn
        entries.forEach((e, i) => {
          this.time.delayedCall(warnMs + i * 50, () => {
            if (!this.bossActive) return;
            const tx = e.ox + Math.cos(e.angle) * TRAVEL;
            const ty = e.oy + Math.sin(e.angle) * TRAVEL;
            this.bladeWaveAt(e.ox, e.oy, tx, ty, dmg / 5, true);
          });
        });
      };

      b.onIronWarn = (bx, by, angle, warnMs) => {
        if (!this.bossActive) return;
        const TRAVEL = P(640);
        const ex = bx + Math.cos(angle) * TRAVEL;
        const ey = by + Math.sin(angle) * TRAVEL;
        const g = this.add.graphics().setDepth(52);
        g.lineStyle(P(3), 0xffffff, 0.8);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
        g.lineStyle(P(7), 0xaaaaff, 0.15);
        g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
        this.tweens.chain({
          targets: g,
          tweens: [
            { alpha: 1, duration: warnMs * 0.6, ease: 'Quad.Out' },
            { alpha: 0, duration: warnMs * 0.4, ease: 'Quad.In', onComplete: () => g.destroy() },
          ],
        });
      };

      b.onIronSlash = (bx, by, angle, dmg) => {
        if (!this.bossActive) return;
        const tx = bx + Math.cos(angle) * P(640);
        const ty = by + Math.sin(angle) * P(640);
        this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true, 3);
      };

      b.getIronTarget = () => this.randomTargetPos();

      b.onVanish = (bx, by) => {
        if (!this.bossActive) return;
        // 煙霧殘影
        const smoke = this.add.graphics().setDepth(56);
        smoke.fillStyle(0x334466, 0.55);
        smoke.fillCircle(bx, by, P(22));
        this.tweens.add({ targets: smoke, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 500, ease: 'Quad.Out', onComplete: () => smoke.destroy() });
        // Boss 淡出
        this.tweens.add({ targets: b, alpha: 0, duration: 400, ease: 'Quad.In' });
      };

      b.onAppear = (nx, ny) => {
        if (!this.bossActive) return;
        b.setAlpha(0);
        // 衝擊波環
        const ring = this.add.graphics().setDepth(56);
        ring.lineStyle(P(3), 0xffffff, 1);
        ring.strokeCircle(nx, ny, P(12));
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 4, scaleY: 4, duration: 350, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        // 閃白
        const flash = this.add.graphics().setDepth(55);
        flash.fillStyle(0xffffff, 0.65);
        flash.fillCircle(nx, ny, P(26));
        this.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => flash.destroy() });
        // Boss 淡入
        this.tweens.add({ targets: b, alpha: 1, duration: 300, ease: 'Quad.Out' });
      };

      return b;
    }
    if (bossDef.id === 'boss_vampire1') {
      const b = new BossVampire1(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);

      b.getAllTargetPositions = () => {
        const targets: [number, number][] = [[this.player.x, this.player.y]];
        if (NetworkService.connected && NetworkService.isHost) {
          this._partners.forEach(pd => {
            if (pd.sprite.active && !pd.isDead) targets.push([pd.sprite.x, pd.sprite.y]);
          });
        }
        return targets;
      };

      b.onBatHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onCrimsonNeedle = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onGazeHit = (bx, by, tx, ty, beamR, dmg) => {
        if (!this.bossActive) return;
        // Line-segment distance check for beam
        const abx = tx - bx, aby = ty - by;
        const len2 = abx * abx + aby * aby || 1;
        const checkTarget = (cx: number, cy: number, takeDmg: () => void) => {
          const apx = cx - bx, apy = cy - by;
          const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
          const nx = bx + t * abx - cx, ny = by + t * aby - cy;
          if (nx * nx + ny * ny <= beamR * beamR) takeDmg();
        };
        checkTarget(this.player.x, this.player.y, () => this.player.takeDamage(dmg));
        for (const ally of this._allyMinions) {
          if (!ally.isDead) checkTarget(ally.x, ally.y, () => ally.takeDamage(dmg));
        }
      };

      b.onDarkNightActivate = (zones) => {
        if (!this.bossActive) return;
        this._startDarkNight(zones);
      };

      b.onDarkNightLift = () => {
        this._endDarkNight();
      };

      b.onDarkNightPunish = () => {
        if (!this.bossActive) return;
        const inSafe = (cx: number, cy: number) =>
          this._darkNightZones.some(z => Phaser.Math.Distance.Between(cx, cy, z.x, z.y) <= z.r);

        // 傷害判定
        const playerSafe = inSafe(this.player.x, this.player.y);
        if (!playerSafe) this.player.punishNearDeath();
        for (const ally of this._allyMinions) {
          if (!ally.isDead && !inSafe(ally.x, ally.y)) ally.takeDamage(999999);
        }

        // 鏡頭震動 / 閃光（以本地玩家為基準）
        this.cameras.main.shake(700, playerSafe ? 0.007 : 0.022);
        this.cameras.main.flash(playerSafe ? 200 : 450, 180, 0, 0);

        // 每個未逃掉的角色位置各炸一次
        const blastTargets: { x: number; y: number; safe: boolean }[] = [
          { x: this.player.x, y: this.player.y, safe: playerSafe },
          ...this._allyMinions
            .filter(a => !a.isDead)
            .map(a => ({ x: a.x, y: a.y, safe: inSafe(a.x, a.y) })),
        ];

        for (const { x: px, y: py, safe } of blastTargets) {
          // 最外層暗紅底
          const bg = this.add.graphics({ x: px, y: py }).setDepth(9993);
          bg.fillStyle(0x440000, safe ? 0.50 : 0.85); bg.fillCircle(0, 0, P(90));
          this.tweens.add({ targets: bg, scaleX: 4.5, scaleY: 4.5, alpha: 0, duration: 1100, ease: 'Quad.Out', onComplete: () => bg.destroy() });

          // 衝擊環 1
          const ring1 = this.add.graphics({ x: px, y: py }).setDepth(9994);
          ring1.lineStyle(P(8), 0xdd0022, 0.85); ring1.strokeCircle(0, 0, P(25));
          this.tweens.add({ targets: ring1, scaleX: 7, scaleY: 7, alpha: 0, duration: 900, ease: 'Quad.Out', onComplete: () => ring1.destroy() });

          // 衝擊環 2（延遲 80ms）
          this.time.delayedCall(80, () => {
            const ring2 = this.add.graphics({ x: px, y: py }).setDepth(9995);
            ring2.lineStyle(P(5), 0xff3355, 0.90); ring2.strokeCircle(0, 0, P(20));
            this.tweens.add({ targets: ring2, scaleX: 5, scaleY: 5, alpha: 0, duration: 700, ease: 'Expo.Out', onComplete: () => ring2.destroy() });
          });

          // 衝擊環 3（延遲 160ms）
          this.time.delayedCall(160, () => {
            const ring3 = this.add.graphics({ x: px, y: py }).setDepth(9996);
            ring3.lineStyle(P(3), 0xff6688, 0.80); ring3.strokeCircle(0, 0, P(15));
            this.tweens.add({ targets: ring3, scaleX: 4, scaleY: 4, alpha: 0, duration: 500, ease: 'Expo.Out', onComplete: () => ring3.destroy() });
          });

          // 核心爆炸
          const core = this.add.graphics({ x: px, y: py }).setDepth(9997);
          core.fillStyle(0xff0033, 1.0); core.fillCircle(0, 0, P(30));
          core.fillStyle(0xff8899, 0.75); core.fillCircle(0, 0, P(16));
          this.tweens.add({ targets: core, scaleX: 5.5, scaleY: 5.5, alpha: 0, duration: 600, ease: 'Expo.Out', onComplete: () => core.destroy() });

          // 白色高光（延遲 30ms）
          this.time.delayedCall(30, () => {
            const white = this.add.graphics({ x: px, y: py }).setDepth(9999);
            white.fillStyle(0xffffff, 0.92); white.fillCircle(0, 0, P(22));
            this.tweens.add({ targets: white, scaleX: 3, scaleY: 3, alpha: 0, duration: 350, ease: 'Quad.Out', onComplete: () => white.destroy() });
          });

          // 殘留焦痕（未逃掉時）
          if (!safe) {
            this.time.delayedCall(300, () => {
              const scorch = this.add.graphics({ x: px, y: py }).setDepth(55);
              scorch.fillStyle(0x220000, 0.70); scorch.fillCircle(0, 0, P(50));
              scorch.lineStyle(P(2), 0x880011, 0.60); scorch.strokeCircle(0, 0, P(50));
              this.tweens.add({ targets: scorch, alpha: 0, duration: 2000, delay: 800, onComplete: () => scorch.destroy() });
            });
          }
        }
      };

      b.onNeedleHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onNeedleLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const expires = this.time.now + 600;
        this._rainPuddles.push({ x, y, r, dmg, expires });
      };

      return b;
    }
    if (bossDef.id === 'boss_vampire2') {
      const b = new BossVampire2(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);

      b.onMeteorRainHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onCometRingHit = (impactX, impactY, rInner, rOuter, dmg) => {
        if (!this.bossActive) return;
        const dist = (tx: number, ty: number) =>
          Phaser.Math.Distance.Between(tx, ty, impactX, impactY);
        const inZone = (d: number) => rInner === 0 ? d <= rOuter : d > rInner && d <= rOuter;
        if (inZone(dist(this.player.x, this.player.y))) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && inZone(dist(ally.x, ally.y))) ally.takeDamage(dmg);
        }
      };

      b.onElFireHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onElIceHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onElThunderHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };

      b.onElVoidHit = (cx, cy, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(cx, cy, r, dmg);
      };
      b.onLightningArcHit = (dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
      };
      b.onIceDomainStart = (cx, cy) => { this._v3IceDomainActive = true; this._v3IceDomainCX = cx; this._v3IceDomainCY = cy; };
      b.onIceDomainEnd = () => {
        this._v3IceDomainActive = false;
        if (this.player.slowMult > 0.35) this.player.slowMult = 1;
      };
      b.onTornadoHit = (dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
      };

      return b;
    }
    if (bossDef.id === 'boss_vampire3') {
      const b = new BossVampire3(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);

      const checkArc = (cx2: number, cy2: number, r: number, aimAng: number, arcDeg: number, dmg: number) => {
        if (!this.bossActive) return;
        const half = (arcDeg / 2) * Math.PI / 180;
        const px = this.player.x, py = this.player.y;
        const dist = Phaser.Math.Distance.Between(cx2, cy2, px, py);
        if (dist < P(15) || dist > r + P(20)) return;
        const angToPlayer = Math.atan2(py - cy2, px - cx2);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(angToPlayer - aimAng));
        if (diff <= half + 0.08) this.player.takeDamage(dmg);
      };

      b.onScytheHit = checkArc;
      b.onScytheTrailTick = checkArc;
      b.onCloneScytheHit = checkArc;

      b.onBurstOrbLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, x, y) <= r) ally.takeDamage(dmg);
        }
      };

      b.onBurstOrbFly = (x, y, r, dmg) => {
        if (!this.bossActive) return false;
        let hit = false;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) {
          this.player.takeDamage(dmg); hit = true;
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, x, y) <= r) ally.takeDamage(dmg);
        }
        return hit;
      };

      b.onSpikeHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) this.player.takeDamage(dmg);
      };

      b.onRiverTick = (x1, y1, x2, y2, hw, dmg) => {
        if (!this.bossActive) return;
        const abx = x2 - x1, aby = y2 - y1;
        const lenSq = abx * abx + aby * aby || 1;
        const inRiver = (cx: number, cy: number) => {
          const raw = ((cx - x1) * abx + (cy - y1) * aby) / lenSq;
          if (raw < 0) return false; // BOSS 背後不判定
          const t = Math.min(1, raw);
          const nx = x1 + t * abx - cx, ny = y1 + t * aby - cy;
          return nx * nx + ny * ny <= hw * hw;
        };
        if (inRiver(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && inRiver(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };

      return b;
    }
    // ── 傳說系列王：複用現有最強 Boss 類，放大 1.2 倍 ──────────
    if (bossDef.id === 'boss_slime_legendary') {
      const b = new BossSlimeLegendary(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSummonElite = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_green', x, y, true);
      };
      b.onPoisonTick = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onJumpHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onFanHit = (bx, by, angle, half, range, dmg) => {
        if (!this.bossActive) return;
        const checkFan = (tx: number, ty: number) => {
          const dx = tx - bx, dy = ty - by;
          if (Math.sqrt(dx * dx + dy * dy) > range) return false;
          return Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle)) <= half;
        };
        if (checkFan(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && checkFan(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };
      b.onSpikeHit = (x, y, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, P(18), dmg);
      };
      b.onMineExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onCrossHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      b.onOrbExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onSummonZombie = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_zombie', x, y, true);
      };
      b.onPoisonFanHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      b.onBarrageHit = (dmg) => {
        if (!this.bossActive) return;
        this.hitGlobal(dmg);
      };
      b.onPillarExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.setScale(b.scaleX * 1.2, b.scaleY * 1.2);
      return b;
    }
    if (bossDef.id === 'boss_flower_legendary') {
      const b = new BossFlowerLegendary(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.getAliveCount = () => {
        let count = this._pendingFlowerSeeds;
        for (const m of this._flowerThreeMinions) { if (!m.isDead) count++; }
        return count;
      };
      b.onSpawnSeed = (positions, _count) => {
        if (!this.bossActive) return;
        this.spawnFlowerThreeSeeds(positions);
      };
      b.onPlaceSlowZones = (positions, radius, dur, bossX, bossY) => {
        if (!this.bossActive) return;
        this.placeSlowZones(positions, radius, dur, bossX, bossY);
      };
      b.onPlaceSpike = (tx, ty, dmg) => {
        if (!this.bossActive) return;
        this.spikeAt(tx, ty, Math.round(dmg / 3.5), false, 3.15);
      };
      b.onFirePetal = (fromX, fromY, angle, speed, dmg, blindDist, large) => {
        if (!this.bossActive) return;
        this.fireBossPetal(fromX, fromY, angle, speed, dmg, blindDist, large);
      };
      b.onRepelPlayer = () => { /* 暫時停用 */ };
      b.onPlaceBuds = (positions, dmg, r, zoneDur) => {
        if (!this.bossActive) return;
        this.placeBuds(positions, dmg, r, zoneDur);
      };
      b.onSprayMist = (fromX, fromY, angle, range, dmg) => {
        if (!this.bossActive) return;
        this.sprayMist(fromX, fromY, angle, range, dmg);
      };
      b.onSpawnVines = (fromX, fromY, len, w, dmg, baseAngle, count) => {
        if (!this.bossActive) return;
        this.spawnVines(fromX, fromY, len, w, dmg, baseAngle, count);
      };
      b.onPoisonBurst = (fromX, fromY, dist, r, dmg, count) => {
        if (!this.bossActive) return;
        this.poisonBurst(fromX, fromY, dist, r, dmg, count);
      };
      b.setScale(b.scaleX * 1.2, b.scaleY * 1.2);
      return b;
    }
    if (bossDef.id === 'boss_orc_legendary') {
      const b = new BossOrcLegendary(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onShowKanji = (char, bx, by) => { this._showBossKanji(char, bx, by); };
      b.onBladeStorm = (bx, by, angle, dmg) => {
        if (!this.bossActive) return;
        const tx = bx + Math.cos(angle) * P(320);
        const ty = by + Math.sin(angle) * P(320);
        this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true);
      };
      b.onStormWarn = (bx, by, angles, warnMs) => {
        if (!this.bossActive) return;
        const TRAVEL = P(320);
        angles.forEach(angle => {
          const ex = bx + Math.cos(angle) * TRAVEL;
          const ey = by + Math.sin(angle) * TRAVEL;
          const g = this.add.graphics().setDepth(52);
          g.lineStyle(P(1.5), 0x44aaff, 0.55);
          g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
          g.fillStyle(0x88ddff, 0.7);
          g.fillCircle(ex, ey, P(4));
          this.tweens.add({ targets: g, alpha: 0, duration: warnMs, ease: 'Quad.In', onComplete: () => g.destroy() });
        });
      };
      b.onBushidoGuard = (bx, by) => {
        if (!this.bossActive) return;
        const ring = this.add.graphics().setDepth(55);
        ring.lineStyle(P(3), 0xffd700, 0.9); ring.strokeCircle(bx, by, P(28));
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 1.6, scaleY: 1.6, duration: 600, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        const shield = this.add.graphics().setDepth(53).setAlpha(0);
        shield.fillStyle(0xffd700, 0.18); shield.fillCircle(bx, by, P(30));
        shield.lineStyle(P(2), 0xffd700, 0.7); shield.strokeCircle(bx, by, P(30));
        this.tweens.add({ targets: shield, alpha: 1, duration: 200, ease: 'Quad.Out' });
        this.time.delayedCall(1800, () => { this.tweens.add({ targets: shield, alpha: 0, duration: 300, onComplete: () => shield.destroy() }); });
      };
      b.onBushidoBurst = (bx, by, rounds, dmg) => {
        if (!this.bossActive) return;
        for (let r = 0; r < rounds; r++) {
          this.time.delayedCall(r * 500, () => {
            if (!this.bossActive) return;
            const base = Math.random() * Math.PI * 2;
            for (let j = 0; j < 8; j++) {
              const angle = base + (j / 8) * Math.PI * 2;
              const tx = bx + Math.cos(angle) * P(320);
              const ty = by + Math.sin(angle) * P(320);
              this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true);
            }
          });
        }
      };
      b.onBurial = (warnMs, dmg) => {
        if (!this.bossActive) return;
        const bcx = this.bossArenaCenter.x, bcy = this.bossArenaCenter.y;
        const R = this.BOSS_ARENA_RADIUS * 0.82;
        const TRAVEL = P(320);
        const COLS = 5, ROWS = 3;
        const cell = R * 0.38;
        const gridAngle = Math.random() * Math.PI * 2;
        const gc = Math.cos(gridAngle), gs = Math.sin(gridAngle);
        const jx = (Math.random() - 0.5) * cell * 0.4;
        const jy = (Math.random() - 0.5) * cell * 0.4;
        const entries: Array<{ ox: number; oy: number; angle: number }> = [];
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const lx = (col - (COLS - 1) / 2) * cell + jx;
            const ly = (row - (ROWS - 1) / 2) * cell + jy;
            entries.push({ ox: bcx + lx * gc - ly * gs, oy: bcy + lx * gs + ly * gc, angle: Math.random() * Math.PI * 2 });
          }
        }
        entries.forEach(e => {
          const ex = e.ox + Math.cos(e.angle) * TRAVEL;
          const ey = e.oy + Math.sin(e.angle) * TRAVEL;
          const g = this.add.graphics().setDepth(52);
          g.lineStyle(P(1.5), 0xff3311, 0.7);
          g.beginPath(); g.moveTo(e.ox, e.oy); g.lineTo(ex, ey); g.strokePath();
          g.fillStyle(0xff5533, 0.85); g.fillCircle(e.ox, e.oy, P(4));
          this.tweens.add({ targets: g, alpha: 0, duration: warnMs * 0.85, ease: 'Quad.In', onComplete: () => g.destroy() });
        });
        entries.forEach((e, i) => {
          this.time.delayedCall(warnMs + i * 50, () => {
            if (!this.bossActive) return;
            const tx = e.ox + Math.cos(e.angle) * TRAVEL;
            const ty = e.oy + Math.sin(e.angle) * TRAVEL;
            this.bladeWaveAt(e.ox, e.oy, tx, ty, dmg / 5, true);
          });
        });
      };
      b.onIronWarn = (bx, by, angle, warnMs) => {
        if (!this.bossActive) return;
        const TRAVEL = P(640);
        const ex = bx + Math.cos(angle) * TRAVEL, ey = by + Math.sin(angle) * TRAVEL;
        const g = this.add.graphics().setDepth(52);
        g.lineStyle(P(3), 0xffffff, 0.8); g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
        g.lineStyle(P(7), 0xaaaaff, 0.15); g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.strokePath();
        this.tweens.chain({ targets: g, tweens: [{ alpha: 1, duration: warnMs * 0.6, ease: 'Quad.Out' }, { alpha: 0, duration: warnMs * 0.4, ease: 'Quad.In', onComplete: () => g.destroy() }] });
      };
      b.onIronSlash = (bx, by, angle, dmg) => {
        if (!this.bossActive) return;
        const tx = bx + Math.cos(angle) * P(640), ty = by + Math.sin(angle) * P(640);
        this.bladeWaveAt(bx, by, tx, ty, dmg / 5, true, 3);
      };
      b.getIronTarget = () => this.randomTargetPos();
      b.onVanish = (bx, by) => {
        if (!this.bossActive) return;
        const smoke = this.add.graphics().setDepth(56);
        smoke.fillStyle(0x334466, 0.55); smoke.fillCircle(bx, by, P(22));
        this.tweens.add({ targets: smoke, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 500, ease: 'Quad.Out', onComplete: () => smoke.destroy() });
        this.tweens.add({ targets: b, alpha: 0, duration: 400, ease: 'Quad.In' });
      };
      b.onAppear = (nx, ny) => {
        if (!this.bossActive) return;
        b.setAlpha(0);
        const ring = this.add.graphics().setDepth(56);
        ring.lineStyle(P(3), 0xffffff, 1); ring.strokeCircle(nx, ny, P(12));
        this.tweens.add({ targets: ring, alpha: 0, scaleX: 4, scaleY: 4, duration: 350, ease: 'Quad.Out', onComplete: () => ring.destroy() });
        const flash = this.add.graphics().setDepth(55);
        flash.fillStyle(0xffffff, 0.65); flash.fillCircle(nx, ny, P(26));
        this.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => flash.destroy() });
        this.tweens.add({ targets: b, alpha: 1, duration: 300, ease: 'Quad.Out' });
      };
      // Orc1 callbacks
      b.onWhirlTick = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onWhirlSlash = (wx, wy, tx, ty) => {
        if (!this.bossActive) return;
        this.whirlSlashAt(wx, wy, tx, ty, 0, true, Math.round(52 * DPR), b.scaleDmg(40), 320);
      };
      b.onSummonOrc = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('orc1_s', x, y, false);
      };
      b.onFanSlash = (bx, by, angle, half, range, dmg) => {
        if (!this.bossActive) return;
        const checkFan = (tx: number, ty: number) => {
          const dx = tx - bx, dy = ty - by;
          if (Math.sqrt(dx * dx + dy * dy) > range) return false;
          return Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - angle)) <= half;
        };
        if (checkFan(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && checkFan(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };
      b.onBoulderLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onSlowZoneTick = (x, y, r) => {
        if (!this.bossActive) return;
        const d = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);
        if (d <= r) {
          this.player.speedMult = Math.min(this.player.speedMult, 0.45);
          this.time.delayedCall(200, () => { if (this.player.speedMult < 1) this.player.speedMult = 1; });
        }
      };
      b.onRoar = () => {
        if (!this.bossActive) return;
        this.player.speedMult = 0.5;
        this.player.setTint(0xff8800);
        this.time.delayedCall(3500, () => { this.player.speedMult = 1; this.player.clearTint(); });
      };
      // Orc2 callbacks
      b.onJumpLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.fireBossJumpLand(x, y, r, dmg);
      };
      b.onFissure = (bx, by, angle, len, dmg) => {
        if (!this.bossActive) return;
        this.fireBossFissureWithBranches(bx, by, angle, len, dmg);
      };
      b.onFieldFracture = (safeZones, dmg, duration, tickMs) => {
        if (!this.bossActive) return;
        this.fireBossFieldFracture(safeZones, dmg, duration, tickMs);
      };
      b.onBoulderRoll = (bx, by, angle, speed, r, dmg) => {
        if (!this.bossActive) return;
        this.fireBossRollingBoulder(bx, by, angle, speed, r, dmg);
      };
      b.setScale(b.scaleX * 1.2, b.scaleY * 1.2);
      return b;
    }
    if (bossDef.id === 'boss_vampire_legendary') {
      const b = new BossVampireLegendary(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      // V3 callbacks
      const checkArc = (cx2: number, cy2: number, r: number, aimAng: number, arcDeg: number, dmg: number) => {
        if (!this.bossActive) return;
        const half = (arcDeg / 2) * Math.PI / 180;
        const px = this.player.x, py = this.player.y;
        const dist = Phaser.Math.Distance.Between(cx2, cy2, px, py);
        if (dist < P(15) || dist > r + P(20)) return;
        const angToPlayer = Math.atan2(py - cy2, px - cx2);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(angToPlayer - aimAng));
        if (diff <= half + 0.08) this.player.takeDamage(dmg);
      };
      b.onScytheHit = checkArc; b.onScytheTrailTick = checkArc; b.onCloneScytheHit = checkArc;
      b.onBurstOrbLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, x, y) <= r) ally.takeDamage(dmg);
        }
      };
      b.onBurstOrbFly = (x, y, r, dmg) => {
        if (!this.bossActive) return false;
        let hit = false;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) { this.player.takeDamage(dmg); hit = true; }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, x, y) <= r) ally.takeDamage(dmg);
        }
        return hit;
      };
      b.onSpikeHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, x, y) <= r) this.player.takeDamage(dmg);
      };
      b.onRiverTick = (x1, y1, x2, y2, hw, dmg) => {
        if (!this.bossActive) return;
        const abx = x2 - x1, aby = y2 - y1;
        const lenSq = abx * abx + aby * aby || 1;
        const inRiver = (cx2: number, cy2: number) => {
          const raw = ((cx2 - x1) * abx + (cy2 - y1) * aby) / lenSq;
          if (raw < 0) return false;
          const t = Math.min(1, raw);
          const nx = x1 + t * abx - cx2, ny = y1 + t * aby - cy2;
          return nx * nx + ny * ny <= hw * hw;
        };
        if (inRiver(this.player.x, this.player.y)) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && inRiver(ally.x, ally.y)) ally.takeDamage(dmg);
        }
      };
      // V1 callbacks
      b.getAllTargetPositions = () => {
        const targets: [number, number][] = [[this.player.x, this.player.y]];
        if (NetworkService.connected && NetworkService.isHost) {
          this._partners.forEach(pd => {
            if (pd.sprite.active && !pd.isDead) targets.push([pd.sprite.x, pd.sprite.y]);
          });
        }
        return targets;
      };
      b.onBatHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onCrimsonNeedle = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onNeedleLand = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this._rainPuddles.push({ x, y, r, dmg, expires: this.time.now + 4000 });
      };
      b.onGazeHit = (bx, by, tx, ty, beamR, dmg) => {
        if (!this.bossActive) return;
        const abx = tx - bx, aby = ty - by;
        const len2 = abx * abx + aby * aby || 1;
        const checkTarget = (cx2: number, cy2: number, takeDmg: () => void) => {
          const apx = cx2 - bx, apy = cy2 - by;
          const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / len2));
          const nx = bx + t * abx - cx2, ny = by + t * aby - cy2;
          if (nx * nx + ny * ny <= beamR * beamR) takeDmg();
        };
        checkTarget(this.player.x, this.player.y, () => this.player.takeDamage(dmg));
        for (const ally of this._allyMinions) {
          if (!ally.isDead) checkTarget(ally.x, ally.y, () => ally.takeDamage(dmg));
        }
      };
      b.onDarkNightActivate = (zones) => {
        if (!this.bossActive) return;
        this._startDarkNight(zones);
      };
      b.onDarkNightLift = () => { this._endDarkNight(); };
      b.onDarkNightPunish = () => {
        if (!this.bossActive) return;
        const inSafe = (cx2: number, cy2: number) =>
          this._darkNightZones.some(z => Phaser.Math.Distance.Between(cx2, cy2, z.x, z.y) <= z.r);
        if (!inSafe(this.player.x, this.player.y)) this.player.takeDamage(b.scaleDmg(80));
        for (const ally of this._allyMinions) {
          if (!ally.isDead && !inSafe(ally.x, ally.y)) ally.takeDamage(b.scaleDmg(80));
        }
      };
      b.onNeedleHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      // V2 callbacks
      b.onMeteorRainHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        this.hitInRadius(x, y, r, dmg);
      };
      b.onCometRingHit = (cx2, cy2, rInner, rOuter, dmg) => {
        if (!this.bossActive) return;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx2, cy2);
        if (dist >= rInner && dist <= rOuter) this.player.takeDamage(dmg);
      };
      b.onElFireHit = (x, y, r, dmg) => { if (!this.bossActive) return; this.hitInRadius(x, y, r, dmg); };
      b.onElIceHit = (x, y, r, dmg) => { if (!this.bossActive) return; this.hitInRadius(x, y, r, dmg); };
      b.onElThunderHit = (x, y, r, dmg) => { if (!this.bossActive) return; this.hitInRadius(x, y, r, dmg); };
      b.onElVoidHit = (x, y, r, dmg) => { if (!this.bossActive) return; this.hitInRadius(x, y, r, dmg); };
      b.onLightningArcHit = (dmg) => { if (!this.bossActive) return; this.player.takeDamage(dmg); };
      b.onIceDomainStart = (iceCx, iceCy) => {
        this._v3IceDomainActive = true;
        this._v3IceDomainCX = iceCx;
        this._v3IceDomainCY = iceCy;
      };
      b.onIceDomainEnd = () => {
        this._v3IceDomainActive = false;
        this.player.speedMult = 1;
      };
      b.onTornadoHit = (dmg) => { if (!this.bossActive) return; this.player.takeDamage(dmg); };
      b.setScale(b.scaleX * 1.2, b.scaleY * 1.2);
      return b;
    }

    return new Boss(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
  }

  protected spawnMinionAt(defId: string, wx: number, wy: number, isElite: boolean, hpOverride?: number, atkOverride?: number): void {
    const def = getMonsterDef(defId);
    if (!def) return;
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const atkMult = STAR_STAT_MULT[this.questStar] ?? 1;
    const coopMult = CO_OP_HP_MULTS[this._playerCount] ?? CO_OP_HP_MULTS[2];
    const hp = hpOverride ?? Math.round(def.hp * hpMult * coopMult * (isElite ? ELITE_HP_MULT : 1));
    const atk = atkOverride ?? Math.round(def.atk * atkMult * (isElite ? 1.5 : 1));
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = Phaser.Math.FloatBetween(20, 60);
    const m = new MinionSlime(this, wx + Math.cos(a) * r, wy + Math.sin(a) * r, hp, def.spriteKey, def.tint);
    m.atk = atk;
    m.def = Math.round((def.def ?? 0) * (MINION_DEF_MULT[this.questStar] ?? 1) * (isElite ? 1.4 : 1));
    m.element = def.element;
    m.tier = isElite ? 3 : def.tier;
    if (isElite) {
      m.isElite = true;
      m.setScale(m.scaleX * ELITE_SCALE_MOD, m.scaleY * ELITE_SCALE_MOD);
      m.setTintFill(def.tint);
    }
    if (['plant1_s', 'elite_plant1'].includes(defId)) {
      m.stationary = true; m.noKnockback = true;
      m.attackMode = 'shoot'; m.rangedRange = Math.round(220 * DPR);
    } else if (['plant2_s', 'elite_plant2'].includes(defId)) {
      m.stationary = true; m.noKnockback = true;
      m.attackMode = 'spike'; m.rangedRange = Math.round(250 * DPR);
    } else if (['plant3_s', 'elite_plant3'].includes(defId)) {
      m.stationary = true; m.noKnockback = true;
      m.attackMode = 'triple'; m.rangedRange = Math.round(220 * DPR);
    }
    if (defId === 'orc1_s') { m.attackMode = 'arc_slash'; m.rangedRange = Math.round(40 * DPR); }
    if (defId === 'elite_orc1') { m.attackMode = 'whirl_slash'; }
    if (['orc2_s', 'elite_orc2'].includes(defId)) { m.attackMode = defId.startsWith('elite') ? 'ground_crack' : 'leap_slam'; m.rangedRange = Math.round(180 * DPR); }
    if (['orc3_s', 'elite_orc3'].includes(defId)) { m.attackMode = defId.startsWith('elite') ? 'triple_wave' : 'blade_wave'; m.rangedRange = Math.round(200 * DPR); }
    if (defId.startsWith('orc') || defId.startsWith('elite_orc')) m.race = 'orc';
    if (defId === 'vampire1_s') { m.attackMode = 'blood_needle'; m.rangedRange = Math.round(190 * DPR); }
    if (defId === 'elite_vampire1') { m.attackMode = 'triple_needle'; m.rangedRange = Math.round(190 * DPR); }
    if (defId === 'vampire2_s') { m.attackMode = 'meteor'; m.rangedRange = Math.round(220 * DPR); }
    if (defId === 'elite_vampire2') { m.attackMode = 'lightning_ring'; m.rangedRange = Math.round(220 * DPR); }
    if (defId === 'vampire3_s') { m.attackMode = 'blood_burst'; m.rangedRange = Math.round(90 * DPR); }
    if (defId === 'elite_vampire3') { m.attackMode = 'blood_channel'; m.rangedRange = Math.round(110 * DPR); }
    if (defId.startsWith('vampire') || defId.startsWith('elite_vampire')) { m.race = 'vampire'; m.walkAnim = 'run'; }
    if (defId.startsWith('plant') || defId.startsWith('elite_plant')) m.race = 'plant';
    m.attackCooldownMult = m.race === 'orc' ? 1.3 : m.race === 'plant' ? 1.2 : m.race === 'vampire' ? 0.85 : 1.0;
    m.setPatrolCenter(wx, wy);
    m.getTargetPos = () => this.nearestTargetPos(m.x, m.y);
    m.hasValidTarget = () => this.hasAnyValidTarget();
    m.onDead = () => {
      this.handleMinionDrop(defId, m.x, m.y);
      if (this._towerFloor > 0 && !this.bossActive) {
        const mazeKey = (m as any)._mazeRoomKey as string | undefined;
        if (mazeKey && this._mazeRooms.length > 0) {
          this._onMazeEnemyKilled(mazeKey);
        } else {
          this._towerEnemyAlive = Math.max(0, this._towerEnemyAlive - 1);
          if (this._towerEnemyCountTxt) this._towerEnemyCountTxt.setText(tr('game.tower.remaining', { n: this._towerEnemyAlive }));
          if (this._towerEnemyAlive <= 0) this.handleTowerFloorComplete();
        }
      }
    };
    m.minionId = `m${this.allMinions.length}`;
    if (this._towerFloor > 0) m.setCollideWorldBounds(true);
    this.allMinions.push(m);
    const _mwl = this._towerWalls ?? this.wallLayer;
    if (_mwl) this.physics.add.collider(m, _mwl);
    this.physics.add.overlap(m, this.player, () => {
      if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk);
    });
    this.physics.add.overlap(m, this._allyGroup, (_m, allyObj) => {
      const ally = allyObj as MinionSlime;
      if (m.isDead || !m.isDashing || ally.isDead) return;
      const now = this.time.now;
      if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
      (ally as any)._lastDashHit = now;
      ally.takeDamage(m.atk);
    });
    if (!NetworkService.connected || NetworkService.isHost) {
      m.onFire = (type, mx, my, tx, ty) => {
        this.spawnMinionAttack(type, mx, my, tx, ty, m.atk, m.isElite);
        if (NetworkService.connected)
          NetworkService.sendMinionAttack({ minionId: m.minionId, type, mx, my, tx, ty, atk: m.atk, isElite: m.isElite });
      };
      m.onBloodChannelWarn = (mx, my, tx, ty, warnMs) => {
        this.bloodChannelFloorWarn(mx, my, tx, ty, m.isElite, warnMs);
      };
      m.start();
    } else {
      m.started = true;
    }
    m.setVisible(true);
  }

  private spawnAllMonsters(): void {
    const BOSS_TO_MINION: Record<string, string> = {
      boss_slime_green: 'slime_green_s',
      boss_slime_red: 'slime_red_s',
      boss_slime_blue: 'slime_blue_s',
      boss_slime_white: 'slime_white_s',
      boss_zombie_slime: 'slime_zombie_s',
      boss_lava_slime: 'slime_lava_s',
      boss_flower_one: 'plant1_s',
      boss_flower_two: 'plant2_s',
      boss_flower_three: 'plant3_s',
      boss_orc1: 'orc1_s',
      boss_orc2: 'orc2_s',
      boss_orc3: 'orc3_s',
      boss_vampire1: 'vampire1_s',
      boss_vampire2: 'vampire2_s',
      boss_vampire3: 'vampire3_s',
    };
    const MINION_TO_ELITE: Record<string, string> = {
      slime_green_s: 'elite_slime_green',
      slime_red_s: 'elite_slime_red',
      slime_blue_s: 'elite_slime_blue',
      slime_white_s: 'elite_slime_white',
      slime_zombie_s: 'elite_slime_zombie',
      slime_lava_s: 'elite_slime_lava',
      plant1_s: 'elite_plant1',
      plant2_s: 'elite_plant2',
      plant3_s: 'elite_plant3',
      orc1_s: 'elite_orc1',
      orc2_s: 'elite_orc2',
      orc3_s: 'elite_orc3',
      vampire1_s: 'elite_vampire1',
      vampire2_s: 'elite_vampire2',
      vampire3_s: 'elite_vampire3',
    };
    const GENERAL_POOL = ['slime_green_s', 'slime_red_s', 'slime_blue_s', 'slime_white_s'];
    if (this.questStar >= 2) GENERAL_POOL.push('plant1_s', 'plant2_s', 'plant3_s');
    if (this.questStar >= 3) GENERAL_POOL.push('orc1_s', 'orc2_s', 'orc3_s');
    if (this.questStar >= 4) GENERAL_POOL.push('vampire1_s', 'vampire2_s', 'vampire3_s');

    const mainMinionId = BOSS_TO_MINION[this.bossMonsterId];
    const otherPool = GENERAL_POOL.filter(id => id !== mainMinionId);
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const atkMult = STAR_STAT_MULT[this.questStar] ?? 1;
    const coopMult = CO_OP_HP_MULTS[this._playerCount] ?? CO_OP_HP_MULTS[2];

    // 每星級數量 × 1.3^(star-1)
    const countMult = Math.pow(1.15, this.questStar - 1);

    // Seeded RNG for spawn randomness — offset from map seed so sequences differ
    const srng = new SeededRNG(this._mapSeed + 7777);

    const spawnMinion = (defId: string, wx: number, wy: number, isElite: boolean) => {
      const def = getMonsterDef(defId);
      if (!def) return;
      const hp = Math.round(def.hp * hpMult * coopMult * (isElite ? ELITE_HP_MULT : 1));
      const atk = Math.round(def.atk * atkMult * (isElite ? 1.5 : 1));
      const isPlant = defId.startsWith('plant') || defId.startsWith('elite_plant');
      const a = srng.float(0, Math.PI * 2);
      const r = isPlant ? srng.float(P(10), P(50)) : srng.float(P(20), P(120));
      const spawnX = wx + Math.cos(a) * r;
      const spawnY = wy + Math.sin(a) * r;
      const m = new MinionSlime(this, spawnX, spawnY, hp, def.spriteKey, def.tint);
      m.minionId = `m${this.allMinions.length}`;
      m.atk = atk;
      m.def = Math.round((def.def ?? 0) * (MINION_DEF_MULT[this.questStar] ?? 1) * (isElite ? 1.4 : 1));
      if (isElite) {
        m.isElite = true;
        m.dashWarnMs = Math.round(650 * 0.8);
        m.explodeRadiusMult = 1.4;
        m.setScale(m.scaleX * ELITE_SCALE_MOD, m.scaleY * ELITE_SCALE_MOD);
        m.setTintFill(def.tint);
      }
      if (['slime_red_s', 'elite_slime_red', 'slime_lava_s', 'elite_slime_lava'].includes(defId))
        m.attackMode = 'explode';
      if (['plant1_s', 'elite_plant1'].includes(defId)) {
        m.stationary = true;
        m.noKnockback = true;
        m.attackMode = 'shoot';
        m.rangedRange = Math.round(220 * DPR);
      }
      if (['plant2_s', 'elite_plant2'].includes(defId)) {
        m.stationary = true;
        m.noKnockback = true;
        m.attackMode = 'spike';
        m.rangedRange = Math.round(250 * DPR);
      }
      if (['plant3_s', 'elite_plant3'].includes(defId)) {
        m.stationary = true;
        m.noKnockback = true;
        m.attackMode = 'triple';
        m.rangedRange = Math.round(220 * DPR);
      }
      if (isPlant) m.race = 'plant';
      if (defId === 'orc1_s') { m.attackMode = 'arc_slash'; m.rangedRange = Math.round(40 * DPR); }
      if (defId === 'elite_orc1') { m.attackMode = 'whirl_slash'; }
      if (['orc2_s', 'elite_orc2'].includes(defId)) { m.attackMode = defId.startsWith('elite') ? 'ground_crack' : 'leap_slam'; m.rangedRange = Math.round(180 * DPR); }
      if (['orc3_s', 'elite_orc3'].includes(defId)) { m.attackMode = defId.startsWith('elite') ? 'triple_wave' : 'blade_wave'; m.rangedRange = Math.round(200 * DPR); }
      if (defId.startsWith('orc') || defId.startsWith('elite_orc')) m.race = 'orc';
      if (defId === 'vampire1_s') { m.attackMode = 'blood_needle'; m.rangedRange = Math.round(190 * DPR); }
      if (defId === 'elite_vampire1') { m.attackMode = 'triple_needle'; m.rangedRange = Math.round(190 * DPR); }
      if (defId === 'vampire2_s') { m.attackMode = 'meteor'; m.rangedRange = Math.round(220 * DPR); }
      if (defId === 'elite_vampire2') { m.attackMode = 'lightning_ring'; m.rangedRange = Math.round(220 * DPR); }
      if (defId === 'vampire3_s') { m.attackMode = 'blood_burst'; m.rangedRange = Math.round(90 * DPR); }
      if (defId === 'elite_vampire3') { m.attackMode = 'blood_channel'; m.rangedRange = Math.round(110 * DPR); }
      if (defId.startsWith('vampire') || defId.startsWith('elite_vampire')) { m.race = 'vampire'; m.walkAnim = 'run'; }
      m.attackCooldownMult = m.race === 'orc' ? 1.3 : m.race === 'plant' ? 1.2 : m.race === 'vampire' ? 0.85 : 1.0;
      m.setPatrolCenter(isPlant ? spawnX : wx, isPlant ? spawnY : wy);
      m.getTargetPos = () => this.nearestTargetPos(m.x, m.y);
      m.hasValidTarget = () => this.hasAnyValidTarget();
      m.onDead = () => this.handleMinionDrop(defId, m.x, m.y);
      this.allMinions.push(m);
      const _awl = this._towerWalls ?? this.wallLayer;
      if (_awl) this.physics.add.collider(m, _awl);
      this.physics.add.overlap(m, this.player, () => {
        if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk);
      });
      this.physics.add.overlap(m, this._allyGroup, (_m, allyObj) => {
        const ally = allyObj as MinionSlime;
        if (m.isDead || !m.isDashing || ally.isDead) return;
        const now = this.time.now;
        if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
        (ally as any)._lastDashHit = now;
        ally.takeDamage(m.atk);
      });
      if (!NetworkService.connected || NetworkService.isHost) {
        m.onFire = (type, mx, my, tx, ty) => {
          this.spawnMinionAttack(type, mx, my, tx, ty, m.atk, m.isElite);
          if (NetworkService.connected)
            NetworkService.sendMinionAttack({ minionId: m.minionId, type, mx, my, tx, ty, atk: m.atk, isElite: m.isElite });
        };
        m.onBloodChannelWarn = (mx, my, tx, ty, warnMs) => {
          this.bloodChannelFloorWarn(mx, my, tx, ty, m.isElite, warnMs);
        };
      }
    };

    const spawnAt = (wx: number, wy: number, waypointIdx?: number) => {
      // 花怪群聚錨點：以所在房間最小半寬的 20~80% 為半徑，避免生成在邊界外
      const rooms = waypointIdx != null ? (this.waypointRooms[waypointIdx] ?? []) : [];
      let minHalfW = P(100); // fallback for corner-point spawns
      if (rooms.length > 0) {
        minHalfW = rooms.reduce((best, r) => Math.min(best, r.w / 2, r.h / 2), Infinity);
      }
      const numClusters = srng.between(1, 2);
      const plantClusters: { x: number; y: number }[] = [];
      for (let c = 0; c < numClusters; c++) {
        const ca = srng.float(0, Math.PI * 2);
        const plantSpawnMaxOffset = P(50);
        const cr = srng.float(minHalfW * 0.20, Math.max(minHalfW * 0.20, minHalfW * 0.80 - plantSpawnMaxOffset));
        plantClusters.push({ x: wx + Math.cos(ca) * cr, y: wy + Math.sin(ca) * cr });
      }

      const baseCount = this._isTutorial ? srng.between(2, 3) : srng.between(8, 15);
      const count = this._isTutorial ? baseCount : Math.round(baseCount * countMult);
      for (let j = 0; j < count; j++) {
        const minionId = (mainMinionId && srng.float(0, 1) < 0.4)
          ? mainMinionId
          : otherPool[srng.between(0, otherPool.length - 1)];
        const eliteId = mainMinionId ? MINION_TO_ELITE[minionId] : undefined;
        const goElite = !!eliteId && srng.float(0, 1) < 0.12;
        const finalId = goElite ? eliteId! : minionId;
        const isPlantMinion = finalId.startsWith('plant') || finalId.startsWith('elite_plant');
        if (isPlantMinion) {
          const cluster = plantClusters[srng.between(0, plantClusters.length - 1)];
          spawnMinion(finalId, cluster.x, cluster.y, goElite);
        } else {
          spawnMinion(finalId, wx, wy, goElite);
        }
      }
    };

    for (let i = 1; i < this.waypoints.length - 1; i++) {
      const zBefore = this.allMinions.length;
      spawnAt(this.waypoints[i].x, this.waypoints[i].y, i);
      this._registerZone(i, this.waypoints[i].x, this.waypoints[i].y, zBefore, this.waypointRooms[i]);
    }

    for (let i = 1; i < this.cornerPts.length - 1; i++) {
      if (!this._isTutorial && srng.float(0, 1) < 0.4) {
        const c = this.cornerPts[i];
        const zBefore = this.allMinions.length;
        const zoneIdx = -(i + 1);
        spawnAt(c.x, c.y);
        this._registerZone(zoneIdx, c.x, c.y, zBefore);
      }
    }

    this._spawnCorridorChests();

    if (NetworkService.connected && NetworkService.isHost && this._chests.length > 0) {
      NetworkService.sendChestSync(this._chests.map((c, i) => ({
        id: i, zoneIdx: c.zoneIdx, x: c.x / DPR, y: c.y / DPR,
        type: c.type, big: !!c.big, unlocked: c.unlocked,
      })));
    }

    this.time.delayedCall(400, () => {
      if (!NetworkService.connected || NetworkService.isHost) {
        // Solo / host: run full AI
        for (const m of this.allMinions) m.start();
      } else {
        // Guest: mark started so visibility check works, but skip AI
        for (const m of this.allMinions) m.started = true;
      }
      // Host sends initial minion state to server for HP tracking (DPR-normalised)
      if (NetworkService.connected && NetworkService.isHost) {
        NetworkService.sendMinionSync(this.allMinions.map(m => ({
          id: m.minionId,
          x: m.x / DPR,
          y: m.y / DPR,
          hp: m.currentHp,
          maxHp: m.currentHp,
          isDead: false,
        })));
      }
    });
  }

  private setupPortal(px: number, py: number): void {
    // 地面陰影壓暗感
    const shadowGfx = this.add.graphics().setDepth(5);
    shadowGfx.fillStyle(0x000000, 0.35); shadowGfx.fillEllipse(px, py + P(5), P(116), P(28));

    // 外發光橢圓
    const outerGfx = this.add.graphics().setDepth(6);
    outerGfx.fillStyle(0x6600cc, 0.14); outerGfx.fillEllipse(px, py, P(120), P(48));
    outerGfx.fillStyle(0x8800ff, 0.22); outerGfx.fillEllipse(px, py, P(96), P(38));
    // 傳送門內腔
    outerGfx.fillStyle(0x1a0033, 0.85); outerGfx.fillEllipse(px, py, P(76), P(28));
    outerGfx.fillStyle(0xcc99ff, 0.15); outerGfx.fillEllipse(px - P(10), py - P(4), P(28), P(10));

    // 邊緣光環（呼吸 tween）
    const ringGfx = this.add.graphics().setDepth(7);
    ringGfx.lineStyle(P(4), 0xcc44ff, 1.0); ringGfx.strokeEllipse(px, py, P(76), P(28));
    ringGfx.lineStyle(P(2), 0xffffff, 0.55); ringGfx.strokeEllipse(px, py, P(76), P(28));
    this.tweens.add({ targets: ringGfx, alpha: { from: 0.45, to: 1.0 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 浮動標籤
    const label = this.add.text(px, py - P(30), '⚡ BOSS ⚡', {
      fontSize: F(15), fontStyle: 'bold', color: '#dd88ff', stroke: '#220033', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: label, y: py - P(36), alpha: { from: 0.7, to: 1.0 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 觸發區（對齊內圈橢圓 76×28）
    const zone = this.add.zone(px, py, P(58), P(20));
    this.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
    this.physics.add.overlap(this.player, zone, () => {
      if (this.bossActive) return;
      this.bossActive = true;
      this.teleporting = true;
      this.player.move(0, 0);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      zone.destroy();
      this.teleportToBossArena();
    });
  }

  // ── Tower mode methods ────────────────────────────────────────

  private buildTowerRoom(): void {
    (this as any).wallLayer = null;  // 清除前一局殘留
    const W = this.scale.width;
    const H = this.scale.height;
    if (this._towerFloor % 5 === 0) {
      this._buildTowerBossRoom(W, H);
    } else {
      this._buildTowerMaze(W, H);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  SAO-style maze system
  // ══════════════════════════════════════════════════════════════

  private _buildTowerMaze(W: number, H: number): void {
    const rng = new SeededRNG(this._towerFloor * 7919 + 1337);
    const COLS = 3, ROWS = 4;
    const RW = P(152), RH = P(118);   // room inner size
    const CL = P(72);                  // corridor length (gap between rooms)
    const CW = P(48);                  // corridor width
    const WW = P(14);                  // wall strip thickness

    // Center maze horizontally, add top/bottom margin
    const totalMazeW = COLS * RW + (COLS - 1) * CL;
    const MAR_X = Math.round((W - totalMazeW) / 2);
    const MAR_Y = P(56);
    this.worldW = W;
    this.worldH = MAR_Y * 2 + ROWS * RH + (ROWS - 1) * CL;

    // ── Build room grid ───────────────────────────────────────
    this._mazeRows = ROWS;
    this._mazeCols = COLS;
    this._mazeRooms = [];
    for (let r = 0; r < ROWS; r++) {
      this._mazeRooms[r] = [];
      for (let c = 0; c < COLS; c++) {
        const cx = MAR_X + c * (RW + CL) + Math.round(RW / 2);
        const cy = MAR_Y + r * (RH + CL) + Math.round(RH / 2);
        this._mazeRooms[r][c] = {
          row: r, col: c, cx, cy, rw: RW, rh: RH,
          connections: new Set<MazeDoorDir>(),
          type: 'normal', revealed: false, cleared: false,
          enemiesAlive: 0, doorBlockers: new Map(),
        };
      }
    }

    // ── DFS maze generation (seeded) ─────────────────────────
    const startRow = ROWS - 1, startCol = 1;  // bottom-center
    const visited: boolean[][] = Array.from({ length: ROWS }, () => new Array(COLS).fill(false));
    const dfs = (r: number, c: number): void => {
      visited[r][c] = true;
      const dirs: [number, number, MazeDoorDir, MazeDoorDir][] = [[-1, 0, 'N', 'S'], [1, 0, 'S', 'N'], [0, -1, 'W', 'E'], [0, 1, 'E', 'W']];
      for (let i = dirs.length - 1; i > 0; i--) {
        const j = rng.between(0, i);
        [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
      }
      for (const [dr, dc, dir, back] of dirs) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && !visited[nr][nc]) {
          this._mazeRooms[r][c].connections.add(dir);
          this._mazeRooms[nr][nc].connections.add(back);
          dfs(nr, nc);
        }
      }
    };
    dfs(startRow, startCol);

    // ── Assign room types ─────────────────────────────────────
    this._mazeRooms[startRow][startCol].type = 'start';
    this._mazeRooms[startRow][startCol].revealed = true;

    // Collect non-start rooms and shuffle
    const nonStart: MazeRoom[] = [];
    for (const row of this._mazeRooms) for (const room of row)
      if (room.type !== 'start') nonStart.push(room);
    for (let i = nonStart.length - 1; i > 0; i--) {
      const j = rng.between(0, i);
      [nonStart[i], nonStart[j]] = [nonStart[j], nonStart[i]];
    }
    // Assign stairs to a top-row or far room
    const stairsRoom = this._mazeRooms[0][rng.between(0, COLS - 1)];
    stairsRoom.type = 'stairs';
    let assigned = 1;
    // Heal room
    const typeBudget: MazeRoomType[] = ['heal', 'dark', 'poison', 'sealed', 'elite', 'elite'];
    for (const t of typeBudget) {
      const r = nonStart.find(rm => rm.type === 'normal' && rm !== stairsRoom);
      if (r) { r.type = t; assigned++; }
    }

    // ── Portal coords = stairs room center ────────────────────
    this._towerPortalX = stairsRoom.cx;
    this._towerPortalY = stairsRoom.cy;

    // ── Player spawn ─────────────────────────────────────────
    const start = this._mazeRooms[startRow][startCol];
    this.playerStartX = start.cx;
    this.playerStartY = start.cy + Math.round(RH / 2) - P(24);
    this._currentRoomKey = `${startRow},${startCol}`;

    // ── Draw world ───────────────────────────────────────────
    this._drawMazeWorld(COLS, ROWS, RW, RH, CL, CW, WW, MAR_X, MAR_Y);
    this._buildMazePhysics(COLS, ROWS, RW, RH, CL, CW, WW, MAR_X, MAR_Y);
    this._buildMazeFog();
    this._buildMazeStairs(stairsRoom);
    this._buildMiniMap();

    // Floor label
    this.add.text(W / 2, P(24), tr('game.tower.floor', { floor: this._towerFloor }), {
      fontSize: F(12), fontStyle: 'bold', color: '#aa88ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(5).setScrollFactor(0);

    // Portal (locked until all cleared)
    this._towerPortalGfx = this.add.graphics().setDepth(4);
    this._drawTowerPortalLocked();
  }

  // ── Draw floor tiles + wall strips for every room & corridor ──
  private _drawMazeWorld(
    COLS: number, ROWS: number, RW: number, RH: number, CL: number, CW: number, WW: number,
    MAR_X: number, MAR_Y: number,
  ): void {
    // Dark stone background (wall colour)
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x0a0a10, 1);
    bg.fillRect(0, 0, this.worldW, this.worldH);

    // Room floors and corridor floors (dungeon_floor tile)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const room = this._mazeRooms[r][c];
        // Room floor
        this.add.tileSprite(room.cx - RW / 2, room.cy - RH / 2, RW, RH, 'dungeon_floor')
          .setOrigin(0, 0).setDepth(-1);
        // Room type indicator (faint tinted overlay)
        if (room.type !== 'normal' && room.type !== 'start') {
          const tintMap: Record<string, number> = {
            elite: 0x220000, dark: 0x000022, poison: 0x002200,
            sealed: 0x1a001a, heal: 0x001a00, stairs: 0x1a1a00,
          };
          const overlay = this.add.graphics().setDepth(0);
          overlay.fillStyle(tintMap[room.type] ?? 0x111111, 0.35);
          overlay.fillRect(room.cx - RW / 2, room.cy - RH / 2, RW, RH);
        }
        // Dungeon wall border around room
        const wg = this.add.graphics().setDepth(1);
        this._drawDungeonWallRect(wg, room.cx - RW / 2 - WW, room.cy - RH / 2 - WW, WW, RH + WW * 2);
        this._drawDungeonWallRect(wg, room.cx + RW / 2, room.cy - RH / 2 - WW, WW, RH + WW * 2);
        this._drawDungeonWallRect(wg, room.cx - RW / 2 - WW, room.cy - RH / 2 - WW, RW + WW * 2, WW);
        this._drawDungeonWallRect(wg, room.cx - RW / 2 - WW, room.cy + RH / 2, RW + WW * 2, WW);

        // Room icon label
        const iconMap: Record<string, string> = {
          elite: '⚔', dark: '🌑', poison: '☠', sealed: '🔒', heal: '💊', stairs: '▲',
        };
        if (iconMap[room.type]) {
          this.add.text(room.cx, room.cy - RH / 2 + P(10), iconMap[room.type], {
            fontSize: F(10), color: '#ffffff88',
          }).setOrigin(0.5, 0).setDepth(2).setAlpha(0.6);
        }

        // Corridors (connections)
        for (const dir of room.connections) {
          if (dir === 'S') {  // draw S corridor (going down)
            const corridorX = room.cx - CW / 2;
            const corridorY = room.cy + RH / 2;
            this.add.tileSprite(corridorX, corridorY, CW, CL, 'dungeon_floor').setOrigin(0, 0).setDepth(-1);
            // Wall strips on corridor sides
            const cg = this.add.graphics().setDepth(1);
            this._drawDungeonWallRect(cg, corridorX - WW, corridorY, WW, CL);
            this._drawDungeonWallRect(cg, corridorX + CW, corridorY, WW, CL);
          }
          if (dir === 'E') {  // draw E corridor (going right)
            const corridorX = room.cx + RW / 2;
            const corridorY = room.cy - CW / 2;
            this.add.tileSprite(corridorX, corridorY, CL, CW, 'dungeon_floor').setOrigin(0, 0).setDepth(-1);
            const cg = this.add.graphics().setDepth(1);
            this._drawDungeonWallRect(cg, corridorX, corridorY - WW, CL, WW);
            this._drawDungeonWallRect(cg, corridorX, corridorY + CW, CL, WW);
          }
        }
      }
    }
  }

  private _drawDungeonWallRect(g: Phaser.GameObjects.Graphics, rx: number, ry: number, rw: number, rh: number): void {
    if (rw < 1 || rh < 1) return;
    g.fillStyle(0x0a0a10, 1); g.fillRect(rx, ry, rw, rh);
    if (rw > P(6) && rh > P(6)) {
      g.fillStyle(0x141420, 1); g.fillRect(rx + P(3), ry + P(3), rw - P(6), rh - P(6));
    }
    g.lineStyle(P(1), 0x3a3a5e, 0.5); g.strokeRect(rx, ry, rw, rh);
  }

  // ── Physics: room walls + door-blocker rects ───────────────
  private _buildMazePhysics(
    COLS: number, ROWS: number, RW: number, RH: number, CL: number, CW: number, WW: number,
    MAR_X: number, MAR_Y: number,
  ): void {
    this._towerWalls = this.physics.add.staticGroup();
    const addStatic = (rx: number, ry: number, rw: number, rh: number) => {
      if (rw < 1 || rh < 1) return;
      const r = this.add.rectangle(rx + rw / 2, ry + rh / 2, rw, rh).setVisible(false);
      this._towerWalls!.add(r);
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const room = this._mazeRooms[r][c];
        const L = room.cx - RW / 2, T = room.cy - RH / 2;
        const R2 = room.cx + RW / 2, B = room.cy + RH / 2;

        // Wall segments on each side, with gaps for connected corridors
        const hasN = room.connections.has('N');
        const hasS = room.connections.has('S');
        const hasE = room.connections.has('E');
        const hasW = room.connections.has('W');
        const half = CW / 2;

        // North wall: split into left/right with gap if connected
        if (hasN) {
          addStatic(L - WW, T - WW, room.cx - half - (L - WW), WW);
          addStatic(room.cx + half, T - WW, R2 + WW - (room.cx + half), WW);
        } else {
          addStatic(L - WW, T - WW, RW + WW * 2, WW);
        }
        // South wall
        if (hasS) {
          addStatic(L - WW, B, room.cx - half - (L - WW), WW);
          addStatic(room.cx + half, B, R2 + WW - (room.cx + half), WW);
        } else {
          addStatic(L - WW, B, RW + WW * 2, WW);
        }
        // West wall
        if (hasW) {
          addStatic(L - WW, T, WW, room.cy - half - T);
          addStatic(L - WW, room.cy + half, WW, B - (room.cy + half));
        } else {
          addStatic(L - WW, T, WW, RH);
        }
        // East wall
        if (hasE) {
          addStatic(R2, T, WW, room.cy - half - T);
          addStatic(R2, room.cy + half, WW, B - (room.cy + half));
        } else {
          addStatic(R2, T, WW, RH);
        }

        // Door blockers (removable, one per direction with corridor entrance)
        const DT = P(10);  // door blocker thickness
        const makeDoor = (dx: number, dy: number, dw: number, dh: number, dir: MazeDoorDir): void => {
          const vis = this.add.rectangle(dx + dw / 2, dy + dh / 2, dw, dh, 0x1a1a2a);
          vis.setDepth(2);
          this.physics.add.existing(vis, true);
          room.doorBlockers.set(dir, vis);
        };
        if (hasN) makeDoor(room.cx - half, T - DT, CW, DT * 2, 'N');
        if (hasS) makeDoor(room.cx - half, B - DT, CW, DT * 2, 'S');
        if (hasW) makeDoor(L - DT, room.cy - half, DT * 2, CW, 'W');
        if (hasE) makeDoor(R2 - DT, room.cy - half, DT * 2, CW, 'E');
      }
    }
  }

  // ── Fog of war: dark overlay per room, revealed on enter ───
  private _buildMazeFog(): void {
    for (const row of this._mazeRooms) {
      for (const room of row) {
        if (room.revealed) continue;
        const g = this.add.graphics().setDepth(9000);
        g.fillStyle(0x000000, 1);
        g.fillRect(room.cx - room.rw / 2 - P(16), room.cy - room.rh / 2 - P(16),
          room.rw + P(32), room.rh + P(32));
        room.fogGfx = g;
      }
    }
  }

  // ── Stairs (portal) in the designated room ────────────────
  private _buildMazeStairs(room: MazeRoom): void {
    this._stairsGfx = this.add.graphics().setDepth(3);
    this._towerPortalGfx = this._stairsGfx;  // reuse portal rendering
    this._drawTowerPortalLocked();
    // Stairs zone for collision after cleared
  }

  // ── Full-screen map overlay (opened from map button) ────────
  protected _showFullMap(): void {
    if (!this.worldW || !this.worldH || !this.waypointRooms.length) return;
    const W = this.scale.width, H = this.scale.height;
    const D = 110000;
    const PAD = P(14);
    const PW = Math.min(W - P(24), P(340));
    const PH = Math.min(H - P(80), P(460));
    const px = W / 2, py = H / 2;

    const dim = this.add.rectangle(px, py, W, H, 0x000000, 0.78)
      .setScrollFactor(0).setDepth(D).setInteractive();

    const panel = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    panel.fillStyle(0x080c18, 0.97);
    panel.fillRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(10));
    panel.lineStyle(P(2), 0x3a5a88, 0.8);
    panel.strokeRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(10));

    const title = this.add.text(px, py - PH / 2 + P(14), tr('game.hud.map'), {
      fontSize: F(14), fontStyle: 'bold', color: '#aaccff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    const closeBtn = this.add.text(px + PW / 2 - P(10), py - PH / 2 + P(12), '✕', {
      fontSize: F(14), color: '#aaaaaa', stroke: '#000', strokeThickness: 1,
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 2);

    // ── Draw map contents (boss area excluded) ───────────────
    const mapGfx = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    const mapW = PW - PAD * 2;
    const mapH = PH - P(36);
    const clipX = this.bossArenaCenter.x - this.BOSS_ARENA_RADIUS;
    const effectiveW = Math.min(this.worldW, clipX);
    const s = Math.min(mapW / effectiveW, mapH / this.worldH);
    const drawW = effectiveW * s, drawH = this.worldH * s;
    const ox = px - drawW / 2;
    const oy = py - PH / 2 + P(30) + (mapH - drawH) / 2;

    const toX = (wx: number) => ox + wx * s;
    const toY = (wy: number) => oy + wy * s;

    // Corridors (only those within clip boundary)
    const corrW = Math.max(this.CORR_HW * 2 * s, P(3));
    mapGfx.fillStyle(0x2a3a4e, 1);
    for (const seg of this.corridorSegs) {
      if (Math.min(seg.x1, seg.x2) > clipX) continue;
      if (Math.abs(seg.y1 - seg.y2) < 1) {
        const x1 = Math.min(seg.x1, seg.x2);
        const x2 = Math.min(Math.max(seg.x1, seg.x2), clipX);
        mapGfx.fillRect(toX(x1), toY(seg.y1) - corrW / 2, (x2 - x1) * s, corrW);
      } else {
        const y1 = Math.min(seg.y1, seg.y2), y2 = Math.max(seg.y1, seg.y2);
        mapGfx.fillRect(toX(seg.x1) - corrW / 2, toY(y1), corrW, (y2 - y1) * s);
      }
    }

    // Rooms (only those within clip boundary)
    mapGfx.fillStyle(0x3a4e66, 1);
    for (const rects of this.waypointRooms) {
      for (const r of rects) {
        if (r.x > clipX) continue;
        mapGfx.fillRect(toX(r.x), toY(r.y), Math.min(r.w, clipX - r.x) * s, r.h * s);
      }
    }

    // Dynamic dots — redrawn every frame
    const liveDotGfx = this.add.graphics().setScrollFactor(0).setDepth(D + 3);
    const allySet = new Set(this._allyMinions);
    const DOT_R = Math.max(P(2.5), 3);
    const DOT_MON = Math.max(P(1.5), 2);
    const DOT_OUT = Math.max(P(4), 4);
    const drawLiveDots = () => {
      liveDotGfx.clear();

      // Chests (yellow)
      liveDotGfx.fillStyle(0xffdd44, 1);
      for (const chest of this._chests) {
        if (!chest.sprite.active || chest.opening) continue;
        if (chest.x > clipX) continue;
        liveDotGfx.fillCircle(toX(chest.x), toY(chest.y), DOT_R);
      }

      // Enemy minions (red)
      liveDotGfx.fillStyle(0xff4444, 1);
      for (const m of this.allMinions) {
        if (m.isDead || allySet.has(m)) continue;
        if (m.x > clipX) continue;
        liveDotGfx.fillCircle(toX(m.x), toY(m.y), DOT_MON);
      }

      // Player (white with outline)
      liveDotGfx.fillStyle(0x000000, 0.9);
      liveDotGfx.fillCircle(toX(this.player.x), toY(this.player.y), DOT_OUT);
      liveDotGfx.fillStyle(0xffffff, 1);
      liveDotGfx.fillCircle(toX(this.player.x), toY(this.player.y), DOT_R);
    };
    drawLiveDots();
    this._mapUpdateFn = drawLiveDots;

    // Legend
    const legY = py + PH / 2 - P(10);
    const legGfx = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    legGfx.fillStyle(0xffffff, 1);  legGfx.fillCircle(px - P(80), legY, DOT_R);
    legGfx.fillStyle(0xff4444, 1);  legGfx.fillCircle(px - P(36), legY, DOT_R);
    legGfx.fillStyle(0xffdd44, 1);  legGfx.fillCircle(px + P(10), legY, DOT_R);
    const txtStyle = { fontSize: F(10), color: '#cccccc' };
    const legTxt1 = this.add.text(px - P(74), legY, tr('game.map.legendPlayer'), txtStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 2);
    const legTxt2 = this.add.text(px - P(30), legY, tr('game.map.legendEnemy'),  txtStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 2);
    const legTxt3 = this.add.text(px + P(16),  legY, tr('game.map.legendLoot'),   txtStyle).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 2);

    // Suppress camera shake while map is open
    const cam = this.cameras.main as unknown as Record<string, unknown>;
    const origShake = cam['shake'] as (...args: unknown[]) => void;
    cam['shake'] = () => {};
    this.cameras.main.shake(0, 0);

    const objs = [dim, panel, title, closeBtn, mapGfx, liveDotGfx, legGfx, legTxt1, legTxt2, legTxt3];
    const close = () => {
      this._mapUpdateFn = undefined;
      cam['shake'] = origShake;
      objs.forEach(o => o.destroy());
    };
    dim.on('pointerdown', close);
    closeBtn.setInteractive({ useHandCursor: true }).on('pointerdown', close);
  }

  // ── Tower maze mini-map (top-right HUD, scrollFactor=0) ─────
  private _buildMiniMap(): void {
    this._miniMapGfx = this.add.graphics().setScrollFactor(0).setDepth(9800);
    this._refreshMiniMap();
  }

  private _refreshMiniMap(): void {
    const g = this._miniMapGfx;
    if (!g) return;
    g.clear();
    const W = this.scale.width;
    const CELL = P(12), GAP = P(2), PAD = P(6);
    const originX = W - PAD - this._mazeCols * (CELL + GAP);
    const originY = PAD;

    // Background
    g.fillStyle(0x000000, 0.55);
    g.fillRect(originX - PAD, originY - PAD,
      this._mazeCols * (CELL + GAP) + PAD * 2,
      this._mazeRows * (CELL + GAP) + PAD * 2);

    for (const row of this._mazeRooms) {
      for (const room of row) {
        const mx = originX + room.col * (CELL + GAP);
        const my = originY + room.row * (CELL + GAP);
        const isCurrentKey = `${room.row},${room.col}` === this._currentRoomKey;
        if (!room.revealed) {
          g.fillStyle(0x333333, 1); g.fillRect(mx, my, CELL, CELL);
        } else {
          const colorMap: Record<string, number> = {
            start: 0x448844, normal: 0x444466, elite: 0x883333,
            dark: 0x222244, poison: 0x224422, sealed: 0x442244,
            heal: 0x228844, stairs: 0xaaaa44,
          };
          const col = isCurrentKey ? 0xffffff : (colorMap[room.type] ?? 0x444466);
          g.fillStyle(col, 1); g.fillRect(mx, my, CELL, CELL);
        }
        // Mini corridors
        g.fillStyle(0x555566, 0.7);
        if (room.connections.has('S') && room.row < this._mazeRows - 1) {
          g.fillRect(mx + CELL / 2 - 1, my + CELL, 2, GAP);
        }
        if (room.connections.has('E') && room.col < this._mazeCols - 1) {
          g.fillRect(mx + CELL, my + CELL / 2 - 1, GAP, 2);
        }
      }
    }
  }

  // ── Per-frame: detect room transitions ────────────────────
  private _updateMazeRoomCheck(): void {
    const px = this.player.x, py = this.player.y;
    for (const row of this._mazeRooms) {
      for (const room of row) {
        const key = `${room.row},${room.col}`;
        if (Math.abs(px - room.cx) <= room.rw / 2 && Math.abs(py - room.cy) <= room.rh / 2) {
          if (key !== this._currentRoomKey) {
            this._currentRoomKey = key;
            this._playerEnterMazeRoom(room);
          }
          return;
        }
      }
    }
  }

  // ── Player enters a room ───────────────────────────────────
  private _playerEnterMazeRoom(room: MazeRoom): void {
    // Reveal fog
    room.fogGfx?.destroy();
    room.fogGfx = undefined;
    room.revealed = true;
    this._refreshMiniMap();

    // Already cleared — nothing to lock
    if (room.cleared || room.enemiesAlive <= 0 || room.type === 'start' || room.type === 'stairs') {
      this._clearMazeRoom(room, true);
      return;
    }

    // Lock doors
    for (const [, blocker] of room.doorBlockers) {
      blocker.setVisible(true);
      (blocker.body as Phaser.Physics.Arcade.StaticBody | null)?.reset(blocker.x, blocker.y);
    }

    // Special room effects on entry
    this._deactivateMazeEffects();
    if (room.type === 'sealed') {
      this._mazeRoomSealedActive = true;
      this.player.slowMult = 0.32;
      this._flashRoomOverlay(0x8800aa, 0.18);
    } else if (room.type === 'poison') {
      const baseDmg = Math.max(1, Math.round(this.player.maxHpValue * 0.015));
      this._mazePoisonTimer = this.time.addEvent({
        delay: 800, loop: true,
        callback: () => { if (!this.gameOver) this.player.takeDamage(baseDmg); },
      });
      this._flashRoomOverlay(0x004400, 0.15);
    } else if (room.type === 'dark') {
      this._activateMazeDarkRoom(room);
    } else if (room.type === 'heal') {
      // Heal room has no enemies — auto-clear
      this.player.heal(Math.round(this.player.maxHpValue * 0.30));
      this.spawnHealText(room.cx, room.cy);
      this._clearMazeRoom(room, true);
    }
  }

  // ── Room is cleared (enemies gone) ───────────────────────
  private _clearMazeRoom(room: MazeRoom, instant = false): void {
    if (room.cleared) return;
    room.cleared = true;

    const doUnlock = () => {
      // Unlock all door blockers
      for (const [, blocker] of room.doorBlockers) {
        this.tweens.add({
          targets: blocker, alpha: 0, duration: 300,
          onComplete: () => blocker.destroy()
        });
        (blocker.body as any)?.destroy();
      }
      room.doorBlockers.clear();

      // Deactivate room effects
      this._deactivateMazeEffects();

      // Activate stairs if this is the stairs room
      if (room.type === 'stairs') {
        this._activateTowerPortal();
      }

      this._refreshMiniMap();
    };

    if (instant) doUnlock();
    else this.time.delayedCall(400, doUnlock);
  }

  private _deactivateMazeEffects(): void {
    if (this._mazeRoomSealedActive) {
      this._mazeRoomSealedActive = false;
      this.player.slowMult = 1;
    }
    this._mazePoisonTimer?.destroy();
    this._mazePoisonTimer = undefined;
    this._mazeTrapTimer?.destroy();
    this._mazeTrapTimer = undefined;
    if (this._mazeDarkRt) {
      this._mazeDarkRt.destroy();
      this._mazeDarkRt = undefined;
    }
  }

  private _flashRoomOverlay(color: number, alpha: number): void {
    const room = this._mazeRooms.flatMap(r => r).find(r => `${r.row},${r.col}` === this._currentRoomKey);
    if (!room) return;
    const g = this.add.graphics().setDepth(8);
    g.fillStyle(color, alpha);
    g.fillRect(room.cx - room.rw / 2, room.cy - room.rh / 2, room.rw, room.rh);
    this.tweens.add({ targets: g, alpha: { from: alpha, to: alpha * 0.5 }, duration: 1200, yoyo: true, repeat: -1 });
    // Store for cleanup
    (this as any)._mazeOverlayGfx = g;
  }

  // ── Dark room: RenderTexture-based light radius ────────────
  private _activateMazeDarkRoom(room: MazeRoom): void {
    // Generate soft light circle texture (once)
    if (!this.textures.exists('_maze_light')) {
      const R = P(88);
      const lg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      for (let i = P(88); i >= 0; i -= P(4)) {
        const a = 1 - i / P(88);
        lg.fillStyle(0xffffff, a);
        lg.fillCircle(R, R, i);
      }
      lg.generateTexture('_maze_light', R * 2, R * 2);
      lg.destroy();
    }
    const rt = this.add.renderTexture(0, 0, this.worldW, this.worldH);
    rt.setDepth(8500);
    rt.fill(0x000000, 220);  // ~0.86 alpha black
    this._mazeDarkRt = rt;
  }

  private _updateMazeDarkOverlay(): void {
    if (!this._mazeDarkRt) return;
    const R = P(88);
    this._mazeDarkRt.clear();
    this._mazeDarkRt.fill(0x000000, 220);
    this._mazeDarkRt.erase('_maze_light', this.player.x - R, this.player.y - R);
  }

  // ── Trap room: periodic spike damage ─────────────────────
  private _startMazeTrapRoom(room: MazeRoom): void {
    this._mazeTrapTimer = this.time.addEvent({
      delay: 1800, loop: true,
      callback: () => {
        if (this.gameOver) return;
        const pad = P(20);
        const spX = room.cx - room.rw / 2 + pad + Math.random() * (room.rw - pad * 2);
        const spY = room.cy - room.rh / 2 + pad + Math.random() * (room.rh - pad * 2);
        const g = this.add.graphics().setDepth(5);
        g.fillStyle(0xffaa00, 0.5); g.fillRect(spX - P(16), spY - P(16), P(32), P(32));
        this.time.delayedCall(600, () => {
          if (this.gameOver) { g.destroy(); return; }
          g.clear(); g.fillStyle(0xff4400, 0.9); g.fillRect(spX - P(16), spY - P(16), P(32), P(32));
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, spX, spY) < P(28))
            this.player.takeDamage(Math.round(this.player.maxHpValue * 0.06));
          this.time.delayedCall(300, () => g.destroy());
        });
      },
    });
  }

  // ── Per-room enemy kill counting ──────────────────────────
  private _onMazeEnemyKilled(roomKey: string): void {
    const [r, c] = roomKey.split(',').map(Number);
    const room = this._mazeRooms[r]?.[c];
    if (!room) return;
    room.enemiesAlive = Math.max(0, room.enemiesAlive - 1);
    this._towerEnemyAlive = Math.max(0, this._towerEnemyAlive - 1);
    if (this._towerEnemyCountTxt) this._towerEnemyCountTxt.setText(`剩餘：${this._towerEnemyAlive}`);
    if (room.enemiesAlive <= 0 && !room.cleared) this._clearMazeRoom(room);
    if (this._towerEnemyAlive <= 0) {
      // All enemies dead; stairs room becomes activatable
      const stairsRoom = this._mazeRooms.flatMap(r2 => r2).find(rm => rm.type === 'stairs');
      if (stairsRoom && !stairsRoom.cleared) this._clearMazeRoom(stairsRoom);
      this.handleTowerFloorComplete();
    }
  }

  private _buildTowerBossRoom(W: number, H: number): void {
    const WALL = P(24);
    const PORTAL_W = P(88);
    this.worldW = W;
    this.worldH = Math.round(H * 1.6);
    this.playerStartX = Math.round(W / 2);
    this.playerStartY = this.worldH - P(140);
    this._towerPortalX = Math.round(W / 2);
    this._towerPortalY = Math.round(WALL / 2);

    // Dungeon floor
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x0a0a10, 1);
    bg.fillRect(0, 0, this.worldW, this.worldH);
    bg.lineStyle(1, 0x141420, 0.5);
    for (let x = 0; x <= this.worldW; x += P(36)) bg.lineBetween(x, 0, x, this.worldH);
    for (let y = 0; y <= this.worldH; y += P(36)) bg.lineBetween(0, y, this.worldW, y);

    // Dungeon walls
    const wg = this.add.graphics().setDepth(2);
    wg.fillStyle(0x1a1a2a, 1);
    wg.fillRect(0, 0, WALL, this.worldH);
    wg.fillRect(this.worldW - WALL, 0, WALL, this.worldH);
    wg.fillRect(0, this.worldH - WALL, this.worldW, WALL);
    const gapL = Math.round((this.worldW - PORTAL_W) / 2);
    wg.fillRect(0, 0, gapL, WALL);
    wg.fillRect(gapL + PORTAL_W, 0, this.worldW - gapL - PORTAL_W, WALL);
    wg.lineStyle(P(2), 0x3a3a5e, 0.55);
    wg.strokeRect(WALL, WALL, this.worldW - WALL * 2, this.worldH - WALL * 2);
    wg.lineStyle(P(1), 0x5a5a8e, 0.25);
    wg.strokeRect(WALL + P(4), WALL + P(4), this.worldW - WALL * 2 - P(8), this.worldH - WALL * 2 - P(8));

    const label = this._towerFloor === 51 ? tr('game.floor51.title') : tr('game.tower.floor', { floor: this._towerFloor });
    this.add.text(W / 2, P(28), label, {
      fontSize: F(12), fontStyle: 'bold', color: '#aa88ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(5).setScrollFactor(0);

    this._towerPortalGfx = this.add.graphics().setDepth(3);
    this._drawTowerPortalLocked();
  }

  private _buildTowerCorridor(W: number, H: number): void {
    const rng = new SeededRNG(this._towerFloor * 9371 + 2718);
    const CW = P(128);  // corridor width
    const WW = P(24);   // wall thickness

    this.worldW = W;
    this.worldH = Math.round(H * 2.8);  // tall enough for camera to center player throughout

    // Y layout (bottom → top)
    const PAD = P(90);
    const CW2 = CW;      // horizontal-turn height = corridor width
    const avail = this.worldH - PAD * 2 - CW2 * 2;
    const SH = Math.round(avail / 3);   // each vertical segment height

    const y_bot = this.worldH - PAD;
    const y_t1_bot = y_bot - SH;
    const y_t1_top = y_t1_bot - CW2;
    const y_t2_bot = y_t1_top - SH;
    const y_t2_top = y_t2_bot - CW2;
    const y_top = y_t2_top - SH;

    // True Z-shape: seg1 center → side → opposite side
    const MARGIN = CW / 2 + P(18);
    const x1 = Math.round(W / 2);
    const goLeft = rng.between(0, 1) === 0;
    const x2 = goLeft ? Math.round(MARGIN) : Math.round(W - MARGIN);
    const x3 = goLeft ? Math.round(W - MARGIN) : Math.round(MARGIN);  // opposite of x2

    // Player spawn & portal
    this.playerStartX = x1;
    this.playerStartY = Math.round(y_bot - P(60));
    this._towerPortalX = x3;
    this._towerPortalY = y_top + Math.round(CW / 2);

    // Corridor rects for enemy spawning (inset from walls)
    const INS = WW + P(10);
    this._towerCorridorRects = [
      { x: x1 - CW / 2 + INS, y: y_t1_bot + INS, w: CW - INS * 2, h: y_bot - y_t1_bot - INS * 2 },
      { x: INS, y: y_t1_top + INS, w: W - INS * 2, h: CW2 - INS * 2 },
      { x: x2 - CW / 2 + INS, y: y_t2_bot + INS, w: CW - INS * 2, h: y_t1_top - y_t2_bot - INS * 2 },
      { x: INS, y: y_t2_top + INS, w: W - INS * 2, h: CW2 - INS * 2 },
      { x: x3 - CW / 2 + INS, y: y_top + INS, w: CW - INS * 2, h: y_t2_top - y_top - INS * 2 },
    ];

    // ── Dark stone background (outside corridors) ─────────────
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x0a0a10, 1);
    bg.fillRect(0, 0, this.worldW, this.worldH);

    // ── Dungeon floor tiles ───────────────────────────────────
    const floorSections: [number, number, number, number][] = [
      [x1 - CW / 2, y_t1_bot, CW, y_bot - y_t1_bot + PAD],
      [0, y_t1_top, W, CW2],
      [x2 - CW / 2, y_t2_bot, CW, y_t1_top - y_t2_bot],
      [0, y_t2_top, W, CW2],
      [x3 - CW / 2, y_top, CW, y_t2_top - y_top + P(24)],
    ];
    for (const [rx, ry, rw, rh] of floorSections) {
      if (rw < 1 || rh < 1) continue;
      this.add.tileSprite(rx, ry, rw, rh, 'dungeon_floor').setOrigin(0, 0).setDepth(-1);
    }

    // ── Dungeon wall look (layered dark stone strips) ─────────
    const wg = this.add.graphics().setDepth(1);

    const drawWallRect = (rx: number, ry: number, rw: number, rh: number) => {
      if (rw < 1 || rh < 1) return;
      wg.fillStyle(0x0a0a10, 1); wg.fillRect(rx, ry, rw, rh);
      wg.fillStyle(0x141420, 1); wg.fillRect(rx + P(3), ry + P(3), rw - P(6), rh - P(6));
      wg.fillStyle(0x1e1e2e, 0.6); wg.fillRect(rx + P(6), ry + P(6), rw - P(12), rh - P(12));
      wg.lineStyle(P(1), 0x3a3a5e, 0.55); wg.strokeRect(rx, ry, rw, rh);
      wg.lineStyle(P(1), 0x5a5a8e, 0.20); wg.strokeRect(rx + P(3), ry + P(3), rw - P(6), rh - P(6));
    };

    // Horizontal wall strips at each turn junction (with gap for the corridor)
    const hWall = (ry: number, gapX: number) => {
      const lw = Math.max(0, gapX - CW / 2);
      const rw = Math.max(0, W - gapX - CW / 2);
      if (lw > 0) drawWallRect(0, ry - WW, lw, WW * 2);
      if (rw > 0) drawWallRect(gapX + CW / 2, ry - WW, rw, WW * 2);
    };
    hWall(y_t1_bot, x1);
    hWall(y_t1_top, x2);
    hWall(y_t2_bot, x2);
    hWall(y_t2_top, x3);

    // Vertical wall strips on each segment's sides
    const vWall = (cx: number, yTop: number, yBot: number) => {
      drawWallRect(cx - CW / 2 - WW, yTop, WW, yBot - yTop);
      drawWallRect(cx + CW / 2, yTop, WW, yBot - yTop);
    };
    vWall(x1, y_t1_bot, y_bot + PAD);
    vWall(x2, y_t2_bot, y_t1_top);
    vWall(x3, y_top, y_t2_top);

    // ── Corner arrows (navigation hints) ─────────────────────
    const arrow = (ax: number, ay: number, dir: 'up' | 'left' | 'right') => {
      const ag = this.add.graphics().setDepth(2);
      ag.fillStyle(0x8866cc, 0.65);
      const S = P(14);
      if (dir === 'up') ag.fillTriangle(ax, ay - S, ax - S, ay + S, ax + S, ay + S);
      if (dir === 'left') ag.fillTriangle(ax - S, ay, ax + S, ay - S, ax + S, ay + S);
      if (dir === 'right') ag.fillTriangle(ax + S, ay, ax - S, ay - S, ax - S, ay + S);
      this.tweens.add({ targets: ag, alpha: { from: 0.25, to: 0.75 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut' });
    };
    arrow(x1, y_t1_bot + P(20), 'up');
    arrow(goLeft ? x1 - P(32) : x1 + P(32), Math.round((y_t1_bot + y_t1_top) / 2), goLeft ? 'left' : 'right');
    arrow(x2, y_t2_bot + P(20), 'up');
    arrow(goLeft ? x2 + P(32) : x2 - P(32), Math.round((y_t2_bot + y_t2_top) / 2), goLeft ? 'right' : 'left');

    // ── Physics walls (StaticGroup) ───────────────────────────
    this._towerWalls = this.physics.add.staticGroup();
    const addWall = (rx: number, ry: number, rw: number, rh: number) => {
      if (rw < 1 || rh < 1) return;
      const r = this.add.rectangle(rx + rw / 2, ry + rh / 2, rw, rh);
      r.setVisible(false);
      this._towerWalls!.add(r);
    };

    const hBar = (ry: number, gapX: number) => {
      const lw = Math.max(0, gapX - CW / 2);
      const rw2 = Math.max(0, W - gapX - CW / 2);
      addWall(0, ry - WW, lw, WW * 2);
      addWall(gapX + CW / 2, ry - WW, rw2, WW * 2);
    };
    hBar(y_t1_bot, x1);
    hBar(y_t1_top, x2);
    hBar(y_t2_bot, x2);
    hBar(y_t2_top, x3);

    const vBar = (cx: number, yTop: number, yBot: number) => {
      addWall(cx - CW / 2 - WW, yTop, WW, yBot - yTop);
      addWall(cx + CW / 2, yTop, WW, yBot - yTop);
    };
    vBar(x1, y_t1_bot, y_bot + PAD);
    vBar(x2, y_t2_bot, y_t1_top);
    vBar(x3, y_top, y_t2_top);

    // ── Floor label & locked portal ───────────────────────────
    this.add.text(W / 2, P(28), tr('game.tower.floor', { floor: this._towerFloor }), {
      fontSize: F(12), fontStyle: 'bold', color: '#aa88ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0.5).setDepth(5).setScrollFactor(0);

    this._towerPortalGfx = this.add.graphics().setDepth(3);
    this._drawTowerPortalLocked();
  }

  protected _drawTowerPortalLocked(): void {
    if (!this._towerPortalGfx) return;
    const px = this._towerPortalX;
    const py = this._towerPortalY;
    const pw = P(72); const ph = P(26);
    this._towerPortalGfx.clear();
    this._towerPortalGfx.fillStyle(0x330055, 0.22);
    this._towerPortalGfx.fillEllipse(px, py, pw * 1.35, ph * 1.6);
    this._towerPortalGfx.fillStyle(0x1a0033, 0.65);
    this._towerPortalGfx.fillEllipse(px, py, pw, ph);
    this._towerPortalGfx.lineStyle(P(2), 0x660099, 0.45);
    this._towerPortalGfx.strokeEllipse(px, py, pw, ph);
  }

  protected readonly TOWER_SLIMES = ['boss_slime_green', 'boss_slime_red', 'boss_slime_blue', 'boss_slime_white', 'boss_zombie_slime', 'boss_lava_slime'];
  protected readonly TOWER_FLOWERS = ['boss_flower_one', 'boss_flower_two', 'boss_flower_three'];
  protected readonly TOWER_ORCS = ['boss_orc1', 'boss_orc2', 'boss_orc3'];
  protected readonly TOWER_VAMPIRES = ['boss_vampire1', 'boss_vampire2', 'boss_vampire3'];

  protected readonly TOWER_MINION_SLIMES = ['slime_green_s', 'slime_red_s', 'slime_blue_s', 'slime_white_s', 'slime_zombie_s', 'slime_lava_s'];
  protected readonly TOWER_MINION_FLOWERS = ['plant1_s', 'plant2_s', 'plant3_s'];
  protected readonly TOWER_MINION_ORCS = ['orc1_s', 'orc2_s', 'orc3_s'];
  protected readonly TOWER_MINION_VAMPIRES = ['vampire1_s', 'vampire2_s', 'vampire3_s'];

  protected _towerPick(arr: string[]): string { return arr[Math.floor(Math.random() * arr.length)]; }
  protected _towerElitePick(pool: string[]): string {
    const eliteMap: Record<string, string> = {
      slime_green_s: 'elite_slime_green', slime_red_s: 'elite_slime_red', slime_blue_s: 'elite_slime_blue',
      slime_white_s: 'elite_slime_white', slime_zombie_s: 'elite_slime_zombie', slime_lava_s: 'elite_slime_lava',
      plant1_s: 'elite_plant1', plant2_s: 'elite_plant2', plant3_s: 'elite_plant3',
      orc1_s: 'elite_orc1', orc2_s: 'elite_orc2', orc3_s: 'elite_orc3',
      vampire1_s: 'elite_vampire1', vampire2_s: 'elite_vampire2', vampire3_s: 'elite_vampire3',
    };
    const base = this._towerPick(pool);
    return eliteMap[base] ?? base;
  }

  protected _towerMinionPool(floor: number): string[] {
    if (floor <= 4) return this.TOWER_MINION_SLIMES;
    else if (floor <= 9) return this.TOWER_MINION_FLOWERS;
    else if (floor <= 14) return this.TOWER_MINION_ORCS;
    else if (floor <= 19) return this.TOWER_MINION_VAMPIRES;
    else if (floor <= 24) return [...this.TOWER_MINION_SLIMES, ...this.TOWER_MINION_FLOWERS];
    else if (floor <= 29) return this.TOWER_MINION_FLOWERS;
    else if (floor <= 34) return [...this.TOWER_MINION_ORCS, ...this.TOWER_MINION_FLOWERS];
    else if (floor <= 39) return this.TOWER_MINION_ORCS;
    else if (floor <= 44) return [...this.TOWER_MINION_ORCS, ...this.TOWER_MINION_VAMPIRES];
    else return this.TOWER_MINION_VAMPIRES;
  }

  private spawnTowerFloor(): void {
    const f = this._towerFloor;
    const WALL = P(20);
    const towerHpMult = 16 + (f - 1) * (16 / 49);
    const towerAtkMult = STAR_STAT_MULT[5] * (1.0 + (f - 1) * (0.6 / 49));

    const isBossFloor = f % 5 === 0;
    if (isBossFloor) {
      this._spawnTowerBossFloor(f, towerHpMult, towerAtkMult);
    } else {
      // Regular floor: spawn enemies distributed across corridor sections
      const pool = this._towerMinionPool(f);
      this._towerEnemyAlive = 0;
      // Maze mode: spawn enemies per room, tagged with room key
      for (let row = 0; row < this._mazeRows; row++) {
        for (let col = 0; col < this._mazeCols; col++) {
          const room = this._mazeRooms[row]?.[col];
          if (!room || room.type === 'start' || room.type === 'heal' || room.type === 'stairs') continue;
          const isElite = room.type === 'elite';
          const perRoom = isElite ? 2 : (4 + Math.min(f - 1, 6));
          room.enemiesAlive = 0;
          for (let i = 0; i < perRoom; i++) {
            const defId = isElite ? this._towerElitePick(pool) : this._towerPick(pool);
            const def = getMonsterDef(defId);
            if (!def) continue;
            const hp = Math.round(def.hp * towerHpMult);
            const atk = Math.round(def.atk * towerAtkMult);
            const pad = P(28);
            const ex = room.cx - room.rw / 2 + pad + Math.random() * (room.rw - pad * 2);
            const ey = room.cy - room.rh / 2 + pad + Math.random() * (room.rh - pad * 2);
            const before = this.allMinions.length;
            this.spawnMinionAt(defId, ex, ey, false, hp, atk);
            const m = this.allMinions.length > before ? this.allMinions[this.allMinions.length - 1] : null;
            if (m) { (m as any)._mazeRoomKey = `${row},${col}`; room.enemiesAlive++; }
          }
          this._towerEnemyAlive += room.enemiesAlive;
        }
      }
      this._towerShowEnemyCounter();
    }
  }

  private _towerEnemyCountTxt?: Phaser.GameObjects.Text;

  protected _towerShowEnemyCounter(): void {
    if (this._towerEnemyCountTxt) this._towerEnemyCountTxt.destroy();
    this._towerEnemyCountTxt = this.add.text(P(8), P(8), tr('game.tower.remaining', { n: this._towerEnemyAlive }), {
      fontSize: F(13), fontStyle: 'bold', color: '#ffcc88', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(9790);
  }

  protected _spawnTowerBossFloor(f: number, hpMult: number, atkMult: number): void {
    this.bossActive = true;
    this._towerEnemyAlive = 0;
    const CX = this.worldW / 2;
    const CY = this.worldH * 0.30;

    let id1: string, id2: string | null = null;
    if (f === 5) { id1 = this._towerPick(this.TOWER_SLIMES); }
    else if (f === 10) { id1 = this._towerPick(this.TOWER_FLOWERS); }
    else if (f === 15) { id1 = this._towerPick(this.TOWER_ORCS); }
    else if (f === 20) { id1 = this._towerPick(this.TOWER_VAMPIRES); }
    else if (f === 25) { id1 = this._towerPick(this.TOWER_SLIMES); id2 = this._towerPick(this.TOWER_FLOWERS); }
    else if (f === 30) { id1 = this._towerPick(this.TOWER_FLOWERS); id2 = this._towerPick(this.TOWER_FLOWERS); }
    else if (f === 35) { id1 = this._towerPick(this.TOWER_ORCS); id2 = this._towerPick(this.TOWER_FLOWERS); }
    else if (f === 40) { id1 = this._towerPick(this.TOWER_ORCS); id2 = this._towerPick(this.TOWER_ORCS); }
    else if (f === 45) { id1 = this._towerPick(this.TOWER_ORCS); id2 = this._towerPick(this.TOWER_VAMPIRES); }
    else if (f === 50) { id1 = this._towerPick(this.TOWER_VAMPIRES); id2 = this._towerPick(this.TOWER_VAMPIRES); }
    else { id1 = 'boss_vampire3'; }   // floor 51

    const bx1 = id2 ? Math.round(CX - P(80)) : CX;
    this.boss = this._createTowerBoss(id1, bx1, CY, hpMult, atkMult);
    this.boss.onDead = () => this.handleBossDefeated();

    if (id2) {
      const bx2 = Math.round(CX + P(80));
      this._towerBoss2 = this._createTowerBoss(id2, bx2, CY, hpMult, atkMult);
      this._towerBoss2.onDead = () => this.handleBossDefeated();
      const bg2 = this.physics.add.group();
      bg2.add(this._towerBoss2, false);
      (this._towerBoss2.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
      this.physics.add.overlap(bg2, this.player, () => {
        if (!this.bossActive || !this._towerBoss2) return;
        if (this._towerBoss2.currentState === 'DASHING') this.player.takeDamage(this._towerBoss2.scaleDmg(75));
      });
    }

    this.bossHpGfx.setVisible(true);
    this.bossHpLabel.setVisible(true);
    this.bossDebuffGfx.setVisible(true);
    this.refreshBossBar();
    this.time.delayedCall(400, () => {
      this.boss.start();
      this._towerBoss2?.start();
    });
  }

  protected _createTowerBoss(id: string, x: number, y: number, hpMult: number, atkMult: number): Boss {
    const def = getMonsterDef(id)!;
    const hp = Math.round(def.hp * hpMult);
    const b = this.createBoss(def, hp);
    b.def = Math.round((def.def ?? 0) * STAR_DEF_MULT[5]);
    def.fillTint ? b.setTintFill(def.tint) : b.setTint(def.tint);
    b.setPosition(x, y).setVisible(true);
    (b.body as Phaser.Physics.Arcade.Body).enable = true;
    (b.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    b.getTargetPos = () => this.nearestTargetPos(b.x, b.y);
    b.hasValidTarget = () => this.hasAnyValidTarget();
    b.onHpChanged = () => this.refreshBossBar();
    b.onAoeExplode = (bx, by) => {
      if (!this.bossActive) return;
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x: bx, y: by }, this.player);
      if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(b.scaleDmg(75));
      this.damageAlliesNear(bx, by, Boss.AOE_RADIUS, b.scaleDmg(75));
    };
    b.onRangedBarrageTrailTick = (x1, y1, x2, y2, radius, dmg) => {
      if (!this.bossActive) return;
      const abx = x2 - x1, aby = y2 - y1;
      const apx = this.player.x - x1, apy = this.player.y - y1;
      const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / (abx * abx + aby * aby || 1)));
      const nx = x1 + t * abx - this.player.x, ny = y1 + t * aby - this.player.y;
      if (nx * nx + ny * ny <= radius * radius) this.player.takeDamage(dmg);
    };
    b.onBarrageOrbHit = (x, y, dmg) => {
      if (!this.bossActive) return;
      this.player.takeDamage(dmg);
      this.damageAlliesNear(x, y, P(20), dmg);
    };
    // scale atk via questStar proxy (we set questStar=5 baseline then override scaleDmg)
    b.questStar = 5;
    // apply additional atkMult scaling relative to star5 baseline
    const atkRatio = atkMult / (STAR_STAT_MULT[5]);
    (b as any)._towerAtkRatio = atkRatio;  // used by overridden scaleDmg if needed
    const origScaleDmg = b.scaleDmg.bind(b);
    b.scaleDmg = (base: number) => Math.round(origScaleDmg(base) * atkRatio);
    const bg = this.physics.add.group();
    bg.add(b, false);
    this.physics.add.overlap(bg, this.player, () => {
      if (!this.bossActive) return;
      if (b.currentState === 'DASHING') this.player.takeDamage(b.scaleDmg(75));
    });
    this.physics.add.overlap(bg, this._allyGroup, (_b, allyObj) => {
      if (!this.bossActive) return;
      const ally = allyObj as MinionSlime;
      if (b.currentState !== 'DASHING' || ally.isDead) return;
      ally.takeDamage(b.scaleDmg(75));
    });
    return b;
  }

  protected handleTowerFloorComplete(): void {
    if (this.gameOver) return;
    TowerStore.recordFloor(this._towerFloor);
    SaveStore.save();

    // Key drop on floor 50
    if (this._towerFloor === 50) {
      const dropChance = 0.40;
      if (Math.random() < dropChance) {
        TowerStore.addKey();
        SaveStore.save();
        const W = this.scale.width, H = this.scale.height;
        const msg = this.add.text(W / 2, H * 0.35, tr('game.tower.key'), {
          fontSize: F(18), fontStyle: 'bold', color: '#ffd84d', stroke: '#442200', strokeThickness: 3,
        }).setOrigin(0.5).setScrollFactor(0).setDepth(9700);
        this.tweens.add({ targets: msg, alpha: 0, delay: 2500, duration: 800, onComplete: () => msg.destroy() });
      }
    }

    this._activateTowerPortal();
  }

  protected _activateTowerPortal(): void {
    const px = this._towerPortalX;
    const py = this._towerPortalY;
    const pw = P(72); const ph = P(26);

    if (this._towerPortalGfx) { this._towerPortalGfx.clear(); this._towerPortalGfx.destroy(); }
    const pg = this.add.graphics().setDepth(4);
    pg.fillStyle(0x6600cc, 0.18); pg.fillEllipse(px, py, pw * 1.35, ph * 1.6);
    pg.fillStyle(0x9900ff, 0.30); pg.fillEllipse(px, py, pw, ph);
    pg.fillStyle(0x1a0033, 0.80); pg.fillEllipse(px, py, pw * 0.65, ph * 0.65);
    const ringG = this.add.graphics().setDepth(5);
    ringG.lineStyle(P(3), 0xcc44ff, 1.0); ringG.strokeEllipse(px, py, pw, ph);
    this.tweens.add({ targets: ringG, alpha: { from: 0.4, to: 1.0 }, duration: 700, yoyo: true, repeat: -1 });

    const portalLabel = this._towerFloor === 51
      ? tr('ui.back')
      : this._towerFloor === 50 && TowerStore.hasKey()
        ? tr('game.floor51.enter')
        : tr('game.tower.nextFloor', { floor: this._towerFloor + 1 });
    const lbl = this.add.text(px, py - ph, portalLabel, {
      fontSize: F(11), fontStyle: 'bold', color: '#dd88ff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(6);
    this.tweens.add({ targets: lbl, y: { from: py - ph, to: py - ph - P(6) }, alpha: { from: 0.7, to: 1 }, duration: 900, yoyo: true, repeat: -1 });

    this._towerPortalHit = this.add.zone(px, py, pw, ph);
    this.physics.world.enable(this._towerPortalHit, Phaser.Physics.Arcade.STATIC_BODY);
    this.physics.add.overlap(this.player, this._towerPortalHit, () => this._enterTowerPortal());

    const W2 = this.scale.width, H2 = this.scale.height;
    const msg = this.add.text(W2 / 2, H2 * 0.42, tr('game.clear.portal'), {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9700);
    if (this._towerFloor === 50) msg.setText(tr('game.clear.floor51'));
    if (this._towerFloor === 51) msg.setText(tr('game.hud.finalBoss'));
    this.tweens.add({ targets: msg, alpha: 0, delay: 2800, duration: 800, onComplete: () => msg.destroy() });
  }

  protected _enterTowerPortal(): void {
    if (this.gameOver || this.teleporting) return;
    this.teleporting = true;
    this._towerPortalHit?.destroy();
    this._towerPortalHit = undefined;
    const nextFloor = this._towerFloor === 50 && TowerStore.hasKey()
      ? 51
      : this._towerFloor >= 51
        ? 0
        : this._towerFloor + 1;
    if (nextFloor === 0) { this.exitToLobby(); return; }
    if (this._towerFloor === 50 && nextFloor === 51) TowerStore.useKey();
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.restart({ towerFloor: nextFloor });
    });
  }

  private teleportToBossArena(): void {
    const destX = this.bossArenaCenter.x;
    const destY = this.bossArenaCenter.y + this.BOSS_ARENA_RADIUS * 0.72;
    const origScale = this.player.scaleX;

    this.cameras.main.fadeOut(360, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.player.setPosition(destX, destY).setVisible(false);
      this.cameras.main.fadeIn(460, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        AudioService.playBgm(this, 'sfx_boss_bgm', 0.5);
        this.playTeleportIn(destX, destY, origScale, () => { this.teleporting = false; });
        this.boss.setVisible(true).setAlpha(1);
        (this.boss.body as Phaser.Physics.Arcade.Body).enable = true;
        this.bossHpGfx.setVisible(true);
        this.bossHpLabel.setVisible(true);
        this.bossDebuffGfx.setVisible(true);
        this.refreshBossBar();
        this.time.delayedCall(300, () => {
          this.boss.start();
          this.playSfx('sfx_boss_roar');
          if (NetworkService.connected && NetworkService.isHost) {
            this.boss.onSyncState = (data) => NetworkService.sendBossSync(data);
            this.time.addEvent({
              delay: 100, loop: true,
              callback: () => {
                if (!this.boss.active || !this.bossActive) return;
                NetworkService.sendBossSync({ state: 'POS', x: this.boss.x / DPR, y: this.boss.y / DPR });
              },
            });
          }
        });
      });
    });
  }

  // 入場：能量環由外往內聚合，玩家從光中現身（縮小 50%）
  private playTeleportIn(cx: number, cy: number, origScale: number, onComplete?: () => void): void {
    const D = 62;

    // 玩家從縮小狀態長回來
    this.player.setVisible(true).setScale(0).setAlpha(0);
    this.tweens.add({
      targets: this.player,
      scaleX: origScale, scaleY: origScale, alpha: 1,
      delay: 310, duration: 480,
      ease: 'Back.Out',
    });

    // 主動畫 (0→1, 940ms)
    const gfx = this.add.graphics().setDepth(D);
    const c = { t: 0 };
    this.tweens.add({
      targets: c, t: 1, duration: 940, ease: 'Linear',
      onUpdate: () => {
        const t = c.t;
        gfx.clear();

        // 開場白光閃
        if (t < 0.20) {
          const ft = 1 - t / 0.20;
          gfx.fillStyle(0xffffff, ft * 0.96);
          gfx.fillCircle(cx, cy, ft * 15);
          gfx.fillStyle(0xdd88ff, ft * 0.72);
          gfx.fillCircle(cx, cy, ft * 10);
        }

        // 三層光圈由外往內收縮（0→0.74）
        const convEnd = 0.74;
        if (t <= convEnd) {
          const ct = t / convEnd;
          const rAlpha = ct < 0.82 ? 1 : 1 - (ct - 0.82) / 0.18;
          const rings = [
            { maxR: 50, lw: 2.5, color: 0xffffff },
            { maxR: 36, lw: 1.8, color: 0xdd77ff },
            { maxR: 62, lw: 1.2, color: 0x9933ff },
          ];
          for (const ring of rings) {
            const r = ring.maxR * (1 - ct) + 4;
            gfx.lineStyle(ring.lw, ring.color, rAlpha);
            gfx.strokeCircle(cx, cy, r);
          }
          // 地面暈光
          gfx.fillStyle(0x6600ff, (1 - ct) * 0.20);
          gfx.fillCircle(cx, cy, 42 * (1 - ct) + 6);
          gfx.fillStyle(0xaa55ff, (1 - ct) * 0.28);
          gfx.fillCircle(cx, cy, 25 * (1 - ct) + 5);
        }

        // 旋入光點（0.06→0.82）
        const sT = Math.max(t - 0.06, 0) / 0.76;
        const sA = sT < 1 ? sT * (1 - sT * sT) : 0;
        if (sA > 0.04) {
          const rot = -t * Math.PI * 3.8;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + rot;
            const r = (1 - sT) * 28 + 4;
            gfx.fillStyle(i % 2 === 0 ? 0xffffff : 0xdd88ff, sA * 0.92);
            gfx.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2);
          }
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 - rot * 0.55;
            const r = (1 - sT) * 39 + 3;
            gfx.fillStyle(0xcc44ff, sA * 0.55);
            gfx.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5);
          }
        }

        // 落地後的餘韻光圈（0.70→1.0）
        if (t > 0.70) {
          const st = (t - 0.70) / 0.30;
          const ga = (1 - st) * 0.32;
          gfx.fillStyle(0x8833ff, ga * 0.22);
          gfx.fillCircle(cx, cy, 15 + st * 8);
          gfx.lineStyle(1.5, 0xdd88ff, ga);
          gfx.strokeCircle(cx, cy, 11 + st * 5);
        }
      },
      onComplete: () => { gfx.destroy(); onComplete?.(); },
    });

    // 到達時的外散粒子
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const dist = Phaser.Math.Between(10, 28);
      const col = ([0xffffff, 0xdd77ff, 0x9933ff, 0xcc44ff] as number[])[i % 4];
      const p = this.add.graphics().setDepth(D + 1).setPosition(cx, cy);
      p.fillStyle(col, 1); p.fillCircle(0, 0, Phaser.Math.Between(1, 2));
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        delay: Phaser.Math.Between(0, 90),
        duration: Phaser.Math.Between(320, 600),
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private isInBossArena(px: number, py: number, margin = 0): boolean {
    const dx = px - this.bossArenaCenter.x;
    const dy = py - this.bossArenaCenter.y;
    const R = this.BOSS_ARENA_RADIUS + margin;
    switch (this.bossArenaShape) {
      case 0: return dx * dx + dy * dy <= R * R;
      case 1: { const hs = R * 0.875; return Math.abs(dx) <= hs && Math.abs(dy) <= hs && Math.abs(dx) + Math.abs(dy) <= hs * 1.5; }
      case 2: return Math.abs(dx) + Math.abs(dy) <= R;
      case 3: { const hw = P(380) + margin, hh = P(300) + margin, cr = P(100) + margin; const ex = Math.max(Math.abs(dx) - (hw - cr), 0); const ey = Math.max(Math.abs(dy) - (hh - cr), 0); return ex * ex + ey * ey <= cr * cr; }
      default: return dx * dx + dy * dy <= R * R;
    }
  }

  // 多邊形輪廓點（shape 1-3 使用；0 用 circle API）
  private buildArenaBoundary(): { x: number; y: number }[] {
    const cx = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    const R = this.BOSS_ARENA_RADIUS;
    if (this.bossArenaShape === 1) {          // 八角形
      const hs = R * 0.875;
      return [
        { x: cx + hs, y: cy + hs * 0.5 },
        { x: cx + hs * 0.5, y: cy + hs },
        { x: cx - hs * 0.5, y: cy + hs },
        { x: cx - hs, y: cy + hs * 0.5 },
        { x: cx - hs, y: cy - hs * 0.5 },
        { x: cx - hs * 0.5, y: cy - hs },
        { x: cx + hs * 0.5, y: cy - hs },
        { x: cx + hs, y: cy - hs * 0.5 },
      ];
    }
    if (this.bossArenaShape === 2) {          // 菱形
      return [
        { x: cx + R, y: cy },
        { x: cx, y: cy + R },
        { x: cx - R, y: cy },
        { x: cx, y: cy - R },
      ];
    }
    if (this.bossArenaShape === 3) {          // 圓角矩形
      const hw = P(380), hh = P(300), cr = P(100), segs = 10;
      const pts: { x: number; y: number }[] = [];
      for (const [ox, oy, a0] of [
        [cx + hw - cr, cy + hh - cr, 0],
        [cx - hw + cr, cy + hh - cr, Math.PI / 2],
        [cx - hw + cr, cy - hh + cr, Math.PI],
        [cx + hw - cr, cy - hh + cr, Math.PI * 1.5],
      ] as [number, number, number][]) {
        for (let i = 0; i <= segs; i++) {
          const a = a0 + (i / segs) * Math.PI / 2;
          pts.push({ x: ox + Math.cos(a) * cr, y: oy + Math.sin(a) * cr });
        }
      }
      return pts;
    }
    return [];
  }

  private drawBossArena(): void {
    const cx = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    const R = this.BOSS_ARENA_RADIUS;
    const pts = this.buildArenaBoundary();
    const isCircle = this.bossArenaShape === 0;

    const fillShape = (g: Phaser.GameObjects.Graphics) => isCircle ? g.fillCircle(cx, cy, R) : g.fillPoints(pts, true);
    const strokeShape = (g: Phaser.GameObjects.Graphics) => isCircle ? g.strokeCircle(cx, cy, R) : g.strokePoints(pts, true);


    // 石板地板 + 遮罩
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    fillShape(maskGfx);
    const arenaMask = maskGfx.createGeometryMask();
    // Stone floor — same integer-tile approach as grass to avoid sub-pixel gaps.
    {
      const SZ = P(64), sw = Math.ceil(R * 2.2), sh = Math.ceil(R * 2.2);
      if (!this.textures.exists('stone_tile')) {
        const canvas = document.createElement('canvas');
        canvas.width = SZ; canvas.height = SZ;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage((this.textures.get('stone').source[0] as any).image, 0, 0, SZ, SZ);
        this.textures.addCanvas('stone_tile', canvas);
      }
      const scols = Math.ceil(sw / SZ) + 1, srows = Math.ceil(sh / SZ) + 1;
      const sMap = this.make.tilemap({ tileWidth: SZ, tileHeight: SZ, width: scols, height: srows });
      const sLayer = sMap.createBlankLayer('stone_bg', sMap.addTilesetImage('stone_tile', 'stone_tile', SZ, SZ, 0, 0)!, cx - sw / 2, cy - sh / 2)!;
      sMap.fill(0, 0, 0, scols, srows, false, 'stone_bg');
      sLayer.setDepth(0.1).setMask(arenaMask);
    }

    // AO 邊緣暗化
    const aoGfx = this.add.graphics().setDepth(0.4).setMask(arenaMask);
    if (isCircle) {
      aoGfx.lineStyle(P(70), 0x000000, 0.30); aoGfx.strokeCircle(cx, cy, R - P(35));
    } else {
      aoGfx.lineStyle(P(90), 0x000000, 0.28); strokeShape(aoGfx);
    }

    // 裝飾魔法陣
    const decoGfx = this.add.graphics().setDepth(1.0);

    // 外圈輪廓（依形狀）
    decoGfx.lineStyle(P(2), 0x880099, 0.35);
    if (isCircle) {
      decoGfx.strokeCircle(cx, cy, R * 0.80);
    } else {
      // 縮小 75% 的輪廓
      const innerPts = pts.map(p => ({ x: cx + (p.x - cx) * 0.75, y: cy + (p.y - cy) * 0.75 }));
      decoGfx.strokePoints(innerPts, true);
    }
    decoGfx.lineStyle(P(1), 0x660077, 0.22);
    decoGfx.strokeCircle(cx, cy, Math.min(R * 0.55, P(240)));

    // 中央儀式圈
    decoGfx.fillStyle(0x1a0025, 0.55); decoGfx.fillCircle(cx, cy, P(85));
    decoGfx.lineStyle(P(3), 0xcc0077, 0.65); decoGfx.strokeCircle(cx, cy, P(85));
    decoGfx.lineStyle(P(1), 0xcc0077, 0.30); decoGfx.strokeCircle(cx, cy, P(58));

    // 射線（對稱軸數量配合形狀）
    const rayCount = [8, 8, 4, 8][this.bossArenaShape];
    decoGfx.lineStyle(P(1), 0x880066, 0.22);
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI * 2;
      decoGfx.lineBetween(cx, cy, cx + Math.cos(a) * P(85), cy + Math.sin(a) * P(85));
    }

    // 符文點（沿內輪廓擺放）
    decoGfx.fillStyle(0xdd44ff, 0.55);
    const dotCount = [4, 8, 4, 4][this.bossArenaShape];
    const dotOffset = [Math.PI / 4, 0, 0, Math.PI / 4][this.bossArenaShape];
    const dotR = Math.min(R * 0.62, P(260));
    for (let i = 0; i < dotCount; i++) {
      const a = (i / dotCount) * Math.PI * 2 + dotOffset;
      decoGfx.fillCircle(cx + Math.cos(a) * dotR, cy + Math.sin(a) * dotR, P(7));
    }
  }

  protected refreshBossBar(): void {
    const W = this.scale.width;
    const bw = W * 0.60;
    const bx = (W - bw) / 2;
    const by = P(20);
    const bh = P(6);

    this.bossHpGfx.clear();
    // 底板（名稱 + 血條同一排）
    this.bossHpGfx.fillStyle(0x220000, 0.80);
    this.bossHpGfx.fillRect(bx - P(4), by - P(2), bw + P(8), bh + P(4));

    const pct = this.boss.currentHp / this.boss.maxHpValue;
    const color = pct > 0.5 ? 0xcc2200 : pct > 0.25 ? 0xff4400 : 0xff0000;
    this.bossHpGfx.fillStyle(color);
    this.bossHpGfx.fillRect(bx, by, bw * pct, bh);
    this.bossHpGfx.lineStyle(1.5, 0xff4400, 0.7);
    this.bossHpGfx.strokeRect(bx, by, bw, bh);

    const elemName = ELEMENT_NAMES[this.boss.element];
    const elemColor = ELEMENT_COLORS[this.boss.element];
    const elemTag = this.boss.element !== 'none' ? ` [${elemName}]` : '';
    if (this.boss.element !== 'none') {
      this.bossHpGfx.fillStyle(elemColor, 0.9);
      this.bossHpGfx.fillRect(bx - P(4), by - P(2), P(4), bh + P(4));
    }
    this.bossHpLabel.setText(`${getMonsterDef(this.bossMonsterId)?.name ?? '???'}${elemTag}  ${this.boss.currentHp}/${this.boss.maxHpValue}`);
    this.bossHpLabel.setPosition(W / 2, by - P(14));

    this.drawBossDebuffIcons(by + bh + P(10));
  }

  private drawBossDebuffIcons(iconY: number): void {
    this.bossDebuffGfx.clear();
    const { width: W } = this.scale;
    const now = this.time.now;
    let slot = 0;

    if (this.boss.burnStacks > 0 && now < this.boss.burnExpiresAt) {
      const cx = W / 2 - P(100) + slot * P(20);
      this.drawBossDebuffIcon(cx, iconY, 'burn', 0xff4400, 0x220800);
      this.updateBossDebuffText('burn', cx, iconY, `${this.boss.burnStacks}`);
      slot++;
    } else {
      this.hideBossDebuffText('burn');
    }
  }

  private drawBossDebuffIcon(cx: number, cy: number, key: string, rimColor: number, bgColor: number): void {
    const r = P(8);
    this.bossDebuffGfx.fillStyle(rimColor, 0.3);
    this.bossDebuffGfx.fillCircle(cx, cy, r + 2);
    this.bossDebuffGfx.fillStyle(bgColor, 0.92);
    this.bossDebuffGfx.fillCircle(cx, cy, r);
    this.bossDebuffGfx.lineStyle(1.5, rimColor, 0.9);
    this.bossDebuffGfx.strokeCircle(cx, cy, r);
    if (key === 'burn') {
      const s = r * 0.55;
      const t = this.time.now / 220;
      const w = Math.sin(t) * 0.5;
      this.bossDebuffGfx.fillStyle(0xff6600, 1);
      this.bossDebuffGfx.fillTriangle(cx - s + w, cy + s, cx + s + w, cy + s, cx, cy - s * 1.3);
      this.bossDebuffGfx.fillStyle(0xffdd00, 1);
      this.bossDebuffGfx.fillTriangle(cx - s * 0.45, cy + s * 0.4, cx + s * 0.45, cy + s * 0.4, cx, cy - s * 1.1);
    }
  }

  private updateBossDebuffText(key: string, cx: number, cy: number, label: string): void {
    const txt = this.bossDebuffTexts.get(key);
    if (!txt) return;
    txt.setPosition(cx, cy + P(6)).setText(label).setVisible(true);
  }

  private hideBossDebuffText(key: string): void {
    this.bossDebuffTexts.get(key)?.setVisible(false);
  }

  private spawnDamageNumber(x: number, y: number, dmg: number, isCrit: boolean, elemMult: number): void {
    const ox = Phaser.Math.Between(-P(14), P(14));
    const fontSize = isCrit ? F(20) : F(16);
    const color = isCrit ? '#ff8800' : '#ffffff';
    const stroke = isCrit ? '#4a1800' : '#000000';

    const label = this.add.text(x + ox, y - P(24), `${dmg}`, {
      fontSize, fontStyle: 'bold',
      color, stroke, strokeThickness: isCrit ? 4 : 3,
    }).setOrigin(0.5, 1).setDepth(300).setScale(0);

    const peakScale = isCrit ? 1.3 : 1.1;
    const floatH = isCrit ? P(60) : P(42);
    const arcX = Phaser.Math.Between(-P(18), P(18));
    const dur = isCrit ? 950 : 750;

    // 彈出
    this.tweens.add({
      targets: label,
      scale: peakScale,
      duration: isCrit ? 120 : 90,
      ease: 'Back.easeOut',
      onComplete: () => {
        // 縮回正常大小 + 飄上去帶弧度
        this.tweens.add({
          targets: label,
          scale: isCrit ? 1.0 : 0.85,
          x: label.x + arcX,
          y: label.y - floatH,
          alpha: 0,
          duration: dur,
          ease: 'Cubic.easeOut',
          onComplete: () => label.destroy(),
        });
      },
    });
  }

  private triggerHitShake(weight: number): void {
    // weight: 普通命中 +1，爆擊 +2。公式可在此調整。
    const intensity = Math.min(0.006 + (weight - 2) * 0.0015, 0.015);
    this.cameras.main.shake(55, intensity);
  }

  private spawnHealText(x: number, y: number): void {
    const label = this.add.text(x, y - P(20), tr('game.buff.heal'), {
      fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#003300', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(300);
    this.tweens.add({
      targets: label, y: label.y - P(36), alpha: 0, duration: 1400, ease: 'Sine.Out',
      onComplete: () => label.destroy()
    });
  }

  protected spawnEvadeText(x: number, y: number): void {
    const label = this.add.text(x, y - P(24), tr('stat.evasion'), {
      fontSize: F(16), fontStyle: 'bold',
      color: '#aaddff', stroke: '#001133', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(300);
    this.tweens.add({
      targets: label,
      y: label.y - P(36), alpha: 0,
      duration: 700, ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }


  // ── Game-end handlers ─────────────────────────────────

  protected handleBossDefeated(): void {
    this.playSfx('sfx_boss_death');
    DailyQuestStore.addProgress('kill_boss', 1, this.bossMonsterId);
    if (!this._dqDeathThisBattle) DailyQuestStore.addProgress('clear_no_death', 1);
    if (!this._dqPotionThisBattle) DailyQuestStore.addProgress('clear_no_potion', 1);
    this._dqDeathThisBattle = false;
    this._dqPotionThisBattle = false;
    // Tower mode: wait for both bosses to die before completing floor
    if (this._towerFloor > 0) {
      const boss1Dead = !this.boss?.active;
      const boss2Dead = !this._towerBoss2 || !this._towerBoss2.active;
      if (!boss1Dead || !boss2Dead) return;  // other boss still alive
      this.bossActive = false;
      this._endDarkNight();
      this._clearAllSkillVfx();
      // Fade out boss bar
      [this.bossHpGfx, this.bossHpLabel, this.bossDebuffGfx].forEach(t => {
        if (t?.active) this.tweens.add({
          targets: t, alpha: 0, delay: 300, duration: 600,
          onComplete: () => { if (t.active) t.setVisible(false).setAlpha(1); }
        });
      });
      // Normal drops from boss still occur via existing onDead chain
      const expGain = Phaser.Math.Between(25, 50);
      const levelsGained = PlayerStore.addExp(expGain);
      if (levelsGained > 0) this.showLevelUp(PlayerStore.getLevel());
      this.time.delayedCall(600, () => this.handleTowerFloorComplete());
      return;
    }

    if (!this.bossActive) return;
    this.bossActive = false;
    this._endDarkNight();
    this._clearAllSkillVfx();
    // Fade out boss HP bar UI
    const barTargets = [
      this.bossHpGfx, this.bossHpLabel, this.bossDebuffGfx,
      ...this.bossDebuffTexts.values(),
    ];
    this.tweens.add({
      targets: barTargets, alpha: 0, delay: 350, duration: 700, ease: 'Quad.In',
      onComplete: () => barTargets.forEach(t => { if (t.active) t.setVisible(false).setAlpha(1); }),
    });

    // Quest completion
    const questCompleted = QuestStore.completeQuestByBoss(this.bossMonsterId);

    // Loot drops on the ground
    const bossDef = getMonsterDef(this.bossMonsterId);
    if (bossDef) {
      const dropMult = STAR_DROP_MULT[this.questStar] ?? 1;
      const { id: hpId, name: hpName } = getHealthPotionForStar(this.questStar);
      const bossPotionDrops: import('../data/monster-data').DropEntry[] = [
        { itemId: hpId, itemName: hpName, rate: 0.30, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_REVIVE, itemName: tr('item.potion_revive'), rate: 0.05, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_ATK, itemName: tr('item.potion_atk'), rate: 0.15, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_DEF, itemName: tr('item.potion_def'), rate: 0.15, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_SPEED, itemName: tr('item.potion_speed'), rate: 0.15, qtyMin: 1, qtyMax: 1 },
      ];
      const bossBreakthroughDrops = this.questStar >= 4
        ? [{ itemId: ITEM_STONE_BREAKTHROUGH, itemName: tr('item.stone_breakthrough'), rate: this.questStar >= 5 ? 0.20 : 0.10, qtyMin: 1, qtyMax: 1 }]
        : [];
      const scaledDrops = [...bossDef.drops, ...bossPotionDrops, ...bossBreakthroughDrops].map(d => ({ ...d, rate: Math.min(1, d.rate * dropMult) }));
      this.spawnLoot(this.boss.x, this.boss.y, scaledDrops, true);
      const _bossPS = CardStore.getTotalStats();
      const bossDropBonus = 1 + (_bossPS.dropRatePct ?? 0);
      const bossRarityBonusVal = _bossPS.rarityBonus ?? 0;
      for (const card of bossDef.cards) {
        if (Math.random() < card.rate * bossDropBonus) this.spawnCardDrop(this.boss.x, this.boss.y, card.cardId, true);
      }
      const bossIQ = Math.pow(1.50, this.questStar - 1);
      const bossQualW = getDropQualityWeights('boss', this.questStar);
      let bossDropCount = 4;
      const bossBonusChance = 0.30 * bossIQ * bossDropBonus;
      for (let i = 0; i < 6; i++) {
        if (Math.random() < bossBonusChance) bossDropCount++;
      }
      for (let i = 0; i < bossDropCount; i++) {
        const slot = EQUIP_ALL_SLOTS[Math.floor(Math.random() * EQUIP_ALL_SLOTS.length)];
        this.spawnEquipDrop(this.boss.x, this.boss.y, generateEquipment(slot, randomQuality(bossQualW, bossRarityBonusVal)), true);
      }

      // Ticket drop: 5-star boss has 100% chance (testing) to drop series ticket
      if (this.questStar === 5) {
        const ticket = BOSS_TICKET_MAP[this.bossMonsterId];
        if (ticket && Math.random() < 0.10) {
          this._spawnBurstItem(this.boss.x, this.boss.y, ticket.itemId, ticket.itemName);
        }
      }

      // Legendary weapon drop: 35% chance from legendary bosses
      if (this._legendaryMode) {
        const weaponId = LEGENDARY_BOSS_WEAPON[this.bossMonsterId];
        if (weaponId && Math.random() < 0.35) {
          this.spawnEquipDrop(this.boss.x, this.boss.y, generateLegendaryWeapon(weaponId), true);
        }
      }
    }

    // Exp (no gold — gold comes from quest claim)
    const expGain = Phaser.Math.Between(25, 50);
    const bossLevelsGained = PlayerStore.addExp(expGain);
    if (bossLevelsGained > 0) this.showLevelUp(PlayerStore.getLevel());
    SaveStore.save();

    // Floating victory message
    const W = this.scale.width;
    const line1 = questCompleted ? tr('game.hud.questDone') : tr('game.hud.bossKill');
    const msg = this.add.text(W / 2, P(54), line1, {
      fontSize: F(15), color: '#ffe066', stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5);
    this.tweens.add({
      targets: msg, alpha: 0, delay: 3000, duration: 800,
      onComplete: () => msg.destroy(),
    });

    const completedQ = QuestStore.getQuests().find(q => q.bossId === this.bossMonsterId && q.status === 'completed');
    this.completedQuestId = completedQ?.id;

    if (NetworkService.connected && NetworkService.isHost && completedQ) {
      NetworkService.sendRewardSync({
        isEquipReward: completedQ.isEquipReward,
        gold: completedQ.reward,
        star: this.questStar,
      });
    }

    this.activateRewardButton();
  }

  protected handlePlayerDead(): void {
    this._dqDeathThisBattle = true;
    this.playSfx('sfx_player_dead');
    this.player.off(Phaser.Animations.Events.ANIMATION_COMPLETE);
    this._endDarkNight();
    if (this._reviveDialogActive) return;  // 視窗已開啟，忽略重複呼叫
    const stats = CardStore.getTotalStats();
    if (this._freeRevivesUsed < (stats.freeRevive ?? 0)) {
      this.showFreeReviveDialog();
      return;
    }
    this.gameOver = true;
    this.player.setActive(false);
    this.player.stop();
    this.player.setTexture('player_death_shadow', 6);
    // 玩家死亡 → 所有友軍花朵立即死亡
    for (const ally of [...this._allyMinions]) {
      if (!ally.isDead) ally.takeDamage(999999);
    }

    if (this._isTutorial) {
      this.time.delayedCall(2000, () => this.scene.restart(this._tutorialInitData));
      return;
    }

    if (this._towerFloor > 0) {
      // Tower: save best floor, then return to PrepScene after delay
      TowerStore.recordFloor(this._towerFloor - 1);
      SaveStore.save();
      const W = this.scale.width, H = this.scale.height;
      const msg = this.add.text(W / 2, H * 0.38, tr('game.tower.death', { floor: this._towerFloor, best: TowerStore.getBestFloor() }), {
        fontSize: F(16), fontStyle: 'bold', color: '#ff6666', stroke: '#000', strokeThickness: 3,
        align: 'center',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(9700);
      this.time.delayedCall(3000, () => {
        msg.destroy();
        this.exitToLobby();
      });
      return;
    }

    if (NetworkService.connected) NetworkService.sendPlayerDead();
  }

  // ── Exit button ───────────────────────────────────────

  protected createExitButton(): void {
    const W = this.scale.width;
    const bw = P(72), bh = P(28), pad = P(8);
    const bx = W - P(46) - bw;
    const by = pad;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    const g = this.add.graphics().setScrollFactor(0).setDepth(9800);
    g.fillStyle(0x3a1010, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, P(6));
    g.lineStyle(P(2), 0xaa2222, 1);
    g.strokeRoundedRect(bx, by, bw, bh, P(6));
    this.exitBtnGfx = g;

    this.exitBtnTxt = this.add.text(cx, cy, tr('game.hud.quit'), {
      fontSize: F(15), fontStyle: 'bold', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9801);

    if (this._isTutorial) {
      this.exitBtnGfx.setVisible(false);
      this.exitBtnTxt.setVisible(false);
    }

    this.exitBtnHit = this.add.rectangle(cx, cy, bw, bh)
      .setScrollFactor(0).setDepth(9802).setInteractive({ useHandCursor: true });
    if (this._isTutorial) this.exitBtnHit.disableInteractive();
    this.exitBtnHit.on('pointerdown', () => {
      if (NetworkService.connected) {
        NetworkService.sendPartyExit();
        this.time.delayedCall(150, () => this.exitToLobby());
      } else {
        this.exitToLobby();
      }
    });

    // ── 地圖按鈕（左上角）──
    const lbw = bw;
    const lbx = pad;
    const lcx = lbx + lbw / 2;
    const lg = this.add.graphics().setScrollFactor(0).setDepth(9800);
    lg.fillStyle(0x08101e, 0.95);
    lg.fillRoundedRect(lbx, by, lbw, bh, P(6));
    lg.lineStyle(P(2), 0x4488cc, 0.75);
    lg.strokeRoundedRect(lbx, by, lbw, bh, P(6));
    this.add.text(lcx, cy, tr('game.hud.map'), {
      fontSize: F(15), fontStyle: 'bold', color: '#90c8ff', stroke: '#00081a', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9801);
    this._lootBadge = undefined;
    this.add.rectangle(lcx, cy, lbw, bh)
      .setScrollFactor(0).setDepth(9803).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this._showFullMap());

    // ── 設定漢堡按鈕（右上角）──
    const SET_S = P(36);
    const SET_X = W - SET_S - P(4), SET_Y = P(4);
    const sg = this.add.graphics().setScrollFactor(0).setDepth(9804);
    sg.fillStyle(0x000000, 0.5);
    sg.fillRoundedRect(SET_X + P(2), SET_Y + P(2), SET_S, SET_S, P(8));
    sg.fillStyle(0x1a1008, 0.92);
    sg.fillRoundedRect(SET_X, SET_Y, SET_S, SET_S, P(8));
    sg.fillStyle(0xffffff, 0.04);
    sg.fillRoundedRect(SET_X + P(1), SET_Y + P(1), SET_S - P(2), SET_S * 0.45,
      { tl: P(7), tr: P(7), bl: 0, br: 0 });
    sg.lineStyle(1.5, 0xd4a050, 0.4);
    sg.strokeRoundedRect(SET_X, SET_Y, SET_S, SET_S, P(8));
    this.add.text(SET_X + SET_S / 2, SET_Y + SET_S / 2 + P(1), '≡', {
      fontSize: F(20), color: '#d4a050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9805);
    this.add.rectangle(SET_X + SET_S / 2, SET_Y + SET_S / 2, SET_S, SET_S)
      .setScrollFactor(0).setDepth(9806).setAlpha(0.001)
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => {
        AudioService.suppressClickSfx();
        this._showGameSettingsPanel(this.scale.width, this.scale.height);
      });
  }

  protected showLootPanel(): void {
    const W = this.scale.width, H = this.scale.height;
    const PW = Math.min(P(340), W - P(20));
    const PH = Math.min(P(480), H - P(20));
    const D = 9900;
    const px = W / 2, py = H / 2;

    const hitAreas: Phaser.GameObjects.Rectangle[] = [];
    const closeAll = () => { overlay.destroy(); pop.destroy(); hitAreas.forEach(h => h.destroy()); };

    // Overlay 獨立於 container，避免吃掉 container 內的事件
    const overlay = this.add.rectangle(px, py, W, H, 0x000000, 0.55)
      .setScrollFactor(0).setDepth(D).setInteractive()
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const dx = Math.abs(pointer.x - px);
        const dy = Math.abs(pointer.y - py);
        if (dx > PW / 2 || dy > PH / 2) closeAll();
      });

    const pop = this.add.container(0, 0).setScrollFactor(0).setDepth(D + 1);

    const bg = this.add.graphics();
    bg.fillStyle(0x1a0e04, 0.97);
    bg.fillRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(10));
    bg.lineStyle(P(1.5), 0x886633, 0.8);
    bg.strokeRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(10));
    pop.add(bg);

    pop.add(this.add.text(px, py - PH / 2 + P(20), tr('game.loot.title'), {
      fontSize: F(17), fontStyle: 'bold', color: '#e8c870', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    // 叉叉：用 Rectangle hit area 加大可點擊範圍
    const closeX = px + PW / 2 - P(14);
    const closeY = py - PH / 2 + P(16);
    pop.add(this.add.text(closeX, closeY, '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5));
    this.add.rectangle(closeX, closeY, P(40), P(40))
      .setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true })
      .on('pointerdown', closeAll);

    const HEADER_H = P(44);
    const BOTTOM_PAD = P(20);
    const listTop = py - PH / 2 + HEADER_H;
    const listH = PH - HEADER_H - BOTTOM_PAD;

    // Grid layout constants
    const COLS = 4;
    const GAP = P(6);
    const CELL_PAD = P(10);
    const CELL_SZ = Math.floor((PW - CELL_PAD * 2 - GAP * (COLS - 1)) / COLS);
    const gridStartX = px - PW / 2 + CELL_PAD;
    const ROWS = Math.max(1, Math.ceil(this._sessionLoot.length / COLS));
    const contentH = ROWS * (CELL_SZ + GAP) - GAP;

    let scrollY = 0;
    const maxScroll = Math.max(0, contentH - listH);

    const maskGfx = this.add.graphics().setScrollFactor(0);
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(px - PW / 2, listTop, PW, listH);
    const mask = maskGfx.createGeometryMask();
    pop.once(Phaser.GameObjects.Events.DESTROY, () => maskGfx.destroy());

    const scroll = this.add.container(0, listTop).setScrollFactor(0).setMask(mask);
    pop.add(scroll);

    if (this._sessionLoot.length === 0) {
      scroll.add(this.add.text(px, listH / 2, tr('game.loot.empty'), {
        fontSize: F(14), color: '#886644', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));
    }

    this._sessionLoot.forEach((entry, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const cx = gridStartX + col * (CELL_SZ + GAP);
      const cy = row * (CELL_SZ + GAP);

      let iconKey = '';
      let qualityColor: number | undefined;
      let badge: string | undefined;

      if (entry.type === 'item') {
        iconKey = `icon_${entry.itemId}`;
        if (entry.qty > 1) badge = `×${entry.qty}`;
      } else if (entry.type === 'card') {
        iconKey = 'icon_card';
      } else {
        iconKey = entry.equip.texture;
        qualityColor = QUALITY_COLORS[entry.equip.quality] ?? 0xffffff;
      }

      drawItemCell(this, scroll, cx, cy, CELL_SZ, {
        iconKey, qualityColor, badge,
        label: entry.itemName,
      });
    });

    // Single hit area covering the whole grid — click detection via math
    const gridHit = this.add.rectangle(px, listTop + listH / 2, PW, listH)
      .setScrollFactor(0).setDepth(D + 1)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const relX = pointer.x - gridStartX;
        const relY = pointer.y - listTop + scrollY;
        if (relX < 0 || relY < 0) return;
        const col = Math.floor(relX / (CELL_SZ + GAP));
        const row = Math.floor(relY / (CELL_SZ + GAP));
        if (col < 0 || col >= COLS) return;
        const idx = row * COLS + col;
        if (idx >= 0 && idx < this._sessionLoot.length) {
          this.showLootDetail(this._sessionLoot[idx]);
        }
      });
    hitAreas.push(gridHit);

    // Scroll
    const onWheel = (_p: any, _g: any, _dx: any, dy: number) => {
      if (!pop.active) return;
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy * 0.6));
      scroll.y = listTop - scrollY;
    };
    this.input.on('wheel', onWheel);
    pop.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('wheel', onWheel);
      if (overlay.active) overlay.destroy();
    });
  }

  private showLootDetail(entry: SessionLootEntry): void {
    const W = this.scale.width, H = this.scale.height;
    const PW = P(300), D = 9950;
    const px = W / 2, py = H / 2;

    // Build lines first so PH is known before creating objects
    const lines: { text: string; color: string; size: number; bold: boolean }[] = [];

    if (entry.type === 'item') {
      lines.push({ text: entry.itemName, color: '#e8c870', size: 16, bold: true });
      lines.push({ text: tr('game.loot.itemQty', { n: entry.qty }), color: '#aaaaaa', size: 13, bold: false });
      const desc = ITEM_DESCS[entry.itemId] ?? '';
      if (desc) lines.push({ text: desc, color: '#ccaa66', size: 13, bold: false });
    } else if (entry.type === 'card') {
      const cardDef = getCardDef(entry.cardId);
      lines.push({ text: entry.itemName, color: '#88ccff', size: 16, bold: true });
      if (cardDef) {
        lines.push({ text: cardDef.desc, color: '#ccaa66', size: 13, bold: false });
      }
    } else {
      const eq = entry.equip;
      const qColor = `#${(QUALITY_COLORS[eq.quality] ?? 0xffffff).toString(16).padStart(6, '0')}`;
      lines.push({ text: `${QUALITY_NAMES[eq.quality]}${SLOT_NAMES[eq.slot]}`, color: qColor, size: 16, bold: true });
      if (eq.enhancement > 0) lines.push({ text: tr('prep.equip.enhancedN', { n: eq.enhancement }), color: '#88ff88', size: 13, bold: false });
      const stats = getItemStats(eq);
      for (const [k, v] of Object.entries(stats)) {
        if (v === undefined) continue;
        const label = (STAT_NAMES as Record<string, string>)[k] ?? k;
        const val = (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : (v * 100).toFixed(2) + '%');
        lines.push({ text: `${label} ${val}`, color: '#ccddbb', size: 13, bold: false });
      }
    }

    const PH = P(32) + lines.length * P(24) + P(20);

    // All standalone (not in container) so Phaser depth-based input ordering works correctly
    const objs: Phaser.GameObjects.GameObject[] = [];
    const closeDet = () => objs.forEach(o => o.destroy());

    // Full-screen overlay — standalone at D so it beats hitAreas at 9901
    objs.push(
      this.add.rectangle(px, py, W, H, 0x000000, 0.45)
        .setScrollFactor(0).setDepth(D).setInteractive()
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { closeDet(); ev?.stopPropagation?.(); })
    );

    // Panel background
    const bg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    bg.fillStyle(0x120800, 0.98);
    bg.fillRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(8));
    bg.lineStyle(P(1.5), 0xaa7733, 0.9);
    bg.strokeRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(8));
    objs.push(bg);

    // ✕ 關閉按鈕
    const closeX = px + PW / 2 - P(14);
    const closeY = py - PH / 2 + P(14);
    objs.push(
      this.add.text(closeX, closeY, '✕', {
        fontSize: F(16), fontStyle: 'bold', color: '#cc4444', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2)
    );
    objs.push(
      this.add.rectangle(closeX, closeY, P(40), P(40))
        .setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true })
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => { closeDet(); ev?.stopPropagation?.(); })
    );

    // Content lines
    lines.forEach((l, i) => {
      objs.push(
        this.add.text(px, py - PH / 2 + P(16) + i * P(24), l.text, {
          fontSize: F(l.size), fontStyle: l.bold ? 'bold' : 'normal',
          color: l.color, stroke: '#1a0800', strokeThickness: 1,
          wordWrap: { width: PW - P(24) },
        }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 1)
      );
    });
  }

  private activateRewardButton(): void {
    const W = this.scale.width;
    const bw = P(88), bh = P(28), pad = P(8);
    const bx = W - P(46) - bw;
    const by = pad;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    this.exitBtnGfx.setVisible(true).clear();
    this.exitBtnGfx.fillStyle(0x3a2a00, 0.95);
    this.exitBtnGfx.fillRoundedRect(bx, by, bw, bh, P(6));
    this.exitBtnGfx.lineStyle(P(2), 0xddaa00, 1);
    this.exitBtnGfx.strokeRoundedRect(bx, by, bw, bh, P(6));

    this.exitBtnTxt.setVisible(true).setText(tr('prep.quest.claim')).setColor('#ffe066').setPosition(cx, cy);
    this.exitBtnHit.setSize(bw, bh).setPosition(cx, cy);
    this.exitBtnHit.setInteractive({ useHandCursor: true });
    this.exitBtnHit.removeAllListeners('pointerdown');

    if (this._isTutorial) {
      this.exitBtnHit.on('pointerdown', () => {
        InventoryStore.addGold(1000);
        SaveStore.save();
        this.exitToLobby();
      });
    } else {
      this.exitBtnHit.on('pointerdown', () => this.showRewardPanel());
    }

    this.exitBlinkTween?.stop();
    this.exitBlinkTween = this.tweens.add({
      targets: [this.exitBtnGfx, this.exitBtnTxt],
      alpha: { from: 0.45, to: 1.0 },
      duration: 450,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private _showGameSettingsPanel(W: number, H: number): void {
    const D = 9850;
    const PW = Math.min(W - P(16), P(300));
    const PH = P(335);
    const px = (W - PW) / 2;
    const py = (H - PH) / 2;

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

    addTxt(tr('prep.settings.title'), px + PW / 2, py + P(10), {
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
    const rows: { key: string; get: () => number; set: (v: number) => void }[] = [
      { key: tr('prep.settings.bgm'), get: () => AudioService.bgmVolume, set: v => AudioService.setBgmVolume(v) },
      { key: tr('prep.settings.sfx'), get: () => AudioService.sfxVolume, set: v => AudioService.setSfxVolume(v) },
    ];

    rows.forEach((row, i) => {
      const ry = py + P(50) + i * P(66);
      addTxt(row.key, px + P(14), ry, { fontSize: F(15), fontStyle: 'bold', color: '#e8cc90' }, 0, 0);

      const barX = px + P(14), barW = PW - P(28), barH = P(10), barY = ry + P(22);
      const barBg = this.add.graphics().setDepth(D + 2);
      objs.push(barBg);

      const valTxt = addTxt('', px + PW / 2, ry + P(36), { fontSize: F(15), fontStyle: 'bold', color: '#ffe08a' });

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

      const btnStyle = { fontSize: F(17), fontStyle: 'bold', color: '#ffe08a', stroke: '#1a0800', strokeThickness: 1 };
      const minusBtn = addTxt('−', px + P(14), ry + P(36), btnStyle, 0, 0.5);
      minusBtn.setInteractive({ useHandCursor: true })
        .on('pointerup', () => { row.set(Math.max(0, Math.round((row.get() - STEP) * 20) / 20)); SaveStore.save(); redraw(); });
      const plusBtn = addTxt('+', px + PW - P(14), ry + P(36), btnStyle, 1, 0.5);
      plusBtn.setInteractive({ useHandCursor: true })
        .on('pointerup', () => { row.set(Math.min(1, Math.round((row.get() + STEP) * 20) / 20)); redraw(); });
    });

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
    const cpTxt = this.add.text(BTN_X + BTN_W / 2, CPBTN_Y + BTN_H / 2, tr('ui.changePass'), {
      fontSize: F(15), fontStyle: 'bold', color: '#77ff99', stroke: '#001a00', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(cpTxt);
    const cpHit = this.add.rectangle(BTN_X + BTN_W / 2, CPBTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(cpHit);
    cpHit.on('pointerup', () => { close(); this._showGameChangePasswordPanel(W, H); });

    const RBTN_Y = py + PH - P(14) - BTN_H - P(10) - BTN_H;
    const rbg = this.add.graphics().setDepth(D + 2);
    objs.push(rbg);
    rbg.fillStyle(0x0a1a2a, 1);
    rbg.fillRoundedRect(BTN_X, RBTN_Y, BTN_W, BTN_H, P(6));
    rbg.lineStyle(1, 0x2a5a8a, 0.8);
    rbg.strokeRoundedRect(BTN_X, RBTN_Y, BTN_W, BTN_H, P(6));
    const rTxt = this.add.text(BTN_X + BTN_W / 2, RBTN_Y + BTN_H / 2, tr('ui.report'), {
      fontSize: F(15), fontStyle: 'bold', color: '#77bbff', stroke: '#001a2a', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(rTxt);
    const rHit = this.add.rectangle(BTN_X + BTN_W / 2, RBTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(rHit);
    rHit.on('pointerup', () => { close(); (window as any).__openReport?.(); });

    const LBTN_Y = py + PH - P(14) - BTN_H;
    const lbg = this.add.graphics().setDepth(D + 2);
    objs.push(lbg);
    lbg.fillStyle(0x3a1008, 1);
    lbg.fillRoundedRect(BTN_X, LBTN_Y, BTN_W, BTN_H, P(6));
    lbg.lineStyle(1, 0xa04020, 0.8);
    lbg.strokeRoundedRect(BTN_X, LBTN_Y, BTN_W, BTN_H, P(6));
    const lTxt = this.add.text(BTN_X + BTN_W / 2, LBTN_Y + BTN_H / 2, tr('ui.logout'), {
      fontSize: F(15), fontStyle: 'bold', color: '#ff9977', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 3);
    objs.push(lTxt);
    const lHit = this.add.rectangle(BTN_X + BTN_W / 2, LBTN_Y + BTN_H / 2, BTN_W, BTN_H)
      .setDepth(D + 4).setAlpha(0.001).setInteractive({ useHandCursor: true });
    objs.push(lHit);
    lHit.on('pointerup', () => {
      lTxt.setText(tr('ui.saving'));
      lHit.disableInteractive();
      (window as any).__saveAndLogout?.();
    });

    objs.forEach(o => { if ('setScrollFactor' in o) (o as any).setScrollFactor(0); });
  }

  private _showGameChangePasswordPanel(_W: number, _H: number): void {
    const domContainer: HTMLElement = (this.sys.game as any).domContainer ?? document.body;
    (window as any).__setGameInputEnabled?.(false);
    openChangePasswordOverlay(domContainer, () => {
      (window as any).__setGameInputEnabled?.(true);
    });
  }


  private showRewardPanel(): void {
    // Guest: use synced reward data from host
    if (NetworkService.connected && !NetworkService.isHost) {
      if (!this.guestReward) { this.exitToLobby(); return; }
      if (this.guestReward.isEquipReward) {
        this.showEquipRewardModalGuest(this.guestReward.star);
      } else {
        this.showGoldRewardPanelGuest(this.guestReward.gold);
      }
      return;
    }
    // Host / Solo: use own quest
    const quest = QuestStore.getQuests().find(q => q.id === this.completedQuestId);
    if (!quest) { this.exitToLobby(); return; }
    if (quest.isEquipReward) {
      this.showEquipRewardModal(quest);
    } else {
      this.showGoldRewardPanel(quest);
    }
  }

  private showGoldRewardPanel(quest: import('../data/quest-store').Quest): void {
    const W = this.scale.width, H = this.scale.height;
    const D = 10000;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => { objs.forEach(o => o.destroy()); this.exitToLobby(); };

    const gold = QuestStore.claimQuest(quest.id);
    InventoryStore.addGold(gold);
    SaveStore.save();

    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(D).setInteractive();
    objs.push(bk);

    const pw = P(280), ph = P(160);
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    const pg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    objs.push(pg);
    pg.fillStyle(0x1a1200, 0.97); pg.fillRoundedRect(px, py, pw, ph, P(10));
    pg.lineStyle(P(2), 0xddaa00, 1); pg.strokeRoundedRect(px, py, pw, ph, P(10));
    pg.fillStyle(0x2a1e00, 1); pg.fillRoundedRect(px, py, pw, P(36), { tl: P(10), tr: P(10), bl: 0, br: 0 });

    objs.push(this.add.text(W / 2, py + P(18), tr('prep.item.equipReward'), {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    objs.push(this.add.text(W / 2, py + P(72), tr('game.loot.goldGain', { gold }), {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const btnW = P(100), btnH = P(32);
    const btnX = W / 2 - btnW / 2, btnY = py + ph - P(48);
    const btnG = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x3a1010, 0.95); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, P(6));
    btnG.lineStyle(P(2), 0xaa2222, 1); btnG.strokeRoundedRect(btnX, btnY, btnW, btnH, P(6));
    objs.push(this.add.text(W / 2, btnY + btnH / 2, tr('game.hud.return'), {
      fontSize: F(14), fontStyle: 'bold', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    const btnHit = this.add.rectangle(W / 2, btnY + btnH / 2, btnW, btnH)
      .setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
    objs.push(btnHit);
    btnHit.on('pointerdown', close);
  }

  private showGoldRewardPanelGuest(gold: number): void {
    const W = this.scale.width, H = this.scale.height;
    const D = 10000;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => { objs.forEach(o => o.destroy()); this.exitToLobby(); };

    InventoryStore.addGold(gold);
    SaveStore.save();

    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72)
      .setScrollFactor(0).setDepth(D).setInteractive();
    objs.push(bk);

    const pw = P(280), ph = P(160);
    const px = W / 2 - pw / 2, py = H / 2 - ph / 2;
    const pg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    objs.push(pg);
    pg.fillStyle(0x1a1200, 0.97); pg.fillRoundedRect(px, py, pw, ph, P(10));
    pg.lineStyle(P(2), 0xddaa00, 1); pg.strokeRoundedRect(px, py, pw, ph, P(10));
    pg.fillStyle(0x2a1e00, 1); pg.fillRoundedRect(px, py, pw, P(36), { tl: P(10), tr: P(10), bl: 0, br: 0 });

    objs.push(this.add.text(W / 2, py + P(18), tr('prep.item.equipReward'), {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    objs.push(this.add.text(W / 2, py + P(72), tr('game.loot.goldGain', { gold }), {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const btnW = P(100), btnH = P(32);
    const btnX = W / 2 - btnW / 2, btnY = py + ph - P(48);
    const btnG = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x3a1010, 0.95); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, P(6));
    btnG.lineStyle(P(2), 0xaa2222, 1); btnG.strokeRoundedRect(btnX, btnY, btnW, btnH, P(6));
    objs.push(this.add.text(W / 2, btnY + btnH / 2, tr('game.hud.return'), {
      fontSize: F(14), fontStyle: 'bold', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    const btnHit = this.add.rectangle(W / 2, btnY + btnH / 2, btnW, btnH)
      .setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
    objs.push(btnHit);
    btnHit.on('pointerdown', close);
  }

  private showEquipRewardModalGuest(star: number): void {
    const weights = STAR_EQUIP_QUALITY[star] ?? {};
    const ALL_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'sword'];
    const pickedSlots = [...ALL_SLOTS].sort(() => Math.random() - 0.5).slice(0, 3);
    const _rBonusGuest = CardStore.getTotalStats().rarityBonus ?? 0;
    const items: EquipmentItem[] = pickedSlots.map(s => generateEquipment(s, randomQuality(weights, _rBonusGuest)));
    this.showEquipRewardModalItems(items, () => { SaveStore.save(); this.exitToLobby(); });
  }

  private showEquipRewardModal(quest: import('../data/quest-store').Quest): void {
    const items = QuestStore.getEquipOptions(quest.id);
    this.showEquipRewardModalItems(items, () => {
      QuestStore.claimQuest(quest.id);
      SaveStore.save();
      this.exitToLobby();
    });
  }

  private showEquipRewardModalItems(items: EquipmentItem[], onPick: (item: EquipmentItem) => void): void {
    const W = this.scale.width, H = this.scale.height;
    const D = 10000;
    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = (item: EquipmentItem) => { objs.forEach(o => o.destroy()); onPick(item); };

    const CARD_W = P(145), CARD_H = P(240), GAP = P(10);
    const MW = CARD_W * 3 + GAP * 4, MH = CARD_H + P(52) + GAP * 2;
    const mx = W / 2 - MW / 2, my = H / 2 - MH / 2;

    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78)
      .setScrollFactor(0).setDepth(D).setInteractive();
    objs.push(bk);

    const mg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    objs.push(mg);
    mg.fillStyle(0x1a1200, 0.97); mg.fillRoundedRect(mx, my, MW, MH, P(10));
    mg.lineStyle(P(2), 0xddaa00, 1); mg.strokeRoundedRect(mx, my, MW, MH, P(10));
    mg.fillStyle(0x2a1e00, 1); mg.fillRoundedRect(mx, my, MW, P(44), { tl: P(10), tr: P(10), bl: 0, br: 0 });
    mg.lineStyle(P(1), 0xddaa00, 0.35); mg.lineBetween(mx, my + P(44), mx + MW, my + P(44));

    objs.push(this.add.text(W / 2, my + P(22), tr('prep.equip.selectReward'), {
      fontSize: F(16), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    items.forEach((item, idx) => {
      const cx = mx + GAP + idx * (CARD_W + GAP);
      const cy = my + P(44) + GAP;
      const qColor = QUALITY_COLORS[item.quality];
      const qHex = '#' + qColor.toString(16).padStart(6, '0');

      const rg = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
      objs.push(rg);
      const drawCard = (hover: boolean) => {
        rg.clear();
        rg.fillStyle(hover ? 0x2a2010 : 0x1a1400, 1);
        rg.fillRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
        rg.lineStyle(hover ? P(3) : P(2), qColor, hover ? 1 : 0.75);
        rg.strokeRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
        rg.fillStyle(qColor, 0.35);
        rg.fillRoundedRect(cx, cy, CARD_W, P(5), { tl: P(7), tr: P(7), bl: 0, br: 0 });
      };
      drawCard(false);

      const imgBg = this.add.graphics().setScrollFactor(0).setDepth(D + 3);
      objs.push(imgBg);
      imgBg.fillStyle(0x0a0600, 0.7);
      imgBg.fillRoundedRect(cx + (CARD_W - P(80)) / 2, cy + P(12), P(80), P(80), P(5));
      imgBg.lineStyle(P(1), qColor, 0.5);
      imgBg.strokeRoundedRect(cx + (CARD_W - P(80)) / 2, cy + P(12), P(80), P(80), P(5));

      if (this.textures.exists(item.texture))
        objs.push(this.add.image(cx + CARD_W / 2, cy + P(52), item.texture)
          .setDisplaySize(P(68), P(68)).setScrollFactor(0).setDepth(D + 4));

      objs.push(this.add.text(cx + CARD_W / 2, cy + P(96), SLOT_NAMES[item.slot], {
        fontSize: F(14), fontStyle: 'bold', color: '#e8c070', stroke: '#0a0600', strokeThickness: 2,
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 3));

      objs.push(this.add.text(cx + CARD_W / 2, cy + P(114), QUALITY_NAMES[item.quality], {
        fontSize: F(14), fontStyle: 'bold', color: qHex, stroke: '#0a0600', strokeThickness: 2,
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 3));

      const affixLines = item.affixes.map(a =>
        `${STAT_NAMES[a.stat]} +${fmtAffixValue(a.stat, a.value)}`,
      );
      objs.push(this.add.text(cx + CARD_W / 2, cy + P(132), affixLines.join('\n'), {
        fontSize: F(13), fontStyle: 'bold', color: '#88cc88',
        stroke: '#0a0600', strokeThickness: 2,
        align: 'center', lineSpacing: 3,
        wordWrap: { width: CARD_W - P(10) },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(D + 3));

      const hit = this.add.rectangle(cx + CARD_W / 2, cy + CARD_H / 2, CARD_W, CARD_H)
        .setScrollFactor(0).setDepth(D + 5).setInteractive({ useHandCursor: true });
      objs.push(hit);
      hit.on('pointerover', () => drawCard(true));
      hit.on('pointerout', () => drawCard(false));
      hit.on('pointerdown', () => {
        PlayerStore.addOwned(item);
        close(item);
      });
    });
  }

  private _reconnectOverlay?: Phaser.GameObjects.Container;
  private _hostReconnectOverlay?: Phaser.GameObjects.Container;

  private _showMissionAbortOverlay(title: string, subtitle: string): void {
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19999).setAlpha(0);

    // Full dark vignette
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.80));

    // Panel: warm brown border + very dark brown body
    const panelW = Math.min(W * 0.80, P(280));
    const panelH = P(148);
    const cx = W / 2, cy = H / 2;
    c.add(this.add.rectangle(cx, cy, panelW + P(3), panelH + P(3), 0x7a4a1a, 1).setScrollFactor(0));
    c.add(this.add.rectangle(cx, cy, panelW, panelH, 0x100500, 1).setScrollFactor(0));

    // Icon (warm amber ✕)
    c.add(this.add.text(cx, cy - P(50), '✕', {
      fontSize: F(26), fontStyle: 'bold', color: '#f0d090',
      stroke: '#1a0800', strokeThickness: P(2),
      shadow: { offsetX: 0, offsetY: 0, color: '#c88030', blur: P(12), fill: true },
    }).setOrigin(0.5).setScrollFactor(0));

    // Title
    c.add(this.add.text(cx, cy - P(16), title, {
      fontSize: F(20), fontStyle: 'bold', color: '#f0d090',
      stroke: '#1a0800', strokeThickness: P(3),
    }).setOrigin(0.5).setScrollFactor(0));

    // Thin separator (warm brown)
    const sep = this.add.graphics().setScrollFactor(0);
    sep.lineStyle(P(1), 0x7a4a1a, 0.8);
    sep.beginPath();
    sep.moveTo(cx - panelW * 0.32, cy + P(4));
    sep.lineTo(cx + panelW * 0.32, cy + P(4));
    sep.strokePath();
    c.add(sep);

    // Subtitle
    c.add(this.add.text(cx, cy + P(18), subtitle, {
      fontSize: F(15), fontStyle: 'bold', color: '#d4aa88',
      stroke: '#1a0800', strokeThickness: P(2),
    }).setOrigin(0.5).setScrollFactor(0));

    // Footer hint
    c.add(this.add.text(cx, cy + P(46), tr('game.hud.goingBack'), {
      fontSize: F(15), fontStyle: 'bold', color: '#886655',
    }).setOrigin(0.5).setScrollFactor(0));

    // Fade in
    this.tweens.add({ targets: c, alpha: 1, duration: 380, ease: 'Quad.Out' });
  }

  private _showHostReconnectOverlay(): void {
    if (this._hostReconnectOverlay) return;
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19999);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72));
    c.add(this.add.text(W / 2, H / 2 - P(16), tr('game.hud.hostReconnect'), {
      fontSize: F(18), fontStyle: 'bold', color: '#f0d090', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, H / 2 + P(14), tr('game.hud.pausedFull'), {
      fontSize: F(13), color: '#aaaaaa',
    }).setOrigin(0.5));
    this._hostReconnectOverlay = c;
  }

  private _hideHostReconnectOverlay(): void {
    this._hostReconnectOverlay?.destroy();
    this._hostReconnectOverlay = undefined;
  }

  private _showBossKanji(char: string, bx: number, by: number): void {
    const fontSize = Math.round(34 * DPR);
    const t = this.add.text(bx, by, char, {
      fontSize: `${fontSize}px`,
      fontFamily: 'serif',
      color: '#ff1111',
      stroke: '#440000',
      strokeThickness: Math.round(3 * DPR),
      shadow: { offsetX: 0, offsetY: 0, color: '#ff4444', blur: Math.round(12 * DPR), fill: true },
    }).setOrigin(0.5, 0.5).setDepth(by + 100).setAlpha(0).setScale(0.2);

    this.tweens.chain({
      targets: t,
      tweens: [
        { alpha: 1, scaleX: 1.15, scaleY: 1.15, duration: 120, ease: 'Back.Out' },
        { scaleX: 1.0, scaleY: 1.0, duration: 80, ease: 'Quad.In' },
        { alpha: 1, duration: 300 },
        { alpha: 0, y: by - P(30), duration: 250, ease: 'Quad.In', onComplete: () => t.destroy() },
      ],
    });
  }

  private _showReconnectOverlay(): void {
    if (this._reconnectOverlay) return;
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19999);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65));
    c.add(this.add.text(W / 2, H / 2 - P(16), tr('game.hud.reconnect'), {
      fontSize: F(18), fontStyle: 'bold', color: '#f0d090', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, H / 2 + P(14), tr('game.hud.waiting'), {
      fontSize: F(13), color: '#aaaaaa',
    }).setOrigin(0.5));
    this._reconnectOverlay = c;
  }

  private _hideReconnectOverlay(): void {
    this._reconnectOverlay?.destroy();
    this._reconnectOverlay = undefined;
  }

  private _onReconnected(): void {
    this._hideReconnectOverlay();
    // Re-sync partner info display
    this._partners.forEach(pd => {
      pd.sprite.setVisible(true);
      pd.label.setVisible(true);
      pd.hpBar.setVisible(true);
    });
  }

  private _onReconnectFailed(): void {
    this._hideReconnectOverlay();
    // Treat as partner leaving — just show disconnected state without kicking to lobby
    this._partners.forEach(pd => {
      pd.sprite.setVisible(false);
      pd.label.setVisible(false);
      pd.hpBar.setVisible(false);
    });
  }

  protected exitToLobby(): void {
    if (this._isTutorial) {
      TutorialStore.markDone('battleDone');
    }
    SaveStore.save();
    SaveStore.forceUpload();
    const wasMulti = NetworkService.connected;
    if (wasMulti) {
      NetworkService.clearGameCallbacks();
      NetworkService.setAutoLobby();
    }
    this.scene.start('TownLoadingScene');
  }

  // ── Loot drop system ──────────────────────────────────

  protected spawnCardDrop(cx: number, cy: number, cardId: string, burst = false): void {
    const cardDef = getCardDef(cardId);
    const monDef = cardDef ? getMonsterDef(cardDef.monsterId) : null;
    const isBoss = (monDef?.tier ?? 0) >= 5;
    const CW = P(16), CH = P(20);
    const bColor = isBoss ? 0xf0c040 : 0x9aacb8;

    const angle = burst ? Math.random() * Math.PI * 2 : 0;
    const dist = burst ? Phaser.Math.Between(P(30), P(120)) : 0;
    const tx = burst ? Phaser.Math.Clamp(cx + Math.cos(angle) * dist, P(32), this.worldW - P(32)) : cx + Phaser.Math.Between(-P(18), P(18));
    const ty = burst ? Phaser.Math.Clamp(cy + Math.sin(angle) * dist * 0.4, P(32), this.worldH - P(32)) : cy + Phaser.Math.Between(-P(8), P(8)) + P(18);
    const startX = burst ? cx : tx;
    const startY = burst ? cy : cy - P(24);

    const cnt = this.add.container(startX, startY).setDepth(ty + 4);
    const g = this.add.graphics();
    const fx = -CW / 2, fy = -CH / 2;
    g.fillStyle(0x000000, 0.4); g.fillRect(fx + P(2), fy + P(2), CW, CH);
    g.fillStyle(0x2a1a0a, 1); g.fillRect(fx, fy, CW, CH);
    g.lineStyle(P(2), bColor, 0.9); g.strokeRect(fx, fy, CW, CH);
    g.lineStyle(P(1), bColor, 0.4); g.strokeRect(fx + P(2), fy + P(2), CW - P(4), CH - P(4));
    cnt.add(g);

    if (burst) {
      const arcX = cx + Math.cos(angle) * dist * 0.3;
      const arcY = cy - P(55);
      this.tweens.add({
        targets: cnt, x: arcX, y: arcY, duration: 170, ease: 'Quad.Out',
        onComplete: () => {
          this.tweens.add({
            targets: cnt, x: tx, y: ty, duration: 310, ease: 'Bounce.Out',
            onComplete: () => {
              this.tweens.add({ targets: cnt, scaleX: 1.15, scaleY: 1.15, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            },
          });
        },
      });
    } else {
      this.tweens.add({
        targets: cnt, y: ty, duration: 420, ease: 'Bounce.Out',
        onComplete: () => {
          this.tweens.add({ targets: cnt, scaleX: 1.15, scaleY: 1.15, duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        },
      });
    }

    const cardName = cardDef?.name ?? tr('prep.tab.card');
    this.lootDrops.push({ obj: cnt, itemId: '__card__', itemName: cardName, qty: 1, cardId, readyAt: Date.now() + 600 });
  }

  protected spawnLoot(cx: number, cy: number, drops: DropEntry[], burst = false): void {
    const dropBonus = 1 + (CardStore.getTotalStats().dropRatePct ?? 0);
    let bi = 0;
    for (const drop of drops) {
      if (Math.random() >= drop.rate * dropBonus) continue;
      const qty = Phaser.Math.Between(drop.qtyMin, drop.qtyMax);
      const iconKey = `icon_${drop.itemId}`;

      const iconSz = drop.itemId.startsWith('stone_') ? P(26) : P(17);
      if (burst) {
        const angle = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(P(50), P(110));
        const _btx = cx + Math.cos(angle) * dist;
        const _bty = cy + Math.sin(angle) * dist * 0.4;
        const tx = this.isInOpenArea(_btx, _bty) ? _btx : cx;
        const ty = this.isInOpenArea(_btx, _bty) ? _bty : cy;
        const img = this.add.image(cx, cy, iconKey)
          .setDisplaySize(iconSz, iconSz).setDepth(ty + 4);
        const delay = bi++ * 25;
        const arcX = Phaser.Math.Clamp(cx + Math.cos(angle) * dist * 0.3, P(32), this.worldW - P(32));
        const arcY = Phaser.Math.Clamp(cy - P(55), P(32), this.worldH - P(32));
        this.tweens.add({
          targets: img, x: arcX, y: arcY, duration: 170, ease: 'Quad.Out', delay,
          onComplete: () => {
            this.tweens.add({
              targets: img, x: tx, y: ty, duration: 310, ease: 'Bounce.Out',
              onComplete: () => {
                this.tweens.add({ targets: img, y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
              },
            });
          },
        });
        this.lootDrops.push({ obj: img, itemId: drop.itemId, itemName: drop.itemName, qty, readyAt: Date.now() + 600 + delay });
      } else {
        const ox = Phaser.Math.Between(-P(22), P(22));
        const oy = Phaser.Math.Between(-P(10), P(10));
        let tx = cx + ox;
        let ty = cy + oy + P(18);
        if (!this.isInOpenArea(tx, ty)) { tx = cx; ty = cy + P(18); }
        const img = this.add.image(tx, cy - P(24), iconKey)
          .setDisplaySize(iconSz, iconSz).setDepth(ty + 4);
        this.tweens.add({
          targets: img, y: ty, duration: 420, ease: 'Bounce.Out',
          onComplete: () => {
            this.tweens.add({ targets: img, y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          },
        });
        this.lootDrops.push({ obj: img, itemId: drop.itemId, itemName: drop.itemName, qty, readyAt: Date.now() + 600 });
      }
    }
  }

  protected spawnEquipDrop(cx: number, cy: number, equip: EquipmentItem, burst = false): void {
    const imgKey = this.textures.exists(equip.texture) ? equip.texture : 'icon_equip_drop';
    const qColor = QUALITY_COLORS[equip.quality];
    const imgSz = P(26);
    const off = equip.quality === 'normal' ? P(1.5) : P(2);

    const angle = burst ? Math.random() * Math.PI * 2 : 0;
    const dist = burst ? Phaser.Math.Between(P(30), P(120)) : 0;
    const _etx0 = cx + Phaser.Math.Between(-P(22), P(22));
    const _ety0 = cy + Phaser.Math.Between(-P(10), P(10)) + P(18);
    const _ebtx = cx + Math.cos(angle) * dist;
    const _ebty = cy + Math.sin(angle) * dist * 0.4;
    const tx = burst ? (this.isInOpenArea(_ebtx, _ebty) ? _ebtx : cx) : (this.isInOpenArea(_etx0, _ety0) ? _etx0 : cx);
    const ty = burst ? (this.isInOpenArea(_ebtx, _ebty) ? _ebty : cy) : (this.isInOpenArea(_etx0, _ety0) ? _ety0 : cy + P(18));
    const startX = burst ? cx : tx;
    const startY = burst ? cy : cy - P(24);

    // 8方向偏移同一張圖填色 → 沿著去背邊緣形成品質色外框
    const badge = this.add.container(startX, startY).setDepth(ty + 3);
    const dirs: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    dirs.forEach(([dx, dy]) => {
      badge.add(
        this.add.image(off * dx, off * dy, imgKey)
          .setDisplaySize(imgSz, imgSz)
          .setTintFill(qColor),
      );
    });

    const img = this.add.image(startX, startY, imgKey)
      .setDisplaySize(imgSz, imgSz).setDepth(ty + 4);

    if (burst) {
      const arcX = Phaser.Math.Clamp(cx + Math.cos(angle) * dist * 0.3, P(32), this.worldW - P(32));
      const arcY = Phaser.Math.Clamp(cy - P(55), P(32), this.worldH - P(32));
      this.tweens.add({
        targets: [badge, img], x: arcX, y: arcY, duration: 170, ease: 'Quad.Out',
        onComplete: () => {
          this.tweens.add({
            targets: [badge, img], x: tx, y: ty, duration: 310, ease: 'Bounce.Out',
            onComplete: () => {
              this.tweens.add({ targets: [badge, img], y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            },
          });
        },
      });
    } else {
      this.tweens.add({
        targets: [badge, img], y: ty, duration: 420, ease: 'Bounce.Out',
        onComplete: () => {
          this.tweens.add({ targets: [badge, img], y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        },
      });
    }
    const name = SLOT_NAMES[equip.slot];
    this.lootDrops.push({ obj: img, itemId: '__equip__', itemName: name, qty: 1, readyAt: Date.now() + 600, equip, badge });
  }

  // ── Chest System ──────────────────────────────────────────────────────────

  private _createChestAnims(): void {
    const CHEST_TYPE_IDX: Record<ChestType, number> = { equip: 4, gold: 7, stone: 1, potion: 2, card: 8 };
    for (const [type, idx] of Object.entries(CHEST_TYPE_IDX) as [ChestType, number][]) {
      const key = `chest_open_${type}`;
      if (!this.anims.exists(key)) {
        this.anims.create({
          key,
          frames: [
            { key: 'chests', frame: 9 + idx },
            { key: 'chests', frame: 18 + idx },
            { key: 'chests', frame: 27 + idx },
          ],
          frameRate: 8,
          repeat: 0,
        });
      }
    }
  }

  private _registerZone(zoneIdx: number, wx: number, wy: number, countBefore: number, rooms?: { x: number; y: number; w: number; h: number }[]): void {
    const added = this.allMinions.slice(countBefore);
    if (added.length === 0) return;
    this._zoneAlive.set(zoneIdx, added.length);
    for (const m of added) {
      const origOnDead = m.onDead;
      m.onDead = () => {
        origOnDead?.();
        const alive = (this._zoneAlive.get(zoneIdx) ?? 1) - 1;
        this._zoneAlive.set(zoneIdx, alive);
        if (alive <= 0) {
          const chest = this._chests.find(c => c.zoneIdx === zoneIdx);
          if (chest && !chest.unlocked) {
            this._unlockChest(chest);
            if (NetworkService.connected && NetworkService.isHost) {
              const id = this._chests.indexOf(chest);
              if (id !== -1) NetworkService.sendChestUnlock(id);
            }
          }
        }
      };
    }
    this._spawnChest(zoneIdx, wx, wy, rooms);
  }

  private _pickChestType(): ChestType {
    const roll = Math.random();
    if (roll < 0.26) return 'equip';
    else if (roll < 0.52) return 'gold';
    else if (roll < 0.70) return 'stone';
    else if (roll < 0.875) return 'potion';
    else return 'card';
  }

  private _makeChestSprite(cx: number, cy: number, type: ChestType): Phaser.GameObjects.Sprite {
    const CHEST_TYPE_IDX: Record<ChestType, number> = { equip: 4, gold: 7, stone: 1, potion: 2, card: 8 };
    return this.add.sprite(cx, cy, 'chests', CHEST_TYPE_IDX[type])
      .setDisplaySize(P(40), P(40)).setDepth(cy + 2);
  }

  private _makeChestShadow(cx: number, cy: number, big: boolean): Phaser.GameObjects.Ellipse {
    const w = big ? P(52) : P(34);
    const h = big ? P(14) : P(10);
    return this.add.ellipse(cx, cy + (big ? P(15) : P(8)), w, h, 0x000000, 0.35).setDepth(cy + 1);
  }

  private _setupChestInteraction(chest: ChestEntry): void {
    const zone = this.add.zone(chest.x, chest.y, P(52), P(52));
    this.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
    chest.zone = zone;
    this.physics.add.overlap(this.player, zone, () => {
      if (!chest.unlocked || chest.opening) return;
      this._openChest(chest);
    });
  }

  private _spawnChest(zoneIdx: number, wx: number, wy: number, rooms?: { x: number; y: number; w: number; h: number }[]): void {
    if (this._isTutorial) return;
    if (NetworkService.connected && !NetworkService.isHost) return;
    if (Math.random() >= 0.12) return;

    // ── 位置：區域角落，距邊緣一點距離 ──
    let cx = wx, cy = wy;
    if (rooms && rooms.length > 0) {
      const room = rooms[Math.floor(Math.random() * rooms.length)];
      const PAD = P(55);
      cx = Math.random() < 0.5 ? room.x + PAD : room.x + room.w - PAD;
      cy = Math.random() < 0.5 ? room.y + PAD : room.y + room.h - PAD;
      cx = Phaser.Math.Clamp(cx, P(32), this.worldW - P(32));
      cy = Phaser.Math.Clamp(cy, P(32), this.worldH - P(32));
    }

    const type = this._pickChestType();
    const big = Math.random() < 0.10;
    const sprite = this._makeChestSprite(cx, cy, type);
    if (big) sprite.setDisplaySize(P(65), P(65));
    sprite.setTint(0x444444);
    const shadow = this._makeChestShadow(cx, cy, big);
    this._chests.push({ zoneIdx, x: cx, y: cy, type, sprite, shadow, unlocked: false, opening: false, big });
  }

  private _spawnCorridorChests(): void {
    if (this._isTutorial) return;
    if (NetworkService.connected && !NetworkService.isHost) return;
    for (const seg of this.corridorSegs) {
      if (Math.random() >= 0.12) continue;
      const isH = Math.abs(seg.y1 - seg.y2) < 1;
      const len = isH ? Math.abs(seg.x2 - seg.x1) : Math.abs(seg.y2 - seg.y1);
      if (len < P(160)) continue; // 走廊太短就跳過
      const cx = Math.round((seg.x1 + seg.x2) / 2);
      const cy = Math.round((seg.y1 + seg.y2) / 2);
      const type = this._pickChestType();
      const big = Math.random() < 0.10;
      const sprite = this._makeChestSprite(cx, cy, type);
      if (big) sprite.setDisplaySize(P(65), P(65));
      const shadow = this._makeChestShadow(cx, cy, big);
      const entry: ChestEntry = { zoneIdx: -9999, x: cx, y: cy, type, sprite, shadow, unlocked: true, opening: false, big };
      this._chests.push(entry);
      this._setupChestInteraction(entry);
    }
  }

  private _unlockChest(chest: ChestEntry): void {
    chest.unlocked = true;
    chest.sprite.clearTint();
    const bx = chest.sprite.scaleX, by = chest.sprite.scaleY;
    this.tweens.add({ targets: chest.sprite, scaleX: bx * 1.06, scaleY: by * 1.06, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this._setupChestInteraction(chest);
  }

  private _openChest(chest: ChestEntry, fromNetwork = false): void {
    if (chest.opening) return;
    chest.opening = true;
    chest.zone?.destroy();
    if (!fromNetwork && NetworkService.connected) {
      const id = this._chests.indexOf(chest);
      if (id !== -1) NetworkService.sendChestOpen(id);
    }
    this.playSfx('sfx_open_chest');
    DailyQuestStore.addProgress('open_chest', 1);
    const animKey = `chest_open_${chest.type}`;
    chest.sprite.play(animKey);
    chest.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this._spawnChestLoot(chest);
      this.time.delayedCall(800, () => { chest.sprite.destroy(); chest.shadow.destroy(); });
    });
  }

  private _bellCurve(min: number, max: number, mult = 1.0): number {
    const avg = (Phaser.Math.Between(min, max) + Phaser.Math.Between(min, max) + Phaser.Math.Between(min, max)) / 3;
    return Math.max(min, Math.round(avg * mult));
  }

  private _spawnBurstItem(cx: number, cy: number, itemId: string, itemName: string): void {
    const TICKET_DROP_COLORS: Record<string, number> = {
      ticket_slime: 0x44ee99,
      ticket_flower: 0x99ee44,
      ticket_orc: 0xeebb44,
      ticket_vampire: 0xdd77ff,
    };
    const iconKey = `icon_${itemId}`;
    const isTicket = itemId.startsWith('ticket_');
    const iconSz = itemId.startsWith('stone_') ? P(26) : isTicket ? P(24) : P(17);
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(P(20), P(60));
    const tx = Phaser.Math.Clamp(cx + Math.cos(angle) * dist, P(32), this.worldW - P(32));
    const ty = Phaser.Math.Clamp(cy + Math.sin(angle) * dist * 0.4, P(32), this.worldH - P(32));
    const arcX = Phaser.Math.Clamp(cx + Math.cos(angle) * dist * 0.3, P(32), this.worldW - P(32));
    const arcY = Phaser.Math.Clamp(cy - P(55), P(32), this.worldH - P(32));

    const img = this.add.image(cx, cy, iconKey).setDisplaySize(iconSz, iconSz).setDepth(ty + 4);
    if (isTicket) {
      const tickColor = TICKET_DROP_COLORS[itemId] ?? 0xffffff;
      img.postFX.addGlow(tickColor, 6, 0, false, 0.1, 16);
    }
    this.tweens.add({
      targets: img, x: arcX, y: arcY, duration: 170, ease: 'Quad.Out',
      onComplete: () => {
        this.tweens.add({
          targets: img, x: tx, y: ty, duration: 310, ease: 'Bounce.Out',
          onComplete: () => {
            this.tweens.add({ targets: img, y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
          },
        });
      },
    });
    this.lootDrops.push({ obj: img, itemId, itemName, qty: 1, readyAt: Date.now() + 600 });
  }

  private _spawnChestLoot(chest: ChestEntry): void {
    const { x: cx, y: cy, type } = chest;
    const starMult = 1 + 0.15 * (this.questStar - 1);
    const bigMult = chest.big ? 2 : 1;

    switch (type) {
      case 'equip': {
        const count = this._bellCurve(3, 6, starMult) * bigMult;
        const qualW = getDropQualityWeights('elite', this.questStar);
        const rarityBV = (CardStore.getTotalStats().rarityBonus ?? 0);
        for (let i = 0; i < count; i++) {
          const slot = EQUIP_ALL_SLOTS[Math.floor(Math.random() * EQUIP_ALL_SLOTS.length)];
          this.spawnEquipDrop(cx, cy, generateEquipment(slot, randomQuality(qualW, rarityBV)), true);
        }
        break;
      }
      case 'gold': {
        const count = this._bellCurve(5, 15, starMult) * bigMult;
        for (let i = 0; i < count; i++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = Phaser.Math.Between(P(20), P(60));
          const tx = Phaser.Math.Clamp(cx + Math.cos(angle) * dist, P(32), this.worldW - P(32));
          const ty = Phaser.Math.Clamp(cy + Math.sin(angle) * dist * 0.4, P(32), this.worldH - P(32));
          const arcX = Phaser.Math.Clamp(cx + Math.cos(angle) * dist * 0.3, P(32), this.worldW - P(32));
          const arcY = Phaser.Math.Clamp(cy - P(55), P(32), this.worldH - P(32));
          const coin = this.add.image(cx, cy, 'icon_coin').setDisplaySize(P(18), P(18)).setDepth(ty + 4);
          const delay = i * 30;
          this.tweens.add({
            targets: coin, x: arcX, y: arcY, duration: 170, ease: 'Quad.Out', delay,
            onComplete: () => {
              this.tweens.add({
                targets: coin, x: tx, y: ty, duration: 310, ease: 'Bounce.Out',
                onComplete: () => {
                  this.tweens.add({ targets: coin, y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                },
              });
            },
          });
          this.lootDrops.push({ obj: coin, itemId: '__gold__', itemName: tr('item.gold'), qty: 1, gold: 50, readyAt: Date.now() + 600 + delay });
        }
        break;
      }
      case 'stone': {
        const count = this._bellCurve(1, 5, starMult) * bigMult;
        for (let i = 0; i < count; i++) {
          const r = Math.random();
          if (this.questStar >= 4 && r < 0.10) this._spawnBurstItem(cx, cy, ITEM_STONE_BREAKTHROUGH, tr('item.stone_breakthrough'));
          else if (r < 0.75) this._spawnBurstItem(cx, cy, ITEM_STONE_BROKEN, tr('item.stone_broken'));
          else if (r < 0.95) this._spawnBurstItem(cx, cy, ITEM_STONE_INTACT, tr('item.stone_intact'));
          else this._spawnBurstItem(cx, cy, ITEM_STONE_RECAST, tr('item.stone_guard'));
        }
        break;
      }
      case 'potion': {
        const count = this._bellCurve(2, 4, starMult) * bigMult;
        const table = [
          { id: ITEM_POTION_HEALTH_S, name: tr('item.potion_health_s'), w: 35 },
          { id: ITEM_POTION_HEALTH_M, name: tr('item.potion_health_m'), w: 25 },
          { id: ITEM_POTION_HEALTH_L, name: tr('item.potion_health_l'), w: 15 },
          { id: ITEM_POTION_ATK, name: tr('item.potion_atk'), w: 8 },
          { id: ITEM_POTION_DEF, name: tr('item.potion_def'), w: 7 },
          { id: ITEM_POTION_SPEED, name: tr('item.potion_speed'), w: 7 },
          { id: ITEM_POTION_REVIVE, name: tr('item.potion_revive'), w: 3 },
        ];
        const totalW = table.reduce((s, p) => s + p.w, 0);
        for (let i = 0; i < count; i++) {
          let r = Math.random() * totalW;
          for (const p of table) { r -= p.w; if (r <= 0) { this._spawnBurstItem(cx, cy, p.id, p.name); break; } }
        }
        break;
      }
      case 'card': {
        const cardCount = bigMult;
        for (let i = 0; i < cardCount; i++) {
          const r = Math.random();
          const tier = r < 0.85 ? 'n' : r < 0.98 ? 'e' : 'b';
          const pool = getAllCardIdsByTier(tier);
          if (pool.length > 0) {
            const cardId = pool[Math.floor(Math.random() * pool.length)];
            this.spawnCardDrop(cx, cy, cardId, true);
          }
        }
        break;
      }
    }
  }

  protected checkLootPickup(): void {
    if (this.lootDrops.length === 0) return;
    this.lootDrops = this.lootDrops.filter(loot => {
      if (!loot.obj.active) return false;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, loot.obj.x, loot.obj.y,
      );
      if (d > P(60) || Date.now() < loot.readyAt) return true;
      DailyQuestStore.addProgress('pickup_loot', 1);
      if (loot.cardId) {
        CardStore.addCard(loot.cardId);
        this._sessionLoot.push({ type: 'card', cardId: loot.cardId, itemName: loot.itemName });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, 1);
        if (this._isTutorial) this.time.delayedCall(200, () =>
          this._showBattleTutorial('🃏', tr('prep.tab.card'), tr('game.loot.cards.desc'), 'card'));
      } else if (loot.equip) {
        PlayerStore.addOwned(loot.equip);
        SaveStore.save();
        this._sessionLoot.push({ type: 'equip', equip: loot.equip, itemName: loot.itemName });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, 1);
        if (this._isTutorial) this.time.delayedCall(200, () =>
          this._showBattleTutorial('🛡', tr('prep.btn.equip'), tr('game.loot.equip.desc'), 'equip'));
      } else if (loot.gold) {
        InventoryStore.addGold(loot.gold);
        SaveStore.save();
        this.showPickupText(loot.obj.x, loot.obj.y, tr('game.loot.goldPickup', { gold: loot.gold }), 1);
      } else {
        InventoryStore.addItem(loot.itemId, loot.itemName, loot.qty);
        const existing = this._sessionLoot.find(e => e.type === 'item' && e.itemId === loot.itemId);
        if (existing && existing.type === 'item') existing.qty += loot.qty;
        else this._sessionLoot.push({ type: 'item', itemId: loot.itemId, itemName: loot.itemName, qty: loot.qty });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, loot.qty);
        if (this._isTutorial) {
          const isPotion = [ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L,
            ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED, ITEM_POTION_REVIVE].includes(loot.itemId);
          const isBroken = loot.itemId === ITEM_STONE_BROKEN;
          if (isPotion) this.time.delayedCall(200, () =>
            this._showBattleTutorial('🧪', tr('prep.equip.potionTitle'), tr('game.loot.potion.desc'), 'potion'));
          else if (isBroken) this.time.delayedCall(200, () =>
            this._showBattleTutorial('🪨', tr('item.stone_broken'), tr('game.loot.stone.desc'), 'brokenStone'));
        }
      }
      this.playSfx('sfx_pickup');
      this._lootBadge?.setText(String(this._sessionLoot.length));
      loot.badge?.destroy();
      loot.obj.destroy();
      return false;
    });
  }

  protected _showBattleTutorial(_icon: string, title: string, body: string, key: TutorialKey, onConfirm?: () => void): void {
    if (TutorialStore.isDone(key)) { onConfirm?.(); return; }
    this._tutPaused = true;
    this.physics.pause();

    const isPortrait = window.innerHeight > window.innerWidth;
    const visualW = isPortrait ? window.innerHeight : window.innerWidth;
    const visualH = isPortrait ? window.innerWidth : window.innerHeight;
    const bw = Math.min(visualW - 32, 320);

    const overlay = document.createElement('div');
    if (isPortrait) {
      Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', zIndex: '99000',
        width: '100vh', height: '100vw',
        transformOrigin: 'top left',
        transform: 'rotate(90deg) translateY(-100%)',
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
    } else {
      Object.assign(overlay.style, {
        position: 'fixed', inset: '0', zIndex: '99000',
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      });
    }

    const box = document.createElement('div');
    Object.assign(box.style, {
      width: `${bw}px`,
      maxHeight: `${visualH * 0.8}px`,
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
    btn.textContent = tr('prep.misc.ok');
    Object.assign(btn.style, {
      display: 'block', margin: '0 auto 18px',
      background: '#5a3400', color: '#ffe08a',
      border: '1px solid #cc9030', borderRadius: '8px',
      padding: '10px 48px', fontSize: '15px',
      fontWeight: 'bold', cursor: 'pointer', flexShrink: '0',
    });
    btn.addEventListener('click', () => {
      overlay.remove();
      TutorialStore.markDone(key);
      SaveStore.save();
      this.physics.resume();
      this._tutPaused = false;
      onConfirm?.();
    });

    box.appendChild(header);
    box.appendChild(bodyEl);
    box.appendChild(btn);
    overlay.appendChild(box);

    document.body.appendChild(overlay);
  }

  private showPickupText(_x: number, _y: number, name: string, qty: number): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const LINE_H = P(22);
    const MAX = 5;
    const BASE_Y = H * 0.82;

    // targetY: newest entry sits at BASE_Y, older entries above it
    const targetY = (idx: number, total: number) => BASE_Y - (total - 1 - idx) * LINE_H;

    const reposition = () => {
      const n = this.pickupLog.length;
      this.pickupLog.forEach((t, i) => {
        this.tweens.killTweensOf(t);   // cancel any in-flight position tween
        this.tweens.add({ targets: t, y: targetY(i, n), duration: 100, ease: 'Sine.Out' });
      });
    };

    // Remove oldest if at limit
    if (this.pickupLog.length >= MAX) {
      const old = this.pickupLog.shift()!;
      this.tweens.killTweensOf(old);
      this.tweens.add({ targets: old, alpha: 0, duration: 150, onComplete: () => old.destroy() });
    }

    // Add new entry just below current bottom (will snap to BASE_Y via reposition)
    const startY = this.pickupLog.length > 0
      ? targetY(this.pickupLog.length, this.pickupLog.length + 1)
      : BASE_Y;
    const txt = this.add.text(W / 2, startY, `+${qty} ${name}`, {
      fontSize: F(15), fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(240);
    this.pickupLog.push(txt);

    reposition();

    // Fade out after 3s
    this.time.delayedCall(3000, () => {
      const i = this.pickupLog.indexOf(txt);
      if (i === -1) return;
      this.pickupLog.splice(i, 1);
      reposition();
      this.tweens.killTweensOf(txt);
      this.tweens.add({ targets: txt, alpha: 0, duration: 300, onComplete: () => txt.destroy() });
    });
  }

  protected showLevelUp(newLevel: number): void {
    this.playSfx('sfx_level_up');
    const W = this.scale.width;
    const H = this.scale.height;
    const hasSkillPt = newLevel % 5 === 0;
    const panelH = hasSkillPt ? P(124) : P(100);
    const panelY = H / 2 - panelH / 2;

    const bg = this.add.graphics().setScrollFactor(0).setDepth(10000);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(W / 2 - P(120), panelY, P(240), panelH, P(10));
    bg.lineStyle(2, 0xf0c040, 0.9);
    bg.strokeRoundedRect(W / 2 - P(120), panelY, P(240), panelH, P(10));

    const line1Y = hasSkillPt ? H / 2 - P(38) : H / 2 - P(26);
    const line1 = this.add.text(W / 2, line1Y, tr('game.hud.levelUp'), {
      fontSize: F(20), fontStyle: 'bold', color: '#f0c040', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);

    const line2Y = hasSkillPt ? H / 2 - P(14) : H / 2 - P(2);
    const line2 = this.add.text(W / 2, line2Y, `Lv. ${newLevel}   ATK +2   HP +10`, {
      fontSize: F(15), fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);

    const line3 = this.add.text(W / 2, hasSkillPt ? H / 2 + P(10) : H / 2 + P(22), `【能力點 ${STAT_POINT_PER_LEVEL} 點】`, {
      fontSize: F(15), fontStyle: 'bold', color: '#66ddff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);

    const tweenTargets: Phaser.GameObjects.GameObject[] = [bg, line1, line2, line3];

    let line4: Phaser.GameObjects.Text | null = null;
    if (hasSkillPt) {
      line4 = this.add.text(W / 2, H / 2 + P(34), tr('game.hud.skillPt'), {
        fontSize: F(15), fontStyle: 'bold', color: '#88ffcc', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);
      tweenTargets.push(line4);
    }

    this.tweens.add({
      targets: tweenTargets, alpha: 0, delay: 1800, duration: 500,
      onComplete: () => { bg.destroy(); line1.destroy(); line2.destroy(); line3.destroy(); line4?.destroy(); },
    });
  }



  // ── Potion slots ──────────────────────────────────────

  private readonly POTION_RANGE = 50;

  protected readonly POTION_COLORS: Record<string, number> = {
    [ITEM_POTION_HEALTH_S]: 0x44ff88,
    [ITEM_POTION_HEALTH_M]: 0x44ddff,
    [ITEM_POTION_HEALTH_L]: 0xff88ff,
    [ITEM_POTION_REVIVE]:   0xffee44,
    [ITEM_POTION_ATK]:      0xff6644,
    [ITEM_POTION_DEF]:      0x44aaff,
    [ITEM_POTION_SPEED]:    0xffdd22,
  };

  private createPotionSlots(): void {
    const SZ = P(40), GAP = P(20), D = 100;
    const POTION_COLORS = this.POTION_COLORS;
    const W = this.scale.width, H = this.scale.height;
    const slotCy = H - P(164);
    const slotCxBase = W - P(100);
    const slotObjs = [0, 1].map(idx => {
      const cx = slotCxBase + idx * (SZ + GAP);
      const cy = slotCy;
      const bg = this.add.graphics().setScrollFactor(0).setDepth(D);
      const icon = this.add.image(cx, cy + P(4), 'icon_potion_health_s')
        .setDisplaySize(SZ - P(18), SZ - P(18)).setScrollFactor(0).setDepth(D + 1).setVisible(false);
      const qtyTxt = this.add.text(cx + SZ / 2 - P(2), cy - SZ / 2 + P(3), '', {
        fontSize: F(11), fontStyle: 'bold', color: '#ffe866', stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(D + 2);
      const hit = this.add.rectangle(cx, cy, SZ, SZ)
        .setScrollFactor(0).setDepth(D + 3).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        const itemId = PotionBarStore.getSlot(idx as 0 | 1);
        if (itemId) this.usePotionSlot(itemId, POTION_COLORS[itemId] ?? 0xffffff);
      });
      return { bg, icon, qtyTxt };
    });

    const redraw = () => {
      const W2 = this.scale.width, H2 = this.scale.height;
      [0, 1].forEach(idx => {
        const cx = (W2 - P(100)) + idx * (SZ + GAP);
        const cy = H2 - P(164);
        const bx = cx - SZ / 2, by = cy - SZ / 2;
        const itemId = PotionBarStore.getSlot(idx as 0 | 1);
        const qty = itemId ? (this._sessionQty.get(itemId) ?? 0) : 0;
        const cdMs = itemId ? Math.max(0, (this._potionCdUntil.get(itemId) ?? 0) - this.time.now) : 0;
        const onCd = cdMs > 0;
        const color = itemId ? (POTION_COLORS[itemId] ?? 0x888888) : 0x554422;
        const { bg, icon, qtyTxt } = slotObjs[idx];

        bg.clear();
        bg.fillStyle(0x1a1200, 0.85);
        bg.fillRoundedRect(bx, by, SZ, SZ, P(6));
        bg.lineStyle(P(2), onCd ? 0x888888 : color, itemId ? 0.75 : 0.35);
        bg.strokeRoundedRect(bx, by, SZ, SZ, P(6));

        if (itemId) {
          icon.setTexture(`icon_${itemId}`).setVisible(true).setAlpha(onCd ? 0.35 : qty > 0 ? 1 : 0.3);
          qtyTxt.setText(onCd ? `${Math.ceil(cdMs / 1000)}s` : qty > 0 ? `×${qty}` : '');
        } else {
          icon.setVisible(false);
          qtyTxt.setText('');
        }
      });
    };
    this._potionBarRedraw = redraw;

    redraw();
    InventoryStore.onChange(redraw);
    PotionBarStore.onChange(redraw);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      InventoryStore.offChange(redraw);
      PotionBarStore.offChange(redraw);
    });
  }

  private usePotionSlot(itemId: string, rangeColor: number): void {
    if (this.gameOver && itemId !== ITEM_POTION_REVIVE) return;
    if (this.time.now < (this._potionCdUntil.get(itemId) ?? 0)) return;
    const sessionQty = this._sessionQty.get(itemId) ?? 0;
    if (sessionQty <= 0) return;
    this._sessionQty.set(itemId, sessionQty - 1);  // 先遞減，才不會讓 onChange→redraw 讀到舊值
    if (!InventoryStore.spendItem(itemId, 1)) {
      this._sessionQty.set(itemId, sessionQty);    // 萬一 spend 失敗就還原
      return;
    }

    this.playSfx('sfx_potion');
    this._dqPotionThisBattle = true;
    DailyQuestStore.addProgress('use_potion', 1);
    const isBuffPotion = itemId === ITEM_POTION_ATK || itemId === ITEM_POTION_DEF || itemId === ITEM_POTION_SPEED;
    const cdMs = isBuffPotion ? 60000 : 20000;
    this._potionCdUntil.set(itemId, this.time.now + cdMs);
    this.time.addEvent({ delay: 500, repeat: (cdMs / 500) - 1, callback: () => this._potionBarRedraw?.() });

    const range = P(this.POTION_RANGE);
    const sealType = itemId === ITEM_POTION_REVIVE ? 'revive' : 'heal';
    this.showMagicSeal(this.player.x, this.player.y + P(13), range, rangeColor, sealType);

    const baseHeal = itemId === ITEM_POTION_HEALTH_L ? 300 : itemId === ITEM_POTION_HEALTH_M ? 200 : 100;
    const healAmt = Math.round(baseHeal * (1 + (CardStore.getTotalStats().potionHealPct ?? 0)));
    if (itemId === ITEM_POTION_HEALTH_S || itemId === ITEM_POTION_HEALTH_M || itemId === ITEM_POTION_HEALTH_L) {
      this.player.heal(healAmt);
      if (NetworkService.connected) {
        const anyNear = [...this._partners.values()].some(pd =>
          !pd.isDead && Phaser.Math.Distance.Between(this.player.x, this.player.y, pd.sprite.x, pd.sprite.y) <= range
        );
        if (anyNear) NetworkService.sendPotionEffect('heal', healAmt);
      }
    } else if (itemId === ITEM_POTION_REVIVE) {
      if (this.gameOver) {
        this.gameOver = false;
        this.player.revive(0.30);
        this.player.play(`player_idle_${this.player.lastDir}`);
      } else if (NetworkService.connected) {
        this._partners.forEach(pd => {
          if (!pd.isDead) return;
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, pd.sprite.x, pd.sprite.y);
          if (d <= range) {
            NetworkService.sendPotionEffect('revive', 30);
            pd.isDead = false;
            pd.sprite.play(`partner_idle_${pd.prevDir}`, true);
          }
        });
      }
    } else if (itemId === ITEM_POTION_ATK) {
      this._atkBuffActive = true;
      this._atkBuffTimer?.destroy();
      this._atkBuffTimer = this.time.delayedCall(30000, () => {
        this._atkBuffActive = false;
        this._buffExpiry.delete(ITEM_POTION_ATK);
        this.refreshBuffHud();
      });
      this._buffExpiry.set(ITEM_POTION_ATK, this.time.now + 30000);
      this.refreshBuffHud();
      this.showBuffText('ATK +20%', rangeColor);
      if (NetworkService.connected) {
        const anyNear = [...this._partners.values()].some(pd =>
          !pd.isDead && Phaser.Math.Distance.Between(this.player.x, this.player.y, pd.sprite.x, pd.sprite.y) <= range
        );
        if (anyNear) NetworkService.sendPotionEffect('atk', 30000);
      }
    } else if (itemId === ITEM_POTION_DEF) {
      this.player.defBonus = 20;
      this.time.delayedCall(30000, () => {
        this.player.defBonus = 0;
        this._buffExpiry.delete(ITEM_POTION_DEF);
        this.refreshBuffHud();
      });
      this._buffExpiry.set(ITEM_POTION_DEF, this.time.now + 30000);
      this.refreshBuffHud();
      this.showBuffText('DEF +20', rangeColor);
      if (NetworkService.connected) {
        const anyNear = [...this._partners.values()].some(pd =>
          !pd.isDead && Phaser.Math.Distance.Between(this.player.x, this.player.y, pd.sprite.x, pd.sprite.y) <= range
        );
        if (anyNear) NetworkService.sendPotionEffect('def', 30000);
      }
    } else if (itemId === ITEM_POTION_SPEED) {
      this.player.speedBonus = 20;
      this.time.delayedCall(30000, () => {
        this.player.speedBonus = 0;
        this._buffExpiry.delete(ITEM_POTION_SPEED);
        this.refreshBuffHud();
      });
      this._buffExpiry.set(ITEM_POTION_SPEED, this.time.now + 30000);
      this.refreshBuffHud();
      this.showBuffText('SPD +20', rangeColor);
      if (NetworkService.connected) {
        const anyNear = [...this._partners.values()].some(pd =>
          !pd.isDead && Phaser.Math.Distance.Between(this.player.x, this.player.y, pd.sprite.x, pd.sprite.y) <= range
        );
        if (anyNear) NetworkService.sendPotionEffect('speed', 30000);
      }
    }

    SaveStore.save();
  }

  protected refreshBuffHud(): void {
    this._buffHudTexts.forEach(t => t.destroy());
    this._buffHudTexts = [];

    const W = this.scale.width;
    const bw = P(88), bh = P(28), pad = P(8);
    const startY = pad + bh + P(6);
    const lineH = P(18);

    const BUFF_LABELS: Record<string, string> = {
      [ITEM_POTION_ATK]: 'ATK+20%',
      [ITEM_POTION_DEF]: 'DEF+20',
      [ITEM_POTION_SPEED]: 'SPD+20',
    };
    const BUFF_COLORS: Record<string, string> = {
      [ITEM_POTION_ATK]: '#ff8866',
      [ITEM_POTION_DEF]: '#66aaff',
      [ITEM_POTION_SPEED]: '#ffdd44',
    };

    let row = 0;
    for (const [id, expiry] of this._buffExpiry) {
      const remaining = Math.max(0, Math.ceil((expiry - this.time.now) / 1000));
      const label = `${BUFF_LABELS[id] ?? id} ${remaining}s`;
      const txt = this.add.text(W - pad, startY + row * lineH, label, {
        fontSize: F(11), fontStyle: 'bold',
        color: BUFF_COLORS[id] ?? '#ffffff',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(9803);
      this._buffHudTexts.push(txt);
      row++;
    }

    // 暴徒本能
    if (this._bloodlustStacks > 0 && this._bloodlustExpiry > 0) {
      const remaining = Math.max(0, Math.ceil((this._bloodlustExpiry - this.time.now) / 1000));
      const txt = this.add.text(W - pad, startY + row * lineH, `暴徒 ${this._bloodlustStacks}層 ${remaining}s`, {
        fontSize: F(11), fontStyle: 'bold', color: '#ff4466',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(9803);
      this._buffHudTexts.push(txt);
      row++;
    }
    // 嗜血本能
    if (this._sanguineStacks > 0 && this._sanguineExpiry > 0) {
      const remaining = Math.max(0, Math.ceil((this._sanguineExpiry - this.time.now) / 1000));
      const txt = this.add.text(W - pad, startY + row * lineH, `嗜血 ${this._sanguineStacks}層 ${remaining}s`, {
        fontSize: F(11), fontStyle: 'bold', color: '#ff88aa',
        stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0).setScrollFactor(0).setDepth(9803);
      this._buffHudTexts.push(txt);
    }
  }

  private showBuffText(label: string, color: number): void {
    const hex = '#' + color.toString(16).padStart(6, '0');
    const txt = this.add.text(this.player.x, this.player.y - P(30), label, {
      fontSize: F(14), fontStyle: 'bold', color: hex, stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(200);
    this.tweens.add({
      targets: txt, y: txt.y - P(40), alpha: 0, duration: 1200,
      onComplete: () => txt.destroy(),
    });
  }

  private showMagicSeal(x: number, y: number, radius: number, color: number, type: 'heal' | 'revive'): void {
    const c = this.add.container(x, y).setDepth(48);

    const spokes = type === 'heal' ? 6 : 8;

    // ── Glow background ───────────────────
    const bg = this.add.graphics();
    [0.06, 0.04, 0.025].forEach((a, i) => {
      bg.fillStyle(color, a);
      bg.fillCircle(0, 0, radius * (1.4 - i * 0.15));
    });
    c.add(bg);

    // ── Static inner pattern ──────────────
    const mid = this.add.graphics();

    mid.lineStyle(P(1), color, 0.55);
    mid.strokeCircle(0, 0, radius * 0.65);
    mid.lineStyle(P(1), color, 0.4);
    mid.strokeCircle(0, 0, radius * 0.35);

    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      mid.lineStyle(P(1), color, 0.35);
      mid.lineBetween(
        Math.cos(a) * radius * 0.35, Math.sin(a) * radius * 0.35,
        Math.cos(a) * radius * 0.92, Math.sin(a) * radius * 0.92,
      );
    }

    if (type === 'heal') {
      // Hexagram: two overlapping triangles
      [0, Math.PI].forEach(offset => {
        mid.lineStyle(P(1), color, 0.75);
        mid.beginPath();
        for (let i = 0; i <= 3; i++) {
          const a = (i / 3) * Math.PI * 2 + offset + Math.PI / 2;
          const px2 = Math.cos(a) * radius * 0.28, py2 = Math.sin(a) * radius * 0.28;
          i === 0 ? mid.moveTo(px2, py2) : mid.lineTo(px2, py2);
        }
        mid.closePath();
        mid.strokePath();
      });
    } else {
      // 8-pointed star: cross + diagonal cross
      [0, Math.PI / 4].forEach(offset => {
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + offset;
          mid.lineStyle(P(1), color, 0.7);
          mid.lineBetween(
            Math.cos(a) * radius * 0.30, Math.sin(a) * radius * 0.30,
            Math.cos(a + Math.PI) * radius * 0.30, Math.sin(a + Math.PI) * radius * 0.30,
          );
        }
      });
      mid.fillStyle(color, 0.9);
      mid.fillCircle(0, 0, P(3));
    }
    c.add(mid);

    // ── Rotating outer ring ───────────────
    const outer = this.add.graphics();
    outer.lineStyle(P(2), color, 0.9);
    outer.strokeCircle(0, 0, radius);

    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      const dx = Math.cos(a) * radius, dy = Math.sin(a) * radius;
      outer.fillStyle(color, 0.9);
      if (type === 'heal') {
        const s = P(4);
        outer.fillTriangle(dx, dy - s, dx + s, dy, dx, dy + s);
        outer.fillTriangle(dx, dy - s, dx - s, dy, dx, dy + s);
      } else {
        outer.fillCircle(dx, dy, P(3));
        const a2 = ((i + 0.5) / spokes) * Math.PI * 2;
        outer.lineStyle(P(2), color, 0.4);
        outer.lineBetween(
          Math.cos(a2) * radius * 0.86, Math.sin(a2) * radius * 0.86,
          Math.cos(a2) * radius * 0.96, Math.sin(a2) * radius * 0.96,
        );
      }
    }
    c.add(outer);

    // ── Animate ───────────────────────────
    c.setScale(0.15).setAlpha(0);
    this.tweens.add({
      targets: c, scaleX: 1, scaleY: 1, alpha: 1,
      duration: 200, ease: 'Back.Out',
      onComplete: () => {
        this.tweens.add({
          targets: c, alpha: 0,
          duration: 500, delay: 100,
          onComplete: () => c.destroy(),
        });
      },
    });

    this.tweens.add({
      targets: outer,
      angle: type === 'heal' ? 60 : -360,
      duration: type === 'heal' ? 2500 : 1600,
      repeat: -1, ease: 'Linear',
    });
  }

  // ── Scene helpers ─────────────────────────────────────

  protected _initBossBar(): void {
    const W = this.scale.width;
    this.bossHpGfx = this.add.graphics().setScrollFactor(0).setDepth(5).setVisible(false);
    this.bossHpLabel = this.add.text(W / 2, P(6), '', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffcccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(6).setVisible(false);
    this.bossDebuffGfx = this.add.graphics().setScrollFactor(0).setDepth(7).setVisible(false);
    this.bossDebuffTexts.set('burn', this.add.text(0, 0, '', {
      fontSize: F(15), color: '#ffffff', stroke: '#000000', strokeThickness: 2, fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(8).setOrigin(0.5, 0.5).setVisible(false));
  }

  protected addHUD(): void {
    this.addAttackButton();
    this.addLevelHUD();
    this.createPotionSlots();
  }

  protected addLevelHUD(): void {
    const STRIP_H = P(22), EXP_H = P(4);

    this.levelText = this.add.text(P(10), 0, '', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8d090', stroke: '#1a0800', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(102).setOrigin(0, 0.5);

    this.expBarGfx = this.add.graphics().setScrollFactor(0).setDepth(101);

    const draw = () => {
      const W = this.scale.width;
      const H = this.scale.height;
      const top = H - STRIP_H - EXP_H;

      const lv = PlayerStore.getLevel();
      const exp = PlayerStore.getExp();
      const max = PlayerStore.expToNext();
      const pct = Math.min(exp / max, 1);

      // Lv text (left), vertically centred in strip
      const midY = top + STRIP_H / 2;
      this.levelText.setPosition(P(10), midY);
      this.levelText.setText(`Lv.${lv}`);

      // Exp bar (full width, sits below the strip)
      this.expBarGfx.clear();
      this.expBarGfx.fillStyle(0x1a1008, 1);
      this.expBarGfx.fillRect(0, top + STRIP_H, W, EXP_H);
      if (pct > 0) {
        this.expBarGfx.fillStyle(0x44aaff, 1);
        this.expBarGfx.fillRect(0, top + STRIP_H, Math.max(P(4), W * pct), EXP_H);
        // Bright leading edge
        this.expBarGfx.fillStyle(0xaaddff, 0.7);
        this.expBarGfx.fillRect(Math.max(0, W * pct - P(3)), top + STRIP_H, P(3), EXP_H);
      }
    };

    draw();
    PlayerStore.onChange(draw);
    this.scale.on('resize', draw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      PlayerStore.offChange(draw);
      this.scale.off('resize', draw, this);
    });
  }

  protected addAttackButton(): void {
    if ((SkillTreeStore.getAttackMode()) === 'aura') return;
    const isFlower = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || SkillTreeStore.getAttackMode() === 'flowerMode';
    const r = P(52);
    const getBtnCenter = () => ({
      x: this.scale.width - P(70),
      y: this.scale.height - P(70),
    });

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(100).setAlpha(0.25);

    // 花怪模式：充能 UI 覆蓋層（每幀更新）
    if (isFlower) {
      this._flowerChargeGfx = this.add.graphics().setScrollFactor(0).setDepth(101);
      this._flowerChargeTxt = this.add.text(0, 0, '', {
        fontSize: `${Math.round(P(14))}px`, fontStyle: 'bold',
        color: '#ccffcc', stroke: '#003300', strokeThickness: 2,
      }).setScrollFactor(0).setDepth(102).setOrigin(0.5, 0.5);
    }

    const drawBtn = (pressed: boolean) => {
      gfx.clear();
      const { x: cx, y: cy } = getBtnCenter();
      const oy = pressed ? P(1) : 0;
      const flowerNow = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0 || SkillTreeStore.getAttackMode() === 'flowerMode';

      // Drop shadow
      gfx.fillStyle(0x000000, 0.5);
      gfx.fillCircle(cx + P(3), cy + P(3), r);

      if (flowerNow) {
        // ── 花怪模式背景（綠色調）──
        gfx.fillStyle(0x001500, 1);
        gfx.fillCircle(cx, cy, r);
        if (!pressed) {
          gfx.fillStyle(0x006600, 1);
          gfx.fillCircle(cx - P(1), cy - P(1), r - P(2));
        }
        gfx.fillStyle(pressed ? 0x003300 : 0x005500, 1);
        gfx.fillCircle(cx + (pressed ? P(1) : 0), cy + (pressed ? P(1) : 0), r - (pressed ? P(2) : P(4)));
        if (!pressed) {
          gfx.fillStyle(0x44ff44, 0.22);
          gfx.fillCircle(cx - P(5), cy - P(10), P(13));
        }
        // ── 花朵像素圖示 ──
        const fx = cx, fy = cy - P(20) + oy;
        // 花瓣（6片）
        gfx.fillStyle(0xffaacc, 1);
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          gfx.fillCircle(fx + Math.cos(a) * P(9), fy + Math.sin(a) * P(9), P(5));
        }
        // 花蕊
        gfx.fillStyle(0xffee44, 1);
        gfx.fillCircle(fx, fy, P(6));
        gfx.fillStyle(0xffff99, 1);
        gfx.fillCircle(fx - P(1), fy - P(1), P(3));
        // 莖
        gfx.fillStyle(0x44aa44, 1);
        gfx.fillRect(fx - P(1.5), fy + P(5) + oy, P(3), P(10));
      } else {
        // ── 一般劍按鈕 ──
        gfx.fillStyle(0x150000, 1);
        gfx.fillCircle(cx, cy, r);
        if (!pressed) {
          gfx.fillStyle(0xb82800, 1);
          gfx.fillCircle(cx - P(1), cy - P(1), r - P(2));
        }
        gfx.fillStyle(pressed ? 0x4a0e00 : 0x6a1500, 1);
        gfx.fillCircle(cx + (pressed ? P(1) : 0), cy + (pressed ? P(1) : 0), r - (pressed ? P(2) : P(4)));
        if (!pressed) {
          gfx.fillStyle(0xff6633, 0.28);
          gfx.fillCircle(cx - P(5), cy - P(10), P(13));
        }
        const ox = cx;
        gfx.fillStyle(0xdddddd, 1);
        gfx.fillRect(ox - P(2), cy - P(18) + oy, P(4), P(24));
        gfx.fillStyle(0xffffff, 1);
        gfx.fillRect(ox - P(1), cy - P(17) + oy, P(1), P(18));
        gfx.fillStyle(0xbbbbbb, 1);
        gfx.fillRect(ox - P(1), cy - P(20) + oy, P(2), P(2));
        gfx.fillStyle(0xddaa00, 1);
        gfx.fillRect(ox - P(9), cy + P(5) + oy, P(18), P(4));
        gfx.fillStyle(0x997700, 1);
        gfx.fillRect(ox - P(9), cy + P(5) + oy, P(3), P(4));
        gfx.fillRect(ox + P(6), cy + P(5) + oy, P(3), P(4));
        gfx.fillStyle(0x884422, 1);
        gfx.fillRect(ox - P(2), cy + P(9) + oy, P(4), P(9));
        gfx.fillStyle(0xaa6633, 1);
        gfx.fillRect(ox - P(2), cy + P(11) + oy, P(4), P(2));
        gfx.fillRect(ox - P(2), cy + P(14) + oy, P(4), P(2));
        gfx.fillStyle(0xddaa00, 1);
        gfx.fillRect(ox - P(4), cy + P(18) + oy, P(8), P(4));
      }
    };

    drawBtn(false);

    // Use scene-level pointer events so multi-touch works on iOS
    const activeIds = new Set<number>();
    this._atkDragThreshold = P(15);

    const onDown = (ptr: Phaser.Input.Pointer) => {
      const { x: cx, y: cy } = getBtnCenter();
      if (Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) > r) return;
      activeIds.add(ptr.id);
      drawBtn(true);
      if (this.gameOver) return;
      // 記錄拖動起始點（拖動方向功能保留，目前停用）
      this._atkDragPointerId = ptr.id;
      this._atkDragStartX = ptr.x;
      this._atkDragStartY = ptr.y;
      // 按下立即攻擊一次，再啟動持續攻擊 timer
      this._fireHoldAttack();
      this._holdAttackTimer = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => this._fireHoldAttack(),
      });
    };

    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (ptr.id !== this._atkDragPointerId) return;
      const dx = ptr.x - this._atkDragStartX;
      const dy = ptr.y - this._atkDragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const { x: cx, y: cy } = getBtnCenter();

      if (dist >= this._atkDragThreshold) {
        this._atkDragAngle = Math.atan2(dy, dx);
      } else {
        this._atkDragAngle = null;
      }
    };

    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (!activeIds.has(ptr.id)) return;
      activeIds.delete(ptr.id);

      // 清除方向箭頭
      this._atkDirGfx?.clear();
      this._atkDragAngle = null;
      this._atkDragPointerId = -1;

      // 停止持續攻擊 timer
      this._holdAttackTimer?.destroy();
      this._holdAttackTimer = undefined;

      if (activeIds.size === 0) drawBtn(false);

      // ── 原本的放開觸發攻擊邏輯（拖動方向功能，目前停用） ──────────────────
      // const dx = ptr.x - this._atkDragStartX;
      // const dy = ptr.y - this._atkDragStartY;
      // const dist = Math.sqrt(dx * dx + dy * dy);
      // const isDash = (SkillTreeStore.getAttackMode()) === 'dashPierce';
      // const isFlowerModeBtn = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0;
      // if (isFlowerModeBtn) {
      //   this._forceAttackAngle = dist >= this._atkDragThreshold ? Math.atan2(dy, dx) : null;
      //   this.tryFlowerSummonModeAttack();
      // } else if (isDash) {
      //   if (dist >= this._atkDragThreshold) this._forceAttackAngle = Math.atan2(dy, dx);
      //   this.attackDashPierce(0, 0);
      // } else if (dist >= this._atkDragThreshold) {
      //   this._forceAttackAngle = Math.atan2(dy, dx);
      //   this.meleeAttack(this.player.x, this.player.y);
      // } else {
      //   const { x: tx, y: ty } = this.getAttackTarget();
      //   this.meleeAttack(tx, ty);
      // }
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointermove', onMove);
    this.input.on('pointerup', onUp);

    const onResize = () => drawBtn(false);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointermove', onMove);
      this.input.off('pointerup', onUp);
      this.scale.off('resize', onResize);
      this._atkDirGfx?.destroy();
    });
  }

  // ── Shared VFX helpers (called by both local attacks and partner sync) ──────

  private fxSlash180(
    px: number, py: number, sa: number, ea: number, R: number, D: number,
    onSweepHit?: (curEa: number) => void,
  ): void {
    const R2 = R * 0.62;
    const buildCrescent = (outerR: number, innerR: number, steps = 28) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * (i / steps);
        pts.push({ x: px + Math.cos(a) * outerR, y: py + Math.sin(a) * outerR });
      }
      for (let i = steps; i >= 0; i--) {
        const a = sa + (ea - sa) * (i / steps);
        pts.push({ x: px + Math.cos(a) * innerR, y: py + Math.sin(a) * innerR });
      }
      return pts;
    };

    const slashState = { prog: 0 };
    const slashG = this.add.graphics().setDepth(D + 2);
    this.tweens.add({
      targets: slashState, prog: 1, duration: 80, ease: 'Quad.Out',
      onUpdate: () => {
        const curEa = sa + (ea - sa) * slashState.prog;
        onSweepHit?.(curEa);
        slashG.clear();
        const steps = Math.max(4, Math.round(28 * slashState.prog));
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = sa + (curEa - sa) * (i / steps);
          pts.push({ x: px + Math.cos(a) * R, y: py + Math.sin(a) * R });
        }
        for (let i = steps; i >= 0; i--) {
          const a = sa + (curEa - sa) * (i / steps);
          pts.push({ x: px + Math.cos(a) * R2, y: py + Math.sin(a) * R2 });
        }
        slashG.fillStyle(0x5599ff, 0.18);
        slashG.fillPoints(pts.map(p => ({ x: p.x + P(3), y: p.y + P(3) })), true);
        slashG.fillStyle(0xaaddff, 0.55);
        slashG.fillPoints(pts, true);
        slashG.lineStyle(2.5, 0xffffff, 0.9);
        slashG.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = sa + (curEa - sa) * (i / steps);
          const x = px + Math.cos(a) * R, y = py + Math.sin(a) * R;
          i === 0 ? slashG.moveTo(x, y) : slashG.lineTo(x, y);
        }
        slashG.strokePath();
        slashG.lineStyle(1.2, 0xddeeff, 0.55);
        slashG.beginPath();
        for (let i = 0; i <= steps; i++) {
          const a = sa + (curEa - sa) * (i / steps);
          const x = px + Math.cos(a) * R2, y = py + Math.sin(a) * R2;
          i === 0 ? slashG.moveTo(x, y) : slashG.lineTo(x, y);
        }
        slashG.strokePath();
      },
      onComplete: () => {
        this.tweens.add({ targets: slashG, alpha: 0, duration: 140, ease: 'Quad.In', onComplete: () => slashG.destroy() });
      },
    });

    const afterPts = buildCrescent(R, R2 * 0.92);
    const afterG = this.add.graphics().setDepth(D + 1).setAlpha(0);
    afterG.fillStyle(0x3366cc, 0.30); afterG.fillPoints(afterPts, true);
    afterG.lineStyle(1.5, 0x88bbff, 0.50);
    afterG.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = sa + (ea - sa) * (i / 28);
      const x = px + Math.cos(a) * R, y = py + Math.sin(a) * R;
      i === 0 ? afterG.moveTo(x, y) : afterG.lineTo(x, y);
    }
    afterG.strokePath();
    this.tweens.add({
      targets: afterG, alpha: 1, duration: 60, delay: 80,
      onComplete: () => this.tweens.add({ targets: afterG, alpha: 0, duration: 200, onComplete: () => afterG.destroy() })
    });

    const sparkG = this.add.graphics().setDepth(D + 3);
    const SPARKS = 10;
    const sparks = Array.from({ length: SPARKS }, (_, i) => {
      const a = sa + (ea - sa) * (i / (SPARKS - 1));
      const dr = Phaser.Math.FloatBetween(P(8), P(20));
      return {
        x: px + Math.cos(a) * R, y: py + Math.sin(a) * R,
        vx: Math.cos(a) * dr, vy: Math.sin(a) * dr, a: 0.9
      };
    });
    const sparkState = { t: 0 };
    this.tweens.add({
      targets: sparkState, t: 1, duration: 300,
      onUpdate: () => {
        sparkG.clear();
        sparks.forEach(s => {
          s.x += s.vx * 0.08; s.y += s.vy * 0.08; s.a *= 0.90;
          sparkG.fillStyle(0xffffff, s.a * 0.9); sparkG.fillCircle(s.x, s.y, P(2));
          sparkG.fillStyle(0x88ccff, s.a * 0.5); sparkG.fillCircle(s.x, s.y, P(4));
        });
      },
      onComplete: () => sparkG.destroy(),
    });

    const flashG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
    flashG.fillStyle(0xffffff, 0.55); flashG.fillCircle(0, 0, P(10));
    flashG.fillStyle(0x88ccff, 0.30); flashG.fillCircle(0, 0, P(20));
    this.tweens.add({ targets: flashG, alpha: 0, duration: 180, onComplete: () => flashG.destroy() });
  }

  private fxWhirlwind(px: number, py: number, RANGE: number, D: number): void {
    for (let i = 0; i < 3; i++) {
      const rs = { r: RANGE * (0.15 + i * 0.12), a: 1.0 - i * 0.2 };
      const rG = this.add.graphics().setDepth(D + 1).setPosition(px, py);
      this.tweens.add({
        targets: rs, r: RANGE * (1.05 + i * 0.18), a: 0,
        duration: 420 + i * 70, delay: i * 55, ease: 'Quad.Out',
        onUpdate: () => {
          rG.clear();
          rG.lineStyle(3.5 - i, i === 0 ? 0xffffff : 0x66aaff, rs.a);
          rG.strokeCircle(0, 0, rs.r);
          if (i === 0) {
            rG.lineStyle(8, 0x2255cc, rs.a * 0.18);
            rG.strokeCircle(0, 0, rs.r);
          }
        },
        onComplete: () => rG.destroy(),
      });
    }

    const spiralG = this.add.graphics().setDepth(D + 2).setPosition(px, py);
    const sp = { prog: 0 };
    this.tweens.add({
      targets: sp, prog: 1, duration: 220, ease: 'Cubic.Out',
      onUpdate: () => {
        spiralG.clear();
        const ARMS = 4, STEPS = 22;
        for (let arm = 0; arm < ARMS; arm++) {
          const base = (arm / ARMS) * Math.PI * 2;
          const color = arm % 2 === 0 ? 0x88ccff : 0xcceeff;
          spiralG.lineStyle(2.2, color, 0.85 * (1 - sp.prog * 0.45));
          spiralG.beginPath();
          for (let s = 0; s <= STEPS; s++) {
            const t = (s / STEPS) * sp.prog;
            const a = base + t * Math.PI * 1.6;
            const r = t * RANGE * 0.95;
            if (s === 0) spiralG.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else spiralG.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          spiralG.strokePath();
        }
      },
      onComplete: () => {
        this.tweens.add({ targets: spiralG, alpha: 0, duration: 180, onComplete: () => spiralG.destroy() });
      },
    });

    const flashG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
    flashG.fillStyle(0xffffff, 0.7); flashG.fillCircle(0, 0, P(14));
    flashG.fillStyle(0x88ddff, 0.45); flashG.fillCircle(0, 0, P(30));
    flashG.fillStyle(0x2255cc, 0.20); flashG.fillCircle(0, 0, RANGE * 0.6);
    this.tweens.add({ targets: flashG, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => flashG.destroy() });
  }

  private fxDashPierce(sx: number, sy: number, endX: number, endY: number, rad: number, D: number): void {
    const perpRad = rad + Math.PI / 2;
    const trailG = this.add.graphics().setDepth(D);
    const sweep = { t: 0 };
    this.tweens.add({
      targets: sweep, t: 1, duration: 160, ease: 'Quad.Out',
      onUpdate: () => {
        trailG.clear();
        const hx = sx + (endX - sx) * sweep.t;
        const hy = sy + (endY - sy) * sweep.t;
        const STEPS = 14;
        for (let i = 0; i <= STEPS; i++) {
          const f = i / STEPS;
          const tx = sx + (hx - sx) * f, ty = sy + (hy - sy) * f;
          trailG.fillStyle(0x2255cc, f * 0.22); trailG.fillCircle(tx, ty, P(10) + f * P(5));
          trailG.fillStyle(0x66aaff, f * 0.45); trailG.fillCircle(tx, ty, P(5) + f * P(3));
        }
        trailG.lineStyle(P(1), 0xddeeff, 0.75);
        trailG.lineBetween(sx, sy, hx, hy);
        trailG.fillStyle(0xffffff, 0.95); trailG.fillCircle(hx, hy, P(4));
        trailG.fillStyle(0x99ddff, 0.55); trailG.fillCircle(hx, hy, P(9));
        [P(10), P(16)].forEach((len, idx) => {
          trailG.lineStyle(P(1), 0xaaddff, 0.75 - idx * 0.3);
          trailG.lineBetween(
            hx + Math.cos(perpRad) * len, hy + Math.sin(perpRad) * len,
            hx - Math.cos(perpRad) * len, hy - Math.sin(perpRad) * len,
          );
        });
      },
      onComplete: () => {
        this.tweens.add({ targets: trailG, alpha: 0, duration: 240, onComplete: () => trailG.destroy() });
      },
    });

    this.time.delayedCall(130, () => {
      const ringG = this.add.graphics().setDepth(D + 1).setPosition(endX, endY);
      const state = { r: P(6), a: 0.85 };
      this.tweens.add({
        targets: state, r: P(40), a: 0, duration: 320, ease: 'Quad.Out',
        onUpdate: () => {
          ringG.clear();
          ringG.lineStyle(P(3), 0x88ccff, state.a);
          ringG.strokeCircle(0, 0, state.r);
          ringG.lineStyle(P(1), 0xffffff, state.a * 0.5);
          ringG.strokeCircle(0, 0, state.r + P(4));
        },
        onComplete: () => ringG.destroy(),
      });
    });
  }

  private fxProjectile(
    startX: number, startY: number, rad: number, D: number,
    SPEED: number, MAX_DIST: number,
    onTick?: (x: number, y: number) => void,
  ): void {
    const buildCrescent = (outerR: number, innerR: number, ox: number): { x: number; y: number }[] => {
      const steps = 32;
      const sa = -115 * Math.PI / 180, ea = 115 * Math.PI / 180;
      const outer: { x: number; y: number }[] = [];
      const inner: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * i / steps;
        outer.push({ x: Math.cos(a) * outerR, y: Math.sin(a) * outerR });
      }
      for (let i = steps; i >= 0; i--) {
        const a = sa + (ea - sa) * i / steps;
        inner.push({ x: ox + Math.cos(a) * innerR, y: Math.sin(a) * innerR });
      }
      return [...outer, ...inner];
    };

    const proj = this.add.graphics().setDepth(D);
    const trail = this.add.graphics().setDepth(D - 1);
    proj.setPosition(startX, startY);
    proj.setRotation(rad);

    const trailHistory: { x: number; y: number }[] = [];

    const launchFlash = this.add.graphics().setDepth(D + 1);
    launchFlash.fillStyle(0xffdd44, 0.55);
    launchFlash.fillCircle(startX, startY, P(20));
    this.tweens.add({ targets: launchFlash, alpha: 0, duration: 160, onComplete: () => launchFlash.destroy() });

    const drawProj = (t: number) => {
      if (!proj.active) return;
      proj.clear();
      proj.fillStyle(0xffee44, 0.07); proj.fillCircle(0, 0, P(28));
      proj.fillStyle(0xffcc00, 0.13); proj.fillCircle(0, 0, P(21));
      proj.fillStyle(0xff9900, 0.20); proj.fillPoints(buildCrescent(P(20), 0, 0), true);
      proj.fillStyle(0xffaa00, 0.95); proj.fillPoints(buildCrescent(P(18), P(11), P(8)), true);
      proj.fillStyle(0xffdd55, 0.65); proj.fillPoints(buildCrescent(P(18), P(11), P(8)), true);
      proj.fillStyle(0xffffff, 0.35); proj.fillPoints(buildCrescent(P(17), P(13), P(9)), true);
      const steps = 32, sa = -115 * Math.PI / 180, ea = 115 * Math.PI / 180;
      proj.lineStyle(P(2), 0xffffff, 0.95);
      proj.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * i / steps;
        i === 0 ? proj.moveTo(Math.cos(a) * P(18), Math.sin(a) * P(18))
          : proj.lineTo(Math.cos(a) * P(18), Math.sin(a) * P(18));
      }
      proj.strokePath();
      for (let i = 0; i < 4; i++) {
        const a = sa + (ea - sa) * (i / 3);
        const sp = 0.55 + Math.sin(t * 0.018 + i * 1.3) * 0.35;
        proj.fillStyle(0xffffff, sp);
        proj.fillCircle(Math.cos(a) * P(18), Math.sin(a) * P(18), P(2));
      }
    };

    const updateTrail = () => {
      if (!trail.active) return;
      trailHistory.push({ x: proj.x, y: proj.y });
      if (trailHistory.length > 10) trailHistory.shift();
      trail.clear();
      trailHistory.forEach((p, i) => {
        const frac = i / trailHistory.length;
        const alpha = frac * 0.45;
        const r = frac * P(10) + P(3);
        trail.fillStyle(0xffaa00, alpha); trail.fillCircle(p.x, p.y, r);
        trail.fillStyle(0xffee88, alpha * 0.5); trail.fillCircle(p.x, p.y, r * 0.5);
      });
    };

    let elapsed = 0;
    let traveled = 0;
    const tickMs = 16;
    const stepPx = SPEED * tickMs / 1000;

    const cleanup = () => { trail.destroy(); if (proj.active) proj.destroy(); };

    this.time.addEvent({
      delay: tickMs,
      repeat: Math.ceil(MAX_DIST / stepPx),
      callback: () => {
        if (!proj.active) return;
        elapsed += tickMs;
        traveled += stepPx;
        proj.x += Math.cos(rad) * stepPx;
        proj.y += Math.sin(rad) * stepPx;
        drawProj(elapsed);
        updateTrail();
        onTick?.(proj.x, proj.y);
        if (traveled >= MAX_DIST) cleanup();
      },
    });
  }

  private fxMultiHitSlash(px: number, py: number, D: number, rad0: number, hitIdx: number, RANGE: number): void {
    const DELAYS = [55, 115, 175, 235, 310];
    const baseCfgs = [
      { tilt: -0.38, arcSpan: 1.0, rMult: 0.78, color: 0x66aaee, glowW: 8 },
      { tilt: 0.38, arcSpan: 1.0, rMult: 0.78, color: 0x66aaee, glowW: 8 },
      { tilt: -0.18, arcSpan: 1.2, rMult: 0.88, color: 0x99ccff, glowW: 11 },
      { tilt: 0.18, arcSpan: 1.2, rMult: 0.88, color: 0x99ccff, glowW: 11 },
      { tilt: 0, arcSpan: 1.6, rMult: 0.97, color: 0xffffff, glowW: 16 },
    ];
    const STEPS = 20;

    const b = baseCfgs[hitIdx];
    const tilt = b.tilt + Phaser.Math.FloatBetween(-0.12, 0.12);
    const span = b.arcSpan + Phaser.Math.FloatBetween(-0.12, 0.12);
    const r = RANGE * (b.rMult + Phaser.Math.FloatBetween(-0.06, 0.06));
    const midAngle = rad0 + tilt;
    const halfSpan = span / 2 + Phaser.Math.FloatBetween(-0.06, 0.06);
    const slashRot = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6);

    const drawArcSegment = (g: Phaser.GameObjects.Graphics, prog: number, alpha: number) => {
      const sa = midAngle - halfSpan * prog;
      const ea = midAngle + halfSpan * prog;
      const rOut = r;
      const rIn = r * 0.38;
      const arcCx = px + Math.cos(midAngle) * (rOut + rIn) / 2;
      const arcCy = py + Math.sin(midAngle) * (rOut + rIn) / 2;
      const cosR = Math.cos(slashRot), sinR = Math.sin(slashRot);
      const rot2d = (x: number, y: number) => {
        const dx = x - arcCx, dy = y - arcCy;
        return new Phaser.Math.Vector2(arcCx + dx * cosR - dy * sinR, arcCy + dx * sinR + dy * cosR);
      };
      const outerPts: Phaser.Math.Vector2[] = [];
      const innerPts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i <= STEPS; i++) {
        const angle = sa + (ea - sa) * (i / STEPS);
        outerPts.push(rot2d(px + Math.cos(angle) * rOut, py + Math.sin(angle) * rOut));
        innerPts.push(rot2d(px + Math.cos(angle) * rIn, py + Math.sin(angle) * rIn));
      }
      const wedgePts = [...outerPts, ...[...innerPts].reverse()];
      g.fillStyle(b.color, 0.13 * alpha);
      g.fillPoints(wedgePts, true);
      const strokeArc = (pts: Phaser.Math.Vector2[], w: number, col: number, a: number) => {
        g.lineStyle(w, col, a * alpha);
        g.beginPath();
        pts.forEach((p, i) => i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y));
        g.strokePath();
      };
      strokeArc(outerPts, b.glowW + 12, b.color, 0.08);
      strokeArc(outerPts, b.glowW, b.color, 0.32);
      strokeArc(outerPts, b.glowW * 0.45, 0xddeeff, 0.72);
      strokeArc(outerPts, 2.2, 0xffffff, 1.0);
      strokeArc(innerPts, 1.5, 0xffffff, 0.45);
      g.fillStyle(0xffffff, 0.9 * alpha);
      g.fillCircle(outerPts[0].x, outerPts[0].y, P(3));
      g.fillCircle(outerPts[STEPS].x, outerPts[STEPS].y, P(3));
    };

    const slG = this.add.graphics().setDepth(D + 3);
    const sw = { prog: 0 };
    const hold = 450 - DELAYS[hitIdx] - 35;

    this.tweens.add({
      targets: sw, prog: 1, duration: 35, ease: 'Cubic.Out',
      onUpdate: () => { slG.clear(); drawArcSegment(slG, sw.prog, 1); },
      onComplete: () => {
        const fa = { a: 1.0 };
        this.tweens.add({
          targets: fa, a: 0, duration: hold, ease: 'Quad.In',
          onUpdate: () => { slG.clear(); drawArcSegment(slG, 1, fa.a); },
          onComplete: () => slG.destroy(),
        });
      },
    });

    const fG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
    fG.fillStyle(0xffffff, 0.55 + hitIdx * 0.08); fG.fillCircle(0, 0, P(5) + hitIdx * P(1));
    fG.fillStyle(b.color, 0.30); fG.fillCircle(0, 0, P(11) + hitIdx * P(2));
    this.tweens.add({ targets: fG, alpha: 0, duration: 120, onComplete: () => fG.destroy() });

    if (hitIdx === 4) {
      const ringState = { r: P(8), a: 0.9 };
      const ringG = this.add.graphics().setDepth(D + 2).setPosition(
        px + Math.cos(rad0) * RANGE * 0.7,
        py + Math.sin(rad0) * RANGE * 0.7,
      );
      this.tweens.add({
        targets: ringState, r: P(38), a: 0, duration: 280, ease: 'Quad.Out',
        onUpdate: () => {
          ringG.clear();
          ringG.lineStyle(P(3), 0xffffff, ringState.a);
          ringG.strokeCircle(0, 0, ringState.r);
          ringG.lineStyle(P(7), 0x88ccff, ringState.a * 0.25);
          ringG.strokeCircle(0, 0, ringState.r);
        },
        onComplete: () => ringG.destroy(),
      });
    }
  }

  private fxChargeSlam(px: number, py: number, R: number, D: number): void {
    const ground = this.add.graphics().setDepth(D);
    ground.fillStyle(0xffcc00, 0.12);
    ground.fillCircle(px, py, R);
    this.tweens.add({ targets: ground, alpha: 0, duration: 500, onComplete: () => ground.destroy() });

    const cracks = this.add.graphics().setDepth(D + 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const r1 = R * 0.25;
      const r2 = R * Phaser.Math.FloatBetween(0.75, 1.0);
      cracks.lineStyle(2, 0xffee88, 0.9);
      cracks.beginPath();
      cracks.moveTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
      cracks.lineTo(px + Math.cos(a) * r2, py + Math.sin(a) * r2);
      cracks.strokePath();
      const midA = a + Phaser.Math.FloatBetween(-0.4, 0.4);
      const midR = r1 + (r2 - r1) * 0.5;
      cracks.lineStyle(1, 0xffee88, 0.5);
      cracks.beginPath();
      cracks.moveTo(px + Math.cos(a) * midR, py + Math.sin(a) * midR);
      cracks.lineTo(px + Math.cos(midA) * (midR + P(12)), py + Math.sin(midA) * (midR + P(12)));
      cracks.strokePath();
    }
    this.tweens.add({ targets: cracks, alpha: 0, duration: 400, delay: 80, onComplete: () => cracks.destroy() });

    const ring1 = this.add.graphics().setDepth(D + 2);
    this.tweens.addCounter({
      from: 0, to: R, duration: 320, ease: 'Expo.Out',
      onUpdate: t => {
        const r = t.getValue() ?? 0, a = 1 - r / R;
        ring1.clear(); ring1.lineStyle(5, 0xffaa00, a); ring1.strokeCircle(px, py, r);
      },
      onComplete: () => ring1.destroy(),
    });

    const ring2 = this.add.graphics().setDepth(D + 3);
    this.tweens.addCounter({
      from: 0, to: R * 0.9, duration: 180, ease: 'Expo.Out',
      onUpdate: t => {
        const r = t.getValue() ?? 0, a = 1 - r / (R * 0.9);
        ring2.clear(); ring2.lineStyle(2, 0xffffff, a); ring2.strokeCircle(px, py, r);
      },
      onComplete: () => ring2.destroy(),
    });

    const flashR = Math.min(P(16), R * 0.2);
    const flash = this.add.graphics().setDepth(D + 4);
    this.tweens.addCounter({
      from: 0, to: flashR, duration: 200, ease: 'Quad.Out',
      onUpdate: t => {
        const r = t.getValue() ?? 0, a = 1 - r / flashR;
        flash.clear(); flash.fillStyle(0xffffff, a); flash.fillCircle(px, py, r);
      },
      onComplete: () => flash.destroy(),
    });
  }

  private fxBoomerang(
    startX: number, startY: number, destX: number, destY: number,
    rad: number, D: number, HIT_R: number, SPIN_R: number, SPIN_MS: number,
    getReturnPos: () => { x: number; y: number },
    cbs?: {
      onHitOut?: (bx: number, by: number) => boolean;
      onSpinTick?: (bx: number, by: number) => void;
      onHitBack?: (bx: number, by: number) => void;
    },
  ): void {
    const blade = this.add.graphics().setDepth(D + 1);
    blade.setPosition(startX, startY);
    const trail = this.add.graphics().setDepth(D);
    const trailPts: { x: number; y: number; alpha: number }[] = [];
    let rot = 0;

    const drawBlade = () => {
      if (!blade.active) return;
      blade.clear();
      blade.fillStyle(0x1144cc, 0.10); blade.fillCircle(0, 0, HIT_R + 2);
      blade.fillStyle(0x3377ff, 0.20); blade.fillCircle(0, 0, HIT_R - 2);
      const pulse = 0.45 + Math.sin(rot * 5) * 0.2;
      blade.lineStyle(1.5, 0x99ddff, pulse);
      blade.strokeCircle(0, 0, HIT_R);
      for (let w = 0; w < 3; w++) {
        const ba = rot + (w / 3) * Math.PI * 2;
        const tipX = Math.cos(ba) * HIT_R, tipY = Math.sin(ba) * HIT_R;
        const lX = Math.cos(ba + 0.52) * HIT_R * 0.43, lY = Math.sin(ba + 0.52) * HIT_R * 0.43;
        const rX = Math.cos(ba - 0.52) * HIT_R * 0.43, rY = Math.sin(ba - 0.52) * HIT_R * 0.43;
        const cX = Math.cos(ba + Math.PI) * HIT_R * 0.15, cY = Math.sin(ba + Math.PI) * HIT_R * 0.15;
        blade.fillStyle(0x112244, 0.6);
        blade.fillTriangle(tipX * 0.9, tipY * 0.9, lX, lY, cX, cY);
        blade.fillTriangle(tipX * 0.9, tipY * 0.9, rX, rY, cX, cY);
        blade.fillStyle(0x88ccff, 0.95);
        blade.fillTriangle(tipX, tipY, lX, lY, cX, cY);
        blade.fillTriangle(tipX, tipY, rX, rY, cX, cY);
        blade.fillStyle(0xeef8ff, 0.85);
        blade.fillTriangle(tipX, tipY, (tipX + lX) * 0.55, (tipY + lY) * 0.55, (tipX + cX) * 0.55, (tipY + cY) * 0.55);
      }
      blade.fillStyle(0x3366cc, 1); blade.fillCircle(0, 0, P(5));
      blade.fillStyle(0xaaddff, 1); blade.fillCircle(0, 0, P(3));
      blade.fillStyle(0xffffff, 1); blade.fillCircle(0, 0, P(2));
    };

    const updateTrail = () => {
      if (!trail.active) return;
      trailPts.push({ x: blade.x, y: blade.y, alpha: 0.55 });
      if (trailPts.length > 14) trailPts.shift();
      trail.clear();
      trailPts.forEach((p, i) => {
        p.alpha *= 0.80;
        const sz = (i / trailPts.length) * P(7) + P(1);
        trail.fillStyle(0x55aaff, p.alpha);
        trail.fillCircle(p.x, p.y, sz);
      });
    };

    const spinTicker = this.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => { rot += 0.22; drawBlade(); updateTrail(); },
    });
    drawBlade();

    const launchFlash = this.add.graphics().setDepth(D + 2);
    launchFlash.fillStyle(0x99ddff, 0.65);
    launchFlash.fillCircle(startX, startY, P(22));
    this.tweens.add({ targets: launchFlash, alpha: 0, duration: 200, onComplete: () => launchFlash.destroy() });

    let spinStarted = false;
    const startSpin = () => {
      if (spinStarted) return;
      spinStarted = true;
      const sx = blade.x, sy = blade.y;

      const spinOrb = this.add.graphics().setDepth(D);
      let orbRot = 0;
      const orbTicker = this.time.addEvent({
        delay: 16, repeat: -1,
        callback: () => {
          if (!spinOrb.active) return;
          spinOrb.clear();
          orbRot += 0.10;
          for (let i = 0; i < 4; i++) {
            const a = orbRot + (i / 4) * Math.PI * 2;
            const ox = sx + Math.cos(a) * SPIN_R, oy = sy + Math.sin(a) * SPIN_R;
            spinOrb.fillStyle(0x66bbff, 0.4 + Math.sin(orbRot * 3 + i) * 0.3);
            spinOrb.fillCircle(ox, oy, P(4));
          }
          spinOrb.lineStyle(1.5, 0x99eeff, 0.3 + Math.sin(orbRot * 6) * 0.15);
          spinOrb.strokeCircle(sx, sy, SPIN_R);
        },
      });

      const spinDmgEvent = this.time.addEvent({
        delay: Math.round(SPIN_MS / 4), repeat: 3,
        callback: () => { if (blade.active) cbs?.onSpinTick?.(blade.x, blade.y); },
      });

      this.time.delayedCall(SPIN_MS, () => {
        spinDmgEvent.destroy();
        orbTicker.destroy();
        spinOrb.destroy();
        trailPts.length = 0;

        const retFlash = this.add.graphics().setDepth(D + 2);
        retFlash.fillStyle(0xffffff, 0.45);
        retFlash.fillCircle(sx, sy, SPIN_R);
        this.tweens.add({ targets: retFlash, alpha: 0, duration: 140, onComplete: () => retFlash.destroy() });

        const { x: retX, y: retY } = getReturnPos();
        this.tweens.add({
          targets: blade, x: retX, y: retY, duration: 260, ease: 'Quad.In',
          onUpdate: () => { if (blade.active) cbs?.onHitBack?.(blade.x, blade.y); },
          onComplete: () => {
            spinTicker.destroy();
            trail.destroy();
            if (blade.active) blade.destroy();
            const catchFlash = this.add.graphics().setDepth(D + 2);
            catchFlash.fillStyle(0x99ddff, 0.75);
            catchFlash.fillCircle(retX, retY, P(20));
            this.tweens.add({ targets: catchFlash, alpha: 0, duration: 200, onComplete: () => catchFlash.destroy() });
          },
        });
      });
    };

    const outTween = this.tweens.add({
      targets: blade, x: destX, y: destY, duration: 320, ease: 'Linear',
      onUpdate: () => {
        if (cbs?.onHitOut?.(blade.x, blade.y)) {
          outTween.stop();
          startSpin();
        }
      },
      onComplete: () => startSpin(),
    });
  }

  private fxMagicFireGround(fx: number, fy: number): void {
    const FIRE_R = P(25);
    const FIRE_DUR = 3000;

    const flash = this.add.graphics().setDepth(15);
    flash.fillStyle(0xff8800, 0.55); flash.fillCircle(fx, fy, FIRE_R);
    flash.fillStyle(0xffcc44, 0.45); flash.fillCircle(fx, fy, FIRE_R * 0.6);
    this.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });

    const cracks: { a1: number; r1: number; a2: number; r2: number }[] = [];
    for (let i = 0; i < 9; i++) {
      cracks.push({
        a1: (i / 9) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2),
        r1: FIRE_R * Phaser.Math.FloatBetween(0.05, 0.2),
        a2: (i / 9) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4),
        r2: FIRE_R * Phaser.Math.FloatBetween(0.55, 0.95),
      });
    }

    const fire = this.add.graphics().setDepth(3);
    let fireT = 0;

    const drawWavy = (r: number, amp: number, freq: number, phase: number, color: number, alpha: number) => {
      const pts: { x: number; y: number }[] = [];
      const steps = 22;
      for (let i = 0; i <= steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const wave = r * (1 + Math.sin(a * freq + phase) * amp);
        pts.push({ x: fx + Math.cos(a) * wave, y: fy + Math.sin(a) * wave });
      }
      fire.fillStyle(color, alpha);
      fire.fillPoints(pts, true);
    };

    const fireAnim = this.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => {
        if (!fire.active) return;
        fireT += 16;
        fire.clear();
        fire.fillStyle(0x0d0200, 0.85); fire.fillCircle(fx, fy, FIRE_R + 3);
        for (const c of cracks) {
          fire.lineStyle(1, 0x3a0800, 0.5);
          fire.beginPath();
          fire.moveTo(fx + Math.cos(c.a1) * c.r1, fy + Math.sin(c.a1) * c.r1);
          fire.lineTo(fx + Math.cos(c.a2) * c.r2, fy + Math.sin(c.a2) * c.r2);
          fire.strokePath();
        }
        const t = fireT * 0.001;
        drawWavy(FIRE_R, 0.10, 4, t * 4.5, 0x881000, 0.75);
        drawWavy(FIRE_R * 0.80, 0.12, 5, t * 5.5 + 1, 0xcc2200, 0.70);
        drawWavy(FIRE_R * 0.60, 0.13, 4, t * 7.0 + 2, 0xff4400, 0.75);
        drawWavy(FIRE_R * 0.42, 0.11, 3, t * 9.0 + 0.5, 0xff7700, 0.80);
        drawWavy(FIRE_R * 0.25, 0.09, 3, t * 11 + 1.5, 0xffaa00, 0.85);
        const pulse = Math.sin(fireT / 90) * 0.08;
        fire.fillStyle(0xffdd44, 0.9); fire.fillCircle(fx, fy, FIRE_R * (0.12 + pulse));
        fire.fillStyle(0xffffff, 0.6); fire.fillCircle(fx, fy, FIRE_R * 0.05);
        for (let i = 0; i < 6; i++) {
          const ea = (i / 6) * Math.PI * 2 + t * (i % 2 === 0 ? 3 : -4);
          const er = FIRE_R * (0.28 + Math.sin(fireT / 140 + i * 1.1) * 0.12);
          const ea2 = 0.55 + Math.sin(fireT / 80 + i * 0.8) * 0.3;
          fire.fillStyle(0xffee66, ea2);
          fire.fillCircle(fx + Math.cos(ea) * er, fy + Math.sin(ea) * er, P(3));
        }
      },
    });

    this.time.delayedCall(FIRE_DUR - 400, () => {
      this.tweens.add({
        targets: fire, alpha: 0, duration: 400,
        onComplete: () => { fireAnim.destroy(); fire.destroy(); },
      });
    });
  }

  private fxMagicFire(
    startX: number, startY: number, rad: number, D: number,
    SPEED: number, MAX_DIST: number,
    onTick?: (x: number, y: number) => boolean,
    onLand?: (fx: number, fy: number) => void,
  ): void {
    const ORB_R = P(14);
    const orb = this.add.graphics().setDepth(D + 1);
    orb.setPosition(startX, startY);
    let orbT = 0;

    const drawOrb = () => {
      if (!orb.active) return;
      orb.clear();
      const p = Math.sin(orbT / 80) * 2;
      const r = ORB_R * 0.5;
      orb.fillStyle(0xff4400, 0.30); orb.fillCircle(0, 0, r + 3 + p * 0.5);
      orb.fillStyle(0xff6600, 0.90); orb.fillCircle(0, 0, r);
      orb.fillStyle(0xffaa00, 0.85); orb.fillCircle(0, 0, r * 0.65);
      orb.fillStyle(0xffee66, 0.90); orb.fillCircle(-1, -1, r * 0.32);
    };
    const orbAnim = this.time.addEvent({ delay: 16, repeat: -1, callback: () => { orbT += 16; drawOrb(); } });
    drawOrb();

    const land = (fx: number, fy: number) => {
      orbAnim.destroy();
      if (orb.active) orb.destroy();
      onLand?.(fx, fy);
    };

    let traveled = 0;
    let landed = false;
    const tickMs = 16;
    const stepPx = SPEED * tickMs / 1000;

    this.time.addEvent({
      delay: tickMs,
      repeat: Math.ceil(MAX_DIST / stepPx) + 1,
      callback: () => {
        if (!orb.active || landed) return;
        traveled += stepPx;
        orb.x += Math.cos(rad) * stepPx;
        orb.y += Math.sin(rad) * stepPx;
        if (onTick?.(orb.x, orb.y)) { landed = true; land(orb.x, orb.y); return; }
        if (traveled >= MAX_DIST && !landed) { landed = true; land(orb.x, orb.y); }
      },
    });
  }

  private _getOrCreatePartner(sessionId: string, nickname = '', skinId = 0): PartnerData {
    if (this._partners.has(sessionId)) return this._partners.get(sessionId)!;

    const tints = [0x44aaff, 0xffaa44, 0xee44ee];
    const tint = tints[this._partners.size % tints.length];

    const pScale = 1.5 * DPR;
    const sprite = this.add.sprite(this.playerStartX, this.playerStartY, 'partner_idle_shadow')
      .setScale(pScale).setDepth(9).setTint(tint);
    sprite.play('partner_idle_down', true);

    const label = this.add.text(this.playerStartX, this.playerStartY - P(40), nickname || '?', {
      fontSize: F(11), fontStyle: 'bold', color: '#88ccff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1).setDepth(12);

    const hpBar = this.add.graphics().setDepth(11);
    const auraRing = this.add.graphics().setDepth(8).setVisible(false);
    this.tweens.add({
      targets: auraRing, alpha: { from: 0.25, to: 0.55 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    const pd: PartnerData = {
      sessionId, sprite, label, hpBar, auraRing,
      hp: 100, maxHp: 100, isDead: false,
      prevX: 0, prevY: 0, prevDir: 'down',
      behavior: 'slash180', skinId,
    };
    this._partners.set(sessionId, pd);
    return pd;
  }

  private _drawPartnerHpBarFor(pd: PartnerData): void {
    const bx = pd.sprite.x;
    const by = pd.sprite.y - P(35);
    const W = P(44), H = P(5);
    const pct = pd.maxHp > 0 ? Math.max(0, Math.min(1, pd.hp / pd.maxHp)) : 1;
    const fillColor = pct > 0.5 ? 0x44ff88 : pct > 0.25 ? 0xffee44 : 0xff4444;
    pd.hpBar.clear();
    pd.hpBar.fillStyle(0x000000, 0.65);
    pd.hpBar.fillRect(bx - W / 2 - 1, by - 1, W + 2, H + 2);
    pd.hpBar.fillStyle(0x222222, 0.9);
    pd.hpBar.fillRect(bx - W / 2, by, W, H);
    if (pct > 0) {
      pd.hpBar.fillStyle(fillColor, 1);
      pd.hpBar.fillRect(bx - W / 2 + 1, by + 1, (W - 2) * pct, H - 2);
    }
  }

  private fxKnifeThrow(x: number, y: number, dirRad: number): void {
    const count = 6;
    const SPEED = P(468);
    const MAX_DIST = P(200);
    const D = 26;
    for (let i = 0; i < count; i++) {
      const angle = dirRad + (i / (count - 1) - 0.5) * Math.PI; // ±90° fan
      const vx = Math.cos(angle) * SPEED;
      const vy = Math.sin(angle) * SPEED;

      const gfx = this.add.graphics({ x, y }).setDepth(D);
      gfx.setRotation(angle);
      gfx.fillStyle(0xe8e8ff, 1);
      gfx.fillTriangle(P(8), 0, -P(5), -P(1.5), -P(5), P(1.5));
      gfx.lineStyle(P(0.8), 0xffffff, 0.7);
      gfx.beginPath(); gfx.moveTo(-P(4), -P(0.8)); gfx.lineTo(P(7), 0); gfx.strokePath();
      gfx.fillStyle(0x886644, 1);
      gfx.fillRect(-P(7), -P(1.2), P(3), P(2.4));
      gfx.fillStyle(0xaaaaaa, 1);
      gfx.fillRect(-P(5), -P(2.5), P(1.5), P(5));

      const spark = this.add.graphics({ x, y }).setDepth(D - 1);
      spark.fillStyle(0xffffff, 0.6);
      spark.fillCircle(0, 0, P(3));
      this.tweens.add({
        targets: spark, alpha: 0, scaleX: 0.1, scaleY: 0.1,
        x: x - Math.cos(angle) * P(8), y: y - Math.sin(angle) * P(8),
        duration: 180, ease: 'Quad.Out', onComplete: () => spark.destroy()
      });

      this._partnerKnives.push({ gfx, x, y, vx, vy, spawnX: x, spawnY: y, maxDist: MAX_DIST });
    }
  }

  // ── Partner attack VFX ───────────────────────────────────────
  private showPartnerAttackFX(behavior: string, x: number, y: number, dir: string): void {
    const D = 20;
    const parsed = parseFloat(dir);
    const dirRad = isNaN(parsed)
      ? (({ down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 } as Record<string, number>)[dir] ?? 0)
      : parsed;
    const deg = Phaser.Math.RadToDeg(dirRad);

    switch (behavior) {
      case 'slash180': {
        const arc = 180;
        const sa = Phaser.Math.DegToRad(deg - arc / 2);
        const ea = Phaser.Math.DegToRad(deg + arc / 2);
        this.fxSlash180(x, y, sa, ea, MELEE_RANGE, D);
        break;
      }
      case 'whirlwind':
        this.fxWhirlwind(x, y, MELEE_RANGE * 1.1, D);
        break;
      case 'dashPierce': {
        const endX = x + Math.cos(dirRad) * P(78);
        const endY = y + Math.sin(dirRad) * P(78);
        this.fxDashPierce(x, y, endX, endY, dirRad, D);
        break;
      }
      case 'projectile':
        this.fxProjectile(x, y, dirRad, D, P(380), P(155));
        break;
      case 'projectile_fan': {
        const FAN_RAD = 11 * (Math.PI / 180);
        this.fxProjectile(x, y, dirRad - FAN_RAD, D, P(380), P(155));
        this.fxProjectile(x, y, dirRad, D, P(380), P(155));
        this.fxProjectile(x, y, dirRad + FAN_RAD, D, P(380), P(155));
        break;
      }
      case 'knifeThrow':
        this.time.delayedCall(150, () => this.fxKnifeThrow(x, y, dirRad));
        break;
      case 'flowerMode': {
        const arc = 180;
        const sa = Phaser.Math.DegToRad(deg - arc / 2);
        const ea = Phaser.Math.DegToRad(deg + arc / 2);
        this.fxSlash180(x, y, sa, ea, MELEE_RANGE, D);
        break;
      }
      case 'multiHit': {
        const DELAYS = [55, 115, 175, 235, 310];
        DELAYS.forEach((delay, hitIdx) => {
          this.time.delayedCall(delay, () => this.fxMultiHitSlash(x, y, D, dirRad, hitIdx, MELEE_RANGE));
        });
        break;
      }
      case 'chargeSlam':
        this.time.delayedCall(150, () => this.fxChargeSlam(x, y, MELEE_RANGE * 1.152, D));
        break;
      case 'boomerang': {
        const destX = x + Math.cos(dirRad) * P(160);
        const destY = y + Math.sin(dirRad) * P(160);
        this.fxBoomerang(x, y, destX, destY, dirRad, D, P(14), P(26), 800, () => ({ x, y }));
        break;
      }
      case 'magicFire':
        this.fxMagicFire(x, y, dirRad, D, P(300), P(200),
          undefined,
          (fx, fy) => this.fxMagicFireGround(fx, fy));
        break;
    }
  }

  protected createPlayerAnims(): void {
    if (!this.anims.exists('player_idle_down'))
      this.anims.create({ key: 'player_idle_down', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_left'))
      this.anims.create({ key: 'player_idle_left', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_right'))
      this.anims.create({ key: 'player_idle_right', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 24, end: 27 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_up'))
      this.anims.create({ key: 'player_idle_up', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 36, end: 39 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_run_down'))
      this.anims.create({ key: 'player_run_down', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_left'))
      this.anims.create({ key: 'player_run_left', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 8, end: 15 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_right'))
      this.anims.create({ key: 'player_run_right', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 16, end: 23 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_up'))
      this.anims.create({ key: 'player_run_up', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 24, end: 31 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_attack_down'))
      this.anims.create({ key: 'player_attack_down', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 1, end: 7 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_left'))
      this.anims.create({ key: 'player_attack_left', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 9, end: 15 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_right'))
      this.anims.create({ key: 'player_attack_right', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 17, end: 23 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_up'))
      this.anims.create({ key: 'player_attack_up', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 25, end: 31 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_down'))
      this.anims.create({ key: 'player_run_attack_down', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 1, end: 7 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_left'))
      this.anims.create({ key: 'player_run_attack_left', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 9, end: 15 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_right'))
      this.anims.create({ key: 'player_run_attack_right', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 17, end: 23 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_up'))
      this.anims.create({ key: 'player_run_attack_up', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 25, end: 31 }), frameRate: 20, repeat: 0 });
    // 多段連擊：三刀獨立節奏（快→快→重）
    // 每刀：起揮(前半段) + 收刀(反向) → 重複三次，第三刀走完整影格且較慢
    const mkMultihit = (key: string, s: number, e: number) => {
      if (this.anims.exists(key)) return;
      const all = Array.from({ length: e - s + 1 }, (_, i) => s + i); // 7 frames
      const mid = Math.floor(all.length / 2);
      const hit1 = [...all.slice(0, mid + 1), ...all.slice(0, mid + 1).reverse()];        // 快：前半揮+收
      const hit2 = [...all.slice(0, mid + 2), ...all.slice(0, mid + 2).reverse()];        // 快：前半+1揮+收
      const hit3 = [...all, all[all.length - 1], all[all.length - 1], ...all.reverse()];  // 重：完整揮+停頓+收
      const seq = [...hit1, ...hit2, ...hit3];
      const frames = seq.map(f =>
        this.anims.generateFrameNumbers('player_attack_shadow', { frames: [f] })[0]
      );
      this.anims.create({ key, frames, frameRate: 55, repeat: 0 });
    };
    mkMultihit('player_multihit_down', 1, 7);
    mkMultihit('player_multihit_left', 9, 15);
    mkMultihit('player_multihit_right', 17, 23);
    mkMultihit('player_multihit_up', 25, 31);

    if (!this.anims.exists('player_hurt'))
      this.anims.create({ key: 'player_hurt', frames: this.anims.generateFrameNumbers('player_hurt', { start: 0, end: 4 }), frameRate: 14, repeat: 0 });
    // 旋風斬：用三個方向各一幀（下2、右18、上26）組合出旋轉感
    if (!this.anims.exists('player_whirlwind')) {
      const wf = [
        ...this.anims.generateFrameNumbers('player_attack_shadow', { frames: [28, 3, 20] }),
      ];
      this.anims.create({ key: 'player_whirlwind', frames: wf, frameRate: 17, repeat: 1 });
    }
  }

  protected createPartnerAnims(): void {
    const mk = (key: string, tex: string, start: number, end: number, fps: number, repeat: number) => {
      if (!this.anims.exists(key))
        this.anims.create({ key, frames: this.anims.generateFrameNumbers(tex, { start, end }), frameRate: fps, repeat });
    };
    mk('partner_idle_down', 'partner_idle_shadow', 0, 3, 8, -1);
    mk('partner_idle_left', 'partner_idle_shadow', 12, 15, 8, -1);
    mk('partner_idle_right', 'partner_idle_shadow', 24, 27, 8, -1);
    mk('partner_idle_up', 'partner_idle_shadow', 36, 39, 8, -1);
    mk('partner_run_down', 'partner_run_shadow', 0, 7, 10, -1);
    mk('partner_run_left', 'partner_run_shadow', 8, 15, 10, -1);
    mk('partner_run_right', 'partner_run_shadow', 16, 23, 10, -1);
    mk('partner_run_up', 'partner_run_shadow', 24, 31, 10, -1);
    mk('partner_attack_down', 'partner_attack_shadow', 1, 7, 20, 0);
    mk('partner_attack_left', 'partner_attack_shadow', 9, 15, 20, 0);
    mk('partner_attack_right', 'partner_attack_shadow', 17, 23, 20, 0);
    mk('partner_attack_up', 'partner_attack_shadow', 25, 31, 20, 0);
    mk('partner_run_attack_down', 'partner_run_attack_shadow', 1, 7, 20, 0);
    mk('partner_run_attack_left', 'partner_run_attack_shadow', 9, 15, 20, 0);
    mk('partner_run_attack_right', 'partner_run_attack_shadow', 17, 23, 20, 0);
    mk('partner_run_attack_up', 'partner_run_attack_shadow', 25, 31, 20, 0);
    const mkMultihit = (key: string, s: number, e: number) => {
      if (this.anims.exists(key)) return;
      const all = Array.from({ length: e - s + 1 }, (_, i) => s + i);
      const mid = Math.floor(all.length / 2);
      const hit1 = [...all.slice(0, mid + 1), ...all.slice(0, mid + 1).reverse()];
      const hit2 = [...all.slice(0, mid + 2), ...all.slice(0, mid + 2).reverse()];
      const hit3 = [...all, all[all.length - 1], all[all.length - 1], ...all.reverse()];
      const frames = [...hit1, ...hit2, ...hit3].map(f =>
        this.anims.generateFrameNumbers('partner_attack_shadow', { frames: [f] })[0]
      );
      this.anims.create({ key, frames, frameRate: 55, repeat: 0 });
    };
    mkMultihit('partner_multihit_down', 1, 7);
    mkMultihit('partner_multihit_left', 9, 15);
    mkMultihit('partner_multihit_right', 17, 23);
    mkMultihit('partner_multihit_up', 25, 31);
    mk('partner_hurt', 'partner_hurt', 0, 4, 14, 0);
    if (!this.anims.exists('partner_whirlwind')) {
      const wf = [
        ...this.anims.generateFrameNumbers('partner_attack_shadow', { frames: [28, 3, 20] }),
      ];
      this.anims.create({ key: 'partner_whirlwind', frames: wf, frameRate: 17, repeat: 1 });
    }
  }

  protected createSlimeAnims(): void {
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    // cols × rows: idle=6×4, walk=8×4, run=8×4, attack=varies×4, hurt=5×4, death=10×4
    const buildAnims = (prefix: string, attackCols = 10) => {
      if (this.anims.exists(`${prefix}_idle_down`)) return;
      const defs = [
        { action: 'idle', cols: 6, fps: 8, repeat: -1 },
        { action: 'walk', cols: 8, fps: 10, repeat: -1 },
        { action: 'run', cols: 8, fps: 14, repeat: -1 },
        { action: 'attack', cols: attackCols, fps: 10, repeat: -1 },
        { action: 'hurt', cols: 5, fps: 14, repeat: 0 },
        { action: 'death', cols: 10, fps: 8, repeat: 0 },
      ];
      dirs.forEach((dir, row) => {
        defs.forEach(d => {
          const start = row * d.cols;
          this.anims.create({
            key: `${prefix}_${d.action}_${dir}`,
            frames: this.anims.generateFrameNumbers(`${prefix}_${d.action}`, { start, end: start + d.cols - 1 }),
            frameRate: d.fps,
            repeat: d.repeat,
          });
        });
      });
    };
    buildAnims('slime');        // attack: 10 cols
    buildAnims('slime2', 11);   // attack: 11 cols
    buildAnims('slime3', 9);    // attack: 9 cols

    // Orc variants: idle=4, walk=6, run=8, attack=8, hurt=6, death=8
    // Row order: down/up/left/right — same as slime sheets
    const buildOrcAnims = (prefix: string) => {
      if (this.anims.exists(`${prefix}_idle_down`)) return;
      const orcDefs = [
        { action: 'idle', cols: 4, fps: 6, repeat: -1 },
        { action: 'walk', cols: 6, fps: 10, repeat: -1 },
        { action: 'run', cols: 8, fps: 14, repeat: -1 },
        { action: 'attack', cols: 8, fps: 12, repeat: 0 },
        { action: 'hurt', cols: 6, fps: 14, repeat: 0 },
        { action: 'death', cols: 8, fps: 8, repeat: 0 },
      ];
      dirs.forEach((dir, row) => {
        orcDefs.forEach(d => {
          const start = row * d.cols;
          this.anims.create({
            key: `${prefix}_${d.action}_${dir}`,
            frames: this.anims.generateFrameNumbers(`${prefix}_${d.action}`, { start, end: start + d.cols - 1 }),
            frameRate: d.fps,
            repeat: d.repeat,
          });
        });
      });
    };
    buildOrcAnims('orc1');
    buildOrcAnims('orc2');
    buildOrcAnims('orc3');
    // orc1 旋風斬專用動畫：從 attack sheet 取特定偵 2/25/11 快速輪播模擬旋轉
    if (!this.anims.exists('orc1_whirl')) {
      this.anims.create({
        key: 'orc1_whirl',
        frames: this.anims.generateFrameNumbers('orc1_attack', { frames: [2, 25, 11] }),
        frameRate: 18,
        repeat: -1,
      });
    }

    // Plant monsters — different frame counts: idle=4, attack=7, hurt=5, death=10
    const buildPlantAnims = (prefix: string) => {
      if (this.anims.exists(`${prefix}_idle_down`)) return;
      const plantDefs = [
        { action: 'idle', cols: 4, fps: 6, repeat: -1 },
        { action: 'attack', cols: 7, fps: 10, repeat: 0 },
        { action: 'hurt', cols: 5, fps: 14, repeat: 0 },
        { action: 'death', cols: 10, fps: 8, repeat: 0 },
      ];
      dirs.forEach((dir, row) => {
        plantDefs.forEach(d => {
          const start = row * d.cols;
          this.anims.create({
            key: `${prefix}_${d.action}_${dir}`,
            frames: this.anims.generateFrameNumbers(`${prefix}_${d.action}`, { start, end: start + d.cols - 1 }),
            frameRate: d.fps,
            repeat: d.repeat,
          });
        });
      });
    };
    buildPlantAnims('plant1');
    buildPlantAnims('plant2');
    buildPlantAnims('plant3');

    // Vampire monsters — 4 directions: down/up/left/right; idle=4, run=8, attack=12, hurt=4, death=10
    const buildVampireAnims = (prefix: string) => {
      if (this.anims.exists(`${prefix}_idle_down`)) return;
      const vDirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
      const vampDefs = [
        { action: 'idle', cols: 4, fps: 6, repeat: -1 },
        { action: 'run', cols: 8, fps: 14, repeat: -1 },
        { action: 'attack', cols: 12, fps: 12, repeat: 0 },
        { action: 'hurt', cols: 4, fps: 14, repeat: 0 },
        { action: 'death', cols: 10, fps: 8, repeat: 0 },
      ];
      vDirs.forEach((dir, row) => {
        vampDefs.forEach(d => {
          const start = row * d.cols;
          this.anims.create({
            key: `${prefix}_${d.action}_${dir}`,
            frames: this.anims.generateFrameNumbers(`${prefix}_${d.action}`, { start, end: start + d.cols - 1 }),
            frameRate: d.fps,
            repeat: d.repeat,
          });
        });
      });
    };
    buildVampireAnims('vampire1');
    buildVampireAnims('vampire2');
    buildVampireAnims('vampire3');
  }



  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected spawnMinionAttack(type: import('../../../../shared/types').MsgMinionAttack['type'], mx: number, my: number, tx: number, ty: number, atk: number, isElite = false): void {
    const wx = mx * DPR, wy = my * DPR, wtx = tx * DPR, wty = ty * DPR;
    if (type === 'shoot') {
      this.fireProjectile(wx, wy, wtx, wty, isElite ? 'proj_fast_elite' : 'proj_fast', atk, Math.round(150 * DPR));
    } else if (type === 'triple') {
      const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
      const batchId = this.time.now + Math.random();
      for (const offset of [-0.28, 0, 0.28]) {
        const a = baseAngle + offset;
        const etx = wx + Math.cos(a) * P(600);
        const ety = wy + Math.sin(a) * P(600);
        this.fireProjectile(wx, wy, etx, ety, isElite ? 'proj_slow_elite' : 'proj_slow', atk, Math.round(90 * DPR), batchId);
      }
      // 清理超過 2 秒的舊 batch 記錄
      const cutoff = this.time.now - 2000;
      this.hitBatches.forEach((ts, id) => { if (ts < cutoff) this.hitBatches.delete(id); });
    } else if (type === 'spike') {
      this.spikeAt(tx * DPR, ty * DPR, atk, isElite);
    } else if (type === 'blade_wave') {
      this.bladeWaveAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'triple_wave') {
      const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
      const spread = Math.PI * 35 / 180;
      const tripleHit = { player: false, allies: new Set<MinionSlime>() };
      for (const offset of [-spread, 0, spread]) {
        const a = baseAngle + offset;
        const etx = wx + Math.cos(a) * P(600);
        const ety = wy + Math.sin(a) * P(600);
        this.bladeWaveAt(wx, wy, etx, ety, atk, isElite, 1, tripleHit);
      }
    } else if (type === 'whirl_slash') {
      this.whirlSlashAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'arc_slash') {
      this.arcSlashAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'leap_slam') {
      this.explodeAt(wx, wy, atk, isElite ? 1.8 : 1.4);
      this.leapLandVfx(wx, wy);
    } else if (type === 'spin_slash') {
      this.spinSlashAt(wx, wy, atk, isElite);
    } else if (type === 'ground_crack') {
      this.groundCrackAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'blood_needle') {
      this.bloodNeedleAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'triple_needle') {
      this.tripleNeedleAt(wx, wy, wtx, wty, atk);
    } else if (type === 'meteor') {
      this.meteorAt(wtx, wty, atk, isElite);
    } else if (type === 'lightning_ring') {
      this.lightningRingAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'blood_burst') {
      this.bloodBurstAt(wx, wy, wtx, wty, atk, isElite);
    } else if (type === 'orbit_burst') {
      this.orbitBurstAt(wx, wy, atk, isElite);
    } else if (type === 'blood_channel') {
      this.bloodChannelAt(wx, wy, wtx, wty, atk, isElite);
    } else {
      this.explodeAt(wx, wy, atk, isElite ? 1.4 : 1.0);
    }
  }

  protected whirlSlashAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean, hitROverride?: number, dmgOverride?: number, vfxDurationMs = 900): void {
    const dmg = dmgOverride ?? atk;
    const hitR = hitROverride ?? Math.round((isElite ? 36 : 28) * DPR);
    const angle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const travelDist = Phaser.Math.Distance.Between(wx, wy, wtx, wty);

    // 傷害只在月牙動畫實際到達玩家位置時觸發，與視覺同步
    let playerHit = false;
    const alliesHit = new Set<MinionSlime>();

    // 沿實際衝刺路徑每 75ms 生成一個旋轉月牙刀光
    const totalMs = vfxDurationMs;
    const interval = 75;
    const count = Math.floor(totalMs / interval);
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const cx = wx + Math.cos(angle) * travelDist * t;
      const cy = wy + Math.sin(angle) * travelDist * t;
      const del = i * interval;
      this.time.delayedCall(del, () => {
        const gfx = this.add.graphics({ x: cx, y: cy }).setDepth(50);
        const rot = angle + (i * Math.PI * 0.55);  // 每個月牙角度旋轉
        const R = Math.round(hitR * 1.25);
        const Ri = Math.round(R * 0.42);
        // 外光暈
        gfx.lineStyle(P(10), 0xffee44, 0.2);
        gfx.beginPath(); gfx.arc(0, 0, R + P(4), rot - Math.PI * 0.38, rot + Math.PI * 0.38, false); gfx.strokePath();
        // 月牙填色
        gfx.fillStyle(0xffdd00, 0.75);
        gfx.beginPath();
        gfx.arc(0, 0, R, rot - Math.PI * 0.38, rot + Math.PI * 0.38, false);
        gfx.arc(0, 0, Ri, rot + Math.PI * 0.38, rot - Math.PI * 0.38, true);
        gfx.closePath();
        gfx.fillPath();
        // 白色外緣
        gfx.lineStyle(P(2), 0xffffff, 0.85);
        gfx.beginPath(); gfx.arc(0, 0, R, rot - Math.PI * 0.38, rot + Math.PI * 0.38, false); gfx.strokePath();
        this.tweens.add({ targets: gfx, alpha: 0, scaleX: 1.25, scaleY: 1.25, duration: 260, ease: 'Quad.Out', onComplete: () => gfx.destroy() });

        // 傷害判定：月牙到達此位置時才檢查，每個目標只擊中一次
        if (!playerHit && Phaser.Math.Distance.Between(cx, cy, this.player.x, this.player.y) <= hitR) {
          playerHit = true;
          this.player.takeDamage(dmg);
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && !alliesHit.has(ally) && Phaser.Math.Distance.Between(cx, cy, ally.x, ally.y) <= hitR) {
            alliesHit.add(ally);
            ally.takeDamage(dmg);
          }
        }
      });
    }
  }

  protected bladeWaveAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean, speedMult = 1, sharedHit?: { player: boolean; allies: Set<MinionSlime> }): void {
    const dmg = atk;
    const ang = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    // 眉月形狀：兩個等半徑圓錯開，裁切出薄月牙。
    // Circle 1: center (0,0) radius R  — 外弧（月背）
    // Circle 2: center (d,0)  radius R — 內弧（月面）, d 沿飛行方向偏移
    // 兩圓交點 = 兩個尖端 → 自然收尖
    const R = Math.round((isElite ? 13 : 10) * DPR);
    const d = R * 0.72;
    const tipX = d / 2;
    const tipY = Math.sqrt(R * R - tipX * tipX);

    // 尖端角度（相對各自圓心）
    const t1 = Math.atan2(tipY, tipX);          // 圓1，上尖，~69°
    const t2 = Math.atan2(-tipY, tipX);          // 圓1，下尖，~-69°
    const i1 = Math.atan2(tipY, tipX - d);      // 圓2，上尖，~111°
    const i2 = Math.atan2(-tipY, tipX - d);      // 圓2，下尖，~-111°

    const travelDist = Phaser.Math.Distance.Between(wx, wy, wtx, wty) || Math.round(160 * DPR);
    const hitR = Math.round(R * 1.2);
    const dur = Math.round(700 * (travelDist / Math.round(160 * DPR)) / speedMult);
    const ex = wx + Math.cos(ang) * travelDist;
    const ey = wy + Math.sin(ang) * travelDist;

    // 只畫內側弓弧帶（圓2的內弧，從下尖繞過月面到上尖），不畫外圈大弧
    // 用兩條不同縮放的內弧圍成薄條
    const buildArcStrip = (outerS: number, innerS: number): { x: number; y: number }[] => {
      const N = 30;
      const ca = Math.cos(ang), sa_ = Math.sin(ang);
      const rot = (lx: number, ly: number) => ({ x: lx * ca - ly * sa_, y: lx * sa_ + ly * ca });
      const pts: { x: number; y: number }[] = [];
      // 外緣（較大半徑內弧，走圓2前弧 through 0°）
      for (let j = 0; j <= N; j++) {
        const a = i2 + (i1 - i2) * j / N;
        pts.push(rot(d * outerS + Math.cos(a) * R * outerS, Math.sin(a) * R * outerS));
      }
      // 內緣（較小半徑內弧，反向）
      for (let j = N; j >= 0; j--) {
        const a = i2 + (i1 - i2) * j / N;
        pts.push(rot(d * innerS + Math.cos(a) * R * innerS, Math.sin(a) * R * innerS));
      }
      return pts;
    };

    const drawCrescent = (g: Phaser.GameObjects.Graphics, alpha: number): void => {
      g.clear();
      // 外圍柔光帶
      g.fillStyle(0x0022ff, 0.12 * alpha); g.fillPoints(buildArcStrip(0.98, 0.80), true);
      g.fillStyle(0x0044cc, 0.18 * alpha); g.fillPoints(buildArcStrip(0.96, 0.82), true);
      // 主深藍填色
      g.fillStyle(0x0044cc, 0.93 * alpha); g.fillPoints(buildArcStrip(0.94, 0.86), true);
      // 亮藍中層
      g.fillStyle(0x0088ff, 0.55 * alpha); g.fillPoints(buildArcStrip(0.93, 0.87), true);
      // 青色高光
      g.fillStyle(0x44ddff, 0.30 * alpha); g.fillPoints(buildArcStrip(0.92, 0.88), true);
      // 外緣亮線
      const N2 = 30, ca2 = Math.cos(ang), sa2 = Math.sin(ang);
      const rot2 = (lx: number, ly: number) => ({ x: lx * ca2 - ly * sa2, y: lx * sa2 + ly * ca2 });
      const rimPts: { x: number; y: number }[] = [];
      for (let j = 0; j <= N2; j++) {
        const a = i2 + (i1 - i2) * j / N2;
        rimPts.push(rot2(d + Math.cos(a) * R, Math.sin(a) * R));
      }
      g.lineStyle(P(2), 0x55eeff, alpha);
      g.beginPath(); rimPts.forEach((p, idx) => idx === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)); g.strokePath();
      g.lineStyle(P(1), 0xffffff, 0.80 * alpha);
      g.beginPath(); rimPts.forEach((p, idx) => idx === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)); g.strokePath();
      // 兩端尖點閃光
      for (const sy of [1, -1]) {
        const tx = tipX * ca2 - tipY * sy * sa2, ty = tipX * sa2 + tipY * sy * ca2;
        g.fillStyle(0xffffff, 0.95 * alpha); g.fillCircle(tx, ty, P(1.8));
        g.fillStyle(0x88eeff, 0.55 * alpha); g.fillCircle(tx, ty, P(3.5));
      }
      // 尾跡能量線
      const bk = ang + Math.PI, sRi = R * 0.85;
      for (let i = 0; i < 3; i++) {
        const sA = bk + (i - 1) * 0.25, sL = R * (0.40 + i * 0.07);
        g.lineStyle(P(1.4 - i * 0.3), 0x66aaff, (0.42 - i * 0.10) * alpha);
        g.beginPath(); g.moveTo(Math.cos(sA) * sRi, Math.sin(sA) * sRi);
        g.lineTo(Math.cos(sA) * (sRi + sL), Math.sin(sA) * (sRi + sL)); g.strokePath();
      }
    };

    const gfx = this.add.graphics({ x: wx, y: wy }).setDepth(52);
    drawCrescent(gfx, 1);

    [70, 145, 220].forEach((delay, i) => {
      this.time.delayedCall(delay, () => {
        const ghost = this.add.graphics({ x: gfx.x, y: gfx.y }).setDepth(51);
        drawCrescent(ghost, 0.40 - i * 0.10);
        this.tweens.add({ targets: ghost, alpha: 0, scaleX: 0.78, scaleY: 0.78, duration: 180, ease: 'Quad.In', onComplete: () => ghost.destroy() });
      });
    });

    const hitTracker = sharedHit ?? { player: false, allies: new Set<MinionSlime>() };

    this.tweens.add({
      targets: gfx,
      x: ex, y: ey,
      duration: dur,
      ease: 'Linear',
      onUpdate: () => {
        if (!hitTracker.player && Phaser.Math.Distance.Between(gfx.x, gfx.y, this.player.x, this.player.y) < hitR) {
          hitTracker.player = true; this.player.takeDamage(dmg);
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && !hitTracker.allies.has(ally) &&
            Phaser.Math.Distance.Between(gfx.x, gfx.y, ally.x, ally.y) < hitR) {
            hitTracker.allies.add(ally); ally.takeDamage(dmg);
          }
        }
      },
      onComplete: () => this.tweens.add({ targets: gfx, alpha: 0, duration: 100, onComplete: () => gfx.destroy() }),
    });

    const flash = this.add.graphics({ x: wx, y: wy }).setDepth(53);
    flash.fillStyle(0x88ddff, 0.55); flash.fillPoints(buildArcStrip(0.94, 0.86), true);
    flash.fillStyle(0xffffff, 0.65); flash.fillCircle(0, 0, P(4));
    this.tweens.add({ targets: flash, scaleX: 1.9, scaleY: 1.9, alpha: 0, duration: 220, ease: 'Quad.Out', onComplete: () => flash.destroy() });
  }

  protected arcSlashAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean): void {
    const angle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const R = Math.round((isElite ? 72 : 56) * DPR);
    const Ri = Math.round(R * 0.42);  // inner radius of crescent
    const dmg = atk;
    const spread = Math.PI * 75 / 360;  // 37.5° each side = 75° total
    const sa = angle - spread, ea = angle + spread;

    const gfx = this.add.graphics({ x: wx, y: wy }).setDepth(50);

    // Outer glow halo
    gfx.lineStyle(P(14), 0xffee55, 0.22);
    gfx.beginPath(); gfx.arc(0, 0, R + P(6), sa, ea, false); gfx.strokePath();

    // Solid crescent fill (outer arc → inner arc reversed = crescent moon)
    gfx.fillStyle(0xffe030, 0.82);
    gfx.beginPath();
    gfx.arc(0, 0, R, sa, ea, false);
    gfx.arc(0, 0, Ri, ea, sa, true);
    gfx.closePath();
    gfx.fillPath();

    // Bright edge stroke on outer arc
    gfx.lineStyle(P(2.5), 0xffffff, 0.9);
    gfx.beginPath(); gfx.arc(0, 0, R, sa, ea, false); gfx.strokePath();

    // Tip sparkle lines at each end of the outer arc
    for (const tipA of [sa, ea]) {
      const tx0 = Math.cos(tipA) * R, ty0 = Math.sin(tipA) * R;
      const norm = tipA + (tipA === sa ? -Math.PI * 0.18 : Math.PI * 0.18);
      gfx.lineStyle(P(2), 0xffffff, 0.75);
      gfx.beginPath();
      gfx.moveTo(tx0, ty0);
      gfx.lineTo(tx0 + Math.cos(norm) * P(10), ty0 + Math.sin(norm) * P(10));
      gfx.strokePath();
    }

    // Expand + fade in place
    this.tweens.add({
      targets: gfx,
      scaleX: 1.4, scaleY: 1.4,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.Out',
      onComplete: () => gfx.destroy(),
    });

    // Damage: cone check
    const check = (px: number, py: number): boolean => {
      if (Phaser.Math.Distance.Between(wx, wy, px, py) > R * 2) return false;
      const a = Phaser.Math.Angle.Between(wx, wy, px, py);
      return Math.abs(Phaser.Math.Angle.Wrap(a - angle)) <= spread;
    };
    if (check(this.player.x, this.player.y)) this.player.takeDamage(dmg);
    for (const ally of this._allyMinions) { if (!ally.isDead && check(ally.x, ally.y)) ally.takeDamage(dmg); }
  }

  protected leapLandVfx(wx: number, wy: number): void {
    const ring = this.add.graphics({ x: wx, y: wy }).setDepth(50);
    ring.lineStyle(P(5), 0xff8800, 1);
    ring.strokeCircle(0, 0, P(20));
    this.tweens.add({ targets: ring, scaleX: 4, scaleY: 4, alpha: 0, duration: 420, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    const flash = this.add.graphics({ x: wx, y: wy }).setDepth(51);
    flash.fillStyle(0xffffff, 1); flash.fillCircle(0, 0, P(25));
    this.tweens.add({ targets: flash, scaleX: 0.1, scaleY: 0.1, alpha: 0, duration: 200, ease: 'Quad.In', onComplete: () => flash.destroy() });
  }

  protected spinSlashAt(wx: number, wy: number, atk: number, isElite: boolean): void {
    const R = Math.round((isElite ? 80 : 65) * DPR);
    const dmg = atk;
    const gfx = this.add.graphics({ x: wx, y: wy }).setDepth(50);
    // Spinning rings expanding outward
    let rings = 0;
    const spinTimer = this.time.addEvent({
      delay: 120, loop: true, callback: () => {
        rings++;
        const r = this.add.graphics({ x: wx, y: wy }).setDepth(49);
        r.lineStyle(P(3), 0xffcc00, 0.85);
        r.strokeCircle(0, 0, R * 0.4);
        this.tweens.add({ targets: r, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => r.destroy() });
        if (rings >= 4) spinTimer.destroy();
      }
    });
    gfx.lineStyle(P(4), 0xffaa00, 0.9);
    gfx.strokeCircle(0, 0, R);
    this.tweens.add({ targets: gfx, scaleX: 1.15, scaleY: 1.15, alpha: 0, duration: 500, ease: 'Quad.Out', onComplete: () => gfx.destroy() });
    this.hitInRadius(wx, wy, R, dmg);
  }

  protected groundCrackAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean): void {
    const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const dmg = atk;
    const len = Math.round((isElite ? 240 : 200) * DPR);
    const spread = Math.PI * 28 / 180;
    const sharedHit = { player: false, allies: new Set<MinionSlime>() };
    for (let i = 0; i < 3; i++) {
      this.fireGroundCrack(wx, wy, baseAngle + (i - 1) * spread, len, dmg, sharedHit);
    }
    // 落地衝擊：外擴光環 + 中心閃白
    const ring = this.add.graphics({ x: wx, y: wy }).setDepth(55);
    ring.lineStyle(P(3), 0xff6600, 1);
    ring.strokeCircle(0, 0, P(10));
    this.tweens.add({ targets: ring, scaleX: 5, scaleY: 5, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    const core = this.add.graphics({ x: wx, y: wy }).setDepth(56);
    core.fillStyle(0xffffff, 1); core.fillCircle(0, 0, P(12));
    this.tweens.add({ targets: core, scaleX: 0.05, scaleY: 0.05, alpha: 0, duration: 200, ease: 'Quad.In', onComplete: () => core.destroy() });
  }

  private fireGroundCrack(fx: number, fy: number, angle: number, len: number, dmg: number, sharedHit?: { player: boolean; allies: Set<MinionSlime> }): void {
    const SEG = 14;
    const perp = angle + Math.PI / 2;

    // 產生鋸齒中心線
    const ctr: { x: number; y: number }[] = [{ x: fx, y: fy }];
    for (let i = 1; i <= SEG; i++) {
      const t = i / SEG;
      const bx = fx + Math.cos(angle) * len * t;
      const by = fy + Math.sin(angle) * len * t;
      const off = ((i % 2 === 0) ? 1 : -1) * P(9) * (1 - t * 0.45) * (0.5 + Math.random() * 0.5);
      ctr.push({ x: bx + Math.cos(perp) * off, y: by + Math.sin(perp) * off });
    }

    // 依中心線建左右邊緣（起點寬、尖端窄）→ 形成一條有厚度的裂縫多邊形
    const wMax = P(7), wMin = P(1.8);
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let i = 0; i <= SEG; i++) {
      const t = i / SEG;
      const w = wMax + (wMin - wMax) * t;
      const pa = i < SEG
        ? Math.atan2(ctr[i + 1].y - ctr[i].y, ctr[i + 1].x - ctr[i].x) + Math.PI / 2
        : Math.atan2(ctr[i].y - ctr[i - 1].y, ctr[i].x - ctr[i - 1].x) + Math.PI / 2;
      left.push({ x: ctr[i].x + Math.cos(pa) * w, y: ctr[i].y + Math.sin(pa) * w });
      right.push({ x: ctr[i].x - Math.cos(pa) * w, y: ctr[i].y - Math.sin(pa) * w });
    }

    const gfx = this.add.graphics().setDepth(19);
    const hitTracker = sharedHit ?? { player: false, allies: new Set<MinionSlime>() };
    const allies = [...this._allyMinions];
    const hitR = P(17);

    const segHit = (ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
      return Phaser.Math.Distance.Between(ax + t * dx, ay + t * dy, px, py) < hitR;
    };

    const prog = { v: 0 };
    this.tweens.add({
      targets: prog, v: 1, duration: 420, ease: 'Quad.Out',
      onUpdate: () => {
        const vi = Math.min(Math.floor(prog.v * SEG) + 1, SEG);
        gfx.clear();

        // 外層柔光暈
        gfx.lineStyle(P(16), 0xff4400, 0.08);
        gfx.beginPath(); gfx.moveTo(ctr[0].x, ctr[0].y);
        for (let i = 1; i <= vi; i++) gfx.lineTo(ctr[i].x, ctr[i].y);
        gfx.strokePath();

        // 填充裂縫本體（實體黑縫）
        const poly = [...left.slice(0, vi + 1), ...[...right.slice(0, vi + 1)].reverse()];
        gfx.fillStyle(0x050000, 1);
        gfx.fillPoints(poly, true);

        // 裂縫邊緣橘色發光
        gfx.lineStyle(P(2), 0xff5500, 0.9);
        gfx.beginPath(); gfx.moveTo(left[0].x, left[0].y);
        for (let i = 1; i <= vi; i++) gfx.lineTo(left[i].x, left[i].y);
        gfx.strokePath();
        gfx.beginPath(); gfx.moveTo(right[0].x, right[0].y);
        for (let i = 1; i <= vi; i++) gfx.lineTo(right[i].x, right[i].y);
        gfx.strokePath();

        // 中心細亮線（熔岩感）
        gfx.lineStyle(P(1), 0xffcc44, 0.75);
        gfx.beginPath(); gfx.moveTo(ctr[0].x, ctr[0].y);
        for (let i = 1; i <= vi; i++) gfx.lineTo(ctr[i].x, ctr[i].y);
        gfx.strokePath();

        // 前端擴散粒子
        const tip = ctr[vi];
        gfx.fillStyle(0xff8800, 0.8); gfx.fillCircle(tip.x, tip.y, P(5));
        gfx.fillStyle(0xffee88, 1); gfx.fillCircle(tip.x, tip.y, P(2));

        // 傷害：每段膠囊判定
        for (let i = 0; i < vi; i++) {
          if (!hitTracker.player && segHit(ctr[i].x, ctr[i].y, ctr[i + 1].x, ctr[i + 1].y, this.player.x, this.player.y)) {
            hitTracker.player = true; this.player.takeDamage(dmg);
          }
          for (const ally of allies) {
            if (!ally.isDead && !hitTracker.allies.has(ally) &&
              segHit(ctr[i].x, ctr[i].y, ctr[i + 1].x, ctr[i + 1].y, ally.x, ally.y)) {
              hitTracker.allies.add(ally); ally.takeDamage(dmg);
            }
          }
        }
      },
      onComplete: () => this.tweens.add({ targets: gfx, alpha: 0, duration: 450, delay: 250, onComplete: () => gfx.destroy() }),
    });
  }

  // ── 吸血鬼小怪 VFX ───────────────────────────────────────

  protected bloodNeedleAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean): void {
    this._fireBloodNeedle(wx, wy, wtx, wty, atk, isElite);
  }

  protected tripleNeedleAt(wx: number, wy: number, wtx: number, wty: number, atk: number): void {
    const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const travelDist = (Phaser.Math.Distance.Between(wx, wy, wtx, wty) || P(190)) + P(70);
    const dmg = atk;
    const sharedHit = { player: false, allies: new Set<MinionSlime>() };
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * (Math.PI / 6); // -30°, 0°, +30°
      const ang = baseAngle + offset;
      const etx = wx + Math.cos(ang) * travelDist;
      const ety = wy + Math.sin(ang) * travelDist;
      this.time.delayedCall(i * 75, () => this._fireBloodNeedle(wx, wy, etx, ety, dmg, true, sharedHit));
    }
  }

  private _fireBloodNeedle(wx: number, wy: number, wtx: number, wty: number, dmg: number, isElite: boolean, sharedHit?: { player: boolean; allies: Set<MinionSlime> }): void {
    const angle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const dist = Phaser.Math.Distance.Between(wx, wy, wtx, wty) || P(200);
    const totalMs = 750;
    const amp = P(22);
    const freq = 2.2;
    const fwdX = Math.cos(angle), fwdY = Math.sin(angle);
    const perpX = Math.cos(angle + Math.PI / 2), perpY = Math.sin(angle + Math.PI / 2);
    const len = P(isElite ? 22 : 16);
    const hw = P(isElite ? 4.5 : 3.5);
    const hitR = P(isElite ? 14 : 11);

    const gfx = this.add.graphics().setDepth(52);
    gfx.fillStyle(0x990011, 0.95);
    gfx.fillTriangle(-len / 2, 0, 0, hw, len / 2, 0);
    gfx.fillTriangle(-len / 2, 0, 0, -hw, len / 2, 0);
    gfx.fillStyle(0xff3355, 0.55);
    gfx.fillTriangle(-len * 0.28, 0, 0, hw * 0.44, len * 0.35, 0);
    gfx.fillTriangle(-len * 0.28, 0, 0, -hw * 0.44, len * 0.35, 0);
    gfx.fillStyle(0xff9aaa, 0.85);
    gfx.fillCircle(len / 2, 0, P(1.8));
    gfx.x = wx; gfx.y = wy; gfx.rotation = angle;

    const trailEvt = this.time.addEvent({
      delay: 58, repeat: Math.ceil(totalMs / 58) + 1,
      callback: () => {
        if (!gfx.active) return;
        const t = this.add.graphics({ x: gfx.x, y: gfx.y }).setDepth(51);
        t.rotation = gfx.rotation;
        t.fillStyle(0x880011, 0.22);
        t.fillTriangle(-len / 2, 0, 0, hw, len / 2, 0);
        t.fillTriangle(-len / 2, 0, 0, -hw, len / 2, 0);
        this.tweens.add({ targets: t, alpha: 0, duration: 180, onComplete: () => t.destroy() });
      },
    });

    const hitTracker = sharedHit ?? { player: false, allies: new Set<MinionSlime>() };
    const p = { t: 0 };
    this.tweens.add({
      targets: p, t: 1, duration: totalMs, ease: 'Linear',
      onUpdate: () => {
        const t = p.t;
        const sineVal = Math.sin(t * freq * Math.PI * 2);
        const coseDeriv = Math.cos(t * freq * Math.PI * 2) * freq * Math.PI * 2;
        gfx.x = wx + fwdX * dist * t + perpX * sineVal * amp;
        gfx.y = wy + fwdY * dist * t + perpY * sineVal * amp;
        gfx.rotation = Math.atan2(
          fwdY * dist + perpY * coseDeriv * amp,
          fwdX * dist + perpX * coseDeriv * amp,
        );
        if (!hitTracker.player && Phaser.Math.Distance.Between(gfx.x, gfx.y, this.player.x, this.player.y) < hitR) {
          hitTracker.player = true; this.player.takeDamage(dmg);
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && !hitTracker.allies.has(ally) &&
            Phaser.Math.Distance.Between(gfx.x, gfx.y, ally.x, ally.y) < hitR) {
            hitTracker.allies.add(ally); ally.takeDamage(dmg);
          }
        }
      },
      onComplete: () => {
        trailEvt.destroy();
        const splat = this.add.graphics({ x: gfx.x, y: gfx.y }).setDepth(50);
        for (let i = 0; i < 5; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = P(Phaser.Math.Between(7, 22));
          splat.fillStyle(0x880011, 0.50);
          splat.fillCircle(Math.cos(a) * r, Math.sin(a) * r, P(Phaser.Math.Between(3, 6)));
        }
        splat.fillStyle(0xcc0022, 0.75);
        splat.fillCircle(0, 0, P(5));
        this.tweens.add({ targets: splat, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => splat.destroy() });
        gfx.destroy();
      },
    });
  }

  protected meteorAt(wtx: number, wty: number, atk: number, isElite: boolean): void {
    const dmg = atk;
    const R = Math.round((isElite ? 30 : 22) * DPR);
    const fallMs = 520;
    const startY = wty - P(130);

    // Ground shadow (grows during fall)
    const shadow = this.add.graphics({ x: wtx, y: wty }).setDepth(48);

    // Meteor rock drawn at origin, scaled up during fall
    const meteor = this.add.graphics({ x: wtx, y: startY }).setDepth(61);
    meteor.fillStyle(isElite ? 0xff4400 : 0xcc3300, 0.95);
    meteor.fillCircle(0, 0, R);
    meteor.fillStyle(0x110000, 0.50);
    meteor.fillCircle(R * 0.22, R * 0.18, R * 0.52);
    meteor.lineStyle(P(3.5), 0xff8800, 0.90);
    meteor.strokeCircle(0, 0, R);
    meteor.lineStyle(P(1.5), 0xffcc44, 0.50);
    meteor.strokeCircle(0, 0, R * 0.55);
    meteor.setScale(0.3);

    // Fire streaks spawned during fall
    const fireEvt = this.time.addEvent({
      delay: 80, repeat: Math.floor(fallMs / 80),
      callback: () => {
        if (!meteor.active) return;
        const s = meteor.scaleX;
        const streak = this.add.graphics({ x: meteor.x, y: meteor.y }).setDepth(60);
        const sLen = P(30) * s;
        for (let j = 0; j < 3; j++) {
          const a = -Math.PI / 2 + (j - 1) * 0.22 + (Math.random() - 0.5) * 0.12;
          streak.lineStyle(P(2.5 - j * 0.5), j === 0 ? 0xff6600 : 0xff3300, 0.65 - j * 0.12);
          streak.beginPath(); streak.moveTo(0, 0);
          streak.lineTo(Math.cos(a) * sLen, Math.sin(a) * sLen); streak.strokePath();
        }
        this.tweens.add({ targets: streak, alpha: 0, duration: 200, ease: 'Quad.Out', onComplete: () => streak.destroy() });
      },
    });

    this.tweens.add({
      targets: meteor, y: wty, scaleX: 1, scaleY: 1,
      duration: fallMs, ease: 'Quad.In',
      onUpdate: () => {
        const t = Math.max(0, (meteor.y - startY) / (wty - startY));
        shadow.clear();
        shadow.fillStyle(0x330000, 0.38 * t);
        shadow.fillEllipse(0, 0, R * 2.4 * t, R * 0.75 * t);
      },
      onComplete: () => {
        fireEvt.destroy();
        meteor.destroy();
        shadow.destroy();

        // ① 焦痕坑洞（留存最久，在最底層）
        const crater = this.add.graphics({ x: wtx, y: wty }).setDepth(15);
        crater.fillStyle(0x1a0700, 0.80); crater.fillCircle(0, 0, R * 1.05);
        crater.fillStyle(0x2e1000, 0.45); crater.fillCircle(0, 0, R * 1.25);
        crater.lineStyle(P(1.5), 0x662200, 0.55); crater.strokeCircle(0, 0, R * 1.05);
        this.tweens.add({ targets: crater, alpha: 0, duration: 1600, delay: 300, ease: 'Quad.In', onComplete: () => crater.destroy() });

        // ② 中心爆閃（亮白 → 橘，縮入消失）
        const core = this.add.graphics({ x: wtx, y: wty }).setDepth(65);
        core.fillStyle(0xffffff, 1); core.fillCircle(0, 0, R * 0.6);
        core.fillStyle(0xff8800, 0.9); core.fillCircle(0, 0, R * 0.35);
        this.tweens.add({ targets: core, alpha: 0, scaleX: 0.08, scaleY: 0.08, duration: 160, ease: 'Quad.In', onComplete: () => core.destroy() });

        // ③ 衝擊波薄環（快速擴散消失）
        const shock = this.add.graphics({ x: wtx, y: wty }).setDepth(64);
        shock.lineStyle(P(3), 0xffaa44, 1); shock.strokeCircle(0, 0, R * 0.75);
        this.tweens.add({ targets: shock, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => shock.destroy() });

        // ④ 橘紅光圈（稍慢，有厚度）
        const halo = this.add.graphics({ x: wtx, y: wty }).setDepth(63);
        halo.lineStyle(P(7), 0xff5500, 0.70); halo.strokeCircle(0, 0, R * 0.55);
        this.tweens.add({ targets: halo, scaleX: 2.1, scaleY: 2.1, alpha: 0, duration: 480, ease: 'Quad.Out', onComplete: () => halo.destroy() });

        // ⑤ 岩屑碎片（8 塊，各自飛出旋轉）
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.45;
          const tDist = P(Phaser.Math.Between(18, 40));
          const piece = this.add.graphics({ x: wtx, y: wty }).setDepth(62);
          const pr = P(Phaser.Math.Between(3, 6));
          const col = [0x882200, 0xaa3300, 0x661100, 0x993300][i % 4];
          piece.fillStyle(col, 0.92);
          piece.fillEllipse(0, 0, pr * 2.2, pr);        // 扁橢圓模擬碎石
          piece.lineStyle(P(0.8), 0xffaa44, 0.55);
          piece.strokeEllipse(0, 0, pr * 2.2, pr);
          this.tweens.add({
            targets: piece,
            x: wtx + Math.cos(a) * tDist,
            y: wty + Math.sin(a) * tDist,
            rotation: Phaser.Math.FloatBetween(Math.PI, Math.PI * 3),
            alpha: 0,
            duration: Phaser.Math.Between(300, 480),
            ease: 'Quad.Out',
            onComplete: () => piece.destroy(),
          });
        }

        // ⑥ 塵埃粒子（12 顆，更小更輕）
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3;
          const r0 = R * 0.45;
          const r1 = P(Phaser.Math.Between(20, 48));
          const dust = this.add.graphics({ x: wtx + Math.cos(a) * r0, y: wty + Math.sin(a) * r0 }).setDepth(62);
          dust.fillStyle(0xcc5500, Phaser.Math.FloatBetween(0.45, 0.70));
          dust.fillCircle(0, 0, P(Phaser.Math.Between(2, 4)));
          this.tweens.add({
            targets: dust,
            x: wtx + Math.cos(a) * r1,
            y: wty + Math.sin(a) * r1,
            alpha: 0,
            duration: Phaser.Math.Between(380, 620),
            ease: 'Quad.Out',
            onComplete: () => dust.destroy(),
          });
        }

        // Damage（命中範圍縮至 R*1.1，配合視覺）
        const hitR = R * 1.1;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, wtx, wty) < hitR) this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, wtx, wty) < hitR) ally.takeDamage(dmg);
        }
      },
    });
  }

  protected bloodBurstAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean): void {
    const dmg = atk;
    const count = 1;
    const tDist = P(isElite ? 175 : 140);
    const duration = 580;
    const orbR = P(isElite ? 7 : 5);
    const hitR = P(isElite ? 13 : 10);
    const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);

    // Central burst
    const burst = this.add.graphics({ x: wx, y: wy }).setDepth(53);
    burst.fillStyle(0xcc0022, 0.82); burst.fillCircle(0, 0, P(13));
    burst.lineStyle(P(3), 0xff5577, 0.95); burst.strokeCircle(0, 0, P(13));
    burst.lineStyle(P(7), 0xaa0011, 0.28); burst.strokeCircle(0, 0, P(18));
    this.tweens.add({ targets: burst, scaleX: 2.8, scaleY: 2.8, alpha: 0, duration: 350, ease: 'Quad.Out', onComplete: () => burst.destroy() });

    for (let i = 0; i < count; i++) {
      const ang = baseAngle + (i / count) * Math.PI * 2;
      const endX = wx + Math.cos(ang) * tDist;
      const endY = wy + Math.sin(ang) * tDist;

      const orb = this.add.graphics({ x: wx, y: wy }).setDepth(52);
      orb.fillStyle(0x880011, 0.95); orb.fillCircle(0, 0, orbR);
      orb.fillStyle(0xff3355, 0.70); orb.fillCircle(-orbR * 0.28, -orbR * 0.28, orbR * 0.48);
      orb.lineStyle(P(1.5), 0xff7799, 0.90); orb.strokeCircle(0, 0, orbR);

      let hitPlayer = false;
      const hitAllies = new Set<MinionSlime>();

      this.tweens.add({
        targets: orb, x: endX, y: endY,
        duration, ease: 'Linear',
        onUpdate: () => {
          if (!hitPlayer && Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y) < hitR) {
            hitPlayer = true; this.player.takeDamage(dmg);
          }
          for (const ally of this._allyMinions) {
            if (!ally.isDead && !hitAllies.has(ally) &&
              Phaser.Math.Distance.Between(orb.x, orb.y, ally.x, ally.y) < hitR) {
              hitAllies.add(ally); ally.takeDamage(dmg);
            }
          }
        },
        onComplete: () => {
          const splat = this.add.graphics({ x: orb.x, y: orb.y }).setDepth(50);
          splat.fillStyle(0x660011, 0.55); splat.fillCircle(0, 0, orbR * 1.6);
          this.tweens.add({ targets: splat, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 250, onComplete: () => splat.destroy() });
          orb.destroy();
        },
      });

      // Blood trail (3 ghosts staggered)
      for (let j = 1; j <= 3; j++) {
        this.time.delayedCall(j * 65, () => {
          if (!orb.active) return;
          const trail = this.add.graphics({ x: orb.x, y: orb.y }).setDepth(51);
          trail.fillStyle(0x770011, 0.28); trail.fillCircle(0, 0, orbR * 0.8);
          this.tweens.add({ targets: trail, alpha: 0, duration: 165, onComplete: () => trail.destroy() });
        });
      }
    }
  }

  protected lightningRingAt(wx: number, wy: number, _wtx: number, _wty: number, atk: number, isElite: boolean): void {
    const dmg = atk;
    const minR = P(18);
    const maxR = P(isElite ? 47 : 37); // 縮小40%，同時發射兩個
    const totMs = 2600;
    const tickMs = 380;
    const preMs = 700;
    const strikeMs = preMs - 200;

    // ── 前搖：自身向天空射出閃電 ──
    const skyY = wy - P(150);

    const bolt1a = this.add.graphics().setDepth(62);
    this._drawLightningBolt(bolt1a, wx, wy, wx, skyY, 0.95);
    bolt1a.fillStyle(0xeeddff, 0.90); bolt1a.fillCircle(wx, skyY, P(6));
    bolt1a.fillStyle(0xcc88ff, 0.70); bolt1a.fillCircle(wx, wy, P(4));
    this.tweens.add({ targets: bolt1a, alpha: 0, duration: 260, onComplete: () => bolt1a.destroy() });

    const skyOrb = this.add.graphics({ x: wx, y: skyY }).setDepth(62);
    skyOrb.fillStyle(0x6611cc, 0.60); skyOrb.fillCircle(0, 0, P(8));
    skyOrb.lineStyle(P(2), 0xffeeff, 0.90); skyOrb.strokeCircle(0, 0, P(8));
    this.tweens.add({ targets: skyOrb, scaleX: 2.8, scaleY: 2.8, duration: strikeMs, ease: 'Sine.In', onComplete: () => skyOrb.destroy() });

    this.time.delayedCall(160, () => {
      const bolt1b = this.add.graphics().setDepth(62);
      this._drawLightningBolt(bolt1b, wx, wy, wx, skyY, 0.88);
      bolt1b.fillStyle(0xffeeff, 0.80); bolt1b.fillCircle(wx, skyY, P(4));
      this.tweens.add({ targets: bolt1b, alpha: 0, duration: 220, onComplete: () => bolt1b.destroy() });
    });

    this.time.delayedCall(360, () => {
      const bolt1c = this.add.graphics().setDepth(62);
      this._drawLightningBolt(bolt1c, wx, wy, wx, skyY, 1.0);
      bolt1c.fillStyle(0xffeeff, 1.0); bolt1c.fillCircle(wx, skyY, P(7));
      bolt1c.lineStyle(P(2), 0xcc88ff, 0.85); bolt1c.strokeCircle(wx, skyY, P(10));
      this.tweens.add({ targets: bolt1c, alpha: 0, duration: 300, onComplete: () => bolt1c.destroy() });
    });

    // 落雷瞬間決定兩個圈的位置（各自獨立偏移）
    const ringPositions: { x: number; y: number }[] = [];
    this.time.delayedCall(strikeMs, () => {
      for (let i = 0; i < 2; i++) {
        const offAng = Math.random() * Math.PI * 2;
        const offDist = P(Phaser.Math.Between(55, 95));
        ringPositions.push({
          x: this.player.x + Math.cos(offAng) * offDist,
          y: this.player.y + Math.sin(offAng) * offDist,
        });
      }
      for (const pos of ringPositions) {
        const bolt2 = this.add.graphics().setDepth(62);
        this._drawLightningBolt(bolt2, wx, skyY, pos.x, pos.y, 1.0);
        bolt2.fillStyle(0xffeeff, 0.95); bolt2.fillCircle(pos.x, pos.y, P(8));
        this.tweens.add({ targets: bolt2, alpha: 0, duration: 260, onComplete: () => bolt2.destroy() });
        const impact = this.add.graphics({ x: pos.x, y: pos.y }).setDepth(63);
        impact.fillStyle(0xcc88ff, 0.75); impact.fillCircle(0, 0, P(20));
        impact.lineStyle(P(2.5), 0xffeeff, 0.95); impact.strokeCircle(0, 0, P(20));
        this.tweens.add({ targets: impact, alpha: 0, scaleX: 3.4, scaleY: 3.4, duration: 340, ease: 'Quad.Out', onComplete: () => impact.destroy() });
      }
    });

    // 前搖結束後同時展開兩個圈
    this.time.delayedCall(preMs, () => {
      for (const pos of ringPositions) {
        this._spawnLightningRingExpansion(pos.x, pos.y, dmg, minR, maxR, totMs, tickMs);
      }
    });
  }

  private _spawnLightningRingExpansion(cx: number, cy: number, dmg: number, minR: number, maxR: number, totMs: number, tickMs: number): void {
    const ringGfx = this.add.graphics().setDepth(54);
    const proxy = { r: minR };
    const startTime = this.time.now;

    this.tweens.add({
      targets: proxy, r: maxR, duration: totMs, ease: 'Sine.Out',
      onUpdate: () => {
        const elapsed = this.time.now - startTime;
        const pulse = Math.sin(elapsed * 0.022) * 0.22 + 0.78;
        ringGfx.clear();
        ringGfx.lineStyle(P(7), 0x5511bb, 0.14 * pulse);
        ringGfx.strokeCircle(cx, cy, proxy.r);
        ringGfx.lineStyle(P(3), 0x9944ff, 0.88 * pulse);
        ringGfx.strokeCircle(cx, cy, proxy.r);
        ringGfx.lineStyle(P(1.5), 0xcc88ff, 0.60 * pulse);
        ringGfx.strokeCircle(cx, cy, proxy.r - P(4));
        for (let i = 0; i < 8; i++) {
          const sa = (i / 8) * Math.PI * 2 + elapsed * 0.0038;
          ringGfx.fillStyle(0xeeddff, pulse * (i % 2 === 0 ? 0.95 : 0.55));
          ringGfx.fillCircle(cx + Math.cos(sa) * proxy.r, cy + Math.sin(sa) * proxy.r, P(i % 2 === 0 ? 3 : 1.8));
        }
      },
      onComplete: () => {
        this.tweens.add({ targets: ringGfx, alpha: 0, duration: 500, onComplete: () => ringGfx.destroy() });
      },
    });

    const tickCount = Math.floor(totMs / tickMs);
    for (let tick = 0; tick < tickCount; tick++) {
      this.time.delayedCall((tick + 0.55) * tickMs, () => {
        if (!ringGfx.active) return;
        const r = proxy.r;
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy) < r)
          this.player.takeDamage(dmg);
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(ally.x, ally.y, cx, cy) < r)
            ally.takeDamage(dmg);
        }
        for (let b = 0; b < 3; b++) {
          const rimAng = Math.random() * Math.PI * 2;
          const rimX = cx + Math.cos(rimAng) * r;
          const rimY = cy + Math.sin(rimAng) * r;
          const innerX = cx + Math.cos(rimAng + Math.PI) * r * (Math.random() * 0.55);
          const innerY = cy + Math.sin(rimAng + Math.PI) * r * (Math.random() * 0.55);
          const boltGfx = this.add.graphics().setDepth(60);
          this._drawLightningBolt(boltGfx, rimX, rimY, innerX, innerY, 0.92);
          boltGfx.fillStyle(0xffeeff, 0.95);
          boltGfx.fillCircle(rimX, rimY, P(3));
          this.tweens.add({ targets: boltGfx, alpha: 0, duration: 200, onComplete: () => boltGfx.destroy() });
        }
        if (Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy) < r) {
          const flash = this.add.graphics({ x: this.player.x, y: this.player.y }).setDepth(62);
          flash.fillStyle(0xcc88ff, 0.58); flash.fillCircle(0, 0, P(13));
          flash.lineStyle(P(2), 0xffeeff, 0.80); flash.strokeCircle(0, 0, P(13));
          this.tweens.add({ targets: flash, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 190, onComplete: () => flash.destroy() });
        }
      });
    }
  }

  private _drawLightningBolt(gfx: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, alpha: number): void {
    const segs = 5;
    const jitter = P(12);
    const pts: { x: number; y: number }[] = [{ x: x0, y: y0 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({
        x: x0 + (x1 - x0) * t + (Math.random() - 0.5) * jitter * 2,
        y: y0 + (y1 - y0) * t + (Math.random() - 0.5) * jitter * 2,
      });
    }
    pts.push({ x: x1, y: y1 });
    gfx.lineStyle(P(2.5), 0x9944ff, alpha * 0.7);
    gfx.beginPath(); gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
    gfx.strokePath();
    gfx.lineStyle(P(1.2), 0xffeeff, alpha);
    gfx.beginPath(); gfx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) gfx.lineTo(pts[i].x, pts[i].y);
    gfx.strokePath();
  }

  protected orbitBurstAt(wx: number, wy: number, atk: number, isElite: boolean): void {
    const dmg = atk;
    const startR = P(26);
    const endR = P(isElite ? 168 : 132);
    const duration = 2600;
    const orbR = P(isElite ? 8 : 6);
    const hitR = P(isElite ? 16 : 13);
    const rotations = 1.65; // full rotations during spiral

    for (let i = 0; i < 1; i++) {
      const phase = (i / 2) * Math.PI * 2; // 180° apart
      const orb = this.add.graphics().setDepth(52);
      // Core orb layers
      orb.fillStyle(0x440009, 0.98); orb.fillCircle(0, 0, orbR);
      orb.fillStyle(0x990022, 0.90); orb.fillCircle(0, 0, orbR * 0.72);
      orb.fillStyle(0xff3355, 0.65); orb.fillCircle(-orbR * 0.28, -orbR * 0.30, orbR * 0.42);
      orb.lineStyle(P(1.8), 0xff8899, 0.92); orb.strokeCircle(0, 0, orbR);
      // Outer glow ring
      orb.lineStyle(P(3.5), 0x880022, 0.28); orb.strokeCircle(0, 0, orbR * 1.5);

      let hitPlayer = false;
      const hitAllies = new Set<MinionSlime>();
      const p = { t: 0 };
      this.tweens.add({
        targets: p, t: 1, duration, ease: 'Sine.InOut',
        onUpdate: () => {
          const t = p.t;
          const r = startR + (endR - startR) * t;
          const angle = phase + t * rotations * Math.PI * 2;
          orb.x = wx + Math.cos(angle) * r;
          orb.y = wy + Math.sin(angle) * r;
          if (!hitPlayer && Phaser.Math.Distance.Between(orb.x, orb.y, this.player.x, this.player.y) < hitR) {
            hitPlayer = true; this.player.takeDamage(dmg);
          }
          for (const ally of this._allyMinions) {
            if (!ally.isDead && !hitAllies.has(ally) &&
              Phaser.Math.Distance.Between(orb.x, orb.y, ally.x, ally.y) < hitR) {
              hitAllies.add(ally); ally.takeDamage(dmg);
            }
          }
        },
        onComplete: () => {
          const splat = this.add.graphics({ x: orb.x, y: orb.y }).setDepth(51);
          splat.fillStyle(0x880011, 0.55); splat.fillCircle(0, 0, orbR * 1.9);
          for (let j = 0; j < 5; j++) {
            const sa = Math.random() * Math.PI * 2;
            const sr = P(Phaser.Math.Between(8, 22));
            splat.fillStyle(0x660011, 0.38);
            splat.fillCircle(Math.cos(sa) * sr, Math.sin(sa) * sr, P(Phaser.Math.Between(3, 6)));
          }
          this.tweens.add({ targets: splat, alpha: 0, scaleX: 2.4, scaleY: 2.4, duration: 300, onComplete: () => splat.destroy() });
          orb.destroy();
        },
      });
      // Blood trail
      this.time.addEvent({
        delay: 52, repeat: Math.ceil(duration / 52) + 1,
        callback: () => {
          if (!orb.active) return;
          const trail = this.add.graphics({ x: orb.x, y: orb.y }).setDepth(51);
          trail.fillStyle(0x770011, 0.24); trail.fillCircle(0, 0, orbR * 0.72);
          this.tweens.add({ targets: trail, alpha: 0, duration: 160, onComplete: () => trail.destroy() });
        },
      });
    }
  }

  protected bloodChannelFloorWarn(wx: number, wy: number, wtx: number, wty: number, isElite: boolean, warnMs: number): void {
    const HW = P(isElite ? 18 : 14);
    const CHAN_LEN = P(280);
    const angle = Phaser.Math.Angle.Between(wx * DPR, wy * DPR, wtx * DPR, wty * DPR);

    const floorG = this.add.graphics().setDepth(46);
    floorG.x = wx * DPR; floorG.y = wy * DPR; floorG.setRotation(angle);

    const drawWarn = (pulse: number) => {
      floorG.clear();
      floorG.fillStyle(0x660011, 0.25 + pulse * 0.20);
      floorG.fillRect(0, -HW, CHAN_LEN, HW * 2);
      floorG.fillCircle(0, 0, HW);
      floorG.lineStyle(P(2), 0xff2244, 0.55 + pulse * 0.35);
      floorG.strokeCircle(0, 0, HW * 1.1);
      floorG.strokeCircle(CHAN_LEN, 0, HW * 1.1);
      floorG.lineStyle(P(1.5), 0xff2244, 0.40 + pulse * 0.45);
      floorG.lineBetween(0, -HW, CHAN_LEN, -HW);
      floorG.lineBetween(0, HW, CHAN_LEN, HW);
    };

    drawWarn(0);
    const p = { v: 0 };
    const tw = this.tweens.add({
      targets: p, v: 1, duration: 220, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      onUpdate: () => drawWarn(p.v),
    });
    this.time.delayedCall(warnMs, () => { tw.stop(); floorG.destroy(); });
  }

  protected bloodChannelAt(wx: number, wy: number, wtx: number, wty: number, atk: number, isElite: boolean): void {
    const HW = P(isElite ? 18 : 14);
    const CHAN_LEN = P(280);
    const DUR_MS = 1500;
    const TICK_MS = 300;
    const dmgPerTick = Math.round(atk * 0.3);

    const angle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    {
      // ── 血流通道 ─────────────────────────────────────────────
      const chanG = this.add.graphics().setDepth(54);
      const drawChan = (alpha: number) => {
        chanG.clear();
        chanG.fillStyle(0x550011, alpha * 0.85);
        chanG.fillRect(0, -HW, CHAN_LEN, HW * 2);
        chanG.fillCircle(0, 0, HW);
        chanG.fillStyle(0xcc0033, alpha * 0.55);
        chanG.fillRect(0, -Math.round(HW * 0.4), CHAN_LEN, Math.round(HW * 0.8));
        chanG.fillCircle(0, 0, Math.round(HW * 0.4));
        chanG.lineStyle(P(1.5), 0xff3355, alpha * 0.7);
        chanG.strokeCircle(0, 0, HW);
        chanG.lineBetween(0, -HW, CHAN_LEN, -HW);
        chanG.lineBetween(0, HW, CHAN_LEN, HW);
      };
      chanG.x = wx; chanG.y = wy; chanG.setRotation(angle);
      drawChan(1);

      const hitPlayer = false;
      const hitSet = new Set<MinionSlime>();
      let elapsed = 0;

      const ticker = this.time.addEvent({
        delay: TICK_MS, repeat: Math.ceil(DUR_MS / TICK_MS) - 1,
        callback: () => {
          elapsed += TICK_MS;
          drawChan(1 - elapsed / DUR_MS * 0.3);

          const checkHit = (px: number, py: number): boolean => {
            const dx = px - wx, dy = py - wy;
            const along = dx * cos + dy * sin;
            const perp = Math.abs(-dx * sin + dy * cos);
            return along >= 0 && along <= CHAN_LEN && perp <= HW;
          };

          if (!this.player.active) return;
          if (checkHit(this.player.x, this.player.y)) this.player.takeDamage(dmgPerTick);

          for (const ally of this._allyMinions) {
            if (!ally.isDead && !hitSet.has(ally) && checkHit(ally.x, ally.y)) {
              hitSet.add(ally); ally.takeDamage(dmgPerTick);
            }
          }
          hitSet.clear();
        },
      });

      this.time.delayedCall(DUR_MS, () => {
        ticker.destroy();
        this.tweens.add({ targets: chanG, alpha: 0, duration: 200, onComplete: () => chanG.destroy() });
      });
    }
  }

  // ── 獸人戰士長 VFX ───────────────────────────────────────

  private fireBossFieldFracture(
    safeZones: { x: number; y: number; r: number }[],
    dmg: number, duration: number, tickMs: number,
  ): void {
    const GRACE_MS = 1200;
    const boss = this.boss;
    const cx = boss.arenaCenter.x, cy = boss.arenaCenter.y;
    const AR = boss.arenaRadius;

    // ── 底層危險覆蓋 ─────────────────────────────────────────
    const overlayG = this.add.graphics().setDepth(7).setAlpha(0);
    overlayG.fillStyle(0x220000, 1);
    overlayG.fillCircle(cx, cy, AR + P(20));
    this.tweens.add({ targets: overlayG, alpha: 0.65, duration: GRACE_MS, ease: 'Quad.In' });

    // 次層橙紅微光（active 後搏動）
    const glowG = this.add.graphics().setDepth(7).setAlpha(0);
    glowG.fillStyle(0x551100, 1);
    glowG.fillCircle(cx, cy, AR + P(20));
    let glowTween: Phaser.Tweens.Tween | null = null;

    // ── 地裂線條（預生成路徑，動態延伸）────────────────────────
    type CrackPt = { x: number; y: number };
    const crackG = this.add.graphics().setDepth(8);
    const crackPaths: CrackPt[][] = [];
    const crackCount = 8;
    for (let i = 0; i < crackCount; i++) {
      const ang = (i / crackCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.25, 0.25);
      const pts: CrackPt[] = [{ x: boss.x, y: boss.y }];
      let px = boss.x, py = boss.y;
      const segLen = P(24);
      const segs = Math.ceil(AR * 1.1 / segLen);
      for (let s = 0; s < segs; s++) {
        const jitter = Phaser.Math.FloatBetween(-P(12), P(12));
        px += Math.cos(ang) * segLen + Math.cos(ang + Math.PI / 2) * jitter;
        py += Math.sin(ang) * segLen + Math.sin(ang + Math.PI / 2) * jitter;
        pts.push({ x: px, y: py });
      }
      crackPaths.push(pts);
    }

    const crackState = { prog: 0, alpha: 1.0 };
    const drawCracks = () => {
      crackG.clear();
      crackPaths.forEach(pts => {
        const end = Math.max(2, Math.floor(pts.length * crackState.prog));
        crackG.lineStyle(P(2), 0xff3300, crackState.alpha * 0.75);
        crackG.beginPath(); crackG.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < end; j++) crackG.lineTo(pts[j].x, pts[j].y);
        crackG.strokePath();
        crackG.lineStyle(P(1), 0xff8800, crackState.alpha * 0.45);
        crackG.beginPath(); crackG.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < end; j++) crackG.lineTo(pts[j].x, pts[j].y);
        crackG.strokePath();
      });
    };
    const crackGrowTween = this.tweens.add({
      targets: crackState, prog: 1, duration: 950, ease: 'Quad.Out',
      onUpdate: drawCracks,
    });

    // ── 安全圈 ────────────────────────────────────────────────
    const safeG = this.add.graphics().setDepth(9);
    const safeAuraG = this.add.graphics().setDepth(9);

    const redrawSafe = (bright = false) => {
      safeG.clear();
      safeZones.forEach(z => {
        safeG.fillStyle(0x003300, 0.5);
        safeG.fillCircle(z.x, z.y, z.r);
        safeG.fillStyle(bright ? 0x00dd44 : 0x009933, bright ? 0.35 : 0.18);
        safeG.fillCircle(z.x, z.y, z.r * 0.65);
        safeG.lineStyle(P(3), bright ? 0xbbffcc : 0x44ff66, bright ? 1.0 : 0.85);
        safeG.strokeCircle(z.x, z.y, z.r);
        safeG.lineStyle(P(1), 0x66ff88, 0.5);
        safeG.strokeCircle(z.x, z.y, z.r * 0.72);
      });
    };
    redrawSafe();

    // 脈衝光環（從安全圈邊緣向外擴散消失）
    const auraState = { t: 0 };
    const auraTween = this.tweens.add({
      targets: auraState, t: 1, duration: 700, ease: 'Quad.Out',
      repeat: -1, repeatDelay: 150,
      onRepeat: () => { auraState.t = 0; },
      onUpdate: () => {
        safeAuraG.clear();
        const a = (1 - auraState.t) * 0.65;
        safeZones.forEach(z => {
          safeAuraG.lineStyle(P(2), 0x44ff88, a);
          safeAuraG.strokeCircle(z.x, z.y, z.r + auraState.t * P(22));
          if (auraState.t < 0.5) {
            safeAuraG.lineStyle(P(1), 0xaaffcc, a * 0.5);
            safeAuraG.strokeCircle(z.x, z.y, z.r + auraState.t * P(40));
          }
        });
      },
    });

    // Grace 期間：快速閃爍提示
    let graceBlink = 0;
    const graceBlinkT = this.time.addEvent({
      delay: 120, repeat: Math.ceil(GRACE_MS / 120),
      callback: () => { graceBlink++; redrawSafe(graceBlink % 2 === 0); },
    });

    // ── Grace 結束 → Active ──────────────────────────────────
    let tickTimer: Phaser.Time.TimerEvent;
    let explTimer: Phaser.Time.TimerEvent;
    let crackFlickTween: Phaser.Tweens.Tween | null = null;

    this.time.delayedCall(GRACE_MS, () => {
      if (!this.bossActive) return;
      graceBlinkT.destroy();
      redrawSafe(false);

      // 搏動橙紅地面光
      glowTween = this.tweens.add({ targets: glowG, alpha: 0.28, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.InOut' });

      // 裂縫保持全長 + 微閃
      crackGrowTween.stop();
      crackState.prog = 1;
      crackFlickTween = this.tweens.add({
        targets: crackState, alpha: 0.35, duration: 350, yoyo: true, repeat: -1,
        onUpdate: drawCracks,
      });

      tickTimer = this.time.addEvent({
        delay: tickMs, repeat: Math.ceil((duration - GRACE_MS) / tickMs),
        callback: () => {
          if (!this.bossActive) { tickTimer.destroy(); return; }
          const inSafe = (tx: number, ty: number) =>
            safeZones.some(z => Phaser.Math.Distance.Between(tx, ty, z.x, z.y) <= z.r);
          if (!inSafe(this.player.x, this.player.y)) this.player.takeDamage(dmg);
          for (const ally of this._allyMinions) {
            if (!ally.isDead && !inSafe(ally.x, ally.y)) ally.takeDamage(dmg);
          }
        },
      });

      const spawnExplosion = (ex: number, ey: number, sz: number) => {
        const bR = P(sz === 1 ? 7 : sz === 2 ? 12 : 18);
        const dur = sz === 1 ? 360 : sz === 2 ? 480 : 620;

        // 焦痕（最底層，緩慢消散）
        const scorchG = this.add.graphics({ x: ex, y: ey }).setDepth(8);
        scorchG.fillStyle(0x110000, 0.7); scorchG.fillCircle(0, 0, bR * 1.6);
        this.tweens.add({ targets: scorchG, alpha: 0, duration: dur * 2.2, delay: 80, ease: 'Quad.In', onComplete: () => scorchG.destroy() });

        // 火球主體（擴散消失）
        const fireG = this.add.graphics({ x: ex, y: ey }).setDepth(10);
        fireG.fillStyle(0xff2200, 1); fireG.fillCircle(0, 0, bR);
        fireG.fillStyle(0xff8800, 0.75); fireG.fillCircle(0, 0, bR * 0.62);
        fireG.fillStyle(0xffdd44, 0.55); fireG.fillCircle(0, 0, bR * 0.32);
        this.tweens.add({ targets: fireG, scaleX: 3.4, scaleY: 3.4, alpha: 0, duration: dur, ease: 'Quad.Out', onComplete: () => fireG.destroy() });

        // 外緣火環（比火球稍慢）
        const ringG = this.add.graphics({ x: ex, y: ey }).setDepth(10);
        ringG.lineStyle(P(sz + 2), 0xff5500, 0.9); ringG.strokeCircle(0, 0, bR * 1.1);
        this.tweens.add({ targets: ringG, scaleX: 3.8, scaleY: 3.8, alpha: 0, duration: dur * 1.15, ease: 'Quad.Out', onComplete: () => ringG.destroy() });

        // 衝擊波（細亮環，快速擴散）
        const waveG = this.add.graphics({ x: ex, y: ey }).setDepth(11);
        waveG.lineStyle(P(sz === 3 ? 3 : 2), 0xffeeaa, 1.0); waveG.strokeCircle(0, 0, bR * 0.6);
        this.tweens.add({ targets: waveG, scaleX: 6.5, scaleY: 6.5, alpha: 0, duration: dur * 0.45, ease: 'Cubic.Out', onComplete: () => waveG.destroy() });

        // 核心白光（瞬閃，縮小消失）
        const flashG = this.add.graphics({ x: ex, y: ey }).setDepth(12);
        flashG.fillStyle(0xffffee, 1); flashG.fillCircle(0, 0, bR * 0.85);
        this.tweens.add({ targets: flashG, scaleX: 0.05, scaleY: 0.05, alpha: 0, duration: 140, ease: 'Quad.In', onComplete: () => flashG.destroy() });

        // 火花粒子（快速四散）
        this.add.particles(ex, ey, 'pxl2', {
          speed: { min: 80 + sz * 30, max: 200 + sz * 55 }, angle: { min: 0, max: 360 },
          scale: { start: 1.5 + sz * 0.25, end: 0 }, alpha: { start: 1, end: 0 },
          tint: [0xff1100, 0xff5500, 0xffaa00, 0xffdd44],
          lifespan: { min: 180 + sz * 55, max: 350 + sz * 75 },
          quantity: 8 + sz * 3, emitting: false, maxParticles: 8 + sz * 3,
        }).setDepth(11).emitParticleAt(0, 0, 8 + sz * 3);

        // 餘燼粒子（慢速上漂，僅中大型爆炸）
        if (sz >= 2) {
          this.add.particles(ex, ey, 'pxl2', {
            speed: { min: 18, max: 60 }, angle: { min: 215, max: 325 },
            scale: { start: 1.0, end: 0 }, alpha: { start: 0.75, end: 0 },
            tint: [0xcc2200, 0xff6600, 0xaa1100],
            lifespan: { min: 550, max: 900 },
            quantity: 4 + sz, emitting: false, maxParticles: 4 + sz,
          }).setDepth(10).emitParticleAt(0, 0, 4 + sz);
        }
      };

      explTimer = this.time.addEvent({
        delay: 400, repeat: Math.ceil((duration - GRACE_MS) / 400) - 1,
        callback: () => {
          if (!this.bossActive) { explTimer.destroy(); return; }
          const count = Phaser.Math.Between(2, 3);
          for (let i = 0; i < count; i++) {
            let ex = 0, ey = 0, tries = 0;
            do {
              const a2 = Math.random() * Math.PI * 2;
              const dr = Math.random() * AR * 0.95;
              ex = cx + Math.cos(a2) * dr; ey = cy + Math.sin(a2) * dr;
              tries++;
            } while (tries < 10 && safeZones.some(z => Phaser.Math.Distance.Between(ex, ey, z.x, z.y) <= z.r + P(10)));
            spawnExplosion(ex, ey, Phaser.Math.Between(1, 3));
          }
        },
      });
    });

    // 結束前 1 秒綠圈閃爍「即將解除」
    this.time.delayedCall(duration - 1000, () => {
      let blink = 0;
      const blinkT = this.time.addEvent({
        delay: 110, repeat: 9,
        callback: () => { blink++; redrawSafe(blink % 2 === 0); },
      });
      this.time.delayedCall(1000, () => blinkT.destroy());
    });

    this.time.delayedCall(duration, () => {
      graceBlinkT.destroy();
      auraTween.stop(); safeAuraG.clear();
      crackGrowTween.stop(); crackFlickTween?.stop(); glowTween?.stop();
      tickTimer?.destroy(); explTimer?.destroy();
      this.tweens.add({
        targets: [overlayG, glowG, safeG, safeAuraG, crackG], alpha: 0, duration: 500,
        onComplete: () => { overlayG.destroy(); glowG.destroy(); safeG.destroy(); safeAuraG.destroy(); crackG.destroy(); },
      });
    });
  }

  private fireBossRollingBoulder(
    bx: number, by: number, angle: number, speed: number, r: number, dmg: number,
  ): void {
    const BOUNCE_MAX = 3;
    const STEP_MS = 16;
    const RAND_DEV = Math.PI * 55 / 180; // 反彈隨機偏移 ±55°

    let x = bx, y = by;
    let vx = Math.cos(angle) * speed;
    let vy = Math.sin(angle) * speed;
    let bounces = 0;
    let rot = 0;
    let hitPlayer = false;

    const boulderG = this.add.graphics().setDepth(25);
    const drawBoulder = () => {
      boulderG.clear();
      boulderG.fillStyle(0x664422, 1); boulderG.fillCircle(x, y, r);
      boulderG.fillStyle(0x886633, 0.6); boulderG.fillCircle(x - r * 0.3, y - r * 0.3, r * 0.42);
      boulderG.lineStyle(P(2), 0x442200, 0.8); boulderG.strokeCircle(x, y, r);
      // 滾動紋路（旋轉線）
      boulderG.lineStyle(P(1), 0xaa7744, 0.5);
      for (let i = 0; i < 3; i++) {
        const a = rot + i * (Math.PI * 2 / 3);
        boulderG.beginPath();
        boulderG.moveTo(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3);
        boulderG.lineTo(x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.9);
        boulderG.strokePath();
      }
    };

    const cx = this.boss.arenaCenter.x, cy = this.boss.arenaCenter.y;
    const AR = this.boss.arenaRadius, AS = this.boss.arenaShape;

    const isInside = (px: number, py: number): boolean => {
      const dx = px - cx, dy = py - cy;
      switch (AS) {
        case 1: { const hs = AR * 0.875; return Math.abs(dx) <= hs && Math.abs(dy) <= hs && Math.abs(dx) + Math.abs(dy) <= hs * 1.5; }
        case 2: return Math.abs(dx) + Math.abs(dy) <= AR;
        case 3: { const hw = P(380), hh = P(300), cr = P(100); const ex = Math.max(Math.abs(dx) - (hw - cr), 0), ey = Math.max(Math.abs(dy) - (hh - cr), 0); return ex * ex + ey * ey <= cr * cr; }
        default: return dx * dx + dy * dy <= AR * AR;
      }
    };

    // 計算邊界法線（各場地形狀）並反彈（加隨機偏移）
    const bounceAtWall = (): boolean => {
      if (isInside(x, y)) return false;
      const dx = x - cx, dy = y - cy;
      let nx = 0, ny = 0;
      switch (AS) {
        case 0: { const l = Math.sqrt(dx * dx + dy * dy); nx = dx / l; ny = dy / l; x = cx + nx * (AR - r); y = cy + ny * (AR - r); break; }
        case 2: { nx = Math.sign(dx) / Math.SQRT2; ny = Math.sign(dy) / Math.SQRT2; const e = Math.abs(dx) + Math.abs(dy) - AR; x -= nx * e; y -= ny * e; break; }
        case 1: {
          const hs = AR * 0.875;
          if (Math.abs(dx) > hs) { nx = Math.sign(dx); ny = 0; x = cx + Math.sign(dx) * hs; }
          else if (Math.abs(dy) > hs) { nx = 0; ny = Math.sign(dy); y = cy + Math.sign(dy) * hs; }
          else { nx = Math.sign(dx) / Math.SQRT2; ny = Math.sign(dy) / Math.SQRT2; const e = (Math.abs(dx) + Math.abs(dy)) - hs * 1.5; x -= nx * e; y -= ny * e; }
          break;
        }
        case 3: {
          const hw = P(380), hh = P(300), cr = P(100);
          const ex = Math.max(Math.abs(dx) - (hw - cr), 0), ey = Math.max(Math.abs(dy) - (hh - cr), 0);
          if (ex === 0 && ey === 0) { if (Math.abs(dx) > hw) { nx = Math.sign(dx); ny = 0; x = cx + Math.sign(dx) * hw; } else { nx = 0; ny = Math.sign(dy); y = cy + Math.sign(dy) * hh; } }
          else { const cl = Math.sqrt(ex * ex + ey * ey); nx = Math.sign(dx) * ex / cl; ny = Math.sign(dy) * ey / cl; x -= nx * (cl - cr); y -= ny * (cl - cr); }
          break;
        }
      }
      // 反射速度 + 隨機偏移
      const dot = vx * nx + vy * ny;
      vx -= 2 * dot * nx; vy -= 2 * dot * ny;
      const dev = Phaser.Math.FloatBetween(-RAND_DEV, RAND_DEV);
      const spd = Math.sqrt(vx * vx + vy * vy);
      const ang2 = Math.atan2(vy, vx) + dev;
      vx = Math.cos(ang2) * spd; vy = Math.sin(ang2) * spd;
      return true;
    };

    let prevInside = true; // 上一幀是否在場地內，用於偵測第一次穿越邊界
    const stepTimer = this.time.addEvent({
      delay: STEP_MS, loop: true,
      callback: () => {
        if (!this.bossActive || !boulderG.active) { stepTimer.destroy(); boulderG.destroy(); return; }
        const dt = STEP_MS / 1000;
        x += vx * dt; y += vy * dt;
        rot += (speed / r) * dt;

        const nowInside = isInside(x, y);
        // 只在第一次穿越邊界（inside→outside）時計一次反彈
        if (!nowInside && prevInside) {
          bounceAtWall();
          bounces++;
          prevInside = true; // 反彈後視為在場地內，防止下一幀重複計算
          this.cameras.main.shake(30, 0.003);
          this.add.particles(x, y, 'pxl2', {
            speed: { min: 60, max: 140 }, angle: { min: 0, max: 360 },
            scale: { start: 1.4, end: 0 }, alpha: { start: 0.9, end: 0 },
            tint: [0xaa7733, 0xddbb77], lifespan: { min: 150, max: 300 }, emitting: false,
          }).setDepth(24).emitParticleAt(0, 0, 10);

          if (bounces > BOUNCE_MAX) {
            stepTimer.destroy();
            this.tweens.add({ targets: boulderG, alpha: 0, scaleX: 2, scaleY: 2, duration: 300, onComplete: () => boulderG.destroy() });
            return;
          }
        } else {
          prevInside = nowInside;
        }

        // 傷害判定
        if (!hitPlayer && Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= r + P(12)) {
          hitPlayer = true; this.player.takeDamage(dmg);
          this.time.delayedCall(800, () => { hitPlayer = false; });
        }
        for (const ally of this._allyMinions) {
          if (!ally.isDead && Phaser.Math.Distance.Between(x, y, ally.x, ally.y) <= r + P(12)) {
            ally.takeDamage(dmg);
          }
        }
        drawBoulder();
      },
    });

    drawBoulder();
  }

  private fireBossJumpLand(x: number, y: number, r: number, dmg: number): void {
    // 衝擊波
    const ring = this.add.graphics({ x, y }).setDepth(55);
    ring.lineStyle(P(6), 0xff6600, 1);
    ring.strokeCircle(0, 0, P(20));
    this.tweens.add({ targets: ring, scaleX: r / P(20), scaleY: r / P(20), alpha: 0, duration: 450, ease: 'Cubic.Out', onComplete: () => ring.destroy() });

    // 外擴第二環
    const ring2 = this.add.graphics({ x, y }).setDepth(54);
    ring2.lineStyle(P(14), 0xff4400, 0.35);
    ring2.strokeCircle(0, 0, P(20));
    this.tweens.add({ targets: ring2, scaleX: r * 1.6 / P(20), scaleY: r * 1.6 / P(20), alpha: 0, duration: 600, ease: 'Cubic.Out', onComplete: () => ring2.destroy() });

    // 落點閃白
    const flash = this.add.graphics({ x, y }).setDepth(56);
    flash.fillStyle(0xffffff, 1); flash.fillCircle(0, 0, P(30));
    this.tweens.add({ targets: flash, scaleX: 0.05, scaleY: 0.05, alpha: 0, duration: 220, ease: 'Quad.In', onComplete: () => flash.destroy() });

    // 塵土
    this.add.particles(x, y, 'pxl2', {
      speed: { min: 100, max: 260 }, angle: { min: 200, max: 340 },
      scale: { start: 2.4, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xaa7733, 0xccaa55, 0x886622],
      lifespan: { min: 280, max: 600 }, emitting: false,
    }).setDepth(53).emitParticleAt(0, 0, 28);

    this.hitInRadius(x, y, r, dmg);
  }

  private fireBossFissureWithBranches(fx: number, fy: number, angle: number, len: number, dmg: number): void {
    // 主幹地裂（重用 fireGroundCrack 邏輯）
    this.fireGroundCrack(fx, fy, angle, len, dmg);

    // 延遲等主幹快走到尾端再觸發分支（約 350ms，動畫 420ms）
    const branchDelay = 150;
    const branchCount = 4;          // 分支數量
    const branchFan = Math.PI * 100 / 180; // 扇形範圍
    const branchLen = Math.round(150 * DPR);
    const tipX = fx + Math.cos(angle) * len;
    const tipY = fy + Math.sin(angle) * len;

    this.time.delayedCall(branchDelay, () => {
      for (let i = 0; i < branchCount; i++) {
        const ba = angle + (i / (branchCount - 1) - 0.5) * branchFan;
        this.time.delayedCall(i * 30, () => {
          this.fireGroundCrack(tipX, tipY, ba, branchLen, Math.round(dmg * 0.6));
        });
      }
      this.cameras.main.shake(60, 0.005);
    });
  }

  private fireBossPetal(fromX: number, fromY: number, angle: number, speed: number, dmg: number, blindDist: number, large = false): void {
    const isHoming = blindDist < 0;
    const tex = isHoming ? (large ? 'proj_homing_petal_large' : 'proj_homing_petal') : 'proj_petal';
    const proj = this.minionProjGroup.create(fromX, fromY, tex) as Phaser.Physics.Arcade.Image;
    proj.setDepth(20);
    (proj as any).dmg = dmg;
    (proj as any).spawnX = fromX;
    (proj as any).spawnY = fromY;
    (proj as any).blindDist = Math.max(0, blindDist);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    (this.physics as Phaser.Physics.Arcade.ArcadePhysics)
      .velocityFromAngle(Phaser.Math.RadToDeg(angle), speed, body.velocity);
    if (isHoming) {
      (proj as any).isHoming = true;
      (proj as any).homingSpeed = speed;
      this.homingProjs.push(proj);
    }
    this.time.delayedCall(4500, () => {
      if (!proj.active) return;
      const i = this.homingProjs.indexOf(proj);
      if (i !== -1) this.homingProjs.splice(i, 1);
      proj.destroy();
    });
  }

  // ── 藤蔓花王 VFX ─────────────────────────────────────────

  private placeBuds(positions: { x: number; y: number }[], dmg: number, r: number, zoneDur: number): void {
    const D = 18;
    positions.forEach(p => {
      const gfx = this.add.graphics().setDepth(D);
      const startTime = this.time.now;
      let phase = 0;

      const tick = this.time.addEvent({
        delay: 30, loop: true,
        callback: () => {
          const elapsed = this.time.now - startTime;
          const progress = Math.min(elapsed / zoneDur, 1);
          phase += 0.12 + progress * 0.18;   // 快速跳動隨倒數加快
          gfx.clear();

          // 顏色由綠漸轉紅
          const rc = Math.round(30 + progress * 210);
          const gc = Math.round(200 - progress * 180);
          const col = Phaser.Display.Color.GetColor(rc, gc, 20);

          // 外脈衝警示圈（閃爍加快）
          const pulse = 0.78 + Math.sin(phase * (2 + progress * 6)) * 0.16;
          gfx.lineStyle(P(2.5), col, 0.75 + Math.sin(phase * 3) * 0.15);
          gfx.strokeCircle(p.x, p.y, r * pulse);

          // 填充（越來越亮）
          gfx.fillStyle(col, 0.12 + progress * 0.28);
          gfx.fillCircle(p.x, p.y, r * 0.85);

          // 6 顆花苞小圓點環繞
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + phase * 0.04;
            const pr = r * 0.42;
            gfx.fillStyle(col, 0.9);
            gfx.fillCircle(p.x + Math.cos(a) * pr, p.y + Math.sin(a) * pr, P(3.5 + progress * 3));
          }

          // 中心核心（越接近爆炸越亮）
          gfx.fillStyle(0xffffff, 0.5 + progress * 0.45);
          gfx.fillCircle(p.x, p.y, P(3 + progress * 5));

          if (progress >= 1) {
            tick.destroy();
            gfx.destroy();
            this.hitInRadius(p.x, p.y, r, dmg);
            this.blossomExplodeVfx(p.x, p.y, r);
          }
        },
      });
    });
  }

  private sprayMist(fromX: number, fromY: number, angle: number, range: number, dmg: number): void {
    const D = 18;
    const SPEED = P(70);            // 慢速飄行
    const BALL_R = P(26);
    const DMG_R = BALL_R + P(18);  // 傷害判定稍大於視覺球
    const LIFE = Math.round((range / SPEED) * 1000);  // 飄完全程所需時間(ms)

    let bx = fromX, by = fromY;
    let elapsed = 0, dmgAccum = 0, phase = 0;

    const gfx = this.add.graphics().setDepth(D);

    const moveTimer = this.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        elapsed += 16;
        dmgAccum += 16;
        phase += 0.07;

        bx += Math.cos(angle) * SPEED * 16 / 1000;
        by += Math.sin(angle) * SPEED * 16 / 1000;

        // 輕微上下飄動（垂直於飛行方向）
        const wobble = Math.sin(phase) * P(3);
        const wox = -Math.sin(angle) * wobble;
        const woy = Math.cos(angle) * wobble;
        const drawX = bx + wox, drawY = by + woy;

        gfx.clear();

        // 外發光暈
        gfx.fillStyle(0x22aa44, 0.18 + Math.sin(phase * 1.5) * 0.06);
        gfx.fillCircle(drawX, drawY, BALL_R * 1.75);

        // 地面陰影橢圓
        gfx.fillStyle(0x001100, 0.35);
        gfx.fillEllipse(drawX + P(7), drawY + P(9), BALL_R * 2.2, BALL_R * 1.0);

        // 主球體（深外層）
        gfx.fillStyle(0x1a6630, 0.88);
        gfx.fillCircle(drawX, drawY, BALL_R);
        // 中層亮色
        gfx.fillStyle(0x33bb55, 0.75);
        gfx.fillCircle(drawX, drawY, BALL_R * 0.76);
        // 亮核心
        gfx.fillStyle(0x66ee88, 0.55);
        gfx.fillCircle(drawX, drawY, BALL_R * 0.50);
        // 高光反光
        gfx.fillStyle(0xaaffcc, 0.58);
        gfx.fillEllipse(drawX - BALL_R * 0.26, drawY - BALL_R * 0.30, BALL_R * 0.62, BALL_R * 0.30);
        // 輪廓
        gfx.lineStyle(P(2), 0x55ff88, 0.85);
        gfx.strokeCircle(drawX, drawY, BALL_R);

        // 傷害（每 350ms 判定一次）
        if (dmgAccum >= 350) {
          dmgAccum = 0;
          this.hitInRadius(bx, by, DMG_R, dmg);
        }

        if (elapsed >= LIFE) {
          moveTimer.destroy();
          // 霧球消散：擴散淡出
          this.tweens.add({
            targets: gfx, alpha: 0, scaleX: 2.2, scaleY: 2.2,
            duration: 500, ease: 'Quad.Out',
            onComplete: () => gfx.destroy(),
          });
        }
      },
    });
  }

  private spawnVines(fromX: number, fromY: number, len: number, w: number, dmg: number, baseAngle: number, count: number): void {
    const D = 16;
    const DUR = 4000;
    const GROW_MS = 500;
    const now = this.time.now;
    const dirs = Array.from({ length: count }, (_, i) => baseAngle + i * (Math.PI * 2 / count));

    dirs.forEach(ang => {
      const perp = ang + Math.PI / 2;
      const nx = Math.cos(perp), ny = Math.sin(perp);
      const gfx = this.add.graphics().setDepth(D);

      const drawVine = (gl: number) => {
        const ex2 = fromX + Math.cos(ang) * gl;
        const ey2 = fromY + Math.sin(ang) * gl;
        gfx.clear();

        // 地面陰影
        gfx.fillStyle(0x001100, 0.45);
        gfx.fillPoints([
          { x: fromX + nx * w * 1.5 + P(4), y: fromY + ny * w * 1.5 + P(4) },
          { x: ex2 + nx * w * 1.5 + P(4), y: ey2 + ny * w * 1.5 + P(4) },
          { x: ex2 - nx * w * 1.5 + P(4), y: ey2 - ny * w * 1.5 + P(4) },
          { x: fromX - nx * w * 1.5 + P(4), y: fromY - ny * w * 1.5 + P(4) },
        ], true);

        // 外層深色
        gfx.fillStyle(0x1a5500, 0.92);
        gfx.fillPoints([
          { x: fromX + nx * w, y: fromY + ny * w }, { x: ex2 + nx * w, y: ey2 + ny * w },
          { x: ex2 - nx * w, y: ey2 - ny * w }, { x: fromX - nx * w, y: fromY - ny * w },
        ], true);

        // 主藤蔓
        gfx.fillStyle(0x339922, 0.95);
        gfx.fillPoints([
          { x: fromX + nx * w * 0.72, y: fromY + ny * w * 0.72 }, { x: ex2 + nx * w * 0.72, y: ey2 + ny * w * 0.72 },
          { x: ex2 - nx * w * 0.72, y: ey2 - ny * w * 0.72 }, { x: fromX - nx * w * 0.72, y: fromY - ny * w * 0.72 },
        ], true);

        // 高光條
        gfx.fillStyle(0x88ee44, 0.55);
        gfx.fillPoints([
          { x: fromX + nx * w * 0.22, y: fromY + ny * w * 0.22 }, { x: ex2 + nx * w * 0.22, y: ey2 + ny * w * 0.22 },
          { x: ex2 - nx * w * 0.12, y: ey2 - nx * w * 0.12 }, { x: fromX - nx * w * 0.12, y: fromY - ny * w * 0.12 },
        ], true);

        // 邊緣輪廓
        gfx.lineStyle(P(1.5), 0x66cc33, 0.65);
        gfx.lineBetween(fromX + nx * w, fromY + ny * w, ex2 + nx * w, ey2 + ny * w);
        gfx.lineBetween(fromX - nx * w, fromY - ny * w, ex2 - nx * w, ey2 - ny * w);

        // 節點（每 P(60) 出現一個，依據當前長度）
        const nodeStep = P(60);
        for (let d = 0; d <= gl; d += nodeStep) {
          const kx = fromX + Math.cos(ang) * d;
          const ky = fromY + Math.sin(ang) * d;
          gfx.fillStyle(0x0a3300, 0.65); gfx.fillCircle(kx + P(2), ky + P(2), P(6));
          gfx.fillStyle(0x55dd22, 0.95); gfx.fillCircle(kx, ky, P(6));
          gfx.fillStyle(0xccff88, 0.75); gfx.fillCircle(kx - P(1.5), ky - P(1.5), P(2.5));
        }

        // 刺（每 P(40) 交替兩側，依據當前長度）
        let s = 0;
        for (let d = P(40); d <= gl; d += P(40)) {
          s++;
          const kx = fromX + Math.cos(ang) * d;
          const ky = fromY + Math.sin(ang) * d;
          const side = s % 2 === 0 ? 1 : -1;
          const tLen = P(9);
          const tx1 = kx + nx * side * w * 0.85, ty1 = ky + ny * side * w * 0.85;
          const tx2 = tx1 + nx * side * tLen - Math.cos(ang) * tLen * 0.35;
          const ty2 = ty1 + ny * side * tLen - Math.sin(ang) * tLen * 0.35;
          gfx.lineStyle(P(2), 0x44bb11, 0.88);
          gfx.lineBetween(tx1, ty1, tx2, ty2);
          gfx.fillStyle(0xaaff44, 0.9); gfx.fillCircle(tx2, ty2, P(2));
        }

        // 尖端箭頭
        if (gl > P(30)) {
          gfx.fillStyle(0xccff55, 0.95);
          gfx.fillTriangle(
            ex2 + Math.cos(ang) * P(8), ey2 + Math.sin(ang) * P(8),
            ex2 + nx * P(7), ey2 + ny * P(7),
            ex2 - nx * P(7), ey2 - ny * P(7),
          );
        }
      };

      // 生長動畫
      let growLen = 0;
      const growTimer = this.time.addEvent({
        delay: 16, loop: true,
        callback: () => {
          growLen = Math.min(growLen + len * 16 / GROW_MS, len);
          drawVine(growLen);
          if (growLen >= len) {
            growTimer.destroy();
            // 長成後維持，再慢慢消失
            this.tweens.add({
              targets: gfx, alpha: 0, duration: DUR - GROW_MS,
              ease: 'Cubic.In', onComplete: () => gfx.destroy()
            });
          }
        },
      });

      // 傷害區域（500ms tick）
      this.plantZones.push({
        type: 'vine', x: fromX, y: fromY, r: w, len, ang,
        dmg, lastTick: now, tickInterval: 500, expiresAt: now + DUR, gfx: this.add.graphics(),
      });
    });
  }

  private poisonBurst(fromX: number, fromY: number, dist: number, r: number, dmg: number, count: number): void {
    const D = 20;
    const SPEED = P(190);
    const ORB_R = P(11);
    const HIT_R = ORB_R + P(16);

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      let px = fromX, py = fromY;
      let traveled = 0, phase = 0;

      const gfx = this.add.graphics().setDepth(D);

      const drawOrb = (ox: number, oy: number) => {
        gfx.clear();
        gfx.fillStyle(0x22aa44, 0.22 + Math.sin(phase) * 0.06);
        gfx.fillCircle(ox, oy, ORB_R * 1.8);
        gfx.fillStyle(0x001100, 0.42);
        gfx.fillEllipse(ox + P(4), oy + P(5), ORB_R * 1.8, ORB_R * 0.85);
        gfx.fillStyle(0x1a8833, 0.92);
        gfx.fillCircle(ox, oy, ORB_R);
        gfx.fillStyle(0x44cc55, 0.78);
        gfx.fillCircle(ox, oy, ORB_R * 0.70);
        gfx.fillStyle(0xaaffbb, 0.60);
        gfx.fillEllipse(ox - ORB_R * 0.26, oy - ORB_R * 0.30, ORB_R * 0.52, ORB_R * 0.26);
        gfx.lineStyle(P(1.5), 0x55ff77, 0.88);
        gfx.strokeCircle(ox, oy, ORB_R);
      };

      drawOrb(px, py);

      const moveTimer = this.time.addEvent({
        delay: 16, loop: true,
        callback: () => {
          phase += 0.15;
          const dx = Math.cos(angle) * SPEED * 16 / 1000;
          const dy = Math.sin(angle) * SPEED * 16 / 1000;
          px += dx; py += dy;
          traveled += Math.sqrt(dx * dx + dy * dy);

          drawOrb(px, py);

          // 打到玩家或友軍：爆炸並造成傷害
          const orbHit = Phaser.Math.Distance.Between(px, py, this.player.x, this.player.y) <= HIT_R
            || this._allyMinions.some(a => !a.isDead && Phaser.Math.Distance.Between(px, py, a.x, a.y) <= HIT_R);
          if (orbHit) {
            moveTimer.destroy();
            gfx.destroy();
            this.hitInRadius(px, py, HIT_R, dmg);
            this.poisonOrbExplodeVfx(px, py, r);
            return;
          }

          // 超出射程：靜默消散
          if (traveled >= dist * 2.5) {
            moveTimer.destroy();
            this.tweens.add({
              targets: gfx, alpha: 0, scaleX: 1.6, scaleY: 1.6,
              duration: 200, ease: 'Quad.Out', onComplete: () => gfx.destroy(),
            });
          }
        },
      });
    }
  }

  // ── 不死花王 VFX ─────────────────────────────────────────

  private spawnFlowerThreeSeeds(positions: { x: number; y: number }[]): void {
    const GROW_MS = 1500;
    const SKIP_R = P(70);
    const D = 17;
    positions.forEach(p => {
      const occupied = [...this._flowerThreeMinions].some(m =>
        m.active && Phaser.Math.Distance.Between(m.x, m.y, p.x, p.y) < SKIP_R,
      );
      if (occupied) return;
      this._pendingFlowerSeeds++;
      const gfx = this.add.graphics().setDepth(D);
      let t = 0;
      const timer = this.time.addEvent({
        delay: 16, loop: true, callback: () => {
          t += 16;
          const prog = Math.min(t / GROW_MS, 1);
          const pulse = Math.sin(t * 0.05) * 0.15 + 0.85;
          gfx.clear();
          const r = P(6) + prog * P(16);
          // Ground shadow
          gfx.fillStyle(0x000000, 0.20 * prog);
          gfx.fillEllipse(p.x + P(3), p.y + P(6), r * 2.2, r * 0.65);
          // Outer glow
          gfx.fillStyle(0x884400, 0.18 * pulse);
          gfx.fillCircle(p.x, p.y, r + P(8));
          // Shadow ring
          gfx.lineStyle(P(5), 0x553300, 0.35 * pulse);
          gfx.strokeCircle(p.x, p.y, r);
          // Main ring
          gfx.lineStyle(P(2.5), 0xffaa00, (0.55 + prog * 0.35) * pulse);
          gfx.strokeCircle(p.x, p.y, r);
          // Highlight ring
          gfx.lineStyle(P(1), 0xffee88, 0.45 * pulse);
          gfx.strokeCircle(p.x, p.y, r - P(1.5));
          // Sprouting stem
          const stemH = P(6) + prog * P(22);
          gfx.lineStyle(P(3), 0x226600, 0.9 * pulse);
          gfx.lineBetween(p.x, p.y - P(2), p.x, p.y - P(2) - stemH);
          // Leaf pair (appears after 40% growth)
          if (prog > 0.4) {
            const lp = (prog - 0.4) / 0.6;
            const lh = P(8) * lp;
            const lw = P(6) * lp;
            gfx.fillStyle(0x44cc22, 0.85 * pulse * lp);
            gfx.fillEllipse(p.x - lw, p.y - P(2) - stemH * 0.6, lw * 2, lh);
            gfx.fillEllipse(p.x + lw, p.y - P(2) - stemH * 0.6, lw * 2, lh);
          }
          // Crown blossom tip (last 25% growth)
          if (prog > 0.75) {
            const fp = (prog - 0.75) / 0.25;
            gfx.fillStyle(0xffcc44, 0.90 * pulse * fp);
            gfx.fillCircle(p.x, p.y - P(2) - stemH, P(5) * fp);
            gfx.lineStyle(P(1.5), 0xffe890, 0.75 * fp * pulse);
            gfx.strokeCircle(p.x, p.y - P(2) - stemH, P(5) * fp);
          }
        },
      });

      this.time.delayedCall(GROW_MS, () => {
        timer.destroy(); gfx.destroy();
        this._pendingFlowerSeeds = Math.max(0, this._pendingFlowerSeeds - 1);
        if (this.gameOver) return;
        // Burst particles
        const burst = this.add.particles(p.x, p.y, 'pxl2', {
          speed: { min: 60, max: 180 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.6, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: [0xffaa00, 0xffcc44, 0x88ff44, 0xffee88],
          lifespan: { min: 180, max: 380 },
          emitting: false,
        }).setDepth(D + 2);
        burst.emitParticleAt(0, 0, 18);
        this.time.delayedCall(450, () => { if (burst.active) burst.destroy(); });
        // Spawn random flower minion (10% elite) with extended range
        const isElite = Math.random() < 0.08;
        const pool = isElite
          ? ['elite_plant1', 'elite_plant2', 'elite_plant3']
          : ['plant1_s', 'plant2_s', 'plant3_s'];
        const defId = pool[Math.floor(Math.random() * pool.length)];
        const m = this.spawnMinionAtForBoss(defId, p.x, p.y, isElite);
        if (m) {
          m.rangedRange = Math.round(500 * DPR);
          this._flowerThreeMinions.add(m);
        }
      });
    });
  }

  protected spawnMinionAtForBoss(defId: string, wx: number, wy: number, isElite = false): MinionSlime | null {
    const before = this.allMinions.length;
    this.spawnMinionAt(defId, wx, wy, isElite);
    return this.allMinions.length > before ? this.allMinions[this.allMinions.length - 1] : null;
  }

  private placeSlowZones(positions: { x: number; y: number }[], radius: number, dur: number, bossX: number, bossY: number): void {
    const D = 6;
    const ARC_MS = 580;
    const arcH = P(95);

    positions.forEach((p, pi) => {
      // ── Parabolic ball throw from boss head ───────────────────
      const delay = pi * 80;
      this.time.delayedCall(delay, () => {
        const ball = this.add.graphics().setDepth(35);
        let bt = 0;
        const ballTick = this.time.addEvent({
          delay: 16, loop: true, callback: () => {
            bt += 16;
            const prog = Math.min(bt / ARC_MS, 1);
            const headY = bossY - P(18);
            const gx = Phaser.Math.Linear(bossX, p.x, prog);
            const gy = Phaser.Math.Linear(headY, p.y, prog) - arcH * Math.sin(prog * Math.PI);
            const gShadowX = Phaser.Math.Linear(bossX, p.x, prog);
            const gShadowY = Phaser.Math.Linear(bossY, p.y, prog);
            const sc = 0.55 + prog * 0.45;
            ball.clear();
            // Ground shadow (grows as ball descends)
            ball.fillStyle(0x000000, 0.22 * prog * prog);
            ball.fillEllipse(gShadowX, gShadowY + P(4), P(20) * sc, P(7) * sc);
            // Outer glow
            ball.fillStyle(0x226600, 0.28);
            ball.fillCircle(gx, gy, P(13) * sc);
            // Ball body
            ball.fillStyle(0x44cc11, 0.95);
            ball.fillCircle(gx, gy, P(9) * sc);
            // Inner highlight
            ball.fillStyle(0xaaffaa, 0.80);
            ball.fillCircle(gx - P(2) * sc, gy - P(3) * sc, P(3.5) * sc);
            // Outer edge
            ball.lineStyle(P(1.5), 0x228800, 0.70);
            ball.strokeCircle(gx, gy, P(9) * sc);
            if (prog >= 1) { ballTick.destroy(); ball.destroy(); }
          },
        });

        // ── Zone appears after ball lands ─────────────────────────
        this.time.delayedCall(ARC_MS, () => {
          if (ball.active) { ballTick.destroy(); ball.destroy(); }

          // Impact burst
          const imp = this.add.graphics().setDepth(D + 2).setPosition(p.x, p.y);
          imp.fillStyle(0xaaffaa, 0.65); imp.fillCircle(0, 0, P(18));
          imp.fillStyle(0x55dd22, 0.80); imp.fillCircle(0, 0, P(10));
          this.tweens.add({ targets: imp, alpha: 0, scaleX: 2.8, scaleY: 2.8, duration: 320, ease: 'Quad.Out', onComplete: () => imp.destroy() });

          const gfx = this.add.graphics().setDepth(D);
          const now = this.time.now;

          const drawZone = (alpha: number) => {
            gfx.clear();
            // Soft fill
            gfx.fillStyle(0x003300, 0.14 * alpha);
            gfx.fillCircle(p.x, p.y, radius);
            // Outer halo
            gfx.lineStyle(P(9), 0x003300, 0.16 * alpha);
            gfx.strokeCircle(p.x, p.y, radius + P(5));
            gfx.lineStyle(P(5), 0x004400, 0.22 * alpha);
            gfx.strokeCircle(p.x, p.y, radius);
            gfx.lineStyle(P(2), 0x33aa11, 0.72 * alpha);
            gfx.strokeCircle(p.x, p.y, radius);
            gfx.lineStyle(P(1), 0x88ff44, 0.40 * alpha);
            gfx.strokeCircle(p.x, p.y, radius - P(2));
            // Inner rings
            gfx.lineStyle(P(1.5), 0x226600, 0.32 * alpha);
            gfx.strokeCircle(p.x, p.y, radius * 0.65);
            gfx.lineStyle(P(1), 0x33aa11, 0.24 * alpha);
            gfx.strokeCircle(p.x, p.y, radius * 0.35);
            // Radial vine spokes
            for (let s = 0; s < 8; s++) {
              const sa = (s / 8) * Math.PI * 2;
              gfx.lineStyle(P(1.5), 0x44cc22, 0.30 * alpha);
              gfx.lineBetween(
                p.x + Math.cos(sa) * radius * 0.38, p.y + Math.sin(sa) * radius * 0.38,
                p.x + Math.cos(sa) * radius * 0.62, p.y + Math.sin(sa) * radius * 0.62,
              );
            }
            // Centre dot
            gfx.fillStyle(0x44cc22, 0.72 * alpha);
            gfx.fillCircle(p.x, p.y, P(5));
            gfx.lineStyle(P(1), 0xaaffaa, 0.55 * alpha);
            gfx.strokeCircle(p.x, p.y, P(5));
          };

          const fadeIn = { a: 0 };
          this.tweens.add({
            targets: fadeIn, a: 1, duration: 300, ease: 'Quad.Out',
            onUpdate: () => drawZone(fadeIn.a),
            onComplete: () => {
              let pt = 0;
              const pulseTick = this.time.addEvent({
                delay: 50, loop: true, callback: () => {
                  pt += 50;
                  drawZone(0.85 + Math.sin(pt * 0.006) * 0.15);
                },
              });
              this.time.delayedCall(dur - 500, () => {
                pulseTick.destroy();
                const fadeOut = { a: 1 };
                this.tweens.add({
                  targets: fadeOut, a: 0, duration: 500, ease: 'Quad.In',
                  onUpdate: () => drawZone(fadeOut.a),
                  onComplete: () => gfx.destroy(),
                });
              });
            },
          });

          const zone = { x: p.x, y: p.y, r: radius, expires: now + dur, gfx };
          this._slowZones.push(zone);
          this.time.delayedCall(dur, () => {
            const idx = this._slowZones.indexOf(zone);
            if (idx !== -1) this._slowZones.splice(idx, 1);
          });
        });
      });
    });
  }

  private blossomExplodeVfx(cx: number, cy: number, r: number): void {
    const D = 22;
    const flash = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 0.90); flash.fillCircle(0, 0, r * 0.45);
    flash.fillStyle(0xff4400, 0.72); flash.fillCircle(0, 0, r * 0.72);
    flash.fillStyle(0xff9900, 0.40); flash.fillCircle(0, 0, r);
    this.tweens.add({
      targets: flash, scaleX: 3.2, scaleY: 3.2, alpha: 0,
      duration: 360, ease: 'Quad.Out', onComplete: () => flash.destroy()
    });

    const ring = this.add.graphics().setDepth(D + 1).setPosition(cx, cy);
    ring.lineStyle(P(3), 0xff7700, 1); ring.strokeCircle(0, 0, r * 0.4);
    this.tweens.add({
      targets: ring, scaleX: 4.0, scaleY: 4.0, alpha: 0,
      duration: 400, ease: 'Quad.Out', onComplete: () => ring.destroy()
    });

    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + Math.random() * 0.35;
      const d = P(18 + Math.random() * 38);
      const fg = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
      const col = ([0xff4400, 0xff8800, 0xffcc00, 0x88ff44] as number[])[i % 4];
      fg.fillStyle(col, 1); fg.fillCircle(0, 0, P(2.5 + Math.random() * 3));
      this.tweens.add({
        targets: fg,
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 360, ease: 'Quad.Out', onComplete: () => fg.destroy()
      });
    }
  }

  private poisonOrbExplodeVfx(cx: number, cy: number, r: number): void {
    const D = 22;
    const flash = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 0.85); flash.fillCircle(0, 0, r * 0.40);
    flash.fillStyle(0x44ff88, 0.68); flash.fillCircle(0, 0, r * 0.70);
    flash.fillStyle(0x22aa44, 0.38); flash.fillCircle(0, 0, r);
    this.tweens.add({
      targets: flash, scaleX: 2.8, scaleY: 2.8, alpha: 0,
      duration: 340, ease: 'Quad.Out', onComplete: () => flash.destroy()
    });

    const ring = this.add.graphics().setDepth(D + 1).setPosition(cx, cy);
    ring.lineStyle(P(2.5), 0x55ff77, 1); ring.strokeCircle(0, 0, r * 0.35);
    this.tweens.add({
      targets: ring, scaleX: 3.8, scaleY: 3.8, alpha: 0,
      duration: 380, ease: 'Quad.Out', onComplete: () => ring.destroy()
    });

    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const d = P(12 + Math.random() * 24);
      const fg = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
      fg.fillStyle(0x44ff88, 1); fg.fillCircle(0, 0, P(2 + Math.random() * 2.5));
      this.tweens.add({
        targets: fg,
        x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 300, ease: 'Quad.Out', onComplete: () => fg.destroy()
      });
    }
  }

  private petalHitVfx(cx: number, cy: number, large: boolean): void {
    const D = 25;
    const baseR = large ? P(14) : P(6);

    // Center flash: white → pink → fade
    const flash = this.add.graphics().setDepth(D + 3).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 1); flash.fillCircle(0, 0, baseR * 1.1);
    flash.fillStyle(0xff66cc, 0.7); flash.fillCircle(0, 0, baseR * 0.65);
    this.tweens.add({
      targets: flash, alpha: 0, scaleX: large ? 1.8 : 1.5, scaleY: large ? 1.8 : 1.5,
      duration: large ? 280 : 200, ease: 'Quad.Out', onComplete: () => flash.destroy()
    });

    // Expanding ring
    const ring = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
    ring.lineStyle(large ? P(2) : P(1.5), 0xff44cc, 1);
    ring.strokeCircle(0, 0, baseR * 0.8);
    this.tweens.add({
      targets: ring, scaleX: large ? 3.5 : 2.8, scaleY: large ? 3.5 : 2.8, alpha: 0,
      duration: large ? 380 : 280, ease: 'Quad.Out', onComplete: () => ring.destroy()
    });

    // Petal fragments flying outward
    const count = large ? 10 : 6;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = (large ? Phaser.Math.Between(22, 48) : Phaser.Math.Between(12, 28)) * (P(1) / 3);
      const col = ([0xff44cc, 0xff88dd, 0xffffff, 0xdd00aa] as number[])[i % 4];
      const dot = this.add.graphics().setDepth(D + 2).setPosition(cx, cy);
      const r = large ? Phaser.Math.Between(2, 4) : Phaser.Math.Between(1, 3);
      dot.fillStyle(col, 1); dot.fillCircle(0, 0, P(r));
      this.tweens.add({
        targets: dot,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0,
        scaleX: 0.3, scaleY: 0.3,
        duration: large ? 380 : 260,
        ease: 'Quad.Out',
        onComplete: () => dot.destroy(),
      });
    }

    // Secondary shockwave ring (large only)
    if (large) {
      const ring2 = this.add.graphics().setDepth(D + 1).setPosition(cx, cy);
      ring2.lineStyle(P(1), 0xffccee, 0.6);
      ring2.strokeCircle(0, 0, baseR * 0.5);
      this.tweens.add({
        targets: ring2, scaleX: 5.0, scaleY: 5.0, alpha: 0,
        duration: 500, ease: 'Quad.Out', onComplete: () => ring2.destroy()
      });
    }
  }

  protected fireProjectile(fromX: number, fromY: number, toX: number, toY: number, texKey: string, dmg: number, speed: number, batchId?: number): void {
    const proj = this.minionProjGroup.create(fromX, fromY, texKey) as Phaser.Physics.Arcade.Image;
    proj.setDepth(20);
    (proj as any).dmg = dmg;
    if (batchId !== undefined) (proj as any).batchId = batchId;
    const body = proj.body as Phaser.Physics.Arcade.Body;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, toX, toY);
    (this.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
      Phaser.Math.RadToDeg(angle), speed, body.velocity,
    );
    this.time.delayedCall(3500, () => { if (proj.active) proj.destroy(); });
  }

  protected explodeAt(wx: number, wy: number, atk: number, radiusMult = 1.0): void {
    const R = Math.round(MinionSlime.EXPLODE_RADIUS * radiusMult);
    const dmg = atk;

    // Shockwave ring — expands outward and fades
    const ring = this.add.graphics({ x: wx, y: wy }).setDepth(50);
    ring.lineStyle(P(4), 0xff6600, 1);
    ring.strokeCircle(0, 0, R * 0.3);
    this.tweens.add({
      targets: ring, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 380,
      ease: 'Cubic.Out', onComplete: () => ring.destroy(),
    });

    // Center flash — bright burst that quickly shrinks
    const flash = this.add.graphics({ x: wx, y: wy }).setDepth(51);
    flash.fillStyle(0xffffff, 1); flash.fillCircle(0, 0, R * 0.55);
    flash.fillStyle(0xff8800, 0.9); flash.fillCircle(0, 0, R * 0.35);
    this.tweens.add({
      targets: flash, scaleX: 0.1, scaleY: 0.1, alpha: 0, duration: 220,
      ease: 'Quad.In', onComplete: () => flash.destroy(),
    });

    // Sparks — 6 small circles flying outward
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      const dist = R * Phaser.Math.FloatBetween(1.1, 1.8);
      const spark = this.add.graphics({ x: wx, y: wy }).setDepth(49);
      spark.fillStyle(0xffcc00, 1);
      spark.fillCircle(0, 0, P(3));
      this.tweens.add({
        targets: spark,
        x: wx + Math.cos(angle) * dist,
        y: wy + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.3, scaleY: 0.3,
        duration: 320, ease: 'Quad.Out',
        onComplete: () => spark.destroy(),
      });
    }

    this.hitInRadius(wx, wy, R, dmg);
  }

  protected spikeAt(tx: number, ty: number, atk: number, isElite = false, sizeMult = 1): void {
    const R = Math.round(MinionSlime.SPIKE_RADIUS * (isElite ? 1.4 : 1.0) * sizeMult);
    const dmg = atk;
    const spCount = isElite ? 10 : 7;
    const WARN_MS = MinionSlime.SPIKE_WARN_MS;

    // Fixed crack angles shared between warning and burst phases
    const crackAngles: number[] = [];
    for (let i = 0; i < spCount; i++)
      crackAngles.push((i / spCount) * Math.PI * 2 + (i % 2 === 0 ? 0.15 : -0.12));

    // ── Warning phase ──────────────────────────────────────────────────────
    const warn = this.add.graphics({ x: tx, y: ty }).setDepth(6);
    let warnElapsed = 0;
    const warnTimer = this.time.addEvent({
      delay: 16, loop: true, callback: () => {
        warnElapsed += 16;
        const t = Math.min(warnElapsed / WARN_MS, 1);
        const pulse = Math.sin(warnElapsed * 0.025 * (1 + t * 3)) * 0.2 + 0.8;
        warn.clear();

        // Earth glow fill
        warn.fillStyle(0x6b2f00, (0.1 + t * 0.3) * pulse);
        warn.fillCircle(0, 0, R);

        // Crack lines — jagged 2-segment
        crackAngles.forEach((a, idx) => {
          const len = R * (0.4 + t * 0.6);
          const bend = idx % 2 === 0 ? 0.28 : -0.22;
          warn.lineStyle(P(1.5), 0x3d1a00, 0.4 + t * 0.5);
          warn.beginPath();
          warn.moveTo(0, 0);
          warn.lineTo(Math.cos(a + bend) * len * 0.5, Math.sin(a + bend) * len * 0.5);
          warn.lineTo(Math.cos(a) * len, Math.sin(a) * len);
          warn.strokePath();
        });

        // Outer danger ring
        warn.lineStyle(P(2), t > 0.65 ? 0xff3300 : 0xff8800, (0.5 + t * 0.4) * pulse);
        warn.strokeCircle(0, 0, R);

        // Centre shadow (pit forming)
        warn.fillStyle(0x000000, t * 0.45 * pulse);
        warn.fillCircle(0, 0, R * 0.4 * t);
      },
    });

    // ── Burst phase ────────────────────────────────────────────────────────
    this.time.delayedCall(WARN_MS, () => {
      warnTimer.destroy();
      warn.destroy();

      const burst = this.add.graphics({ x: tx, y: ty }).setDepth(50);

      // Cast shadow on ground (flat ellipse)
      burst.fillStyle(0x000000, 0.38);
      burst.fillEllipse(P(3), P(6), R * 2.6, R * 0.6);

      // Ground cracks (same pattern as warning)
      crackAngles.forEach((a, idx) => {
        const bend = idx % 2 === 0 ? 0.28 : -0.22;
        burst.lineStyle(P(1.5), 0x2a1000, 0.9);
        burst.beginPath();
        burst.moveTo(0, 0);
        burst.lineTo(Math.cos(a + bend) * R * 0.5, Math.sin(a + bend) * R * 0.5);
        burst.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        burst.strokePath();
      });

      // 3D spikes — back shadow + two shaded faces + highlight
      crackAngles.forEach(a => {
        const sH = R * 1.4;       // spike length (radially outward)
        const sHW = R * 0.24;      // half-width at base
        const perp = a + Math.PI / 2;
        const bx = Math.cos(a) * R * 0.08;
        const by = Math.sin(a) * R * 0.08;
        const tipX = Math.cos(a) * (R * 0.08 + sH);
        const tipY = Math.sin(a) * (R * 0.08 + sH);
        const blX = bx + Math.cos(perp) * sHW;
        const blY = by + Math.sin(perp) * sHW;
        const brX = bx - Math.cos(perp) * sHW;
        const brY = by - Math.sin(perp) * sHW;

        // Back-face drop shadow
        const sx = P(2.5), sy = P(3.5);
        burst.fillStyle(0x001800, 0.65);
        burst.fillTriangle(blX + sx, blY + sy, brX + sx, brY + sy, tipX + sx, tipY + sy);

        // Dark (shadow) face
        burst.fillStyle(0x1a6600, 0.97);
        burst.fillTriangle(bx, by, brX, brY, tipX, tipY);

        // Lit face
        burst.fillStyle(0x55dd22, 0.97);
        burst.fillTriangle(bx, by, blX, blY, tipX, tipY);

        // Highlight edge (bright rim along lit side)
        burst.lineStyle(P(1.5), 0xbbffaa, 0.72);
        burst.beginPath();
        burst.moveTo(blX, blY);
        burst.lineTo(tipX, tipY);
        burst.strokePath();

        // Base ellipse where spike meets the ground
        burst.fillStyle(0x44aa00, 0.55);
        burst.fillEllipse(bx, by + P(2), sHW * 2.4, P(5));
      });

      // Centre impact flash
      const flash = this.add.graphics({ x: tx, y: ty }).setDepth(51);
      flash.fillStyle(0xffffff, 0.9);
      flash.fillCircle(0, 0, R * 0.55);
      this.tweens.add({
        targets: flash, alpha: 0, scaleX: 1.8, scaleY: 1.8,
        duration: 220, ease: 'Quad.Out', onComplete: () => flash.destroy(),
      });

      // Expanding shockwave ring
      const ring = this.add.graphics({ x: tx, y: ty }).setDepth(49);
      ring.lineStyle(P(3), 0x55dd22, 0.85);
      ring.strokeCircle(0, 0, R);
      this.tweens.add({
        targets: ring, alpha: 0, scaleX: 1.5, scaleY: 1.5,
        duration: 420, ease: 'Quad.Out', onComplete: () => ring.destroy(),
      });

      // Main burst fade
      this.tweens.add({
        targets: burst, alpha: 0, duration: 550,
        ease: 'Quad.In', onComplete: () => burst.destroy(),
      });

      this.hitInRadius(tx, ty, R, dmg);
    });
  }

  protected _initPotionTextures(): void {
    if (this.textures.exists('icon_potion_health_s')) return;
    const POTION_FRAMES: Record<string, number> = {
      icon_potion_health_s: 89,
      icon_potion_health_m: 90,
      icon_potion_health_l: 101,
      icon_potion_revive: 93,
      icon_potion_atk: 91,
      icon_potion_def: 99,
      icon_potion_speed: 95,
    };
    const sheet = this.textures.get('potions_sheet');
    for (const [key, fi] of Object.entries(POTION_FRAMES)) {
      const frame = sheet.get(fi);
      const ct = this.textures.createCanvas(key, 16, 16);
      if (!ct) continue;
      (ct.getContext() as CanvasRenderingContext2D).drawImage(
        frame.source.image as HTMLImageElement,
        frame.cutX, frame.cutY, 16, 16, 0, 0, 16, 16,
      );
      ct.refresh();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected generateTextures(): void {
    if (!this.textures.exists('grass')) {
      const gg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base – mid-green
      gg.fillStyle(0x4e9430, 1); gg.fillRect(0, 0, 64, 64);
      // Large dark patches – give variation across the tile
      gg.fillStyle(0x3a7220, 0.45);
      gg.fillRect(0, 0, 28, 28); gg.fillRect(36, 36, 28, 28);
      gg.fillStyle(0x5caa38, 0.30);
      gg.fillRect(28, 0, 36, 32); gg.fillRect(0, 32, 32, 32);
      // Subtle warm-earth hint (gives a slight 3-D "ground" feel)
      gg.fillStyle(0x7a5c28, 0.08);
      gg.fillRect(10, 48, 44, 16);
      // Mid-tone blade clusters
      gg.fillStyle(0x68b840, 0.55);
      for (const [dx, dy, w, h] of [
        [4, 8, 3, 8], [14, 2, 2, 10], [24, 14, 3, 7], [38, 4, 2, 9], [50, 10, 3, 8],
        [6, 36, 2, 9], [18, 44, 3, 7], [30, 38, 2, 10], [44, 50, 3, 8], [58, 42, 2, 9],
        [10, 24, 3, 7], [46, 28, 2, 8], [56, 56, 3, 6], [2, 54, 2, 8], [32, 56, 3, 7],
      ] as number[][]) { gg.fillRect(dx, dy, w, h); }
      // Bright highlight blades
      gg.fillStyle(0x90d855, 0.45);
      for (const [dx, dy] of [[6, 4], [22, 16], [40, 2], [52, 18], [12, 46], [28, 52], [50, 44], [60, 30], [4, 30], [36, 22]]) {
        gg.fillRect(dx, dy, 2, 5);
      }
      // Dark shadow dots (ambient occlusion under blades)
      gg.fillStyle(0x28580e, 0.60);
      for (const [dx, dy] of [[5, 15], [15, 9], [25, 20], [39, 11], [51, 17], [7, 43], [19, 50], [31, 45], [45, 57], [57, 49], [11, 31], [47, 35], [57, 63], [3, 61], [33, 63]]) {
        gg.fillRect(dx, dy, 2, 2);
      }
      // Tiny pebbles / soil flecks
      gg.fillStyle(0x8a7050, 0.35);
      for (const [dx, dy] of [[20, 36], [44, 14], [8, 58], [56, 6], [30, 26], [60, 52]]) {
        gg.fillRect(dx, dy, 3, 2);
      }
      gg.generateTexture('grass', 64, 64);
      gg.destroy();
    }

    if (!this.textures.exists('grassland_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base dark damp soil
      g.fillStyle(0x1e1208, 1); g.fillRect(0, 0, 64, 64);
      // Mottled soil — multiple overlapping patches for organic variation
      g.fillStyle(0x140c04, 0.40); g.fillRect(0, 0, 28, 24); g.fillRect(38, 40, 26, 24);
      g.fillStyle(0x2a1a0c, 0.30); g.fillRect(26, 0, 38, 28); g.fillRect(0, 36, 30, 28);
      g.fillStyle(0x261610, 0.25); g.fillRect(10, 10, 20, 20); g.fillRect(36, 30, 22, 20);
      g.fillStyle(0x160e06, 0.35); g.fillRect(8, 40, 24, 18); g.fillRect(42, 8, 18, 22);
      // Root network — diagonal branching lines
      g.lineStyle(2, 0x5a3418, 0.65);
      g.lineBetween(4, 12, 24, 20); g.lineBetween(24, 20, 32, 28);
      g.lineStyle(1, 0x4a2c14, 0.55);
      g.lineBetween(24, 20, 18, 30);
      g.lineBetween(32, 28, 44, 24); g.lineBetween(44, 24, 58, 18);
      g.lineStyle(2, 0x5a3418, 0.60);
      g.lineBetween(8, 50, 22, 44); g.lineBetween(22, 44, 38, 48);
      g.lineStyle(1, 0x4a2c14, 0.50);
      g.lineBetween(38, 48, 46, 40); g.lineBetween(38, 48, 52, 54);
      g.lineStyle(1, 0x4a2c14, 0.45);
      g.lineBetween(50, 6, 58, 14); g.lineBetween(58, 14, 62, 24);
      g.lineBetween(2, 36, 10, 42);
      // Pebbles — ellipse base + highlight for 3D look
      for (const [x, y, w, h] of [[10, 8, 10, 7], [40, 6, 12, 8], [22, 38, 9, 6], [52, 28, 11, 7], [14, 54, 10, 6], [50, 52, 9, 7], [28, 18, 8, 5], [58, 42, 10, 6]] as number[][]) {
        g.fillStyle(0x2e2820, 1); g.fillEllipse(x, y, w, h);
        g.fillStyle(0x4a3e30, 0.60); g.fillEllipse(x - w * 0.15, y - h * 0.2, w * 0.5, h * 0.45);
      }
      // Moss patches near some pebbles
      g.fillStyle(0x2a4010, 0.55);
      g.fillEllipse(12, 6, 5, 3); g.fillEllipse(53, 26, 4, 3); g.fillEllipse(15, 52, 5, 3);
      // Tiny soil flecks
      g.fillStyle(0x4a2e14, 0.40);
      for (const [x, y] of [[4, 44], [26, 6], [44, 36], [60, 16], [6, 28], [56, 60], [34, 50], [16, 16], [62, 36], [30, 58]] as number[][])
        g.fillRect(x, y, 2, 2);
      // Hair-thin surface cracks
      g.lineStyle(1, 0x0e0804, 0.40);
      g.lineBetween(34, 4, 36, 14); g.lineBetween(36, 14, 38, 8);
      g.lineBetween(6, 58, 12, 62);
      g.generateTexture('grassland_wall', 64, 64); g.destroy();
    }

    if (!this.textures.exists('desert_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base — dark reddish sandstone
      g.fillStyle(0x241408, 1); g.fillRect(0, 0, 64, 64);
      // Sediment strata — horizontal layering bands
      g.fillStyle(0x1c1006, 0.45); g.fillRect(0, 0, 64, 12); g.fillRect(0, 26, 64, 10); g.fillRect(0, 50, 64, 14);
      g.fillStyle(0x301c0c, 0.30); g.fillRect(0, 12, 64, 8); g.fillRect(0, 40, 64, 8);
      g.fillStyle(0x3a220e, 0.20); g.fillRect(0, 20, 64, 6); g.fillRect(0, 36, 64, 4);
      // Wind erosion grooves — shallow diagonal scratches
      g.lineStyle(1, 0x180e06, 0.55);
      g.lineBetween(0, 8, 20, 10); g.lineBetween(20, 10, 44, 7); g.lineBetween(44, 7, 64, 9);
      g.lineBetween(0, 30, 16, 33); g.lineBetween(16, 33, 40, 29); g.lineBetween(40, 29, 64, 31);
      g.lineBetween(0, 52, 24, 55); g.lineBetween(24, 55, 50, 51); g.lineBetween(50, 51, 64, 53);
      g.lineStyle(1, 0x180e06, 0.35);
      g.lineBetween(8, 20, 30, 22); g.lineBetween(36, 44, 60, 46);
      // Embedded rocks — rounded, warm-toned
      for (const [x, y, w, h] of [[12, 6, 13, 8], [44, 4, 11, 7], [6, 36, 10, 7], [50, 30, 13, 8], [20, 52, 12, 8], [52, 56, 10, 6], [32, 22, 9, 6], [58, 18, 8, 5]] as number[][]) {
        g.fillStyle(0x3a2810, 1); g.fillEllipse(x, y, w, h);
        g.fillStyle(0x5a4020, 0.55); g.fillEllipse(x - w * 0.15, y - h * 0.2, w * 0.5, h * 0.45);
        g.fillStyle(0x180e06, 0.40); g.fillEllipse(x + w * 0.15, y + h * 0.2, w * 0.4, h * 0.35);
      }
      // Sand grain flecks
      g.fillStyle(0x5a3e1a, 0.35);
      for (const [x, y] of [[6, 14], [22, 4], [48, 18], [60, 10], [14, 42], [38, 56], [4, 58], [56, 38], [28, 34], [42, 48]] as number[][])
        g.fillRect(x, y, 2, 1);
      g.generateTexture('desert_wall', 64, 64); g.destroy();
    }

    if (!this.textures.exists('snow_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base — deep dark blue-grey ice rock
      g.fillStyle(0x161e28, 1); g.fillRect(0, 0, 64, 64);
      // Ice layer variation
      g.fillStyle(0x101820, 0.50); g.fillRect(0, 0, 30, 28); g.fillRect(36, 36, 28, 28);
      g.fillStyle(0x1e2a38, 0.35); g.fillRect(28, 0, 36, 32); g.fillRect(0, 34, 32, 30);
      g.fillStyle(0x0e1420, 0.30); g.fillRect(10, 14, 22, 18); g.fillRect(38, 34, 20, 18);
      // Frost crack network — branching thin lines
      g.lineStyle(1, 0x6080a0, 0.60);
      g.lineBetween(8, 6, 22, 18); g.lineBetween(22, 18, 30, 14);
      g.lineStyle(1, 0x4a6880, 0.45);
      g.lineBetween(22, 18, 16, 28); g.lineBetween(16, 28, 10, 36);
      g.lineBetween(30, 14, 46, 10); g.lineBetween(46, 10, 58, 16);
      g.lineStyle(1, 0x6080a0, 0.55);
      g.lineBetween(40, 40, 52, 32); g.lineBetween(52, 32, 60, 40);
      g.lineStyle(1, 0x4a6880, 0.40);
      g.lineBetween(40, 40, 34, 52); g.lineBetween(34, 52, 42, 60);
      g.lineStyle(1, 0x3a5870, 0.35);
      g.lineBetween(2, 48, 12, 44); g.lineBetween(56, 52, 62, 44);
      // Ice chunks — strong specular highlight (ice reflects sharply)
      for (const [x, y, w, h] of [[14, 10, 14, 9], [46, 8, 12, 8], [8, 44, 11, 8], [50, 42, 13, 9], [26, 54, 12, 7], [56, 26, 10, 7], [32, 28, 9, 6], [4, 24, 8, 6]] as number[][]) {
        g.fillStyle(0x1e3048, 1); g.fillEllipse(x, y, w, h);
        g.fillStyle(0x8ab0d0, 0.65); g.fillEllipse(x - w * 0.20, y - h * 0.25, w * 0.45, h * 0.40);
        g.fillStyle(0xd0e8f8, 0.40); g.fillEllipse(x - w * 0.22, y - h * 0.28, w * 0.20, h * 0.18);
      }
      // Frost dust patches — faint white scatter
      g.fillStyle(0x9ab8d0, 0.25);
      for (const [x, y] of [[4, 4], [20, 2], [56, 6], [60, 56], [2, 58], [36, 2], [62, 28], [0, 34]] as number[][])
        g.fillEllipse(x, y, 5, 3);
      g.generateTexture('snow_wall', 64, 64); g.destroy();
    }

    if (!this.textures.exists('lava_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base — near-black scorched volcanic rock
      g.fillStyle(0x0a0402, 1); g.fillRect(0, 0, 64, 64);
      // Rock facet variation — angular patches
      g.fillStyle(0x080302, 0.60); g.fillRect(0, 0, 26, 22); g.fillRect(40, 42, 24, 22);
      g.fillStyle(0x100804, 0.45); g.fillRect(24, 0, 40, 26); g.fillRect(0, 38, 36, 26);
      g.fillStyle(0x060202, 0.40); g.fillRect(12, 16, 20, 16); g.fillRect(38, 28, 18, 16);
      // Lava seams — glowing cracks through rock
      g.lineStyle(2, 0xff4400, 0.70);
      g.lineBetween(6, 10, 18, 20); g.lineBetween(18, 20, 28, 16);
      g.lineStyle(1, 0xff6600, 0.85);
      g.lineBetween(18, 20, 14, 30); g.lineBetween(14, 30, 22, 38);
      g.lineBetween(28, 16, 44, 12); g.lineBetween(44, 12, 56, 20);
      g.lineStyle(2, 0xff4400, 0.65);
      g.lineBetween(10, 50, 24, 44); g.lineBetween(24, 44, 38, 50);
      g.lineStyle(1, 0xff6600, 0.80);
      g.lineBetween(38, 50, 46, 42); g.lineBetween(38, 50, 52, 56);
      g.lineStyle(1, 0xff3300, 0.50);
      g.lineBetween(52, 8, 60, 18); g.lineBetween(4, 36, 12, 44);
      // Seam glow — soft halo along cracks
      g.fillStyle(0xff4400, 0.15); g.fillRect(16, 18, 14, 4); g.fillRect(22, 42, 18, 4);
      g.fillStyle(0xff6600, 0.10); g.fillRect(40, 10, 18, 4); g.fillRect(10, 48, 16, 4);
      // Obsidian facets — dark glossy angular patches
      for (const [x, y, w, h] of [[10, 8, 12, 8], [42, 6, 10, 7], [6, 42, 11, 7], [48, 38, 12, 8], [24, 52, 10, 6], [56, 50, 9, 6]] as number[][]) {
        g.fillStyle(0x0e0806, 1); g.fillEllipse(x, y, w, h);
        g.fillStyle(0x3a2820, 0.50); g.fillEllipse(x - w * 0.18, y - h * 0.22, w * 0.40, h * 0.35);
      }
      // Ember glow dots
      g.fillStyle(0xff8800, 0.60);
      for (const [x, y] of [[20, 22], [46, 14], [16, 32], [40, 52], [54, 22], [28, 44]] as number[][])
        g.fillRect(x, y, 2, 2);
      g.fillStyle(0xffcc44, 0.35);
      for (const [x, y] of [[21, 22], [47, 14], [17, 32]] as number[][])
        g.fillRect(x, y, 1, 1);
      g.generateTexture('lava_wall', 64, 64); g.destroy();
    }

    if (!this.textures.exists('forest_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base — very dark mossy earth
      g.fillStyle(0x161008, 1); g.fillRect(0, 0, 64, 64);
      // Earth patches
      g.fillStyle(0x100c04, 0.50); g.fillRect(0, 0, 28, 26); g.fillRect(38, 38, 26, 26);
      g.fillStyle(0x1e1610, 0.35); g.fillRect(26, 0, 38, 30); g.fillRect(0, 36, 30, 28);
      g.fillStyle(0x0e0c06, 0.30); g.fillRect(12, 16, 18, 16); g.fillRect(38, 28, 18, 16);
      // Major roots — thick, prominent
      g.lineStyle(3, 0x4a2c10, 0.80);
      g.lineBetween(2, 4, 20, 16); g.lineBetween(20, 16, 36, 12);
      g.lineStyle(3, 0x3e2408, 0.75);
      g.lineBetween(36, 12, 52, 20); g.lineBetween(52, 20, 62, 14);
      g.lineStyle(3, 0x4a2c10, 0.75);
      g.lineBetween(4, 52, 18, 44); g.lineBetween(18, 44, 34, 50);
      g.lineStyle(3, 0x3e2408, 0.70);
      g.lineBetween(34, 50, 50, 44); g.lineBetween(50, 44, 62, 52);
      // Minor root branches
      g.lineStyle(2, 0x5a3818, 0.65);
      g.lineBetween(20, 16, 16, 28); g.lineBetween(16, 28, 8, 34);
      g.lineBetween(36, 12, 32, 24); g.lineBetween(52, 20, 56, 32);
      g.lineBetween(18, 44, 14, 36); g.lineBetween(34, 50, 30, 38);
      g.lineStyle(1, 0x6a4422, 0.55);
      g.lineBetween(8, 34, 14, 42); g.lineBetween(32, 24, 40, 30);
      g.lineBetween(56, 32, 60, 42); g.lineBetween(30, 38, 22, 32);
      // Bark texture patches
      g.fillStyle(0x3a2008, 0.55);
      for (const [x, y, w, h] of [[18, 14, 16, 5], [34, 10, 14, 4], [50, 18, 10, 4], [16, 42, 16, 5], [32, 48, 14, 4]] as number[][])
        g.fillRect(x, y, w, h);
      // Moss patches — prominent
      g.fillStyle(0x243a0c, 0.70);
      g.fillEllipse(22, 14, 8, 5); g.fillEllipse(54, 22, 7, 5); g.fillEllipse(20, 46, 8, 5);
      g.fillEllipse(8, 30, 6, 4); g.fillEllipse(58, 44, 7, 4); g.fillEllipse(40, 56, 6, 4);
      g.fillStyle(0x2e4e10, 0.45);
      g.fillEllipse(24, 12, 4, 3); g.fillEllipse(56, 20, 4, 3); g.fillEllipse(22, 44, 4, 3);
      // Mushroom hint — small cap near a root
      g.fillStyle(0x6a3820, 0.90); g.fillEllipse(44, 34, 8, 5);
      g.fillStyle(0x8a5030, 0.70); g.fillEllipse(43, 33, 4, 3);
      g.fillStyle(0xf0e0c0, 0.60); g.fillRect(44, 34, 2, 4);
      // Tiny soil flecks
      g.fillStyle(0x4a3018, 0.40);
      for (const [x, y] of [[4, 44], [28, 6], [46, 36], [62, 16], [6, 26], [58, 60], [36, 52], [18, 18], [62, 38], [30, 60]] as number[][])
        g.fillRect(x, y, 2, 2);
      g.generateTexture('forest_wall', 64, 64); g.destroy();
    }

    if (!this.textures.exists('dungeon_wall')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base — dark mortar fill
      g.fillStyle(0x0e0c1a, 1); g.fillRect(0, 0, 64, 64);
      // Stone brick layout — 12px rows, alternating offset
      const brickColors = [0x1c1a2e, 0x181628, 0x201e34, 0x161422];
      const brickH = 10, mortarH = 2, brickW = 20, mortarW = 2;
      for (let row = 0; row * (brickH + mortarH) < 64; row++) {
        const by = row * (brickH + mortarH);
        const offset = (row % 2) * (brickW / 2 + mortarW / 2);
        for (let col = -1; col * (brickW + mortarW) - offset < 64; col++) {
          const bx = col * (brickW + mortarW) - offset;
          const color = brickColors[(row * 3 + col) % brickColors.length];
          g.fillStyle(color, 1); g.fillRect(bx + mortarW, by + mortarH, brickW, brickH);
          // Top highlight edge
          g.fillStyle(0x2e2a44, 0.40); g.fillRect(bx + mortarW, by + mortarH, brickW, 2);
          // Bottom shadow edge
          g.fillStyle(0x08060e, 0.50); g.fillRect(bx + mortarW, by + mortarH + brickH - 2, brickW, 2);
        }
      }
      // Cracks running across bricks
      g.lineStyle(1, 0x080610, 0.70);
      g.lineBetween(18, 4, 22, 16); g.lineBetween(22, 16, 26, 10);
      g.lineBetween(44, 26, 48, 40); g.lineBetween(48, 40, 42, 52);
      g.lineBetween(6, 38, 10, 50); g.lineBetween(56, 8, 60, 20);
      // Damp stains / mould patches
      g.fillStyle(0x1a2810, 0.45);
      g.fillEllipse(14, 22, 12, 7); g.fillEllipse(50, 48, 10, 6); g.fillEllipse(30, 56, 8, 5);
      g.fillStyle(0x141e0c, 0.30);
      g.fillEllipse(16, 20, 6, 4); g.fillEllipse(52, 46, 5, 4);
      // Torch soot smear — dark stain above an imaginary sconce
      g.fillStyle(0x08060e, 0.55); g.fillEllipse(32, 8, 10, 14);
      g.fillStyle(0x08060e, 0.30); g.fillEllipse(32, 4, 6, 8);
      g.generateTexture('dungeon_wall', 64, 64); g.destroy();
    }

    // ── 沙漠地板 ────────────────────────────────────────────
    if (!this.textures.exists('desert_floor')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0xd4a94f, 1); g.fillRect(0, 0, 64, 64);
      g.fillStyle(0xc09040, 0.40); g.fillRect(0, 0, 30, 20); g.fillRect(34, 40, 30, 24);
      g.fillStyle(0xe8c070, 0.35); g.fillRect(20, 0, 44, 30); g.fillRect(0, 34, 28, 30);
      g.fillStyle(0xb07830, 0.20); g.fillRect(8, 50, 48, 14);
      // sand ripples
      g.fillStyle(0xa86820, 0.25);
      for (const [x, y, w] of [[4, 12, 20], [28, 20, 18], [10, 34, 22], [38, 44, 16], [6, 54, 24]] as number[][])
        g.fillRect(x, y, w, 2);
      g.fillStyle(0xf0d890, 0.30);
      for (const [x, y] of [[6, 10], [30, 18], [12, 32], [40, 42], [8, 52]] as number[][])
        g.fillRect(x, y, 8, 1);
      g.fillStyle(0x987040, 0.40);
      for (const [x, y] of [[18, 28], [44, 8], [8, 46], [54, 30], [32, 56]] as number[][])
        g.fillRect(x, y, 3, 2);
      g.generateTexture('desert_floor', 64, 64); g.destroy();
    }

    // ── 雪地地板 ────────────────────────────────────────────
    if (!this.textures.exists('snow_floor')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0xe8f0f8, 1); g.fillRect(0, 0, 64, 64);
      g.fillStyle(0xc8ddf0, 0.40); g.fillRect(0, 0, 28, 28); g.fillRect(36, 36, 28, 28);
      g.fillStyle(0xd8eaf8, 0.30); g.fillRect(28, 0, 36, 32); g.fillRect(0, 32, 32, 32);
      g.fillStyle(0xa0c0e0, 0.20); g.fillRect(10, 48, 44, 16);
      // snowflake sparkles
      g.fillStyle(0xffffff, 0.80);
      for (const [x, y] of [[6, 6], [22, 14], [42, 4], [54, 20], [10, 38], [28, 50], [48, 44], [60, 32], [4, 28], [36, 24]] as number[][])
        g.fillRect(x, y, 2, 2);
      g.fillStyle(0xb8d4ee, 0.35);
      for (const [x, y] of [[14, 22], [38, 10], [8, 52], [56, 46], [30, 34]] as number[][])
        g.fillRect(x, y, 4, 4);
      g.fillStyle(0x88aacc, 0.25);
      for (const [x, y] of [[20, 40], [44, 16], [6, 60], [58, 8], [32, 28]] as number[][])
        g.fillRect(x, y, 3, 2);
      g.generateTexture('snow_floor', 64, 64); g.destroy();
    }

    // ── 熔岩地板 ────────────────────────────────────────────
    if (!this.textures.exists('lava_floor')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x4a2414, 1); g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x3a1c0e, 0.45); g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
      g.fillStyle(0x562a18, 0.35); g.fillRect(32, 0, 32, 32); g.fillRect(0, 32, 32, 32);
      // 稀疏裂縫（只留三條）
      g.fillStyle(0xff5500, 0.75);
      g.fillRect(10, 18, 1, 20);
      g.fillRect(30, 8, 22, 1);
      g.fillRect(44, 40, 1, 18);
      // 暗岩石紋
      g.fillStyle(0x2e1a0c, 0.55);
      for (const [x, y] of [[6, 6], [36, 14], [20, 44], [50, 32], [8, 54], [54, 50]] as number[][])
        g.fillRect(x, y, 5, 3);
      g.generateTexture('lava_floor', 64, 64); g.destroy();
    }

    // ── 森林地板 ────────────────────────────────────────────
    if (!this.textures.exists('forest_floor')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x2a4a1a, 1); g.fillRect(0, 0, 64, 64);
      g.fillStyle(0x1e3812, 0.45); g.fillRect(0, 0, 28, 28); g.fillRect(36, 36, 28, 28);
      g.fillStyle(0x3a5e22, 0.35); g.fillRect(28, 0, 36, 32); g.fillRect(0, 32, 32, 32);
      g.fillStyle(0x4a6e2a, 0.25); g.fillRect(10, 48, 44, 16);
      // roots
      g.fillStyle(0x5a3810, 0.50);
      for (const [x, y, w, h] of [[8, 4, 2, 18], [10, 20, 12, 1], [22, 16, 1, 8], [36, 8, 2, 16], [38, 22, 14, 1], [50, 14, 1, 10], [4, 36, 2, 16], [6, 50, 18, 1], [24, 44, 1, 12], [42, 36, 2, 16], [44, 50, 16, 1]] as number[][])
        g.fillRect(x, y, w, h);
      // moss
      g.fillStyle(0x60a030, 0.35);
      for (const [x, y] of [[14, 30], [30, 10], [50, 40], [6, 54], [40, 26], [58, 12], [20, 48], [46, 58]] as number[][])
        g.fillRect(x, y, 4, 3);
      g.fillStyle(0x283818, 0.45);
      for (const [x, y] of [[18, 36], [44, 18], [8, 22], [56, 44], [32, 54], [4, 44]] as number[][])
        g.fillRect(x, y, 3, 2);
      g.generateTexture('forest_floor', 64, 64); g.destroy();
    }

    // ── 地下城地板 ──────────────────────────────────────────
    if (!this.textures.exists('dungeon_floor')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x585858, 1); g.fillRect(0, 0, 64, 64);
      // stone tile grid
      g.fillStyle(0x404040, 0.60);
      for (const x of [0, 32]) for (const y of [0, 32]) g.fillRect(x, y, 1, 64);
      for (const y of [0, 32]) for (const x of [0, 64]) g.fillRect(0, y, 64, 1);
      g.fillStyle(0x686868, 0.45); g.fillRect(2, 2, 28, 28); g.fillRect(34, 34, 28, 28);
      g.fillStyle(0x4e4e4e, 0.40); g.fillRect(34, 2, 28, 28); g.fillRect(2, 34, 28, 28);
      // subtle light reflection
      g.fillStyle(0x888888, 0.20);
      for (const [x, y] of [[4, 4], [36, 4], [4, 36], [36, 36]] as number[][])
        g.fillRect(x, y, 6, 2);
      // grout cracks
      g.fillStyle(0x303030, 0.50);
      for (const [x, y] of [[10, 16], [20, 8], [48, 20], [40, 10], [12, 44], [22, 52], [50, 40], [42, 54]] as number[][])
        g.fillRect(x, y, 4, 1);
      g.generateTexture('dungeon_floor', 64, 64); g.destroy();
    }
    if (!this.textures.exists('stone')) {
      const sg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      sg.fillStyle(0x28203a, 1); sg.fillRect(0, 0, 64, 64);
      sg.fillStyle(0x1e1828, 0.55); sg.fillRect(0, 0, 30, 30); sg.fillRect(34, 34, 30, 30);
      sg.fillStyle(0x332848, 0.45); sg.fillRect(30, 0, 34, 30); sg.fillRect(0, 34, 30, 30);
      sg.lineStyle(1, 0x0c0a14, 0.85);
      sg.lineBetween(10, 4, 18, 26); sg.lineBetween(18, 26, 13, 42);
      sg.lineBetween(40, 8, 54, 28); sg.lineBetween(54, 28, 48, 52);
      sg.lineBetween(4, 46, 22, 60); sg.lineBetween(44, 44, 60, 58);
      sg.fillStyle(0x504466, 0.40);
      for (const [dx, dy] of [[8, 10], [30, 4], [54, 18], [14, 52], [44, 46], [58, 6]] as number[][])
        sg.fillRect(dx, dy, 4, 2);
      sg.generateTexture('stone', 64, 64);
      sg.destroy();
    }
    if (!this.textures.exists('bullet')) {
      const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
      bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
      bg.generateTexture('bullet', 8, 8);
      bg.destroy();
    }
    if (!this.textures.exists('pxl')) {
      const ppg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      ppg.fillStyle(0xffffff, 1); ppg.fillRect(0, 0, 4, 4);
      ppg.generateTexture('pxl', 4, 4);
      ppg.destroy();
    }
    if (!this.textures.exists('pxl2')) {
      const spg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      spg.fillStyle(0xffffff, 1); spg.fillRect(0, 0, 2, 2);
      spg.generateTexture('pxl2', 2, 2);
      spg.destroy();
    }
    if (!this.textures.exists('tree')) {
      const tg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      tg.fillStyle(0x000000, 0.22);
      tg.fillEllipse(20, 45, 24, 7);
      tg.fillStyle(0x5c3317, 1);
      tg.fillRect(16, 29, 8, 16);
      tg.fillStyle(0x7a4a2a, 1);
      tg.fillRect(17, 29, 4, 16);
      tg.fillStyle(0x2d6e1e, 1);
      tg.fillCircle(20, 23, 14);
      tg.fillStyle(0x3d8a28, 1);
      tg.fillCircle(20, 18, 11);
      tg.fillStyle(0x4da030, 1);
      tg.fillCircle(20, 13, 8);
      tg.fillStyle(0x88dd44, 0.35);
      tg.fillCircle(16, 10, 5);
      tg.generateTexture('tree', 40, 48);
      tg.destroy();
    }
    if (!this.textures.exists('rock')) {
      const rg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      rg.fillStyle(0x000000, 0.2);
      rg.fillEllipse(14, 26, 22, 7);
      rg.fillStyle(0x6e6e6e, 1);
      rg.fillRect(4, 12, 20, 12);
      rg.fillRect(7, 8, 14, 5);
      rg.fillRect(2, 16, 4, 6);
      rg.fillRect(22, 15, 4, 7);
      rg.fillStyle(0x888888, 1);
      rg.fillRect(5, 12, 18, 10);
      rg.fillRect(8, 8, 12, 5);
      rg.fillStyle(0xaaaaaa, 0.5);
      rg.fillRect(7, 10, 6, 4);
      rg.generateTexture('rock', 28, 28);
      rg.destroy();
    }
    // icon_stone_broken / icon_stone_intact 已在 preload 以真實圖片載入
    if (!this.textures.exists('icon_card')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0xf0d898, 1); g.fillRect(5, 3, 22, 28);
      g.lineStyle(1.5, 0x7a3200, 1); g.strokeRect(5, 3, 22, 28);
      g.fillStyle(0xcc2222, 1); g.fillRect(5, 3, 22, 8);
      g.fillStyle(0x7a3200, 0.3); g.fillCircle(16, 18, 8);
      g.fillStyle(0xffee88, 0.6); g.fillCircle(16, 18, 5);
      g.generateTexture('icon_card', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('icon_slime_chunk')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x44cc44, 1); g.fillCircle(16, 18, 13);
      g.fillStyle(0x22aa22, 1); g.fillCircle(10, 22, 8); g.fillCircle(22, 22, 8);
      g.fillStyle(0x88ff88, 0.5); g.fillCircle(12, 12, 5);
      g.generateTexture('icon_slime_chunk', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('icon_slime_essence')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x44ddaa, 1); g.fillCircle(16, 20, 10);
      g.fillStyle(0x22bbaa, 1);
      g.fillTriangle(16, 4, 8, 20, 24, 20);
      g.fillStyle(0xaaffee, 0.6); g.fillCircle(13, 14, 4);
      g.generateTexture('icon_slime_essence', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('proj_blade_wave')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const W = P(14), H = P(6);
      // Elongated horizontal slash — cyan-white gradient feel
      g.fillStyle(0x0077cc, 0.85); g.fillRect(0, 0, W, H);
      g.fillStyle(0x44eeff, 1); g.fillRect(P(2), P(1), W - P(4), H - P(2));
      g.fillStyle(0xffffff, 0.9); g.fillRect(P(4), P(2), W - P(8), H - P(4));
      g.generateTexture('proj_blade_wave', W, H);
      g.destroy();
    }
    if (!this.textures.exists('proj_fast')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(5);
      g.fillStyle(0xff6600, 1); g.fillCircle(R, R, R);
      g.fillStyle(0xffcc44, 0.9); g.fillCircle(R - P(1), R - P(1), R * 0.45);
      g.generateTexture('proj_fast', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_slow')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(6);
      g.fillStyle(0x9900ff, 1); g.fillCircle(R, R, R);
      g.fillStyle(0xdd88ff, 0.85); g.fillCircle(R - P(1), R - P(1), R * 0.45);
      g.generateTexture('proj_slow', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_fast_elite')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(8);
      g.fillStyle(0xff6600, 1); g.fillCircle(R, R, R);
      g.fillStyle(0xffcc44, 0.9); g.fillCircle(R - P(1), R - P(1), R * 0.45);
      g.generateTexture('proj_fast_elite', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_slow_elite')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(9);
      g.fillStyle(0x9900ff, 1); g.fillCircle(R, R, R);
      g.fillStyle(0xdd88ff, 0.85); g.fillCircle(R - P(1), R - P(1), R * 0.45);
      g.generateTexture('proj_slow_elite', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_petal')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(5); const cx = R, cy = R;
      // cast shadow (flat ellipse on ground plane)
      g.fillStyle(0x550022, 0.42); g.fillEllipse(cx + R * 0.22, cy + R * 0.28, R * 1.65, R * 1.05);
      // dark outer rim
      g.fillStyle(0xcc0066, 1); g.fillCircle(cx, cy, R);
      // main body
      g.fillStyle(0xff44aa, 1); g.fillCircle(cx, cy, R * 0.82);
      // upper-left lighter zone (lit face)
      g.fillStyle(0xff99cc, 0.68); g.fillCircle(cx - R * 0.22, cy - R * 0.22, R * 0.54);
      // specular highlight
      g.fillStyle(0xffffff, 0.90); g.fillCircle(cx - R * 0.32, cy - R * 0.36, R * 0.22);
      g.generateTexture('proj_petal', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_homing_petal')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(6); const cx = R, cy = R;
      // soft outer glow (tracking aura)
      g.fillStyle(0xff44ee, 0.28); g.fillCircle(cx, cy, R);
      // cast shadow
      g.fillStyle(0x440022, 0.48); g.fillEllipse(cx + R * 0.20, cy + R * 0.26, R * 1.62, R * 1.04);
      // dark rim
      g.fillStyle(0xaa0077, 1); g.fillCircle(cx, cy, R * 0.87);
      // main body
      g.fillStyle(0xff22bb, 1); g.fillCircle(cx, cy, R * 0.73);
      // lit face
      g.fillStyle(0xff88ee, 0.72); g.fillCircle(cx - R * 0.18, cy - R * 0.20, R * 0.48);
      // specular
      g.fillStyle(0xffffff, 0.92); g.fillCircle(cx - R * 0.30, cy - R * 0.34, R * 0.20);
      // characteristic tracking ring
      g.lineStyle(P(0.8), 0xffccff, 0.55); g.strokeCircle(cx, cy, R * 0.87);
      g.generateTexture('proj_homing_petal', R * 2, R * 2);
      g.destroy();
    }
    if (!this.textures.exists('proj_homing_petal_large')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      const R = P(14); const cx = R, cy = R;
      // soft outer glow
      g.fillStyle(0xff44ee, 0.20); g.fillCircle(cx, cy, R);
      // cast shadow
      g.fillStyle(0x330011, 0.50); g.fillEllipse(cx + R * 0.18, cy + R * 0.24, R * 1.70, R * 1.08);
      // dark outer rim
      g.fillStyle(0x880055, 1); g.fillCircle(cx, cy, R * 0.93);
      // main body
      g.fillStyle(0xdd1199, 1); g.fillCircle(cx, cy, R * 0.80);
      // mid lit zone
      g.fillStyle(0xff55cc, 0.65); g.fillCircle(cx - R * 0.15, cy - R * 0.15, R * 0.58);
      // brighter upper-left zone
      g.fillStyle(0xff99dd, 0.52); g.fillCircle(cx - R * 0.28, cy - R * 0.30, R * 0.38);
      // primary specular
      g.fillStyle(0xffffff, 0.92); g.fillCircle(cx - R * 0.36, cy - R * 0.40, R * 0.17);
      // micro secondary specular
      g.fillStyle(0xffffff, 0.48); g.fillCircle(cx - R * 0.20, cy - R * 0.46, R * 0.08);
      // inner vein ring
      g.lineStyle(P(1), 0xffbbee, 0.32); g.strokeCircle(cx, cy, R * 0.52);
      g.generateTexture('proj_homing_petal_large', R * 2, R * 2);
      g.destroy();
    }

    // icon_gold 已在 preload 以真實圖片載入
    if (!this.textures.exists('icon_exp')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x2244aa, 1); g.fillCircle(16, 16, 14);
      g.fillStyle(0x4488ff, 1); g.fillCircle(16, 16, 11);
      g.fillStyle(0xaaddff, 0.8); g.fillCircle(11, 10, 4);
      g.fillStyle(0xffffff, 1);
      g.fillRect(14, 8, 4, 16); g.fillRect(9, 13, 14, 4);
      g.generateTexture('icon_exp', 32, 32);
      g.destroy();
    }
  }
}