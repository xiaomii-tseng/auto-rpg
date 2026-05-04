import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const SPIKE_RANGE   = 400;
const SPIKE_DMG     = 25;
const SPIKE_SPEED_MS = 700;
const SPIKE_HIT_R   = 18;

const MINE_SCATTER  = 60;
const MINE_RADIUS   = 65;
const MINE_DMG      = 45;
const MINE_FUSE_MS  = 2000;

export class BossBlueSlime extends Boss {
  onSpikeHit?:   (x: number, y: number, dmg: number) => void;
  onMineExplode?: (x: number, y: number, radius: number, dmg: number) => void;

  // ── 攻擊選擇 ──────────────────────────────────────────

  protected override pickNextAttack(): void {
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.20) fn = () => this.enterAoeWarn();
    else if (roll < 0.40) fn = () => this.enterDashWarn();
    else if (roll < 0.70) fn = () => this.enterIceSpikeWarn();
    else                  fn = () => this.enterIceMineWarn();
    this.stateTimer = this.scene.time.delayedCall(2000, fn);
  }

  // ── 冰錐八方射擊 ──────────────────────────────────────

  private enterIceSpikeWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ICE_SPIKE_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const chargeEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 30, max: 80 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x88ddff, 0xaaeeff, 0x66bbff, 0xffffff],
      lifespan: { min: 200, max: 500 },
      frequency: 25, quantity: 2,
    }).setDepth(this.depth + 1);

    // 八方向警示線
    const warnG = this.scene.add.graphics().setDepth(8);
    const drawSpikeWarn = (alpha: number) => {
      warnG.clear();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x1 = this.x + Math.cos(a) * 28;
        const y1 = this.y + Math.sin(a) * 28;
        const x2 = this.x + Math.cos(a) * SPIKE_RANGE;
        const y2 = this.y + Math.sin(a) * SPIKE_RANGE;
        warnG.lineStyle(2, 0x88ccff, alpha * 0.7);
        warnG.lineBetween(x1, y1, x2, y2);
        warnG.fillStyle(0xaaddff, alpha * 0.85);
        warnG.fillTriangle(
          x2 + Math.cos(a) * 10,           y2 + Math.sin(a) * 10,
          x2 + Math.cos(a + 0.18) * (-8),  y2 + Math.sin(a + 0.18) * (-8),
          x2 + Math.cos(a - 0.18) * (-8),  y2 + Math.sin(a - 0.18) * (-8),
        );
      }
      warnG.lineStyle(2, 0x4499cc, alpha * 0.5);
      warnG.strokeCircle(this.x, this.y, 26);
    };
    drawSpikeWarn(1);
    const fw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, a: 0.2, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => drawSpikeWarn(fw.a),
    });

    this.stateTimer = this.scene.time.delayedCall(1100, () => {
      this.pulseTween?.stop();
      this.setScale(2.0);
      warnG.destroy();
      chargeEmitter.destroy();
      this.spawnIceSpikes();
      this.stateTimer = this.scene.time.delayedCall(SPIKE_SPEED_MS + 100, () => this.enterIdle());
    });
  }

  private spawnIceSpikes(): void {
    this.scene.cameras.main.shake(55, 0.005);

    type SpikeData = {
      gfx:   Phaser.GameObjects.Graphics;
      trail: Phaser.GameObjects.Particles.ParticleEmitter;
      cx: number; cy: number; hit: boolean;
    };
    const spikes: SpikeData[] = [];

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const tx = this.x + Math.cos(angle) * SPIKE_RANGE;
      const ty = this.y + Math.sin(angle) * SPIKE_RANGE;

      const g = this.scene.add.graphics().setDepth(this.depth + 1);
      this.drawIceSpike(g, angle);

      const trail = this.scene.add.particles(this.x, this.y, 'pxl', {
        speed: { min: 5, max: 18 },
        angle: { min: 0, max: 360 },
        scale: { start: 1.1, end: 0 },
        alpha: { start: 0.65, end: 0 },
        tint: [0x88ddff, 0xaaeeff, 0xffffff],
        lifespan: { min: 100, max: 240 },
        frequency: 28, quantity: 1,
      }).setDepth(this.depth);

      const spike: SpikeData = { gfx: g, trail, cx: this.x, cy: this.y, hit: false };
      spikes.push(spike);

      const prog = { t: 0 };
      const sx = this.x, sy = this.y;
      this.scene.tweens.add({
        targets: prog, t: 1, duration: SPIKE_SPEED_MS, ease: 'Quad.Out',
        onUpdate: () => {
          spike.cx = sx + (tx - sx) * prog.t;
          spike.cy = sy + (ty - sy) * prog.t;
          g.setPosition(spike.cx, spike.cy);
          trail.setPosition(spike.cx, spike.cy);
        },
        onComplete: () => {
          g.destroy();
          trail.destroy();
        },
      });
    }

    const hitTimer = this.scene.time.addEvent({
      delay: 30,
      repeat: Math.ceil(SPIKE_SPEED_MS / 30),
      callback: () => {
        const [px, py] = this.getTargetPos();
        for (const spike of spikes) {
          if (spike.hit || !spike.gfx.active) continue;
          if (Phaser.Math.Distance.Between(spike.cx, spike.cy, px, py) < SPIKE_HIT_R) {
            spike.hit = true;
            spike.gfx.destroy();
            spike.trail.destroy();
            this.onSpikeHit?.(spike.cx, spike.cy, SPIKE_DMG);
          }
        }
      },
      callbackScope: this,
    });
    this.scene.time.delayedCall(SPIKE_SPEED_MS + 80, () => hitTimer.destroy());
  }

  private drawIceSpike(g: Phaser.GameObjects.Graphics, angle: number): void {
    const len = 20, wid = 4;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const perp = angle + Math.PI / 2;
    const pc = Math.cos(perp), ps = Math.sin(perp);

    // 主體：細長菱形
    g.fillStyle(0xaaddff, 0.95);
    g.fillPoints([
      new Phaser.Math.Vector2(cos * len, sin * len),
      new Phaser.Math.Vector2(pc * wid, ps * wid),
      new Phaser.Math.Vector2(-cos * 7, -sin * 7),
      new Phaser.Math.Vector2(-pc * wid, -ps * wid),
    ], true);

    // 高光線
    g.lineStyle(1.5, 0xffffff, 0.75);
    g.lineBetween(-cos * 4, -sin * 4, cos * len * 0.65, sin * len * 0.65);
  }

  // ── 冰地雷 ────────────────────────────────────────────

  private enterIceMineWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ICE_MINE_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const glowG = this.scene.add.graphics().setDepth(this.depth - 1).setPosition(this.x, this.y);
    const gs = { r: 10, a: 0.3 };
    this.scene.tweens.add({
      targets: gs, r: 28, a: 0.85, duration: 700, ease: 'Quad.In',
      onUpdate: () => {
        glowG.clear();
        glowG.fillStyle(0x4488ff, gs.a * 0.28);
        glowG.fillCircle(0, 0, gs.r);
        glowG.lineStyle(2.5, 0x88ccff, gs.a);
        glowG.strokeCircle(0, 0, gs.r);
      },
    });

    this.stateTimer = this.scene.time.delayedCall(750, () => {
      glowG.destroy();
      this.launchMines();
      this.stateTimer = this.scene.time.delayedCall(MINE_FUSE_MS + 600, () => this.enterIdle());
    });
  }

  private launchMines(): void {
    const count = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const [px, py] = this.getTargetPos();

    for (let i = 0; i < count; i++) {
      const offsetAngle = Math.random() * Math.PI * 2;
      const offsetDist  = Phaser.Math.FloatBetween(20, MINE_SCATTER);
      const tx = px + Math.cos(offsetAngle) * offsetDist;
      const ty = py + Math.sin(offsetAngle) * offsetDist;
      this.launchOneMine(tx, ty, i * 130);
    }
  }

  private launchOneMine(tx: number, ty: number, delay: number): void {
    this.scene.time.delayedCall(delay, () => {
      const projG = this.scene.add.graphics().setDepth(this.depth + 2);
      projG.fillStyle(0x44aaff, 1.0);
      projG.fillCircle(0, 0, 6);
      projG.lineStyle(2, 0xaaddff, 0.9);
      projG.strokeCircle(0, 0, 9);

      const prog = { t: 0 };
      const sx = this.x, sy = this.y;
      const peakY = Math.min(sy, ty) - 38;

      this.scene.tweens.add({
        targets: prog, t: 1, duration: 500, ease: 'Linear',
        onUpdate: () => {
          const t = prog.t;
          projG.setPosition(
            sx + (tx - sx) * t,
            sy * (1-t)*(1-t) + peakY * 2*t*(1-t) + ty * t*t,
          );
        },
        onComplete: () => {
          projG.destroy();
          this.placeMine(tx, ty);
        },
      });
    });
  }

  private placeMine(x: number, y: number): void {
    const mineG = this.scene.add.graphics().setDepth(9).setPosition(x, y);
    this.drawMineCrystal(mineG);

    // 爆炸範圍圈（閃爍，頻率隨倒數加快）
    const ringG = this.scene.add.graphics().setDepth(7).setPosition(x, y);
    const drawRing = (alpha: number) => {
      ringG.clear();
      ringG.fillStyle(0x4488ff, alpha * 0.12);
      ringG.fillCircle(0, 0, MINE_RADIUS);
      ringG.lineStyle(2.5, 0x88ccff, alpha);
      ringG.strokeCircle(0, 0, MINE_RADIUS);
    };
    drawRing(0.8);

    // 水晶本體 + 範圍圈一起閃爍，頻率越來越快
    const blink = { a: 1 };
    let blinkMs = 400;
    const reblink = (): Phaser.Tweens.Tween => this.scene.tweens.add({
      targets: blink, a: 0.1, duration: blinkMs, yoyo: true,
      onYoyo: () => { blinkMs = Math.max(60, blinkMs - 25); },
      onUpdate: () => { mineG.setAlpha(blink.a); drawRing(blink.a); },
      onComplete: reblink,
    });
    const blinkTween = reblink();

    this.scene.time.delayedCall(MINE_FUSE_MS, () => {
      blinkTween.stop();
      mineG.destroy();
      ringG.destroy();
      this.explodeMine(x, y);
    });
  }

  private explodeMine(x: number, y: number): void {
    this.scene.cameras.main.shake(120, 0.010);

    const shockG = this.scene.add.graphics().setDepth(20).setPosition(x, y);
    const ss = { r: 10, a: 1 };
    this.scene.tweens.add({
      targets: ss, r: MINE_RADIUS * 1.25, a: 0, duration: 380, ease: 'Quad.Out',
      onUpdate: () => {
        shockG.clear();
        shockG.lineStyle(4, 0x88ccff, ss.a);
        shockG.strokeCircle(0, 0, ss.r);
        shockG.lineStyle(14, 0x4488ff, ss.a * 0.22);
        shockG.strokeCircle(0, 0, ss.r);
      },
      onComplete: () => shockG.destroy(),
    });

    const shards = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 110, max: 300 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xaaddff, 0x88ccff, 0x66aaee],
      lifespan: { min: 200, max: 520 },
      emitting: false,
    }).setDepth(21);
    shards.emitParticleAt(0, 0, 50);
    this.scene.time.delayedCall(650, () => { if (shards.active) shards.destroy(); });

    // 殘留冰地板

    this.onMineExplode?.(x, y, MINE_RADIUS, MINE_DMG);
  }

  private drawMineCrystal(g: Phaser.GameObjects.Graphics): void {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      pts.push(new Phaser.Math.Vector2(Math.cos(a) * 10, Math.sin(a) * 10));
    }
    g.fillStyle(0x88ddff, 0.88);
    g.fillPoints(pts, true);
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.strokePoints(pts, true);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(0, 0, 3);
  }
}
