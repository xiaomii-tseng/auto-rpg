import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  protected damage = 10;
  private speed = 400;
  private lifespan = 2000; // ms
  private lifespanTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'bullet');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setActive(false).setVisible(false);
    this.setDepth(15);
  }

  configure(dmg: number, tint: number): this {
    this.damage = dmg;
    this.setTint(tint);
    return this;
  }

  fire(fromX: number, fromY: number, targetX: number, targetY: number): void {
    this.lifespanTimer?.remove(false);

    this.setPosition(fromX, fromY);
    this.setActive(true).setVisible(true);

    const angle = Phaser.Math.Angle.Between(fromX, fromY, targetX, targetY);
    this.scene.physics.velocityFromAngle(Phaser.Math.RadToDeg(angle), this.speed, this.body!.velocity as Phaser.Math.Vector2);
    this.setRotation(angle + Math.PI / 2);

    this.lifespanTimer = this.scene.time.delayedCall(this.lifespan, () => this.deactivate());
  }

  deactivate(): void {
    this.lifespanTimer?.remove(false);
    this.lifespanTimer = null;
    this.setActive(false).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).reset(0, 0);
  }

  get dmg(): number {
    return this.damage;
  }
}
