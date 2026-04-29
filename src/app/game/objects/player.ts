import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving = false;
  private readonly speed = 180;

  private hp = 100;
  private readonly maxHp = 100;
  private invincible = false;
  private flashTween?: Phaser.Tweens.Tween;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;

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
    } else {
      this.setVelocity(0, 0);
      this.isMoving = false;
    }
  }

  takeDamage(amount: number): void {
    if (this.invincible || !this.active) return;
    this.hp = Math.max(0, this.hp - amount);
    this.onHpChanged?.(this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.onDead?.();
      return;
    }
    this.startInvincibility();
  }

  private startInvincibility(): void {
    this.invincible = true;
    this.flashTween?.stop();
    this.flashTween = this.scene.tweens.add({
      targets: this,
      alpha: 0.15,
      duration: 80,
      yoyo: true,
      repeat: 5,
    });
    // 1 second invincibility window
    this.scene.time.delayedCall(1000, () => {
      this.invincible = false;
      this.setAlpha(1);
      this.flashTween?.stop();
    });
  }

  get moving(): boolean { return this.isMoving; }
  get currentHp(): number { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }
}
