import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving = false;
  private attackTimer?: Phaser.Time.TimerEvent;
  private attackCooldown = 600; // ms between shots
  private lastFireTime = -Infinity;
  private attackRange = 300;
  private speed = 180;

  // Callback set by scene to fire a bullet toward a target
  onFire?: (fromX: number, fromY: number, targetX: number, targetY: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
  }

  move(velX: number, velY: number): void {
    const moving = velX !== 0 || velY !== 0;

    if (moving) {
      const len = Math.sqrt(velX * velX + velY * velY);
      this.setVelocity((velX / len) * this.speed, (velY / len) * this.speed);
      this.setFlipX(velX < 0);
      this.isMoving = true;
      this.stopAttacking();
    } else {
      this.setVelocity(0, 0);
      this.isMoving = false;
    }
  }

  startAttacking(enemies: Phaser.GameObjects.Group): void {
    if (this.attackTimer || this.isMoving) return;
    this.attackTimer = this.scene.time.addEvent({
      delay: this.attackCooldown,
      loop: true,
      callback: () => this.tryAttack(enemies),
      callbackScope: this,
    });
    // Fire immediately on stop
    this.tryAttack(enemies);
  }

  stopAttacking(): void {
    if (this.attackTimer) {
      this.attackTimer.destroy();
      this.attackTimer = undefined;
    }
  }

  private tryAttack(enemies: Phaser.GameObjects.Group): void {
    if (this.isMoving) return;
    if (this.scene.time.now - this.lastFireTime < this.attackCooldown) return;

    const alive = enemies.getChildren().filter(
      (e) => (e as Phaser.GameObjects.GameObject & { active: boolean }).active
    ) as Phaser.Physics.Arcade.Sprite[];

    if (alive.length === 0) return;

    // Find nearest enemy within range (squared distance avoids sqrt per enemy)
    let nearest: Phaser.Physics.Arcade.Sprite | null = null;
    let minDistSq = this.attackRange * this.attackRange;

    for (const enemy of alive) {
      const distSq = Phaser.Math.Distance.BetweenPointsSquared(this, enemy);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = enemy;
      }
    }

    if (nearest && this.onFire) {
      this.lastFireTime = this.scene.time.now;
      this.onFire(this.x, this.y, nearest.x, nearest.y);
    }
  }

  get moving(): boolean {
    return this.isMoving;
  }

  get range(): number {
    return this.attackRange;
  }
}
