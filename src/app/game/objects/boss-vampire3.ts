import Phaser from 'phaser';
import { Boss, BossState } from './boss';
import type { Element } from '../data/equipment-data';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// ── 猩紅鐮刃 ────────────────────────────────────────────────
const SCYTHE_WARN_MS   = 1000;
const SCYTHE_R         = 190;
const SCYTHE_ARC_DEG   = 155;
const SCYTHE_SWEEP_MS  = 500;
const SCYTHE_TRAIL_DUR = 2800;
const SCYTHE_DMG       = 90;
const SCYTHE_TRAIL_DMG = 28;

// ── 血液爆星 ────────────────────────────────────────────────
const BURST_WARN_MS  = 650;
const BURST_COUNT    = 10;
const BURST_HIT_R    = 22;
const BURST_DMG      = 75;

// ── 血刺地獄 ────────────────────────────────────────────────
const SPIKE_WARN_MS  = 380;
const SPIKE_WAVES    = 3;
const SPIKE_PER_WAVE = 25;
const SPIKE_WAVE_GAP = 550;
const SPIKE_HIT_R    = 30;
const SPIKE_DMG      = 85;

// ── 血液分裂 ────────────────────────────────────────────────
const SPLIT_MOVE_MS   = 700;
const SPLIT_CHARGE_MS = 1200;
const SPLIT_CORNER_R  = 210;
const CLONE_SCYTHE_DMG = 65;

// ── 鮮血長河 ────────────────────────────────────────────────
const RIVER_WARN_MS  = 700;
const RIVER_HALF_W   = 52;
const RIVER_DMG      = 75;
const RIVER_TICK_MS  = 200;
const RIVER_DUR      = 2250;

// ── Clone proxy (for getHittableTargets hit detection) ───
export class VK3CloneProxy {
  x: number;
  y: number;
  isDead = false;
  alive  = true;
  active = true;
  minionId = 'vk3clone';
  element: Element = 'none';
  tier = 4;
  race = 'vampire';
  burnStacks = 0;
  private _boss: BossVampire3;
  private _idx:  number;

  constructor(boss: BossVampire3, idx: number, x: number, y: number) {
    this._boss = boss; this._idx = idx; this.x = x; this.y = y;
  }

  takeDamage(_dmg: number): number {
    if (this.isDead) return 0;
    this.isDead = true;
    this.alive  = false;
    this.active = false;
    this._boss.hitClone(this._idx);
    return 0;
  }

  knockback(): void {}
  flashWhite(): void {}
}

export class BossVampire3 extends Boss {
  protected override walkAnimSuffix = 'run';

  // ── Callbacks ──────────────────────────────────────────────
  onScytheHit?:       (cx: number, cy: number, r: number, aimAng: number, arcDeg: number, dmg: number) => void;
  onScytheTrailTick?: (cx: number, cy: number, r: number, aimAng: number, arcDeg: number, dmg: number) => void;
  onBurstOrbLand?:    (x: number, y: number, r: number, dmg: number) => void;
  onBurstOrbFly?:     (x: number, y: number, r: number, dmg: number) => boolean;
  onSpikeHit?:        (x: number, y: number, r: number, dmg: number) => void;
  onRiverTick?:       (x1: number, y1: number, x2: number, y2: number, r: number, dmg: number) => void;
  onCloneScytheHit?:  (cx: number, cy: number, r: number, aimAng: number, arcDeg: number, dmg: number) => void;

  // ── Split state ────────────────────────────────────────────
  _splitActive = false;
  _splitCloneProxies: VK3CloneProxy[] = [];
  private _splitClonesAliveCount = 0;
  private _splitCloneGfx: Array<{
    aura:  Phaser.GameObjects.Graphics;
    img:   Phaser.GameObjects.Image;
    em:    Phaser.GameObjects.Particles.ParticleEmitter;
    alive: boolean;
  }> = [];

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = P(95);
  }

  // ── Attack dispatch ────────────────────────────────────────

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const roll = Math.random();
    let fn: () => void;
    // 分身還在場上時不使用血液分裂，改以等比例重分配給其他技能
    // scythe 28%  burst 22%  spike 22%  river 16%  split 12%（無分身時）
    // scythe 32%  burst 25%  spike 25%  river 18%（有分身時）
    if (this._splitActive) {
      if      (roll < 0.32) fn = () => this.enterScytheWarn();
      else if (roll < 0.57) fn = () => this.enterBurstWarn();
      else if (roll < 0.82) fn = () => this.enterSpikeHellWarn();
      else                  fn = () => this.enterBloodRiverWarn();
    } else {
      if      (roll < 0.28) fn = () => this.enterScytheWarn();
      else if (roll < 0.50) fn = () => this.enterBurstWarn();
      else if (roll < 0.72) fn = () => this.enterSpikeHellWarn();
      else if (roll < 0.88) fn = () => this.enterBloodRiverWarn();
      else                  fn = () => this.enterBloodSplitWarn();
    }
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.VK_SCYTHE_WARN:  this.enterScytheWarn();     break;
      case BossState.VK_BURST_WARN:   this.enterBurstWarn();      break;
      case BossState.VK_SPIKE_WARN:   this.enterSpikeHellWarn();  break;
      case BossState.VK_SPLIT_WARN:   this.enterBloodSplitWarn(); break;
      case BossState.VK_RIVER_WARN:   this.enterBloodRiverWarn(); break;
    }
  }

  // ── 猩紅鐮刃 ───────────────────────────────────────────────

  private enterScytheWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.getTargetPos();
    const aimAng = Math.atan2(ty - this.y, tx - this.x);
    const cx = this.x, cy = this.y;
    this.setBossState(BossState.VK_SCYTHE_WARN, { angle: aimAng });

    const HALF = (SCYTHE_ARC_DEG / 2) * Math.PI / 180;
    const R    = P(SCYTHE_R);

    const warnG = this.scene.add.graphics().setDepth(7);
    const fw = { v: 0.5 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 1.0, duration: 160, yoyo: true, repeat: -1,
      onUpdate: () => this._drawScytheWarnArc(warnG, cx, cy, aimAng, HALF, R, fw.v),
    });

    const em = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 }, alpha: { start: 0.85, end: 0 },
      tint: [0x330011, 0x660022, 0xaa0033, 0xff2244],
      lifespan: { min: 200, max: 500 }, frequency: 30, quantity: mq(3),
    }).setDepth(8);

    // Blood charge rising
    const chargeG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(16);
    const cs = { r: 0, a: 0 };
    this.scene.tweens.add({
      targets: cs, r: P(42), a: 0.9, duration: SCYTHE_WARN_MS, ease: 'Quad.In',
      onUpdate: () => {
        chargeG.clear();
        chargeG.lineStyle(P(3), 0xff2244, cs.a * 0.8);
        chargeG.strokeCircle(0, 0, cs.r);
        chargeG.lineStyle(P(2), 0xff8899, cs.a * 0.6);
        chargeG.strokeCircle(0, 0, cs.r * 0.6);
        chargeG.fillStyle(0x880022, cs.a * 0.35);
        chargeG.fillCircle(0, 0, cs.r * 0.45);
        // Rotating tick marks
        for (let i = 0; i < 8; i++) {
          const a = cs.r * 0.06 + i * Math.PI / 4;
          chargeG.lineStyle(P(2), 0xcc0033, cs.a * 0.9);
          chargeG.lineBetween(Math.cos(a) * cs.r * 0.8, Math.sin(a) * cs.r * 0.8, Math.cos(a) * cs.r, Math.sin(a) * cs.r);
        }
      },
      onComplete: () => chargeG.destroy(),
    });

    this.stateTimer = this.scene.time.delayedCall(SCYTHE_WARN_MS - 150, () => {
      if (this.currentState !== BossState.VK_SCYTHE_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(SCYTHE_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy(); em.destroy();
      this._doScytheSweep(cx, cy, aimAng, false);
    });
  }

  private _drawScytheWarnArc(g: Phaser.GameObjects.Graphics, cx: number, cy: number, aimAng: number, half: number, r: number, alpha: number): void {
    const startA = aimAng - half, endA = aimAng + half;
    g.clear();
    // Faint sector fill
    g.fillStyle(0x880022, 0.12 * alpha);
    g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, startA, endA, false); g.closePath(); g.fillPath();
    // Outer arc
    g.lineStyle(P(3), 0xff2244, 0.88 * alpha);
    g.beginPath(); g.arc(cx, cy, r, startA, endA, false); g.strokePath();
    // Inner arc
    g.lineStyle(P(2), 0xcc0033, 0.55 * alpha);
    g.beginPath(); g.arc(cx, cy, r - P(8), startA, endA, false); g.strokePath();
    // Radial boundary lines
    g.lineStyle(P(2), 0xcc0033, 0.50 * alpha);
    g.lineBetween(cx, cy, cx + Math.cos(startA) * r, cy + Math.sin(startA) * r);
    g.lineBetween(cx, cy, cx + Math.cos(endA) * r, cy + Math.sin(endA) * r);
    // Tick marks along arc
    for (let i = 0; i <= 10; i++) {
      const a   = startA + (i / 10) * (endA - startA);
      const len = (i % 5 === 0) ? P(12) : P(6);
      g.lineStyle(P(2), 0xff5566, (i % 5 === 0 ? 0.9 : 0.55) * alpha);
      g.lineBetween(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len), cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    // Blood droplets scattered in sector
    for (let i = 0; i < 6; i++) {
      const a  = startA + (i / 5) * (endA - startA);
      const dr = r * Phaser.Math.FloatBetween(0.35, 0.85);
      g.fillStyle(0xdd0033, 0.40 * alpha);
      g.fillCircle(cx + Math.cos(a) * dr, cy + Math.sin(a) * dr, P(3));
    }
  }

  private _doScytheSweep(cx: number, cy: number, aimAng: number, isClone: boolean, onDone?: () => void): void {
    if (this.currentState === BossState.DEAD) return;
    const HALF  = (SCYTHE_ARC_DEG / 2) * Math.PI / 180;
    const R     = P(SCYTHE_R);
    const startA = aimAng - HALF;
    const endA   = aimAng + HALF;

    this.scene.cameras.main.shake(220, isClone ? 0.010 : 0.020);

    const sweepG = this.scene.add.graphics().setDepth(18);
    const prog   = { ang: startA };
    let  dmgFired = false;

    const emitter = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 80, max: 200 }, angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xcc0033, 0xff2244, 0xff5566, 0x880022],
      lifespan: { min: 150, max: 380 }, frequency: 20, quantity: mq(4),
    }).setDepth(17);

    this.scene.tweens.add({
      targets: prog, ang: endA, duration: SCYTHE_SWEEP_MS, ease: 'Quad.InOut',
      onUpdate: () => {
        sweepG.clear();
        const fa = startA, ta = prog.ang;
        if (fa >= ta) return;

        // 扇形內部淡填色
        sweepG.fillStyle(0xaa0022, 0.13);
        sweepG.beginPath(); sweepG.moveTo(cx, cy); sweepG.arc(cx, cy, R - P(2), fa, ta, false); sweepG.closePath(); sweepG.fillPath();

        // Outer glow
        sweepG.lineStyle(P(32), 0x660022, 0.28);
        sweepG.beginPath(); sweepG.arc(cx, cy, R + P(10), fa, ta, false); sweepG.strokePath();

        // Mid glow
        sweepG.lineStyle(P(20), 0xaa0033, 0.55);
        sweepG.beginPath(); sweepG.arc(cx, cy, R, fa, ta, false); sweepG.strokePath();

        // Main blood arc
        sweepG.lineStyle(P(12), 0xcc0044, 0.95);
        sweepG.beginPath(); sweepG.arc(cx, cy, R - P(4), fa, ta, false); sweepG.strokePath();

        // Inner dark arc
        sweepG.lineStyle(P(7), 0x880022, 0.85);
        sweepG.beginPath(); sweepG.arc(cx, cy, R - P(12), fa, ta, false); sweepG.strokePath();

        // Bright leading edge
        const leadW = 0.18;
        const leadFrom = Math.max(fa, ta - leadW);
        sweepG.lineStyle(P(8), 0xff6677, 0.95);
        sweepG.beginPath(); sweepG.arc(cx, cy, R - P(2), leadFrom, ta, false); sweepG.strokePath();
        sweepG.lineStyle(P(3), 0xffeeff, 1.0);
        sweepG.beginPath(); sweepG.arc(cx, cy, R - P(2), Math.max(fa, ta - 0.06), ta, false); sweepG.strokePath();

        // Tip flash dot
        sweepG.fillStyle(0xffffff, 0.95);
        sweepG.fillCircle(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R, P(6));
        sweepG.fillStyle(0xff3355, 0.75);
        sweepG.fillCircle(cx + Math.cos(ta) * R, cy + Math.sin(ta) * R, P(10));

        // Blood drips along arc body
        for (let i = 0; i < 5; i++) {
          const a  = fa + (i / 4) * (ta - fa);
          const dr = R - P(Phaser.Math.Between(6, 22));
          sweepG.fillStyle(0xdd0033, 0.55);
          sweepG.fillCircle(cx + Math.cos(a) * dr, cy + Math.sin(a) * dr, P(3));
        }

        // Shockwave lines at leading edge
        if (ta - fa > 0.3) {
          for (let s = 0; s < 3; s++) {
            const sa = ta - s * 0.07;
            const sr = R + P(s * 8 + 4);
            sweepG.lineStyle(P(2), 0xff8899, 0.55 - s * 0.18);
            sweepG.beginPath(); sweepG.arc(cx, cy, sr, sa - 0.12, sa, false); sweepG.strokePath();
          }
        }

        // Fire damage midway through sweep
        if (!dmgFired && prog.ang >= startA + (endA - startA) * 0.5) {
          dmgFired = true;
          if (isClone) this.onCloneScytheHit?.(cx, cy, R, aimAng, SCYTHE_ARC_DEG, this.scaleDmg(CLONE_SCYTHE_DMG));
          else          this.onScytheHit?.(cx, cy, R, aimAng, SCYTHE_ARC_DEG, this.scaleDmg(SCYTHE_DMG));
        }
      },
      onComplete: () => {
        sweepG.destroy();
        emitter.stop();
        this.scene.time.delayedCall(400, () => { if (emitter.active) emitter.destroy(); });

        if (!isClone) this._leaveScytheTrail(cx, cy, aimAng, HALF, R, 1 / 3);

        if (onDone) onDone();
        else this.stateTimer = this.scene.time.delayedCall(200, () => this.enterIdle());
      },
    });
  }

  private _leaveScytheTrail(cx: number, cy: number, aimAng: number, half: number, r: number, dmgMult = 1.0): void {
    const startA = aimAng - half, endA = aimAng + half;
    const trailG = this.scene.add.graphics().setDepth(6);
    const ta     = { v: 1 };

    const drawTrail = (a: number) => {
      trailG.clear();
      trailG.lineStyle(P(28), 0x770022, 0.50 * a);
      trailG.beginPath(); trailG.arc(cx, cy, r, startA, endA, false); trailG.strokePath();
      trailG.lineStyle(P(16), 0xcc0033, 0.65 * a);
      trailG.beginPath(); trailG.arc(cx, cy, r, startA, endA, false); trailG.strokePath();
      trailG.lineStyle(P(6), 0xff3344, 0.45 * a);
      trailG.beginPath(); trailG.arc(cx, cy, r - P(6), startA, endA, false); trailG.strokePath();
      // Drip blobs
      for (let i = 0; i <= 8; i++) {
        const ang = startA + (i / 8) * (endA - startA);
        trailG.fillStyle(0x880022, 0.45 * a);
        trailG.fillCircle(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, P(Phaser.Math.Between(4, 9)));
        trailG.fillStyle(0xcc0033, 0.30 * a);
        trailG.fillCircle(cx + Math.cos(ang) * (r - P(10)), cy + Math.sin(ang) * (r - P(10)), P(3));
      }
    };
    drawTrail(1);

    const tickTimer = this.scene.time.addEvent({
      delay: 500, repeat: Math.floor(SCYTHE_TRAIL_DUR / 500) - 1,
      callback: () => {
        this.onScytheTrailTick?.(cx, cy, r, aimAng, SCYTHE_ARC_DEG, this.scaleDmg(SCYTHE_TRAIL_DMG) * dmgMult);
      },
    });

    this.scene.tweens.add({
      targets: ta, v: 0, duration: SCYTHE_TRAIL_DUR, ease: 'Quad.In',
      onUpdate: () => drawTrail(ta.v),
      onComplete: () => { trailG.destroy(); tickTimer.destroy(); },
    });

    // Blood drip particles along arc
    const drips = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 8, max: 30 }, angle: { min: 60, max: 120 },
      scale: { start: 1.0, end: 0 }, alpha: { start: 0.70, end: 0 },
      tint: [0xaa0022, 0xcc0033, 0x880011],
      lifespan: { min: 400, max: 900 }, frequency: 160, quantity: 1, gravityY: 30,
    }).setDepth(5);
    this.scene.time.delayedCall(SCYTHE_TRAIL_DUR * 0.6, () => { if (drips.active) drips.stop(); });
    this.scene.time.delayedCall(SCYTHE_TRAIL_DUR + 1000, () => { if (drips.active) drips.destroy(); });
  }

  // ── 血液爆星 ───────────────────────────────────────────────

  private enterBurstWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_idle`);
    this.setBossState(BossState.VK_BURST_WARN);

    const bx = this.x, by = this.y;

    // Growing blood orb above boss
    const orbG = this.scene.add.graphics({ x: bx, y: by - P(20) }).setDepth(17);
    const os   = { r: 0, rot: 0 };
    this.scene.tweens.add({
      targets: os, r: P(30), rot: Math.PI * 3, duration: BURST_WARN_MS, ease: 'Quad.In',
      onUpdate: () => {
        orbG.clear();
        const eg = Math.min(os.r / P(30), 1);
        // Outer halo
        orbG.fillStyle(0x550022, 0.22 * eg);
        orbG.fillCircle(0, 0, os.r * 1.8);
        // Mid glow
        orbG.fillStyle(0x990033, 0.45 * eg);
        orbG.fillCircle(0, 0, os.r * 1.25);
        // Core orb
        orbG.fillStyle(0xcc0044, 0.92 * eg);
        orbG.fillCircle(0, 0, os.r);
        // Bright inner core
        orbG.fillStyle(0xff3355, 0.85 * eg);
        orbG.fillCircle(0, 0, os.r * 0.6);
        orbG.fillStyle(0xff99aa, 0.70 * eg);
        orbG.fillCircle(0, 0, os.r * 0.28);
        // Rotating rune ring
        for (let i = 0; i < 8; i++) {
          const a  = os.rot + i * Math.PI / 4;
          const ir = os.r * 1.1;
          orbG.lineStyle(P(2), 0xff2244, 0.65 * eg);
          orbG.lineBetween(Math.cos(a) * ir, Math.sin(a) * ir, Math.cos(a) * (ir + P(8) * eg), Math.sin(a) * (ir + P(8) * eg));
        }
        orbG.lineStyle(P(1.5), 0xff5566, 0.50 * eg);
        orbG.strokeCircle(0, 0, os.r * 1.15);
      },
      onComplete: () => orbG.destroy(),
    });

    const em = this.scene.add.particles(bx, by - P(20), 'pxl2', {
      speed: { min: 60, max: 160 }, angle: { min: 0, max: 360 },
      scale: { start: 1.6, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0x440011, 0x880022, 0xcc0033, 0xff2244, 0xff6677],
      lifespan: { min: 180, max: 450 }, frequency: 25, quantity: mq(3),
    }).setDepth(18);

    this.stateTimer = this.scene.time.delayedCall(BURST_WARN_MS, () => {
      em.destroy(); orbG.destroy();
      this._fireBurstOrbs(bx, by);
    });
  }

  private _fireBurstOrbs(bx: number, by: number, onDone?: () => void): void {
    if (this.currentState === BossState.DEAD) return;
    this.playDir(`${this.animPrefix}_attack`);
    this.scene.cameras.main.shake(180, 0.018);

    const HIT_R = P(BURST_HIT_R);
    const dmg   = this.scaleDmg(BURST_DMG);

    // Big burst flash
    const flash = this.scene.add.graphics({ x: bx, y: by }).setDepth(22);
    flash.fillStyle(0xffffff, 0.85); flash.fillCircle(0, 0, P(40));
    flash.fillStyle(0xff2244, 0.70); flash.fillCircle(0, 0, P(24));
    this.scene.tweens.add({ targets: flash, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 280, onComplete: () => flash.destroy() });

    // Shockwave rings
    for (let rw = 0; rw < 3; rw++) {
      this.scene.time.delayedCall(rw * 80, () => {
        const rg = this.scene.add.graphics({ x: bx, y: by }).setDepth(19);
        rg.lineStyle(P(3 - rw), 0xff2244, 0.9); rg.strokeCircle(0, 0, P(20 + rw * 8));
        this.scene.tweens.add({ targets: rg, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 350, ease: 'Quad.Out', onComplete: () => rg.destroy() });
      });
    }

    for (let i = 0; i < BURST_COUNT; i++) {
      const ang  = (i / BURST_COUNT) * Math.PI * 2;
      const dist = P(Phaser.Math.Between(210, 340));
      const tx   = bx + Math.cos(ang) * dist;
      const ty   = by + Math.sin(ang) * dist;
      const speed = Phaser.Math.Between(290, 420);
      const travelMs = Math.round((dist / P(speed)) * 1000);

      this.scene.time.delayedCall(i * 18, () => {
        if (this.currentState === BossState.DEAD) return;

        const orbG = this.scene.add.graphics({ x: bx, y: by }).setDepth(20);
        const trail = this.scene.add.particles(bx, by, 'pxl2', {
          speed: { min: 10, max: 30 }, angle: { min: 0, max: 360 },
          scale: { start: 0.9, end: 0 }, alpha: { start: 0.75, end: 0 },
          tint: [0x880022, 0xcc0033, 0xff2244],
          lifespan: { min: 60, max: 160 }, frequency: 14, quantity: 1,
        }).setDepth(19);

        const prog = { t: 0 };
        let flyHit = false;
        const flyDmg = Math.round(dmg * 0.6);
        this.scene.tweens.add({
          targets: prog, t: 1, duration: travelMs, ease: 'Linear',
          onUpdate: () => {
            const cx = bx + Math.cos(ang) * dist * prog.t;
            const cy = by + Math.sin(ang) * dist * prog.t;
            orbG.setPosition(cx, cy); trail.setPosition(cx, cy);
            orbG.clear();
            orbG.fillStyle(0x550022, 0.22);  orbG.fillCircle(0, 0, P(18));
            orbG.fillStyle(0xaa0033, 0.55);  orbG.fillCircle(0, 0, P(12));
            orbG.fillStyle(0xcc0044, 0.92);  orbG.fillCircle(0, 0, P(8));
            orbG.fillStyle(0xff3355, 0.80);  orbG.fillCircle(0, 0, P(5));
            orbG.fillStyle(0xffeeff, 0.85);  orbG.fillCircle(0, 0, P(2));
            orbG.lineStyle(P(1.5), 0xff6677, 0.70); orbG.strokeCircle(0, 0, P(10));
            // 飛行中碰撞（每顆只打一次）
            if (!flyHit && prog.t > 0.05) {
              if (this.onBurstOrbFly?.(cx, cy, HIT_R, flyDmg)) flyHit = true;
            }
          },
          onComplete: () => {
            orbG.destroy(); trail.stop();
            this.scene.time.delayedCall(250, () => { if (trail.active) trail.destroy(); });
            this._burstOrbExplode(tx, ty, HIT_R, dmg);
          },
        });
      });
    }

    const burstTotalMs = BURST_COUNT * 18 + 800;
    if (onDone) this.scene.time.delayedCall(burstTotalMs, onDone);
    else this.stateTimer = this.scene.time.delayedCall(burstTotalMs, () => this.enterIdle());
  }

  private _burstOrbExplode(x: number, y: number, hitR: number, dmg: number): void {
    // Flash
    const fl = this.scene.add.graphics({ x, y }).setDepth(21);
    fl.fillStyle(0xffffff, 0.80); fl.fillCircle(0, 0, P(10));
    fl.fillStyle(0xff2244, 0.70); fl.fillCircle(0, 0, P(7));
    this.scene.tweens.add({ targets: fl, alpha: 0, scaleX: 2.8, scaleY: 2.8, duration: 220, onComplete: () => fl.destroy() });

    // Shockwave
    const sw = this.scene.add.graphics({ x, y }).setDepth(20);
    sw.lineStyle(P(2), 0xff2244, 0.9); sw.strokeCircle(0, 0, P(8));
    this.scene.tweens.add({ targets: sw, scaleX: 3.2, scaleY: 3.2, alpha: 0, duration: 280, ease: 'Quad.Out', onComplete: () => sw.destroy() });

    // Blood splash
    const splat = this.scene.add.graphics({ x, y }).setDepth(18);
    splat.fillStyle(0x880022, 0.55); splat.fillCircle(0, 0, hitR);
    splat.lineStyle(P(2), 0xff2244, 0.80); splat.strokeCircle(0, 0, hitR);
    this.scene.tweens.add({ targets: splat, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 350, ease: 'Quad.In', onComplete: () => splat.destroy() });

    // Splatter particles
    const burst = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 55, max: 180 }, angle: { min: 0, max: 360 },
      scale: { start: 1.5, end: 0 }, alpha: { start: 0.95, end: 0 },
      tint: [0x880022, 0xcc0033, 0xff2244, 0xdd0044],
      lifespan: { min: 120, max: 320 }, emitting: false,
    }).setDepth(21);
    burst.emitParticleAt(0, 0, mq(10));
    this.scene.time.delayedCall(380, () => { if (burst.active) burst.destroy(); });

    this.onBurstOrbLand?.(x, y, hitR, dmg);
  }

  // ── 血刺地獄 ───────────────────────────────────────────────

  private enterSpikeHellWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);
    this.setBossState(BossState.VK_SPIKE_WARN);

    const aR  = this.arenaRadius * 0.85;
    const acx = this.arenaCenter.x, acy = this.arenaCenter.y;

    for (let wave = 0; wave < SPIKE_WAVES; wave++) {
      const wavePositions: { x: number; y: number }[] = [];
      for (let s = 0; s < SPIKE_PER_WAVE; s++) {
        const a  = Math.random() * Math.PI * 2;
        const d  = Math.sqrt(Math.random()) * aR;
        wavePositions.push({ x: acx + Math.cos(a) * d, y: acy + Math.sin(a) * d });
      }
      this.scene.time.delayedCall(wave * SPIKE_WAVE_GAP, () => {
        if (this.currentState === BossState.DEAD) return;
        this._spawnSpikeWave(wavePositions);
      });
    }

    const totalMs = SPIKE_WAVES * SPIKE_WAVE_GAP + SPIKE_WARN_MS + 1500;
    this.stateTimer = this.scene.time.delayedCall(totalMs, () => this.enterIdle());
  }

  private _spawnSpikeWave(positions: { x: number; y: number }[]): void {
    const HIT_R = P(SPIKE_HIT_R);
    const dmg   = this.scaleDmg(SPIKE_DMG);

    for (const { x, y } of positions) {
      // Warning circle + spike tip
      const warnG = this.scene.add.graphics({ x, y }).setDepth(7);
      const wt    = { v: 0.4 };
      this.scene.tweens.add({
        targets: wt, v: 1.0, duration: 120, yoyo: true, repeat: -1,
        onUpdate: () => {
          warnG.clear();
          // Spike tip showing
          warnG.fillStyle(0xaa0022, wt.v * 0.75);
          warnG.fillTriangle(-P(4), P(4), P(4), P(4), 0, -P(10));
          // Warning ring
          warnG.lineStyle(P(2), 0xff2244, wt.v * 0.85);
          warnG.strokeCircle(0, 0, HIT_R);
          // Inner ring
          warnG.lineStyle(P(1.5), 0xff6677, wt.v * 0.55);
          warnG.strokeCircle(0, 0, HIT_R * 0.55);
          // Crack lines radiating out
          for (let c = 0; c < 4; c++) {
            const ca = c * Math.PI / 2 + 0.3;
            warnG.lineStyle(P(1.5), 0xcc0033, wt.v * 0.60);
            warnG.lineBetween(0, 0, Math.cos(ca) * HIT_R * 0.85, Math.sin(ca) * HIT_R * 0.85);
          }
        },
      });

      this.scene.time.delayedCall(SPIKE_WARN_MS, () => {
        warnG.destroy();
        if (this.currentState === BossState.DEAD) return;
        this._eruptSpike(x, y, HIT_R, dmg);
      });
    }
  }

  private _eruptSpike(x: number, y: number, hitR: number, dmg: number): void {
    const spikeG = this.scene.add.graphics({ x, y }).setDepth(16);
    const se     = { s: 0 };

    // Erupt tween: scale from 0 to full in 180ms
    this.scene.tweens.add({
      targets: se, s: 1, duration: 180, ease: 'Back.Out',
      onUpdate: () => {
        spikeG.clear();
        const h  = P(55) * se.s;
        const hw = P(14) * se.s;
        // Blood pool at base
        spikeG.fillStyle(0x660011, 0.55 * se.s);
        spikeG.fillEllipse(0, 0, hw * 1.6, hw * 0.7);
        // Main crystal pillar
        spikeG.fillStyle(0xaa0022, 0.95 * se.s);
        spikeG.fillTriangle(-hw * 0.7, P(2), hw * 0.7, P(2), 0, -h);
        spikeG.fillStyle(0xcc0033, 0.90 * se.s);
        spikeG.fillTriangle(-hw * 0.45, P(2), hw * 0.45, P(2), 0, -h * 0.88);
        // Shard 1 (left)
        spikeG.fillStyle(0x880022, 0.80 * se.s);
        spikeG.fillTriangle(-hw, P(2), -hw * 0.35, P(2), -hw * 0.6, -h * 0.55);
        // Shard 2 (right)
        spikeG.fillStyle(0x880022, 0.80 * se.s);
        spikeG.fillTriangle(hw, P(2), hw * 0.35, P(2), hw * 0.6, -h * 0.55);
        // Bright facet on main
        spikeG.fillStyle(0xff5566, 0.50 * se.s);
        spikeG.fillTriangle(-hw * 0.2, P(2), P(2), P(2), 0, -h * 0.60);
        // Tip glow
        spikeG.fillStyle(0xff8899, 0.70 * se.s);
        spikeG.fillCircle(0, -h, P(4) * se.s);
        spikeG.fillStyle(0xffeeff, 0.55 * se.s);
        spikeG.fillCircle(0, -h, P(2) * se.s);
      },
    });

    // Particle burst on erupt
    const burst = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 50, max: 150 }, angle: { min: 200, max: 340 },
      scale: { start: 1.6, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0x880022, 0xcc0033, 0xff2244],
      lifespan: { min: 150, max: 350 }, emitting: false,
    }).setDepth(17);
    burst.emitParticleAt(0, 0, mq(8));
    this.scene.time.delayedCall(400, () => { if (burst.active) burst.destroy(); });

    this.onSpikeHit?.(x, y, hitR, dmg);

    // Stand for 1.3s then retract
    this.scene.time.delayedCall(1300, () => {
      this.scene.tweens.add({
        targets: se, s: 0, duration: 250, ease: 'Quad.In',
        onUpdate: () => {
          spikeG.clear();
          const h  = P(55) * se.s;
          const hw = P(14) * se.s;
          spikeG.fillStyle(0xaa0022, 0.95 * se.s);
          spikeG.fillTriangle(-hw * 0.7, P(2), hw * 0.7, P(2), 0, -h);
          spikeG.fillStyle(0xcc0033, 0.90 * se.s);
          spikeG.fillTriangle(-hw * 0.45, P(2), hw * 0.45, P(2), 0, -h * 0.88);
        },
        onComplete: () => {
          spikeG.destroy();
          // Shatter particles
          const shatter = this.scene.add.particles(x, y, 'pxl2', {
            speed: { min: 30, max: 120 }, angle: { min: 180, max: 360 },
            scale: { start: 1.2, end: 0 }, alpha: { start: 0.80, end: 0 },
            tint: [0x880022, 0xcc0033, 0xaa0022],
            lifespan: { min: 150, max: 350 }, emitting: false,
          }).setDepth(15);
          shatter.emitParticleAt(0, 0, mq(6));
          this.scene.time.delayedCall(400, () => { if (shatter.active) shatter.destroy(); });
        },
      });
    });
  }

  // ── 血液分裂 ───────────────────────────────────────────────

  private enterBloodSplitWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.setBossState(BossState.VK_SPLIT_WARN);

    const cx = this.arenaCenter.x, cy = this.arenaCenter.y;

    // Boss teleport ripple at current position
    this._spawnBloodTeleportVfx(this.x, this.y);

    // Move boss to center
    this.scene.tweens.add({
      targets: this, x: cx, y: cy, duration: SPLIT_MOVE_MS, ease: 'Quad.InOut',
      onUpdate: () => (this.body as Phaser.Physics.Arcade.Body).reset(this.x, this.y),
      onComplete: () => {
        (this.body as Phaser.Physics.Arcade.Body).reset(cx, cy);
        this._doBloodSplitCharge(cx, cy);
      },
    });
  }

  private _doBloodSplitCharge(cx: number, cy: number): void {
    if (this.currentState === BossState.DEAD) return;

    const vortG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(15);
    const vt    = { rot: 0, r: 0 };
    this.scene.tweens.add({
      targets: vt, rot: Math.PI * 5, r: P(90), duration: SPLIT_CHARGE_MS, ease: 'Quad.In',
      onUpdate: () => {
        vortG.clear();
        const eg = Math.min(vt.r / P(90), 1);
        // Outer ring
        vortG.lineStyle(P(3), 0xcc0044, 0.55 * eg);
        vortG.strokeCircle(0, 0, vt.r);
        // Spiral arms
        for (let i = 0; i < 8; i++) {
          const a  = vt.rot + i * Math.PI / 4;
          const r2 = vt.r * 0.88;
          vortG.lineStyle(P(2), 0xff2255, 0.65 * eg);
          vortG.lineBetween(Math.cos(a) * P(12) * eg, Math.sin(a) * P(12) * eg, Math.cos(a) * r2, Math.sin(a) * r2);
        }
        // Core
        vortG.fillStyle(0x660022, 0.70 * eg);
        vortG.fillCircle(0, 0, P(18) * eg);
        vortG.fillStyle(0xaa0033, 0.55 * eg);
        vortG.fillCircle(0, 0, P(10) * eg);
        vortG.lineStyle(P(2), 0xff4466, 0.80 * eg);
        vortG.strokeCircle(0, 0, vt.r * 0.5);
      },
    });

    // Blood particle vacuum (sucked toward center)
    const em = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 40, max: 120 }, angle: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0 }, alpha: { start: 0.80, end: 0 },
      tint: [0x440011, 0x880022, 0xcc0033, 0xff2244],
      lifespan: { min: 250, max: 600 }, frequency: 22, quantity: mq(4),
    }).setDepth(16);

    this.scene.time.delayedCall(SPLIT_CHARGE_MS, () => {
      vortG.destroy(); em.destroy();
      if (this.currentState === BossState.DEAD) return;
      this._executeSplit(cx, cy);
    });
  }

  private _executeSplit(acx: number, acy: number): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.VK_SPLIT_ACTIVE);

    // Screen flash
    this.scene.cameras.main.flash(120, 180, 0, 20, false);
    this.scene.cameras.main.shake(200, 0.022);

    // Pick 3 of 4 diagonal corners
    const corners = [
      { x: acx - P(SPLIT_CORNER_R), y: acy - P(SPLIT_CORNER_R) },
      { x: acx + P(SPLIT_CORNER_R), y: acy - P(SPLIT_CORNER_R) },
      { x: acx + P(SPLIT_CORNER_R), y: acy + P(SPLIT_CORNER_R) },
      { x: acx - P(SPLIT_CORNER_R), y: acy + P(SPLIT_CORNER_R) },
    ].sort(() => Math.random() - 0.5);
    const chosen = corners.slice(0, 3);

    // Boss goes to chosen[0]
    this.setPosition(chosen[0].x, chosen[0].y);
    (this.body as Phaser.Physics.Arcade.Body).reset(chosen[0].x, chosen[0].y);
    this._spawnBloodTeleportVfx(chosen[0].x, chosen[0].y);

    // Create 2 clones at chosen[1] and chosen[2]
    this._splitActive = true;
    this._splitClonesAliveCount = 2;
    this._splitCloneProxies = [];
    this._splitCloneGfx = [];

    for (let i = 0; i < 2; i++) {
      const cp = chosen[1 + i];
      const proxy = new VK3CloneProxy(this, i, cp.x, cp.y);
      this._splitCloneProxies.push(proxy);

      // Clone visual: aura + sprite image
      const aura = this.scene.add.graphics({ x: cp.x, y: cp.y }).setDepth(11);
      const img  = this.scene.add.image(cp.x, cp.y, this.texture.key, this.frame.name)
        .setTint(0xff3355).setAlpha(0.72).setScale(this.scaleX, this.scaleY).setDepth(12);

      const em = this.scene.add.particles(cp.x, cp.y, 'pxl2', {
        speed: { min: 15, max: 55 }, angle: { min: 0, max: 360 },
        scale: { start: 1.2, end: 0 }, alpha: { start: 0.65, end: 0 },
        tint: [0x440011, 0x880022, 0xcc0033],
        lifespan: { min: 200, max: 500 }, frequency: 45, quantity: 1,
      }).setDepth(11);

      // Pulsing aura
      const at = { v: 0.3 };
      this.scene.tweens.add({
        targets: at, v: 0.8, duration: 350, yoyo: true, repeat: -1,
        onUpdate: () => {
          if (!proxy.alive) return;
          aura.clear();
          aura.lineStyle(P(3), 0xff2244, at.v * 0.85);
          aura.strokeCircle(0, 0, P(26));
          aura.fillStyle(0x880022, at.v * 0.25);
          aura.fillCircle(0, 0, P(26));
          aura.lineStyle(P(2), 0xff6677, at.v * 0.55);
          aura.strokeCircle(0, 0, P(18));
        },
      });

      this._splitCloneGfx.push({ aura, img, em, alive: true });
    }

    // Randomly pick skill for this split
    const SPLIT_SKILLS = ['scythe', 'burst', 'spike', 'river'] as const;
    const splitType = SPLIT_SKILLS[Math.floor(Math.random() * SPLIT_SKILLS.length)];

    const ap = this.scene.time.delayedCall(80, () => {
      if (this.currentState === BossState.DEAD) return;
      // 本體打完第一招後恢復自由行動
      this._fireSplitBossAttack(splitType, chosen[0].x, chosen[0].y, () => {
        if (this._splitActive) this.enterIdle();
      });
      // 分身打第一招
      for (let i = 0; i < 2; i++) {
        this._doCloneAttack(i, chosen[1 + i].x, chosen[1 + i].y, splitType);
      }
      // 分身第一招結束後開始自由出招循環
      this.scene.time.delayedCall(3500, () => {
        for (let i = 0; i < 2; i++) {
          this._startCloneLoop(i);
        }
      });
    });
    void ap;

    // 15 秒後結束分裂
    this.scene.time.delayedCall(15000, () => {
      if (this._splitActive) this._endSplit();
    });
  }

  private _startCloneLoop(idx: number): void {
    if (!this._splitActive || this.currentState === BossState.DEAD) return;
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;

    const SKILLS = ['scythe', 'burst', 'spike', 'river'] as const;
    const type = SKILLS[Math.floor(Math.random() * SKILLS.length)];
    this._doCloneAttack(idx, proxy.x, proxy.y, type);

    // 下一次出招
    const nextDelay = Phaser.Math.Between(3500, 5500);
    this.scene.time.delayedCall(nextDelay, () => {
      this._startCloneLoop(idx);
    });
  }

  private _doCloneScytheAttack(idx: number, cx: number, cy: number, aimAng: number): void {
    if (!this._splitActive || this.currentState === BossState.DEAD) return;
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;

    // Clone warning arc
    const HALF = (SCYTHE_ARC_DEG / 2) * Math.PI / 180;
    const R    = P(SCYTHE_R);
    const warnG = this.scene.add.graphics().setDepth(7);
    const fw = { v: 0.4 };
    const pulse = this.scene.tweens.add({
      targets: fw, v: 0.9, duration: 160, yoyo: true, repeat: -1,
      onUpdate: () => this._drawScytheWarnArc(warnG, cx, cy, aimAng, HALF, R, fw.v * 0.75),
    });

    this.scene.time.delayedCall(SCYTHE_WARN_MS, () => {
      pulse.stop(); warnG.destroy();
      if (!proxy.alive || this.currentState === BossState.DEAD) return;

      this._doScytheSweep(cx, cy, aimAng, true, () => {
        this._cloneSelfDestruct(idx, cx, cy);
      });
    });
  }

  hitClone(idx: number): void {
    if (!this._splitActive || idx < 0 || idx >= this._splitCloneGfx.length) return;
    const g = this._splitCloneGfx[idx];
    if (!g || !g.alive) return;
    g.alive = false;
    this._destroyCloneGfx(idx, this._splitCloneProxies[idx].x, this._splitCloneProxies[idx].y);
    this._splitClonesAliveCount--;
    if (this._splitClonesAliveCount <= 0) this._endSplit();
  }

  private _destroyCloneGfx(idx: number, x: number, y: number): void {
    const g = this._splitCloneGfx[idx];
    if (!g) return;
    g.aura.destroy(); g.img.destroy(); g.em.destroy();

    // Blood shatter explosion
    this.scene.cameras.main.shake(120, 0.012);
    const ex = this.scene.add.graphics({ x, y }).setDepth(22);
    ex.fillStyle(0xff2244, 0.80); ex.fillCircle(0, 0, P(28));
    this.scene.tweens.add({ targets: ex, alpha: 0, scaleX: 2.4, scaleY: 2.4, duration: 300, onComplete: () => ex.destroy() });

    const burst = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 80, max: 260 }, angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0xcc0033, 0xff2244, 0xff5566, 0x880022],
      lifespan: { min: 180, max: 420 }, emitting: false,
    }).setDepth(23);
    burst.emitParticleAt(0, 0, mq(16));
    this.scene.time.delayedCall(500, () => { if (burst.active) burst.destroy(); });
  }

  private _endSplit(): void {
    if (!this._splitActive) return;
    this._splitActive = false;
    // Destroy any remaining clone GFX
    for (let i = 0; i < this._splitCloneGfx.length; i++) {
      const g = this._splitCloneGfx[i];
      if (g && g.alive) {
        g.alive = false;
        if (g.aura.active) g.aura.destroy();
        if (g.img.active)  g.img.destroy();
        if (g.em.active)   g.em.destroy();
      }
    }
    this._splitCloneGfx = [];
    this._splitCloneProxies.forEach(p => { p.isDead = true; p.alive = false; p.active = false; });
    this.enterIdle();
  }

  private _spawnBloodTeleportVfx(x: number, y: number): void {
    const g = this.scene.add.graphics({ x, y }).setDepth(19);
    g.fillStyle(0xcc0033, 0.70); g.fillCircle(0, 0, P(30));
    this.scene.tweens.add({ targets: g, alpha: 0, scaleX: 2.8, scaleY: 2.8, duration: 380, ease: 'Quad.Out', onComplete: () => g.destroy() });

    const em = this.scene.add.particles(x, y, 'pxl2', {
      speed: { min: 80, max: 220 }, angle: { min: 0, max: 360 },
      scale: { start: 1.8, end: 0 }, alpha: { start: 1, end: 0 },
      tint: [0x880022, 0xcc0033, 0xff2244],
      lifespan: { min: 150, max: 380 }, emitting: false,
    }).setDepth(20);
    em.emitParticleAt(0, 0, mq(14));
    this.scene.time.delayedCall(450, () => { if (em.active) em.destroy(); });
  }

  // ── 鮮血長河 ───────────────────────────────────────────────

  private enterBloodRiverWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_attack`);

    const bx = this.x, by = this.y;
    const [tx, ty] = this.getTargetPos();
    const ang  = Math.atan2(ty - by, tx - bx);
    // Extend river to arena edge
    const dist = this.arenaRadius * 1.5;
    const ex = bx + Math.cos(ang) * P(dist);
    const ey = by + Math.sin(ang) * P(dist);

    this.setBossState(BossState.VK_RIVER_WARN, { angle: ang });

    const HW  = P(RIVER_HALF_W);
    const perp = ang + Math.PI / 2;
    const pc = Math.cos(perp), ps = Math.sin(perp);

    // Warning channel graphic
    const warnG = this.scene.add.graphics().setDepth(7);
    const ww = { v: 0.4 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: ww, v: 1.0, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        // Channel fill
        warnG.fillStyle(0x880022, 0.18 * ww.v);
        warnG.fillPoints([
          { x: bx + pc * HW,  y: by + ps * HW  },
          { x: bx - pc * HW,  y: by - ps * HW  },
          { x: ex - pc * HW,  y: ey - ps * HW  },
          { x: ex + pc * HW,  y: ey + ps * HW  },
        ], true);
        warnG.fillCircle(bx, by, HW);
        // Channel border — arc cap at origin
        warnG.lineStyle(P(2), 0xff2244, 0.75 * ww.v);
        warnG.strokeCircle(bx, by, HW);
        warnG.lineBetween(bx + pc * HW,  by + ps * HW,  ex + pc * HW,  ey + ps * HW);
        warnG.lineBetween(bx - pc * HW,  by - ps * HW,  ex - pc * HW,  ey - ps * HW);
        // Arrow markers along channel
        const totalDist = Phaser.Math.Distance.Between(bx, by, ex, ey);
        const numArr = Math.floor(totalDist / P(60));
        for (let k = 0; k < numArr; k++) {
          const t  = (k + 0.5) / numArr;
          const ax = bx + Math.cos(ang) * totalDist * t;
          const ay = by + Math.sin(ang) * totalDist * t;
          warnG.fillStyle(0xff2244, 0.55 * ww.v);
          warnG.fillTriangle(ax + Math.cos(ang) * P(10), ay + Math.sin(ang) * P(10),
            ax + pc * P(8), ay + ps * P(8), ax - pc * P(8), ay - ps * P(8));
        }
      },
    });

    const em = this.scene.add.particles(bx, by, 'pxl2', {
      speed: { min: 30, max: 80 }, angle: { min: 0, max: 360 },
      scale: { start: 1.4, end: 0 }, alpha: { start: 0.75, end: 0 },
      tint: [0x440011, 0x880022, 0xcc0033],
      lifespan: { min: 180, max: 420 }, frequency: 30, quantity: mq(3),
    }).setDepth(8);

    this.stateTimer = this.scene.time.delayedCall(RIVER_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy(); em.destroy();
      this._fireBloodRiver(bx, by, ex, ey, ang, HW);
    });
  }

  private _fireBloodRiver(bx: number, by: number, ex: number, ey: number, ang: number, halfW: number, onDone?: () => void): void {
    if (this.currentState === BossState.DEAD) return;
    this.scene.cameras.main.shake(250, 0.020);

    const totalDist = Phaser.Math.Distance.Between(bx, by, ex, ey);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const perp = ang + Math.PI / 2;
    const pc = Math.cos(perp), ps = Math.sin(perp);

    const riverG = this.scene.add.graphics().setDepth(8);
    let   flowT  = 0;

    const drawRiver = (alpha: number) => {
      riverG.clear();
      // Dark base
      riverG.fillStyle(0x330011, 0.80 * alpha);
      riverG.fillPoints([
        { x: bx + pc * halfW, y: by + ps * halfW },
        { x: bx - pc * halfW, y: by - ps * halfW },
        { x: ex - pc * halfW, y: ey - ps * halfW },
        { x: ex + pc * halfW, y: ey + ps * halfW },
      ], true);
      riverG.fillCircle(bx, by, halfW);
      // Blood fill
      riverG.fillStyle(0xaa0022, 0.70 * alpha);
      riverG.fillPoints([
        { x: bx + pc * halfW * 0.85, y: by + ps * halfW * 0.85 },
        { x: bx - pc * halfW * 0.85, y: by - ps * halfW * 0.85 },
        { x: ex - pc * halfW * 0.85, y: ey - ps * halfW * 0.85 },
        { x: ex + pc * halfW * 0.85, y: ey + ps * halfW * 0.85 },
      ], true);
      riverG.fillCircle(bx, by, halfW * 0.85);
      // Center bright channel
      riverG.fillStyle(0xdd0033, 0.50 * alpha);
      riverG.fillPoints([
        { x: bx + pc * halfW * 0.40, y: by + ps * halfW * 0.40 },
        { x: bx - pc * halfW * 0.40, y: by - ps * halfW * 0.40 },
        { x: ex - pc * halfW * 0.40, y: ey - ps * halfW * 0.40 },
        { x: ex + pc * halfW * 0.40, y: ey + ps * halfW * 0.40 },
      ], true);
      riverG.fillCircle(bx, by, halfW * 0.40);
      // Edge highlights — arc cap at origin, straight lines along sides
      riverG.lineStyle(P(2.5), 0xff3355, 0.75 * alpha);
      riverG.strokeCircle(bx, by, halfW);
      riverG.lineBetween(bx + pc * halfW, by + ps * halfW, ex + pc * halfW, ey + ps * halfW);
      riverG.lineBetween(bx - pc * halfW, by - ps * halfW, ex - pc * halfW, ey - ps * halfW);

      // Animated flow ripples
      const NUM_RIPPLES = 6;
      for (let r = 0; r < NUM_RIPPLES; r++) {
        const t = ((r / NUM_RIPPLES + flowT) % 1.0);
        const rx = bx + cos * totalDist * t;
        const ry = by + sin * totalDist * t;
        riverG.lineStyle(P(1.5), 0xff6677, 0.40 * alpha);
        riverG.lineBetween(rx + pc * halfW * 0.7, ry + ps * halfW * 0.7, rx - pc * halfW * 0.7, ry - ps * halfW * 0.7);
      }

      // Foam/splash glints on edge
      for (let g = 0; g < 8; g++) {
        const t  = ((g / 8 + flowT * 1.5) % 1.0);
        const gx = bx + cos * totalDist * t;
        const gy = by + sin * totalDist * t;
        const side = (g % 2 === 0) ? 1 : -1;
        riverG.fillStyle(0xff8899, 0.30 * alpha);
        riverG.fillCircle(gx + pc * halfW * 0.88 * side, gy + ps * halfW * 0.88 * side, P(3));
      }
    };

    drawRiver(1);

    // Flow animation timer
    const flowTimer = this.scene.time.addEvent({
      delay: 33, loop: true,
      callback: () => { flowT = (flowT + 0.022) % 1.0; drawRiver(riverA.v); },
    });

    const riverA = { v: 1 };

    // Damage tick
    const dmg      = this.scaleDmg(RIVER_DMG);
    const tickTimer = this.scene.time.addEvent({
      delay: RIVER_TICK_MS, repeat: Math.floor(RIVER_DUR / RIVER_TICK_MS) - 1,
      callback: () => {
        this.onRiverTick?.(bx, by, ex, ey, halfW, dmg);
      },
    });

    // Particle spray along river
    const spray = this.scene.add.particles(bx, by, 'pxl2', {
      speed: { min: 20, max: 70 }, angle: { min: 60, max: 120 },
      scale: { start: 1.3, end: 0 }, alpha: { start: 0.75, end: 0 },
      tint: [0x880022, 0xcc0033, 0xff2244],
      lifespan: { min: 300, max: 700 }, frequency: 60, quantity: 1, gravityY: 25,
    }).setDepth(9);
    this.scene.time.delayedCall(RIVER_DUR * 0.65, () => { if (spray.active) spray.stop(); });

    // Fade out river after RIVER_DUR
    this.scene.tweens.add({
      targets: riverA, v: 0, delay: RIVER_DUR * 0.7, duration: RIVER_DUR * 0.3, ease: 'Quad.In',
      onComplete: () => {
        riverG.destroy(); flowTimer.destroy(); tickTimer.destroy();
        if (spray.active) spray.destroy();
      },
    });

    if (onDone) this.scene.time.delayedCall(RIVER_DUR + 200, onDone);
    else this.stateTimer = this.scene.time.delayedCall(RIVER_DUR + 200, () => this.enterIdle());
  }

  // ── 血液分裂：技能分派 ─────────────────────────────────────

  private _fireSplitBossAttack(type: string, bx: number, by: number, onDone: () => void): void {
    const [px, py] = this.getTargetPos();
    if (type === 'scythe') {
      const aimAng = Math.atan2(py - by, px - bx);
      const HALF   = (SCYTHE_ARC_DEG / 2) * Math.PI / 180;
      const R      = P(SCYTHE_R);
      const warnG  = this.scene.add.graphics().setDepth(7);
      const fw     = { v: 0.5 };
      const pulse  = this.scene.tweens.add({ targets: fw, v: 1.0, duration: 160, yoyo: true, repeat: -1,
        onUpdate: () => this._drawScytheWarnArc(warnG, bx, by, aimAng, HALF, R, fw.v) });
      this.scene.time.delayedCall(SCYTHE_WARN_MS, () => {
        pulse.stop(); warnG.destroy();
        this._doScytheSweep(bx, by, aimAng, false, onDone);
      });
    } else if (type === 'burst') {
      const orbG = this.scene.add.graphics({ x: bx, y: by - P(20) }).setDepth(17);
      const os   = { r: 0, rot: 0 };
      this.scene.tweens.add({ targets: os, r: P(30), rot: Math.PI * 3, duration: BURST_WARN_MS, ease: 'Quad.In',
        onUpdate: () => {
          orbG.clear();
          const eg = Math.min(os.r / P(30), 1);
          orbG.fillStyle(0x550022, 0.22 * eg); orbG.fillCircle(0, 0, os.r * 1.8);
          orbG.fillStyle(0xcc0044, 0.92 * eg); orbG.fillCircle(0, 0, os.r);
          orbG.fillStyle(0xff3355, 0.85 * eg); orbG.fillCircle(0, 0, os.r * 0.55);
          for (let i = 0; i < 8; i++) {
            const a  = os.rot + i * Math.PI / 4;
            const ir = os.r * 1.1;
            orbG.lineStyle(P(2), 0xff2244, 0.65 * eg);
            orbG.lineBetween(Math.cos(a) * ir, Math.sin(a) * ir, Math.cos(a) * (ir + P(8) * eg), Math.sin(a) * (ir + P(8) * eg));
          }
        },
        onComplete: () => orbG.destroy(),
      });
      this.scene.time.delayedCall(BURST_WARN_MS, () => this._fireBurstOrbs(bx, by, onDone));
    } else if (type === 'spike') {
      const aR = this.arenaRadius * 0.85;
      const acx = this.arenaCenter.x, acy = this.arenaCenter.y;
      for (let w = 0; w < SPIKE_WAVES; w++) {
        const pos: { x: number; y: number }[] = [];
        for (let s = 0; s < SPIKE_PER_WAVE; s++) {
          const a = Math.random() * Math.PI * 2;
          const d = Math.sqrt(Math.random()) * aR;
          pos.push({ x: acx + Math.cos(a) * d, y: acy + Math.sin(a) * d });
        }
        this.scene.time.delayedCall(w * SPIKE_WAVE_GAP, () => this._spawnSpikeWave(pos));
      }
      this.scene.time.delayedCall(SPIKE_WAVES * SPIKE_WAVE_GAP + SPIKE_WARN_MS + 1600, onDone);
    } else {
      const ang  = Math.atan2(py - by, px - bx);
      const dist = this.arenaRadius * 1.5;
      const ex   = bx + Math.cos(ang) * P(dist);
      const ey   = by + Math.sin(ang) * P(dist);
      const HW   = P(RIVER_HALF_W);
      const perp = ang + Math.PI / 2;
      const pc   = Math.cos(perp), ps = Math.sin(perp);
      const warnG = this.scene.add.graphics().setDepth(7);
      const ww    = { v: 0.4 };
      const pulse = this.scene.tweens.add({ targets: ww, v: 1.0, duration: 180, yoyo: true, repeat: -1,
        onUpdate: () => {
          warnG.clear();
          warnG.fillStyle(0x880022, 0.22 * ww.v);
          warnG.fillPoints([{ x: bx + pc * HW, y: by + ps * HW }, { x: bx - pc * HW, y: by - ps * HW },
            { x: ex - pc * HW, y: ey - ps * HW }, { x: ex + pc * HW, y: ey + ps * HW }], true);
          warnG.lineStyle(P(2), 0xff2244, 0.75 * ww.v);
          warnG.lineBetween(bx + pc * HW, by + ps * HW, ex + pc * HW, ey + ps * HW);
          warnG.lineBetween(bx - pc * HW, by - ps * HW, ex - pc * HW, ey - ps * HW);
        },
      });
      this.scene.time.delayedCall(1200, () => {
        pulse.stop(); warnG.destroy();
        this._fireBloodRiver(bx, by, ex, ey, ang, HW, onDone);
      });
    }
  }

  private _doCloneAttack(idx: number, cx: number, cy: number, type: string): void {
    if (!this._splitActive || this.currentState === BossState.DEAD) return;
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;
    const [px, py] = this.getTargetPos();
    if (type === 'scythe') {
      this._doCloneScytheAttack(idx, cx, cy, Math.atan2(py - cy, px - cx));
    } else if (type === 'burst') {
      this._doCloneBurstAttack(idx, cx, cy);
    } else if (type === 'spike') {
      this._doCloneSpikeAttack(idx, cx, cy);
    } else {
      this._doCloneRiverAttack(idx, cx, cy);
    }
  }

  private _cloneSelfDestruct(idx: number, cx: number, cy: number): void {
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || !proxy.alive) return;
    proxy.isDead = true; proxy.alive = false; proxy.active = false;
    this._destroyCloneGfx(idx, cx, cy);
    this._splitClonesAliveCount--;
    if (this._splitClonesAliveCount <= 0) this._endSplit();
  }

  private _doCloneBurstAttack(idx: number, cx: number, cy: number): void {
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;
    const CLONE_N = 12;
    const HIT_R   = P(BURST_HIT_R);
    const dmg     = this.scaleDmg(Math.round(BURST_DMG * 0.75));

    const chargeG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(17);
    const cs = { r: 0 };
    this.scene.tweens.add({
      targets: cs, r: P(22), duration: BURST_WARN_MS, ease: 'Quad.In',
      onUpdate: () => {
        chargeG.clear();
        const eg = cs.r / P(22);
        chargeG.fillStyle(0xcc0044, 0.55 * eg); chargeG.fillCircle(0, 0, cs.r);
        chargeG.fillStyle(0xff3355, 0.45 * eg); chargeG.fillCircle(0, 0, cs.r * 0.5);
      },
      onComplete: () => {
        chargeG.destroy();
        if (!proxy.alive || this.currentState === BossState.DEAD) return;
        const fl = this.scene.add.graphics({ x: cx, y: cy }).setDepth(22);
        fl.fillStyle(0xff2244, 0.80); fl.fillCircle(0, 0, P(26));
        this.scene.tweens.add({ targets: fl, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 250, onComplete: () => fl.destroy() });
        for (let i = 0; i < CLONE_N; i++) {
          const ang  = (i / CLONE_N) * Math.PI * 2;
          const dist = P(Phaser.Math.Between(190, 290));
          const tx = cx + Math.cos(ang) * dist, ty = cy + Math.sin(ang) * dist;
          this.scene.time.delayedCall(i * 22, () => {
            if (!proxy.alive || this.currentState === BossState.DEAD) return;
            const oG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(20);
            const prog = { t: 0 };
            this.scene.tweens.add({
              targets: prog, t: 1, duration: Math.round((dist / P(340)) * 1000), ease: 'Linear',
              onUpdate: () => {
                const ox = cx + Math.cos(ang) * dist * prog.t, oy = cy + Math.sin(ang) * dist * prog.t;
                oG.setPosition(ox, oy).clear();
                oG.fillStyle(0x550022, 0.20); oG.fillCircle(0, 0, P(16));
                oG.fillStyle(0xcc0044, 0.88); oG.fillCircle(0, 0, P(8));
                oG.fillStyle(0xff3355, 0.72); oG.fillCircle(0, 0, P(4));
              },
              onComplete: () => { oG.destroy(); this._burstOrbExplode(tx, ty, HIT_R, dmg); },
            });
          });
        }
        this.scene.time.delayedCall(CLONE_N * 22 + 700, () => this._cloneSelfDestruct(idx, cx, cy));
      },
    });
  }

  private _doCloneSpikeAttack(idx: number, cx: number, cy: number): void {
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;
    const HIT_R      = P(SPIKE_HIT_R);
    const dmg        = this.scaleDmg(Math.round(SPIKE_DMG * 0.75));
    const CLONE_WAVES = 2;
    const CLONE_N     = 10;
    const SPREAD_R    = P(130);

    for (let w = 0; w < CLONE_WAVES; w++) {
      this.scene.time.delayedCall(w * SPIKE_WAVE_GAP, () => {
        if (!proxy.alive || this.currentState === BossState.DEAD) return;
        for (let s = 0; s < CLONE_N; s++) {
          const a  = Math.random() * Math.PI * 2;
          const d  = Math.random() * SPREAD_R;
          const sx = cx + Math.cos(a) * d, sy = cy + Math.sin(a) * d;
          const warnG = this.scene.add.graphics({ x: sx, y: sy }).setDepth(7);
          const wt = { v: 0.4 };
          this.scene.tweens.add({
            targets: wt, v: 1.0, duration: 120, yoyo: true, repeat: -1,
            onUpdate: () => {
              warnG.clear();
              warnG.lineStyle(P(2), 0xff2244, wt.v * 0.80); warnG.strokeCircle(0, 0, HIT_R);
              warnG.fillStyle(0xaa0022, wt.v * 0.60);
              warnG.fillTriangle(-P(4), P(4), P(4), P(4), 0, -P(9));
            },
          });
          this.scene.time.delayedCall(SPIKE_WARN_MS, () => {
            warnG.destroy();
            if (!proxy.alive || this.currentState === BossState.DEAD) return;
            this._eruptSpike(sx, sy, HIT_R, dmg);
          });
        }
      });
    }
    this.scene.time.delayedCall(CLONE_WAVES * SPIKE_WAVE_GAP + SPIKE_WARN_MS + 1600, () => this._cloneSelfDestruct(idx, cx, cy));
  }

  private _doCloneRiverAttack(idx: number, cx: number, cy: number): void {
    const proxy = this._splitCloneProxies[idx];
    if (!proxy || proxy.isDead) return;
    const [px, py] = this.getTargetPos();
    const ang   = Math.atan2(py - cy, px - cx);
    const dist  = this.arenaRadius * 1.5;
    const ex    = cx + Math.cos(ang) * P(dist), ey = cy + Math.sin(ang) * P(dist);
    const HW    = P(RIVER_HALF_W);
    const perp  = ang + Math.PI / 2;
    const pc = Math.cos(perp), ps = Math.sin(perp);
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const totalDist = Phaser.Math.Distance.Between(cx, cy, ex, ey);
    const dmg = this.scaleDmg(Math.round(RIVER_DMG * 0.75));

    const CLONE_RIVER_WARN = 1200;
    const warnG = this.scene.add.graphics().setDepth(7);
    const ww    = { v: 0.4 };
    const pulse = this.scene.tweens.add({ targets: ww, v: 1.0, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        warnG.fillStyle(0x880022, 0.22 * ww.v);
        warnG.fillPoints([{ x: cx + pc * HW, y: cy + ps * HW }, { x: cx - pc * HW, y: cy - ps * HW },
          { x: ex - pc * HW, y: ey - ps * HW }, { x: ex + pc * HW, y: ey + ps * HW }], true);
        warnG.lineStyle(P(2), 0xff2244, 0.75 * ww.v);
        warnG.lineBetween(cx + pc * HW, cy + ps * HW, ex + pc * HW, ey + ps * HW);
        warnG.lineBetween(cx - pc * HW, cy - ps * HW, ex - pc * HW, ey - ps * HW);
      },
    });

    this.scene.time.delayedCall(CLONE_RIVER_WARN, () => {
      pulse.stop();
      warnG.destroy();
      if (!proxy.alive || this.currentState === BossState.DEAD) return;

      const riverG = this.scene.add.graphics().setDepth(8);
      let   flowT  = 0;
      const riverA = { v: 1 };

      const drawR = (alpha: number) => {
        riverG.clear();
        riverG.fillStyle(0x330011, 0.75 * alpha);
        riverG.fillPoints([{ x: cx + pc * HW, y: cy + ps * HW }, { x: cx - pc * HW, y: cy - ps * HW }, { x: ex - pc * HW, y: ey - ps * HW }, { x: ex + pc * HW, y: ey + ps * HW }], true);
        riverG.fillStyle(0xaa0022, 0.62 * alpha);
        riverG.fillPoints([{ x: cx + pc * HW * 0.8, y: cy + ps * HW * 0.8 }, { x: cx - pc * HW * 0.8, y: cy - ps * HW * 0.8 }, { x: ex - pc * HW * 0.8, y: ey - ps * HW * 0.8 }, { x: ex + pc * HW * 0.8, y: ey + ps * HW * 0.8 }], true);
        riverG.lineStyle(P(2), 0xff3355, 0.68 * alpha);
        riverG.lineBetween(cx + pc * HW, cy + ps * HW, ex + pc * HW, ey + ps * HW);
        riverG.lineBetween(cx - pc * HW, cy - ps * HW, ex - pc * HW, ey - ps * HW);
        for (let r = 0; r < 4; r++) {
          const t = ((r / 4 + flowT) % 1.0);
          const rx = cx + cos * totalDist * t, ry = cy + sin * totalDist * t;
          riverG.lineStyle(P(1.5), 0xff6677, 0.32 * alpha);
          riverG.lineBetween(rx + pc * HW * 0.65, ry + ps * HW * 0.65, rx - pc * HW * 0.65, ry - ps * HW * 0.65);
        }
      };
      drawR(1);

      const flowTimer = this.scene.time.addEvent({ delay: 33, loop: true, callback: () => { flowT = (flowT + 0.022) % 1.0; drawR(riverA.v); } });
      const tickTimer = this.scene.time.addEvent({
        delay: RIVER_TICK_MS, repeat: Math.floor(RIVER_DUR / RIVER_TICK_MS) - 1,
        callback: () => { this.onRiverTick?.(cx, cy, ex, ey, HW, dmg); },
      });

      this.scene.tweens.add({
        targets: riverA, v: 0, delay: RIVER_DUR * 0.7, duration: RIVER_DUR * 0.3, ease: 'Quad.In',
        onComplete: () => {
          riverG.destroy(); flowTimer.destroy(); tickTimer.destroy();
          this._cloneSelfDestruct(idx, cx, cy);
        },
      });
    });
  }
}
