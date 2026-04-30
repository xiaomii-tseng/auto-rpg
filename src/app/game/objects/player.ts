import Phaser from 'phaser';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving = false;
  private readonly speed = 180;

  private hp = 100;
  private readonly maxHp = 100;
  private invincible = false;
  private flashTween?: Phaser.Tweens.Tween;
  private playingHurt = false;

  private readonly headGfx: Phaser.GameObjects.Graphics;
  private ammoCurrent = 0;
  private ammoMax = 0;
  private ammoColor = 0xffdd44;
  private noAmmoFlashUntil = 0;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player_idle', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(1.5);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setBodySize(22, 32).setOffset(21, 16);
    this.play('player_idle');

    this.headGfx = scene.add.graphics().setDepth(15);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.refreshHeadDisplay();
  }

  /** Call when ammo state changes so the display updates. */
  showAmmo(current: number, max: number, color = 0xffdd44): void {
    this.ammoCurrent = current;
    this.ammoMax     = max;
    this.ammoColor   = color;
  }

  /** Flash ammo squares red briefly to signal empty-gun attempt. */
  noAmmoFlash(): void {
    this.noAmmoFlashUntil = this.scene.time.now + 280;
  }

  private refreshHeadDisplay(): void {
    this.headGfx.clear();
    if (!this.active) return;

    const now = this.scene.time.now;
    const flashing = now < this.noAmmoFlashUntil;

    // ── Ammo squares ──────────────────────────────────
    if (this.ammoMax > 0) {
      const sqSz = 7, sqGap = 3;
      const totalW = this.ammoMax * sqSz + (this.ammoMax - 1) * sqGap;
      const sqX0 = this.x - totalW / 2;
      const sqY  = this.y - 78;

      for (let i = 0; i < this.ammoMax; i++) {
        const sx = sqX0 + i * (sqSz + sqGap);
        const charged = i < this.ammoCurrent;
        if (flashing) {
          this.headGfx.fillStyle(0xff2222, 1);
        } else {
          this.headGfx.fillStyle(charged ? this.ammoColor : 0x333333, 1);
        }
        this.headGfx.fillRect(sx, sqY, sqSz, sqSz);
        // Small highlight on charged squares
        if (charged && !flashing) {
          this.headGfx.fillStyle(0xffffff, 0.35);
          this.headGfx.fillRect(sx + 1, sqY + 1, 3, 2);
        }
      }
    }

    // ── HP bar ────────────────────────────────────────
    const bw = 44, bh = 5;
    const bx = this.x - bw / 2;
    const by = this.y - 68;
    this.headGfx.fillStyle(0x220000);
    this.headGfx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const pct = this.hp / this.maxHp;
    const color = pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this.headGfx.fillStyle(color);
    this.headGfx.fillRect(bx, by, bw * pct, bh);
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
