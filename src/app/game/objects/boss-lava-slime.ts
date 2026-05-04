import Phaser from 'phaser';
import { Boss, BossState } from './boss';

// ── 岩漿彈幕常數 ──────────────────────────────────────────
const BARRAGE_DIRS_P1    = 8;
const BARRAGE_DIRS_P2    = 10;
const BARRAGE_SPEED      = 210;   // px/s
const BARRAGE_RANGE      = 360;
const BARRAGE_HIT_R      = 15;
const BARRAGE_DMG        = 28;
const BARRAGE_WAVES      = 3;
const BARRAGE_WAVE_DELAY = 450;   // ms 波與波之間的間隔
const BARRAGE_FAN_HALF   = 6;     // 扇形半角（度）
const BARRAGE_FAN_PROJS  = 3;     // 每扇投射物數

// ── 熔岩柱常數 ────────────────────────────────────────────
const PILLAR_COUNT_P1 = 5;
const PILLAR_COUNT_P2 = 7;
const PILLAR_RADIUS   = 20;       // 原始 58 × 0.7 × 0.5（再縮小 50%）
const PILLAR_DMG      = 50;
const PILLAR_NEAR_MIN = 35;       // 玩家附近最小距離
const PILLAR_NEAR_MAX = 110;      // 玩家附近最大距離

export class BossLavaSlime extends Boss {
  onBarrageHit?:    (dmg: number) => void;
  onPillarExplode?: (x: number, y: number, radius: number, dmg: number) => void;

  private phase2 = false;
  private phase2GlobalActive = false;
  private lavaEmitter?: Phaser.GameObjects.Particles.ParticleEmitter;

  // ── 血量監聽：40% 觸發二階段 ─────────────────────────────

  override takeDamage(amount: number): void {
    super.takeDamage(amount);
    if (!this.phase2 && this.currentHp <= this.maxHpValue * 0.4 && this.currentState !== BossState.DEAD) {
      this.phase2 = true;
      this.triggerPhase2();
    }
  }

  private triggerPhase2(): void {
    this.idleChaseSpeed = 110;
    this.scene.cameras.main.shake(500, 0.030);

    const W = this.scene.scale.width, H = this.scene.scale.height;
    const screenFlash = this.scene.add.graphics().setScrollFactor(0).setDepth(99);
    screenFlash.fillStyle(0xff5500, 0.50);
    screenFlash.fillRect(0, 0, W, H);
    this.scene.tweens.add({
      targets: screenFlash, alpha: 0, duration: 800,
      onComplete: () => screenFlash.destroy(),
    });

    this.scene.tweens.add({
      targets: this, scaleX: 2.85, scaleY: 2.85,
      duration: 280, ease: 'Back.Out',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this, scaleX: 2.3, scaleY: 2.3,
          duration: 320, ease: 'Quad.Out',
        });
      },
    });

    this.setTint(0xff6600);

    const shockG = this.scene.add.graphics().setDepth(this.depth + 2).setPosition(this.x, this.y);
    const ss = { r: 8, a: 1.0 };
    this.scene.tweens.add({
      targets: ss, r: 115, a: 0, duration: 560, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(6, 0xff6600, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(16, 0xffaa00, ss.a * 0.26);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    this.lavaEmitter = this.scene.add.particles(0, 0, 'pxl2', {
      follow: this,
      speed: { min: 30, max: 85 },
      angle: { min: 248, max: 292 },
      scale: { start: 2.6, end: 0 },
      alpha: { start: 1.0, end: 0 },
      tint: [0xff2200, 0xff5500, 0xff8800, 0xffcc00, 0xff4400],
      lifespan: { min: 320, max: 680 },
      frequency: 18, quantity: 3,
      gravityY: -65,
      x: { min: -20, max: 20 },
      y: { min: -10, max: 10 },
    }).setDepth(10);

    const burst = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 200, max: 470 },
      angle: { min: 0, max: 360 },
      scale: { start: 3.0, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xffee44, 0xff8800, 0xff5500, 0xff2200],
      lifespan: { min: 220, max: 640 },
      emitting: false,
    }).setDepth(this.depth + 3);
    burst.emitParticleAt(0, 0, 90);
    this.scene.time.delayedCall(750, () => { if (burst.active) burst.destroy(); });

    // 二階段入場：封鎖攻擊選擇，直到全場熔岩柱結束
    this.phase2GlobalActive = true;
    // 600ms 延遲 + 1400ms 警示 + 70×80ms 爆發 + 800ms 緩衝 ≈ 8400ms
    const GLOBAL_COUNT = 70;
    const blockMs = 600 + 1400 + GLOBAL_COUNT * 80 + 800;
    this.scene.time.delayedCall(blockMs, () => { this.phase2GlobalActive = false; });
    this.scene.time.delayedCall(600, () => this.triggerPhase2GlobalPillars());
  }

  private triggerPhase2GlobalPillars(): void {
    if (this.currentState === BossState.DEAD) return;
    const GLOBAL_COUNT = 70;
    const ac = this.arenaCenter;
    const ar = this.arenaRadius;

    // 均勻分布在場地圓形內（sqrt 使分布更均勻）
    const positions = Array.from({ length: GLOBAL_COUNT }, () => {
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const dist  = Math.sqrt(Phaser.Math.FloatBetween(0, 1)) * ar;
      return { x: ac.x + Math.cos(angle) * dist, y: ac.y + Math.sin(angle) * dist };
    });

    // 全部圓圈同時出現
    const circleGraphics = positions.map(p => {
      const g = this.scene.add.graphics().setDepth(8).setPosition(p.x, p.y);
      g.fillStyle(0xff2200, 0.22);
      g.fillCircle(0, 0, PILLAR_RADIUS);
      g.lineStyle(2, 0xff5500, 0.95);
      g.strokeCircle(0, 0, PILLAR_RADIUS);
      g.lineStyle(1.5, 0xff3300, 0.78);
      g.lineBetween(-8, -8, 8, 8);
      g.lineBetween(8, -8, -8, 8);
      return g;
    });

    const rumbleEmitters = positions.map(p =>
      this.scene.add.particles(p.x, p.y, 'pxl2', {
        speed: { min: 10, max: 35 },
        angle: { min: 238, max: 302 },
        scale: { start: 0.9, end: 0 },
        alpha: { start: 0.7, end: 0 },
        tint: [0xff4400, 0xff8800, 0xffaa00],
        lifespan: { min: 180, max: 360 },
        frequency: 55, quantity: 1,
      }).setDepth(9),
    );

    const pw = { a: 1.0 };
    const pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.15, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => circleGraphics.forEach(g => g.setAlpha(pw.a)),
    });

    this.scene.time.delayedCall(1400, () => {
      pulseTween.stop();
      rumbleEmitters.forEach(e => e.destroy());
      // circleGraphics 保留，炸完才淡出

      positions.forEach((p, idx) => {
        this.scene.time.delayedCall(idx * 80, () => {
          const g = circleGraphics[idx];
          if (this.currentState === BossState.DEAD) { g?.destroy(); return; }
          g.setAlpha(1);
          this.spawnPillarEruption(p.x, p.y);
          this.onPillarExplode?.(p.x, p.y, PILLAR_RADIUS, PILLAR_DMG);
          this.scene.tweens.add({
            targets: g, alpha: 0, duration: 300, delay: 200,
            onComplete: () => g.destroy(),
          });
        });
      });
    });
  }

  // ── 攻擊選擇 ─────────────────────────────────────────────

  protected override pickNextAttack(): void {
    if (this.phase2GlobalActive) {
      this.stateTimer = this.scene.time.delayedCall(300, () => {
        if (this.currentState !== BossState.DEAD) this.pickNextAttack();
      });
      return;
    }
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.20) fn = () => this.enterAoeWarn();
    else if (roll < 0.40) fn = () => this.enterDashWarn();
    else if (roll < 0.70) fn = () => this.enterLavaBarrageWarn();
    else                  fn = () => this.enterLavaPillarWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 岩漿彈幕（三波扇形） ─────────────────────────────────

  private enterLavaBarrageWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.LAVA_BARRAGE_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const dirs    = this.phase2 ? BARRAGE_DIRS_P2 : BARRAGE_DIRS_P1;
    const halfRad = Phaser.Math.DegToRad(BARRAGE_FAN_HALF);
    const warnLen = BARRAGE_RANGE * 0.52;

    const warnG = this.scene.add.graphics().setDepth(8);
    for (let i = 0; i < dirs; i++) {
      const center = (i / dirs) * Math.PI * 2;
      // 扇形填色
      warnG.fillStyle(0xff4400, 0.11);
      warnG.beginPath();
      warnG.moveTo(this.x, this.y);
      for (let s = 0; s <= 6; s++) {
        const a = center - halfRad + (halfRad * 2 / 6) * s;
        warnG.lineTo(this.x + Math.cos(a) * warnLen, this.y + Math.sin(a) * warnLen);
      }
      warnG.closePath();
      warnG.fillPath();
      // 扇形邊線
      warnG.lineStyle(1.5, 0xff6600, 0.70);
      warnG.lineBetween(
        this.x, this.y,
        this.x + Math.cos(center - halfRad) * warnLen,
        this.y + Math.sin(center - halfRad) * warnLen,
      );
      warnG.lineBetween(
        this.x, this.y,
        this.x + Math.cos(center + halfRad) * warnLen,
        this.y + Math.sin(center + halfRad) * warnLen,
      );
    }
    warnG.lineStyle(2.5, 0xff2200, 0.85);
    warnG.strokeCircle(this.x, this.y, 22);

    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.18, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => warnG.setAlpha(pw.a),
    });

    const chargeE = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 55, max: 175 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.2, end: 1.8 },
      alpha: { start: 0.2, end: 0.9 },
      tint: [0xff5500, 0xff8800, 0xffcc00],
      lifespan: { min: 280, max: 560 },
      frequency: 22, quantity: 3,
    }).setDepth(this.depth + 1);

    this.stateTimer = this.scene.time.delayedCall(1300, () => {
      this.pulseTween?.stop();
      warnG.destroy();
      chargeE.destroy();
      this.fireBarrage();
      const idleDelay = (BARRAGE_WAVES - 1) * BARRAGE_WAVE_DELAY + 500;
      this.stateTimer = this.scene.time.delayedCall(idleDelay, () => this.enterIdle());
    });
  }

  private fireBarrage(): void {
    const dirs = this.phase2 ? BARRAGE_DIRS_P2 : BARRAGE_DIRS_P1;

    for (let wave = 0; wave < BARRAGE_WAVES; wave++) {
      this.scene.time.delayedCall(wave * BARRAGE_WAVE_DELAY, () => {
        if (this.currentState === BossState.DEAD) return;
        this.scene.cameras.main.shake(55, 0.005);
        for (let i = 0; i < dirs; i++) {
          const centerAngle = (i / dirs) * Math.PI * 2;
          this.fireBarrageFan(centerAngle);
        }
      });
    }
  }

  private fireBarrageFan(centerAngle: number): void {
    const halfRad = Phaser.Math.DegToRad(BARRAGE_FAN_HALF);
    for (let p = 0; p < BARRAGE_FAN_PROJS; p++) {
      const t     = p / (BARRAGE_FAN_PROJS - 1);
      const angle = centerAngle - halfRad + t * halfRad * 2;
      this.scene.time.delayedCall(p * 45, () => {
        if (this.currentState === BossState.DEAD) return;
        this.fireLavaBall(angle);
      });
    }
  }

  private fireLavaBall(angle: number): void {
    const travelMs = Math.round((BARRAGE_RANGE / BARRAGE_SPEED) * 1000);
    const startX   = this.x, startY = this.y;
    const vx       = Math.cos(angle) * BARRAGE_SPEED;
    const vy       = Math.sin(angle) * BARRAGE_SPEED;

    const ball = this.scene.add.graphics().setDepth(13).setPosition(startX, startY);
    let cx = startX, cy = startY;
    let done = false;

    const hitTimer = this.scene.time.addEvent({
      delay: 25, repeat: Math.ceil(travelMs / 25),
      callback: () => {
        if (done || !ball.active) { hitTimer.destroy(); return; }
        const [px, py] = this.getTargetPos();
        if (Phaser.Math.Distance.Between(cx, cy, px, py) < BARRAGE_HIT_R) {
          done = true;
          ball.destroy();
          hitTimer.destroy();
          this.onBarrageHit?.(BARRAGE_DMG);
          this.spawnBallSplash(cx, cy);
        }
      },
    });

    const prog = { t: 0 };
    this.scene.tweens.add({
      targets: prog, t: 1, duration: travelMs, ease: 'Linear',
      onUpdate: () => {
        if (done) return;
        cx = startX + vx * (travelMs / 1000) * prog.t;
        cy = startY + vy * (travelMs / 1000) * prog.t;
        ball.setPosition(cx, cy);
        ball.clear();
        ball.fillStyle(0xff8800, 0.32);
        ball.fillCircle(0, 0, 13);
        ball.fillStyle(0xff4400, 0.95);
        ball.fillCircle(0, 0, 7);
        ball.fillStyle(0xffee44, 0.80);
        ball.fillCircle(-1, -2, 3);
      },
      onComplete: () => {
        hitTimer.destroy();
        if (!done && ball.active) {
          done = true;
          this.spawnBallSplash(cx, cy);
          ball.destroy();
        }
      },
    });
  }

  private spawnBallSplash(cx: number, cy: number): void {
    const splash = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0xff5500, 0xff8800, 0xffcc00, 0xff2200],
      lifespan: { min: 100, max: 280 },
      emitting: false,
    }).setDepth(11);
    splash.emitParticleAt(0, 0, 8);
    this.scene.time.delayedCall(350, () => { if (splash.active) splash.destroy(); });
  }

  // ── 熔岩柱（5個全部在玩家附近） ─────────────────────────

  private enterLavaPillarWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.LAVA_PILLAR_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);
    this.pulseTween?.stop();

    const count  = this.phase2 ? PILLAR_COUNT_P2 : PILLAR_COUNT_P1;
    const [px, py] = this.getTargetPos();
    const bounds = this.scene.physics.world.bounds;

    const positions = Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
      const dist  = Phaser.Math.Between(PILLAR_NEAR_MIN, PILLAR_NEAR_MAX);
      return {
        x: Phaser.Math.Clamp(px + Math.cos(angle) * dist, bounds.left + 30, bounds.right  - 30),
        y: Phaser.Math.Clamp(py + Math.sin(angle) * dist, bounds.top  + 30, bounds.bottom - 30),
      };
    });

    const APPEAR_INTERVAL = 220;  // 每個紅圈出現間隔
    const WARN_AFTER_LAST = 700;  // 最後一個圈出現後的額外警示時間
    const ERUPT_STAGGER   = 130;  // 爆發間隔

    positions.forEach((p, idx) => {
      // 紅圈依序出現
      this.scene.time.delayedCall(idx * APPEAR_INTERVAL, () => {
        if (this.currentState === BossState.DEAD) return;

        const g = this.scene.add.graphics().setDepth(8).setPosition(p.x, p.y);
        g.fillStyle(0xff2200, 0.20);
        g.fillCircle(0, 0, PILLAR_RADIUS);
        g.lineStyle(2, 0xff5500, 0.90);
        g.strokeCircle(0, 0, PILLAR_RADIUS);
        g.lineStyle(1.2, 0xff3300, 0.55);
        g.strokeCircle(0, 0, PILLAR_RADIUS * 0.55);
        g.lineStyle(1.5, 0xff3300, 0.78);
        g.lineBetween(-8, -8, 8, 8);
        g.lineBetween(8, -8, -8, 8);

        const pw = { a: 1.0 };
        const pt = this.scene.tweens.add({
          targets: pw, a: 0.20, duration: 220, yoyo: true, repeat: -1,
          onUpdate: () => g.setAlpha(pw.a),
        });

        const rumbleE = this.scene.add.particles(p.x, p.y, 'pxl2', {
          speed: { min: 10, max: 40 }, angle: { min: 238, max: 302 },
          scale: { start: 1.0, end: 0 }, alpha: { start: 0.7, end: 0 },
          tint: [0xff4400, 0xff8800, 0xffaa00],
          lifespan: { min: 180, max: 380 }, frequency: 55, quantity: 1,
        }).setDepth(9);

        // 爆發時機：所有圈出完後再等 WARN_AFTER_LAST，然後依序爆發
        const timeToErupt = (count - 1 - idx) * APPEAR_INTERVAL + WARN_AFTER_LAST + idx * ERUPT_STAGGER;
        this.scene.time.delayedCall(timeToErupt, () => {
          pt.stop();
          rumbleE.destroy();
          if (this.currentState === BossState.DEAD) { g.destroy(); return; }
          g.setAlpha(1);
          this.spawnPillarEruption(p.x, p.y);
          this.onPillarExplode?.(p.x, p.y, PILLAR_RADIUS, PILLAR_DMG);
          // 炸完才淡出
          this.scene.tweens.add({
            targets: g, alpha: 0, duration: 350, delay: 250,
            onComplete: () => g.destroy(),
          });
        });
      });
    });

    // enterIdle 在最後一個爆發後 + 緩衝
    const totalMs = (count - 1) * APPEAR_INTERVAL + WARN_AFTER_LAST + (count - 1) * ERUPT_STAGGER + 800;
    this.stateTimer = this.scene.time.delayedCall(totalMs, () => this.enterIdle());
  }

  private spawnPillarEruption(cx: number, cy: number): void {
    this.scene.cameras.main.shake(100, 0.010);

    const flash = this.scene.add.graphics().setDepth(22).setPosition(cx, cy);
    flash.fillStyle(0xffffff, 1);
    flash.fillCircle(0, 0, PILLAR_RADIUS * 0.52);
    this.scene.tweens.add({
      targets: flash, alpha: 0, scaleX: 1.9, scaleY: 1.9,
      duration: 130, onComplete: () => flash.destroy(),
    });

    const shockG = this.scene.add.graphics().setDepth(20).setPosition(cx, cy);
    const ss = { r: 8, a: 1.0 };
    this.scene.tweens.add({
      targets: ss, r: PILLAR_RADIUS * 1.45, a: 0, duration: 320, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(3, 0xff5500, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(9, 0xffaa00, ss.a * 0.22);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    const pillar = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 100, max: 300 },
      angle: { min: 240, max: 300 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xff2200, 0xff5500, 0xff8800, 0xffcc00, 0xffee44],
      lifespan: { min: 240, max: 580 },
      gravityY: -55,
      emitting: false,
    }).setDepth(21);
    pillar.emitParticleAt(0, 0, 40);
    this.scene.time.delayedCall(700, () => { if (pillar.active) pillar.destroy(); });

    const debris = this.scene.add.particles(cx, cy, 'pxl', {
      speed: { min: 80, max: 220 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0.2 },
      alpha: { start: 1, end: 0 },
      tint: [0x885533, 0x664422, 0xaa7744, 0x553311],
      lifespan: { min: 300, max: 620 },
      gravityY: 260,
      emitting: false,
    }).setDepth(20);
    debris.emitParticleAt(0, 0, 16);
    this.scene.time.delayedCall(750, () => { if (debris.active) debris.destroy(); });
  }

  override destroy(fromScene?: boolean): void {
    this.lavaEmitter?.destroy();
    super.destroy(fromScene);
  }
}
