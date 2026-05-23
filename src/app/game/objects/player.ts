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

  // ── Shield system ──
  private _shield                  = 0;
  private _lastKillTime            = -99999;
  private _killShieldDecayStartTime= -1;
  private _killShieldAtDecayStart  = 0;
  private _lastDamageTakenTime     = -99999;

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
    this.maxHp  = stats.maxHp;
    this.hp     = stats.maxHp;
    this._shield = stats.regenShieldMax ?? 0;

    this.headGfx = scene.add.graphics().setDepth(9800);
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    this._updateShield(time, delta);
    this.refreshHeadDisplay();
  }

  private _updateShield(now: number, delta: number): void {
    const stats    = CardStore.getTotalStats();
    const regenMax = stats.regenShieldMax ?? 0;
    if (this._shield > regenMax) {
      // Kill shield decays to regenMax floor after 3s since last kill
      if (now - this._lastKillTime >= 3000) {
        if (this._killShieldDecayStartTime < 0) {
          this._killShieldDecayStartTime = now;
          this._killShieldAtDecayStart   = this._shield;
        }
        const t = Math.min((now - this._killShieldDecayStartTime) / 2000, 1);
        this._shield = Math.max(regenMax, Math.round(
          this._killShieldAtDecayStart * (1 - t) + regenMax * t
        ));
      }
    } else if (regenMax > 0 && this._shield < regenMax) {
      // 受傷後 2.5 秒才開始回填，每秒 25%
      if (now - this._lastDamageTakenTime >= 2500) {
        this._shield = Math.min(regenMax, this._shield + regenMax * 0.25 * delta / 1000);
      }
    }
  }

  private refreshHeadDisplay(): void {
    this.headGfx.clear();
    if (!this.active) return;
    const bw = P(44), bh = P(5);
    const bx = this.x - bw / 2;
    const by = this.y - P(35);

    // HP bar background + fill
    this.headGfx.fillStyle(0x220000, 1);
    this.headGfx.fillRect(bx - P(1), by - P(1), bw + P(2), bh + P(2));
    const pct   = this.hp / this.maxHp;
    const color = pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this.headGfx.fillStyle(color, 1);
    this.headGfx.fillRect(bx, by, bw * pct, bh);

    // 護盾：藍色直接疊在血條上方
    const shieldVal = Math.floor(this._shield);
    if (shieldVal > 0) {
      const cap = Math.max(Math.round(this.maxHp * 0.5), 1);
      const shieldPct = Math.min(shieldVal / cap, 1);
      const isKillShield = shieldVal > (CardStore.getTotalStats().regenShieldMax ?? 0);
      this.headGfx.fillStyle(isKillShield ? 0xffcc00 : 0x2266cc, isKillShield ? 0.85 : 1.0);
      this.headGfx.fillRect(bx, by, bw * shieldPct, bh);
    }
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
  startAttackAnim(key: string, targetAngle?: number): void {
    this.onAttackAnim?.(key, targetAngle);
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
    if (evasion > 0 && Math.random() < evasion) { this.onEvade?.(this.x, this.y); this.startInvincibility(false); return; }
    const def       = stats.def + this.divineShieldDef + this.defBonus;
    const reduction = def / (def + 65);
    const takenMult = 1 + (stats.takenDmgPct ?? 0);
    let actual = Math.max(1, Math.round(amount * (1 - reduction) * takenMult));
    if (stats.damageCap) actual = Math.min(actual, Math.round(this.maxHp * stats.damageCap));
    // Shield absorbs damage first
    this._lastDamageTakenTime = this.scene.time.now;
    if (this._shield > 0) {
      const absorbed = Math.min(Math.floor(this._shield), actual);
      this._shield -= absorbed;
      actual -= absorbed;
      if (actual <= 0) {
        this.onHpChanged?.(this.hp, this.maxHp);
        this.startInvincibility(false);
        return;
      }
    }
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

  // 黑夜降靈懲罰：強制把 HP 壓到 1%（不觸發死亡，只播受傷動畫）
  punishNearDeath(): void {
    const floor = Math.max(1, Math.ceil(this.maxHp * 0.01));
    if (this.hp <= floor) return;
    this.hp = floor;
    this.onHpChanged?.(this.hp, this.maxHp);
    this.startInvincibility();
  }

  private startInvincibility(playHurt = true): void {
    this.invincible = true;
    this.flashTween?.stop();

    if (playHurt && !this.noInterrupt) {
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

  addKillShield(amount: number): void {
    if (amount <= 0) return;
    this._shield = Math.min(this._shield + amount, Math.round(this.maxHp * 0.5));
    this._lastKillTime             = this.scene.time.now;
    this._killShieldDecayStartTime = -1;
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
