import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const CROSS_RANGE  = 400;
const CROSS_HALF_W = 22;
const CROSS_DMG    = 38;

const ORB_SPEED    = 130;   // px/s
const ORB_MAX_DIST = 360;
const ORB_HIT_R    = 14;
const ORB_EXP_R    = 65;
const ORB_DMG      = 32;
const ORB_COUNT    = 3;
const ORB_SPREAD   = 15 * (Math.PI / 180);

export class BossWhiteSlime extends Boss {
  onCrossHit?:   (dmg: number) => void;
  onOrbExplode?: (x: number, y: number, radius: number, dmg: number) => void;

  // ── 攻擊選擇 ──────────────────────────────────────────

  protected override pickNextAttack(): void {
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.50) fn = () => this.enterHolyCrossWarn();
    else                  fn = () => this.enterHolyOrbsWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 聖光十字 ──────────────────────────────────────────

  private enterHolyCrossWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.HOLY_CROSS_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const warnG = this.scene.add.graphics().setDepth(8);
    const drawCrossWarn = (alpha: number) => {
      const bx = this.x, by = this.y;
      const hw = CROSS_HALF_W;
      warnG.clear();
      // 最外層柔光
      warnG.fillStyle(0xffffcc, alpha * 0.06);
      warnG.fillRect(bx - CROSS_RANGE, by - hw * 3.5, CROSS_RANGE * 2, hw * 7);
      warnG.fillRect(bx - hw * 3.5, by - CROSS_RANGE, hw * 7, CROSS_RANGE * 2);
      // 中層填色
      warnG.fillStyle(0xffeeaa, alpha * 0.16);
      warnG.fillRect(bx - CROSS_RANGE, by - hw, CROSS_RANGE * 2, hw * 2);
      warnG.fillRect(bx - hw, by - CROSS_RANGE, hw * 2, CROSS_RANGE * 2);
      // 邊緣亮線（不蓋中心交叉點）
      warnG.lineStyle(1.5, 0xffffff, alpha * 0.9);
      warnG.lineBetween(bx - CROSS_RANGE, by - hw, bx - hw, by - hw);
      warnG.lineBetween(bx + hw,          by - hw, bx + CROSS_RANGE, by - hw);
      warnG.lineBetween(bx - CROSS_RANGE, by + hw, bx - hw, by + hw);
      warnG.lineBetween(bx + hw,          by + hw, bx + CROSS_RANGE, by + hw);
      warnG.lineBetween(bx - hw, by - CROSS_RANGE, bx - hw, by - hw);
      warnG.lineBetween(bx - hw, by + hw,           bx - hw, by + CROSS_RANGE);
      warnG.lineBetween(bx + hw, by - CROSS_RANGE, bx + hw, by - hw);
      warnG.lineBetween(bx + hw, by + hw,           bx + hw, by + CROSS_RANGE);
      // 中心光圈
      warnG.fillStyle(0xffeeaa, alpha * 0.55);
      warnG.fillCircle(bx, by, hw);
      warnG.lineStyle(2, 0xffffff, alpha);
      warnG.strokeCircle(bx, by, hw * 0.55);
    };
    drawCrossWarn(1);

    const fw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, a: 0.12, duration: 190, yoyo: true, repeat: -1,
      onUpdate: () => drawCrossWarn(fw.a),
    });

    // 向內聚氣粒子
    const chargeEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 15, max: 55 },
      angle: { min: 0, max: 360 },
      scale: { start: 0, end: 1.6 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xffeeaa, 0xffffcc],
      lifespan: { min: 300, max: 700 },
      frequency: 20, quantity: 2,
      x: { min: -CROSS_RANGE * 0.6, max: CROSS_RANGE * 0.6 },
      y: { min: -CROSS_RANGE * 0.6, max: CROSS_RANGE * 0.6 },
    }).setDepth(this.depth + 1);

    this.stateTimer = this.scene.time.delayedCall(1000, () => {
      this.pulseTween?.stop();
      warnG.destroy();
      chargeEmitter.destroy();
      this.fireHolyCross();
    });
  }

  private fireHolyCross(): void {
    this.scene.cameras.main.flash(120, 255, 255, 220, true);
    this.scene.cameras.main.shake(90, 0.008);

    const [px, py] = this.getTargetPos();
    const inH = Math.abs(py - this.y) < CROSS_HALF_W && Math.abs(px - this.x) <= CROSS_RANGE;
    const inV = Math.abs(px - this.x) < CROSS_HALF_W && Math.abs(py - this.y) <= CROSS_RANGE;
    if (inH || inV) this.onCrossHit?.(CROSS_DMG);

    const bx = this.x, by = this.y;
    const hw = CROSS_HALF_W;

    // 中心爆發閃光
    const flash = this.scene.add.graphics().setDepth(18).setPosition(bx, by);
    flash.fillStyle(0xffffff, 1.0);
    flash.fillCircle(0, 0, hw * 2.5);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 4, scaleY: 4,
      duration: 220, onComplete: () => flash.destroy(),
    });

    // 中心爆發粒子
    const center = this.scene.add.particles(bx, by, 'pxl2', {
      speed: { min: 140, max: 400 },
      angle: { min: 0, max: 360 },
      scale: { start: 3.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffffcc, 0xffeeaa],
      lifespan: { min: 200, max: 500 },
      emitting: false,
    }).setDepth(17);
    center.emitParticleAt(0, 0, 70);
    this.scene.time.delayedCall(600, () => { if (center.active) center.destroy(); });

    // 四方向定向粒子流
    const dirs = [
      { angle: 0,   label: 'right' },
      { angle: 180, label: 'left'  },
      { angle: 90,  label: 'down'  },
      { angle: 270, label: 'up'    },
    ];
    for (const d of dirs) {
      const stream = this.scene.add.particles(bx, by, 'pxl2', {
        speed: { min: 350, max: 700 },
        angle: { min: d.angle - 8, max: d.angle + 8 },
        scale: { start: 2.4, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: [0xffffff, 0xffffcc, 0xffeeaa, 0xffffff],
        lifespan: { min: 280, max: 520 },
        frequency: 18, quantity: 3, duration: 200,
      }).setDepth(16);
      this.scene.time.delayedCall(700, () => { if (stream.active) stream.destroy(); });
    }

    // 光束從中心展開動畫
    const beamG = this.scene.add.graphics().setDepth(15);
    const prog  = { len: 0, alpha: 1 };
    const drawBeam = () => {
      beamG.clear();
      const L = prog.len;
      const a = prog.alpha;

      // 每一層：[顏色, alpha倍率, 半寬]，從外到內疊加模擬輝光衰減
      const layers: [number, number, number][] = [
        [0xffffcc, 0.06, 52],
        [0xffeeaa, 0.10, 36],
        [0xffdd88, 0.18, 24],
        [0xffeeaa, 0.30, 14],
        [0xffffff, 0.55,  8],
        [0xffffff, 0.80,  4],
        [0xffffff, 1.00,  2],
      ];
      for (const [col, am, half] of layers) {
        beamG.fillStyle(col, a * am);
        beamG.fillRect(bx - L, by - half, L * 2, half * 2);
        beamG.fillRect(bx - half, by - L, half * 2, L * 2);
      }
    };

    // 展開階段
    this.scene.tweens.add({
      targets: prog, len: CROSS_RANGE, duration: 140, ease: 'Quad.Out',
      onUpdate: drawBeam,
      onComplete: () => {
        // 停留後淡出
        this.scene.tweens.add({
          targets: prog, alpha: 0, duration: 420, ease: 'Quad.In',
          onUpdate: drawBeam,
          onComplete: () => beamG.destroy(),
        });
      },
    });

    this.stateTimer = this.scene.time.delayedCall(560, () => this.enterIdle());
  }

  // ── 聖光球 ────────────────────────────────────────────

  private enterHolyOrbsWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.HOLY_ORBS_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const chargeEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 15, max: 55 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xffeeaa, 0xffffdd],
      lifespan: { min: 250, max: 600 },
      frequency: 18, quantity: 3,
    }).setDepth(this.depth + 1);

    const glowG = this.scene.add.graphics().setDepth(this.depth - 1).setPosition(this.x, this.y);
    const gs = { r: 10, a: 0.4 };
    this.scene.tweens.add({
      targets: gs, r: 32, a: 1.0, duration: 700, ease: 'Quad.In',
      onUpdate: () => {
        glowG.clear();
        glowG.fillStyle(0xffffcc, gs.a * 0.22);
        glowG.fillCircle(0, 0, gs.r);
        glowG.lineStyle(3, 0xffeeaa, gs.a * 0.7);
        glowG.strokeCircle(0, 0, gs.r);
      },
    });

    this.stateTimer = this.scene.time.delayedCall(800, () => {
      chargeEmitter.destroy();
      glowG.destroy();
      this.launchHolyOrbs();
      this.stateTimer = this.scene.time.delayedCall(2500, () => this.enterIdle());
    });
  }

  private launchHolyOrbs(): void {
    const [px, py] = this.getTargetPos();
    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, px, py);
    for (let i = 0; i < ORB_COUNT; i++) {
      const angle = baseAngle + (i - 1) * ORB_SPREAD;
      this.scene.time.delayedCall(i * 160, () => this.launchOneOrb(angle));
    }
  }

  private launchOneOrb(angle: number): void {
    if (this.currentState === BossState.DEAD) return;

    let cx = this.x, cy = this.y;
    let distTraveled = 0;
    let exploded = false;

    const orbG = this.scene.add.graphics().setDepth(this.depth + 2);
    this.drawOrb(orbG, cx, cy);

    const trail = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 5, max: 22 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: [0xffffff, 0xffeeaa, 0xffffcc],
      lifespan: { min: 120, max: 320 },
      frequency: 22, quantity: 2,
    }).setDepth(this.depth + 1);

    const explode = () => {
      if (exploded) return;
      exploded = true;
      orbG.destroy();
      trail.destroy();
      this.spawnOrbExplosion(cx, cy);
      this.onOrbExplode?.(cx, cy, ORB_EXP_R, ORB_DMG);
    };

    const moveTimer = this.scene.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => {
        if (!orbG.active) { moveTimer.destroy(); return; }
        const step = ORB_SPEED * 16 / 1000;
        cx += Math.cos(angle) * step;
        cy += Math.sin(angle) * step;
        distTraveled += step;

        orbG.clear();
        this.drawOrb(orbG, cx, cy);
        trail.setPosition(cx, cy);

        const [px, py] = this.getTargetPos();
        if (Phaser.Math.Distance.Between(cx, cy, px, py) < ORB_HIT_R) {
          moveTimer.destroy(); explode(); return;
        }
        if (distTraveled >= ORB_MAX_DIST) {
          moveTimer.destroy();
          orbG.destroy();
          trail.destroy();
        }
      },
      callbackScope: this,
    });
  }

  // ── VFX helpers ───────────────────────────────────────

  private drawOrb(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0xffeeaa, 0.28);
    g.fillCircle(x, y, 17);
    g.fillStyle(0xffffff, 0.92);
    g.fillCircle(x, y, 10);
    g.lineStyle(2, 0xffeeaa, 0.85);
    g.strokeCircle(x, y, 13);
  }

  private spawnOrbExplosion(x: number, y: number): void {
    this.scene.cameras.main.shake(100, 0.008);

    const shockG = this.scene.add.graphics().setDepth(20).setPosition(x, y);
    const ss = { r: 8, a: 1 };
    this.scene.tweens.add({
      targets: ss, r: ORB_EXP_R * 1.2, a: 0, duration: 350, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(4, 0xffeeaa, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(14, 0xffffff, ss.a * 0.22);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    const burst = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 100, max: 280 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffffcc, 0xffeeaa, 0xffdd88],
      lifespan: { min: 180, max: 450 },
      emitting: false,
    }).setDepth(21);
    burst.emitParticleAt(0, 0, 50);
    this.scene.time.delayedCall(550, () => { if (burst.active) burst.destroy(); });

    const flash = this.scene.add.graphics().setDepth(22).setPosition(x, y);
    flash.fillStyle(0xffffff, 0.9);
    flash.fillCircle(0, 0, 16);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 2.0, scaleY: 2.0,
      duration: 160, onComplete: () => flash.destroy(),
    });
  }
}
