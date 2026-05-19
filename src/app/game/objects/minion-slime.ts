import Phaser from 'phaser';
import { MONSTER_SCALE_SMALL } from '../data/monster-data';
import { CardStore } from '../data/card-store';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const F   = (n: number): string => `${Math.round(n * DPR)}px`;

enum MinionState {
  PATROL       = 'PATROL',
  IDLE         = 'IDLE',
  DASH_WARN    = 'DASH_WARN',
  DASHING      = 'DASHING',
  SHOOT_WARN   = 'SHOOT_WARN',
  TRIPLE_WARN  = 'TRIPLE_WARN',
  EXPLODE_WARN = 'EXPLODE_WARN',
  SPIKE_WARN   = 'SPIKE_WARN',
  ARC_WARN     = 'ARC_WARN',
  LEAP_WARN    = 'LEAP_WARN',
  SPIN_WARN    = 'SPIN_WARN',
  CRACK_WARN   = 'CRACK_WARN',
  WHIRL_WARN   = 'WHIRL_WARN',
  WHIRLING     = 'WHIRLING',
  METEOR_WARN    = 'METEOR_WARN',
  LIGHTNING_WARN = 'LIGHTNING_WARN',
  DEAD           = 'DEAD',
}

export class MinionSlime extends Phaser.Physics.Arcade.Sprite {
  private mState     = MinionState.IDLE;
  started            = false;
  private hp:        number;
  private readonly maxHp: number;
  private stateTimer?: Phaser.Time.TimerEvent;
  private hpBarGfx:   Phaser.GameObjects.Graphics;
  private debuffGfx:  Phaser.GameObjects.Graphics;
  private debuffTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private dir: 'down' | 'left' | 'right' | 'up' = 'down';
  private atkX = 0;
  private atkY = 0;
  private pb!: Phaser.Physics.Arcade.Body;   // stable body reference

  private patrolCenter   = new Phaser.Math.Vector2(0, 0);
  private patrolTargetX  = 0;
  private patrolTargetY  = 0;
  private isReturning    = false;
  private readonly patrolRadius  = Math.round(120 * DPR);
  private readonly aggroRange    = Math.round(230 * DPR);
  private readonly deaggroRange  = Math.round(800 * DPR);
  private readonly leashRange    = Math.round(620 * DPR);

  static readonly CHASE_SPEED     = Math.round(90 * DPR);
  static readonly STOP_RANGE      = Math.round(55 * DPR);
  static readonly DASH_SPEED      = Math.round(310 * DPR);
  static readonly DASH_MS         = 260;
  static readonly RANGED_RANGE    = Math.round(160 * DPR);
  static readonly EXPLODE_RANGE   = Math.round(30 * DPR);
  static readonly COOLDOWN_SHOOT  = 2300;
  static readonly COOLDOWN_TRIPLE = 3800;
  static readonly COOLDOWN_EXPLODE = 2000;
  static readonly EXPLODE_WARN_MS = 1000;
  static readonly EXPLODE_RADIUS  = Math.round(35 * DPR);
  static readonly COOLDOWN_SPIKE  = 3300;
  static readonly SPIKE_WARN_MS   = 900;
  static readonly SPIKE_RADIUS    = Math.round(14 * DPR);
  static readonly ARC_RANGE       = Math.round(40 * DPR);
  static readonly ARC_WARN_MS     = 500;
  static readonly COOLDOWN_ARC    = 2500;
  static readonly LEAP_RANGE      = Math.round(144 * DPR);
  static readonly LEAP_WARN_MS    = 800;
  static readonly COOLDOWN_LEAP   = 3500;
  static readonly COOLDOWN_BLADE  = 2500;
  static readonly SPIN_RANGE      = Math.round(65 * DPR);
  static readonly SPIN_WARN_MS    = 600;
  static readonly COOLDOWN_SPIN   = 4000;
  static readonly CRACK_RANGE     = Math.round(180 * DPR);
  static readonly CRACK_WARN_MS   = 700;
  static readonly COOLDOWN_CRACK  = 3200;
  static readonly COOLDOWN_TRIPLE_WAVE  = 3000;
  static readonly TRIPLE_WAVE_WARN_MS   = 900;
  static readonly WHIRL_RANGE          = Math.round(90 * DPR);
  static readonly WHIRL_WARN_MS        = 850;
  static readonly COOLDOWN_WHIRL       = 3500;
  static readonly WHIRL_SPEED          = Math.round(110 * DPR);
  static readonly WHIRL_DURATION       = 900;
  static readonly COOLDOWN_NEEDLE           = 2500;
  static readonly NEEDLE_WARN_MS            = 400;
  static readonly COOLDOWN_METEOR           = 4000;
  static readonly METEOR_WARN_MS            = 950;
  static readonly COOLDOWN_BURST            = 3200;
  static readonly BURST_WARN_MS             = 280;
  static readonly COOLDOWN_TRIPLE_NEEDLE    = 2800;
  static readonly TRIPLE_NEEDLE_WARN_MS     = 750;
  static readonly COOLDOWN_LIGHTNING_RING   = 4500;
  static readonly LIGHTNING_RING_WARN_MS    = 1100;
  static readonly COOLDOWN_ORBIT_BURST      = 3800;
  static readonly ORBIT_BURST_WARN_MS       = 340;

  getTargetPos: () => [number, number] = () => [0, 0];
  onDead?: () => void;
  onFire?: (type: 'shoot' | 'triple' | 'explode' | 'spike' | 'blade_wave' | 'triple_wave' | 'arc_slash' | 'leap_slam' | 'spin_slash' | 'ground_crack' | 'whirl_slash' | 'blood_needle' | 'meteor' | 'blood_burst' | 'triple_needle' | 'lightning_ring' | 'orbit_burst', mx: number, my: number, tx: number, ty: number) => void;
  slowMult = 1;  // 減速倍率（1 = 正常，0.8 = 緩速 20%）

  minionId        = '';
  attackMode: 'dash' | 'shoot' | 'triple' | 'explode' | 'spike' | 'arc_slash' | 'leap_slam' | 'blade_wave' | 'triple_wave' | 'spin_slash' | 'ground_crack' | 'whirl_slash' | 'blood_needle' | 'meteor' | 'blood_burst' | 'triple_needle' | 'lightning_ring' | 'orbit_burst' = 'dash';
  stationary       = false;
  isAlly           = false;
  attackCooldownMs?: number;  // 若設定則覆蓋各攻擊模式的預設冷卻時間
  rangedRange      = MinionSlime.RANGED_RANGE;
  dashWarnMs       = 650;
  explodeRadiusMult = 1.0;
  private attackCooldownUntil = 0;
  private explodeWarnStart    = 0;
  private leapTargetX         = 0;
  private leapTargetY         = 0;
  private whirlTargetX        = 0;
  private whirlTargetY        = 0;
  private warnCircleGfx?: Phaser.GameObjects.Graphics;
  private meteorTargetX = 0;
  private meteorTargetY = 0;
  isElite       = false;
  atk           = 10;
  guestDashing  = false;
  burnStacks    = 0;
  burnExpiresAt = 0;
  stunUntil     = 0;
  element:      import('../data/equipment-data').Element = 'none';
  tier          = 1;
  race          = 'slime';
  walkAnim      = 'walk';

  applyBurn(gameTime: number, maxStacks = 15, duration = 4000): void {
    if (this.burnStacks < maxStacks) this.burnStacks++;
    this.burnExpiresAt = gameTime + duration;
  }

  applyStun(duration = 2000): void {
    this.stunUntil = Math.max(this.stunUntil, this.scene.time.now + duration);
    this.pb.setVelocity(0, 0);
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
  }

  private readonly animPrefix: string;
  private readonly baseTint:   number;

  constructor(scene: Phaser.Scene, x: number, y: number, hp = 150, spriteKey = 'slime', tint = 0xffffff) {
    super(scene, x, y, `${spriteKey}_idle`, 0);
    this.animPrefix = spriteKey;
    this.baseTint   = tint;
    this.hp    = hp;
    this.maxHp = hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.pb = this.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.patrolCenter.set(x, y);
    this.patrolTargetX = x;
    this.patrolTargetY = y;
    this.pb.setSize(19, 12).setOffset(23, 29);
    this.setScale(MONSTER_SCALE_SMALL);
    this.setDepth(12);
    this.applyBaseTint();
    this.play(`${spriteKey}_idle_down`, true);
    this.setVisible(false);
    this.hpBarGfx  = scene.add.graphics().setDepth(100000);
    this.debuffGfx = scene.add.graphics().setDepth(100001);
  }

  private _flashUntil = 0;

  flashWhite(ms = 80): void {
    this._flashUntil = this.scene.time.now + ms;
    this.setTintFill(0xffffff);
    this.scene.time.delayedCall(ms, () => this.applyBaseTint());
  }

  private applyBaseTint(): void {
    if (this.scene.time.now < this._flashUntil) return;
    if (this.baseTint === 0xffffff) this.clearTint();
    else this.setTint(this.baseTint);
  }

  start(): void {
    this.started = true;
    this.enterPatrol();
    // visibility is controlled externally — scene shows the minion when player is near
  }

  /** Override hp/atk after construction (ally flower). */
  setAllyStats(hp: number, atk: number): void {
    (this as any).hp    = hp;
    (this as any).maxHp = hp;
    this.atk = atk;
    this.drawHpBar();
  }

  setPatrolCenter(x: number, y: number): void {
    this.patrolCenter.set(x, y);
    this.patrolTargetX = x;
    this.patrolTargetY = y;
  }

  takeDamage(amount: number): number {
    if (this.mState === MinionState.DEAD) return 0;
    const prevHp = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    this.flashWhite();
    if (this.hp <= 0) {
      this.die();
    } else if (!this.isAlly && (CardStore.getTotalStats().executeBelow15 ?? 0) > 0 && this.hp / this.maxHp < 0.12) {
      this.hp = 0;
      this.die();
    }
    return Math.max(0, amount - prevHp);  // 超殺量
  }

  applyServerHp(hp: number, isDead: boolean): void {
    if (this.mState === MinionState.DEAD) return;
    this.hp = hp;
    this.flashWhite();
    if (isDead) { this.die(); return; }
    this.drawHpBar();
  }

  noKnockback = false;

  knockback(fromX: number, fromY: number, power = 80): void {
    if (this.noKnockback) return;
    if (this.mState === MinionState.DEAD || this.mState === MinionState.DASHING) return;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const body = this.pb;
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics)
      .velocityFromAngle(Phaser.Math.RadToDeg(angle), power, body.velocity);
    this.scene.time.delayedCall(180, () => {
      if (this.mState !== MinionState.DASHING) body.setVelocity(0, 0);
    });
  }

  get isDead():    boolean { return this.mState === MinionState.DEAD; }
  get isDashing(): boolean { return this.mState === MinionState.DASHING || this.guestDashing; }
  get currentHp(): number  { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }

  applyGuestState(isDashing: boolean, dir: 'down' | 'left' | 'right' | 'up', moving: boolean): void {
    if (this.mState === MinionState.DEAD) return;
    this.guestDashing = isDashing;
    if (isDashing) {
      this.setTint(0xff8800);
      this.play(`${this.animPrefix}_run_${dir}`, true);
    } else {
      this.applyBaseTint();
      const anim = moving ? `${this.animPrefix}_${this.walkAnim}_${dir}` : `${this.animPrefix}_idle_${dir}`;
      if (this.anims.currentAnim?.key !== anim) this.play(anim, true);
    }
  }

  // ── State Machine ───────────────────────────────────

  private enterPatrol(): void {
    this.mState = MinionState.PATROL;
    this.stateTimer?.destroy();
    this.stateTimer  = undefined;
    this.isReturning = true;
    this.hp = this.maxHp;
    this.applyBaseTint();
    if (this.stationary) {
      this.mState = MinionState.IDLE;
      this.pb.setVelocity(0, 0);
      this.playDir(`${this.animPrefix}_idle`);
      return;
    }
    // 先走回巡邏中心，到了再開始正常巡邏
    this.patrolTargetX = this.patrolCenter.x;
    this.patrolTargetY = this.patrolCenter.y;
    this.updateDirTo(this.patrolTargetX, this.patrolTargetY);
    this.playDir(`${this.animPrefix}_${this.walkAnim}`);
  }

  private pickPatrolTarget(): void {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist  = Phaser.Math.FloatBetween(40, this.patrolRadius);
    this.patrolTargetX = this.patrolCenter.x + Math.cos(angle) * dist;
    this.patrolTargetY = this.patrolCenter.y + Math.sin(angle) * dist;
    this.updateDirTo(this.patrolTargetX, this.patrolTargetY);
    this.playDir(`${this.animPrefix}_${this.walkAnim}`);
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    const travelMs = Phaser.Math.Between(2000, 3500);
    this.stateTimer = this.scene.time.delayedCall(travelMs, () => {
      if (this.mState !== MinionState.PATROL) return;
      this.pb.setVelocity(0, 0);
      this.updateDir();
      this.playDir(`${this.animPrefix}_idle`);
      this.stateTimer = this.scene.time.delayedCall(Phaser.Math.Between(600, 1800), () => {
        if (this.mState === MinionState.PATROL) this.pickPatrolTarget();
      });
    });
  }

  private enterIdle(): void {
    this.mState = MinionState.IDLE;
    this.pb.setVelocity(0, 0);
    this.applyBaseTint();
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.updateDir();
    const walkKey = `${this.animPrefix}_${this.walkAnim}_${this.dir}`;
    this.playDir(this.scene.anims.exists(walkKey) ? `${this.animPrefix}_${this.walkAnim}` : `${this.animPrefix}_idle`);
    if (this.attackMode === 'dash') {
      const delay = Phaser.Math.Between(1500, 2500);
      this.stateTimer = this.scene.time.delayedCall(delay, () => this.enterDashWarn());
    }
    // Ranged modes: attack triggered by distance check in preUpdate
  }

  private enterDashWarn(): void {
    this.mState = MinionState.DASH_WARN;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xff4400);
    this.stateTimer = this.scene.time.delayedCall(this.dashWarnMs, () => this.enterDashing());
  }

  private enterShootWarn(): void {
    this.mState = MinionState.SHOOT_WARN;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(
      this.attackMode === 'blade_wave'    ? 0x00aaff :
      this.attackMode === 'blood_needle'  ? 0xcc0022 :
      this.attackMode === 'triple_needle' ? 0xaa0033 :
      0xff6600,
    );
    if (this.attackMode === 'triple_needle') {
      this.explodeWarnStart = this.scene.time.now;
      if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    }
    this.stateTimer?.destroy();
    const warnMs = this.attackMode === 'triple_needle' ? MinionSlime.TRIPLE_NEEDLE_WARN_MS : 400;
    this.stateTimer = this.scene.time.delayedCall(warnMs, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      const type: 'blade_wave' | 'blood_needle' | 'triple_needle' | 'shoot' =
        this.attackMode === 'blade_wave'    ? 'blade_wave'    :
        this.attackMode === 'blood_needle'  ? 'blood_needle'  :
        this.attackMode === 'triple_needle' ? 'triple_needle' :
        'shoot';
      this.onFire?.(type, this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
      const cd =
        this.attackMode === 'blade_wave'    ? MinionSlime.COOLDOWN_BLADE         :
        this.attackMode === 'blood_needle'  ? MinionSlime.COOLDOWN_NEEDLE        :
        this.attackMode === 'triple_needle' ? MinionSlime.COOLDOWN_TRIPLE_NEEDLE :
        MinionSlime.COOLDOWN_SHOOT;
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? cd + Phaser.Math.Between(0, 800));
      this.enterIdle();
    });
  }

  private enterTripleWarn(): void {
    this.mState = MinionState.TRIPLE_WARN;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();

    if (this.attackMode === 'triple_wave') {
      this.playDir(`${this.animPrefix}_idle`);
      this.explodeWarnStart = this.scene.time.now;
      if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
      this.stateTimer?.destroy();
      // Switch to attack pose ~250ms before firing
      this.scene.time.delayedCall(MinionSlime.TRIPLE_WAVE_WARN_MS - 250, () => {
        if (this.mState === MinionState.TRIPLE_WARN) this.playDir(`${this.animPrefix}_attack`);
      });
      this.stateTimer = this.scene.time.delayedCall(MinionSlime.TRIPLE_WAVE_WARN_MS, () => {
        this.warnCircleGfx?.clear();
        this.applyBaseTint();
        this.onFire?.('triple_wave', this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
        this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_TRIPLE_WAVE + Phaser.Math.Between(0, 800));
        this.enterIdle();
      });
    } else {
      this.playDir(`${this.animPrefix}_attack`);
      this.setTint(
        this.attackMode === 'blood_burst' ? 0xcc0033 :
        this.attackMode === 'orbit_burst' ? 0x990044 :
        0xaa00ff,
      );
      this.stateTimer?.destroy();
      const warnMs =
        this.attackMode === 'blood_burst' ? MinionSlime.BURST_WARN_MS       :
        this.attackMode === 'orbit_burst' ? MinionSlime.ORBIT_BURST_WARN_MS :
        200;
      this.stateTimer = this.scene.time.delayedCall(warnMs, () => {
        this.applyBaseTint();
        const type: 'blood_burst' | 'orbit_burst' | 'triple' =
          this.attackMode === 'blood_burst' ? 'blood_burst' :
          this.attackMode === 'orbit_burst' ? 'orbit_burst' :
          'triple';
        this.onFire?.(type, this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
        const cd =
          this.attackMode === 'blood_burst' ? MinionSlime.COOLDOWN_BURST       :
          this.attackMode === 'orbit_burst' ? MinionSlime.COOLDOWN_ORBIT_BURST :
          MinionSlime.COOLDOWN_TRIPLE;
        this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? cd + Phaser.Math.Between(0, 800));
        this.enterIdle();
      });
    }
  }

  private enterExplodeWarn(): void {
    this.mState = MinionState.EXPLODE_WARN;
    this.pb.setVelocity(0, 0);
    this.updateDir();
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xff0000);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.EXPLODE_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.onFire?.('explode', this.x / DPR, this.y / DPR, this.x / DPR, this.y / DPR);
      this.attackCooldownUntil = this.scene.time.now + MinionSlime.COOLDOWN_EXPLODE + Phaser.Math.Between(0, 800);
      this.enterIdle();
    });
  }

  private enterSpikeWarn(): void {
    this.mState = MinionState.SPIKE_WARN;
    this.pb.setVelocity(0, 0);
    this.updateDir();
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xffcc00);
    const [tx, ty] = this.getTargetPos();
    this.onFire?.('spike', this.x / DPR, this.y / DPR, tx / DPR, ty / DPR);
    this.stateTimer?.destroy();
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.SPIKE_WARN_MS, () => {
      this.applyBaseTint();
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_SPIKE + Phaser.Math.Between(0, 800));
      this.enterIdle();
    });
  }

  private enterArcWarn(): void {
    this.mState = MinionState.ARC_WARN;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);
    this.setTint(0xff3300);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    this.scene.time.delayedCall(MinionSlime.ARC_WARN_MS - 250, () => {
      if (this.mState !== MinionState.ARC_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.ARC_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.onFire?.('arc_slash', this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_ARC + Phaser.Math.Between(0, 600));
      const onDone = () => { if (this.mState === MinionState.ARC_WARN) this.enterIdle(); };
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
      this.stateTimer = this.scene.time.delayedCall(750, () => { this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone); if (this.mState === MinionState.ARC_WARN) this.enterIdle(); });
    });
  }

  private enterLeapWarn(): void {
    this.mState = MinionState.LEAP_WARN;
    this.pb.setVelocity(0, 0);
    [this.leapTargetX, this.leapTargetY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();

    const travelMs = 420;
    const jumpH    = Math.round(55 * DPR);

    // 蓄力結束後起跳
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.LEAP_WARN_MS - travelMs, () => {
      if (this.mState !== MinionState.LEAP_WARN) return;
      const startX = this.x, startY = this.y;
      const endX = this.leapTargetX, endY = this.leapTargetY;
      this.playDir(`${this.animPrefix}_run`);
      this.setDepth(80);  // 飛在空中顯示在最上層
      const p = { t: 0 };
      let attackAnimPlayed = false;
      this.scene.tweens.add({
        targets: p,
        t: 1,
        duration: travelMs,
        ease: 'Linear',
        onUpdate: () => {
          const t   = p.t;
          const nx  = startX + (endX - startX) * t;
          const ny  = startY + (endY - startY) * t - jumpH * Math.sin(t * Math.PI);
          this.setPosition(nx, ny);
          this.pb.velocity.set(0, 0);
          if (t >= 0.55 && !attackAnimPlayed) {
            attackAnimPlayed = true;
            this.playDir(`${this.animPrefix}_attack`);
          }
        },
        onComplete: () => {
          if (this.mState !== MinionState.LEAP_WARN) return;
          this.setPosition(endX, endY);
          this.setDepth(0);
          this.warnCircleGfx?.clear();
          this.applyBaseTint();
          this.onFire?.('leap_slam', endX / DPR, endY / DPR, endX / DPR, endY / DPR);
          this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_LEAP + Phaser.Math.Between(0, 600));
          const onDone = () => { if (this.mState === MinionState.LEAP_WARN) this.enterIdle(); };
          this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
          this.stateTimer = this.scene.time.delayedCall(750, () => { this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone); if (this.mState === MinionState.LEAP_WARN) this.enterIdle(); });
        },
      });
    });
  }

  private enterSpinWarn(): void {
    this.mState = MinionState.SPIN_WARN;
    this.pb.setVelocity(0, 0);
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);   // 蓄力
    this.setTint(0xffaa00);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    // 旋轉前切 attack
    this.scene.time.delayedCall(MinionSlime.SPIN_WARN_MS - 280, () => {
      if (this.mState !== MinionState.SPIN_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.SPIN_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.onFire?.('spin_slash', this.x / DPR, this.y / DPR, this.x / DPR, this.y / DPR);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_SPIN + Phaser.Math.Between(0, 600));
      const onDone = () => { if (this.mState === MinionState.SPIN_WARN) this.enterIdle(); };
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
      this.stateTimer = this.scene.time.delayedCall(750, () => { this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone); onDone(); });
    });
  }

  private enterCrackWarn(): void {
    this.mState = MinionState.CRACK_WARN;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);   // 蓄力
    // 砸地前切 attack
    this.scene.time.delayedCall(MinionSlime.CRACK_WARN_MS - 300, () => {
      if (this.mState !== MinionState.CRACK_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });
    this.setTint(0xaa4400);
    this.stateTimer?.destroy();
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.CRACK_WARN_MS, () => {
      this.applyBaseTint();
      this.onFire?.('ground_crack', this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_CRACK + Phaser.Math.Between(0, 600));
      const onDone = () => { if (this.mState === MinionState.CRACK_WARN) this.enterIdle(); };
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone);
      this.stateTimer = this.scene.time.delayedCall(750, () => { this.off(Phaser.Animations.Events.ANIMATION_COMPLETE, onDone); onDone(); });
    });
  }

  private enterWhirlWarn(): void {
    this.mState = MinionState.WHIRL_WARN;
    this.pb.setVelocity(0, 0);
    [this.whirlTargetX, this.whirlTargetY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);
    this.setTint(0xff2200);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.WHIRL_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.enterWhirling();
    });
  }

  private enterWhirling(): void {
    this.mState = MinionState.WHIRLING;
    [this.whirlTargetX, this.whirlTargetY] = this.getTargetPos();
    this.onFire?.('whirl_slash', this.x / DPR, this.y / DPR, this.whirlTargetX / DPR, this.whirlTargetY / DPR);
    const whirlKey = `${this.animPrefix}_whirl`;
    if (this.scene.anims.exists(whirlKey)) this.anims.play(whirlKey, true);
    else this.playDir(`${this.animPrefix}_attack`);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.whirlTargetX, this.whirlTargetY);
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
      Phaser.Math.RadToDeg(angle), MinionSlime.WHIRL_SPEED, this.pb.velocity,
    );
    this.stateTimer?.destroy();
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.WHIRL_DURATION, () => {
      this.pb.setVelocity(0, 0);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_WHIRL);
      this.enterIdle();
    });
  }

  private enterMeteorWarn(): void {
    this.mState = MinionState.METEOR_WARN;
    this.pb.setVelocity(0, 0);
    [this.meteorTargetX, this.meteorTargetY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);
    this.setTint(0xff5500);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    this.scene.time.delayedCall(MinionSlime.METEOR_WARN_MS - 280, () => {
      if (this.mState !== MinionState.METEOR_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.METEOR_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.onFire?.('meteor', this.x / DPR, this.y / DPR, this.meteorTargetX / DPR, this.meteorTargetY / DPR);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_METEOR + Phaser.Math.Between(0, 800));
      this.enterIdle();
    });
  }

  private enterLightningWarn(): void {
    this.mState = MinionState.LIGHTNING_WARN;
    this.pb.setVelocity(0, 0);
    const [tx, ty] = this.getTargetPos();
    // 在玩家旁邊偏移一段距離，既不正踩在腳下也不太遠，限制走位
    const offsetAngle = Math.random() * Math.PI * 2;
    const offsetDist  = P(Phaser.Math.Between(65, 105));
    this.atkX = tx + Math.cos(offsetAngle) * offsetDist;
    this.atkY = ty + Math.sin(offsetAngle) * offsetDist;
    this.updateDir();
    this.playDir(`${this.animPrefix}_idle`);
    this.setTint(0x8844ff);
    this.explodeWarnStart = this.scene.time.now;
    if (!this.warnCircleGfx) this.warnCircleGfx = this.scene.add.graphics().setDepth(5);
    this.stateTimer?.destroy();
    this.scene.time.delayedCall(MinionSlime.LIGHTNING_RING_WARN_MS - 260, () => {
      if (this.mState !== MinionState.LIGHTNING_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.LIGHTNING_RING_WARN_MS, () => {
      this.warnCircleGfx?.clear();
      this.applyBaseTint();
      this.onFire?.('lightning_ring', this.x / DPR, this.y / DPR, this.atkX / DPR, this.atkY / DPR);
      this.attackCooldownUntil = this.scene.time.now + (this.attackCooldownMs ?? MinionSlime.COOLDOWN_LIGHTNING_RING + Phaser.Math.Between(0, 800));
      this.enterIdle();
    });
  }

  private enterDashing(): void {
    this.mState = MinionState.DASHING;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.clearTint();
    this.setTint(0xff8800);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const deg   = Phaser.Math.RadToDeg(angle);
    if      (deg > -45  && deg <= 45)   this.dir = 'right';
    else if (deg > 45   && deg <= 135)  this.dir = 'down';
    else if (deg > 135  || deg <= -135) this.dir = 'left';
    else                                 this.dir = 'up';
    this.playDir(`${this.animPrefix}_run`);
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
      deg, MinionSlime.DASH_SPEED,
      this.pb.velocity,
    );
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.DASH_MS, () => {
      this.pb.setVelocity(0, 0);
      this.anims.timeScale = 1;
      this.applyBaseTint();
      this.enterIdle();
    });
  }

  forceKill(): void { this.die(); }

  private die(): void {
    this.mState = MinionState.DEAD;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.pb.setVelocity(0, 0);
    this.applyBaseTint();
    this.warnCircleGfx?.clear();
    this.warnCircleGfx?.destroy();
    this.warnCircleGfx = undefined;
    this.hpBarGfx.destroy();
    this.debuffGfx.destroy();
    this.debuffTexts.forEach(t => t.destroy());
    this.debuffTexts.clear();
    this.playDir(`${this.animPrefix}_death`);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.setActive(false).setVisible(false);
      this.onDead?.();
    });
  }

  // ── Helpers ─────────────────────────────────────────

  private updateDir(): void {
    const [tx, ty] = this.getTargetPos();
    this.updateDirTo(tx, ty);
  }

  private updateDirTo(tx: number, ty: number): void {
    const dx = tx - this.x, dy = ty - this.y;
    this.dir = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up'   : 'down');
  }

  private playDir(base: string): void {
    const key = `${base}_${this.dir}`;
    this.play(this.scene.anims.exists(key) ? key : `${base}_down`, true);
  }

  // 停下時確保切換到 idle（避免停著卻播 walk/run）
  private ensureIdleAnim(prevDir: typeof this.dir): void {
    const cur = this.anims.currentAnim?.key ?? '';
    if (this.dir !== prevDir || cur.includes('_walk_') || cur.includes('_run_')) {
      this.playDir(`${this.animPrefix}_idle`);
    }
  }

  // 移動時確保切換到 walk（避免方向未變時 idle 動畫卡住）
  private ensureWalkAnim(prevDir: typeof this.dir): void {
    const cur = this.anims.currentAnim?.key ?? '';
    if (this.dir !== prevDir || cur.includes('_idle_')) {
      this.playDir(`${this.animPrefix}_${this.walkAnim}`);
    }
  }

  // ── preUpdate: chase + HP bar ────────────────────────

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.started || this.mState === MinionState.DEAD) return;

    // 暈眩：凍結所有行動
    if (time < this.stunUntil) {
      this.pb.setVelocity(0, 0);
      this.drawHpBar();
      return;
    }

    if (this.mState === MinionState.PATROL) {
      const [tx, ty] = this.getTargetPos();
      // 只在走回家之後才允許重新 aggro，避免抖動
      if (!this.isReturning && Phaser.Math.Distance.Between(this.x, this.y, tx, ty) <= this.aggroRange) {
        this.stateTimer?.destroy();
        this.stateTimer = undefined;
        this.enterIdle();
        return;
      }
      const dtx = this.patrolTargetX, dty = this.patrolTargetY;
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, dtx, dty);
      if (distToTarget > 14) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, dtx, dty);
        const moveSpd = this.isReturning ? Math.round(220 * DPR) : 50;
        (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
          Phaser.Math.RadToDeg(angle), moveSpd, this.pb.velocity,
        );
        const prevDir = this.dir;
        this.updateDirTo(dtx, dty);
        if (this.dir !== prevDir) this.playDir(`${this.animPrefix}_${this.walkAnim}`);
      } else {
        this.pb.setVelocity(0, 0);
        this.isReturning = false; // 已回到家，可以重新 aggro
        // 到達目標點後若還沒開始計時，稍等後挑下一個巡邏點
        if (!this.stateTimer) {
          this.stateTimer = this.scene.time.delayedCall(Phaser.Math.Between(400, 1200), () => {
            if (this.mState === MinionState.PATROL) this.pickPatrolTarget();
          });
        }
      }
    }

    if (this.mState === MinionState.IDLE) {
      const [tx, ty] = this.getTargetPos();
      const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);

      const distFromHome = Phaser.Math.Distance.Between(this.patrolCenter.x, this.patrolCenter.y, tx, ty);
      if (dist > this.deaggroRange || distFromHome > this.leashRange) { this.enterPatrol(); return; }

      const body    = this.pb;
      const prevDir = this.dir;
      this.updateDir();

      if (this.attackMode === 'dash') {
        if (dist <= MinionSlime.STOP_RANGE) {
          body.setVelocity(0, 0);
          this.ensureIdleAnim(prevDir);
        } else {
          const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
          (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
            Phaser.Math.RadToDeg(angle), MinionSlime.CHASE_SPEED * this.slowMult, body.velocity,
          );
          this.ensureWalkAnim(prevDir);
        }
      } else {
        // Ranged / melee-area: stop at attack range, attack when cooldown elapsed
        const attackRange =
          this.attackMode === 'explode'     ? MinionSlime.EXPLODE_RANGE :
          this.attackMode === 'arc_slash'   ? MinionSlime.ARC_RANGE     :
          this.attackMode === 'spin_slash'  ? MinionSlime.SPIN_RANGE    :
          this.attackMode === 'leap_slam'   ? MinionSlime.LEAP_RANGE    :
          this.attackMode === 'ground_crack'? MinionSlime.CRACK_RANGE   :
          this.attackMode === 'whirl_slash' ? MinionSlime.WHIRL_RANGE   :
          this.rangedRange;
        if (dist <= attackRange) {
          body.setVelocity(0, 0);
          this.ensureIdleAnim(prevDir);
          if (time >= this.attackCooldownUntil) {
            if      (this.attackMode === 'shoot'  || this.attackMode === 'blade_wave'  || this.attackMode === 'blood_needle' || this.attackMode === 'triple_needle') this.enterShootWarn();
            else if (this.attackMode === 'triple' || this.attackMode === 'triple_wave' || this.attackMode === 'blood_burst'  || this.attackMode === 'orbit_burst')   this.enterTripleWarn();
            else if (this.attackMode === 'explode')      this.enterExplodeWarn();
            else if (this.attackMode === 'spike')        this.enterSpikeWarn();
            else if (this.attackMode === 'arc_slash')    this.enterArcWarn();
            else if (this.attackMode === 'leap_slam')    this.enterLeapWarn();
            else if (this.attackMode === 'spin_slash')   this.enterSpinWarn();
            else if (this.attackMode === 'ground_crack') this.enterCrackWarn();
            else if (this.attackMode === 'whirl_slash')  this.enterWhirlWarn();
            else if (this.attackMode === 'meteor')         this.enterMeteorWarn();
            else if (this.attackMode === 'lightning_ring') this.enterLightningWarn();
          }
        } else if (!this.stationary) {
          const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
          (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
            Phaser.Math.RadToDeg(angle), MinionSlime.CHASE_SPEED * this.slowMult, body.velocity,
          );
          this.ensureWalkAnim(prevDir);
        } else {
          body.setVelocity(0, 0);
          this.ensureIdleAnim(prevDir);
        }
      }
    }

    // Explode warn circle — drawn every frame while warning
    if (this.mState === MinionState.EXPLODE_WARN && this.warnCircleGfx) {
      const elapsed = time - this.explodeWarnStart;
      const urgency = 1 + (elapsed / MinionSlime.EXPLODE_WARN_MS) * 3;
      const pulse   = Math.sin(elapsed * 0.015 * urgency) * 0.25 + 0.55;
      const R       = Math.round(MinionSlime.EXPLODE_RADIUS * this.explodeRadiusMult);
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xff0000, pulse * 0.35);
      this.warnCircleGfx.fillCircle(this.x, this.y, R);
      this.warnCircleGfx.lineStyle(P(2), 0xff4400, 0.5 + pulse * 0.5);
      this.warnCircleGfx.strokeCircle(this.x, this.y, R);
    }

    // Leap warn circle at target landing spot
    if (this.mState === MinionState.LEAP_WARN && this.warnCircleGfx && time < this.explodeWarnStart + MinionSlime.LEAP_WARN_MS) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.012) * 0.3 + 0.6;
      const R       = Math.round(MinionSlime.EXPLODE_RADIUS * 1.8);
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xff6600, pulse * 0.28);
      this.warnCircleGfx.fillCircle(this.leapTargetX, this.leapTargetY, R);
      this.warnCircleGfx.lineStyle(P(2), 0xff4400, 0.5 + pulse * 0.5);
      this.warnCircleGfx.strokeCircle(this.leapTargetX, this.leapTargetY, R);
    }

    // Spin warn circle around self
    if (this.mState === MinionState.SPIN_WARN && this.warnCircleGfx) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.018) * 0.3 + 0.6;
      const R       = Math.round(MinionSlime.SPIN_RANGE * 1.1);
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xffaa00, pulse * 0.28);
      this.warnCircleGfx.fillCircle(this.x, this.y, R);
      this.warnCircleGfx.lineStyle(P(2), 0xff8800, 0.5 + pulse * 0.5);
      this.warnCircleGfx.strokeCircle(this.x, this.y, R);
    }

    // Arc warn cone (90° sector toward target) — 只在蓄力期間繪製
    if (this.mState === MinionState.ARC_WARN && this.warnCircleGfx && time < this.explodeWarnStart + MinionSlime.ARC_WARN_MS) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.016) * 0.3 + 0.6;
      const R       = Math.round(MinionSlime.ARC_RANGE * 2.2);
      const ang     = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
      const spread  = Math.PI * 75 / 360;  // 37.5° each side = 75° total
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xff2200, pulse * 0.32);
      this.warnCircleGfx.beginPath();
      this.warnCircleGfx.moveTo(this.x, this.y);
      this.warnCircleGfx.arc(this.x, this.y, R, ang - spread, ang + spread, false);
      this.warnCircleGfx.closePath();
      this.warnCircleGfx.fillPath();
      this.warnCircleGfx.lineStyle(P(2), 0xff4400, 0.5 + pulse * 0.5);
      this.warnCircleGfx.beginPath();
      this.warnCircleGfx.moveTo(this.x, this.y);
      this.warnCircleGfx.arc(this.x, this.y, R, ang - spread, ang + spread, false);
      this.warnCircleGfx.closePath();
      this.warnCircleGfx.strokePath();
    }

    // Whirl warn — 長方形路徑範圍提示
    if (this.mState === MinionState.WHIRL_WARN && this.warnCircleGfx) {
      const elapsed  = time - this.explodeWarnStart;
      const pulse    = Math.sin(elapsed * 0.018) * 0.3 + 0.6;
      const ang      = Phaser.Math.Angle.Between(this.x, this.y, this.whirlTargetX, this.whirlTargetY);
      const len      = Math.round(MinionSlime.WHIRL_SPEED * MinionSlime.WHIRL_DURATION / 1000);
      const halfW    = Math.round((this.isElite ? 36 : 28) * DPR);
      const cos      = Math.cos(ang),      sin      = Math.sin(ang);
      const pCos     = Math.cos(ang + Math.PI / 2), pSin = Math.sin(ang + Math.PI / 2);
      const x0 = this.x, y0 = this.y;
      const pts = [
        { x: x0 + pCos * halfW,           y: y0 + pSin * halfW },
        { x: x0 + cos * len + pCos * halfW, y: y0 + sin * len + pSin * halfW },
        { x: x0 + cos * len - pCos * halfW, y: y0 + sin * len - pSin * halfW },
        { x: x0 - pCos * halfW,           y: y0 - pSin * halfW },
      ];
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xff2200, pulse * 0.28);
      this.warnCircleGfx.fillPoints(pts, true);
      this.warnCircleGfx.lineStyle(P(2), 0xff4400, 0.5 + pulse * 0.5);
      this.warnCircleGfx.strokePoints(pts, true);
    }

    // Triple wave fan warning — 3 red rays at ±35°
    if (this.mState === MinionState.TRIPLE_WARN && this.attackMode === 'triple_wave' && this.warnCircleGfx) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.016) * 0.3 + 0.6;
      const R       = Math.round(160 * DPR);
      const baseAng = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
      const spread  = Math.PI * 35 / 180;
      const halfW   = Math.PI * 8  / 180;
      this.warnCircleGfx.clear();
      for (const offset of [-spread, 0, spread]) {
        const ang = baseAng + offset;
        this.warnCircleGfx.fillStyle(0xff2200, pulse * 0.30);
        this.warnCircleGfx.beginPath();
        this.warnCircleGfx.moveTo(this.x, this.y);
        this.warnCircleGfx.arc(this.x, this.y, R, ang - halfW, ang + halfW, false);
        this.warnCircleGfx.closePath();
        this.warnCircleGfx.fillPath();
        this.warnCircleGfx.lineStyle(P(2), 0xff4400, 0.5 + pulse * 0.5);
        this.warnCircleGfx.beginPath();
        this.warnCircleGfx.moveTo(this.x, this.y);
        this.warnCircleGfx.arc(this.x, this.y, R, ang - halfW, ang + halfW, false);
        this.warnCircleGfx.closePath();
        this.warnCircleGfx.strokePath();
      }
    }

    // Triple needle fan — 3 rays at -30°, 0°, +30° toward target
    if (this.mState === MinionState.SHOOT_WARN && this.attackMode === 'triple_needle' && this.warnCircleGfx) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.020) * 0.28 + 0.62;
      const R       = (Phaser.Math.Distance.Between(this.x, this.y, this.atkX, this.atkY) || P(190)) + P(70);
      const baseAng = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
      const spread  = Math.PI / 6;
      const halfW   = Math.PI * 5.5 / 180;
      this.warnCircleGfx.clear();
      for (const offset of [-spread, 0, spread]) {
        const ang = baseAng + offset;
        this.warnCircleGfx.fillStyle(0xcc0022, pulse * 0.26);
        this.warnCircleGfx.beginPath();
        this.warnCircleGfx.moveTo(this.x, this.y);
        this.warnCircleGfx.arc(this.x, this.y, R, ang - halfW, ang + halfW, false);
        this.warnCircleGfx.closePath();
        this.warnCircleGfx.fillPath();
        this.warnCircleGfx.lineStyle(P(1.5), 0xff4455, 0.5 + pulse * 0.5);
        this.warnCircleGfx.beginPath();
        this.warnCircleGfx.moveTo(this.x, this.y);
        this.warnCircleGfx.arc(this.x, this.y, R, ang - halfW, ang + halfW, false);
        this.warnCircleGfx.closePath();
        this.warnCircleGfx.strokePath();
      }
    }

    // Meteor warn — pulsing crosshair drawn at target landing zone
    if (this.mState === MinionState.METEOR_WARN && this.warnCircleGfx) {
      const elapsed = time - this.explodeWarnStart;
      const pulse   = Math.sin(elapsed * 0.015) * 0.30 + 0.70;
      const R       = Math.round(28 * DPR);
      this.warnCircleGfx.clear();
      this.warnCircleGfx.fillStyle(0xff3300, pulse * 0.32);
      this.warnCircleGfx.fillCircle(this.meteorTargetX, this.meteorTargetY, R);
      this.warnCircleGfx.lineStyle(P(2), 0xff6600, 0.5 + pulse * 0.5);
      this.warnCircleGfx.strokeCircle(this.meteorTargetX, this.meteorTargetY, R);
      const cr = Math.round(R * 0.55);
      this.warnCircleGfx.lineStyle(P(1.5), 0xff9900, 0.70 * pulse);
      this.warnCircleGfx.beginPath();
      this.warnCircleGfx.moveTo(this.meteorTargetX - cr, this.meteorTargetY);
      this.warnCircleGfx.lineTo(this.meteorTargetX + cr, this.meteorTargetY);
      this.warnCircleGfx.strokePath();
      this.warnCircleGfx.beginPath();
      this.warnCircleGfx.moveTo(this.meteorTargetX, this.meteorTargetY - cr);
      this.warnCircleGfx.lineTo(this.meteorTargetX, this.meteorTargetY + cr);
      this.warnCircleGfx.strokePath();
    }

    this.drawHpBar();
  }

  private drawHpBar(): void {
    this.hpBarGfx.clear();
    if (!this.visible) return;
    const pct = this.hp / this.maxHp;

    if (this.isAlly) {
      // 友軍：綠色血條
      const bw = P(30), bh = P(4);
      const bx = this.x - bw / 2;
      const by = this.y - P(32);
      this.hpBarGfx.fillStyle(0x002200, 0.85);
      this.hpBarGfx.fillRect(bx, by, bw, bh);
      const color = pct > 0.5 ? 0x44ee44 : pct > 0.25 ? 0x88cc00 : 0x226600;
      this.hpBarGfx.fillStyle(color);
      this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
      this.hpBarGfx.lineStyle(P(1), 0x88ff88, 0.7);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
      this.drawDebuffIcons(this.x, by + bh + P(9));
    } else if (this.isElite) {
      // 菁英：紅色血條 + 金色外框
      const bw = P(44), bh = P(6);
      const bx = this.x - bw / 2;
      const by = this.y - P(38);
      this.hpBarGfx.fillStyle(0x1a0000, 0.9);
      this.hpBarGfx.fillRect(bx, by, bw, bh);
      const color = pct > 0.5 ? 0xee2222 : pct > 0.25 ? 0xcc1111 : 0x880000;
      this.hpBarGfx.fillStyle(color);
      this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
      this.hpBarGfx.lineStyle(P(2), 0xddaa00, 1);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
      this.hpBarGfx.lineStyle(P(1), 0xffffff, 0.2);
      this.hpBarGfx.lineBetween(bx + P(1), by + P(1), bx + bw * pct - P(1), by + P(1));
      this.drawDebuffIcons(this.x, by + bh + P(9));
    } else {
      // 一般小怪：紅色血條
      const bw = P(30), bh = P(4);
      const bx = this.x - bw / 2;
      const by = this.y - P(32);
      this.hpBarGfx.fillStyle(0x1a0000, 0.8);
      this.hpBarGfx.fillRect(bx, by, bw, bh);
      const color = pct > 0.5 ? 0xee2222 : pct > 0.25 ? 0xcc1111 : 0x880000;
      this.hpBarGfx.fillStyle(color);
      this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
      this.hpBarGfx.lineStyle(P(1), 0x000000, 0.5);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
      this.drawDebuffIcons(this.x, by + bh + P(9));
    }
  }

  // ── Debuff icon system ───────────────────────────────
  // Each debuff occupies one icon slot (14px wide). Add new debuffs here.

  private drawDebuffIcons(cx: number, cy: number): void {
    this.debuffGfx.clear();
    const now = this.scene.time.now;
    let slot  = 0;

    if (this.burnStacks > 0 && now < this.burnExpiresAt) {
      this.drawDebuffIcon(cx + slot * P(16) - P(8), cy, 'burn', 0xff4400, 0x220800);
      this.updateDebuffText('burn', cx + slot * P(16) - P(8), cy, `${this.burnStacks}`);
      slot++;
    } else {
      this.hideDebuffText('burn');
    }

    if (now < this.stunUntil) {
      this.drawDebuffIcon(cx + slot * P(16) - P(8), cy, 'stun', 0xffdd00, 0x332200);
      this.updateDebuffText('stun', cx + slot * P(16) - P(8), cy, '★');
      slot++;
    } else {
      this.hideDebuffText('stun');
    }

    // hide texts for any slots beyond what's active
    if (slot === 0) this.debuffGfx.clear();
  }

  private drawDebuffIcon(cx: number, cy: number, key: string, rimColor: number, bgColor: number): void {
    const r = P(7);
    // outer glow
    this.debuffGfx.fillStyle(rimColor, 0.3);
    this.debuffGfx.fillCircle(cx, cy, r + P(2));
    // background
    this.debuffGfx.fillStyle(bgColor, 0.92);
    this.debuffGfx.fillCircle(cx, cy, r);
    // rim
    this.debuffGfx.lineStyle(P(1), rimColor, 0.9);
    this.debuffGfx.strokeCircle(cx, cy, r);
    // flame shape
    if (key === 'burn') this.drawFlameShape(cx, cy, r);
  }

  private drawFlameShape(cx: number, cy: number, r: number): void {
    const s = r * 0.55;
    const t = this.scene.time.now / 220;
    const wobble = Math.sin(t) * 0.5;
    // outer flame body (orange)
    this.debuffGfx.fillStyle(0xff6600, 1);
    this.debuffGfx.fillTriangle(
      cx - s + wobble, cy + s,
      cx + s + wobble, cy + s,
      cx,              cy - s * 1.3,
    );
    // inner flame tip (yellow)
    this.debuffGfx.fillStyle(0xffdd00, 1);
    this.debuffGfx.fillTriangle(
      cx - s * 0.45, cy + s * 0.4,
      cx + s * 0.45, cy + s * 0.4,
      cx,            cy - s * 1.1,
    );
  }

  private updateDebuffText(key: string, cx: number, cy: number, label: string): void {
    let txt = this.debuffTexts.get(key);
    if (!txt) {
      txt = this.scene.add.text(0, 0, '', {
        fontSize:        F(10),
        color:           '#ffffff',
        stroke:          '#000000',
        strokeThickness: P(2),
        fontStyle:       'bold',
      }).setDepth(52).setOrigin(0.5, 0.5);
      this.debuffTexts.set(key, txt);
    }
    txt.setPosition(cx, cy + P(5)).setText(label).setVisible(true);
  }

  private hideDebuffText(key: string): void {
    this.debuffTexts.get(key)?.setVisible(false);
  }

  override destroy(fromScene?: boolean): void {
    this.warnCircleGfx?.destroy();
    this.hpBarGfx?.destroy();
    this.debuffGfx?.destroy();
    this.debuffTexts.forEach(t => t.destroy());
    this.debuffTexts.clear();
    super.destroy(fromScene);
  }
}
