const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);
import Phaser from 'phaser';
import { CardStore } from '../data/card-store';

export class Player extends Phaser.Physics.Arcade.Sprite {
  private isMoving    = false;
  private isAttacking = false;
  private onCooldown  = false;
  private rooted      = false;
  speedMult           = 1;
  slowMult            = 1;
  noInterrupt         = false;
  lastDir: 'down' | 'left' | 'right' | 'up' = 'down';

  private hp:    number;
  private maxHp: number;
  private invincible  = false;
  divineShieldDef = 0;  // 神盾護體臨時 DEF 加成
  defBonus        = 0;  // 防禦力藥水加成
  speedBonus      = 0;  // 速度藥水加成
  private flashTween?: Phaser.Tweens.Tween;
  private playingHurt = false;

  private readonly headGfx: Phaser.GameObjects.Graphics;

  onHpChanged?: (hp: number, maxHp: number) => void;
  onDead?: () => void;
  onEvade?: (x: number, y: number) => void;
  onAttackAnim?: (key: string, targetAngle?: number) => void;
  onBlazing?: (x: number, y: number) => void;

  private _blazingCooldown = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player_idle_shadow', 0);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setScale(1.5 * DPR);
    this.setCollideWorldBounds(true);
    this.setDepth(10);
    this.setBodySize(16, 11).setOffset(24, 37);
    this.play('player_idle_down');

    const stats = CardStore.getTotalStats();
    this.maxHp = stats.maxHp;
    this.hp    = stats.maxHp;

    this.headGfx = scene.add.graphics().setDepth(9800);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this.refreshHeadDisplay();
  }

  private refreshHeadDisplay(): void {
    this.headGfx.clear();
    if (!this.active) return;
    const bw = P(44), bh = P(5);
    const bx = this.x - bw / 2;
    const by = this.y - P(35);
    this.headGfx.fillStyle(0x220000);
    this.headGfx.fillRect(bx - P(1), by - P(1), bw + P(2), bh + P(2));
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
    this.onAttackAnim?.(key);
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
    this.onAttackAnim?.('player_whirlwind');
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
    this.onAttackAnim?.(key, Math.atan2(dy, dx));
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
    const speed  = (CardStore.getTotalStats().speed + this.speedBonus) * this.speedMult * this.slowMult * DPR;
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
    const stats   = CardStore.getTotalStats();
    const evasion = stats.evasion;
    if (evasion > 0 && Math.random() < evasion) { this.onEvade?.(this.x, this.y); return; }
    const def       = stats.def + this.divineShieldDef + this.defBonus;
    const reduction = def / (def + 65);
    const takenMult = 1 + (stats.takenDmgPct ?? 0);
    const actual    = Math.max(1, Math.round(amount * (1 - reduction) * takenMult));
    this.hp = Math.max(0, this.hp - actual);
    this.onHpChanged?.(this.hp, this.maxHp);
    if (this.hp <= 0) {
      this.headGfx.clear();
      (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.onDead?.();
      return;
    }
    // 業火盾：受擊觸發（2.5s 觸發鎖定）
    const blazeChance = stats.blazingShieldChance ?? 0;
    const now = this.scene.time.now;
    if (blazeChance > 0 && now > this._blazingCooldown && Math.random() < blazeChance) {
      this._blazingCooldown = now + 2500;
      this.onBlazing?.(this.x, this.y);
    }
    this.startInvincibility();
  }

  revive(hpPercent: number): void {
    this.hp = Math.max(1, Math.ceil(this.maxHp * hpPercent));
    this.setActive(true).setVisible(true);
    this.onHpChanged?.(this.hp, this.maxHp);
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

    this.scene.time.delayedCall(600, () => {
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
