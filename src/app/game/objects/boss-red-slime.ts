import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const JUMP_RADIUS = 78;
const JUMP_DMG    = 40;
const FAN_RANGE   = 180;
const FAN_HALF    = 35 * (Math.PI / 180);  // ±35°
const FAN_DMG     = 35;
const FAN_STEPS   = 14;

export class BossRedSlime extends Boss {
  onJumpHit?: (x: number, y: number, radius: number, dmg: number) => void;
  onFanHit?:  (bx: number, by: number, angle: number, half: number, range: number, dmg: number) => void;

  private belowHalf = false;
  private flameEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // ── 血量監聽：觸發二階段 ──────────────────────────────

  override takeDamage(amount: number): void {
    super.takeDamage(amount);
    if (!this.belowHalf && this.currentHp <= this.maxHpValue * 0.5 && this.currentState !== BossState.DEAD) {
      this.belowHalf = true;
      this.triggerPhase2();
    }
  }

  private triggerPhase2(): void {
    this.idleChaseSpeed = 110;
    this.scene.cameras.main.shake(450, 0.028);

    // 全螢幕紅閃
    const W = this.scene.scale.width, H = this.scene.scale.height;
    const screenFlash = this.scene.add.graphics().setScrollFactor(0).setDepth(99);
    screenFlash.fillStyle(0xff1100, 0.45);
    screenFlash.fillRect(0, 0, W, H);
    this.scene.tweens.add({
      targets: screenFlash, alpha: 0, duration: 700,
      onComplete: () => screenFlash.destroy(),
    });

    // Boss 爆發膨脹 → 縮到 2.2（永久變大）
    this.scene.tweens.add({
      targets: this, scaleX: 2.75, scaleY: 2.75,
      duration: 250, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this, scaleX: 2.2, scaleY: 2.2,
          duration: 300, ease: 'Quad.Out',
        });
      },
    });

    // 色調轉橙紅（二階段標記）
    this.setTint(0xff5500);

    // 衝擊波環
    const shockG = this.scene.add.graphics().setDepth(this.depth + 2).setPosition(this.x, this.y);
    const ss = { r: 8, a: 1.0 };
    this.scene.tweens.add({
      targets: ss, r: 95, a: 0, duration: 520, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(5, 0xff4400, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(14, 0xff8800, ss.a * 0.28);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    // 持續燃燒效果：主火焰
    this.flameEmitter = this.scene.add.particles(0, 0, 'pxl2', {
      follow: this,
      speed: { min: 35, max: 95 },
      angle: { min: 250, max: 290 },
      scale: { start: 3.0, end: 0 },
      alpha: { start: 1.0, end: 0 },
      tint: [0xff2200, 0xff5500, 0xff8800, 0xffcc00, 0xffee44],
      lifespan: { min: 350, max: 750 },
      frequency: 14, quantity: 3,
      gravityY: -80,
      x: { min: -18, max: 18 },
      y: { min: -12, max: 8 },
    }).setDepth(10);

    // 火星四濺（快速短命小粒子）
    this.scene.add.particles(0, 0, 'pxl', {
      follow: this,
      speed: { min: 60, max: 170 },
      angle: { min: 220, max: 320 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffee44, 0xffaa00, 0xff6600],
      lifespan: { min: 120, max: 320 },
      frequency: 20, quantity: 2,
      gravityY: -30,
      x: { min: -16, max: 16 },
      y: { min: -14, max: 6 },
    }).setDepth(10);

    // 火焰爆發粒子
    const burst = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 190, max: 440 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffee44, 0xff8800, 0xff4400, 0xff2200],
      lifespan: { min: 200, max: 600 },
      emitting: false,
    }).setDepth(this.depth + 3);
    burst.emitParticleAt(0, 0, 85);
    this.scene.time.delayedCall(700, () => { if (burst.active) burst.destroy(); });
  }

  // ── 攻擊選擇 ──────────────────────────────────────────

  protected override pickNextAttack(): void {
    const roll = Math.random();
    let fn: () => void;
    if (this.belowHalf) {
      if      (roll < 0.20) fn = () => this.enterAoeWarn();
      else if (roll < 0.40) fn = () => this.enterDashWarn();
      else if (roll < 0.65) fn = () => this.enterJumpWarn();
      else                  fn = () => this.enterFireFanWarn();
    } else {
      if      (roll < 0.30) fn = () => this.enterAoeWarn();
      else if (roll < 0.60) fn = () => this.enterDashWarn();
      else                  fn = () => this.enterJumpWarn();
    }
    this.stateTimer = this.scene.time.delayedCall(2000, fn);
  }

  // ── 跳躍衝擊 ──────────────────────────────────────────

  private enterJumpWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.JUMP_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.getTargetPos();

    const warnG = this.scene.add.graphics().setDepth(8);
    this.drawJumpWarning(warnG, tx, ty);
    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.20, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => warnG.setAlpha(pw.a),
    });

    this.scene.tweens.add({
      targets: this, scaleX: 2.3, scaleY: 1.65,
      duration: 500, ease: 'Quad.Out',
    });

    this.stateTimer = this.scene.time.delayedCall(900, () => {
      this.pulseTween?.stop();
      warnG.destroy();
      this.setScale(this.belowHalf ? 2.2 : 2);
      this.doJump(tx, ty);
    });
  }

  private doJump(tx: number, ty: number): void {
    const dist   = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const jumpMs = Phaser.Math.Clamp(Math.round(dist / 480 * 1000), 220, 420);

    this.scene.tweens.add({
      targets: this, scaleX: 1.7, scaleY: 2.5,
      duration: jumpMs * 0.45, ease: 'Quad.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this, scaleX: this.belowHalf ? 2.2 : 2.0, scaleY: this.belowHalf ? 2.2 : 2.0,
          duration: jumpMs * 0.55, ease: 'Quad.In',
        });
      },
    });

    const prog = { t: 0 };
    const startX = this.x, startY = this.y;
    const peakY  = Math.min(startY, ty) - 40;

    this.scene.tweens.add({
      targets: prog, t: 1, duration: jumpMs, ease: 'Linear',
      onUpdate: () => {
        const t = prog.t;
        this.x = startX + (tx - startX) * t;
        this.y = startY * (1 - t) * (1 - t) + peakY * 2 * t * (1 - t) + ty * t * t;
      },
      onComplete: () => {
        this.setScale(this.belowHalf ? 2.2 : 2);
        this.setPosition(tx, ty);
        (this.body as Phaser.Physics.Arcade.Body).reset(tx, ty);
        this.spawnLandingImpact(tx, ty);
        this.onJumpHit?.(tx, ty, JUMP_RADIUS, JUMP_DMG);
        this.stateTimer = this.scene.time.delayedCall(450, () => this.enterIdle());
      },
    });
  }

  // ── 火焰噴射（HP ≤ 50%）────────────────────────────────

  private enterFireFanWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.FIRE_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    // 鎖定方向（警示開始時鎖定）
    const [px, py] = this.getTargetPos();
    const fireAngle = Phaser.Math.Angle.Between(this.x, this.y, px, py);

    // 扇形紅色警示
    const fanWarnG = this.scene.add.graphics().setDepth(8);
    this.drawFanWarning(fanWarnG, this.x, this.y, fireAngle);
    const fw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, a: 0.22, duration: 190, yoyo: true, repeat: -1,
      onUpdate: () => fanWarnG.setAlpha(fw.a),
    });

    // Boss 身上聚火粒子
    const chargeEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 20, max: 55 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0xff4400, 0xff8800, 0xffcc00, 0xff2200],
      lifespan: { min: 300, max: 700 },
      frequency: 28, quantity: 3, gravityY: -20,
    }).setDepth(this.depth + 1);

    // 光暈漸增
    const glowG = this.scene.add.graphics().setDepth(this.depth - 1).setPosition(this.x, this.y);
    const gs = { r: 12, a: 0.4 };
    this.scene.tweens.add({
      targets: gs, r: 30, a: 1.0, duration: 900, ease: 'Quad.In',
      onUpdate: () => {
        glowG.clear();
        glowG.fillStyle(0xff4400, gs.a * 0.32);
        glowG.fillCircle(0, 0, gs.r);
        glowG.lineStyle(3, 0xff8800, gs.a * 0.65);
        glowG.strokeCircle(0, 0, gs.r);
      },
    });

    this.stateTimer = this.scene.time.delayedCall(1250, () => {
      this.pulseTween?.stop();
      fanWarnG.destroy();
      chargeEmitter.destroy();
      glowG.destroy();
      this.spawnFireFan(fireAngle);
      this.onFanHit?.(this.x, this.y, fireAngle, FAN_HALF, FAN_RANGE, FAN_DMG);
      this.stateTimer = this.scene.time.delayedCall(350, () => this.enterIdle());
    });
  }

  private spawnFireFan(angle: number): void {
    this.scene.cameras.main.shake(90, 0.008);

    const fire = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 120, max: 340 },
      angle: {
        min: Phaser.Math.RadToDeg(angle - FAN_HALF),
        max: Phaser.Math.RadToDeg(angle + FAN_HALF),
      },
      scale: { start: 2.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff2200, 0xff6600, 0xffaa00, 0xffee44, 0xff4400],
      lifespan: { min: 220, max: 480 },
      emitting: false,
    }).setDepth(this.depth + 2);
    fire.emitParticleAt(0, 0, 65);
    this.scene.time.delayedCall(550, () => { if (fire.active) fire.destroy(); });

    const smoke = this.scene.add.particles(this.x, this.y, 'pxl', {
      speed: { min: 60, max: 180 },
      angle: {
        min: Phaser.Math.RadToDeg(angle - FAN_HALF),
        max: Phaser.Math.RadToDeg(angle + FAN_HALF),
      },
      scale: { start: 2.8, end: 0 },
      alpha: { start: 0.45, end: 0 },
      tint: [0x888888, 0x666666, 0xaaaaaa],
      lifespan: { min: 400, max: 900 },
      gravityY: -12,
      emitting: false,
    }).setDepth(this.depth + 1);
    smoke.emitParticleAt(0, 0, 30);
    this.scene.time.delayedCall(1000, () => { if (smoke.active) smoke.destroy(); });

    const flash = this.scene.add.graphics().setDepth(this.depth + 3).setPosition(this.x, this.y);
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, 18);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 2.2, scaleY: 2.2,
      duration: 180, onComplete: () => flash.destroy(),
    });
  }

  // ── VFX helpers ───────────────────────────────────────

  private drawFanWarning(g: Phaser.GameObjects.Graphics, bx: number, by: number, angle: number): void {
    const r = FAN_RANGE;

    // 填色扇形
    const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(bx, by)];
    for (let i = 0; i <= FAN_STEPS; i++) {
      const a = (angle - FAN_HALF) + (FAN_HALF * 2) * (i / FAN_STEPS);
      pts.push(new Phaser.Math.Vector2(bx + Math.cos(a) * r, by + Math.sin(a) * r));
    }
    g.fillStyle(0xff2200, 0.14);
    g.fillPoints(pts, true);

    // 兩側邊線
    g.lineStyle(2.5, 0xff3300, 0.90);
    g.lineBetween(bx, by, bx + Math.cos(angle - FAN_HALF) * r, by + Math.sin(angle - FAN_HALF) * r);
    g.lineBetween(bx, by, bx + Math.cos(angle + FAN_HALF) * r, by + Math.sin(angle + FAN_HALF) * r);

    // 外弧線
    g.lineStyle(2, 0xff5500, 0.72);
    g.beginPath();
    for (let i = 0; i <= FAN_STEPS; i++) {
      const a = (angle - FAN_HALF) + (FAN_HALF * 2) * (i / FAN_STEPS);
      i === 0
        ? g.moveTo(bx + Math.cos(a) * r, by + Math.sin(a) * r)
        : g.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r);
    }
    g.strokePath();

    // 內弧（50%）
    g.lineStyle(1, 0xff6600, 0.40);
    g.beginPath();
    for (let i = 0; i <= FAN_STEPS; i++) {
      const a = (angle - FAN_HALF) + (FAN_HALF * 2) * (i / FAN_STEPS);
      i === 0
        ? g.moveTo(bx + Math.cos(a) * r * 0.5, by + Math.sin(a) * r * 0.5)
        : g.lineTo(bx + Math.cos(a) * r * 0.5, by + Math.sin(a) * r * 0.5);
    }
    g.strokePath();

    // 中心點
    g.fillStyle(0xff4400, 0.88);
    g.fillCircle(bx, by, 5);
  }

  private drawJumpWarning(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const r = JUMP_RADIUS;
    g.fillStyle(0xff0000, 0.14);
    g.fillCircle(x, y, r);
    g.lineStyle(3, 0xff2200, 0.92);
    g.strokeCircle(x, y, r);
    g.lineStyle(1.5, 0xff5500, 0.55);
    g.strokeCircle(x, y, r * 0.55);
    g.lineStyle(2, 0xff3300, 0.80);
    g.lineBetween(x - 10, y - 10, x + 10, y + 10);
    g.lineBetween(x + 10, y - 10, x - 10, y + 10);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle(0xff4400, 0.75);
      g.fillRect(x + Math.cos(a) * r - 3, y + Math.sin(a) * r - 3, 6, 6);
    }
  }

  override destroy(fromScene?: boolean): void {
    this.flameEmitter?.destroy();
    super.destroy(fromScene);
  }

  private spawnLandingImpact(cx: number, cy: number): void {
    this.scene.cameras.main.shake(200, 0.016);

    const shockG = this.scene.add.graphics().setDepth(20).setPosition(cx, cy);
    const ss = { r: 12, a: 1.0 };
    this.scene.tweens.add({
      targets: ss, r: JUMP_RADIUS * 1.3, a: 0, duration: 320, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(4, 0xff4400, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(10, 0xff8800, ss.a * 0.25);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    const flash = this.scene.add.graphics().setDepth(22).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 1.0);
    flash.fillCircle(0, 0, JUMP_RADIUS * 0.55);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 1.8, scaleY: 1.8,
      duration: 140, onComplete: () => flash.destroy(),
    });

    const sparks = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 160, max: 380 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffee44, 0xff8800, 0xff4400, 0xff2200],
      lifespan: { min: 150, max: 380 },
      emitting: false,
    }).setDepth(22);
    sparks.emitParticleAt(0, 0, 55);
    this.scene.time.delayedCall(450, () => { if (sparks.active) sparks.destroy(); });

    const debris = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 90, max: 260 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0.3 },
      alpha: { start: 1, end: 0 },
      tint: [0x885533, 0xaa7744, 0x664422],
      lifespan: { min: 400, max: 800 },
      gravityY: 280,
      emitting: false,
    }).setDepth(20);
    debris.emitParticleAt(0, 0, 22);
    this.scene.time.delayedCall(900, () => { if (debris.active) debris.destroy(); });
  }
}
