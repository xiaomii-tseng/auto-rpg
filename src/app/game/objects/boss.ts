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
  private stateTimer?: Phaser.Time.TimerEvent;
  private pulseTween?: Phaser.Tweens.Tween;
  private breathTween?: Phaser.Tweens.Tween;
  private dashTrailTimer?: Phaser.Time.TimerEvent;
  private dashTrailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;
  private warnParticles?: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly warningGfx: Phaser.GameObjects.Graphics;

  private atkX = 0;
  private atkY = 0;

  static readonly AOE_RADIUS = 90;
  static readonly DASH_SPEED = 460;
  private static readonly DASH_MS = 620;

  getTargetPos: () => [number, number] = () => [0, 0];

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;
  onAoeExplode?: (x: number, y: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp = 500) {
    super(scene, x, y, 'boss');
    this.hp = totalHp;
    this.maxHp = totalHp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    (this.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);
    this.setDepth(12);
    this.warningGfx = scene.add.graphics().setDepth(8);
  }

  start(): void {
    this.enterIdle();
  }

  takeDamage(amount: number): void {
    if (this.bossState === BossState.DEAD) return;
    this.hp = Math.max(0, this.hp - amount);
    this.onHpChanged?.(this.hp, this.maxHp);

    this.setTint(0xff2200);
    this.scene.time.delayedCall(110, () => {
      if (this.bossState !== BossState.DEAD) this.clearTint();
    });

    if (this.hp <= 0) this.die();
  }

  get currentState(): BossState { return this.bossState; }
  get currentHp(): number { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }

  // ── State Machine ─────────────────────────────────────

  private enterIdle(): void {
    this.bossState = BossState.IDLE;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.clearWarning();
    this.stopDashTrail();
    this.clearTint();
    this.setScale(1);
    this.stateTimer?.destroy();
    this.startBreathing();
    this.stateTimer = this.scene.time.delayedCall(2000, () => this.enterAoeWarn());
  }

  private enterAoeWarn(): void {
    this.bossState = BossState.AOE_WARN;
    this.stopBreathing();
    this.stateTimer?.destroy();
    [this.atkX, this.atkY] = this.getTargetPos();

    // Wind-up: boss squishes toward player before casting
    this.scene.tweens.add({
      targets: this,
      scaleX: 1.15,
      scaleY: 0.88,
      duration: 300,
      yoyo: true,
      ease: 'Sine.easeIn',
    });

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
    this.setFlipX(this.atkX < this.x);

    // Wind-up: boss leans back before dashing
    this.scene.tweens.add({
      targets: this,
      scaleX: 0.82,
      scaleY: 1.14,
      duration: 400,
      ease: 'Back.easeOut',
    });

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
    this.setScale(1);

    // Glow orange while dashing
    this.setTint(0xff8800);

    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    this.scene.physics.velocityFromAngle(
      Phaser.Math.RadToDeg(angle),
      Boss.DASH_SPEED,
      (this.body as Phaser.Physics.Arcade.Body).velocity,
    );

    this.startDashTrail();

    this.stateTimer = this.scene.time.delayedCall(Boss.DASH_MS, () => {
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.stopDashTrail();
      // Impact burst at landing position
      this.spawnDashImpact(this.x, this.y);
      this.enterIdle();
    });
  }

  private die(): void {
    this.bossState = BossState.DEAD;
    this.stateTimer?.destroy();
    this.clearWarning();
    this.stopBreathing();
    this.stopDashTrail();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 1.4,
      scaleY: 1.4,
      duration: 900,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.setActive(false).setVisible(false);
        this.onDead?.();
      },
    });
  }

  // ── Breathing Animation ───────────────────────────────

  private startBreathing(): void {
    this.breathTween?.stop();
    this.setScale(1);
    this.breathTween = this.scene.tweens.add({
      targets: this,
      scaleY: { from: 1.0, to: 1.07 },
      scaleX: { from: 1.0, to: 0.94 },
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private stopBreathing(): void {
    this.breathTween?.stop();
    this.breathTween = undefined;
    this.setScale(1);
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
        // Afterimage ghost
        const ghost = this.scene.add.image(this.x, this.y, 'boss')
          .setDepth(11)
          .setAlpha(0.50)
          .setTint(0xff6600)
          .setFlipX(this.flipX);
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

    // Camera shake
    this.scene.cameras.main.shake(220, 0.014);

    // Central flash
    const flash = this.scene.add.graphics().setDepth(19).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 0.92);
    flash.fillCircle(0, 0, r * 0.45);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2.0,
      scaleY: 2.0,
      duration: 300,
      onComplete: () => flash.destroy(),
    });

    // Two expanding rings
    [1.0, 0.55].forEach((scale, i) => {
      const ring = this.scene.add.graphics().setDepth(18).setPosition(cx, cy);
      ring.lineStyle(4 - i * 2, i === 0 ? 0xff8800 : 0xffdd00, 1);
      ring.strokeCircle(0, 0, r * scale);
      this.scene.tweens.add({
        targets: ring,
        alpha: 0,
        scaleX: 1.7,
        scaleY: 1.7,
        duration: 440 + i * 80,
        ease: 'Sine.easeOut',
        onComplete: () => ring.destroy(),
      });
    });

    // Radial spark lines (keep for pixel structure)
    const sparkGfx = this.scene.add.graphics().setDepth(19).setPosition(cx, cy);
    sparkGfx.lineStyle(2, 0xffff88, 1);
    for (let i = 0; i < 10; i++) {
      const a  = (i / 10) * Math.PI * 2;
      const r1 = r * 0.35;
      const r2 = r * 1.1;
      sparkGfx.beginPath();
      sparkGfx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      sparkGfx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      sparkGfx.strokePath();
    }
    this.scene.tweens.add({
      targets: sparkGfx,
      alpha: 0,
      duration: 320,
      onComplete: () => sparkGfx.destroy(),
    });

    // Rock debris — chunky grey/stone 4×4 pixels with gravity
    const debris = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 90, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0.2 },
      alpha: { start: 1, end: 0 },
      tint: [0x8a9e86, 0x4a5848, 0xaa9977, 0x556655, 0x7a8c78],
      lifespan: { min: 380, max: 820 },
      gravityY: 220,
      quantity: 30,
      emitting: false,
    }).setDepth(20);
    debris.explode(30, cx, cy);
    this.scene.time.delayedCall(950, () => { if (debris.active) debris.destroy(); });

    // Fire sparks — fast orange/yellow 2×2 pixels
    const sparks = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 160, max: 400 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff8800, 0xffcc00, 0xff4400, 0xffff44, 0xff6600],
      lifespan: { min: 180, max: 480 },
      quantity: 44,
      emitting: false,
    }).setDepth(21);
    sparks.explode(44, cx, cy);
    this.scene.time.delayedCall(580, () => { if (sparks.active) sparks.destroy(); });

    // Embers floating upward — linger after explosion
    const embers = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 15, max: 60 },
      angle: { min: 255, max: 285 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0xff6600, 0xff8800, 0xffaa00],
      lifespan: { min: 700, max: 1400 },
      gravityY: -18,
      quantity: 20,
      emitting: false,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, r * 0.65),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any,
    }).setDepth(20);
    embers.explode(20, cx, cy);
    this.scene.time.delayedCall(1500, () => { if (embers.active) embers.destroy(); });
  }

  private spawnDashImpact(cx: number, cy: number): void {
    // Camera shake (smaller than AOE)
    this.scene.cameras.main.shake(130, 0.009);

    // Star burst graphic (keep for pixel structure)
    const impact = this.scene.add.graphics().setDepth(18).setPosition(cx, cy);
    impact.lineStyle(3, 0xff8800, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      impact.beginPath();
      impact.moveTo(0, 0);
      impact.lineTo(Math.cos(a) * 52, Math.sin(a) * 52);
      impact.strokePath();
    }
    impact.fillStyle(0xffcc44, 0.5);
    impact.fillCircle(0, 0, 20);
    this.scene.tweens.add({
      targets: impact,
      alpha: 0,
      scaleX: 1.6,
      scaleY: 1.6,
      duration: 360,
      ease: 'Sine.easeOut',
      onComplete: () => impact.destroy(),
    });

    // Dust cloud — light grey 4×4 pixels exploding outward low to ground
    const dust = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 50, max: 160 },
      angle: { min: 150, max: 390 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: [0xaabbaa, 0x889988, 0xccddcc, 0x99aa99],
      lifespan: { min: 300, max: 700 },
      gravityY: 120,
      quantity: 22,
      emitting: false,
    }).setDepth(11);
    dust.explode(22, cx, cy);
    this.scene.time.delayedCall(800, () => { if (dust.active) dust.destroy(); });

    // Rock chunks — heavier stone pixels with more gravity
    const chunks = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 120, max: 260 },
      angle: { min: 200, max: 340 },
      scale: { start: 2.8, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0x4a5848, 0x8a9e86, 0x222e22, 0x667766],
      lifespan: { min: 350, max: 650 },
      gravityY: 350,
      quantity: 16,
      emitting: false,
    }).setDepth(20);
    chunks.explode(16, cx, cy);
    this.scene.time.delayedCall(750, () => { if (chunks.active) chunks.destroy(); });

    // Orange sparks at point of impact
    const impactSparks = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 100, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff8800, 0xffcc44, 0xff4400],
      lifespan: { min: 120, max: 320 },
      quantity: 24,
      emitting: false,
    }).setDepth(21);
    impactSparks.explode(24, cx, cy);
    this.scene.time.delayedCall(400, () => { if (impactSparks.active) impactSparks.destroy(); });
  }

  // ── Warning Graphics ──────────────────────────────────

  private drawAoeWarning(): void {
    this.clearWarning();
    const r = Boss.AOE_RADIUS;

    // Solid red block fill — outer zone
    this.warningGfx.fillStyle(0xff0000, 0.40);
    this.warningGfx.fillCircle(this.atkX, this.atkY, r);
    // Hotter inner zone
    this.warningGfx.fillStyle(0xff3300, 0.28);
    this.warningGfx.fillCircle(this.atkX, this.atkY, r * 0.5);
    // Border
    this.warningGfx.lineStyle(3, 0xff0000, 1);
    this.warningGfx.strokeCircle(this.atkX, this.atkY, r);

    this.pulseTween = this.scene.tweens.add({
      targets: this.warningGfx,
      alpha: { from: 1, to: 0.25 },
      duration: 260,
      yoyo: true,
      repeat: -1,
    });
  }

  private drawDashWarning(): void {
    this.clearWarning();
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const len   = 350;
    const perp  = angle + Math.PI / 2;
    const hw    = 38; // half-width of triangle base at boss

    const tipX = this.x + Math.cos(angle) * len;
    const tipY = this.y + Math.sin(angle) * len;

    // Solid red triangle block pointing in dash direction
    this.warningGfx.fillStyle(0xff1100, 0.45);
    this.warningGfx.fillTriangle(
      this.x + Math.cos(perp) * hw,  this.y + Math.sin(perp) * hw,  // base left
      this.x - Math.cos(perp) * hw,  this.y - Math.sin(perp) * hw,  // base right
      tipX, tipY,                                                      // tip
    );

    // Bright outline
    this.warningGfx.lineStyle(2, 0xff4400, 1);
    this.warningGfx.beginPath();
    this.warningGfx.moveTo(this.x + Math.cos(perp) * hw,  this.y + Math.sin(perp) * hw);
    this.warningGfx.lineTo(this.x - Math.cos(perp) * hw,  this.y - Math.sin(perp) * hw);
    this.warningGfx.lineTo(tipX, tipY);
    this.warningGfx.closePath();
    this.warningGfx.strokePath();

    this.pulseTween = this.scene.tweens.add({
      targets: this.warningGfx,
      alpha: { from: 1, to: 0.2 },
      duration: 220,
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
