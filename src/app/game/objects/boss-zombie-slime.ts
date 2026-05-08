import Phaser from 'phaser';
import { Boss, BossState } from './boss';
import { MONSTER_SCALE_BOSS } from '../data/monster-data';

const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);

const SUMMON_DIST  = Math.round(85 * DPR);
const SUMMON_COUNT = 3;

const FAN_RANGE      = Math.round(380 * DPR);
const FAN_SPEED      = 230 * DPR;       // px/s
const FAN_HALF_DEG   = 15;        // 每個扇形半角 → 全扇 30°
const FAN_PROJS      = 4;         // 每扇投射物數
const FAN_SIDE_DEG   = 55;        // 中心扇與側扇的夾角
const FAN_HIT_R      = Math.round(16 * DPR);
const FAN_DMG        = 30;

export class BossZombieSlime extends Boss {
  onSummonZombie?:  (x: number, y: number) => void;
  onPoisonFanHit?:  (dmg: number) => void;

  private zombieOrbs:        Phaser.GameObjects.Graphics[] = [];
  private zombieOrbTimer?:   Phaser.Time.TimerEvent;
  private zombieScaleTween?: Phaser.Tweens.Tween;
  private zombieEmitter?:    Phaser.GameObjects.Particles.ParticleEmitter;
  private zombiePortalG?:    Phaser.GameObjects.Graphics;
  private zombieFanWarnG?:   Phaser.GameObjects.Graphics;

  protected override clearWarning(): void {
    super.clearWarning();
    this.zombieOrbTimer?.destroy();  this.zombieOrbTimer   = undefined;
    this.zombieScaleTween?.stop();   this.zombieScaleTween = undefined;
    this.zombieOrbs.forEach(o => { if (o.active) o.destroy(); });
    this.zombieOrbs = [];
    if (this.zombieEmitter?.active)  this.zombieEmitter.destroy();  this.zombieEmitter  = undefined;
    if (this.zombiePortalG?.active)  this.zombiePortalG.destroy();  this.zombiePortalG  = undefined;
    if (this.zombieFanWarnG?.active) this.zombieFanWarnG.destroy(); this.zombieFanWarnG = undefined;
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.ZOMBIE_SUMMON_WARN: this.enterZombieSummonWarn(); break;
      case BossState.POISON_FAN_WARN:    this.enterPoisonFanWarn();    break;
    }
  }

  protected override pickNextAttack(): void {
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.26) fn = () => this.enterAoeWarn();
    else if (roll < 0.52) fn = () => this.enterDashWarn();
    else if (roll < 0.64) fn = () => this.enterZombieSummonWarn();
    else                  fn = () => this.enterPoisonFanWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 屍潮召喚 ─────────────────────────────────────────────

  private enterZombieSummonWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.ZOMBIE_SUMMON_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    let positions: { x: number; y: number }[];
    if (this.guestMode) {
      positions = this.guestPts.slice();
    } else {
      const baseAngle = Math.random() * Math.PI * 2;
      positions = Array.from({ length: SUMMON_COUNT }, (_, i) => {
        const a = baseAngle + (Math.PI * 2 / SUMMON_COUNT) * i;
        return { x: this.x + Math.cos(a) * SUMMON_DIST, y: this.y + Math.sin(a) * SUMMON_DIST };
      });
      this.onSyncState?.({ state: BossState.ZOMBIE_SUMMON_WARN, x: this.x / DPR, y: this.y / DPR,
        pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })) });
    }

    // 旋轉能量球
    this.zombieOrbs = Array.from({ length: SUMMON_COUNT }, () => {
      const o = this.scene.add.graphics().setDepth(this.depth + 2);
      o.fillStyle(0x99dd44, 0.95);
      o.fillCircle(0, 0, P(5));
      o.lineStyle(P(2), 0xccff66, 0.65);
      o.strokeCircle(0, 0, P(8));
      return o;
    });
    const orbs = this.zombieOrbs;

    let orbAngle = 0;
    const orbTimer = this.scene.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => {
        orbAngle += 0.075;
        const bossR = 30 + Math.sin(orbAngle * 1.8) * 5;
        orbs.forEach((o, i) => {
          const a = orbAngle + (Math.PI * 2 / SUMMON_COUNT) * i;
          o.setPosition(this.x + Math.cos(a) * bossR, this.y + Math.sin(a) * bossR);
        });
      },
    });

    this.zombieScaleTween = this.scene.tweens.add({
      targets: this, scaleX: 2.22 * DPR, scaleY: 2.22 * DPR,
      duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
    const scaleTween = this.zombieScaleTween;

    // 擴散殭綠環
    for (let wave = 0; wave < 2; wave++) {
      this.scene.time.delayedCall(wave * 600, () => {
        if (this.currentState !== BossState.ZOMBIE_SUMMON_WARN) return;
        const rG = this.scene.add.graphics().setDepth(this.depth + 1).setPosition(this.x, this.y);
        const rs = { r: P(12), a: 0.8 };
        this.scene.tweens.add({
          targets: rs, r: P(52), a: 0, duration: 600, ease: 'Quad.Out',
          onUpdate: () => {
            rG.clear();
            rG.lineStyle(P(3), 0x99dd44, rs.a);
            rG.strokeCircle(0, 0, rs.r);
            rG.lineStyle(P(6), 0x446611, rs.a * 0.2);
            rG.strokeCircle(0, 0, rs.r);
          },
          onComplete: () => rG.destroy(),
        });
      });
    }

    this.zombieEmitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 30, max: 80 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.8, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0x99dd44, 0xccff44, 0x557722],
      lifespan: { min: 450, max: 1000 },
      frequency: 35, quantity: 2, gravityY: -28,
    }).setDepth(9);
    const emitter = this.zombieEmitter;

    this.zombiePortalG = this.scene.add.graphics().setDepth(9);
    const portalG = this.zombiePortalG;
    positions.forEach(p => this.drawPortalWarning(portalG, p.x, p.y));
    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.25, duration: 220, yoyo: true, repeat: -1,
      onUpdate: () => portalG.setAlpha(pw.a),
    });

    this.zombieOrbTimer = orbTimer;
    this.stateTimer = this.scene.time.delayedCall(1400, () => {
      // 已由追蹤欄位持有，正常完成時手動清空
      this.zombieOrbs = []; this.zombieOrbTimer = this.zombieScaleTween = this.zombieEmitter = this.zombiePortalG = undefined;
      this.pulseTween?.stop();
      orbTimer.destroy();
      scaleTween.stop();
      this.setScale(MONSTER_SCALE_BOSS);
      orbs.forEach(o => o.destroy());
      emitter.destroy();
      portalG.destroy();
      positions.forEach(p => {
        this.spawnSummonVfx(p.x, p.y);
        this.onSummonZombie?.(p.x, p.y);
      });
      this.enterIdle();
    });
  }

  // ── 毒液扇形噴射 ─────────────────────────────────────────

  private enterPoisonFanWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.POISON_FAN_WARN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    let centerAngle: number;
    if (this.guestMode) {
      centerAngle = this.guestAngle;
    } else {
      const [tx, ty] = this.getTargetPos();
      centerAngle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
      this.onSyncState?.({ state: BossState.POISON_FAN_WARN, x: this.x / DPR, y: this.y / DPR, angle: centerAngle });
    }
    const sideRad   = Phaser.Math.DegToRad(FAN_SIDE_DEG);
    const fanAngles = [centerAngle - sideRad, centerAngle, centerAngle + sideRad];

    this.zombieFanWarnG = this.scene.add.graphics().setDepth(8);
    const warnG = this.zombieFanWarnG;
    fanAngles.forEach(a => this.drawFanWarning(warnG, this.x, this.y, a, FAN_HALF_DEG, FAN_RANGE * 0.75));
    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.18, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => warnG.setAlpha(pw.a),
    });

    this.stateTimer = this.scene.time.delayedCall(1200, () => {
      this.zombieFanWarnG = undefined;
      this.pulseTween?.stop();
      warnG.destroy();
      fanAngles.forEach(a => this.firePoisonFan(a));
      this.stateTimer = this.scene.time.delayedCall(600, () => this.enterIdle());
    });
  }

  private firePoisonFan(centerAngle: number): void {
    const halfRad = Phaser.Math.DegToRad(FAN_HALF_DEG);
    for (let i = 0; i < FAN_PROJS; i++) {
      const t     = i / (FAN_PROJS - 1);
      const angle = centerAngle - halfRad + t * halfRad * 2;
      this.scene.time.delayedCall(i * 40, () => {
        if (this.currentState === BossState.DEAD) return;
        this.firePoisonProjectile(angle);
      });
    }
  }

  private firePoisonProjectile(angle: number): void {
    const travelMs = Math.round((FAN_RANGE / FAN_SPEED) * 1000);
    const startX   = this.x, startY = this.y;
    const vx       = Math.cos(angle) * FAN_SPEED;
    const vy       = Math.sin(angle) * FAN_SPEED;

    const proj = this.scene.add.graphics().setDepth(13).setPosition(startX, startY);
    let   cx   = startX, cy = startY;
    let   hit  = false;

    const hitTimer = this.scene.time.addEvent({
      delay: 25, repeat: Math.ceil(travelMs / 25),
      callback: () => {
        if (hit || !proj.active) { hitTimer.destroy(); return; }
        const [px, py] = this.getTargetPos();
        if (Phaser.Math.Distance.Between(cx, cy, px, py) < FAN_HIT_R) {
          hit = true;
          proj.destroy();
          hitTimer.destroy();
          this.onPoisonFanHit?.(FAN_DMG);
          this.spawnPoisonSplash(cx, cy);
        }
      },
    });

    const prog = { t: 0 };
    this.scene.tweens.add({
      targets: prog, t: 1, duration: travelMs, ease: 'Linear',
      onUpdate: () => {
        if (hit) return;
        cx = startX + vx * (travelMs / 1000) * prog.t;
        cy = startY + vy * (travelMs / 1000) * prog.t;
        proj.setPosition(cx, cy);
        proj.clear();
        proj.fillStyle(0x446600, 0.92);
        proj.fillCircle(0, 0, P(7));
        proj.lineStyle(P(2), 0xaaff44, 0.85);
        proj.strokeCircle(0, 0, P(7));
        proj.fillStyle(0xccff44, 0.55);
        proj.fillCircle(-P(1), -P(2), P(3));
      },
      onComplete: () => {
        hitTimer.destroy();
        if (proj.active) {
          this.spawnPoisonSplash(cx, cy);
          proj.destroy();
        }
      },
    });
  }

  private spawnPoisonSplash(x: number, y: number): void {
    const splash = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 30, max: 90 },
      angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint: [0x88ff44, 0x557722, 0xccff44, 0x224400],
      lifespan: { min: 120, max: 320 },
      emitting: false,
    }).setDepth(11);
    splash.emitParticleAt(0, 0, 10);
    this.scene.time.delayedCall(400, () => { if (splash.active) splash.destroy(); });
  }

  // ── VFX helpers ───────────────────────────────────────────

  private drawPortalWarning(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x446611, 0.22);
    g.fillCircle(x, y, P(22));
    g.lineStyle(P(2), 0x99dd44, 0.88);
    g.strokeCircle(x, y, P(22));
    g.lineStyle(P(1), 0xccff66, 0.5);
    g.lineBetween(x - P(13), y, x + P(13), y);
    g.lineBetween(x, y - P(13), x, y + P(13));
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) continue;
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle(0x99dd44, 0.65);
      g.fillRect(x + Math.cos(a) * P(27) - P(2), y + Math.sin(a) * P(27) - P(2), P(4), P(4));
    }
  }

  private drawFanWarning(
    g: Phaser.GameObjects.Graphics,
    ox: number, oy: number,
    centerAngle: number,
    halfDeg: number,
    len: number,
  ): void {
    const halfRad = Phaser.Math.DegToRad(halfDeg);
    const steps   = 14;
    // 填色
    g.fillStyle(0xff3300, 0.13);
    g.beginPath();
    g.moveTo(ox, oy);
    for (let i = 0; i <= steps; i++) {
      const a = centerAngle - halfRad + (halfRad * 2 / steps) * i;
      g.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
    }
    g.closePath();
    g.fillPath();
    // 邊線
    g.lineStyle(P(2), 0xff5500, 0.85);
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(centerAngle - halfRad) * len, oy + Math.sin(centerAngle - halfRad) * len);
    g.strokePath();
    g.beginPath();
    g.moveTo(ox, oy);
    g.lineTo(ox + Math.cos(centerAngle + halfRad) * len, oy + Math.sin(centerAngle + halfRad) * len);
    g.strokePath();
    // 弧線
    g.lineStyle(P(2), 0xff5500, 0.65);
    g.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = centerAngle - halfRad + (halfRad * 2 / steps) * i;
      if (i === 0) g.moveTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
      else         g.lineTo(ox + Math.cos(a) * len, oy + Math.sin(a) * len);
    }
    g.strokePath();
  }

  private spawnSummonVfx(cx: number, cy: number): void {
    const burst = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 90, max: 250 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x99dd44, 0xccff44, 0x446611, 0xffffff, 0xaabb88],
      lifespan: { min: 200, max: 520 },
      emitting: false,
    }).setDepth(13);
    burst.emitParticleAt(0, 0, 30);
    this.scene.time.delayedCall(650, () => { if (burst.active) burst.destroy(); });
    this.scene.cameras.main.shake(55, 0.005);
  }
}
