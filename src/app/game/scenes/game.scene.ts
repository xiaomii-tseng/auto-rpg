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
import { MinionSlime } from '../objects/minion-slime';
import { VirtualJoystick } from '../ui/joystick';
import { PlayerStore } from '../data/player-store';
import { InventoryStore } from '../data/inventory-store';
import { SaveStore } from '../data/save-store';
import { CardStore } from '../data/card-store';
import { getMonsterDef, getCardDef, DropEntry, MonsterDef } from '../data/monster-data';
import { getElementMultiplier, ELEMENT_NAMES, ELEMENT_COLORS, QUALITY_NAMES, QUALITY_COLORS, SLOT_NAMES, STAT_NAMES, BEHAVIOR_NAMES, generateEquipment, randomQuality, getItemStats, EquipSlot, EquipmentItem } from '../data/equipment-data';
import { QuestStore, STAR_HP_MULT, STAR_STAT_MULT, STAR_DROP_MULT, STAR_DEF_MULT, STAR_EXP_MULT, STAR_EQUIP_QUALITY } from '../data/quest-store';
import { ELITE_HP_MULT, ELITE_SCALE_MOD } from '../data/monster-data';
import { NetworkService } from '../network/network.service';
import { PotionBarStore } from '../data/potion-bar-store';
import { ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L, ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED, ITEM_STONE_BROKEN, ITEM_STONE_INTACT, ITEM_STONE_GUARD, ITEM_QUEST_REROLL, ITEM_BLANK_CARD, getHealthPotionForStar } from '../data/monster-data';
import type { MapParams } from '../../../../shared/types';

const CO_OP_HP_MULT = 1.6;

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
  readyAt: number;
}

// 品質權重 47/35/15/3（正規化）
const EQUIP_DROP_QUALITY = { normal: 0.47, good: 0.35, fine: 0.15 };

const ITEM_DESCS: Record<string, string> = {
  [ITEM_STONE_BROKEN]:    '強化裝備時消耗',
  [ITEM_STONE_INTACT]:    '強化時提升成功率 +8%',
  [ITEM_STONE_GUARD]:     '強化失敗時防止裝備降級',
  [ITEM_QUEST_REROLL]:    '重置當前任務列表',
  [ITEM_BLANK_CARD]:      '10張可在商店抽一次卡片',
  [ITEM_POTION_HEALTH_S]: '回復 50 HP',
  [ITEM_POTION_HEALTH_M]: '回復 100 HP',
  [ITEM_POTION_HEALTH_L]: '回復 200 HP',
  [ITEM_POTION_REVIVE]:   '戰鬥中復活一次',
  [ITEM_POTION_ATK]:      '傷害 +20%，持續 30 秒',
  [ITEM_POTION_DEF]:      'DEF +20，持續 30 秒',
  [ITEM_POTION_SPEED]:    '移動速度 +20，持續 30 秒',
};

type SessionLootEntry =
  | { type: 'item';  itemId: string; itemName: string; qty: number }
  | { type: 'card';  cardId: string; itemName: string }
  | { type: 'equip'; equip: EquipmentItem; itemName: string };

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private joystick!: VirtualJoystick;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private bossHpGfx!: Phaser.GameObjects.Graphics;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private bossDebuffGfx!: Phaser.GameObjects.Graphics;
  private bossDebuffTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private gameOver = false;
  private teleporting = false;

  // 瞬步斬瞄準模式
  private dashAimAngle = 0;
  private worldW = 0;
  private worldH = 0;

  private allMinions: MinionSlime[] = [];
  private _flowerThreeMinions = new Set<MinionSlime>();
  private _pendingFlowerSeeds = 0;
  // ── Special card effect state ──
  private _orbitBalls: Array<{ gfx: Phaser.GameObjects.Graphics; angle: number; type: 'fire'|'ice'; lastHit: Map<object, number> }> = [];
  private _orbitAngle = 0;
  private _playerKnives: Array<{ gfx: Phaser.GameObjects.Graphics; x: number; y: number; vx: number; vy: number; spawnX: number; spawnY: number; maxDist: number; hitTargets: Set<object> }> = [];
  private _divineShieldTimer?: Phaser.Time.TimerEvent;
  private _divineShieldGfx?: Phaser.GameObjects.Graphics;
  private _divineShieldRollUntil = 0;  // 每次攻擊動作只判定一次（300ms 鎖）
  private _onHitLightningCooldown = 0;  // 攻擊觸發落雷冷卻
  private _freeRevivesUsed = 0;
  private _reviveDialogActive = false;
  private _atkDragPointerId = -1;
  private _atkDragStartX = 0;
  private _atkDragStartY = 0;
  private _atkDirGfx?: Phaser.GameObjects.Graphics;
  private _atkDragThreshold = 0;  // 初始化後設為 P(15)
  private _forceAttackAngle: number | null = null;  // 手動拖動攻擊方向（rad），null = 自動
  private _atkDragAngle: number | null = null;       // 目前正在拖動的角度，null = 未拖動
  private _allyMinions: MinionSlime[] = [];          // 有序陣列，上限 3，最舊的先移除
  private _allyGroup!: Phaser.Physics.Arcade.Group;  // 用於 projectile overlap 偵測
  private _slowZones: { x: number; y: number; r: number; expires: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private waypoints: Phaser.Math.Vector2[] = [];
  private corridorSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  private cornerPts: { x: number; y: number }[] = [];
  private readonly BOSS_ARENA_RADIUS = P(400);
  private bossArenaCenter = new Phaser.Math.Vector2(0, 0);
  private bossArenaShape = 0;   // 0=圓, 1=八角, 2=菱形, 3=圓角矩形
  private bossMonsterId = 'boss_slime_white';
  private questStar = 1;
  private _mapSeed = 0;
  private _initBossId?: string;
  private _initQuestStar?: number;
  private _mapParams?: MapParams;
  private partnerSprite?: Phaser.GameObjects.Sprite;
  private partnerLabel?: Phaser.GameObjects.Text;
  private partnerHpBar?: Phaser.GameObjects.Graphics;
  private _partnerHp = 100;
  private _partnerMaxHp = 100;
  private _partnerNickname = '';
  private _ownSkinId = 0;
  private _partnerSkinId = 0;
  private partnerIsDead = false;
  private _partnerPrevX = 0;
  private _partnerPrevY = 0;
  private _partnerPrevDir: 'down' | 'left' | 'right' | 'up' = 'down';
  private _partnerBehavior = 'slash180';
  private partnerAuraRing?: Phaser.GameObjects.Graphics;
  private _minionTargets = new Map<string, { x: number; y: number; isDashing: boolean }>();
  private bossActive = false;
  private lootDrops: LootDrop[] = [];
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
  private playerStartX = 0;
  private playerStartY = 0;
  private lastSafeX = 0;
  private lastSafeY = 0;
  private readonly CORR_HW = P(100);
  private auraTimer?: Phaser.Time.TimerEvent;
  private auraRing?: Phaser.GameObjects.Graphics;
  private activeFires: { x: number; y: number; r: number; expiresAt: number }[] = [];
  private _leechPool = 0;
  private minionProjGroup!: Phaser.Physics.Arcade.Group;
  private homingProjs: Phaser.Physics.Arcade.Image[] = [];
  private hitBatches = new Map<number, number>(); // batchId → hitTimestamp
  // ── 花怪召喚充能 ──────────────────────────────────────────
  private _flowerCharges = 3;
  private _flowerMaxCharges = 3;
  private _flowerChargeAccum = 0;
  private readonly _FLOWER_CHARGE_MS = 3000;
  private _flowerChargeGfx?: Phaser.GameObjects.Graphics;
  private _flowerChargeTxt?: Phaser.GameObjects.Text;
  private plantZones: { type: 'circle' | 'vine'; x: number; y: number; r: number; len?: number; ang?: number; dmg: number; lastTick: number; tickInterval: number; expiresAt: number; gfx: Phaser.GameObjects.Graphics }[] = [];
  private _sessionQty: Map<string, number> = new Map();
  private _atkBuffActive = false;
  private _atkBuffTimer?: Phaser.Time.TimerEvent;
  private _buffExpiry: Map<string, number> = new Map();
  private _buffHudTexts: Phaser.GameObjects.Text[] = [];
  private _lastBuffHudRefresh = 0;

  constructor() {
    super({ key: 'GameScene' });
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
    if (!this.textures.exists('icon_stone_broken')) this.load.image('icon_stone_broken', 'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact')) this.load.image('icon_stone_intact', 'other/ore1.webp');
    if (!this.textures.exists('icon_stone_guard')) this.load.image('icon_stone_guard', 'other/ore3.webp');
    if (!this.textures.exists('icon_quest_reroll')) this.load.image('icon_quest_reroll', 'other/ore4.webp');
    if (!this.textures.exists('icon_equip_drop'))   this.load.image('icon_equip_drop',   'other/fight.webp');
    if (!this.textures.exists('icon_gold')) this.load.image('icon_gold', 'other/coin.webp');
    if (!this.textures.exists('icon_potion_health_s')) this.load.image('icon_potion_health_s', 'other/coin.webp');
    if (!this.textures.exists('icon_potion_health_m')) this.load.image('icon_potion_health_m', 'other/coin.webp');
    if (!this.textures.exists('icon_potion_health_l')) this.load.image('icon_potion_health_l', 'other/coin.webp');
    if (!this.textures.exists('icon_potion_revive'))   this.load.image('icon_potion_revive',   'other/coin.webp');
    if (!this.textures.exists('icon_potion_atk'))      this.load.image('icon_potion_atk',      'other/coin.webp');
    if (!this.textures.exists('icon_potion_def'))      this.load.image('icon_potion_def',      'other/coin.webp');
    if (!this.textures.exists('icon_potion_speed'))    this.load.image('icon_potion_speed',    'other/coin.webp');
    this.generateTextures();
  }

  init(data: { seed?: number; questStar?: number; bossMonsterId?: string; mapParams?: MapParams; partnerNickname?: string; ownSkinId?: number; partnerSkinId?: number }): void {
    this._mapSeed = data?.seed ?? Math.floor(Math.random() * 1_000_000);
    this._initQuestStar = data?.questStar;
    this._initBossId = data?.bossMonsterId;
    this._mapParams = data?.mapParams;
    this._partnerNickname = data?.partnerNickname ?? '';
    this._ownSkinId = data?.ownSkinId ?? 0;
    this._partnerSkinId = data?.partnerSkinId ?? 0;

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
    const W = this.scale.width;
    // 遊戲一開始就清掉大廳 callbacks，避免 Guest 先退出時觸發 stale rebuild
    if (NetworkService.connected) NetworkService.clearLobbyCallbacks();
    this.gameOver = false;
    this.bossActive = false;
    this.allMinions = [];
    this.lootDrops = [];
    this._sessionLoot = [];
    this._flowerThreeMinions.clear();
    this._pendingFlowerSeeds = 0;
    this._slowZones = [];
    this._orbitBalls.forEach(b => b.gfx.destroy());
    this._orbitBalls = [];
    this._orbitAngle = 0;
    this._playerKnives.forEach(k => k.gfx.destroy());
    this._playerKnives = [];
    this._divineShieldTimer?.destroy();
    this._divineShieldTimer = undefined;
    this._freeRevivesUsed = 0;
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

    // ── 每場藥水使用上限 ─────────────────────────────────────
    this._atkBuffActive = false;
    this._atkBuffTimer?.destroy();
    this._atkBuffTimer = undefined;
    this._buffExpiry.clear();
    this._buffHudTexts.forEach(t => t.destroy());
    this._buffHudTexts = [];
    const HEAL_CAP  = 5;
    const BUFF_CAP  = 3;
    const REVIVE_CAP = 1;
    const capMap: Record<string, number> = {
      [ITEM_POTION_HEALTH_S]: HEAL_CAP,
      [ITEM_POTION_HEALTH_M]: HEAL_CAP,
      [ITEM_POTION_HEALTH_L]: HEAL_CAP,
      [ITEM_POTION_REVIVE]:   REVIVE_CAP,
      [ITEM_POTION_ATK]:      BUFF_CAP,
      [ITEM_POTION_DEF]:      BUFF_CAP,
      [ITEM_POTION_SPEED]:    BUFF_CAP,
    };
    this._sessionQty.clear();
    for (const [id, cap] of Object.entries(capMap)) {
      this._sessionQty.set(id, Math.min(InventoryStore.getItemQty(id), cap));
    }

    this.generateWaypoints();   // sets this.worldW / worldH / waypoints

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.createPlayerAnims();
    if (NetworkService.connected) this.createPartnerAnims();
    this.createSlimeAnims();
    this.generateAndDrawMap();
    this.wallLayer = this.buildWallTilemap();

    const startPt = this.waypoints[0];
    this.playerStartX = startPt.x;
    this.playerStartY = startPt.y;
    this.lastSafeX = startPt.x;
    this.lastSafeY = startPt.y;
    this.player = new Player(this, this.playerStartX, this.playerStartY);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.player.onDead = () => this.handlePlayerDead();
    this.player.onEvade = (x, y) => this.spawnEvadeText(x, y);

    // ── Co-op: partner sprite + position sync ─────────────
    if (NetworkService.connected) {
      const pScale = 1.5 * DPR;
      this.partnerSprite = this.add.sprite(this.playerStartX, this.playerStartY, 'partner_idle_shadow')
        .setScale(pScale).setDepth(9).setTint(0x44aaff);
      this.partnerSprite.play('partner_idle_down');

      this.partnerAuraRing = this.add.graphics().setDepth(8).setVisible(false);
      this.tweens.add({
        targets: this.partnerAuraRing, alpha: { from: 0.25, to: 0.55 },
        duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
      });

      // Send sword behavior + our nickname to partner
      this.time.delayedCall(800, () => {
        const behavior = PlayerStore.getEquipped().sword?.behavior ?? 'slash180';
        const nickname = localStorage.getItem('playerName') ?? '';
        NetworkService.sendAttack(`__behavior_init__:${nickname}`, 0, 0, 'down', behavior);
      });

      this.partnerLabel = this.add.text(this.playerStartX, this.playerStartY - P(40), this._partnerNickname, {
        fontSize: F(11), fontStyle: 'bold', color: '#88ccff', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(12);

      this.partnerHpBar = this.add.graphics().setDepth(11);

      NetworkService.onPartnerPos(({ x, y, lastDir, hp, maxHp }) => {
        if (!this.partnerSprite) return;
        const wx = x * DPR, wy = y * DPR;  // restore to local DPR space
        const moved = Math.abs(wx - this._partnerPrevX) > 0.5 || Math.abs(wy - this._partnerPrevY) > 0.5;
        // Don't override a playing attack animation
        if (!this.partnerSprite.anims.currentAnim?.key.includes('attack') &&
          !this.partnerSprite.anims.currentAnim?.key.includes('whirlwind') &&
          !this.partnerSprite.anims.currentAnim?.key.includes('multihit')) {
          const animKey = moved ? `partner_run_${lastDir}` : `partner_idle_${lastDir}`;
          if (this.partnerSprite.anims.currentAnim?.key !== animKey) this.partnerSprite.play(animKey, true);
        }
        this.partnerSprite.setPosition(wx, wy);
        this.partnerLabel?.setPosition(wx, wy - P(40));
        this._partnerPrevX = wx;
        this._partnerPrevY = wy;
        this._partnerPrevDir = lastDir as 'down' | 'left' | 'right' | 'up';
        if (hp !== undefined) this._partnerHp = hp;
        if (maxHp !== undefined) this._partnerMaxHp = maxHp;
        this.drawPartnerHpBar();
      });

      // Send HP whenever it changes, via the attack channel (no server changes needed)
      this.player.onHpChanged = (hp, maxHp) => {
        NetworkService.sendAttack(`__hp__:${hp}:${maxHp}`, 0, 0, 'down', '');
      };
      // Send initial HP so partner bar starts correct
      NetworkService.sendAttack(`__hp__:${this.player.currentHp}:${this.player.maxHpValue}`, 0, 0, 'down', '');

      NetworkService.onPartnerAttack(({ animKey, x, y, dir, behavior }) => {
        // HP update piggybacked on attack channel
        if (animKey.startsWith('__hp__:')) {
          const parts = animKey.split(':');
          this._partnerHp = parseInt(parts[1]);
          this._partnerMaxHp = parseInt(parts[2]);
          this.drawPartnerHpBar();
          return;
        }
        // Behavior handshake — store partner's weapon type and nickname
        if (animKey.startsWith('__behavior_init__')) {
          this._partnerBehavior = behavior;
          const colon = animKey.indexOf(':');
          if (colon !== -1) this.partnerLabel?.setText(animKey.slice(colon + 1));
          return;
        }
        if (!this.partnerSprite) return;
        const partnerAnimKey = animKey.replace(/^player_/, 'partner_');
        this.partnerSprite.play(partnerAnimKey, true);
        this.partnerSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
          if (!this.partnerSprite) return;
          this.partnerSprite.play(`partner_idle_${this._partnerPrevDir}`, true);
        });
        this.showPartnerAttackFX(behavior, this.partnerSprite.x, this.partnerSprite.y, dir);
      });

      // Send local attack info to partner (DPR-normalised)
      this.player.onAttackAnim = (key) => {
        const behavior = PlayerStore.getEquipped().sword?.behavior ?? 'slash180';
        NetworkService.sendAttack(key, this.player.x / DPR, this.player.y / DPR, this.player.lastDir, behavior);
      };

      NetworkService.onPartnerLeft(() => {
        this.partnerSprite?.setVisible(false);
        this.partnerLabel?.setVisible(false);
        this.partnerHpBar?.setVisible(false);
      });

      NetworkService.onReconnected(() => this._onReconnected());
      NetworkService.onReconnectFailed(() => this._onReconnectFailed());

      NetworkService.onPartnerDead(() => {
        if (!this.partnerSprite) return;
        this.partnerIsDead = true;
        this.partnerSprite.stop();
        this.partnerSprite.setTexture('partner_death_shadow', 6);
      });

      NetworkService.onPotionEffect(({ type, amount }) => {
        const sx = this.partnerSprite?.x ?? this.player.x;
        const sy = this.partnerSprite?.y ?? this.player.y;
        const range = P(this.POTION_RANGE);
        if (type === 'heal') {
          this.player.heal(amount);
          this.showMagicSeal(sx, sy + P(13), range, 0x44ff88, 'heal');
        } else if (type === 'revive' && this.gameOver) {
          this.gameOver = false;
          this.player.revive(amount / 100);
          this.player.play(`player_idle_${this.player.lastDir}`);
          this.showMagicSeal(sx, sy + P(13), range, 0xffee44, 'revive');
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
              hp: m.currentHp, maxHp: m.currentHp, isDead: false, isDashing: m.isDashing,
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

    const bossWp = this.waypoints[this.waypoints.length - 1];
    const bossDef = getMonsterDef(this.bossMonsterId)!;
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const coopMult = NetworkService.connected ? CO_OP_HP_MULT : 1;
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
    this.boss.onHpChanged = () => this.refreshBossBar();
    this.boss.onDead = () => this.handleBossDefeated();
    this.boss.onAoeExplode = (x, y) => {
      if (!this.bossActive) return;
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
      if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(this.boss.scaleDmg(50));
      this.damageAlliesNear(x, y, Boss.AOE_RADIUS, this.boss.scaleDmg(50));
    };
    this.boss.onRangedBarrageTrailTick = (x1, y1, x2, y2, radius, dmg) => {
      if (!this.bossActive) return;
      // Point-to-segment distance check
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

    const bossGroup = this.physics.add.group();
    bossGroup.add(this.boss, false);
    this.player.setCollideWorldBounds(true);
    (this.boss.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    this.physics.add.overlap(bossGroup, this.player, () => {
      if (!this.bossActive) return;
      if (this.boss.currentState === 'DASHING') this.player.takeDamage(this.boss.scaleDmg(45));
    });
    this.physics.add.overlap(bossGroup, this._allyGroup, (_b, allyObj) => {
      if (!this.bossActive) return;
      const ally = allyObj as MinionSlime;
      if (this.boss.currentState !== 'DASHING' || ally.isDead) return;
      const now = this.time.now;
      if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
      (ally as any)._lastDashHit = now;
      ally.takeDamage(this.boss.scaleDmg(45));
    });

    this.physics.add.collider(this.player, this.wallLayer);
    this.physics.add.collider(this.boss, this.wallLayer);

    // Minion projectile group
    this.minionProjGroup = this.physics.add.group();
    // 友軍花怪群組 — 供敵方彈道 overlap 偵測使用
    this._allyGroup = this.physics.add.group();
    this.physics.add.overlap(this.minionProjGroup, this._allyGroup, (proj, _ally) => {
      const p    = proj as Phaser.Physics.Arcade.Image;
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
        const dist = Phaser.Math.Distance.Between((p as any).spawnX, (p as any).spawnY, p.x, p.y);
        if (dist < blindDist) return;
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
        this.spawnMinionAttack(data.type, data.mx, data.my, data.tx, data.ty, data.atk, data.isElite);
      });
    }

    this.bossHpGfx = this.add.graphics().setScrollFactor(0).setDepth(5).setVisible(false);
    this.bossHpLabel = this.add.text(W / 2, P(6), '', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffcccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(6).setVisible(false);
    this.bossDebuffGfx = this.add.graphics().setScrollFactor(0).setDepth(7).setVisible(false);
    // Pre-create debuff stack labels (lazy creation inside physics callbacks causes canvas null errors)
    this.bossDebuffTexts.set('burn', this.add.text(0, 0, '', {
      fontSize: F(15), color: '#ffffff', stroke: '#000000', strokeThickness: 2, fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(8).setOrigin(0.5, 0.5).setVisible(false));

    const kb = this.input.keyboard!;
    this.keys = {
      ...kb.createCursorKeys(),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    const onResize = () => this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(this);
    this.addHUD();
    this.createExitButton();
    this.spawnAllMonsters();
    this.setupPortal(bossWp.x, bossWp.y);

    // 燃燒狀態 tick（400ms，處理疊層與傷害）
    this.time.addEvent({ delay: 400, repeat: -1, callback: this.tickBurns, callbackScope: this });

    // 血環被動計時器（線性：0%攻速=300ms，75%攻速=200ms，超過75%仍維持200ms）
    const scheduleAuraTick = () => {
      const atkSpd = CardStore.getTotalStats().atkSpeed;
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.auraTimer?.destroy(); this.auraRing?.destroy(); });
  }

  // ══════════════════════════════════════════════════════════════
  // ── Special card effects ──────────────────────────────────────

  private initSpecialCardEffects(): void {
    const stats = CardStore.getTotalStats();
    this._freeRevivesUsed = 0;

    // 旋轉球：火冰交錯排列
    const nFire = stats.orbitFireBalls ?? 0;
    const nIce  = stats.orbitIceBalls  ?? 0;
    const types: ('fire' | 'ice')[] = [];
    let fi = 0, ii = 0;
    while (fi < nFire || ii < nIce) {
      if (fi < nFire) { types.push('fire'); fi++; }
      if (ii < nIce)  { types.push('ice');  ii++; }
    }
    const total = types.length;
    for (let i = 0; i < total; i++) {
      const gfx = this.add.graphics().setDepth(25);
      this._orbitBalls.push({ gfx, angle: (i / Math.max(total, 1)) * Math.PI * 2, type: types[i], lastHit: new Map() });
    }

    // 週期飛刀計時器
    if ((stats.periodicKnives ?? 0) > 0) {
      this.time.addEvent({ delay: 4000, repeat: -1, callback: () => this.firePeriodicKnives() });
    }

    // 落雷計時器
    if ((stats.lightningStrike ?? 0) > 0) {
      this.time.addEvent({ delay: 2000, repeat: -1, callback: () => this.fireLightningStrike() });
    }

    // 無限神盾護體：立即啟動
    if ((stats.infiniteDivineShield ?? 0) > 0) {
      this.triggerDivineShield();
    }

    // 岩漿史萊姆夥伴
    if ((stats.lavaSlimeCompanion ?? 0) > 0) {
      this.spawnLavaSlimeCompanion();
    }
  }

  private updateOrbitBalls(delta: number): void {
    if (this._orbitBalls.length === 0) return;
    const ORBIT_SPEED = 0.0022;   // rad/ms ≈ 一圈約 2.8 秒
    const ORBIT_R     = P(48);
    const BALL_R      = P(6);
    const HIT_RANGE   = P(16);
    const HIT_CD      = 1000;
    const now         = this.time.now;

    this._orbitAngle += delta * ORBIT_SPEED;
    const isAlive = this.player.active && !this.gameOver;

    const nTotal = Math.min(Math.max(this._orbitBalls.length, 2), 8);

    for (let i = 0; i < this._orbitBalls.length; i++) {
      const b = this._orbitBalls[i];
      const a = this._orbitAngle + (i / this._orbitBalls.length) * Math.PI * 2;
      const bx = this.player.x + Math.cos(a) * ORBIT_R;
      const by = this.player.y + Math.sin(a) * ORBIT_R;

      b.gfx.setPosition(bx, by).clear();
      if (!isAlive) continue;

      const col  = b.type === 'fire' ? 0xff6600 : 0x44bbff;
      const glow = b.type === 'fire' ? 0xffaa00 : 0x88eeff;
      b.gfx.fillStyle(glow, 0.30); b.gfx.fillCircle(0, 0, BALL_R * 1.6);
      b.gfx.fillStyle(col,  0.90); b.gfx.fillCircle(0, 0, BALL_R);
      b.gfx.fillStyle(0xffffff, 0.50); b.gfx.fillCircle(-BALL_R * 0.28, -BALL_R * 0.28, BALL_R * 0.32);

      for (const t of this.getHittableTargets()) {
        if ((b.lastHit.get(t) ?? 0) + HIT_CD > now) continue;
        if (Phaser.Math.Distance.Between(bx, by, t.x, t.y) > HIT_RANGE) continue;
        b.lastHit.set(t, now);
        const orbitDmgMult = 1 + (CardStore.getTotalStats().orbitBallDmgPct ?? 0);
        const mult = (b.type === 'fire' ? 0.30 : 0.25) / Math.sqrt(nTotal) * orbitDmgMult;
        this.dealDamage(t, mult, bx, by, 'down');
        if (b.type === 'ice' && !(t as MinionSlime).isDead) {
          (t as MinionSlime).slowMult = 0.80;
          this.time.delayedCall(1500, () => { if (!(t as MinionSlime).isDead) (t as MinionSlime).slowMult = 1; });
        }
      }
      // 清理過期 CD 記錄
      b.lastHit.forEach((ts, k) => { if (ts + HIT_CD + 200 < now) b.lastHit.delete(k); });
    }
  }

  private updatePlayerKnives(delta: number): void {
    if (this._playerKnives.length === 0) return;
    const SPEED = P(468);  // px/sec (360 * 1.3)
    const dt = delta / 1000;

    for (let i = this._playerKnives.length - 1; i >= 0; i--) {
      const k = this._playerKnives[i];
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const traveled = Phaser.Math.Distance.Between(k.spawnX, k.spawnY, k.x, k.y);

      if (traveled >= k.maxDist) {
        k.gfx.destroy();
        this._playerKnives.splice(i, 1);
        continue;
      }

      // 依飛行方向旋轉刀身
      const angle = Math.atan2(k.vy, k.vx);
      k.gfx.setPosition(k.x, k.y).setRotation(angle);

      for (const t of this.getHittableTargets()) {
        if (k.hitTargets.has(t)) continue;
        if (Phaser.Math.Distance.Between(k.x, k.y, t.x, t.y) > P(14)) continue;
        k.hitTargets.add(t);
        this.dealDamage(t, 0.40, k.x, k.y, 'down');
      }
    }
  }

  private firePeriodicKnives(): void {
    if (!this.player.active || this.gameOver) return;
    const stats     = CardStore.getTotalStats();
    const count     = (stats.periodicKnives ?? 1) >= 2 ? 12 : 6;
    const maxDist   = P(200);
    const SPEED     = P(468);
    const baseAngle = Math.random() * Math.PI * 2;

    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i / count) * Math.PI * 2;
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
      this.tweens.add({ targets: spark, alpha: 0, scaleX: 0.1, scaleY: 0.1,
        x: this.player.x - Math.cos(angle) * P(8),
        y: this.player.y - Math.sin(angle) * P(8),
        duration: 180, ease: 'Quad.Out', onComplete: () => spark.destroy() });

      this._playerKnives.push({
        gfx, x: this.player.x, y: this.player.y,
        vx, vy,
        spawnX: this.player.x, spawnY: this.player.y,
        maxDist, hitTargets: new Set(),
      });
    }
  }

  private fireLightningStrike(): void {
    if (!this.player.active || this.gameOver) return;
    const stats   = CardStore.getTotalStats();
    const maxR    = P(200);
    const dmgMult = 0.50;
    const count   = stats.lightningStrike ?? 1;

    // 從 200px 內隨機選不重複的 count 個目標
    const pool = this.getHittableTargets().filter(t =>
      Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) <= maxR
    );
    if (pool.length === 0) return;

    // Fisher-Yates shuffle 取前 count 個
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const targets = pool.slice(0, count);

    for (const target of targets) {
      const tx = target.x, ty = target.y;

      // VFX：閃電線
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

      // 衝擊圈
      const ring = this.add.graphics({ x: tx, y: ty }).setDepth(59);
      ring.lineStyle(P(2), 0xaaddff, 1); ring.strokeCircle(0, 0, P(12));
      this.tweens.add({ targets: ring, scaleX: 2.5, scaleY: 2.5, alpha: 0, duration: 300, onComplete: () => ring.destroy() });

      // 以落點為中心 14px 範圍內所有目標都受傷
      const splashR = P(12);
      for (const t of this.getHittableTargets()) {
        if (Phaser.Math.Distance.Between(tx, ty, t.x, t.y) <= splashR) {
          this.dealDamage(t, dmgMult, tx, ty, 'down');
        }
      }
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

    this.dealDamage(target, dmgMult, this.player.x, this.player.y, 'down');
  }

  private overkillSplash(ox: number, oy: number, overkill: number): void {
    const R = P(18);
    const stats = CardStore.getTotalStats();
    const canChain = (stats.overkillSplash ?? 0) >= 2;

    for (const t of this.getHittableTargets()) {
      if (Phaser.Math.Distance.Between(ox, oy, t.x, t.y) > R) continue;
      this.dealDamage(t, 0, ox, oy, 'down');
      const chainOverkill = (t as MinionSlime).takeDamage(overkill);
      this.spawnDamageNumber(t.x, t.y, overkill, false, 1);
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
      const a  = (i / 8) * Math.PI * 2 + Math.random() * 0.3;
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

  private showFreeReviveDialog(): void {
    this._reviveDialogActive = true;
    (this.player as any).invincible = true;  // 等候期間玩家無敵，防止重複觸發 onDead

    const W = this.scale.width, H = this.scale.height;
    const bw = P(240), bh = P(150);
    const bx = (W - bw) / 2, by = (H - bh) / 2;
    const D = 200000;  // 高於 HP bar (100000) 與 debuff (100001)

    const bg = this.add.graphics().setScrollFactor(0).setDepth(D);
    bg.fillStyle(0x1a1a2e, 1); bg.fillRoundedRect(bx, by, bw, bh, P(10));
    bg.lineStyle(P(2), 0xffee44, 1); bg.strokeRoundedRect(bx, by, bw, bh, P(10));

    const title = this.add.text(W / 2, by + P(24), '你陣亡了！', {
      fontSize: F(16), fontStyle: 'bold', color: '#ffee44', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const stats = CardStore.getTotalStats();
    const remaining = (stats.freeRevive ?? 0) - this._freeRevivesUsed;
    const sub = this.add.text(W / 2, by + P(46), '是否使用免費復活？（滿血復活）', {
      fontSize: F(12), color: '#cccccc',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const reviveCount = this.add.text(W / 2, by + P(66), `剩餘復活次數：${remaining}`, {
      fontSize: F(12), fontStyle: 'bold', color: '#aaddff',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const btnW = P(80), btnH = P(30);
    const yesX = W / 2 - P(50), noX = W / 2 + P(50);
    const btnY  = by + P(114);

    const yesBg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    yesBg.fillStyle(0x226622, 1); yesBg.fillRoundedRect(yesX - btnW/2, btnY - btnH/2, btnW, btnH, P(6));
    const yesTxt = this.add.text(yesX, btnY, '復活', { fontSize: F(13), color: '#88ff88', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    const noBg = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    noBg.fillStyle(0x662222, 1); noBg.fillRoundedRect(noX - btnW/2, btnY - btnH/2, btnW, btnH, P(6));
    const noTxt = this.add.text(noX, btnY, '放棄', { fontSize: F(13), color: '#ff8888', fontStyle: 'bold' }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    let handled = false;
    const cleanup = () => {
      this._reviveDialogActive = false;
      this.input.off('pointerdown', onPointerDown);
      [bg, title, sub, reviveCount, yesBg, yesTxt, noBg, noTxt].forEach(o => o.destroy());
    };

    const onPointerDown = (pointer: Phaser.Input.Pointer) => {
      if (handled) return;
      const px = pointer.x, py = pointer.y;
      const inYes = px >= yesX - btnW/2 && px <= yesX + btnW/2 && py >= btnY - btnH/2 && py <= btnY + btnH/2;
      const inNo  = px >= noX  - btnW/2 && px <= noX  + btnW/2 && py >= btnY - btnH/2 && py <= btnY + btnH/2;
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

  private spawnAllyFlower(defId: string, lifetimeMs: number, spawnAngle?: number): void {
    const _capStats = CardStore.getTotalStats();
    const ALLY_CAP = 2 + (_capStats.summonFlowerCap ?? 0) + Math.floor((_capStats.summonFlowerCapPair ?? 0) / 2);
    if (this._allyMinions.length >= ALLY_CAP) return;

    const angle = spawnAngle ?? Math.random() * Math.PI * 2;
    const dist  = spawnAngle !== undefined ? P(20) : P(Phaser.Math.Between(40, 70));
    const ax    = this.player.x + Math.cos(angle) * dist;
    const ay    = this.player.y + Math.sin(angle) * dist;
    const ally  = this.spawnMinionAtForBoss(defId, ax, ay, defId.startsWith('elite_'));
    if (!ally) return;

    const ps = CardStore.getTotalStats();
    ally.isAlly = true;
    ally.setAllyStats(Math.max(1, Math.round(ps.maxHp * 1.00)), Math.max(1, Math.round(ps.atk * 0.45)));
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
      const wx = mx * DPR, wy = my * DPR;
      const hitTargets = new Set<object>(); // 同一波所有子彈共用，每個目標只打一次
      for (const c of this.minionProjGroup.getChildren()) {
        const img = c as Phaser.Physics.Arcade.Image;
        if (!(img as any).isAllyProj && img.active &&
            Phaser.Math.Distance.Between(img.x, img.y, wx, wy) < P(8)) {
          (img as any).isAllyProj = true;
          img.setTint(0x44ff88);
          (img as any).dmg = ally.atk; // 覆寫 spawnMinionAttack 附加的倍率，直接用 ally.atk
          const dmg = ally.atk;
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

    const removeAlly = () => {
      if (ally.isDead) return;
      const i = this._allyMinions.indexOf(ally);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(ally, false, false);
      ally.onDead = undefined;
      ally.forceKill();
    };
    this.time.delayedCall(lifetimeMs, removeAlly);

    const origOnDead = ally.onDead;
    ally.onDead = () => {
      const i = this._allyMinions.indexOf(ally);
      if (i !== -1) this._allyMinions.splice(i, 1);
      this._allyGroup.remove(ally, false, false);
      origOnDead?.();
    };
  }

  private trySummonAllyFlower(): void {
    const stats = CardStore.getTotalStats();
    const ALLY_CAP = 2 + (stats.summonFlowerCap ?? 0) + Math.floor((stats.summonFlowerCapPair ?? 0) / 2);

    if (this._allyMinions.length >= ALLY_CAP) {
      const oldest = this._allyMinions.shift()!;
      this._allyGroup.remove(oldest, false, false);
      oldest.onDead = undefined;
      oldest.forceKill();
    }

    this.spawnAllyFlower('plant3_s', 15000);
  }

  private tryFlowerSummonModeAttack(): void {
    if (this._flowerCharges <= 0) return;
    this._flowerCharges--;
    this._flowerChargeAccum = 0; // 重置 CD 計時

    const stats = CardStore.getTotalStats();
    const ALLY_CAP = 2 + (stats.summonFlowerCap ?? 0) + Math.floor((stats.summonFlowerCapPair ?? 0) / 2);

    if (this._allyMinions.length >= ALLY_CAP) {
      const oldest = this._allyMinions.shift()!;
      this._allyGroup.remove(oldest, false, false);
      oldest.onDead = undefined;
      oldest.forceKill();
    }

    // 手動拖曳方向優先，否則用玩家面向
    const dirMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const spawnAngle = this._forceAttackAngle ?? dirMap[this.player.lastDir] ?? 0;
    this._forceAttackAngle = null;
    this.spawnAllyFlower('plant3_s', 15000, spawnAngle);
  }

  private spawnLavaSlimeCompanion(): void {
    const angle   = Math.random() * Math.PI * 2;
    const dist    = P(Phaser.Math.Between(50, 80));
    const sx      = this.player.x + Math.cos(angle) * dist;
    const sy      = this.player.y + Math.sin(angle) * dist;
    const companion = this.spawnMinionAtForBoss('slime_lava_s', sx, sy, false);
    if (!companion) return;

    const ps = CardStore.getTotalStats();
    companion.isAlly = true;
    companion.setAllyStats(Math.max(1, Math.round(ps.maxHp * 1.20)), Math.max(1, Math.round(ps.atk * 0.70)));
    this._allyMinions.push(companion);
    this._allyGroup.add(companion);
    companion.setTint(0xff8844);

    let patrolTarget = { x: sx, y: sy };

    companion.getTargetPos = () => {
      const aggroR = P(100);
      let nearest: MinionSlime | null = null;
      let minD = Infinity;
      for (const m of this.allMinions) {
        if (m.isDead || this._allyMinions.includes(m)) continue;
        const d = Phaser.Math.Distance.Between(companion.x, companion.y, m.x, m.y);
        if (d < aggroR && d < minD) { minD = d; nearest = m; }
      }
      if (nearest) return [nearest.x, nearest.y];
      if (this.bossActive && this.boss.active &&
          Phaser.Math.Distance.Between(companion.x, companion.y, this.boss.x, this.boss.y) < aggroR) {
        return [this.boss.x, this.boss.y];
      }
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

  private getAttackTarget(): { x: number; y: number } {
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
    if (this.gameOver || this.teleporting) return;

    // Drain leech pool at 7.5% maxHp/s (POE-style life leech)
    if (this._leechPool > 0 && this.player?.active) {
      const delta = this.game.loop.delta;
      const maxRate = this.player.maxHpValue * 0.075 * (delta / 1000);
      const heal = Math.min(this._leechPool, maxRate);
      this._leechPool -= heal;
      this.player.heal(Math.round(heal));
    }

    if (this._buffExpiry.size > 0 && this.time.now - this._lastBuffHudRefresh > 500) {
      this._lastBuffHudRefresh = this.time.now;
      this.refreshBuffHud();
    }

    // Guest: lerp all minions toward host-provided positions
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

    this.checkLootPickup();

    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    if (this.keys.left.isDown || this.keys.a.isDown) vx = -1;
    else if (this.keys.right.isDown || this.keys.d.isDown) vx = 1;
    if (this.keys.up.isDown || this.keys.w.isDown) vy = -1;
    else if (this.keys.down.isDown || this.keys.s.isDown) vy = 1;

    const isDashBehavior = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'dashPierce';
    const isFlowerMode = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0;

    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      if (isFlowerMode) {
        this.tryFlowerSummonModeAttack();
      } else if (isDashBehavior) {
        this.attackDashPierce(0, 0);
      } else {
        const { x: tx, y: ty } = this.getAttackTarget();
        this.meleeAttack(tx, ty);
      }
    }

    this.player.move(vx, vy);

    // 血環火焰圈跟著玩家
    if (this.auraRing) {
      const isAura = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'aura';
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

    // 夥伴血環（僅在對方裝備 aura 時顯示）
    if (this.partnerAuraRing && this.partnerSprite?.active) {
      const isPartnerAura = this._partnerBehavior === 'aura';
      this.partnerAuraRing.setVisible(isPartnerAura && !this.gameOver);
      if (isPartnerAura) {
        const g = this.partnerAuraRing;
        const R = this.AURA_RANGE;
        const t = this.time.now / 1000;
        const px = this.partnerSprite.x, py = this.partnerSprite.y;
        g.setPosition(px, py + 10);
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

    // Reveal minions when player walks within range (AI already running since 400ms after spawn)
    const SHOW_DIST = P(500);
    for (const m of this.allMinions) {
      if (m.started && !m.visible && !m.isDead &&
        Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) < SHOW_DIST) {
        m.setVisible(true);
      }
    }

    // Snap player back if they somehow escape the open area (safety net for arena/corridor edges)
    if (this.isInOpenArea(this.player.x, this.player.y)) {
      this.lastSafeX = this.player.x;
      this.lastSafeY = this.player.y;
    } else {
      this.player.setPosition(this.lastSafeX, this.lastSafeY);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    }

    // Slow zone check — update player.slowMult each frame
    const now = this.time.now;
    const inSlow = this._slowZones.some(z =>
      z.expires > now &&
      Phaser.Math.Distance.Between(this.player.x, this.player.y, z.x, z.y) <= z.r,
    );
    this.player.slowMult = inSlow ? 0.35 : 1;

    // Y-sort: use foot position so objects sort at ground level
    this.player.setDepth(this.player.y + 30);
    if (this.bossActive) this.boss.setDepth(this.boss.y + 20);
    for (const m of this.allMinions) {
      if (!m.isDead) m.setDepth(m.y + 16);
    }

    this.updateOrbitBalls(this.game.loop.delta);
    this.updatePlayerKnives(this.game.loop.delta);

    if (this._divineShieldGfx && this.player.active) {
      const g = this._divineShieldGfx;
      g.setPosition(this.player.x, this.player.y).clear();
      const t  = this.time.now / 1000;
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
      const rotOffset  = t * 1.2;
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

    // 攻擊方向指示（固定在螢幕中心，玩家永遠在此）
    if (this._atkDirGfx && this._atkDragAngle !== null && this.player.active) {
      const g      = this._atkDirGfx;
      const angle  = this._atkDragAngle;
      const px = this.player.x - this.cameras.main.scrollX;
      const py = this.player.y - this.cameras.main.scrollY;
      const innerR = P(22), outerR = P(46);
      const sx = px + Math.cos(angle) * innerR, sy = py + Math.sin(angle) * innerR;
      const ex = px + Math.cos(angle) * outerR, ey = py + Math.sin(angle) * outerR;
      const headLen = P(10), headAngle = 0.5;

      g.clear();

      // 點狀提示圈
      const dotCount = 12;
      for (let i = 0; i < dotCount; i++) {
        const a = (i / dotCount) * Math.PI * 2;
        g.fillStyle(0xffffff, Math.abs(Math.cos(a - angle)) * 0.3 + 0.1);
        g.fillCircle(px + Math.cos(a) * innerR, py + Math.sin(a) * innerR, P(2));
      }

      // 箭頭桿
      g.lineStyle(P(2.5), 0xffe066, 0.95);
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.strokePath();

      // 箭頭頭
      g.lineStyle(P(2.5), 0xffe066, 0.95);
      g.beginPath();
      g.moveTo(ex, ey);
      g.lineTo(ex - headLen * Math.cos(angle - headAngle), ey - headLen * Math.sin(angle - headAngle));
      g.moveTo(ex, ey);
      g.lineTo(ex - headLen * Math.cos(angle + headAngle), ey - headLen * Math.sin(angle + headAngle));
      g.strokePath();

      // 尖端亮點
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(ex, ey, P(3));
    }

    // ── 花怪充能回復 + 按鈕 UI ────────────────────────────────
    if ((CardStore.getTotalStats().flowerSummonMode ?? 0) > 0) {
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
    const r  = P(52);

    // 充能圓弧（從上方順時針，顯示下一格充能進度）
    if (this._flowerCharges < this._flowerMaxCharges) {
      const pct = this._flowerChargeAccum / this._FLOWER_CHARGE_MS;
      const startA = -Math.PI / 2;
      const endA   = startA + pct * Math.PI * 2;
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

  private meleeAttack(tx: number, ty: number): void {
    if ((CardStore.getTotalStats().flowerSummonMode ?? 0) > 0) {
      this.tryFlowerSummonModeAttack();
      return;
    }
    const behavior = PlayerStore.getEquipped().sword?.behavior ?? 'slash180';
    if (behavior === 'aura') return;
    switch (behavior) {
      case 'whirlwind': this.attackWhirlwind(tx, ty); break;
      case 'dashPierce': this.attackDashPierce(tx, ty); break;
      case 'projectile': this.attackProjectile(tx, ty); break;
      case 'multiHit': this.attackMultiHit(tx, ty); break;
      case 'chargeSlam': this.attackChargeSlam(tx, ty); break;
      case 'boomerang': this.attackBoomerang(tx, ty); break;
      case 'magicFire': this.attackMagicFire(tx, ty); break;
      default: this.attackSlash180(tx, ty);
    }
  }

  // ── Unified damage helpers ────────────────────────────────

  private getHittableTargets(): Array<MinionSlime | Boss> {
    const out: Array<MinionSlime | Boss> = this.allMinions.filter(m => !m.isDead && !this._allyMinions.includes(m)) as Array<MinionSlime | Boss>;
    if (this.bossActive && this.boss.active) out.push(this.boss);
    return out;
  }

  private dealDamage(
    target: MinionSlime | Boss,
    dmgMult: number,
    srcX: number, srcY: number,
    dir: 'down' | 'left' | 'right' | 'up',
    attackElem: import('../data/equipment-data').Element = 'none',
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

    const allMult = 1 + (stats.allDmgPct ?? 0);
    const atkBuffMult = this._atkBuffActive ? 1.2 : 1;
    const dmg = Math.round(stats.atk * Phaser.Math.FloatBetween(0.85, 1.15) * dmgMult * (isCrit ? (1 + stats.critDmg) : 1) * elemMult * targetMult * allMult * atkBuffMult);
    const pen = isBoss ? stats.penetration : 0;

    let overkill = 0;
    const bossHpBefore = isBoss ? this.boss.currentHp : 0;
    if (!isBoss) {
      overkill = (target as MinionSlime).takeDamage(dmg);
    } else {
      target.takeDamage(dmg, pen);
    }

    target.knockback(srcX, srcY);
    const displayDmg = isBoss ? Math.round(dmg * this.boss.dmgDisplayMult) : dmg;
    if (stats.lifesteal > 0) this._leechPool += Math.round(displayDmg * stats.lifesteal);
    this.spawnDamageNumber(target.x, target.y, displayDmg, isCrit, elemMult * targetMult);
    if (NetworkService.connected) {
      if (isBoss) NetworkService.sendBossHit(bossHpBefore - this.boss.currentHp);
      else NetworkService.sendMinionHit((target as MinionSlime).minionId, dmg);
    }

    // 溢出傷害 AOE
    if ((stats.overkillSplash ?? 0) > 0 && overkill > 0) {
      this.overkillSplash(target.x, target.y, overkill);
    }

    // 神盾護體觸發（每次攻擊動作只判定一次，300ms 鎖避免多目標重複判）
    const shieldChance = stats.divineShieldChance ?? 0;
    if (shieldChance > 0 && this.time.now > this._divineShieldRollUntil) {
      this._divineShieldRollUntil = this.time.now + 300;
      if (Math.random() < shieldChance) this.triggerDivineShield();
    }

    // 召喚友軍花怪觸發（每張卡 15% 機率，2張合計 30%）
    const summonChance = stats.summonFlowerChance ?? 0;
    if (summonChance > 0 && Math.random() < summonChance) this.trySummonAllyFlower();

    // 攻擊觸發落雷
    const onHitLightning = stats.onHitLightningChance ?? 0;
    if (onHitLightning > 0 && this.time.now > this._onHitLightningCooldown && Math.random() < onHitLightning) {
      this._onHitLightningCooldown = this.time.now + 200;
      this.fireOnHitLightning(stats);
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
    const cd = Math.round(650 / (1 + stats.atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    const { dir, deg, tx, ty } = this.resolveAttackDir(MELEE_RANGE * 3);
    const arc = stats.attackArc;
    this.player.playAttack(tx, ty, () => {
      const px = this.player.x, py = this.player.y;
      const D = this.player.depth;
      const sa = Phaser.Math.DegToRad(deg - arc / 2);
      const ea = Phaser.Math.DegToRad(deg + arc / 2);
      const R = MELEE_RANGE;

      const hitTargets = new Set<object>();
      const checkSweepHit = (curEa: number) => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          const dx = t.x - px, dy = t.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > R) continue;
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
    const cd = Math.round(650 / (1 + stats.atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    const RANGE = Math.round(MELEE_RANGE * 1.1 * (1 + (stats.whirlwindRangePct ?? 0)));
    const px = this.player.x, py = this.player.y;
    const D = this.player.depth;
    this.player.playWhirlwind(() => {
      this.hitInArea(px, py, RANGE, 0.8 * (1 + (stats.whirlwindDmgPct ?? 0)), 360, 0, 'down');
      this.fxWhirlwind(px, py, RANGE, D);
    });
  }

  // ── 瞬步斬 dashPierce ─────────────────────────────────────

  private calcDashEndpoint(sx: number, sy: number, rad: number): { x: number; y: number } {
    const DASH = P(78) + (CardStore.getTotalStats().dashDistBonus ?? 0), PAD = P(32), STEP = P(4), PW = P(10), PH = P(8);
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

  private attackDashPierce(_tx: number, _ty: number): void {
    const cd = Math.round(650 / (1 + CardStore.getTotalStats().atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    if (this._forceAttackAngle !== null) {
      this.dashAimAngle = this._forceAttackAngle;
      this._forceAttackAngle = null;
    } else {
      const dashReach = P(78) + (CardStore.getTotalStats().dashDistBonus ?? 0) + P(28);
      const { rad } = this.resolveAttackDir(dashReach);
      this.dashAimAngle = rad;
    }
    this.executeDashPierce(this.dashAimAngle);
  }

  private executeDashPierce(rad: number): void {
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
          this.dealDamage(t, 0.91 * (1 + (CardStore.getTotalStats().dashDmgPct ?? 0)), this.player.x, this.player.y, dir);
        }
      },
    });
  }

  // ── 刀風 projectile ───────────────────────────────────────

  private attackProjectile(_tx: number, _ty: number): void {
    const stats0 = CardStore.getTotalStats();
    const SPEED = P(380), MAX_DIST = P(155) + (stats0.projectileDistBonus ?? 0);
    const { dir, rad } = this.resolveAttackDir(P(240));

    const cd = Math.round(650 / (1 + stats0.atkSpeed));
    if (!this.player.lockCooldown(cd)) return;

    const hitTargets = new Set<object>();
    this.player.startAttackAnim(`player_attack_${dir}`);
    const HIT_R = P(18);

    this.fxProjectile(this.player.x, this.player.y, rad, this.player.depth + 1, SPEED, MAX_DIST, (px, py) => {
      for (const t of this.getHittableTargets()) {
        if (hitTargets.has(t)) continue;
        if (Phaser.Math.Distance.Between(px, py, t.x, t.y) > HIT_R) continue;
        hitTargets.add(t);
        this.dealDamage(t, 0.55 * (1 + (stats0.projectileDmgPct ?? 0)), px, py, dir);
      }
    });
  }

  // ── 多段連擊 multiHit ─────────────────────────────────────

  private attackMultiHit(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const spd = 1 + stats.atkSpeed;
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
    const spd = 1 + bStats.atkSpeed;
    const cd = Math.round(1500 / spd);
    if (!this.player.lockCooldown(cd)) return;

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

  private attackMagicFire(_tx: number, _ty: number): void {
    const spd = 1 + CardStore.getTotalStats().atkSpeed;
    const cd = Math.round(1100 / spd);
    if (!this.player.lockCooldown(cd)) return;

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

    // 對踩在任意火焰內的敵人疊 1 層，同時記錄誰在火裡
    const minionInFire = new Set<(typeof this.allMinions)[number]>();
    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(m.x, m.y, f.x, f.y) <= f.r)) {
        m.applyBurn(now, burnCap, this.BURN_DURATION);
        m.applyBurn(now, burnCap, this.BURN_DURATION); // 小怪疊層速度是 Boss 的兩倍
        minionInFire.add(m);
      }
    }
    let bossInFire = false;
    if (this.bossActive && this.boss.active) {
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(this.boss.x, this.boss.y, f.x, f.y) <= f.r)) {
        this.boss.applyBurn(now, burnCap, this.BURN_DURATION);
        bossInFire = true;
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
      m.takeDamage(dmg);
      this.spawnDamageNumber(m.x, m.y, dmg, false, 1);
      if (NetworkService.connected) NetworkService.sendMinionHit(m.minionId, dmg);
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
    if ((PlayerStore.getEquipped().sword?.behavior ?? 'slash180') !== 'aura') return;

    const stats = CardStore.getTotalStats();
    const RANGE = this.AURA_RANGE * (1 + (stats.auraRadiusPct ?? 0));
    const baseDmg = this.player.maxHpValue * 0.065 * (1 + (stats.auraDmgPct ?? 0));
    const px = this.player.x, py = this.player.y;

    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (Phaser.Math.Distance.Between(px, py, m.x, m.y) > RANGE) continue;
      const isCrit = Math.random() < stats.crit;
      const dmg = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1));
      m.takeDamage(dmg);
      if (stats.lifesteal > 0) this._leechPool += Math.round(dmg * stats.lifesteal);
      this.spawnDamageNumber(m.x, m.y, dmg, isCrit, 1);
      if (NetworkService.connected) NetworkService.sendMinionHit(m.minionId, dmg);
    }
    if (this.bossActive && this.boss.active &&
      Phaser.Math.Distance.Between(px, py, this.boss.x, this.boss.y) <= RANGE) {
      const isCrit = Math.random() < stats.crit;
      const elemMult = getElementMultiplier('none', this.boss.element);
      const dmg = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1) * elemMult);
      const auraHpBefore = this.boss.currentHp;
      this.boss.takeDamage(dmg, stats.penetration);
      if (stats.lifesteal > 0) this._leechPool += Math.round(dmg * stats.lifesteal);
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, isCrit, elemMult);
      if (NetworkService.connected) NetworkService.sendBossHit(auraHpBefore - this.boss.currentHp);
    }
  }

  // ── 蓄力重擊 chargeSlam ───────────────────────────────────

  private attackChargeSlam(_tx: number, _ty: number): void {
    const spd = 1 + CardStore.getTotalStats().atkSpeed;
    const cd = Math.round(650 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir } = this.resolveAttackDir(MELEE_RANGE * 3);
    const SLAM_RANGE = MELEE_RANGE * 1.152;
    this.player.speedMult = 0.6;
    this.player.noInterrupt = true;

    // ── 蓄力視覺 ──────────────────────────────────────────────
    const chargeGfx = this.add.graphics().setDepth(this.player.depth + 1);
    let chargeT = 0;
    const updateCharge = () => {
      if (!chargeGfx.active) return;
      chargeT += 16;
      const prog = Math.min(chargeT / cd, 1);
      chargeGfx.clear();
      // 外層暈（隨蓄力擴大）
      const outerR = P(8) + prog * P(28);
      chargeGfx.lineStyle(P(3), 0xffaa00, 0.25 + prog * 0.35);
      chargeGfx.strokeCircle(this.player.x, this.player.y, outerR);
      // 中層（微脈動）
      const pulse = Math.sin(chargeT / 80) * P(3);
      chargeGfx.lineStyle(P(2), 0xffdd44, 0.5 + prog * 0.4);
      chargeGfx.strokeCircle(this.player.x, this.player.y, P(10) + pulse + prog * P(12));
      // 內核小點
      chargeGfx.fillStyle(0xffffff, 0.6 + prog * 0.4);
      chargeGfx.fillCircle(this.player.x, this.player.y, P(3) + prog * P(3));
    };
    const chargeTicker = this.time.addEvent({ delay: 16, repeat: Math.ceil(cd / 16), callback: updateCharge });

    this.time.delayedCall(cd, () => {
      this.player.speedMult = 1;
      this.player.noInterrupt = false;
      chargeTicker.destroy();
      chargeGfx.destroy();

      this.player.startAttackAnim(`player_attack_${dir}`);
      this.time.delayedCall(150, () => {
        const px = this.player.x, py = this.player.y;
        const D = this.player.depth;
        this.fxChargeSlam(px, py, SLAM_RANGE, D);
        const slamStats = CardStore.getTotalStats();
        this.hitInArea(px, py, SLAM_RANGE, 1.235 * (1 + (slamStats.chargeSlamDmgPct ?? 0)), 360, 0, dir);

        // 暈眩效果
        if ((slamStats.chargeSlamStunChance ?? 0) > 0 && Math.random() < slamStats.chargeSlamStunChance!) {
          for (const t of this.getHittableTargets()) {
            if (Phaser.Math.Distance.Between(px, py, t.x, t.y) <= SLAM_RANGE) {
              (t as MinionSlime).applyStun?.(2000);
            }
          }
        }

        // debug: 命中範圍
        const dbg = this.add.graphics().setDepth(this.player.depth + 3);
        dbg.lineStyle(2, 0xff4444, 0.9);
        dbg.strokeCircle(px, py, SLAM_RANGE);
        this.tweens.add({ targets: dbg, alpha: 0, duration: 350, onComplete: () => dbg.destroy() });
      });
    });
  }

  // ── Map / Monster Setup ───────────────────────────────

  private handleMinionDrop(monsterId: string, x: number, y: number): void {
    const def = getMonsterDef(monsterId);
    if (!def) return;
    const isElite = def.tier >= 3 && def.tier < 5;
    const { id: hpId, name: hpName } = getHealthPotionForStar(this.questStar);
    const potionDrops: import('../data/monster-data').DropEntry[] = [
      { itemId: hpId,              itemName: hpName,     rate: isElite ? 0.02 : 0.01, qtyMin: 1, qtyMax: 1 },
      ...(isElite ? [
        { itemId: ITEM_POTION_REVIVE, itemName: '復活藥水', rate: 0.004, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_ATK,   itemName: '攻擊力藥水', rate: 0.008, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_DEF,   itemName: '防禦力藥水', rate: 0.008, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_SPEED, itemName: '速度藥水',   rate: 0.008, qtyMin: 1, qtyMax: 1 },
      ] : []),
    ];
    this.spawnLoot(x, y, [...def.drops, ...potionDrops]);
    const cardDropMult = CardStore.getTotalStats().dropRateMult ?? 1;
    for (const card of def.cards) {
      if (Math.random() < card.rate * cardDropMult) this.spawnCardDrop(x, y, card.cardId);
    }
    const starEquipMult = 1 + (this.questStar - 1) * 0.25;
    const equipRate = (isElite ? 0.02 : 0.007) * starEquipMult;
    if (Math.random() < equipRate) {
      const ALL_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'ring2', 'sword'];
      const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)];
      this.spawnEquipDrop(x, y, generateEquipment(slot, randomQuality(EQUIP_DROP_QUALITY)));
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
    const count = mp ? mp.segments.length : rng.between(3, 5);
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
    this.cameras.main.setBackgroundColor(0x000000);
    this.add.rectangle(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 0x000000)
      .setDepth(-1);

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
      for (const wp of this.waypoints)
        g.fillRect(wp.x - rw, wp.y - rw, rw * 2, rw * 2);
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
      for (const wp of this.waypoints)
        g.strokeRect(wp.x - rw, wp.y - rw, rw * 2, rw * 2);
    };

    // ── Build shared mask ────────────────────────────────
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    fillAll(maskGfx);
    const sharedMask = maskGfx.createGeometryMask();

    // ── Layer -1: dark cliff wall face (below grass) ─────
    // strokeAll draws inner lines too, but they're hidden by the grass layer on top.
    // Only the part outside the mask (corridor boundary outward) stays visible.
    const wallFace = this.add.graphics().setDepth(-0.5);
    wallFace.lineStyle(P(28), 0x060e02, 1.0); strokeAll(wallFace);
    wallFace.lineStyle(P(14), 0x0f2205, 0.90); strokeAll(wallFace);
    wallFace.lineStyle(P(6), 0x1a3a08, 0.70); strokeAll(wallFace);

    // ── Layer 0: base grass (masked to corridor) ─────────
    // Use Tilemap (not TileSprite which allocates a worldW×worldH canvas).
    // Scale the 64×64 source texture to P(64)×P(64) so tiles have integer pixel size,
    // eliminating the sub-pixel gaps that appear when using setScale(fractionalDPR).
    {
      const SZ = P(64);
      if (!this.textures.exists('grass_tile')) {
        const canvas = document.createElement('canvas');
        canvas.width = SZ; canvas.height = SZ;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage((this.textures.get('grass').source[0] as any).image, 0, 0, SZ, SZ);
        this.textures.addCanvas('grass_tile', canvas);
      }
      const gcols = Math.ceil(this.worldW / SZ) + 1, grows = Math.ceil(this.worldH / SZ) + 1;
      const gMap = this.make.tilemap({ tileWidth: SZ, tileHeight: SZ, width: gcols, height: grows });
      const gLayer = gMap.createBlankLayer('grass_bg', gMap.addTilesetImage('grass_tile', 'grass_tile', SZ, SZ, 0, 0)!, 0, 0)!;
      gMap.fill(0, 0, 0, gcols, grows, false, 'grass_bg');
      gLayer.setDepth(0).setMask(sharedMask);
    }

    // ── Layer 0.3: subtle inner-edge AO (fill, not stroke) ─
    // Fill the walkable area dark at low alpha → then the grass on top is already drawn.
    // We want ONLY the border ring dark, so we fill the whole area dark first, then
    // fill a slightly inset version with slightly lighter grass tint to cancel center.
    // Simpler: just fill border areas of each segment individually.
    const aoGfx = this.add.graphics().setDepth(0.3).setMask(sharedMask);
    // 走廊條帶兩端各裁切 rw，避免延伸進房間造成深色線
    const aoTrim = hw * 2.2;
    aoGfx.fillStyle(0x000000, 0.22);
    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1) {               // 水平走廊
        const x0 = Math.min(s.x1, s.x2) + aoTrim;
        const x1b = Math.max(s.x1, s.x2) - aoTrim;
        if (x1b <= x0) continue;
        const ry = s.y1 - hw;
        aoGfx.fillRect(x0, ry, x1b - x0, P(48));
        aoGfx.fillRect(x0, ry + hw * 2 - P(48), x1b - x0, P(48));
      } else {                                          // 垂直走廊
        const y0 = Math.min(s.y1, s.y2) + aoTrim;
        const y1b = Math.max(s.y1, s.y2) - aoTrim;
        if (y1b <= y0) continue;
        const rx = s.x1 - hw;
        aoGfx.fillRect(rx, y0, P(48), y1b - y0);
        aoGfx.fillRect(rx + hw * 2 - P(48), y0, P(48), y1b - y0);
      }
    }
    // 房間角落 AO（只畫房間邊框，不穿入走廊）
    aoGfx.fillStyle(0x000000, 0.16);
    for (const c of [...this.cornerPts, ...this.waypoints]) {
      const rw2 = this.CORR_HW * 2.2;
      aoGfx.fillRect(c.x - rw2, c.y - rw2, rw2 * 2, P(40));
      aoGfx.fillRect(c.x - rw2, c.y + rw2 - P(40), rw2 * 2, P(40));
      aoGfx.fillRect(c.x - rw2, c.y - rw2, P(40), rw2 * 2);
      aoGfx.fillRect(c.x + rw2 - P(40), c.y - rw2, P(40), rw2 * 2);
    }

    // walls handled by buildWallTilemap() after generateAndDrawMap()
    this.placeInteriorDeco();
    this.drawBossArena();
  }

  private buildCorridorSegs(): void {
    this.corridorSegs = [];
    this.cornerPts = [];
    const crng = new SeededRNG(this._mapSeed + 3333);
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
    for (const wp of this.waypoints)
      if (Math.abs(px - wp.x) <= rw && Math.abs(py - wp.y) <= rw) return true;
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

  private placeInteriorDeco(): void {
    const STEP = P(180);
    for (let gx = 0; gx < this.worldW; gx += STEP) {
      for (let gy = 0; gy < this.worldH; gy += STEP) {
        if (Phaser.Math.Between(0, 9) < 4) continue;
        const jx = gx + Phaser.Math.Between(-P(60), P(60));
        const jy = gy + Phaser.Math.Between(-P(60), P(60));
        if (!this.isInOpenArea(jx, jy)) continue;

        // Keep clear around waypoints so combat space is unobstructed
        const tooClose = this.waypoints.some(
          wp => Phaser.Math.Distance.Between(jx, jy, wp.x, wp.y) < P(120),
        );
        if (tooClose) continue;

        const roll = Phaser.Math.Between(0, 9);
        if (roll < 6) {
          // Small rock — player can walk behind it
          const sc = Phaser.Math.FloatBetween(0.55, 0.85) * DPR;
          this.add.image(jx, jy, 'rock')
            .setScale(sc)
            .setDepth(jy + P(12))
            .setTint(0xbbbbaa);
        } else if (roll < 9) {
          // Grass tuft cluster
          for (let k = 0; k < Phaser.Math.Between(2, 4); k++) {
            const ox = Phaser.Math.Between(-P(14), P(14));
            const oy = Phaser.Math.Between(-P(8), P(8));
            this.add.graphics()
              .setDepth(jy + oy + P(4))
              .fillStyle(0x3a7a1a, 0.7)
              .fillEllipse(jx + ox, jy + oy, Phaser.Math.Between(P(10), P(18)), Phaser.Math.Between(P(6), P(10)));
          }
        } else {
          // Tiny dark pebble group
          for (let k = 0; k < 3; k++) {
            const ox = Phaser.Math.Between(-P(10), P(10));
            const oy = Phaser.Math.Between(-P(6), P(6));
            this.add.graphics()
              .setDepth(jy + oy + P(2))
              .fillStyle(0x555544, 0.6)
              .fillCircle(jx + ox, jy + oy, Phaser.Math.Between(P(2), P(4)));
          }
        }
      }
    }
  }

  private damageAlliesNear(x: number, y: number, radius: number, dmg: number): void {
    for (const ally of this._allyMinions) {
      if (ally.isDead) continue;
      if (Phaser.Math.Distance.Between(x, y, ally.x, ally.y) <= radius) ally.takeDamage(dmg);
    }
  }

  // 範圍傷害：同時打 player 和範圍內所有友軍
  private hitInRadius(x: number, y: number, r: number, dmg: number): void {
    const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
    if (dSq <= r * r) this.player.takeDamage(dmg);
    this.damageAlliesNear(x, y, r, dmg);
  }

  // 全場傷害：打 player 和所有友軍（不依位置）
  private hitGlobal(dmg: number): void {
    this.player.takeDamage(dmg);
    for (const ally of this._allyMinions) {
      if (!ally.isDead) ally.takeDamage(dmg);
    }
  }

  private nearestTargetPos(fromX: number, fromY: number): [number, number] {
    let best: [number, number] = [this.player.x, this.player.y];
    let bestDist = Phaser.Math.Distance.Between(fromX, fromY, this.player.x, this.player.y);

    if (NetworkService.connected && NetworkService.isHost && this.partnerSprite?.active) {
      const dg = Phaser.Math.Distance.Between(fromX, fromY, this.partnerSprite.x, this.partnerSprite.y);
      if (dg < bestDist) { bestDist = dg; best = [this.partnerSprite.x, this.partnerSprite.y]; }
    }

    // 友軍花怪也納入敵人的追擊目標
    for (const ally of this._allyMinions) {
      if (ally.isDead) continue;
      const d = Phaser.Math.Distance.Between(fromX, fromY, ally.x, ally.y);
      if (d < bestDist) { bestDist = d; best = [ally.x, ally.y]; }
    }

    return best;
  }

  private createBoss(bossDef: MonsterDef, totalHp: number): Boss {
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
    return new Boss(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
  }

  private spawnMinionAt(defId: string, wx: number, wy: number, isElite: boolean): void {
    const def = getMonsterDef(defId);
    if (!def) return;
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const atkMult = STAR_STAT_MULT[this.questStar] ?? 1;
    const coopMult = NetworkService.connected ? CO_OP_HP_MULT : 1;
    const hp = Math.round(def.hp * hpMult * coopMult * (isElite ? ELITE_HP_MULT : 1));
    const atk = Math.round(def.atk * atkMult * (isElite ? 1.5 : 1));
    const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r = Phaser.Math.FloatBetween(20, 60);
    const m = new MinionSlime(this, wx + Math.cos(a) * r, wy + Math.sin(a) * r, hp, def.spriteKey, def.tint);
    m.atk = atk;
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
    m.setPatrolCenter(wx, wy);
    m.getTargetPos = () => this.nearestTargetPos(m.x, m.y);
    m.onDead = () => this.handleMinionDrop(defId, m.x, m.y);
    m.minionId = `m${this.allMinions.length}`;
    this.allMinions.push(m);
    this.physics.add.collider(m, this.wallLayer);
    this.physics.add.overlap(m, this.player, () => {
      if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk * 3);
    });
    this.physics.add.overlap(m, this._allyGroup, (_m, allyObj) => {
      const ally = allyObj as MinionSlime;
      if (m.isDead || !m.isDashing || ally.isDead) return;
      const now = this.time.now;
      if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
      (ally as any)._lastDashHit = now;
      ally.takeDamage(m.atk * 3);
    });
    if (!NetworkService.connected || NetworkService.isHost) {
      m.onFire = (type, mx, my, tx, ty) => {
        this.spawnMinionAttack(type, mx, my, tx, ty, m.atk, m.isElite);
        if (NetworkService.connected)
          NetworkService.sendMinionAttack({ minionId: m.minionId, type, mx, my, tx, ty, atk: m.atk, isElite: m.isElite });
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
    };
    const GENERAL_POOL = ['slime_green_s', 'slime_red_s', 'slime_blue_s', 'slime_white_s'];
    if (this.questStar >= 2) GENERAL_POOL.push('plant1_s', 'plant2_s', 'plant3_s');

    const mainMinionId = BOSS_TO_MINION[this.bossMonsterId];
    const otherPool = GENERAL_POOL.filter(id => id !== mainMinionId);
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const atkMult = STAR_STAT_MULT[this.questStar] ?? 1;
    const coopMult = NetworkService.connected ? CO_OP_HP_MULT : 1;

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
      m.setPatrolCenter(isPlant ? spawnX : wx, isPlant ? spawnY : wy);
      m.getTargetPos = () => this.nearestTargetPos(m.x, m.y);
      m.onDead = () => this.handleMinionDrop(defId, m.x, m.y);
      this.allMinions.push(m);
      this.physics.add.collider(m, this.wallLayer);
      this.physics.add.overlap(m, this.player, () => {
        if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk * 3);
      });
      this.physics.add.overlap(m, this._allyGroup, (_m, allyObj) => {
        const ally = allyObj as MinionSlime;
        if (m.isDead || !m.isDashing || ally.isDead) return;
        const now = this.time.now;
        if (now - ((ally as any)._lastDashHit ?? 0) < 300) return;
        (ally as any)._lastDashHit = now;
        ally.takeDamage(m.atk * 3);
      });
      if (!NetworkService.connected || NetworkService.isHost) {
        m.onFire = (type, mx, my, tx, ty) => {
          this.spawnMinionAttack(type, mx, my, tx, ty, m.atk, m.isElite);
          if (NetworkService.connected)
            NetworkService.sendMinionAttack({ minionId: m.minionId, type, mx, my, tx, ty, atk: m.atk, isElite: m.isElite });
        };
      }
    };

    const spawnAt = (wx: number, wy: number) => {
      // 花怪群聚錨點：1~2 個，距 waypoint 中心 60~140px
      const numClusters = srng.between(1, 2);
      const plantClusters: { x: number; y: number }[] = [];
      for (let c = 0; c < numClusters; c++) {
        const ca = srng.float(0, Math.PI * 2);
        const cr = srng.float(P(60), P(140));
        plantClusters.push({ x: wx + Math.cos(ca) * cr, y: wy + Math.sin(ca) * cr });
      }

      const baseCount = srng.between(8, 15);
      const count = Math.round(baseCount * countMult);
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
      spawnAt(this.waypoints[i].x, this.waypoints[i].y);
    }

    for (let i = 1; i < this.cornerPts.length - 1; i++) {
      if (srng.float(0, 1) < 0.4) {
        const c = this.cornerPts[i];
        spawnAt(c.x, c.y);
      }
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

  private teleportToBossArena(): void {
    const destX = this.bossArenaCenter.x;
    const destY = this.bossArenaCenter.y + this.BOSS_ARENA_RADIUS * 0.72;
    const origScale = this.player.scaleX;

    this.cameras.main.fadeOut(360, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.player.setPosition(destX, destY).setVisible(false);
      this.cameras.main.fadeIn(460, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.playTeleportIn(destX, destY, origScale, () => { this.teleporting = false; });
        this.boss.setVisible(true).setAlpha(1);
        (this.boss.body as Phaser.Physics.Arcade.Body).enable = true;
        this.bossHpGfx.setVisible(true);
        this.bossHpLabel.setVisible(true);
        this.bossDebuffGfx.setVisible(true);
        this.refreshBossBar();
        this.time.delayedCall(300, () => {
          this.boss.start();
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

    // 崖壁邊緣（地板之下）
    const wallFace = this.add.graphics().setDepth(-0.5);
    wallFace.lineStyle(P(32), 0x080010, 1.0); strokeShape(wallFace);
    wallFace.lineStyle(P(16), 0x1a0030, 0.9); strokeShape(wallFace);
    wallFace.lineStyle(P(7), 0x380055, 0.7); strokeShape(wallFace);

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

  private refreshBossBar(): void {
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
    const elemTag = this.boss.element !== 'none' ? ` 【${elemName}】` : '';
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
    const fontSize = isCrit ? F(20) : F(15);
    const color = isCrit ? '#ff8800' : '#ffffff';
    const stroke = isCrit ? '#4a1800' : '#000000';

    const label = this.add.text(x + ox, y - P(24), `${dmg}`, {
      fontSize, fontStyle: 'bold',
      color, stroke, strokeThickness: isCrit ? 4 : 3,
    }).setOrigin(0.5, 1).setDepth(300);


    this.tweens.add({
      targets: label,
      y: label.y - (isCrit ? P(52) : P(38)),
      alpha: 0,
      duration: isCrit ? 900 : 700,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  private spawnEvadeText(x: number, y: number): void {
    const label = this.add.text(x, y - P(24), '閃避', {
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

  private handleBossDefeated(): void {
    this.bossActive = false;
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
        { itemId: hpId,              itemName: hpName,     rate: 0.30, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_REVIVE, itemName: '復活藥水', rate: 0.05, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_ATK,   itemName: '攻擊力藥水', rate: 0.15, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_DEF,   itemName: '防禦力藥水', rate: 0.15, qtyMin: 1, qtyMax: 1 },
        { itemId: ITEM_POTION_SPEED, itemName: '速度藥水',   rate: 0.15, qtyMin: 1, qtyMax: 1 },
      ];
      const scaledDrops = [...bossDef.drops, ...bossPotionDrops].map(d => ({ ...d, rate: Math.min(1, d.rate * dropMult) }));
      this.spawnLoot(this.boss.x, this.boss.y, scaledDrops);
      const bossCardMult = CardStore.getTotalStats().dropRateMult ?? 1;
      for (const card of bossDef.cards) {
        if (Math.random() < card.rate * bossCardMult) this.spawnCardDrop(this.boss.x, this.boss.y, card.cardId);
      }
      const bossEquipRate = 0.40 * (1 + (this.questStar - 1) * 0.25);
      if (Math.random() < Math.min(1, bossEquipRate)) {
        const ALL_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'ring2', 'sword'];
        const slot = ALL_SLOTS[Math.floor(Math.random() * ALL_SLOTS.length)];
        this.spawnEquipDrop(this.boss.x, this.boss.y, generateEquipment(slot, randomQuality(EQUIP_DROP_QUALITY)));
      }
    }

    // Exp (no gold — gold comes from quest claim)
    const expGain = Phaser.Math.Between(25, 50);
    const bossLevelsGained = PlayerStore.addExp(expGain);
    if (bossLevelsGained > 0) this.showLevelUp(PlayerStore.getLevel());
    SaveStore.save();

    // Floating victory message
    const W = this.scale.width;
    const line1 = questCompleted ? '任務完成！點擊右上角領取獎勵' : 'Boss 討伐成功！';
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

  private handlePlayerDead(): void {
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
    if (NetworkService.connected) NetworkService.sendPlayerDead();
  }

  // ── Exit button ───────────────────────────────────────

  private createExitButton(): void {
    const W = this.scale.width;
    const bw = P(72), bh = P(28), pad = P(8);
    const bx = W - pad - bw;
    const by = pad;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    const g = this.add.graphics().setScrollFactor(0).setDepth(9800);
    g.fillStyle(0x3a1010, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, P(6));
    g.lineStyle(P(2), 0xaa2222, 1);
    g.strokeRoundedRect(bx, by, bw, bh, P(6));
    this.exitBtnGfx = g;

    this.exitBtnTxt = this.add.text(cx, cy, '退出', {
      fontSize: F(15), fontStyle: 'bold', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9801);

    this.exitBtnHit = this.add.rectangle(cx, cy, bw, bh)
      .setScrollFactor(0).setDepth(9802).setInteractive({ useHandCursor: true });
    this.exitBtnHit.on('pointerdown', () => this.exitToLobby());

    // ── 戰利品按鈕（左上角）──
    const lbw = bw;
    const lbx = pad;
    const lcx = lbx + lbw / 2;
    const lg = this.add.graphics().setScrollFactor(0).setDepth(9800);
    lg.fillStyle(0x180a02, 0.95);
    lg.fillRoundedRect(lbx, by, lbw, bh, P(6));
    lg.lineStyle(P(2), 0xffcc44, 0.75);
    lg.strokeRoundedRect(lbx, by, lbw, bh, P(6));
    this.add.text(lcx, cy, '戰利品', {
      fontSize: F(15), fontStyle: 'bold', color: '#f0d090', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(9801);
    this._lootBadge = undefined;
    this.add.rectangle(lcx, cy, lbw, bh)
      .setScrollFactor(0).setDepth(9803).setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.showLootPanel());
  }

  private showLootPanel(): void {
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

    pop.add(this.add.text(px, py - PH / 2 + P(20), '戰利品', {
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
    const ROW_H = P(56), ROW_PAD = P(6);
    const listTop = py - PH / 2 + HEADER_H;
    const listH = PH - HEADER_H;
    const contentH = this._sessionLoot.length * (ROW_H + ROW_PAD);
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
      scroll.add(this.add.text(px, ROW_H, '本局尚未撿到任何戰利品', {
        fontSize: F(14), color: '#886644', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));
    }

    this._sessionLoot.forEach((entry, i) => {
      const ry = i * (ROW_H + ROW_PAD);
      const lx = px - PW / 2 + P(8);
      const rw = PW - P(16);

      const rowBg = this.add.graphics();
      rowBg.fillStyle(0x2a1800, 0.7);
      rowBg.fillRoundedRect(lx, ry, rw, ROW_H, P(5));
      rowBg.lineStyle(P(1), 0x664422, 0.4);
      rowBg.strokeRoundedRect(lx, ry, rw, ROW_H, P(5));
      scroll.add(rowBg);

      // Icon
      const iconX = lx + P(10) + P(20);
      const iconY = ry + ROW_H / 2;
      let iconKey = '';
      let nameColor = '#e8c870';
      if (entry.type === 'item') {
        iconKey = `icon_${entry.itemId}`;
      } else if (entry.type === 'card') {
        iconKey = 'icon_card';
        nameColor = '#88ccff';
      } else {
        iconKey = entry.equip.texture;
        nameColor = `#${(QUALITY_COLORS[entry.equip.quality] ?? 0xffffff).toString(16).padStart(6, '0')}`;
      }
      if (this.textures.exists(iconKey))
        scroll.add(this.add.image(iconX, iconY, iconKey).setDisplaySize(P(36), P(36)));

      // Name
      const tx = lx + P(10) + P(44);
      scroll.add(this.add.text(tx, iconY - P(9), entry.itemName, {
        fontSize: F(14), fontStyle: 'bold', color: nameColor, stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));

      // Sub-label
      let sub = '';
      if (entry.type === 'item') sub = `×${entry.qty}`;
      else if (entry.type === 'card') sub = '卡片';
      else sub = `${QUALITY_NAMES[entry.equip.quality]} ${SLOT_NAMES[entry.equip.slot]}`;
      scroll.add(this.add.text(tx, iconY + P(9), sub, {
        fontSize: F(12), color: '#997755', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));

      // Hit area — standalone scene object to avoid double-container input bug
      const hit = this.add.rectangle(lx + rw / 2, listTop + ry + ROW_H / 2, rw, ROW_H)
        .setScrollFactor(0).setDepth(D + 1)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => this.showLootDetail(entry));
      hitAreas.push(hit);
    });

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

    const det = this.add.container(0, 0).setScrollFactor(0).setDepth(D);

    det.add(this.add.rectangle(px, py, W, H, 0x000000, 0.45).setInteractive()
      .on('pointerdown', () => det.destroy()));

    // Build lines
    const lines: { text: string; color: string; size: number; bold: boolean }[] = [];

    if (entry.type === 'item') {
      lines.push({ text: entry.itemName, color: '#e8c870', size: 16, bold: true });
      lines.push({ text: `持有數量：×${entry.qty}`, color: '#aaaaaa', size: 13, bold: false });
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
      if (eq.enhancement > 0) lines.push({ text: `強化等級 +${eq.enhancement}`, color: '#88ff88', size: 13, bold: false });
      const stats = getItemStats(eq);
      for (const [k, v] of Object.entries(stats)) {
        if (v === undefined) continue;
        const label = (STAT_NAMES as Record<string, string>)[k] ?? k;
        const val   = (v > 0 ? '+' : '') + (Number.isInteger(v) ? v : (v * 100).toFixed(2) + '%');
        lines.push({ text: `${label} ${val}`, color: '#ccddbb', size: 13, bold: false });
      }
      if (eq.behavior) lines.push({ text: `行為：${(BEHAVIOR_NAMES as Record<string, string>)[eq.behavior] ?? eq.behavior}`, color: '#aabbcc', size: 12, bold: false });
    }

    const PH = P(32) + lines.length * P(24) + P(20);
    const bg = this.add.graphics();
    bg.fillStyle(0x120800, 0.98);
    bg.fillRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(8));
    bg.lineStyle(P(1.5), 0xaa7733, 0.9);
    bg.strokeRoundedRect(px - PW / 2, py - PH / 2, PW, PH, P(8));
    det.add(bg);

    lines.forEach((l, i) => {
      det.add(this.add.text(px, py - PH / 2 + P(16) + i * P(24), l.text, {
        fontSize: F(l.size), fontStyle: l.bold ? 'bold' : 'normal',
        color: l.color, stroke: '#1a0800', strokeThickness: 1,
        wordWrap: { width: PW - P(24) },
      }).setOrigin(0.5, 0));
    });
  }

  private activateRewardButton(): void {
    const W = this.scale.width;
    const bw = P(88), bh = P(28), pad = P(8);
    const bx = W - pad - bw;
    const by = pad;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    this.exitBtnGfx.clear();
    this.exitBtnGfx.fillStyle(0x3a2a00, 0.95);
    this.exitBtnGfx.fillRoundedRect(bx, by, bw, bh, P(6));
    this.exitBtnGfx.lineStyle(P(2), 0xddaa00, 1);
    this.exitBtnGfx.strokeRoundedRect(bx, by, bw, bh, P(6));

    this.exitBtnTxt.setText('領取獎勵').setColor('#ffe066').setPosition(cx, cy);
    this.exitBtnHit.setSize(bw, bh).setPosition(cx, cy);
    this.exitBtnHit.removeAllListeners('pointerdown');
    this.exitBtnHit.on('pointerdown', () => this.showRewardPanel());

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

    objs.push(this.add.text(W / 2, py + P(18), '獎勵領取', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    objs.push(this.add.text(W / 2, py + P(72), `💰 獲得 ${gold} 金幣`, {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const btnW = P(100), btnH = P(32);
    const btnX = W / 2 - btnW / 2, btnY = py + ph - P(48);
    const btnG = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x3a1010, 0.95); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, P(6));
    btnG.lineStyle(P(2), 0xaa2222, 1); btnG.strokeRoundedRect(btnX, btnY, btnW, btnH, P(6));
    objs.push(this.add.text(W / 2, btnY + btnH / 2, '✕ 退出', {
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

    objs.push(this.add.text(W / 2, py + P(18), '獎勵領取', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    objs.push(this.add.text(W / 2, py + P(72), `💰 獲得 ${gold} 金幣`, {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2));

    const btnW = P(100), btnH = P(32);
    const btnX = W / 2 - btnW / 2, btnY = py + ph - P(48);
    const btnG = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x3a1010, 0.95); btnG.fillRoundedRect(btnX, btnY, btnW, btnH, P(6));
    btnG.lineStyle(P(2), 0xaa2222, 1); btnG.strokeRoundedRect(btnX, btnY, btnW, btnH, P(6));
    objs.push(this.add.text(W / 2, btnY + btnH / 2, '✕ 退出', {
      fontSize: F(14), fontStyle: 'bold', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3));
    const btnHit = this.add.rectangle(W / 2, btnY + btnH / 2, btnW, btnH)
      .setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
    objs.push(btnHit);
    btnHit.on('pointerdown', close);
  }

  private showEquipRewardModalGuest(star: number): void {
    const weights = STAR_EQUIP_QUALITY[star] ?? {};
    const ALL_SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'ring2', 'sword'];
    const pickedSlots = [...ALL_SLOTS].sort(() => Math.random() - 0.5).slice(0, 3);
    const items: EquipmentItem[] = pickedSlots.map(s => generateEquipment(s, randomQuality(weights)));
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

    objs.push(this.add.text(W / 2, my + P(22), '選擇獎勵裝備', {
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

      const affixLines = item.affixes.map(a => {
        const isPct = ['crit', 'atkSpeed', 'lifesteal', 'evasion'].includes(a.stat);
        return `${STAT_NAMES[a.stat]} +${isPct ? (a.value * 100).toFixed(2) + '%' : a.value}`;
      });
      if (item.behavior) affixLines.push(BEHAVIOR_NAMES[item.behavior]);
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

  private _showReconnectOverlay(): void {
    if (this._reconnectOverlay) return;
    const W = this.scale.width, H = this.scale.height;
    const c = this.add.container(0, 0).setScrollFactor(0).setDepth(19999);
    c.add(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65));
    c.add(this.add.text(W / 2, H / 2 - P(16), '重新連線中…', {
      fontSize: F(18), fontStyle: 'bold', color: '#f0d090', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0.5));
    c.add(this.add.text(W / 2, H / 2 + P(14), '請稍候', {
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
    const partner = NetworkService.getPartnerState() as any;
    if (partner?.nickname && this.partnerLabel) {
      this.partnerLabel.setText(partner.nickname);
      this.partnerSprite?.setVisible(true);
      this.partnerLabel.setVisible(true);
      this.partnerHpBar?.setVisible(true);
    }
  }

  private _onReconnectFailed(): void {
    this._hideReconnectOverlay();
    // Treat as partner leaving — just show disconnected state without kicking to lobby
    this.partnerSprite?.setVisible(false);
    this.partnerLabel?.setVisible(false);
    this.partnerHpBar?.setVisible(false);
  }

  private exitToLobby(): void {
    SaveStore.save();
    const wasMulti = NetworkService.connected;
    if (wasMulti) {
      NetworkService.clearGameCallbacks();
      NetworkService.setAutoLobby();
    }
    this.scene.start('PrepScene');
  }

  // ── Loot drop system ──────────────────────────────────

  private spawnCardDrop(cx: number, cy: number, cardId: string): void {
    const ox = Phaser.Math.Between(-P(18), P(18));
    const oy = Phaser.Math.Between(-P(8), P(8));
    const tx = cx + ox;
    const ty = cy + oy + P(18);

    const cardDef = getCardDef(cardId);
    const monDef = cardDef ? getMonsterDef(cardDef.monsterId) : null;
    const isBoss = (monDef?.tier ?? 0) >= 5;
    const CW = P(16), CH = P(20);

    const cnt = this.add.container(tx, cy - P(24)).setDepth(ty + 4);

    // Card frame
    const g = this.add.graphics();
    const bColor = isBoss ? 0xf0c040 : 0x9aacb8;
    const fx = -CW / 2, fy = -CH / 2;
    g.fillStyle(0x000000, 0.4); g.fillRect(fx + P(2), fy + P(2), CW, CH);
    g.fillStyle(0x2a1a0a, 1); g.fillRect(fx, fy, CW, CH);
    g.lineStyle(P(2), bColor, 0.9); g.strokeRect(fx, fy, CW, CH);
    g.lineStyle(P(1), bColor, 0.4); g.strokeRect(fx + P(2), fy + P(2), CW - P(4), CH - P(4));
    cnt.add(g);

    // Drop + breathing animation
    this.tweens.add({
      targets: cnt, y: ty, duration: 420, ease: 'Bounce.Out',
      onComplete: () => {
        this.tweens.add({
          targets: cnt, scaleX: 1.15, scaleY: 1.15,
          duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      },
    });

    const cardName = cardDef?.name ?? '卡片';
    this.lootDrops.push({ obj: cnt, itemId: '__card__', itemName: cardName, qty: 1, cardId, readyAt: Date.now() + 600 });
  }

  private spawnLoot(cx: number, cy: number, drops: DropEntry[]): void {
    const dropMult = CardStore.getTotalStats().dropRateMult ?? 1;
    for (const drop of drops) {
      if (Math.random() >= drop.rate * dropMult) continue;
      const qty = Phaser.Math.Between(drop.qtyMin, drop.qtyMax);
      const ox = Phaser.Math.Between(-P(22), P(22));
      const oy = Phaser.Math.Between(-P(10), P(10));
      const tx = cx + ox;
      const ty = cy + oy + P(18);
      const iconKey = `icon_${drop.itemId}`;
      const img = this.add.image(tx, cy - P(24), iconKey)
        .setDisplaySize(P(28), P(28)).setDepth(ty + 4);
      this.tweens.add({
        targets: img, y: ty,
        duration: 420, ease: 'Bounce.Out',
        onComplete: () => {
          this.tweens.add({
            targets: img, y: ty - P(4),
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        },
      });
      this.lootDrops.push({ obj: img, itemId: drop.itemId, itemName: drop.itemName, qty, readyAt: Date.now() + 600 });
    }
  }

  private spawnEquipDrop(cx: number, cy: number, equip: EquipmentItem): void {
    const ox = Phaser.Math.Between(-P(22), P(22));
    const oy = Phaser.Math.Between(-P(10), P(10));
    const tx = cx + ox, ty = cy + oy + P(18);
    const imgKey = this.textures.exists(equip.texture) ? equip.texture : 'icon_equip_drop';
    const img = this.add.image(tx, cy - P(24), imgKey)
      .setDisplaySize(P(28), P(28)).setDepth(ty + 4);
    this.tweens.add({
      targets: img, y: ty, duration: 420, ease: 'Bounce.Out',
      onComplete: () => {
        this.tweens.add({ targets: img, y: ty - P(4), duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });
    const name = `${QUALITY_NAMES[equip.quality]}${SLOT_NAMES[equip.slot]}`;
    this.lootDrops.push({ obj: img, itemId: '__equip__', itemName: name, qty: 1, readyAt: Date.now() + 600, equip });
  }

  private checkLootPickup(): void {
    if (this.lootDrops.length === 0) return;
    this.lootDrops = this.lootDrops.filter(loot => {
      if (!loot.obj.active) return false;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, loot.obj.x, loot.obj.y,
      );
      if (d > P(48) || Date.now() < loot.readyAt) return true;
      if (loot.cardId) {
        CardStore.addCard(loot.cardId);
        this._sessionLoot.push({ type: 'card', cardId: loot.cardId, itemName: loot.itemName });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, 1);
      } else if (loot.equip) {
        PlayerStore.addOwned(loot.equip);
        SaveStore.save();
        this._sessionLoot.push({ type: 'equip', equip: loot.equip, itemName: loot.itemName });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, 1);
      } else {
        InventoryStore.addItem(loot.itemId, loot.itemName, loot.qty);
        const existing = this._sessionLoot.find(e => e.type === 'item' && e.itemId === loot.itemId);
        if (existing && existing.type === 'item') existing.qty += loot.qty;
        else this._sessionLoot.push({ type: 'item', itemId: loot.itemId, itemName: loot.itemName, qty: loot.qty });
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, loot.qty);
      }
      this._lootBadge?.setText(String(this._sessionLoot.length));
      loot.obj.destroy();
      return false;
    });
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

  private showLevelUp(newLevel: number): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(10000);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(W / 2 - P(120), H / 2 - P(38), P(240), P(76), P(10));
    bg.lineStyle(2, 0xf0c040, 0.9);
    bg.strokeRoundedRect(W / 2 - P(120), H / 2 - P(38), P(240), P(76), P(10));

    const line1 = this.add.text(W / 2, H / 2 - P(14), '⬆  等級提升！', {
      fontSize: F(20), fontStyle: 'bold', color: '#f0c040', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);

    const line2 = this.add.text(W / 2, H / 2 + P(16), `Lv. ${newLevel}   ATK +2   HP +15`, {
      fontSize: F(15), fontStyle: 'bold', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(10001);

    this.tweens.add({
      targets: [bg, line1, line2], alpha: 0, delay: 1800, duration: 500,
      onComplete: () => { bg.destroy(); line1.destroy(); line2.destroy(); },
    });
  }



  // ── Potion slots ──────────────────────────────────────

  private readonly POTION_RANGE = 35;

  private createPotionSlots(): void {
    const SZ = P(40), GAP = P(20), D = 100;
    const POTION_COLORS: Record<string, number> = {
      [ITEM_POTION_HEALTH_S]: 0x44ff88,
      [ITEM_POTION_HEALTH_M]: 0x44ddff,
      [ITEM_POTION_HEALTH_L]: 0xff88ff,
      [ITEM_POTION_REVIVE]:   0xffee44,
      [ITEM_POTION_ATK]:      0xff6644,
      [ITEM_POTION_DEF]:      0x44aaff,
      [ITEM_POTION_SPEED]:    0xffdd22,
    };
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
        const color = itemId ? (POTION_COLORS[itemId] ?? 0x888888) : 0x554422;
        const { bg, icon, qtyTxt } = slotObjs[idx];

        bg.clear();
        bg.fillStyle(0x1a1200, 0.85);
        bg.fillRoundedRect(bx, by, SZ, SZ, P(6));
        bg.lineStyle(P(2), color, itemId ? 0.75 : 0.35);
        bg.strokeRoundedRect(bx, by, SZ, SZ, P(6));

        if (itemId) {
          icon.setTexture(`icon_${itemId}`).setVisible(true).setAlpha(qty > 0 ? 1 : 0.3);
          qtyTxt.setText(qty > 0 ? `×${qty}` : '');
        } else {
          icon.setVisible(false);
          qtyTxt.setText('');
        }
      });
    };

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
    const sessionQty = this._sessionQty.get(itemId) ?? 0;
    if (sessionQty <= 0) return;
    this._sessionQty.set(itemId, sessionQty - 1);  // 先遞減，才不會讓 onChange→redraw 讀到舊值
    if (!InventoryStore.spendItem(itemId, 1)) {
      this._sessionQty.set(itemId, sessionQty);    // 萬一 spend 失敗就還原
      return;
    }

    const range = P(this.POTION_RANGE);
    const sealType = itemId === ITEM_POTION_REVIVE ? 'revive' : 'heal';
    this.showMagicSeal(this.player.x, this.player.y + P(13), range, rangeColor, sealType);

    const healAmt = itemId === ITEM_POTION_HEALTH_L ? 150 : itemId === ITEM_POTION_HEALTH_M ? 80 : 40;
    if (itemId === ITEM_POTION_HEALTH_S || itemId === ITEM_POTION_HEALTH_M || itemId === ITEM_POTION_HEALTH_L) {
      this.player.heal(healAmt);
      if (NetworkService.connected && this.partnerSprite?.active && !this.partnerIsDead) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.partnerSprite.x, this.partnerSprite.y);
        if (d <= range) NetworkService.sendPotionEffect('heal', healAmt);
      }
    } else if (itemId === ITEM_POTION_REVIVE) {
      if (this.gameOver) {
        this.gameOver = false;
        this.player.revive(0.30);
        this.player.play(`player_idle_${this.player.lastDir}`);
      } else if (NetworkService.connected && this.partnerIsDead && this.partnerSprite) {
        const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.partnerSprite.x, this.partnerSprite.y);
        if (d <= range) {
          NetworkService.sendPotionEffect('revive', 30);
          this.partnerIsDead = false;
          this.partnerSprite.play(`partner_idle_${this._partnerPrevDir}`, true);
        }
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
    }

    SaveStore.save();
  }

  private refreshBuffHud(): void {
    this._buffHudTexts.forEach(t => t.destroy());
    this._buffHudTexts = [];

    const W = this.scale.width;
    const bw = P(88), bh = P(28), pad = P(8);
    const startY = pad + bh + P(6);
    const lineH  = P(18);

    const BUFF_LABELS: Record<string, string> = {
      [ITEM_POTION_ATK]:   'ATK+20%',
      [ITEM_POTION_DEF]:   'DEF+20',
      [ITEM_POTION_SPEED]: 'SPD+20',
    };
    const BUFF_COLORS: Record<string, string> = {
      [ITEM_POTION_ATK]:   '#ff8866',
      [ITEM_POTION_DEF]:   '#66aaff',
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

  private addHUD(): void {
    this.addAttackButton();
    this.addLevelHUD();
    this.createPotionSlots();
  }

  private addLevelHUD(): void {
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

  private addAttackButton(): void {
    if ((PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'aura') return;
    const isFlower = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0;
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
      const flowerNow = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0;

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
      // 記錄拖動起始點（用按下位置）
      this._atkDragPointerId = ptr.id;
      this._atkDragStartX = ptr.x;
      this._atkDragStartY = ptr.y;
    };

    const onMove = (ptr: Phaser.Input.Pointer) => {
      if (ptr.id !== this._atkDragPointerId) return;
      const dx = ptr.x - this._atkDragStartX;
      const dy = ptr.y - this._atkDragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const { x: cx, y: cy } = getBtnCenter();

      if (dist >= this._atkDragThreshold) {
        this._atkDragAngle = Math.atan2(dy, dx);
        if (!this._atkDirGfx) {
          this._atkDirGfx = this.add.graphics().setScrollFactor(0).setDepth(102);
        }
      } else {
        this._atkDragAngle = null;
        this._atkDirGfx?.clear();
      }
    };

    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (!activeIds.has(ptr.id)) return;
      activeIds.delete(ptr.id);

      // 清除方向箭頭
      this._atkDirGfx?.clear();
      this._atkDragAngle = null;
      this._atkDragPointerId = -1;

      if (activeIds.size === 0) drawBtn(false);
      if (this.gameOver) return;

      const dx = ptr.x - this._atkDragStartX;
      const dy = ptr.y - this._atkDragStartY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const isDash = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'dashPierce';
      const isFlowerModeBtn = (CardStore.getTotalStats().flowerSummonMode ?? 0) > 0;

      if (isFlowerModeBtn) {
        // flowerSummonMode 覆蓋所有攻擊模式
        this._forceAttackAngle = dist >= this._atkDragThreshold ? Math.atan2(dy, dx) : null;
        this.tryFlowerSummonModeAttack();
      } else if (isDash) {
        if (dist >= this._atkDragThreshold) this._forceAttackAngle = Math.atan2(dy, dx);
        this.attackDashPierce(0, 0);
      } else if (dist >= this._atkDragThreshold) {
        // 手動方向攻擊：設定強制角度，meleeAttack 內的 resolveAttackDir 會優先使用
        this._forceAttackAngle = Math.atan2(dy, dx);
        this.meleeAttack(this.player.x, this.player.y);
      } else {
        // 自動鎖定
        const { x: tx, y: ty } = this.getAttackTarget();
        this.meleeAttack(tx, ty);
      }
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

    const afterPts = buildCrescent(R * 1.06, R2 * 0.92);
    const afterG = this.add.graphics().setDepth(D + 1).setAlpha(0);
    afterG.fillStyle(0x3366cc, 0.30); afterG.fillPoints(afterPts, true);
    afterG.lineStyle(1.5, 0x88bbff, 0.50);
    afterG.beginPath();
    for (let i = 0; i <= 28; i++) {
      const a = sa + (ea - sa) * (i / 28);
      const x = px + Math.cos(a) * R * 1.06, y = py + Math.sin(a) * R * 1.06;
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

  private drawPartnerHpBar(): void {
    if (!this.partnerHpBar || !this.partnerSprite) return;
    const bx = this.partnerSprite.x;
    const by = this.partnerSprite.y - P(35);
    const W = P(44), H = P(5);
    const pct = this._partnerMaxHp > 0 ? Math.max(0, Math.min(1, this._partnerHp / this._partnerMaxHp)) : 1;
    const fillColor = pct > 0.5 ? 0x44ff88 : pct > 0.25 ? 0xffee44 : 0xff4444;
    this.partnerHpBar.clear();
    this.partnerHpBar.fillStyle(0x000000, 0.65);
    this.partnerHpBar.fillRect(bx - W / 2 - 1, by - 1, W + 2, H + 2);
    this.partnerHpBar.fillStyle(0x222222, 0.9);
    this.partnerHpBar.fillRect(bx - W / 2, by, W, H);
    if (pct > 0) {
      this.partnerHpBar.fillStyle(fillColor, 1);
      this.partnerHpBar.fillRect(bx - W / 2 + 1, by + 1, (W - 2) * pct, H - 2);
    }
  }

  // ── Partner attack VFX ───────────────────────────────────────
  private showPartnerAttackFX(behavior: string, x: number, y: number, dir: string): void {
    const D = 20;
    const dirRad = ({ down: Math.PI / 2, up: -Math.PI / 2, left: Math.PI, right: 0 } as Record<string, number>)[dir] ?? 0;
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

  private createPlayerAnims(): void {
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

  private createPartnerAnims(): void {
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

  private createSlimeAnims(): void {
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
  }



  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private spawnMinionAttack(type: 'shoot' | 'triple' | 'explode' | 'spike', mx: number, my: number, tx: number, ty: number, atk: number, isElite = false): void {
    const wx = mx * DPR, wy = my * DPR, wtx = tx * DPR, wty = ty * DPR;
    if (type === 'shoot') {
      this.fireProjectile(wx, wy, wtx, wty, isElite ? 'proj_fast_elite' : 'proj_fast', Math.round(atk * 4.0), Math.round(150 * DPR));
    } else if (type === 'triple') {
      const baseAngle = Phaser.Math.Angle.Between(wx, wy, wtx, wty);
      const batchId = this.time.now + Math.random();
      for (const offset of [-0.28, 0, 0.28]) {
        const a = baseAngle + offset;
        const etx = wx + Math.cos(a) * P(600);
        const ety = wy + Math.sin(a) * P(600);
        this.fireProjectile(wx, wy, etx, ety, isElite ? 'proj_slow_elite' : 'proj_slow', Math.round(atk * 2.55), Math.round(90 * DPR), batchId);
      }
      // 清理超過 2 秒的舊 batch 記錄
      const cutoff = this.time.now - 2000;
      this.hitBatches.forEach((ts, id) => { if (ts < cutoff) this.hitBatches.delete(id); });
    } else if (type === 'spike') {
      this.spikeAt(tx * DPR, ty * DPR, atk, isElite);
    } else {
      this.explodeAt(wx, wy, atk, isElite ? 1.4 : 1.0);
    }
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
        const isElite = Math.random() < 0.10;
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

  private spawnMinionAtForBoss(defId: string, wx: number, wy: number, isElite = false): MinionSlime | null {
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

  private fireProjectile(fromX: number, fromY: number, toX: number, toY: number, texKey: string, dmg: number, speed: number, batchId?: number): void {
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

  private explodeAt(wx: number, wy: number, atk: number, radiusMult = 1.0): void {
    const R = Math.round(MinionSlime.EXPLODE_RADIUS * radiusMult);
    const dmg = Math.round(atk * 4.0);

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

  private spikeAt(tx: number, ty: number, atk: number, isElite = false, sizeMult = 1): void {
    const R = Math.round(MinionSlime.SPIKE_RADIUS * (isElite ? 1.4 : 1.0) * sizeMult);
    const dmg = Math.round(atk * 3.5);
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateTextures(): void {
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