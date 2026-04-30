import Phaser from 'phaser';

export enum BossState {
  IDLE        = 'IDLE',
  AOE_WARN    = 'AOE_WARN',
  AOE_EXPLODE = 'AOE_EXPLODE',
  DASH_WARN   = 'DASH_WARN',
  DASHING     = 'DASHING',
  DEAD        = 'DEAD',
}

export class Boss extends Phaser.Physics.Arcade.Sprite {
  private hp: number;
  private readonly maxHp: number;
  // Renamed from 'state' — Phaser.GameObject already has a public 'state' property
  private bossState = BossState.IDLE;
  private bossDir: 'down' | 'left' | 'right' | 'up' = 'down';
  private stateTimer?: Phaser.Time.TimerEvent;
  private pulseTween?: Phaser.Tweens.Tween;
  private dashTrailTimer?: Phaser.Time.TimerEvent;
  private dashTrailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private warnParticles?: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly warningGfx: Phaser.GameObjects.Graphics;

  private atkX = 0;
  private atkY = 0;
  private dashAngle = 0;

  static readonly AOE_RADIUS = 90;
  static readonly DASH_SPEED = 460;
  private static readonly DASH_MS = 620;

  getTargetPos: () => [number, number] = () => [0, 0];

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;
  onAoeExplode?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp = 500) {
    super(scene, x, y, 'slime_idle_down', 0);
    this.hp = totalHp;
    this.maxHp = totalHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCollideWorldBounds(true);
    this.setDepth(12);
    this.setScale(2);
    // Body in unscaled coords — slime occupies lower-center of 64×64 frame
    body.setSize(30, 24).setOffset(17, 36);
    this.warningGfx = scene.add.graphics().setDepth(8);
  }

  start(): void {
    this.enterIdle();
  }

  knockback(fromX: number, fromY: number, power = 110): void {
    if (this.bossState === BossState.DEAD || this.bossState === BossState.DASHING) return;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const body  = this.body as Phaser.Physics.Arcade.Body;
    this.scene.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), power, body.velocity);
    this.scene.time.delayedCall(220, () => {
      if (this.bossState !== BossState.DASHING) body.setVelocity(0, 0);
    });
  }

  takeDamage(amount: number): void {
    if (this.bossState === BossState.DEAD) return;
    this.hp = Math.max(0, this.hp - amount);
    this.onHpChanged?.(this.hp, this.maxHp);

    this.playDir('slime_hurt');
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (this.bossState !== BossState.DEAD) this.resumeStateAnim();
    });

    if (this.hp <= 0) this.die();
  }

  private resumeStateAnim(): void {
    switch (this.bossState) {
      case BossState.IDLE:      this.playDir('slime_idle');   break;
      case BossState.AOE_WARN:  this.playDir('slime_attack'); break;
      case BossState.DASH_WARN: this.playDir('slime_walk');   break;
      case BossState.DASHING:   this.playDir('slime_run');    break;
      default: break;
    }
  }

  get currentState(): BossState { return this.bossState; }
  get currentHp(): number { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }

  private updateDirToTarget(): void {
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

  private playDir(base: string): void {
    this.play(`${base}_${this.bossDir}`, true);
  }

  // ── State Machine ─────────────────────────────────────

  private enterIdle(): void {
    this.bossState = BossState.IDLE;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.clearWarning();
    this.stopDashTrail();
    this.clearTint();
    this.setScale(2);
    this.stateTimer?.destroy();
    this.updateDirToTarget();
    this.playDir('slime_idle');
    this.stateTimer = this.scene.time.delayedCall(2000, () => this.enterAoeWarn());
  }

  private enterAoeWarn(): void {
    this.bossState = BossState.AOE_WARN;
    this.stateTimer?.destroy();
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDirToTarget();
    this.playDir('slime_attack');
    this.drawAoeWarning();

    // Embers rising from the target zone during warning
    this.warnParticles = this.scene.add.particles(this.atkX, this.atkY, 'pxl2', {
      speed: { min: 20, max: 65 },
      angle: { min: 255, max: 285 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff6600, 0xff8800, 0xffaa00, 0xffdd44],
      lifespan: { min: 500, max: 1100 },
      frequency: 40,
      quantity: 2,
      gravityY: -25,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, Boss.AOE_RADIUS * 0.78),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(9);

    this.stateTimer = this.scene.time.delayedCall(1500, () => this.enterAoeExplode());
  }

  private enterAoeExplode(): void {
    this.bossState = BossState.AOE_EXPLODE;
    this.clearWarning();
    this.spawnAoeExplosion(this.atkX, this.atkY);
    this.onAoeExplode?.(this.atkX, this.atkY);
    this.stateTimer = this.scene.time.delayedCall(500, () => this.enterDashWarn());
  }

  private enterDashWarn(): void {
    this.bossState = BossState.DASH_WARN;
    this.stateTimer?.destroy();
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDirToTarget();
    this.playDir('slime_walk');
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
      frequency: 45,
      quantity: 3,
    }).setDepth(9);

    this.stateTimer = this.scene.time.delayedCall(1000, () => this.enterDashing());
  }

  private enterDashing(): void {
    this.bossState = BossState.DASHING;
    this.clearWarning();
    this.stateTimer?.destroy();
    this.setScale(2);
    this.play('slime_walk', true);
    this.anims.timeScale = 2.2;  // faster run animation during dash
    this.setTint(0xff8800);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    this.dashAngle = angle;
    this.updateDirFromAngle(angle);
    this.playDir('slime_run');
    this.scene.physics.velocityFromAngle(
      Phaser.Math.RadToDeg(angle),
      Boss.DASH_SPEED,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );

    this.startDashTrail();

    this.stateTimer = this.scene.time.delayedCall(Boss.DASH_MS, () => {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.anims.timeScale = 1;
      this.stopDashTrail();
      this.spawnDashImpact(this.x, this.y);
      this.enterIdle();
    });
  }

  private die(): void {
    this.bossState = BossState.DEAD;
    this.stateTimer?.destroy();
    this.clearWarning();
    this.stopDashTrail();
    this.anims.timeScale = 1;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir('slime_death');
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.scene.tweens.add({
        targets: this,
        alpha: 0,
        scaleX: this.scaleX * 1.4,
        scaleY: this.scaleY * 1.4,
        duration: 700,
        ease: 'Sine.easeOut',
        onComplete: () => {
          this.setActive(false).setVisible(false);
          this.onDead?.();
        },
      });
    });
  }

  // ── Dash Trail ────────────────────────────────────────

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

  // ── Skill VFX ─────────────────────────────────────────

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
    const core = this.scene.add.particles(0, 0, 'pxl2', {
      speed: { min: 280, max: 520 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffff88, 0xffee44],
      lifespan: { min: 100, max: 260 },
      emitting: false,
    }).setDepth(22);
    core.emitParticleAt(cx, cy, 60);
    this.scene.time.delayedCall(320, () => { if (core.active) core.destroy(); });

    // ── Layer 2: fire burst — medium speed, spreads from zone
    const fire = this.scene.add.particles(0, 0, 'pxl2', {
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
        source: new Phaser.Geom.Circle(cx, cy, r * 0.5),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(21);
    fire.emitParticleAt(cx, cy, 55);
    this.scene.time.delayedCall(900, () => { if (fire.active) fire.destroy(); });

    // ── Layer 3: rock debris — heavy gravity ──────────
    const debris = this.scene.add.particles(0, 0, 'pxl', {
      speed: { min: 100, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0x8a9e86, 0x4a5848, 0xaa9977, 0x556655, 0x7a8c78],
      lifespan: { min: 500, max: 1000 },
      gravityY: 300,
      emitting: false,
    }).setDepth(20);
    debris.emitParticleAt(cx, cy, 30);
    this.scene.time.delayedCall(1100, () => { if (debris.active) debris.destroy(); });

    // ── Layer 4: smoke — grey, large, rises slowly ────
    const smoke = this.scene.add.particles(0, 0, 'pxl', {
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
        source: new Phaser.Geom.Circle(cx, cy, r * 0.6),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(18);
    smoke.emitParticleAt(cx, cy, 24);
    this.scene.time.delayedCall(2100, () => { if (smoke.active) smoke.destroy(); });

    // ── Layer 5: embers drift up long after ───────────
    const embers = this.scene.add.particles(0, 0, 'pxl2', {
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
        source: new Phaser.Geom.Circle(cx, cy, r * 0.7),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(20);
    embers.emitParticleAt(cx, cy, 28);
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
    flash.fillCircle(0, 0, 30);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0, scaleX: 2.0, scaleY: 1.4,
      duration: 150,
      onComplete: () => flash.destroy(),
    });

    // Shockwave ring
    const shock = this.scene.add.graphics().setDepth(20).setPosition(cx, cy);
    shock.lineStyle(2, 0xff8800, 0.85);
    shock.strokeCircle(0, 0, 22);
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

  // ── Warning Graphics ──────────────────────────────────

  private drawAoeWarning(): void {
    this.clearWarning();
    const r  = Boss.AOE_RADIUS;
    const cx = this.atkX;
    const cy = this.atkY;

    // ── Interior: sparse 2×2 dot grid ─────────────────────
    this.warningGfx.fillStyle(0xff0000, 0.14);
    for (let dx = -(r - 4); dx <= r - 4; dx += 8) {
      for (let dy = -(r - 4); dy <= r - 4; dy += 8) {
        if (dx * dx + dy * dy <= (r - 8) * (r - 8)) {
          this.warningGfx.fillRect(cx + dx - 1, cy + dy - 1, 2, 2);
        }
      }
    }

    // ── Inner dashed ring (55 % radius) ───────────────────
    const r2 = r * 0.55;
    for (let i = 0; i < 28; i++) {
      if (i % 4 === 3) continue;                  // gap every 4th
      const a = (i / 28) * Math.PI * 2;
      this.warningGfx.fillStyle(0xff3300, 0.50);
      this.warningGfx.fillRect(
        cx + Math.cos(a) * r2 - 2, cy + Math.sin(a) * r2 - 2, 4, 4,
      );
    }

    // ── Outer pixel ring — 4×4 blocks, 8×8 at cardinals ──
    const steps = 48;
    for (let i = 0; i < steps; i++) {
      const isCardinal = i % 12 === 0;            // every 12 steps = 4 cardinals
      const sz  = isCardinal ? 8 : 4;
      const alp = isCardinal ? 1.0 : 0.88;
      const a   = (i / steps) * Math.PI * 2;
      this.warningGfx.fillStyle(0xff1100, alp);
      this.warningGfx.fillRect(
        cx + Math.cos(a) * r - sz / 2,
        cy + Math.sin(a) * r - sz / 2,
        sz, sz,
      );
    }

    // ── Cardinal notch markers ─────────────────────────────
    this.warningGfx.fillStyle(0xff4400, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      // Outer square
      this.warningGfx.fillRect(cx + Math.cos(a) * r - 5,      cy + Math.sin(a) * r - 5,      10, 10);
      // Inward tick
      this.warningGfx.fillRect(cx + Math.cos(a) * (r - 14) - 2, cy + Math.sin(a) * (r - 14) - 2, 4, 4);
    }

    // ── Center target reticle ─────────────────────────────
    this.warningGfx.fillStyle(0xff2200, 0.65);
    this.warningGfx.fillRect(cx - 12, cy - 2, 24, 4);   // horizontal bar
    this.warningGfx.fillRect(cx - 2, cy - 12, 4, 24);   // vertical bar
    // Corner brackets
    this.warningGfx.fillStyle(0xff5500, 0.9);
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.warningGfx.fillRect(cx + sx * 6,        cy + sy * 6 - 1, sx < 0 ? -6 : 6, 2);
      this.warningGfx.fillRect(cx + sx * 6 - 1,    cy + sy * 6,     2, sy < 0 ? -6 : 6);
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
    const rawLen  = Phaser.Math.Distance.Between(this.x, this.y, this.atkX, this.atkY);
    const len     = Math.min(rawLen + 40, 340);

    // ── Center dotted dashes ──────────────────────────────
    this.warningGfx.fillStyle(0xff3300, 0.45);
    for (let d = 22; d < len; d += 11) {
      this.warningGfx.fillRect(this.x + cos * d - 2, this.y + sin * d - 2, 4, 4);
    }

    // ── 3 pixel chevron arrows ────────────────────────────
    const numChev  = 3;
    const chevHW   = 20;   // chevron half-width (px)
    const chevD    = 16;   // forward depth of chevron tip

    for (let c = 0; c < numChev; c++) {
      const dist = 44 + c * 68;
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
        this.warningGfx.fillRect(bx + cos * fd + pc * hw - 3, by + sin * fd + ps * hw - 3, 6, 6);
        // Right arm (skip centre overlap at tip)
        if (s < segs) {
          this.warningGfx.fillRect(bx + cos * fd - pc * hw - 3, by + sin * fd - ps * hw - 3, 6, 6);
        }
      }
      // Bright tip pixel
      this.warningGfx.fillStyle(0xff6600, alpha);
      this.warningGfx.fillRect(bx + cos * chevD - 4, by + sin * chevD - 4, 8, 8);
    }

    // ── Start ring at boss feet ───────────────────────────
    this.warningGfx.fillStyle(0xff3300, 0.75);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.warningGfx.fillRect(
        this.x + Math.cos(a) * 18 - 3,
        this.y + Math.sin(a) * 18 - 3,
        6, 6,
      );
    }

    // ── Target cross at destination ───────────────────────
    const tx = this.x + cos * len;
    const ty = this.y + sin * len;
    this.warningGfx.fillStyle(0xff4400, 0.85);
    for (const [ox, oy] of [[-8, 0], [8, 0], [0, -8], [0, 8]]) {
      this.warningGfx.fillRect(tx + ox - 2, ty + oy - 2, 4, 4);
    }
    this.warningGfx.fillStyle(0xff2200, 1);
    this.warningGfx.fillRect(tx - 4, ty - 4, 8, 8);

    this.pulseTween = this.scene.tweens.add({
      targets: this.warningGfx,
      alpha: { from: 1, to: 0.22 },
      duration: 200,
      yoyo: true,
      repeat: -1,
    });
  }

  private clearWarning(): void {
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.warningGfx.clear();
    this.warningGfx.setAlpha(1);
    this.warnParticles?.destroy();
    this.warnParticles = undefined;
  }
}
