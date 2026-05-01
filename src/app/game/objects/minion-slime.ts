import Phaser from 'phaser';

enum MinionState {
  IDLE      = 'IDLE',
  DASH_WARN = 'DASH_WARN',
  DASHING   = 'DASHING',
  DEAD      = 'DEAD',
}

export class MinionSlime extends Phaser.Physics.Arcade.Sprite {
  private mState     = MinionState.IDLE;
  private started    = false;
  private hp:        number;
  private readonly maxHp: number;
  private stateTimer?: Phaser.Time.TimerEvent;
  private hpBarGfx:  Phaser.GameObjects.Graphics;
  private dir: 'down' | 'left' | 'right' | 'up' = 'down';
  private atkX = 0;
  private atkY = 0;
  private pb!: Phaser.Physics.Arcade.Body;   // stable body reference

  static readonly CHASE_SPEED = 90;
  static readonly STOP_RANGE  = 55;
  static readonly DASH_SPEED  = 310;
  static readonly DASH_MS     = 520;

  getTargetPos: () => [number, number] = () => [0, 0];
  onDead?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, hp = 150) {
    super(scene, x, y, 'slime_idle', 0);
    this.hp    = hp;
    this.maxHp = hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.pb = this.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.pb.setSize(19, 12).setOffset(23, 29);
    this.setScale(1.3);
    this.setDepth(12);
    this.play('slime_idle_down', true);
    this.setVisible(false);
    this.hpBarGfx = scene.add.graphics().setDepth(50);
  }

  start(): void {
    this.started = true;
    this.setVisible(true);
    this.enterIdle();
  }

  takeDamage(amount: number): void {
    if (this.mState === MinionState.DEAD) return;
    this.hp = Math.max(0, this.hp - amount);
    this.setTint(0xff8888);
    this.scene.time.delayedCall(120, () => {
      if (this.mState !== MinionState.DEAD) this.clearTint();
    });
    if (this.hp <= 0) this.die();
  }

  knockback(fromX: number, fromY: number, power = 80): void {
    if (this.mState === MinionState.DEAD || this.mState === MinionState.DASHING) return;
    const angle = Phaser.Math.Angle.Between(fromX, fromY, this.x, this.y);
    const body = this.pb;
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics)
      .velocityFromAngle(Phaser.Math.RadToDeg(angle), power, body.velocity);
    this.scene.time.delayedCall(180, () => {
      if (this.mState !== MinionState.DASHING) body.setVelocity(0, 0);
    });
  }

  get isDead():    boolean { return this.mState === MinionState.DEAD; }
  get isDashing(): boolean { return this.mState === MinionState.DASHING; }
  get currentHp(): number  { return this.hp; }

  // ── State Machine ───────────────────────────────────

  private enterIdle(): void {
    this.mState = MinionState.IDLE;
    this.pb.setVelocity(0, 0);
    this.clearTint();
    this.stateTimer?.destroy();
    this.updateDir();
    this.playDir('slime_walk');
    const delay = Phaser.Math.Between(1500, 2500);
    this.stateTimer = this.scene.time.delayedCall(delay, () => this.enterDashWarn());
  }

  private enterDashWarn(): void {
    this.mState = MinionState.DASH_WARN;
    this.stateTimer?.destroy();
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir('slime_attack');
    this.setTint(0xff4400);
    this.stateTimer = this.scene.time.delayedCall(650, () => this.enterDashing());
  }

  private enterDashing(): void {
    this.mState = MinionState.DASHING;
    this.stateTimer?.destroy();
    this.clearTint();
    this.setTint(0xff8800);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const deg   = Phaser.Math.RadToDeg(angle);
    if      (deg > -45  && deg <= 45)   this.dir = 'right';
    else if (deg > 45   && deg <= 135)  this.dir = 'down';
    else if (deg > 135  || deg <= -135) this.dir = 'left';
    else                                 this.dir = 'up';
    this.playDir('slime_run');
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
      deg, MinionSlime.DASH_SPEED,
      this.pb.velocity,
    );
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.DASH_MS, () => {
      this.pb.setVelocity(0, 0);
      this.anims.timeScale = 1;
      this.clearTint();
      this.enterIdle();
    });
  }

  private die(): void {
    this.mState = MinionState.DEAD;
    this.stateTimer?.destroy();
    this.pb.setVelocity(0, 0);
    this.clearTint();
    this.hpBarGfx.destroy();
    this.playDir('slime_death');
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.setActive(false).setVisible(false);
      this.onDead?.();
    });
  }

  // ── Helpers ─────────────────────────────────────────

  private updateDir(): void {
    const [tx, ty] = this.getTargetPos();
    const dx = tx - this.x, dy = ty - this.y;
    this.dir = Math.abs(dx) >= Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up'   : 'down');
  }

  private playDir(base: string): void {
    this.play(`${base}_${this.dir}`, true);
  }

  // ── preUpdate: chase + HP bar ────────────────────────

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (!this.started || this.mState === MinionState.DEAD) return;

    if (this.mState === MinionState.IDLE) {
      const [tx, ty] = this.getTargetPos();
      const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
      const body = this.pb;
      const prevDir  = this.dir;
      this.updateDir();

      if (dist <= MinionSlime.STOP_RANGE) {
        body.setVelocity(0, 0);
        if (this.dir !== prevDir) this.playDir('slime_idle');
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
        (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
          Phaser.Math.RadToDeg(angle), MinionSlime.CHASE_SPEED, body.velocity,
        );
        if (this.dir !== prevDir) this.playDir('slime_walk');
      }
    }

    this.drawHpBar();
  }

  private drawHpBar(): void {
    this.hpBarGfx.clear();
    const bw = 30, bh = 4;
    const bx = this.x - bw / 2;
    const by = this.y - 32;
    this.hpBarGfx.fillStyle(0x330000, 0.8);
    this.hpBarGfx.fillRect(bx, by, bw, bh);
    const pct   = this.hp / this.maxHp;
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xff2200;
    this.hpBarGfx.fillStyle(color);
    this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
    this.hpBarGfx.lineStyle(1, 0x000000, 0.5);
    this.hpBarGfx.strokeRect(bx, by, bw, bh);
  }

  override destroy(fromScene?: boolean): void {
    this.hpBarGfx?.destroy();
    super.destroy(fromScene);
  }
}
