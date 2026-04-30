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
    const gfx  = this.scene.add.graphics().setDepth(25);

    // 3 slash arcs fanning around the swing direction
    const slashes = [
      { offset: -0.55, len: 52, width: 3, alpha: 0.7 },
      { offset:  0.0,  len: 68, width: 4, alpha: 1.0 },
      { offset:  0.55, len: 52, width: 3, alpha: 0.7 },
    ];

    for (const s of slashes) {
      const a = base + s.offset;
      const cos = Math.cos(a);
      const sin = Math.sin(a);
      // Draw the slash as a thick line with a midpoint bulge
      const mid = s.len * 0.55;
      gfx.lineStyle(s.width, 0xffffff, s.alpha);
      gfx.beginPath();
      gfx.moveTo(x - cos * s.len * 0.45, y - sin * s.len * 0.45);
      // slight perpendicular bulge at midpoint for arc feel
      const px = Math.cos(a + Math.PI / 2) * 8;
      const py = Math.sin(a + Math.PI / 2) * 8;
      gfx.lineTo(x + cos * mid * 0.4 + px, y + sin * mid * 0.4 + py);
      gfx.lineTo(x + cos * s.len * 0.55, y + sin * s.len * 0.55);
      gfx.strokePath();
    }

    // Bright centre flash
    gfx.fillStyle(0xffffff, 0.9);
    gfx.fillCircle(x, y, 8);
    gfx.fillStyle(0xaaeeff, 0.6);
    gfx.fillCircle(x, y, 14);

    // Small particle burst
    const emitter = this.scene.add.particles(x, y, 'pxl2', {
      speed:    { min: 80, max: 220 },
      angle:    { min: 0, max: 360 },
      scale:    { start: 1.8, end: 0 },
      alpha:    { start: 1, end: 0 },
      tint:     [0xffffff, 0xaaeeff, 0x88ccff],
      lifespan: { min: 80, max: 200 },
      emitting: false,
    }).setDepth(26);
    emitter.emitParticleAt(x, y, 18);
    this.scene.time.delayedCall(280, () => { if (emitter.active) emitter.destroy(); });

    this.scene.tweens.add({
      targets:  gfx,
      alpha:    0,
      duration: 180,
      ease:     'Quad.easeIn',
      onComplete: () => gfx.destroy(),
    });
  }
}
