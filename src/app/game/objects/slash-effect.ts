import Phaser from 'phaser';

type Dir = 'down' | 'left' | 'right' | 'up';

const DIR_ANGLE: Record<Dir, number> = {
  right: 0,
  down:  Math.PI / 2,
  left:  Math.PI,
  up:    -Math.PI / 2,
};

export class SlashEffect {
  constructor(private readonly scene: Phaser.Scene) {}

  play(x: number, y: number, dir: Dir): void {
    const base = DIR_ANGLE[dir];
    const DEPTH = 60;

    // ── 外層發光弧（寬、低透明） ──────────────────────────
    const glow = this.scene.add.graphics().setDepth(DEPTH);
    const glowSlashes = [
      { offset: -0.6, len: 62, width: 10, alpha: 0.18 },
      { offset:  0.0, len: 80, width: 12, alpha: 0.25 },
      { offset:  0.6, len: 62, width: 10, alpha: 0.18 },
    ];
    for (const s of glowSlashes) {
      const a = base + s.offset;
      const cos = Math.cos(a), sin = Math.sin(a);
      const perp = a + Math.PI / 2;
      const px = Math.cos(perp) * 10, py = Math.sin(perp) * 10;
      glow.lineStyle(s.width, 0x88ddff, s.alpha);
      glow.beginPath();
      glow.moveTo(x - cos * s.len * 0.42, y - sin * s.len * 0.42);
      glow.lineTo(x + cos * s.len * 0.2 + px, y + sin * s.len * 0.2 + py);
      glow.lineTo(x + cos * s.len * 0.58, y + sin * s.len * 0.58);
      glow.strokePath();
    }

    // ── 主要刀弧（白芯 + 淡藍邊） ────────────────────────
    const gfx = this.scene.add.graphics().setDepth(DEPTH + 1);
    const slashes = [
      { offset: -0.55, len: 56, width: 2.5, alpha: 0.75 },
      { offset:  0.0,  len: 74, width: 3.5, alpha: 1.0  },
      { offset:  0.55, len: 56, width: 2.5, alpha: 0.75 },
    ];
    for (const s of slashes) {
      const a = base + s.offset;
      const cos = Math.cos(a), sin = Math.sin(a);
      const perp = a + Math.PI / 2;
      const px = Math.cos(perp) * 9, py = Math.sin(perp) * 9;

      // 藍邊光
      gfx.lineStyle(s.width + 2, 0x66ccff, s.alpha * 0.45);
      gfx.beginPath();
      gfx.moveTo(x - cos * s.len * 0.42, y - sin * s.len * 0.42);
      gfx.lineTo(x + cos * s.len * 0.22 + px, y + sin * s.len * 0.22 + py);
      gfx.lineTo(x + cos * s.len * 0.58, y + sin * s.len * 0.58);
      gfx.strokePath();

      // 白芯
      gfx.lineStyle(s.width, 0xffffff, s.alpha);
      gfx.beginPath();
      gfx.moveTo(x - cos * s.len * 0.42, y - sin * s.len * 0.42);
      gfx.lineTo(x + cos * s.len * 0.22 + px, y + sin * s.len * 0.22 + py);
      gfx.lineTo(x + cos * s.len * 0.58, y + sin * s.len * 0.58);
      gfx.strokePath();
    }

    // ── 中心閃光（多層圓） ────────────────────────────────
    const flash = this.scene.add.graphics().setDepth(DEPTH + 2);
    flash.fillStyle(0x88ddff, 0.35); flash.fillCircle(x, y, 18);
    flash.fillStyle(0xffffff, 0.55); flash.fillCircle(x, y, 10);
    flash.fillStyle(0xffffff, 1.0);  flash.fillCircle(x, y, 5);

    // ── 衝擊環（向外擴散） ────────────────────────────────
    const ring = this.scene.add.graphics().setDepth(DEPTH + 1);
    const ringState = { r: 6, a: 0.9 };
    this.scene.tweens.add({
      targets: ringState, r: 32, a: 0, duration: 200, ease: 'Quad.Out',
      onUpdate: () => {
        ring.clear();
        ring.lineStyle(2, 0x88ddff, ringState.a * 0.8);
        ring.strokeCircle(x, y, ringState.r);
        ring.lineStyle(1, 0xffffff, ringState.a * 0.5);
        ring.strokeCircle(x, y, ringState.r * 0.6);
      },
      onComplete: () => ring.destroy(),
    });

    // ── 方向性火花（沿攻擊方向噴出） ─────────────────────
    const sparkGfx = this.scene.add.graphics().setDepth(DEPTH + 2);
    const sparkCount = 5;
    const sparks: { cx: number; cy: number; vx: number; vy: number; life: number; maxLife: number }[] = [];
    for (let i = 0; i < sparkCount; i++) {
      const spreadAngle = base + Phaser.Math.FloatBetween(-0.5, 0.5);
      const speed = Phaser.Math.FloatBetween(140, 280);
      sparks.push({
        cx: x, cy: y,
        vx: Math.cos(spreadAngle) * speed,
        vy: Math.sin(spreadAngle) * speed,
        life: 0, maxLife: Phaser.Math.FloatBetween(100, 180),
      });
    }
    const sparkTimer = this.scene.time.addEvent({
      delay: 16, repeat: 12,
      callback: () => {
        sparkGfx.clear();
        const dt = 0.016;
        sparks.forEach(s => {
          s.life += 16;
          s.cx += s.vx * dt;
          s.cy += s.vy * dt;
          s.vx *= 0.88;
          s.vy *= 0.88;
          const t = s.life / s.maxLife;
          if (t >= 1) return;
          const a = 1 - t;
          sparkGfx.fillStyle(t < 0.3 ? 0xffffff : 0x88ddff, a * 0.9);
          sparkGfx.fillCircle(s.cx, s.cy, (1 - t) * 3 + 1);
        });
      },
    });
    this.scene.time.delayedCall(220, () => { sparkTimer.destroy(); sparkGfx.destroy(); });

    // ── 全向粒子爆發 ──────────────────────────────────────
    const burst = this.scene.add.particles(x, y, 'pxl2', {
      speed:    { min: 60, max: 200 },
      angle:    { min: 0, max: 360 },
      scale:    { start: 1.6, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [0xffffff, 0xaaddff, 0x66bbff, 0xffffff],
      lifespan: { min: 70, max: 190 },
      emitting: false,
    }).setDepth(DEPTH + 2);
    burst.emitParticleAt(x, y, 14);
    this.scene.time.delayedCall(280, () => { if (burst.active) burst.destroy(); });

    // ── 淡出並銷毀 ────────────────────────────────────────
    this.scene.tweens.add({
      targets: [glow, gfx, flash],
      alpha: 0, duration: 160, ease: 'Quad.easeIn',
      onComplete: () => { glow.destroy(); gfx.destroy(); flash.destroy(); },
    });
  }
}
