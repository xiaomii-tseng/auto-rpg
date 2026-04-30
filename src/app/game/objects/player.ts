import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving = false;
  private readonly speed = 180;

  private hp = 100;
  private readonly maxHp = 100;
  private invincible = false;
  private flashTween?: Phaser.Tweens.Tween;
  private playingHurt = false;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player_idle', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(2);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    // Body centered on the sprite (local coords, scaled ×2 in world)
    this.setBodySize(22, 32).setOffset(21, 16);
    this.play('player_idle');
  }

  move(velX: number, velY: number): void {
    const moving = velX !== 0 || velY !== 0;
    if (moving) {
      const len = Math.sqrt(velX * velX + velY * velY);
      this.setVelocity((velX / len) * this.speed, (velY / len) * this.speed);
      if (velX !== 0) this.setFlipX(velX < 0);
      this.isMoving = true;
      if (!this.playingHurt) this.playAnim('player_walk');
    } else {
      this.setVelocity(0, 0);
      this.isMoving = false;
      if (!this.playingHurt) this.playAnim('player_idle');
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
    this.playingHurt = true;
    this.flashTween?.stop();

    this.play('player_hurt', true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.playingHurt = false;
      this.playAnim(this.isMoving ? 'player_walk' : 'player_idle');
    });

    this.flashTween = this.scene.tweens.add({
      targets: this,
      alpha: 0.2,
      duration: 80,
      yoyo: true,
      repeat: 5,
    });

    this.scene.time.delayedCall(1000, () => {
      this.invincible = false;
      this.setAlpha(1);
      this.flashTween?.stop();
    });
  }

  private playAnim(key: string): void {
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.play(key, true);
  }

  get moving(): boolean { return this.isMoving; }
  get currentHp(): number { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }
}
