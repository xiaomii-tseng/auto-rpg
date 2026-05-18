import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// 旋風狂亂
const WHIRL_WARN_MS  = 1200;
const WHIRL_STEP_MS  = 400;
const WHIRL_TOTAL_MS = 3000;
const WHIRL_SPEED    = Math.round(70 * DPR);
const WHIRL_HIT_R    = Math.round(52 * DPR);
const WHIRL_DMG      = 55;

// 召喚增援
const SUMMON_WARN_MS = 900;
const SUMMON_COUNT   = 5;

// 三連扇形斬
const FAN_WARN_MS   = 550;
const FAN_INTERVAL  = 400;
const FAN_RANGE     = Math.round(115 * DPR);
const FAN_HALF      = Math.PI * 48 / 180;
const FAN_DMG       = 50;

// 投擲巨石
const BOULDER_WARN_MS  = 800;
const BOULDER_COUNT    = 2;
const BOULDER_HIT_R    = Math.round(58 * DPR);
const BOULDER_DMG      = 90;
const BOULDER_SLOW_DUR = 3000;
const BOULDER_SLOW_R   = Math.round(52 * DPR);

// 震地怒吼
const ROAR_WARN_MS  = 800;
const ROAR_SLOW_DUR = 3500;

// 強衝（遠程觸發）
const CHARGE_DIST_THRESHOLD = Math.round(145 * DPR); // 超過此距離必定衝刺
const CHARGE_WARN_MS         = 250;

export class BossOrc1 extends Boss {
  onWhirlTick?:    (x: number, y: number, r: number, dmg: number) => void;
  onWhirlSlash?:   (wx: number, wy: number, tx: number, ty: number) => void;
  onSummonOrc?:    (x: number, y: number) => void;
  onFanSlash?:     (bx: number, by: number, angle: number, half: number, range: number, dmg: number) => void;
  onBoulderLand?:  (x: number, y: number, r: number, dmg: number) => void;
  onSlowZoneTick?: (x: number, y: number, r: number) => void;
  onRoar?:         () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: import('../data/equipment-data').Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = Math.round(95 * DPR);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;

    // 玩家距離過遠 → 立刻強衝，不走正常隨機
    const [px, py] = this.getTargetPos();
    const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py);
    if (dist > CHARGE_DIST_THRESHOLD) {
      this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), () => this.enterQuickDashWarn(CHARGE_WARN_MS));
      return;
    }

    const roll = Math.random();
    let fn: () => void;
    // 旋風33%  扇形22%  巨石22%  召喚8%  怒吼15%
    if      (roll < 0.33) fn = () => this.enterOrcWhirlWarn();
    else if (roll < 0.55) fn = () => this.enterOrcFanWarn();
    else if (roll < 0.77) fn = () => this.enterOrcBoulderWarn();
    else if (roll < 0.85) fn = () => this.enterOrcSummonWarn();
    else                  fn = () => this.enterOrcRoarWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.ORC_WHIRL_WARN:   this.enterOrcWhirlWarn();   break;
      case BossState.ORC_WHIRLING:     this.enterOrcWhirling();    break;
      case BossState.ORC_SUMMON_WARN:  this.enterOrcSummonWarn();  break;
      case BossState.ORC_FAN_WARN:     this.enterOrcFanWarn();     break;
      case BossState.ORC_BOULDER_WARN: this.enterOrcBoulderWarn(); break;
      case BossState.ORC_ROAR_WARN:    this.enterOrcRoarWarn();    break;
    }
  }

  // ── 旋風狂亂 ─────────────────────────────────────────────

  private enterOrcWhirlWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_WHIRL_WARN);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_WHIRL_WARN, x: this.x / DPR, y: this.y / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    const warnG = this.scene.add.graphics().setDepth(8);
    const fw = { v: 0.4 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 1.0, duration: 220, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        warnG.fillStyle(0xff2200, fw.v * 0.22);
        warnG.fillCircle(this.x, this.y, WHIRL_HIT_R);
        warnG.lineStyle(P(3), 0xff4400, fw.v * 0.85);
        warnG.strokeCircle(this.x, this.y, WHIRL_HIT_R);
      },
    });

    const chargeEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 80, max: 160 }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 }, alpha: { start: 0.85, end: 0 },
      tint: [0xff4400, 0xff8800, 0xffcc44, 0xffffff],
      lifespan: { min: 150, max: 350 }, frequency: 40, quantity: mq(2),
    }).setDepth(this.depth + 1);

    this.scene.time.delayedCall(WHIRL_WARN_MS - 280, () => {
      if (this.currentState !== BossState.ORC_WHIRL_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(WHIRL_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy(); chargeEmitter.destroy();
      this.scene.cameras.main.shake(40, 0.004);
      this.enterOrcWhirling();
    });
  }

  private enterOrcWhirling(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_WHIRLING);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_WHIRLING, x: this.x / DPR, y: this.y / DPR });

    const whirlKey = `${this.animPrefix}_whirl`;
    if (this.scene.anims.exists(whirlKey)) this.anims.play(whirlKey, true);
    else this.playDir(`${this.animPrefix}_attack`);

    const emitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 60, max: 140 }, angle: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xffcc44, 0xff8800, 0xffeeaa, 0xffffff],
      lifespan: { min: 120, max: 300 }, frequency: 18, quantity: mq(3),
    }).setDepth(this.depth + 1);

    const hitTimer = !this.guestMode ? this.scene.time.addEvent({
      delay: 80, repeat: Math.ceil(WHIRL_TOTAL_MS / 80),
      callback: () => {
        if (this.currentState !== BossState.ORC_WHIRLING) return;
        this.onWhirlTick?.(this.x, this.y, WHIRL_HIT_R, this.scaleDmg(WHIRL_DMG));
      },
    }) : null;

    let elapsed = 0;
    const doStep = () => {
      if (this.currentState !== BossState.ORC_WHIRLING) { emitter.destroy(); hitTimer?.destroy(); return; }
      const [px, py] = this.getTargetPos();
      const ang = Phaser.Math.Angle.Between(this.x, this.y, px, py);
      (this.scene.physics as Phaser.Physics.Arcade.ArcadePhysics).velocityFromAngle(
        Phaser.Math.RadToDeg(ang), WHIRL_SPEED, (this.body as Phaser.Physics.Arcade.Body).velocity,
      );
      emitter.setPosition(this.x, this.y);
      const stepPx = WHIRL_SPEED * WHIRL_STEP_MS / 1000;
      this.onWhirlSlash?.(this.x, this.y, this.x + Math.cos(ang) * stepPx, this.y + Math.sin(ang) * stepPx);
      elapsed += WHIRL_STEP_MS;
      this.stateTimer = this.scene.time.delayedCall(WHIRL_STEP_MS, elapsed < WHIRL_TOTAL_MS ? doStep : () => {
        (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        emitter.destroy(); hitTimer?.destroy();
        this.scene.cameras.main.shake(80, 0.006);
        this.enterIdle();
      });
    };
    doStep();
  }

  // ── 召喚增援 ─────────────────────────────────────────────

  private enterOrcSummonWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_SUMMON_WARN);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_SUMMON_WARN, x: this.x / DPR, y: this.y / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    // 怒吼粒子
    const roarEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 120, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xff6600, 0xffaa00, 0xffdd44, 0xffffff],
      lifespan: { min: 200, max: 500 }, frequency: 30, quantity: mq(3),
    }).setDepth(this.depth + 1);

    this.scene.time.delayedCall(SUMMON_WARN_MS - 250, () => {
      if (this.currentState !== BossState.ORC_SUMMON_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(SUMMON_WARN_MS, () => {
      roarEmitter.destroy();
      this.scene.cameras.main.shake(60, 0.006);
      if (!this.guestMode) {
        for (let i = 0; i < SUMMON_COUNT; i++) {
          const a = (i / SUMMON_COUNT) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
          const r = P(140);
          const sx = this.x + Math.cos(a) * r;
          const sy = this.y + Math.sin(a) * r;
          this.scene.time.delayedCall(i * 120, () => this.onSummonOrc?.(sx, sy));
        }
      }
      this.stateTimer = this.scene.time.delayedCall(600, () => this.enterIdle());
    });
  }

  // ── 三連扇形斬 ───────────────────────────────────────────

  private enterOrcFanWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_FAN_WARN);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_FAN_WARN, x: this.x / DPR, y: this.y / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_idle`);

    // 預覽三道扇形
    const [px, py] = this.getTargetPos();
    const baseAng = Phaser.Math.Angle.Between(this.x, this.y, px, py);
    const warnG = this.scene.add.graphics().setDepth(8);
    const fw2 = { v: 0.3 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw2, v: 0.85, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        // 三道扇形預覽，角度略微錯開
        for (let i = 0; i < 3; i++) {
          const offset = (i - 1) * (FAN_HALF * 0.5);
          const a0 = baseAng + offset;
          warnG.fillStyle(0xff3300, fw2.v * 0.18);
          warnG.lineStyle(P(2), 0xff6600, fw2.v * 0.75);
          warnG.beginPath();
          warnG.moveTo(this.x, this.y);
          warnG.arc(this.x, this.y, FAN_RANGE, a0 - FAN_HALF, a0 + FAN_HALF, false);
          warnG.closePath();
          warnG.fillPath();
          warnG.beginPath();
          warnG.moveTo(this.x, this.y);
          warnG.arc(this.x, this.y, FAN_RANGE, a0 - FAN_HALF, a0 + FAN_HALF, false);
          warnG.closePath();
          warnG.strokePath();
        }
      },
    });

    this.scene.time.delayedCall(FAN_WARN_MS - 200, () => {
      if (this.currentState !== BossState.ORC_FAN_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(FAN_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy();
      this.fireOrcFanSequence(0, baseAng);
    });
  }

  private fireOrcFanSequence(slashIdx: number, baseAng: number): void {
    if (this.currentState === BossState.DEAD) return;
    // 每刀角度對應警告扇形的錯開角度
    const ang = baseAng + (slashIdx - 1) * (FAN_HALF * 0.5);
    // 第二刀倒放，製造來回揮的感覺；每次都強制重播
    this.anims.stop();
    const attackKey = `${this.animPrefix}_attack_${this.bossDir}`;
    if (slashIdx === 1) this.playReverse(attackKey);
    else this.playDir(`${this.animPrefix}_attack`);

    // 刀光 VFX
    const flashG = this.scene.add.graphics().setDepth(15);
    flashG.fillStyle(0xffcc44, 0.7);
    flashG.lineStyle(P(3), 0xffffff, 0.9);
    flashG.beginPath();
    flashG.moveTo(this.x, this.y);
    flashG.arc(this.x, this.y, FAN_RANGE, ang - FAN_HALF, ang + FAN_HALF, false);
    flashG.closePath();
    flashG.fillPath();
    flashG.lineStyle(P(3), 0xffee88, 0.9);
    flashG.beginPath();
    flashG.moveTo(this.x, this.y);
    flashG.arc(this.x, this.y, FAN_RANGE, ang - FAN_HALF, ang + FAN_HALF, false);
    flashG.closePath();
    flashG.strokePath();
    this.scene.tweens.add({ targets: flashG, alpha: 0, duration: 300, onComplete: () => flashG.destroy() });
    this.scene.cameras.main.shake(30, 0.003);

    if (!this.guestMode) this.onFanSlash?.(this.x, this.y, ang, FAN_HALF, FAN_RANGE, this.scaleDmg(FAN_DMG));

    if (slashIdx < 2) {
      this.stateTimer = this.scene.time.delayedCall(FAN_INTERVAL, () => this.fireOrcFanSequence(slashIdx + 1, baseAng));
    } else {
      this.stateTimer = this.scene.time.delayedCall(300, () => this.enterIdle());
    }
  }

  // ── 投擲巨石 ─────────────────────────────────────────────

  private enterOrcBoulderWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_BOULDER_WARN);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_BOULDER_WARN, x: this.x / DPR, y: this.y / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    const [px, py] = this.getTargetPos();
    const boulderTargets: { lx: number; ly: number }[] = [];
    for (let i = 0; i < BOULDER_COUNT; i++) {
      const scatter = Phaser.Math.FloatBetween(-P(35), P(35));
      boulderTargets.push({ lx: px + scatter, ly: py + scatter * 0.5 });
    }

    const warnG = this.scene.add.graphics().setDepth(8);
    const fw3 = { v: 0.3 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw3, v: 1.0, duration: 250, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        for (const { lx, ly } of boulderTargets) {
          warnG.lineStyle(P(2), 0xcc6600, fw3.v * 0.8);
          warnG.strokeCircle(lx, ly, BOULDER_HIT_R);
          warnG.fillStyle(0xcc4400, fw3.v * 0.18);
          warnG.fillCircle(lx, ly, BOULDER_HIT_R);
        }
      },
    });

    this.scene.time.delayedCall(BOULDER_WARN_MS - 250, () => {
      if (this.currentState !== BossState.ORC_BOULDER_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(BOULDER_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy();
      for (let i = 0; i < BOULDER_COUNT; i++) {
        const { lx, ly } = boulderTargets[i];
        this.scene.time.delayedCall(i * 300, () => this.throwBoulder(lx, ly));
      }
      this.stateTimer = this.scene.time.delayedCall(BOULDER_COUNT * 300 + 800, () => this.enterIdle());
    });
  }

  private throwBoulder(tx: number, ty: number): void {
    if (this.currentState === BossState.DEAD) return;
    const sx = this.x, sy = this.y;
    const peakY = Math.min(sy, ty) - P(60);

    // 巨石圖形
    const boulderG = this.scene.add.graphics().setDepth(this.depth + 2);
    const drawBoulder = (scale: number) => {
      boulderG.clear();
      const r = Math.round(P(14) * scale);
      boulderG.fillStyle(0x664422, 1);
      boulderG.fillCircle(0, 0, r);
      boulderG.fillStyle(0x886633, 0.6);
      boulderG.fillCircle(-r * 0.3, -r * 0.3, r * 0.45);
      boulderG.lineStyle(P(2), 0x442200, 0.8);
      boulderG.strokeCircle(0, 0, r);
    };
    drawBoulder(1);

    // 落點預覽圓
    const shadowG = this.scene.add.graphics().setDepth(6);
    shadowG.fillStyle(0x000000, 0.2);
    shadowG.fillCircle(tx, ty, BOULDER_HIT_R);

    const prog = { t: 0 };
    this.scene.tweens.add({
      targets: prog, t: 1, duration: 600, ease: 'Linear',
      onUpdate: () => {
        const t = prog.t;
        const cx = sx + (tx - sx) * t;
        const cy = sy * (1-t)*(1-t) + peakY * 2*t*(1-t) + ty * t*t;
        const scale = 0.6 + t * 0.4;
        boulderG.setPosition(cx, cy);
        drawBoulder(scale);
      },
      onComplete: () => {
        boulderG.destroy();
        shadowG.destroy();
        this.landBoulder(tx, ty);
      },
    });
  }

  private landBoulder(x: number, y: number): void {
    this.scene.cameras.main.shake(90, 0.009);

    // 衝擊波
    const shockG = this.scene.add.graphics().setDepth(20).setPosition(x, y);
    this.scene.tweens.add({
      targets: { r: P(10), a: 1 }, r: BOULDER_HIT_R * 1.4, a: 0, duration: 350, ease: 'Quad.Out',
      onUpdate: (tw: Phaser.Tweens.Tween) => {
        const t = tw.targets[0] as { r: number; a: number };
        shockG.clear();
        shockG.lineStyle(P(5), 0x885500, t.a);
        shockG.strokeCircle(0, 0, t.r);
        shockG.lineStyle(P(12), 0x663300, t.a * 0.2);
        shockG.strokeCircle(0, 0, t.r);
      },
      onComplete: () => shockG.destroy(),
    });

    // 塵土粒子
    this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 80, max: 200 }, angle: { min: 200, max: 340 },
      scale: { start: 2.2, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xaa7733, 0xccaa55, 0x886622, 0xddbb77],
      lifespan: { min: 250, max: 550 }, emitting: false,
    }).setDepth(18).emitParticleAt(0, 0, mq(30));

    if (!this.guestMode) this.onBoulderLand?.(x, y, BOULDER_HIT_R, this.scaleDmg(BOULDER_DMG));

    // 減速區域（持續 3 秒）
    const zoneG = this.scene.add.graphics().setDepth(5).setPosition(x, y);
    const slowTimer = this.scene.time.addEvent({
      delay: 150, repeat: Math.ceil(BOULDER_SLOW_DUR / 150),
      callback: () => {
        if (!this.guestMode) this.onSlowZoneTick?.(x, y, BOULDER_SLOW_R);
      },
    });
    const elapsed = { t: 0 };
    this.scene.tweens.add({
      targets: elapsed, t: BOULDER_SLOW_DUR, duration: BOULDER_SLOW_DUR,
      onUpdate: () => {
        const alpha = 0.18 * (1 - elapsed.t / BOULDER_SLOW_DUR);
        zoneG.clear();
        zoneG.fillStyle(0x885522, alpha);
        zoneG.fillCircle(0, 0, BOULDER_SLOW_R);
        zoneG.lineStyle(P(2), 0xaa7733, alpha * 2);
        zoneG.strokeCircle(0, 0, BOULDER_SLOW_R);
      },
      onComplete: () => { zoneG.destroy(); slowTimer.destroy(); },
    });
  }

  // ── 震地怒吼 ─────────────────────────────────────────────

  private enterOrcRoarWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC_ROAR_WARN);
    if (!this.guestMode) this.onSyncState?.({ state: BossState.ORC_ROAR_WARN, x: this.x / DPR, y: this.y / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xff8800);

    // 擴散衝擊環
    const ringCount = 3;
    for (let i = 0; i < ringCount; i++) {
      this.scene.time.delayedCall(i * 220, () => {
        if (this.currentState !== BossState.ORC_ROAR_WARN) return;
        const ringG = this.scene.add.graphics().setDepth(8).setPosition(this.x, this.y);
        this.scene.tweens.add({
          targets: { r: P(20), a: 0.9 }, r: P(180), a: 0, duration: 600, ease: 'Quad.Out',
          onUpdate: (tw: Phaser.Tweens.Tween) => {
            const t = tw.targets[0] as { r: number; a: number };
            ringG.clear();
            ringG.lineStyle(P(4), 0xff8800, t.a);
            ringG.strokeCircle(0, 0, t.r);
            ringG.lineStyle(P(10), 0xff4400, t.a * 0.25);
            ringG.strokeCircle(0, 0, t.r);
          },
          onComplete: () => ringG.destroy(),
        });
      });
    }

    this.stateTimer = this.scene.time.delayedCall(ROAR_WARN_MS, () => {
      if (this.baseTint === 0xffffff) this.clearTint(); else this.setTint(this.baseTint);
      this.scene.cameras.main.shake(120, 0.010);
      if (!this.guestMode) this.onRoar?.();
      this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
    });
  }
}
