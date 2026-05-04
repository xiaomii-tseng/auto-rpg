import Phaser from 'phaser';
import { PlayerStore } from '../data/player-store';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving    = false;
  private isAttacking = false;
  private onCooldown  = false;
  private rooted      = false;
  speedMult           = 1;
  noInterrupt         = false;
  lastDir: 'down' | 'left' | 'right' | 'up' = 'down';

  private hp:    number;
  private maxHp: number;
  private invincible  = false;
  private flashTween?: Phaser.Tweens.Tween;
  private playingHurt = false;

  private readonly headGfx: Phaser.GameObjects.Graphics;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player_idle_shadow', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(1.5);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setBodySize(16, 11).setOffset(24, 37);
    this.play('player_idle_down');

    const stats = PlayerStore.getStats();
    this.maxHp = stats.maxHp;
    this.hp    = stats.maxHp;

    this.headGfx = scene.add.graphics().setDepth(1000);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.refreshHeadDisplay();
  }

  private refreshHeadDisplay(): void {
    this.headGfx.clear();
    if (!this.active) return;
    const bw = 44, bh = 5;
    const bx = this.x - bw / 2;
    const by = this.y - 52;
    this.headGfx.fillStyle(0x220000);
    this.headGfx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const pct   = this.hp / this.maxHp;
    const color = pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this.headGfx.fillStyle(color);
    this.headGfx.fillRect(bx, by, bw * pct, bh);
  }

  lockAttack(ms: number): boolean {
    if (this.playingHurt || this.isAttacking || this.onCooldown) return false;
    this.isAttacking = true;
    this.scene.time.delayedCall(ms, () => {
      this.isAttacking = false;
      if (!this.playingHurt)
        this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
    });
    return true;
  }

  // 冷卻鎖：只管冷卻，不碰 isAttacking
  lockCooldown(ms: number): boolean {
    if (this.playingHurt || this.isAttacking || this.onCooldown) return false;
    this.onCooldown = true;
    this.scene.time.delayedCall(ms, () => { this.onCooldown = false; });
    return true;
  }

  // 播放攻擊動畫並自動管理 isAttacking，完成後自動恢復移動動畫
  startAttackAnim(key: string): void {
    this.isAttacking = true;
    this.play(key, true);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.isAttacking = false;
      if (!this.playingHurt)
        this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
    });
  }

  releaseAnimLock(): void {
    this.isAttacking = false;
    if (!this.playingHurt)
      this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
  }

  playWhirlwind(onHit?: () => void): void {
    if (this.playingHurt || this.isAttacking) return;
    this.isAttacking = true;
    this.play('player_whirlwind', true);
    if (onHit) this.scene.time.delayedCall(150, () => { if (this.isAttacking) onHit(); });
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.isAttacking = false;
      this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
    });
  }

  playAttack(targetX: number, targetY: number, onHit?: () => void): void {
    if (this.playingHurt || this.isAttacking) return;
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const dir: 'down' | 'left' | 'right' | 'up' =
      Math.abs(dx) >= Math.abs(dy)
        ? (dx < 0 ? 'left' : 'right')
        : (dy < 0 ? 'up'   : 'down');
    this.lastDir    = dir;
    this.isAttacking = true;
    const key = this.isMoving ? `player_run_attack_${dir}` : `player_attack_${dir}`;
    this.play(key, true);
    if (onHit) this.scene.time.delayedCall(150, () => { if (this.isAttacking) onHit(); });
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.isAttacking = false;
      this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
    });
  }

  setRooted(ms: number): void {
    this.rooted = true;
    this.setVelocity(0, 0);
    this.scene.time.delayedCall(ms, () => { this.rooted = false; });
  }

  move(velX: number, velY: number): void {
    if (this.rooted) { this.setVelocity(0, 0); return; }
    const speed  = PlayerStore.getStats().speed * this.speedMult;
    const moving = velX !== 0 || velY !== 0;
    if (moving) {
      const len = Math.sqrt(velX * velX + velY * velY);
      this.setVelocity((velX / len) * speed, (velY / len) * speed);
      this.lastDir = Math.abs(velX) >= Math.abs(velY)
        ? (velX < 0 ? 'left' : 'right')
        : (velY < 0 ? 'up'   : 'down');
      this.isMoving = true;
      if (!this.playingHurt && !this.isAttacking) this.playAnim(`player_run_${this.lastDir}`);
    } else {
      this.setVelocity(0, 0);
      this.isMoving = false;
      if (!this.playingHurt && !this.isAttacking) this.playAnim(`player_idle_${this.lastDir}`);
    }
  }

  takeDamage(amount: number): void {
    if (this.invincible || !this.active) return;
    const def    = PlayerStore.getStats().def;
    const actual = Math.max(1, amount - def);
    this.hp = Math.max(0, this.hp - actual);
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

    if (!this.noInterrupt) {
      this.playingHurt = true;
      this.play('player_hurt', true);
      this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.playingHurt = false;
        this.playAnim(this.isMoving ? `player_run_${this.lastDir}` : `player_idle_${this.lastDir}`);
      });
    }

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

  heal(amount: number): void {
    if (!this.active || amount <= 0) return;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    this.onHpChanged?.(this.hp, this.maxHp);
  }

  get moving(): boolean    { return this.isMoving; }
  get currentHp(): number  { return this.hp; }
  get maxHpValue(): number { return this.maxHp; }
  get attackDir(): 'down' | 'left' | 'right' | 'up' { return this.lastDir; }

  override destroy(fromScene?: boolean): void {
    this.headGfx?.destroy();
    super.destroy(fromScene);
  }
}
