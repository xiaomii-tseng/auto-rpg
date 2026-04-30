import Phaser from 'phaser';

export class StrikeEffect {
  static readonly RADIUS = 60;

  constructor(private readonly scene: Phaser.Scene) {}

  play(
    x: number,
    y: number,
    enemies: Phaser.Physics.Arcade.Sprite[],
    onHit: (e: Phaser.Physics.Arcade.Sprite) => void,
  ): void {
    const r = StrikeEffect.RADIUS;
    const radiusSq = r * r;

    for (const e of enemies) {
      if (!e.active) continue;
      if (Phaser.Math.Distance.BetweenPointsSquared({ x, y }, e) <= radiusSq) onHit(e);
    }

    const gfx = this.scene.add.graphics().setDepth(18);

    gfx.fillStyle(0xffffaa, 0.55);
    gfx.fillCircle(x, y, r);
    gfx.lineStyle(3, 0xffff00, 1);
    gfx.strokeCircle(x, y, r);

    // Jagged bolts from centre to edge
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const mx = x + Math.cos(a + 0.35) * r * 0.55;
      const my = y + Math.sin(a + 0.35) * r * 0.55;
      gfx.lineStyle(2, 0xffffff, 0.9);
      gfx.beginPath();
      gfx.moveTo(x, y);
      gfx.lineTo(mx, my);
      gfx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      gfx.strokePath();
    }

    this.scene.tweens.add({
      targets: gfx,
      alpha: 0,
      duration: 380,
      ease: 'Quad.easeIn',
      onComplete: () => gfx.destroy(),
    });
  }
}
