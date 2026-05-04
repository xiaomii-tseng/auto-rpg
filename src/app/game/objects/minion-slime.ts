import Phaser from 'phaser';

enum MinionState {
  PATROL    = 'PATROL',
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
  private hpBarGfx:   Phaser.GameObjects.Graphics;
  private debuffGfx:  Phaser.GameObjects.Graphics;
  private debuffTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private dir: 'down' | 'left' | 'right' | 'up' = 'down';
  private atkX = 0;
  private atkY = 0;
  private pb!: Phaser.Physics.Arcade.Body;   // stable body reference

  private patrolCenter   = new Phaser.Math.Vector2(0, 0);
  private patrolTargetX  = 0;
  private patrolTargetY  = 0;
  private isReturning    = false;
  private readonly patrolRadius  = 75;
  private readonly aggroRange    = 230;
  private readonly deaggroRange  = 400;
  private readonly leashRange    = 310;

  static readonly CHASE_SPEED = 90;
  static readonly STOP_RANGE  = 55;
  static readonly DASH_SPEED  = 310;
  static readonly DASH_MS     = 260;

  getTargetPos: () => [number, number] = () => [0, 0];
  onDead?: () => void;

  isElite       = false;
  atk           = 10;
  burnStacks    = 0;
  burnExpiresAt = 0;

  applyBurn(gameTime: number): void {
    if (this.burnStacks < 15) this.burnStacks++;
    this.burnExpiresAt = gameTime + 4000;
  }

  private readonly animPrefix: string;
  private readonly baseTint:   number;

  constructor(scene: Phaser.Scene, x: number, y: number, hp = 150, spriteKey = 'slime', tint = 0xffffff) {
    super(scene, x, y, `${spriteKey}_idle`, 0);
    this.animPrefix = spriteKey;
    this.baseTint   = tint;
    this.hp    = hp;
    this.maxHp = hp;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.pb = this.body as Phaser.Physics.Arcade.Body;
    this.pb.setCollideWorldBounds(true);
    this.patrolCenter.set(x, y);
    this.patrolTargetX = x;
    this.patrolTargetY = y;
    this.pb.setSize(19, 12).setOffset(23, 29);
    this.setScale(0.78);
    this.setDepth(12);
    this.applyBaseTint();
    this.play(`${spriteKey}_idle_down`, true);
    this.setVisible(false);
    this.hpBarGfx  = scene.add.graphics().setDepth(50);
    this.debuffGfx = scene.add.graphics().setDepth(51);
  }

  private applyBaseTint(): void {
    if (this.baseTint === 0xffffff) this.clearTint();
    else this.setTint(this.baseTint);
  }

  start(): void {
    this.started = true;
    this.setVisible(true);
    this.enterPatrol();
  }

  setPatrolCenter(x: number, y: number): void {
    this.patrolCenter.set(x, y);
    this.patrolTargetX = x;
    this.patrolTargetY = y;
  }

  takeDamage(amount: number): void {
    if (this.mState === MinionState.DEAD) return;
    this.hp = Math.max(0, this.hp - amount);
    this.setTint(0xff8888);
    this.scene.time.delayedCall(120, () => {
      if (this.mState !== MinionState.DEAD) this.applyBaseTint();
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

  private enterPatrol(): void {
    this.mState = MinionState.PATROL;
    this.stateTimer?.destroy();
    this.stateTimer  = undefined;
    this.isReturning = true;
    this.applyBaseTint();
    // 先走回巡邏中心，到了再開始正常巡邏
    this.patrolTargetX = this.patrolCenter.x;
    this.patrolTargetY = this.patrolCenter.y;
    this.updateDirTo(this.patrolTargetX, this.patrolTargetY);
    this.playDir(`${this.animPrefix}_walk`);
  }

  private pickPatrolTarget(): void {
    const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const dist  = Phaser.Math.FloatBetween(40, this.patrolRadius);
    this.patrolTargetX = this.patrolCenter.x + Math.cos(angle) * dist;
    this.patrolTargetY = this.patrolCenter.y + Math.sin(angle) * dist;
    this.updateDirTo(this.patrolTargetX, this.patrolTargetY);
    this.playDir(`${this.animPrefix}_walk`);
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    const travelMs = Phaser.Math.Between(2000, 3500);
    this.stateTimer = this.scene.time.delayedCall(travelMs, () => {
      if (this.mState !== MinionState.PATROL) return;
      this.pb.setVelocity(0, 0);
      this.updateDir();
      this.playDir(`${this.animPrefix}_idle`);
      this.stateTimer = this.scene.time.delayedCall(Phaser.Math.Between(600, 1800), () => {
        if (this.mState === MinionState.PATROL) this.pickPatrolTarget();
      });
    });
  }

  private enterIdle(): void {
    this.mState = MinionState.IDLE;
    this.pb.setVelocity(0, 0);
    this.applyBaseTint();
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.updateDir();
    this.playDir(`${this.animPrefix}_walk`);
    const delay = Phaser.Math.Between(1500, 2500);
    this.stateTimer = this.scene.time.delayedCall(delay, () => this.enterDashWarn());
  }

  private enterDashWarn(): void {
    this.mState = MinionState.DASH_WARN;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.pb.setVelocity(0, 0);
    [this.atkX, this.atkY] = this.getTargetPos();
    this.updateDir();
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xff4400);
    this.stateTimer = this.scene.time.delayedCall(650, () => this.enterDashing());
  }

  private enterDashing(): void {
    this.mState = MinionState.DASHING;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.clearTint();
    this.setTint(0xff8800);
    const angle = Phaser.Math.Angle.Between(this.x, this.y, this.atkX, this.atkY);
    const deg   = Phaser.Math.RadToDeg(angle);
    if      (deg > -45  && deg <= 45)   this.dir = 'right';
    else if (deg > 45   && deg <= 135)  this.dir = 'down';
    else if (deg > 135  || deg <= -135) this.dir = 'left';
    else                                 this.dir = 'up';
    this.playDir(`${this.animPrefix}_run`);
    (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
      deg, MinionSlime.DASH_SPEED,
      this.pb.velocity,
    );
    this.stateTimer = this.scene.time.delayedCall(MinionSlime.DASH_MS, () => {
      this.pb.setVelocity(0, 0);
      this.anims.timeScale = 1;
      this.applyBaseTint();
      this.enterIdle();
    });
  }

  private die(): void {
    this.mState = MinionState.DEAD;
    this.stateTimer?.destroy();
    this.stateTimer = undefined;
    this.pb.setVelocity(0, 0);
    this.applyBaseTint();
    this.hpBarGfx.destroy();
    this.debuffGfx.destroy();
    this.debuffTexts.forEach(t => t.destroy());
    this.debuffTexts.clear();
    this.playDir(`${this.animPrefix}_death`);
    this.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.setActive(false).setVisible(false);
      this.onDead?.();
    });
  }

  // ── Helpers ─────────────────────────────────────────

  private updateDir(): void {
    const [tx, ty] = this.getTargetPos();
    this.updateDirTo(tx, ty);
  }

  private updateDirTo(tx: number, ty: number): void {
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

    if (this.mState === MinionState.PATROL) {
      const [tx, ty] = this.getTargetPos();
      // 只在走回家之後才允許重新 aggro，避免抖動
      if (!this.isReturning && Phaser.Math.Distance.Between(this.x, this.y, tx, ty) <= this.aggroRange) {
        this.stateTimer?.destroy();
        this.stateTimer = undefined;
        this.enterIdle();
        return;
      }
      const dtx = this.patrolTargetX, dty = this.patrolTargetY;
      const distToTarget = Phaser.Math.Distance.Between(this.x, this.y, dtx, dty);
      if (distToTarget > 14) {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, dtx, dty);
        (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
          Phaser.Math.RadToDeg(angle), 50, this.pb.velocity,
        );
        const prevDir = this.dir;
        this.updateDirTo(dtx, dty);
        if (this.dir !== prevDir) this.playDir(`${this.animPrefix}_walk`);
      } else {
        this.pb.setVelocity(0, 0);
        this.isReturning = false; // 已回到家，可以重新 aggro
        // 到達目標點後若還沒開始計時，稍等後挑下一個巡邏點
        if (!this.stateTimer) {
          this.stateTimer = this.scene.time.delayedCall(Phaser.Math.Between(400, 1200), () => {
            if (this.mState === MinionState.PATROL) this.pickPatrolTarget();
          });
        }
      }
    }

    if (this.mState === MinionState.IDLE) {
      const [tx, ty] = this.getTargetPos();
      const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);

      const [px, py] = [tx, ty];
      const distFromHome = Phaser.Math.Distance.Between(this.patrolCenter.x, this.patrolCenter.y, px, py);
      if (dist > this.deaggroRange || distFromHome > this.leashRange) { this.enterPatrol(); return; }

      const body = this.pb;
      const prevDir  = this.dir;
      this.updateDir();

      if (dist <= MinionSlime.STOP_RANGE) {
        body.setVelocity(0, 0);
        if (this.dir !== prevDir) this.playDir(`${this.animPrefix}_idle`);
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
        (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
          Phaser.Math.RadToDeg(angle), MinionSlime.CHASE_SPEED, body.velocity,
        );
        if (this.dir !== prevDir) this.playDir(`${this.animPrefix}_walk`);
      }
    }

    this.drawHpBar();
  }

  private drawHpBar(): void {
    this.hpBarGfx.clear();
    const pct = this.hp / this.maxHp;

    if (this.isElite) {
      const bw = 44, bh = 6;
      const bx = this.x - bw / 2;
      const by = this.y - 35;
      // dark background
      this.hpBarGfx.fillStyle(0x1a0000, 0.9);
      this.hpBarGfx.fillRect(bx, by, bw, bh);
      // fill — gold-to-orange gradient effect via single color by pct
      const color = pct > 0.5 ? 0xffcc00 : pct > 0.25 ? 0xff8800 : 0xff2200;
      this.hpBarGfx.fillStyle(color);
      this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
      // gold border (2px)
      this.hpBarGfx.lineStyle(2, 0xddaa00, 1);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
      // inner highlight line
      this.hpBarGfx.lineStyle(1, 0xffffff, 0.25);
      this.hpBarGfx.lineBetween(bx + 1, by + 1, bx + bw * pct - 1, by + 1);
      this.drawDebuffIcons(this.x, by + bh + 9);
    } else {
      const bw = 30, bh = 4;
      const bx = this.x - bw / 2;
      const by = this.y - 32;
      this.hpBarGfx.fillStyle(0x330000, 0.8);
      this.hpBarGfx.fillRect(bx, by, bw, bh);
      const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xffaa00 : 0xff2200;
      this.hpBarGfx.fillStyle(color);
      this.hpBarGfx.fillRect(bx, by, bw * pct, bh);
      this.hpBarGfx.lineStyle(1, 0x000000, 0.5);
      this.hpBarGfx.strokeRect(bx, by, bw, bh);
      this.drawDebuffIcons(this.x, by + bh + 9);
    }
  }

  // ── Debuff icon system ───────────────────────────────
  // Each debuff occupies one icon slot (14px wide). Add new debuffs here.

  private drawDebuffIcons(cx: number, cy: number): void {
    this.debuffGfx.clear();
    const now = this.scene.time.now;
    let slot  = 0;

    if (this.burnStacks > 0 && now < this.burnExpiresAt) {
      this.drawDebuffIcon(cx + slot * 16 - 8, cy, 'burn', 0xff4400, 0x220800);
      this.updateDebuffText('burn', cx + slot * 16 - 8, cy, `${this.burnStacks}`);
      slot++;
    } else {
      this.hideDebuffText('burn');
    }

    // hide texts for any slots beyond what's active
    if (slot === 0) this.debuffGfx.clear();
  }

  private drawDebuffIcon(cx: number, cy: number, key: string, rimColor: number, bgColor: number): void {
    const r = 7;
    // outer glow
    this.debuffGfx.fillStyle(rimColor, 0.3);
    this.debuffGfx.fillCircle(cx, cy, r + 2);
    // background
    this.debuffGfx.fillStyle(bgColor, 0.92);
    this.debuffGfx.fillCircle(cx, cy, r);
    // rim
    this.debuffGfx.lineStyle(1.2, rimColor, 0.9);
    this.debuffGfx.strokeCircle(cx, cy, r);
    // flame shape
    if (key === 'burn') this.drawFlameShape(cx, cy, r);
  }

  private drawFlameShape(cx: number, cy: number, r: number): void {
    const s = r * 0.55;
    const t = this.scene.time.now / 220;
    const wobble = Math.sin(t) * 0.5;
    // outer flame body (orange)
    this.debuffGfx.fillStyle(0xff6600, 1);
    this.debuffGfx.fillTriangle(
      cx - s + wobble, cy + s,
      cx + s + wobble, cy + s,
      cx,              cy - s * 1.3,
    );
    // inner flame tip (yellow)
    this.debuffGfx.fillStyle(0xffdd00, 1);
    this.debuffGfx.fillTriangle(
      cx - s * 0.45, cy + s * 0.4,
      cx + s * 0.45, cy + s * 0.4,
      cx,            cy - s * 1.1,
    );
  }

  private updateDebuffText(key: string, cx: number, cy: number, label: string): void {
    let txt = this.debuffTexts.get(key);
    if (!txt) {
      txt = this.scene.add.text(0, 0, '', {
        fontSize:        '7px',
        color:           '#ffffff',
        stroke:          '#000000',
        strokeThickness: 2,
        fontStyle:       'bold',
      }).setDepth(52).setOrigin(0.5, 0.5);
      this.debuffTexts.set(key, txt);
    }
    txt.setPosition(cx, cy + 5).setText(label).setVisible(true);
  }

  private hideDebuffText(key: string): void {
    this.debuffTexts.get(key)?.setVisible(false);
  }

  override destroy(fromScene?: boolean): void {
    this.hpBarGfx?.destroy();
    this.debuffGfx?.destroy();
    this.debuffTexts.forEach(t => t.destroy());
    this.debuffTexts.clear();
    super.destroy(fromScene);
  }
}
