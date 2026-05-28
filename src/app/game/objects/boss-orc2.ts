import Phaser from 'phaser';
import { BossState } from './boss';
import { BossOrcBase } from './boss-orc-base';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// 天降一擊
const JUMP_WARN_MS  = 500;
const JUMP_TRACK_MS_MIN = 1500;
const JUMP_TRACK_MS_MAX = 2500;
const JUMP_LOCK_MS  = 800;  // 定住後延遲落下
const JUMP_HIT_R    = Math.round(72 * DPR);
const JUMP_DMG      = 90;

// 三道地裂
const FISSURE_WARN_MS = 700;
const FISSURE_SPREAD  = Math.PI * 30 / 180;
const FISSURE_LEN     = Math.round(200 * DPR);
const FISSURE_DMG     = 75;

// 戰場碎裂
const FRACTURE_WARN_MS    = 700;
const FRACTURE_SAFE_COUNT = 3;
const FRACTURE_SAFE_R     = Math.round(45 * DPR);  // 小一點
const FRACTURE_DURATION   = 4000;
const FRACTURE_TICK_MS    = 400;
const FRACTURE_DMG        = 22;
const FRACTURE_SWING_MS   = 450;

// 滾石
const ROLL_WARN_MS = 500;
const ROLL_SPEED   = Math.round(260 * DPR);
const ROLL_R       = Math.round(22 * DPR);
const ROLL_DMG     = 75;

export class BossOrc2 extends BossOrcBase {
  onJumpLand?:      (x: number, y: number, r: number, dmg: number) => void;
  onFissure?:       (bx: number, by: number, angle: number, len: number, dmg: number) => void;
  onFieldFracture?: (safeZones: { x: number; y: number; r: number }[], dmg: number, duration: number, tickMs: number) => void;
  onBoulderRoll?:   (bx: number, by: number, angle: number, speed: number, r: number, dmg: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: import('../data/equipment-data').Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = Math.round(100 * DPR);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;

    if (this.tryChargeIfFar()) return;

    const roll = Math.random();
    let fn: () => void;
    // 跳躍 30%  地裂 32%  碎裂 15%  滾石 23%
    if      (roll < 0.30) fn = () => this.enterOrc2JumpWarn();
    else if (roll < 0.62) fn = () => this.enterOrc2FissureWarn();
    else if (roll < 0.77) fn = () => this.enterOrc2FractureWarn();
    else                  fn = () => this.enterOrc2RollWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.ORC2_JUMP_WARN:     this.enterOrc2JumpWarn();     break;
      case BossState.ORC2_JUMPING:       this.enterOrc2Jumping(this.guestAtkX, this.guestAtkY); break;
      case BossState.ORC2_FISSURE_WARN:  this.enterOrc2FissureWarn();  break;
      case BossState.ORC2_FRACTURE_WARN: this.enterOrc2FractureWarn(); break;
      case BossState.ORC2_FRACTURE_ACTIVE: {
        const FRACTURE_SAFE_R_LOCAL = Math.round(45 * DPR);
        const zones = (this.guestPts ?? []).map(p => ({ x: p.x, y: p.y, r: FRACTURE_SAFE_R_LOCAL }));
        this.onFieldFracture?.(zones, this.scaleDmg(FRACTURE_DMG), FRACTURE_DURATION, FRACTURE_TICK_MS);
        break;
      }
      case BossState.ORC2_ROLL_WARN:     this.enterOrc2RollWarn(); break;
    }
  }

  // ── 天降一擊 ─────────────────────────────────────────────

  private enterOrc2JumpWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC2_JUMP_WARN, {});
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xff4400);

    // 起跳粒子
    const leapEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 80, max: 200 }, angle: { min: 200, max: 340 },
      scale: { start: 1.8, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xff6600, 0xffaa22, 0xffee66],
      lifespan: { min: 150, max: 380 }, frequency: 30, quantity: mq(3),
    }).setDepth(this.depth + 1);

    this.stateTimer = this.scene.time.delayedCall(JUMP_WARN_MS, () => {
      leapEmitter.destroy();
      if (this.baseTint === 0xffffff) this.clearTint(); else this.setTint(this.baseTint);
      const [lx, ly] = this.getTargetPos();
      this.enterOrc2Jumping(lx, ly);
    });
  }

  private enterOrc2Jumping(startLx: number, startLy: number): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC2_JUMPING, this.guestMode ? undefined : { atkX: startLx / DPR, atkY: startLy / DPR });
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    (this.body as Phaser.Physics.Arcade.Body).setEnable(false);

    const bsx = this.scaleX, bsy = this.scaleY;

    // 起跳：蹲踞蓄力 → 縱向拉長飛上去消失
    this.scene.tweens.add({
      targets: this, scaleX: bsx * 1.2, scaleY: bsy * 0.7, y: this.y + P(6),
      duration: 60, ease: 'Quad.Out',
      onComplete: () => {
        if (this.currentState === BossState.DEAD) return;
        this.scene.tweens.add({
          targets: this, scaleX: bsx * 0.75, scaleY: bsy * 1.4, y: this.y - P(400),
          duration: 180, ease: 'Quad.In',
          onComplete: () => {
            this.setVisible(false);
            this.setScale(bsx, bsy);
          },
        });
      },
    });

    if (this.guestMode) return;

    // 追蹤圈：跟著玩家隨機 1.5~2.5 秒
    const trackMs = Phaser.Math.Between(JUMP_TRACK_MS_MIN, JUMP_TRACK_MS_MAX);
    let trackX = startLx, trackY = startLy;
    const trackG = this.scene.add.graphics().setDepth(8);
    const fw = { v: 0.5, elapsed: 0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 1.0, elapsed: trackMs, duration: trackMs, ease: 'Linear',
      onUpdate: () => {
        [trackX, trackY] = this.getTargetPos();
        trackG.clear();
        trackG.lineStyle(P(3), 0xff2200, 0.85);
        trackG.strokeCircle(trackX, trackY, JUMP_HIT_R);
        trackG.fillStyle(0xff2200, 0.15);
        trackG.fillCircle(trackX, trackY, JUMP_HIT_R);
        // 內圈（十字瞄準）
        const cr = JUMP_HIT_R * 0.25;
        trackG.lineStyle(P(2), 0xff6600, 0.7);
        trackG.strokeCircle(trackX, trackY, cr);
        trackG.lineStyle(P(1), 0xff6600, 0.5);
        trackG.beginPath();
        trackG.moveTo(trackX - JUMP_HIT_R * 0.7, trackY); trackG.lineTo(trackX + JUMP_HIT_R * 0.7, trackY);
        trackG.moveTo(trackX, trackY - JUMP_HIT_R * 0.7); trackG.lineTo(trackX, trackY + JUMP_HIT_R * 0.7);
        trackG.strokePath();
      },
    });

    // 追蹤結束 → 鎖定位置
    this.scene.time.delayedCall(trackMs, () => {
      this.pulseTween?.stop();
      const lockX = trackX, lockY = trackY;

      // 鎖定後閃爍警告
      let blink = 0;
      const blinkTimer = this.scene.time.addEvent({
        delay: 80, repeat: Math.ceil(JUMP_LOCK_MS / 80),
        callback: () => {
          blink++;
          trackG.clear();
          if (blink % 2 === 0) {
            trackG.lineStyle(P(4), 0xff0000, 1.0);
            trackG.strokeCircle(lockX, lockY, JUMP_HIT_R);
            trackG.fillStyle(0xff0000, 0.28);
            trackG.fillCircle(lockX, lockY, JUMP_HIT_R);
          }
        },
      });

      // 落下
      this.stateTimer = this.scene.time.delayedCall(JUMP_LOCK_MS, () => {
        blinkTimer.destroy();
        trackG.destroy();
        this.pulseTween?.stop();

        // Boss 從上方直線飛下，落地壓扁回彈
        this.setPosition(lockX, lockY - P(400));
        this.setScale(bsx * 0.75, bsy * 1.4);
        this.setVisible(true);
        this.playDir(`${this.animPrefix}_attack`);

        this.scene.tweens.add({
          targets: this, y: lockY, scaleX: bsx, scaleY: bsy,
          duration: 200, ease: 'Quad.In',
          onComplete: () => {
            // 落地瞬間：震波+傷害
            this.scene.cameras.main.shake(120, 0.012);
            (this.body as Phaser.Physics.Arcade.Body).reset(lockX, lockY);
            (this.body as Phaser.Physics.Arcade.Body).setEnable(true);
            this.onJumpLand?.(lockX, lockY, JUMP_HIT_R, this.scaleDmg(JUMP_DMG));
            // 落地壓扁 → 回彈（純視覺）
            this.scene.tweens.add({
              targets: this, scaleX: bsx * 1.2, scaleY: bsy * 0.65,
              duration: 80, ease: 'Quad.Out',
              onComplete: () => {
                this.scene.tweens.add({
                  targets: this, scaleX: bsx, scaleY: bsy,
                  duration: 150, ease: 'Back.Out',
                });
              },
            });
            this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
          },
        });
      });
    });
  }

  // ── 三道地裂 ─────────────────────────────────────────────

  private enterOrc2FissureWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_idle`);

    const [px, py] = this.getTargetPos();
    const baseAng = Phaser.Math.Angle.Between(this.x, this.y, px, py);

    this.setBossState(BossState.ORC2_FISSURE_WARN, { atkX: px / DPR, atkY: py / DPR });

    // 三道預警線
    const warnG = this.scene.add.graphics().setDepth(8);
    const fw = { v: 0.3 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 0.9, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        for (let i = 0; i < 3; i++) {
          const ang = baseAng + (i - 1) * FISSURE_SPREAD;
          const ex  = this.x + Math.cos(ang) * FISSURE_LEN;
          const ey  = this.y + Math.sin(ang) * FISSURE_LEN;
          warnG.lineStyle(P(3), 0xff4400, fw.v * 0.9);
          warnG.beginPath(); warnG.moveTo(this.x, this.y); warnG.lineTo(ex, ey); warnG.strokePath();
          // 尾端分支預覽（扇形）
          const branchFan = Math.PI * 100 / 180;
          warnG.lineStyle(P(1), 0xff8800, fw.v * 0.5);
          for (let b = 0; b < 4; b++) {
            const ba  = ang + (b / 3 - 0.5) * branchFan;
            const blen = FISSURE_LEN * 0.4;
            warnG.beginPath();
            warnG.moveTo(ex, ey);
            warnG.lineTo(ex + Math.cos(ba) * blen, ey + Math.sin(ba) * blen);
            warnG.strokePath();
          }
        }
      },
    });

    this.scene.time.delayedCall(FISSURE_WARN_MS - 220, () => {
      if (this.currentState !== BossState.ORC2_FISSURE_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(FISSURE_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy();
      this.scene.cameras.main.shake(80, 0.008);
      for (let i = 0; i < 3; i++) {
        const ang = baseAng + (i - 1) * FISSURE_SPREAD;
        this.scene.time.delayedCall(i * 150, () => {
          this.onFissure?.(this.x, this.y, ang, FISSURE_LEN, this.scaleDmg(FISSURE_DMG));
        });
      }
      this.stateTimer = this.scene.time.delayedCall(3 * 150 + 700, () => this.enterIdle());
    });
  }

  // ── 戰場碎裂 ─────────────────────────────────────────────

  private enterOrc2FractureWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ORC2_FRACTURE_WARN, {});
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);
    this.setTint(0xaa3300);

    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        if (this.currentState !== BossState.ORC2_FRACTURE_WARN) return;
        const ringG = this.scene.add.graphics().setDepth(8).setPosition(this.x, this.y);
        this.scene.tweens.add({
          targets: { r: P(20), a: 0.9 }, r: P(200), a: 0, duration: 500, ease: 'Quad.Out',
          onUpdate: (tw: Phaser.Tweens.Tween) => {
            const t = tw.targets[0] as { r: number; a: number };
            ringG.clear(); ringG.lineStyle(P(4), 0xcc2200, t.a); ringG.strokeCircle(0, 0, t.r);
          },
          onComplete: () => ringG.destroy(),
        });
      });
    }

    this.stateTimer = this.scene.time.delayedCall(FRACTURE_WARN_MS, () => {
      if (this.baseTint === 0xffffff) this.clearTint(); else this.setTint(this.baseTint);
      this.scene.cameras.main.shake(150, 0.014);
      if (!this.guestMode) {
        const safeZones: { x: number; y: number; r: number }[] = [];
        // 第一個安全圈：固定靠近 BOSS
        const nearA = Math.random() * Math.PI * 2;
        const nearD = FRACTURE_SAFE_R * (1.2 + Math.random() * 1.5);
        safeZones.push({ x: this.x + Math.cos(nearA) * nearD, y: this.y + Math.sin(nearA) * nearD, r: FRACTURE_SAFE_R });
        // 其餘安全圈：任意出現在場地內
        for (let i = 1; i < FRACTURE_SAFE_COUNT; i++) {
          let sx = 0, sy = 0, tries = 0;
          do {
            const a = Math.random() * Math.PI * 2;
            const rad = Math.random() * this.arenaRadius * 0.85;
            sx = this.arenaCenter.x + Math.cos(a) * rad;
            sy = this.arenaCenter.y + Math.sin(a) * rad;
            tries++;
          } while (tries < 20 && safeZones.some(z =>
            Phaser.Math.Distance.Between(sx, sy, z.x, z.y) < FRACTURE_SAFE_R * 2.2
          ));
          safeZones.push({ x: sx, y: sy, r: FRACTURE_SAFE_R });
        }
        this.onFieldFracture?.(safeZones, this.scaleDmg(FRACTURE_DMG), FRACTURE_DURATION, FRACTURE_TICK_MS);
        if (!this.guestMode) {
          this.onSyncState?.({
            state: BossState.ORC2_FRACTURE_ACTIVE,
            x: this.x / DPR, y: this.y / DPR,
            pts: safeZones.map(z => ({ x: z.x / DPR, y: z.y / DPR })),
          });
        }
      }

      // 持續揮刀動作
      let swingTimer: Phaser.Time.TimerEvent;
      swingTimer = this.scene.time.addEvent({
        delay: FRACTURE_SWING_MS,
        repeat: Math.ceil(FRACTURE_DURATION / FRACTURE_SWING_MS) - 1,
        callback: () => {
          if (this.currentState === BossState.DEAD) { swingTimer.destroy(); return; }
          this.playDir(`${this.animPrefix}_attack`);
        },
      });

      this.stateTimer = this.scene.time.delayedCall(FRACTURE_DURATION + 300, () => {
        swingTimer.destroy();
        this.enterIdle();
      });
    });
  }

  // ── 滾石 ─────────────────────────────────────────────────

  private enterOrc2RollWarn(angle?: number): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);

    const [px, py] = this.getTargetPos();
    const ang = angle ?? Phaser.Math.Angle.Between(this.x, this.y, px, py);
    this.setBossState(BossState.ORC2_ROLL_WARN, { angle: ang });

    const warnG = this.scene.add.graphics().setDepth(8);
    const fw = { v: 0.4 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 1.0, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        warnG.lineStyle(P(2), 0xcc6600, fw.v * 0.8);
        warnG.beginPath();
        warnG.moveTo(this.x, this.y);
        warnG.lineTo(this.x + Math.cos(ang) * P(160), this.y + Math.sin(ang) * P(160));
        warnG.strokePath();
        warnG.fillStyle(0xcc4400, fw.v * 0.5);
        warnG.fillCircle(this.x + Math.cos(ang) * P(160), this.y + Math.sin(ang) * P(160), ROLL_R);
      },
    });

    this.stateTimer = this.scene.time.delayedCall(ROLL_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy();
      this.scene.cameras.main.shake(50, 0.005);
      this.onBoulderRoll?.(this.x, this.y, ang, ROLL_SPEED, ROLL_R, this.scaleDmg(ROLL_DMG));
      this.stateTimer = this.scene.time.delayedCall(300, () => this.enterIdle());
    });
  }
}
