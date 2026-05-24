import Phaser from 'phaser';
import { Element } from '../data/equipment-data';
import { MONSTER_SCALE_BOSS } from '../data/monster-data';
import { STAR_BOSS_DMG_MULT } from '../data/quest-store';
import type { MsgBossSync } from '../../../../shared/types';
import { CardStore } from '../data/card-store';
import { AudioService } from '../data/audio.service';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;
const mf  = (ms: number) => MOB ? Math.round(ms * 2.0) : ms;

export enum BossState {
  IDLE        = 'IDLE',
  AOE_WARN    = 'AOE_WARN',
  AOE_EXPLODE = 'AOE_EXPLODE',
  DASH_WARN   = 'DASH_WARN',
  DASHING     = 'DASHING',
  SUMMON_WARN = 'SUMMON_WARN',
  POISON_WARN = 'POISON_WARN',
  JUMP_WARN      = 'JUMP_WARN',
  FIRE_WARN      = 'FIRE_WARN',
  ICE_SPIKE_WARN   = 'ICE_SPIKE_WARN',
  ICE_MINE_WARN    = 'ICE_MINE_WARN',
  HOLY_CROSS_WARN  = 'HOLY_CROSS_WARN',
  HOLY_ORBS_WARN   = 'HOLY_ORBS_WARN',
  ZOMBIE_SUMMON_WARN = 'ZOMBIE_SUMMON_WARN',
  POISON_FAN_WARN    = 'POISON_FAN_WARN',
  LAVA_BARRAGE_WARN  = 'LAVA_BARRAGE_WARN',
  LAVA_PILLAR_WARN   = 'LAVA_PILLAR_WARN',
  BARRAGE_WARN       = 'BARRAGE_WARN',
  PETAL_STORM_WARN   = 'PETAL_STORM_WARN',
  TRACKING_WARN      = 'TRACKING_WARN',
  FAN_WARN           = 'FAN_WARN',
  SPIRAL_WARN        = 'SPIRAL_WARN',
  BLOSSOM_WARN = 'BLOSSOM_WARN',
  MIST_WARN    = 'MIST_WARN',
  VINE_WARN    = 'VINE_WARN',
  BURST_WARN   = 'BURST_WARN',
  BURROW       = 'BURROW',
  SEED_WARN      = 'SEED_WARN',
  SLOW_ZONE_WARN = 'SLOW_ZONE_WARN',
  ROOT_WARN      = 'ROOT_WARN',
  CROWN_WARN     = 'CROWN_WARN',
  ORC_WHIRL_WARN  = 'ORC_WHIRL_WARN',
  ORC_WHIRLING    = 'ORC_WHIRLING',
  ORC_SUMMON_WARN = 'ORC_SUMMON_WARN',
  ORC_FAN_WARN    = 'ORC_FAN_WARN',
  ORC_BOULDER_WARN = 'ORC_BOULDER_WARN',
  ORC_ROAR_WARN   = 'ORC_ROAR_WARN',
  ORC2_JUMP_WARN    = 'ORC2_JUMP_WARN',
  ORC2_JUMPING      = 'ORC2_JUMPING',
  ORC2_FISSURE_WARN = 'ORC2_FISSURE_WARN',
  ORC2_FRACTURE_WARN = 'ORC2_FRACTURE_WARN',
  ORC2_ROLL_WARN      = 'ORC2_ROLL_WARN',
  ORC2_FRACTURE_ACTIVE = 'ORC2_FRACTURE_ACTIVE',
  ORC3_SLASH_WARN  = 'ORC3_SLASH_WARN',
  ORC3_SLASHING    = 'ORC3_SLASHING',
  ORC3_STORM_WARN  = 'ORC3_STORM_WARN',
  ORC3_STORMING    = 'ORC3_STORMING',
  ORC3_BUSHIDO_WARN  = 'ORC3_BUSHIDO_WARN',
  ORC3_BUSHIDO_GUARD = 'ORC3_BUSHIDO_GUARD',
  ORC3_BUSHIDO_BURST = 'ORC3_BUSHIDO_BURST',
  ORC3_BURIAL_WARN   = 'ORC3_BURIAL_WARN',
  ORC3_IRON_WARN     = 'ORC3_IRON_WARN',
  ORC3_VANISH        = 'ORC3_VANISH',
  V1_BAT_STORM_WARN      = 'V1_BAT_STORM_WARN',
  V1_CRIMSON_RAIN_WARN   = 'V1_CRIMSON_RAIN_WARN',
  V1_GAZE_WARN           = 'V1_GAZE_WARN',
  V1_DARK_NIGHT_WARN     = 'V1_DARK_NIGHT_WARN',
  V1_DARK_NIGHT_ACTIVE   = 'V1_DARK_NIGHT_ACTIVE',
  V1_NEEDLE_BARRAGE_WARN = 'V1_NEEDLE_BARRAGE_WARN',
  V2_METEOR_RAIN_WARN    = 'V2_METEOR_RAIN_WARN',
  V2_COMET_WARN          = 'V2_COMET_WARN',
  V2_EL_COLLAPSE_WARN    = 'V2_EL_COLLAPSE_WARN',
  V3_LIGHTNING_CHAIN     = 'V3_LIGHTNING_CHAIN',
  V3_ICE_DOMAIN          = 'V3_ICE_DOMAIN',
  V3_TORNADO_STORM       = 'V3_TORNADO_STORM',
  VK_SCYTHE_WARN  = 'VK_SCYTHE_WARN',
  VK_BURST_WARN   = 'VK_BURST_WARN',
  VK_SPIKE_WARN   = 'VK_SPIKE_WARN',
  VK_SPLIT_WARN   = 'VK_SPLIT_WARN',
  VK_SPLIT_ACTIVE = 'VK_SPLIT_ACTIVE',
  VK_RIVER_WARN   = 'VK_RIVER_WARN',
  DEAD             = 'DEAD',
}

export class Boss extends Phaser.Physics.Arcade.Sprite {
  private hp: number;
  private readonly maxHp: number;
  // Renamed from 'state' — Phaser.GameObject already has a public 'state' property
  private bossState = BossState.IDLE;
  private started   = false;
  protected bossDir: 'down' | 'left' | 'right' | 'up' = 'down';
  protected stateTimer?: Phaser.Time.TimerEvent;
  private aoeTrackTimer?: Phaser.Time.TimerEvent;
  protected pulseTween?: Phaser.Tweens.Tween;
  private dashTrailTimer?: Phaser.Time.TimerEvent;
  private dashTrailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private activeTrails: Array<{
    gfx: Phaser.GameObjects.Graphics;
    x1: number; y1: number; x2: number; y2: number;
    tickTimer: Phaser.Time.TimerEvent;
    expireTimer: Phaser.Time.TimerEvent;
    drips?: Phaser.GameObjects.Particles.ParticleEmitter;
  }> = [];
  protected warnParticles?: Phaser.GameObjects.Particles.ParticleEmitter;
  protected readonly warningGfx: Phaser.GameObjects.Graphics;

  protected atkX = 0;
  protected atkY = 0;
  private dashAngle = 0;

  static readonly AOE_RADIUS = Math.round(120 * DPR);
  static readonly DASH_SPEED = Math.round(460 * DPR);
  static readonly DASH_MS    = 620;

  static readonly BARRAGE_THRESHOLD = Math.round(180 * DPR);
  private static readonly BARRAGE_COUNT      = 3;
  private static readonly BARRAGE_CHARGE_MS  = 150;
  private static readonly BARRAGE_SPEED_PX   = Math.round(700 * DPR);
  private static readonly BARRAGE_SPREAD     = 0.22;   // radians between shots
  private static readonly BARRAGE_TRAIL_W    = Math.round(28 * DPR);
  private static readonly BARRAGE_TRAIL_HIT_R = Math.round(28 * DPR);
  private static readonly BARRAGE_TRAIL_DMG  = 25;
  private static readonly BARRAGE_TRAIL_TICK = 600;
  private static readonly BARRAGE_TRAIL_DUR  = 3500;
  private static readonly MAX_TRAILS         = 99;

  protected idleChaseSpeed = Math.round(80 * DPR);
  protected walkAnimSuffix = 'walk';
  protected readonly animPrefix: string;
  protected baseTint = 0xffffff;
  private _flashUntil = 0;

  flashWhite(ms = 80): void {
    this._flashUntil = this.scene.time.now + ms;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => {
      if (this.scene.time.now >= this._flashUntil && this.bossState !== BossState.DEAD) {
        if (this.baseTint === 0xffffff) this.clearTint(); else this.setTint(this.baseTint);
      }
    });
    AudioService.playSfx(this.scene, 'sfx_hit', 0.45, 40);
  }

  readonly element: Element;
  readonly arenaCenter: Phaser.Math.Vector2;
  arenaRadius = 400;
  arenaShape  = 0;   // 0=圓, 1=八角, 2=菱形, 3=圓角矩形

  getTargetPos:   () => [number, number] = () => [0, 0];
  hasValidTarget?: () => boolean;

  burnStacks    = 0;
  burnExpiresAt = 0;
  stunUntil     = 0;
  def           = 0;

  applyBurn(gameTime: number, maxStacks = 15, duration = 4000): void {
    if (this.burnStacks < maxStacks) this.burnStacks++;
    this.burnExpiresAt = gameTime + duration;
  }

  applyStun(duration = 2000): void {
    if (this.bossState === BossState.DEAD) return;
    this.stunUntil = Math.max(this.stunUntil, this.scene.time.now + duration);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.clearWarning();
    this.setBossState(BossState.IDLE);
    this.scene.time.delayedCall(duration, () => {
      if (this.active && this.bossState !== BossState.DEAD) this.enterIdle();
    });
  }

  // ── 連線同步 ─────────────────────────────────────────────
  guestMode = false;
  private bossLerpX = 0;
  private bossLerpY = 0;
  protected guestAtkX = 0;
  protected guestAtkY = 0;
  protected guestAngle = 0;
  protected guestPts: { x: number; y: number }[] = [];
  onSyncState?: (data: MsgBossSync) => void;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;
  onAoeExplode?: (x: number, y: number) => void;
  onRangedBarrageTrailTick?: (x1: number, y1: number, x2: number, y2: number, radius: number, dmg: number) => void;
  onBarrageOrbHit?: (x: number, y: number, dmg: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp = 500, element: Element = 'none', spriteKey = 'slime', tint = 0xffffff) {
    super(scene, x, y, `${spriteKey}_idle`, 0);
    this.animPrefix  = spriteKey;
    this.baseTint    = tint;
    this.hp          = totalHp;
    this.maxHp       = totalHp;
    this.element     = element;
    this.arenaCenter = new Phaser.Math.Vector2(x, y);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.setDepth(12);
    this.setScale(MONSTER_SCALE_BOSS);
    this.setVisible(false);
    // Body in unscaled coords — slime occupies lower-center of 64×64 frame
    body.setSize(19, 12).setOffset(23, 29);
    this.warningGfx = scene.add.graphics().setDepth(8);
  }

  start(): void {
    this.started = true;
    this.setVisible(true);
    if (!this.guestMode) this.enterIdle();
  }

  protected idleStopRange = 72;

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.started || this.bossState === BossState.DEAD) return;

    // Guest mode: lerp boss toward server position, skip local AI
    if (this.guestMode) {
      const lx = this.x + (this.bossLerpX - this.x) * 0.15;
      const ly = this.y + (this.bossLerpY - this.y) * 0.15;
      this.setPosition(lx, ly);
      (this.body as Phaser.Physics.Arcade.Body).reset(lx, ly);
      return;
    }

    if (time < this.stunUntil) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }

    // 沒有任何有效目標（玩家全滅）→ 原地停止
    if (this.hasValidTarget && !this.hasValidTarget()) {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      return;
    }

    if (this.bossState !== BossState.IDLE) return;
    const [tx, ty] = this.getTargetPos();
    const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const prevDir = this.bossDir;
    this.updateDirToTarget();

    if (dist <= this.idleStopRange) {
      body.setVelocity(0, 0);
      if (this.bossDir !== prevDir) this.playDir(`${this.animPrefix}_idle`);
    } else {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
      (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
        Phaser.Math.RadToDeg(angle), this.idleChaseSpeed, body.velocity,
      );
      if (this.bossDir !== prevDir) this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);
    }
  }

  knockback(fromX: number, fromY: number, power = 110): void {
    if (this.bossState !== BossState.IDLE) return;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const body  = this.body as Phaser.Physics.Arcade.Body;
    this.scene.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), power, body.velocity);
    this.scene.time.delayedCall(220, () => {
      if (this.bossState !== BossState.DASHING) body.setVelocity(0, 0);
    });
  }

  takeDamage(amount: number, penetration = 0): void {
    if (this.bossState === BossState.DEAD) return;
    const reduction = this.def / (this.def + 80 + penetration);
    this.hp = Math.max(0, this.hp - Math.max(1, Math.round(amount * (1 - reduction))));
    this.onHpChanged?.(this.hp, this.maxHp);

    this.flashWhite();
    if (this.bossState !== BossState.ORC_WHIRLING) {
      this.playDir(`${this.animPrefix}_hurt`);
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (this.bossState !== BossState.DEAD) this.resumeStateAnim();
      });
    }

    if (this.hp <= 0) {
      this.die();
    } else if ((CardStore.getTotalStats().executeBelow15 ?? 0) > 0 && this.hp / this.maxHp < 0.12) {
      this.hp = 0;
      this.die();
    }
  }

  private resumeStateAnim(): void {
    switch (this.bossState) {
      case BossState.IDLE:      this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);   break;
      case BossState.AOE_WARN:  this.playDir(`${this.animPrefix}_attack`); break;
      case BossState.DASH_WARN: this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);   break;
      case BossState.DASHING:      this.playDir(`${this.animPrefix}_run`);   break;
      case BossState.ORC_WHIRLING: this.anims.play(`${this.animPrefix}_whirl`, true); break;
      default: break;
    }
  }

  applyServerState(data: MsgBossSync): void {
    if (data.state === 'POS') {
      this.bossLerpX = data.x * DPR;
      this.bossLerpY = data.y * DPR;
      return;
    }
    // Snap to host position at attack start
    this.bossLerpX = data.x * DPR;
    this.bossLerpY = data.y * DPR;
    this.setPosition(data.x * DPR, data.y * DPR);
    (this.body as Phaser.Physics.Arcade.Body).reset(data.x * DPR, data.y * DPR);

    if (data.atkX !== undefined) this.guestAtkX = data.atkX * DPR;
    if (data.atkY !== undefined) this.guestAtkY = data.atkY * DPR;
    if (data.angle !== undefined) this.guestAngle = data.angle;
    if (data.pts) this.guestPts = data.pts.map(p => ({ x: p.x * DPR, y: p.y * DPR }));

    switch (data.state) {
      case BossState.AOE_WARN:    this.enterAoeWarn(); break;
      case BossState.DASH_WARN:   this.enterDashWarn(); break;
      case BossState.BARRAGE_WARN: this.enterBarrageWarn(); break;
      default: this.applyUniqueState(data.state); break;
    }
  }

  protected applyUniqueState(_state: string): void {}

  applyServerHp(hp: number, isDead: boolean): void {
    if (this.bossState === BossState.DEAD) return;
    this.hp = hp;
    this.onHpChanged?.(this.hp, this.maxHp);
    this.flashWhite();
    if (isDead) this.die();
  }

  get currentState(): BossState { return this.bossState; }
  get currentHp(): number { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }
  get dmgDisplayMult(): number { return 1; }

  protected setBossState(
    state: BossState | string,
    sync?: Partial<Omit<MsgBossSync, 'state' | 'x' | 'y'>>,
  ): void {
    this.bossState = state as BossState;
    if (sync !== undefined && !this.guestMode) {
      this.onSyncState?.({ state, x: this.x / DPR, y: this.y / DPR, ...sync });
    }
  }

  protected updateDirToTarget(): void {
    const [tx, ty] = this.getTargetPos();
    const dx = tx - this.x, dy = ty - this.y;
    this.bossDir = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up'   : 'down');
  }

  private updateDirFromAngle(angle: number): void {
    const deg = Phaser.Math.RadToDeg(angle);
    if (deg > -45 && deg <= 45)        this.bossDir = 'right';
    else if (deg > 45 && deg <= 135)   this.bossDir = 'down';
    else if (deg > 135 || deg <= -135) this.bossDir = 'left';
    else                               this.bossDir = 'up';
  }

  protected playDir(base: string): void {
    const key = `${base}_${this.bossDir}`;
    this.play(this.scene.anims.exists(key) ? key : `${base}_down`, true);
  }

  // ── 狀態機 ───────────────────────────────────────────────

  protected enterIdle(): void {
    this.bossState = BossState.IDLE;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.clearWarning();
    this.stopDashTrail();
    if (this.baseTint === 0xffffff) this.clearTint(); else this.setTint(this.baseTint);
    this.setScale(MONSTER_SCALE_BOSS);
    this.stateTimer?.destroy();
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);
    if (!this._entryDelayDone) {
      this._entryDelayDone = true;
      this.stateTimer = this.scene.time.delayedCall(2000, () => {
        if (this.active && this.bossState !== BossState.DEAD) this.pickNextAttack();
      });
    } else {
      this.pickNextAttack();
    }
  }

  // 依距離回傳彈幕機率（子類別在 pickNextAttack 開頭呼叫）
  protected barrageChance(): number {
    const [px, py] = this.getTargetPos();
    const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py);
    return dist > Boss.BARRAGE_THRESHOLD ? 0.50 : 0;
  }

  questStar = 1;

  scaleDmg(base: number): number {
    return Math.round(base * (STAR_BOSS_DMG_MULT[this.questStar] ?? 1));
  }

  private comboCount = 0;
  private _entryDelayDone = false;

  private static readonly ATTACK_DELAY_CFG: Record<number, { min: number; max: number; cMin: number; cMax: number; cChance: number }> = {
    1: { min: 1200, max: 2800, cMin: 200, cMax: 450, cChance: 0.12 },
    2: { min: 1150, max: 2700, cMin: 195, cMax: 435, cChance: 0.13 },
    3: { min: 1100, max: 2600, cMin: 190, cMax: 420, cChance: 0.14 },
    4: { min: 1060, max: 2500, cMin: 185, cMax: 410, cChance: 0.15 },
    5: { min: 1020, max: 2400, cMin: 175, cMax: 385, cChance: 0.16 },
    6: { min:  900, max: 2200, cMin: 150, cMax: 370, cChance: 0.18 },
  };

  protected getNextAttackDelay(): number {
    const c = Boss.ATTACK_DELAY_CFG[Math.min(6, Math.max(1, this.questStar))];
    if (this.comboCount < 1 && Math.random() < c.cChance) {
      this.comboCount++;
      return Phaser.Math.Between(c.cMin, c.cMax);
    }
    this.comboCount = 0;
    return Phaser.Math.Between(c.min, c.max);
  }

  protected pickNextAttack(): void {
    if (this.guestMode) return;
    if (this.hasValidTarget && !this.hasValidTarget()) {
      this.stateTimer = this.scene.time.delayedCall(300, () => {
        if (this.active && this.bossState !== BossState.DEAD) this.pickNextAttack();
      });
      return;
    }
    const bc = this.barrageChance();
    if (bc > 0 && Math.random() < bc) {
      this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), () => this.enterBarrageWarn());
      return;
    }
    const next = Math.random() < 0.5 ? () => this.enterAoeWarn() : () => this.enterDashWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), next);
  }

  protected enterAoeWarn(): void {
    if (this.hasValidTarget && !this.hasValidTarget()) { this.enterIdle(); return; }
    this.setBossState(BossState.AOE_WARN, {});
    this.stateTimer?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.atkX = this.x;
    this.atkY = this.y;
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);
    this.drawAoeWarning();

    // Embers rising from the boss's feet during warning
    this.warnParticles = this.scene.add.particles(this.atkX, this.atkY, 'pxl2', {
      speed: { min: 20, max: 65 },
      angle: { min: 255, max: 285 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff6600, 0xff8800, 0xffaa00, 0xffdd44],
      lifespan: { min: 500, max: 1100 },
      frequency: mf(40),
      quantity: mq(2),
      gravityY: -25,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, Boss.AOE_RADIUS * 0.78),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(9);

    // Track boss position so warning circle sticks to it
    this.aoeTrackTimer = this.scene.time.addEvent({
      delay: 16,
      repeat: -1,
      callback: () => {
        this.atkX = this.x;
        this.atkY = this.y;
        this.warningGfx.setPosition(this.atkX, this.atkY);
        if (this.warnParticles) {
          this.warnParticles.x = this.atkX;
          this.warnParticles.y = this.atkY;
        }
      },
    });

    this.stateTimer = this.scene.time.delayedCall(1150, () => this.enterAoeExplode());
  }

  private enterAoeExplode(): void {
    this.bossState = BossState.AOE_EXPLODE;
    this.clearWarning();
    this.spawnAoeExplosion(this.atkX, this.atkY);
    this.onAoeExplode?.(this.atkX, this.atkY);
    this.stateTimer = this.scene.time.delayedCall(500, () => this.enterIdle());
  }

  protected enterDashWarn(): void {
    if (this.hasValidTarget && !this.hasValidTarget()) { this.enterIdle(); return; }
    this.stateTimer?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (this.guestMode) {
      this.atkX = this.guestAtkX;
      this.atkY = this.guestAtkY;
    } else {
      [this.atkX, this.atkY] = this.getTargetPos();
    }
    this.setBossState(BossState.DASH_WARN, { atkX: this.atkX / DPR, atkY: this.atkY / DPR });
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);
    this.drawDashWarning();

    // Directional sparks pointing at dash target
    const warnDeg = Phaser.Math.RadToDeg(
      Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY),
    );
    this.warnParticles = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 70, max: 200 },
      angle: { min: warnDeg - 22, max: warnDeg + 22 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff4400, 0xff8800, 0xffcc00],
      lifespan: { min: 180, max: 420 },
      frequency: mf(45),
      quantity: mq(3),
    }).setDepth(9);

    this.stateTimer = this.scene.time.delayedCall(600, () => this.enterDashing());
  }

  // 短預警衝刺，供子類（獸人王等）使用：warnMs 預設 260ms 幾乎沒有反應時間
  protected enterQuickDashWarn(warnMs = 260): void {
    this.stateTimer?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    if (this.guestMode) {
      this.atkX = this.guestAtkX;
      this.atkY = this.guestAtkY;
    } else {
      [this.atkX, this.atkY] = this.getTargetPos();
    }
    this.setBossState(BossState.DASH_WARN, { atkX: this.atkX / DPR, atkY: this.atkY / DPR });
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_${this.walkAnimSuffix}`);

    const warnDeg = Phaser.Math.RadToDeg(Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY));
    this.warnParticles = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 120, max: 300 },
      angle: { min: warnDeg - 20, max: warnDeg + 20 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff1100, 0xff5500, 0xffaa00],
      lifespan: { min: 80, max: 220 },
      frequency: mf(18),
      quantity: mq(5),
    }).setDepth(9);

    // 長條警告：從 Boss 向目標方向延伸，寬度從窄到寬，表示衝刺路徑
    const dashLen = Math.round(Boss.DASH_SPEED * (Boss.DASH_MS / 1000));
    const dashAng = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const barG = this.scene.add.graphics().setDepth(8);
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: { prog: 0, a: 0.85 }, prog: 1, a: 0.2, duration: warnMs, ease: 'Quad.In',
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const { prog, a } = tw.targets[0] as { prog: number; a: number };
        const len  = dashLen * prog;
        const half = P(10) + P(16) * prog; // 寬度漸寬
        const cos  = Math.cos(dashAng), sin = Math.sin(dashAng);
        const perp = dashAng + Math.PI / 2;
        const pc   = Math.cos(perp), ps = Math.sin(perp);
        // 以 Boss 為起點，往目標方向畫填充四邊形
        const x0 = this.x + pc * half,  y0 = this.y + ps * half;
        const x1 = this.x - pc * half,  y1 = this.y - ps * half;
        const x2 = x1 + cos * len,       y2 = y1 + sin * len;
        const x3 = x0 + cos * len,       y3 = y0 + sin * len;
        barG.clear();
        barG.fillStyle(0xff2200, a * 0.22);
        barG.fillPoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], true);
        barG.lineStyle(P(2), 0xff4400, a);
        barG.strokePoints([{ x: x0, y: y0 }, { x: x1, y: y1 }, { x: x2, y: y2 }, { x: x3, y: y3 }], true);
      },
      onComplete: () => barG.destroy(),
    });

    this.stateTimer = this.scene.time.delayedCall(warnMs, () => {
      this.pulseTween?.stop();
      barG.destroy();
      this.clearWarning();
      this.enterDashing();
    });
  }

  protected enterDashing(): void {
    this.bossState = BossState.DASHING;
    this.clearWarning();
    this.stateTimer?.destroy();
    this.setScale(MONSTER_SCALE_BOSS);
    this.play(`${this.animPrefix}_${this.walkAnimSuffix}_down`, true);
    this.anims.timeScale = 2.2;
    this.setTint(0xff8800);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    this.dashAngle = angle;
    this.updateDirFromAngle(angle);
    this.playDir(`${this.animPrefix}_run`);

    // 計算並夾住終點，依競技場形狀限制
    const dist = Boss.DASH_SPEED * (Boss.DASH_MS / 1000);
    const rawX = this.x + Math.cos(angle) * dist;
    const rawY = this.y + Math.sin(angle) * dist;
    const [endX, endY] = this.clampToArena(rawX, rawY, 0);

    this.startDashTrail();

    this.scene.tweens.add({
      targets: this, x: endX, y: endY,
      duration: Boss.DASH_MS, ease: 'Quad.Out',
      onUpdate: () => (this.body as Phaser.Physics.Arcade.Body).reset(this.x, this.y),
      onComplete: () => {
        (this.body as Phaser.Physics.Arcade.Body).reset(endX, endY);
        this.anims.timeScale = 1;
        this.stopDashTrail();
        this.spawnDashImpact(this.x, this.y);
        this.enterIdle();
      },
    });
    // Safety: if tween onComplete never fires (e.g. zero-distance dash at arena edge), force back to idle
    this.scene.time.delayedCall(Boss.DASH_MS + 400, () => {
      if (this.active && this.bossState === BossState.DASHING) {
        this.anims.timeScale = 1;
        this.stopDashTrail();
        this.enterIdle();
      }
    });
  }

  // 將座標夾在當前競技場形狀內（pad = 距邊界的安全距離）
  protected clampToArena(px: number, py: number, pad: number): [number, number] {
    const cx = this.arenaCenter.x, cy = this.arenaCenter.y;
    const R  = this.arenaRadius;

    const isInside = (x: number, y: number): boolean => {
      const dx = x - cx, dy = y - cy;
      switch (this.arenaShape) {
        case 1: { const hs = R * 0.875 - pad; return Math.abs(dx) <= hs && Math.abs(dy) <= hs && Math.abs(dx) + Math.abs(dy) <= hs * 1.5; }
        case 2: return Math.abs(dx) + Math.abs(dy) <= R - pad;
        case 3: { const hw = P(380) - pad, hh = P(300) - pad, cr = P(100); const ex = Math.max(Math.abs(dx) - (hw - cr), 0); const ey = Math.max(Math.abs(dy) - (hh - cr), 0); return ex * ex + ey * ey <= cr * cr; }
        default: return dx * dx + dy * dy <= (R - pad) * (R - pad);
      }
    };

    if (isInside(px, py)) return [px, py];

    // 從 Boss 位置向目標方向二分搜尋最遠合法點
    let lo = 0, hi = 1;
    for (let i = 0; i < 16; i++) {
      const mid = (lo + hi) / 2;
      const mx  = this.x + (px - this.x) * mid;
      const my  = this.y + (py - this.y) * mid;
      if (isInside(mx, my)) lo = mid; else hi = mid;
    }
    return [this.x + (px - this.x) * lo, this.y + (py - this.y) * lo];
  }

  private die(): void {
    this.bossState = BossState.DEAD;
    this.stateTimer?.destroy();
    this.clearWarning();
    this.stopDashTrail();
    this.clearActiveTrails();
    this.anims.timeScale = 1;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_death`);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.setActive(false).setVisible(false);
      this.onDead?.();
    });
  }

  // ── 衝刺殘影 ─────────────────────────────────────────────

  private startDashTrail(): void {
    // Continuous spark emitter — position updated each tick
    this.dashTrailEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 25, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff8800, 0xffcc44, 0xff4400, 0xffff66],
      lifespan: { min: 100, max: 260 },
      emitting: false,
    }).setDepth(10);

    this.dashTrailTimer = this.scene.time.addEvent({
      delay: 38,
      repeat: 18,
      callback: () => {
        // Afterimage ghost — captures current animated frame
        const ghost = this.scene.add.image(this.x, this.y, this.texture.key, this.frame.name)
          .setDepth(11)
          .setAlpha(0.50)
          .setTint(0xff6600)
          .setFlipX(this.flipX)
          .setScale(this.scaleX, this.scaleY);
        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          duration: 210,
          onComplete: () => ghost.destroy(),
        });
        // Spark burst at current position
        this.dashTrailEmitter?.emitParticleAt(this.x, this.y, 7);
      },
    });
  }

  private stopDashTrail(): void {
    this.dashTrailTimer?.destroy();
    this.dashTrailTimer = undefined;
    // Let lingering particles finish before destroying
    const emitter = this.dashTrailEmitter;
    this.dashTrailEmitter = undefined;
    if (emitter) {
      this.scene.time.delayedCall(320, () => { if (emitter.active) emitter.destroy(); });
    }
  }

  // ── 彈幕射擊（共通遠程技能，玩家距離過遠時觸發）────────

  protected enterBarrageWarn(): void {
    if (this.bossState === BossState.DEAD) return;
    if (this.hasValidTarget && !this.hasValidTarget()) { this.enterIdle(); return; }
    this.stateTimer?.destroy();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);

    const bossX = this.x, bossY = this.y;
    let endpoints: { x: number; y: number }[];

    if (this.guestMode) {
      endpoints = this.guestPts.slice(0, Boss.BARRAGE_COUNT).map(p => ({ x: p.x, y: p.y }));
      this.setBossState(BossState.BARRAGE_WARN);
    } else {
      const [px, py] = this.getTargetPos();
      const baseAngle = Phaser.Math.Angle.Between(bossX, bossY, px, py);
      const offsets = [-Boss.BARRAGE_SPREAD, 0, Boss.BARRAGE_SPREAD];
      endpoints = offsets.map(off => {
        const [ex, ey] = this.angleToArenaEdge(baseAngle + off);
        return { x: ex, y: ey };
      });
      this.setBossState(BossState.BARRAGE_WARN, { pts: endpoints.map(t => ({ x: t.x / DPR, y: t.y / DPR })) });
    }

    // 蓄力特效：綠色脈衝光環
    const glowG = this.scene.add.graphics().setDepth(this.depth - 1).setPosition(bossX, bossY);
    const gs = { r: P(6), a: 0.2, ring1: 0, ring2: 0 };
    this.scene.tweens.add({
      targets: gs, r: P(34), a: 1.0, ring1: P(50), ring2: P(72),
      duration: Boss.BARRAGE_CHARGE_MS, ease: 'Quad.In',
      onUpdate: () => {
        glowG.clear();
        // 外擴光環 2
        glowG.lineStyle(P(2), 0x44ff44, gs.a * 0.25 * (gs.ring2 / P(72)));
        glowG.strokeCircle(0, 0, gs.ring2);
        // 外擴光環 1
        glowG.lineStyle(P(3), 0x88ff44, gs.a * 0.45 * (gs.ring1 / P(50)));
        glowG.strokeCircle(0, 0, gs.ring1);
        // 核心填充
        glowG.fillStyle(0x44ff44, gs.a * 0.20);
        glowG.fillCircle(0, 0, gs.r);
        // 核心邊框
        glowG.lineStyle(P(3), 0xaaffaa, gs.a * 0.9);
        glowG.strokeCircle(0, 0, gs.r);
      },
      onComplete: () => glowG.destroy(),
    });
    // 蓄力粒子：綠色火花向外噴
    const chargeEmitter = this.scene.add.particles(bossX, bossY, 'pxl2', {
      speed: { min: 60, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x00ff00, 0x44ff44, 0x88ff88, 0xccffcc],
      lifespan: { min: 80, max: Boss.BARRAGE_CHARGE_MS },
      emitting: false,
    }).setDepth(this.depth + 1);
    chargeEmitter.emitParticleAt(0, 0, 18);
    this.scene.time.delayedCall(200, () => { if (chargeEmitter.active) chargeEmitter.destroy(); });

    const GAP_MS = 120;
    endpoints.forEach((ep, i) => {
      this.scene.time.delayedCall(Boss.BARRAGE_CHARGE_MS + i * GAP_MS, () => {
        if (!this.active || this.bossState === BossState.DEAD) return;
        this.fireBarrageProjectile(bossX, bossY, ep.x, ep.y);
      });
    });

    const totalMs = Boss.BARRAGE_CHARGE_MS + (Boss.BARRAGE_COUNT - 1) * GAP_MS + 380;
    this.stateTimer = this.scene.time.delayedCall(totalMs, () => this.enterIdle());
  }

  // 從 Boss 當前位置沿角度射出，精確求交點到競技場邊界（四種形狀均支援）
  private angleToArenaEdge(angle: number): [number, number] {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const cx = this.arenaCenter.x, cy = this.arenaCenter.y;
    const R  = this.arenaRadius;
    const dx0 = this.x - cx, dy0 = this.y - cy;

    if (this.arenaShape === 0) {
      // 圓形：解析解，取正根
      const b = 2 * (dx0 * cos + dy0 * sin);
      const c = dx0 * dx0 + dy0 * dy0 - R * R;
      const t = (-b + Math.sqrt(Math.max(0, b * b - 4 * c))) / 2;
      return [this.x + cos * t, this.y + sin * t];
    }

    // 非圓形：二分搜尋，使用與 game.scene.ts 完全一致的 isInside 邏輯（含 DPR 縮放）
    const isIn = (x: number, y: number): boolean => {
      const dx = x - cx, dy = y - cy;
      switch (this.arenaShape) {
        case 1: { const hs = R * 0.875; return Math.abs(dx) <= hs && Math.abs(dy) <= hs && Math.abs(dx) + Math.abs(dy) <= hs * 1.5; }
        case 2: return Math.abs(dx) + Math.abs(dy) <= R;
        case 3: { const hw = P(380), hh = P(300), cr = P(100); const ex = Math.max(Math.abs(dx) - (hw - cr), 0); const ey = Math.max(Math.abs(dy) - (hh - cr), 0); return ex * ex + ey * ey <= cr * cr; }
        default: return dx * dx + dy * dy <= R * R;
      }
    };

    const FAR = Math.round(2000 * DPR);
    const farX = this.x + cos * FAR, farY = this.y + sin * FAR;
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (isIn(this.x + (farX - this.x) * mid, this.y + (farY - this.y) * mid)) lo = mid; else hi = mid;
    }
    const t = (lo + hi) / 2;
    return [this.x + (farX - this.x) * t, this.y + (farY - this.y) * t];
  }

  private fireBarrageProjectile(startX: number, startY: number, endX: number, endY: number): void {
    const dist = Phaser.Math.Distance.Between(startX, startY, endX, endY);
    if (dist < 1) return;
    const travelMs = Math.round((dist / Boss.BARRAGE_SPEED_PX) * 1000);

    const trailGfx = this.scene.add.graphics().setDepth(8);
    const orb = this.scene.add.graphics().setDepth(15).setPosition(startX, startY);
    const prog = { t: 0 };
    let orbHit = false;

    // 飛行中的粒子尾跡（短命綠色水滴）
    const orbTrail = this.scene.add.particles(startX, startY, 'pxl2', {
      speed: { min: 15, max: 45 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: [0x00ee00, 0x44ff44, 0x22cc00, 0xaaffaa],
      lifespan: { min: 80, max: 180 },
      frequency: mf(22),
      quantity: mq(2),
      gravityY: 18,
    }).setDepth(14);

    this.scene.tweens.add({
      targets: prog, t: 1, duration: travelMs, ease: 'Linear',
      onUpdate: () => {
        const t = prog.t;
        const cx = startX + (endX - startX) * t;
        const cy = startY + (endY - startY) * t;
        orb.setPosition(cx, cy);
        orbTrail.setPosition(cx, cy);
        orb.clear();
        // 外層柔光
        orb.fillStyle(0x44ff44, 0.18);
        orb.fillCircle(0, 0, P(18));
        // 中層光暈
        orb.fillStyle(0x00dd00, 0.55);
        orb.fillCircle(0, 0, P(11));
        // 核心
        orb.fillStyle(0xccffcc, 0.95);
        orb.fillCircle(0, 0, P(5));
        // 邊框
        orb.lineStyle(P(2), 0x88ff44, 0.9);
        orb.strokeCircle(0, 0, P(11));
        this.drawSlimeTrail(trailGfx, startX, startY, cx, cy, 1);
        if (!orbHit) {
          const [px, py] = this.getTargetPos();
          if (Phaser.Math.Distance.Between(cx, cy, px, py) <= P(20)) {
            orbHit = true;
            this.onBarrageOrbHit?.(cx, cy, this.scaleDmg(65));
          }
        }
      },
      onComplete: () => {
        orb.destroy();
        orbTrail.stop();
        this.scene.time.delayedCall(250, () => { if (orbTrail.active) orbTrail.destroy(); });
        // 撞擊競技場邊緣的綠色黏液濺射
        this.scene.cameras.main.shake(40, 0.004);
        const burst = this.scene.add.particles(endX, endY, 'pxl2', {
          speed: { min: 55, max: 200 },
          angle: { min: 0, max: 360 },
          scale: { start: 1.8, end: 0 },
          alpha: { start: 1, end: 0 },
          tint: [0x00ff00, 0x44ff44, 0x88ff88, 0xccffcc],
          lifespan: { min: 120, max: 350 },
          emitting: false,
        }).setDepth(16);
        burst.emitParticleAt(0, 0, 20);
        const splat = this.scene.add.graphics().setDepth(15).setPosition(endX, endY);
        splat.fillStyle(0x00cc00, 0.5);
        splat.fillCircle(0, 0, P(18));
        splat.lineStyle(P(3), 0x44ff44, 0.8);
        splat.strokeCircle(0, 0, P(18));
        this.scene.tweens.add({
          targets: splat, alpha: 0, scaleX: 1.8, scaleY: 1.8,
          duration: 280, onComplete: () => splat.destroy(),
        });
        this.scene.time.delayedCall(400, () => { if (burst.active) burst.destroy(); });
        this.addBarrageTrail(trailGfx, startX, startY, endX, endY);
      },
    });
  }

  private drawSlimeTrail(
    gfx: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number, alpha: number,
  ): void {
    gfx.clear();
    // 最外層：大範圍柔光（讓黏液有發光感）
    gfx.lineStyle(Boss.BARRAGE_TRAIL_W * 3, 0x44ff44, 0.10 * alpha);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();
    // 中層：主體黏液
    gfx.lineStyle(Boss.BARRAGE_TRAIL_W, 0x009900, 0.70 * alpha);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();
    // 內層亮邊：中心高光，讓黏液看起來是立體液體
    gfx.lineStyle(Math.max(1, Math.round(Boss.BARRAGE_TRAIL_W * 0.35)), 0xaaffaa, 0.55 * alpha);
    gfx.beginPath(); gfx.moveTo(x1, y1); gfx.lineTo(x2, y2); gfx.strokePath();
  }

  private addBarrageTrail(
    gfx: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number,
  ): void {
    // Remove oldest trail if at max
    if (this.activeTrails.length >= Boss.MAX_TRAILS) {
      const oldest = this.activeTrails.shift()!;
      oldest.tickTimer.destroy();
      oldest.expireTimer.destroy();
      oldest.gfx.destroy();
    }

    // 週期傷害：玩家站在痕跡上時觸發
    const tickTimer = this.scene.time.addEvent({
      delay: Boss.BARRAGE_TRAIL_TICK,
      repeat: Math.floor(Boss.BARRAGE_TRAIL_DUR / Boss.BARRAGE_TRAIL_TICK) - 1,
      callback: () => {
        this.onRangedBarrageTrailTick?.(x1, y1, x2, y2, Boss.BARRAGE_TRAIL_HIT_R, this.scaleDmg(Boss.BARRAGE_TRAIL_DMG));
      },
    });

    // 沿痕跡線段隨機滴落的黏液粒子
    const trailLine = new Phaser.Geom.Line(x1, y1, x2, y2);
    const drips = this.scene.add.particles(0, 0, 'pxl2', {
      speed: { min: 6, max: 22 },
      angle: { min: 75, max: 105 },
      scale: { start: 1.1, end: 0 },
      alpha: { start: 0.65, end: 0 },
      tint: [0x00cc00, 0x22ee22, 0x44ff44, 0x009900],
      lifespan: { min: 350, max: 800 },
      frequency: mf(160),
      quantity: 1,
      gravityY: 28,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      emitZone: { type: 'random', source: trailLine } as any,
    }).setDepth(9);
    // 後半段停止生成，讓滴落自然消失
    this.scene.time.delayedCall(Boss.BARRAGE_TRAIL_DUR * 0.65, () => {
      if (drips.active) drips.stop();
    });

    // 痕跡淡出
    const fadeObj = { a: 1 };
    this.scene.tweens.add({
      targets: fadeObj, a: 0,
      duration: Boss.BARRAGE_TRAIL_DUR, ease: 'Sine.easeIn',
      onUpdate: () => this.drawSlimeTrail(gfx, x1, y1, x2, y2, fadeObj.a),
      onComplete: () => gfx.clear(),
    });

    const expireTimer = this.scene.time.delayedCall(Boss.BARRAGE_TRAIL_DUR, () => {
      const idx = this.activeTrails.findIndex(t => t.gfx === gfx);
      if (idx !== -1) this.activeTrails.splice(idx, 1);
      gfx.destroy();
      if (drips.active) drips.destroy();
    });

    this.activeTrails.push({ gfx, x1, y1, x2, y2, tickTimer, expireTimer, drips });
  }

  private clearActiveTrails(): void {
    for (const trail of this.activeTrails) {
      trail.tickTimer.destroy();
      trail.expireTimer.destroy();
      if (trail.gfx.active) trail.gfx.destroy();
      if (trail.drips?.active) trail.drips.destroy();
    }
    this.activeTrails.length = 0;
  }

  // ── 技能特效 ─────────────────────────────────────────────

  private spawnAoeExplosion(cx: number, cy: number): void {
    const r = Boss.AOE_RADIUS;
    this.scene.cameras.main.shake(260, 0.02);

    // Instant blinding flash — very short, very bright
    const flash = this.scene.add.graphics().setDepth(22).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 1);
    flash.fillCircle(0, 0, r * 0.65);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0, scaleX: 1.7, scaleY: 1.7,
      duration: 120,
      onComplete: () => flash.destroy(),
    });

    // Shockwave ring — thin, fast expand, disappears quickly
    const shock = this.scene.add.graphics().setDepth(20).setPosition(cx, cy);
    shock.lineStyle(3, 0xffee88, 0.9);
    shock.strokeCircle(0, 0, r * 0.45);
    this.scene.tweens.add({
      targets: shock,
      alpha: 0, scaleX: 2.4, scaleY: 2.4,
      duration: 260, ease: 'Sine.easeOut',
      onComplete: () => shock.destroy(),
    });

    // ── Layer 1: white core burst — fastest, brightest ─
    const core = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 280, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffff88, 0xffee44],
      lifespan: { min: 100, max: 260 },
      emitting: false,
    }).setDepth(22);
    core.emitParticleAt(0, 0, 60);
    this.scene.time.delayedCall(320, () => { if (core.active) core.destroy(); });

    // ── Layer 2: fire burst — medium speed, spreads from zone
    const fire = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 70, max: 240 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.6, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0xff8800, 0xff4400, 0xffcc00, 0xff6600, 0xffaa00],
      lifespan: { min: 350, max: 750 },
      gravityY: -35,
      emitting: false,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, r * 0.5),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(21);
    fire.emitParticleAt(0, 0, 55);
    this.scene.time.delayedCall(900, () => { if (fire.active) fire.destroy(); });

    // ── Layer 3: rock debris — heavy gravity ──────────
    const debris = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 100, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0x8a9e86, 0x4a5848, 0xaa9977, 0x556655, 0x7a8c78],
      lifespan: { min: 500, max: 1000 },
      gravityY: 300,
      emitting: false,
    }).setDepth(20);
    debris.emitParticleAt(0, 0, 30);
    this.scene.time.delayedCall(1100, () => { if (debris.active) debris.destroy(); });

    // ── Layer 4: smoke — grey, large, rises slowly ────
    const smoke = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 18, max: 65 },
      angle: { min: 240, max: 300 },
      scale: { start: 3.2, end: 0 },
      alpha: { start: 0.45, end: 0 },
      tint: [0x888888, 0xaaaaaa, 0x666666, 0x999999],
      lifespan: { min: 900, max: 1900 },
      gravityY: -14,
      emitting: false,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, r * 0.6),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(18);
    smoke.emitParticleAt(0, 0, 24);
    this.scene.time.delayedCall(2100, () => { if (smoke.active) smoke.destroy(); });

    // ── Layer 5: embers drift up long after ───────────
    const embers = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 20, max: 70 },
      angle: { min: 258, max: 282 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff6600, 0xff8800, 0xffaa00],
      lifespan: { min: 800, max: 1700 },
      gravityY: -20,
      emitting: false,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, r * 0.7),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(20);
    embers.emitParticleAt(0, 0, 28);
    this.scene.time.delayedCall(1900, () => { if (embers.active) embers.destroy(); });
  }

  private spawnDashImpact(cx: number, cy: number): void {
    this.scene.cameras.main.shake(130, 0.009);

    const cos = Math.cos(this.dashAngle);
    const sin = Math.sin(this.dashAngle);
    const pc  = Math.cos(this.dashAngle + Math.PI / 2);
    const ps  = Math.sin(this.dashAngle + Math.PI / 2);

    // Instant flash — brief, bright
    const flash = this.scene.add.graphics().setDepth(22).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, 30 * DPR);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0, scaleX: 2.0, scaleY: 1.4,
      duration: 150,
      onComplete: () => flash.destroy(),
    });

    // Shockwave ring
    const shock = this.scene.add.graphics().setDepth(20).setPosition(cx, cy);
    shock.lineStyle(2, 0xff8800, 0.85);
    shock.strokeCircle(0, 0, 22 * DPR);
    this.scene.tweens.add({
      targets: shock,
      alpha: 0, scaleX: 3.0, scaleY: 3.0,
      duration: 300, ease: 'Sine.easeOut',
      onComplete: () => shock.destroy(),
    });

    // ── Layer 1: core impact sparks — white/yellow, fast
    const core = this.scene.add.particles(0, 0, 'pxl2', {
      speed: { min: 180, max: 380 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffff88, 0xffcc44, 0xff8800],
      lifespan: { min: 100, max: 300 },
      emitting: false,
    }).setDepth(22);
    core.emitParticleAt(cx, cy, 45);
    this.scene.time.delayedCall(380, () => { if (core.active) core.destroy(); });

    // ── Layer 2: rock chunks — directional sideways/back
    const impactDeg = Phaser.Math.RadToDeg(this.dashAngle);
    const chunks = this.scene.add.particles(0, 0, 'pxl', {
      speed: { min: 130, max: 290 },
      angle: { min: impactDeg + 100, max: impactDeg + 260 },
      scale: { start: 2.8, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0x4a5848, 0x8a9e86, 0x222e22, 0x667766],
      lifespan: { min: 400, max: 780 },
      gravityY: 340,
      emitting: false,
    }).setDepth(20);
    chunks.emitParticleAt(cx, cy, 22);
    this.scene.time.delayedCall(900, () => { if (chunks.active) chunks.destroy(); });

    // ── Layer 3: dust cloud — wide, sandy tones ────────
    const dust = this.scene.add.particles(0, 0, 'pxl', {
      speed: { min: 55, max: 190 },
      angle: { min: 0, max: 360 },
      scale: { start: 3.0, end: 0 },
      alpha: { start: 0.6, end: 0 },
      tint: [0xccbbaa, 0xaa9988, 0xddccbb, 0x998877],
      lifespan: { min: 450, max: 950 },
      gravityY: 90,
      emitting: false,
    }).setDepth(17);
    dust.emitParticleAt(cx, cy, 32);
    this.scene.time.delayedCall(1050, () => { if (dust.active) dust.destroy(); });

    // ── Speed lines pixel dashes behind impact ─────────
    const trailGfx = this.scene.add.graphics().setDepth(17).setPosition(cx, cy);
    for (let lane = -2; lane <= 2; lane++) {
      const ox = pc * (lane * 9);
      const oy = ps * (lane * 9);
      const laneAlpha = 1 - Math.abs(lane) * 0.22;
      for (let d = 14; d < 76; d += 14) {
        trailGfx.fillStyle(0xffaa44, laneAlpha * (1 - d / 76));
        trailGfx.fillRect(ox - cos * d - 5, oy - sin * d - 2, 10, 4);
      }
    }
    this.scene.tweens.add({
      targets: trailGfx,
      alpha: 0,
      duration: 360,
      onComplete: () => trailGfx.destroy(),
    });
  }

  // ── 警示圖形 ─────────────────────────────────────────────

  private drawAoeWarning(): void {
    this.clearWarning();
    const r = Boss.AOE_RADIUS;
    // Draw at local (0,0) — position is controlled via setPosition
    this.warningGfx.setPosition(this.atkX, this.atkY);

    // ── Interior: sparse 2×2 dot grid ─────────────────────
    this.warningGfx.fillStyle(0xff0000, 0.14);
    for (let dx = -(r - P(4)); dx <= r - P(4); dx += P(8)) {
      for (let dy = -(r - P(4)); dy <= r - P(4); dy += P(8)) {
        if (dx * dx + dy * dy <= (r - P(8)) * (r - P(8))) {
          this.warningGfx.fillRect(dx - P(1), dy - P(1), P(2), P(2));
        }
      }
    }

    // ── Inner dashed ring (55 % radius) ───────────────────
    const r2 = r * 0.55;
    for (let i = 0; i < 28; i++) {
      if (i % 4 === 3) continue;
      const a = (i / 28) * Math.PI * 2;
      this.warningGfx.fillStyle(0xff3300, 0.50);
      this.warningGfx.fillRect(Math.cos(a) * r2 - P(2), Math.sin(a) * r2 - P(2), P(4), P(4));
    }

    // ── Outer pixel ring — 4×4 blocks, 8×8 at cardinals ──
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const isCardinal = i % 12 === 0;
      const sz  = isCardinal ? P(8) : P(4);
      const alp = isCardinal ? 1.0 : 0.88;
      const a   = (i / steps) * Math.PI * 2;
      this.warningGfx.fillStyle(0xff1100, alp);
      this.warningGfx.fillRect(Math.cos(a) * r - sz / 2, Math.sin(a) * r - sz / 2, sz, sz);
    }

    // ── Cardinal notch markers ─────────────────────────────
    this.warningGfx.fillStyle(0xff4400, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      this.warningGfx.fillRect(Math.cos(a) * r - P(5),           Math.sin(a) * r - P(5),           P(10), P(10));
      this.warningGfx.fillRect(Math.cos(a) * (r - P(14)) - P(2), Math.sin(a) * (r - P(14)) - P(2), P(4),  P(4));
    }

    // ── Center target reticle ─────────────────────────────
    this.warningGfx.fillStyle(0xff2200, 0.65);
    this.warningGfx.fillRect(-P(12), -P(2), P(24), P(4));
    this.warningGfx.fillRect(-P(2), -P(12), P(4), P(24));
    this.warningGfx.fillStyle(0xff5500, 0.9);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.warningGfx.fillRect(sx * P(6),          sy * P(6) - P(1), sx < 0 ? -P(6) : P(6), P(2));
      this.warningGfx.fillRect(sx * P(6) - P(1),  sy * P(6),         P(2), sy < 0 ? -P(6) : P(6));
    }

    this.pulseTween = this.scene.tweens.add({
      targets: this.warningGfx,
      alpha: { from: 1, to: 0.28 },
      duration: 240,
      yoyo: true,
      repeat: -1,
    });
  }

  private drawDashWarning(): void {
    this.clearWarning();
    const angle   = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const cos     = Math.cos(angle);
    const sin     = Math.sin(angle);
    const pc      = Math.cos(angle + Math.PI / 2);
    const ps      = Math.sin(angle + Math.PI / 2);
    // Actual dash distance = speed × time, clipped to world bounds
    const wb  = this.scene.physics.world.bounds;
    let   len = Boss.DASH_SPEED * (Boss.DASH_MS / 1000);
    if (cos > 0) len = Math.min(len, (wb.right  - this.x) / cos);
    if (cos < 0) len = Math.min(len, (wb.left   - this.x) / cos);
    if (sin > 0) len = Math.min(len, (wb.bottom - this.y) / sin);
    if (sin < 0) len = Math.min(len, (wb.top    - this.y) / sin);
    len = Math.max(0, len);

    // ── Center dotted dashes ──────────────────────────────
    this.warningGfx.fillStyle(0xff3300, 0.45);
    for (let d = P(22); d < len; d += P(11)) {
      this.warningGfx.fillRect(this.x + cos * d - P(2), this.y + sin * d - P(2), P(4), P(4));
    }

    // ── 3 pixel chevron arrows ────────────────────────────
    const numChev  = 3;
    const chevHW   = P(20);   // chevron half-width (px)
    const chevD    = P(16);   // forward depth of chevron tip

    for (let c = 0; c < numChev; c++) {
      const dist = P(44) + c * P(68);
      if (dist > len) break;
      const alpha = 1.0 - c * 0.20;
      const bx    = this.x + cos * dist;
      const by    = this.y + sin * dist;

      // Draw each arm as 6 pixel blocks from wide base → pointed tip
      const segs = 6;
      for (let s = 0; s <= segs; s++) {
        const t  = s / segs;
        const hw = chevHW * (1 - t);
        const fd = chevD  * t;
        // Left arm
        this.warningGfx.fillStyle(0xff1100, alpha * 0.9);
        this.warningGfx.fillRect(bx + cos * fd + pc * hw - P(3), by + sin * fd + ps * hw - P(3), P(6), P(6));
        // Right arm (skip centre overlap at tip)
        if (s < segs) {
          this.warningGfx.fillRect(bx + cos * fd - pc * hw - P(3), by + sin * fd - ps * hw - P(3), P(6), P(6));
        }
      }
      // Bright tip pixel
      this.warningGfx.fillStyle(0xff6600, alpha);
      this.warningGfx.fillRect(bx + cos * chevD - P(4), by + sin * chevD - P(4), P(8), P(8));
    }

    // ── Start ring at boss feet ───────────────────────────
    this.warningGfx.fillStyle(0xff3300, 0.75);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.warningGfx.fillRect(
        this.x + Math.cos(a) * P(18) - P(3),
        this.y + Math.sin(a) * P(18) - P(3),
        P(6), P(6),
      );
    }

    // ── Target cross at destination ───────────────────────
    const tx = this.x + cos * len;
    const ty = this.y + sin * len;
    this.warningGfx.fillStyle(0xff4400, 0.85);
    for (const [ox, oy] of [[-P(8), 0], [P(8), 0], [0, -P(8)], [0, P(8)]]) {
      this.warningGfx.fillRect(tx + ox - P(2), ty + oy - P(2), P(4), P(4));
    }
    this.warningGfx.fillStyle(0xff2200, 1);
    this.warningGfx.fillRect(tx - P(4), ty - P(4), P(8), P(8));

    this.pulseTween = this.scene.tweens.add({
      targets: this.warningGfx,
      alpha: { from: 1, to: 0.22 },
      duration: 200,
      yoyo: true,
      repeat: -1,
    });
  }

  protected clearWarning(): void {
    this.aoeTrackTimer?.destroy();
    this.aoeTrackTimer = undefined;
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.warningGfx.clear();
    this.warningGfx.setPosition(0, 0);
    this.warningGfx.setAlpha(1);
    this.warnParticles?.destroy();
    this.warnParticles = undefined;
  }
}
