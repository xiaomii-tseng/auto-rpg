import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mf  = (ms: number) => MOB ? Math.round(ms * 2.0) : ms;

const CROWN_DMG   = 90;
const SPIKE_DMG   = 75;
const CROWN_SPEED = Math.round(165 * DPR);
const MAX_MINIONS = 4;
const ORBIT_R     = Math.round(30 * DPR);

// Color palette: golden-orange
const C_DARK  = 0x884400;
const C_MID   = 0xdd7700;
const C_MAIN  = 0xffaa00;
const C_LIGHT = 0xffcc44;
const C_HIGH  = 0xffee88;

export class BossFlowerThree extends Boss {
  onFirePetal?:      (fromX: number, fromY: number, angle: number, speed: number, dmg: number, blindDist: number) => void;
  onSpawnSeed?:      (positions: { x: number; y: number }[], count: number) => void;
  onPlaceSlowZones?: (positions: { x: number; y: number }[], radius: number, dur: number, bossX: number, bossY: number) => void;
  onPlaceSpike?:     (tx: number, ty: number, dmg: number) => void;
  getAliveCount?:    () => number;

  private readonly _shieldGfx: Phaser.GameObjects.Graphics;
  private _petalAngle    = 0;
  private _seedAngle     = 0;
  private _prevAlive        = -1;
  private _respawnPending   = false;
  private _respawnQueued    = false;
  private _forceSpawnDone   = false;
  private _forceSpawnQueued = false;
  private _firstIdle        = true;

  constructor(
    scene: Phaser.Scene, x: number, y: number, totalHp: number,
    element: import('../data/equipment-data').Element, spriteKey: string, tint: number,
  ) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    this.idleChaseSpeed = 0;
    this.idleStopRange  = 99999;
    this._shieldGfx = scene.add.graphics().setDepth(this.depth + 2);
  }

  override knockback(_fromX: number, _fromY: number, _power?: number): void { /* fixed in place */ }

  override get dmgDisplayMult(): number {
    const alive = this.getAliveCount?.() ?? 0;
    return alive > 0 ? 0.20 : 1;
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.currentState === BossState.DEAD) { this._shieldGfx.clear(); return; }
    this._petalAngle = (this._petalAngle + delta * 0.0018) % (Math.PI * 2);
    this._drawShield();

    // Detect all-minions-died → schedule delayed respawn
    const alive = this.getAliveCount?.() ?? 0;
    if (this._prevAlive > 0 && alive === 0 && !this._respawnPending) {
      this._respawnPending = true;
      const delay = Phaser.Math.Between(10000, 15000);
      this.scene.time.delayedCall(delay, () => {
        this._respawnPending = false;
        if (this.currentState !== BossState.DEAD) this._respawnQueued = true;
      });
    }
    this._prevAlive = alive;
  }

  // ── 被動：花粉護盾 ────────────────────────────────────────

  private _drawShield(): void {
    const count = Math.min(MAX_MINIONS, this.getAliveCount?.() ?? 0);
    this._shieldGfx.clear();
    this._shieldGfx.setPosition(this.x, this.y);
    if (count === 0) return;

    const pulse = Math.sin(this.scene.time.now * 0.004) * 0.15 + 0.85;
    const intensity = count / MAX_MINIONS;

    // Outer glow ring — scales with shield strength
    this._shieldGfx.lineStyle(P(9), C_MAIN, intensity * 0.20 * pulse);
    this._shieldGfx.strokeCircle(0, 0, ORBIT_R + P(14));
    this._shieldGfx.lineStyle(P(3), C_LIGHT, intensity * 0.55 * pulse);
    this._shieldGfx.strokeCircle(0, 0, ORBIT_R + P(9));
    this._shieldGfx.lineStyle(P(1.5), C_HIGH, intensity * 0.35 * pulse);
    this._shieldGfx.strokeCircle(0, 0, ORBIT_R + P(7));

    for (let i = 0; i < count; i++) {
      const a    = this._petalAngle + (i / count) * Math.PI * 2;
      const px   = Math.cos(a) * ORBIT_R;
      const py   = Math.sin(a) * ORBIT_R;
      const perp = a + Math.PI / 2;
      const tipX = px + Math.cos(a) * P(9);
      const tipY = py + Math.sin(a) * P(9);
      const hw   = P(4.5);

      // Shadow
      this._shieldGfx.fillStyle(C_DARK, 0.50 * pulse);
      this._shieldGfx.fillTriangle(
        tipX + P(1), tipY + P(1),
        px + Math.cos(perp) * hw + P(1), py + Math.sin(perp) * hw + P(1),
        px - Math.cos(perp) * hw + P(1), py - Math.sin(perp) * hw + P(1),
      );
      // Dark face
      this._shieldGfx.fillStyle(C_MID, 0.90 * pulse);
      this._shieldGfx.fillTriangle(
        tipX, tipY,
        px + Math.cos(perp) * hw, py + Math.sin(perp) * hw,
        px - Math.cos(perp) * hw, py - Math.sin(perp) * hw,
      );
      // Highlight face
      this._shieldGfx.fillStyle(C_LIGHT, 0.70 * pulse);
      this._shieldGfx.fillTriangle(
        tipX, tipY,
        px + Math.cos(perp) * hw, py + Math.sin(perp) * hw,
        px, py,
      );
      // Edge highlight
      this._shieldGfx.lineStyle(P(1), C_HIGH, 0.55 * pulse);
      this._shieldGfx.beginPath();
      this._shieldGfx.moveTo(px + Math.cos(perp) * hw, py + Math.sin(perp) * hw);
      this._shieldGfx.lineTo(tipX, tipY);
      this._shieldGfx.strokePath();
      // Core gem at base
      this._shieldGfx.fillStyle(C_HIGH, 0.95 * pulse);
      this._shieldGfx.fillCircle(px, py, P(3));
      this._shieldGfx.lineStyle(P(1), 0xffffff, 0.65 * pulse);
      this._shieldGfx.strokeCircle(px, py, P(3));
    }
  }

  override takeDamage(amount: number, penetration = 0): void {
    const aliveCount = this.getAliveCount?.() ?? 0;
    const dmg = aliveCount > 0 ? Math.round(amount * 0.20) : amount;
    super.takeDamage(dmg, penetration);

    // 40% HP: queue seed scatter for next idle (avoids mid-skill collision)
    if (!this._forceSpawnDone && this.currentHp / this.maxHpValue <= 0.40) {
      this._forceSpawnDone  = true;
      this._respawnPending  = false;
      this._forceSpawnQueued = true;
    }
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.SEED_WARN:      this.enterSeedScatter(); break;
      case BossState.SLOW_ZONE_WARN: this.enterSlowZones();   break;
      case BossState.ROOT_WARN:      this.enterRootSpike();   break;
      case BossState.CROWN_WARN:     this.enterCrownBurst();  break;
    }
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    if (this._firstIdle) {
      this._firstIdle = false;
      this.stateTimer = this.scene.time.delayedCall(600, () => this.enterSeedScatter());
      return;
    }
    if (this._respawnQueued || this._forceSpawnQueued) {
      this._respawnQueued = this._forceSpawnQueued = false;
      this.stateTimer = this.scene.time.delayedCall(300, () => this.enterSeedScatter());
      return;
    }
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.30) fn = () => this.enterSlowZones();
    else if (roll < 0.70) fn = () => this.enterRootSpike();
    else                  fn = () => this.enterCrownBurst();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 技能 1：種子撒播 ──────────────────────────────────────

  private enterSeedScatter(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const SEED_DIST  = P(200);
    const pad        = P(20);
    const PRE_MS     = 900;

    const aliveNow = this.getAliveCount?.() ?? 0;
    const toSpawn  = Math.max(0, MAX_MINIONS - aliveNow);
    if (toSpawn === 0) { this.enterIdle(); return; }

    const positions: { x: number; y: number }[] = this.guestMode
      ? this.guestPts.slice(0, toSpawn)
      : (() => {
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i < toSpawn; i++) {
            const a = this._seedAngle + (i / MAX_MINIONS) * Math.PI * 2;
            const [nx, ny] = this.clampToArena(
              this.x + Math.cos(a) * SEED_DIST,
              this.y + Math.sin(a) * SEED_DIST, pad,
            );
            pts.push({ x: nx, y: ny });
          }
          this._seedAngle += Math.PI / 4;
          return pts;
        })();

    this.setBossState(BossState.SEED_WARN, { pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })) });

    // Boss charging visual — golden orb growing on boss
    const chargeG = this.scene.add.graphics().setDepth(this.depth + 1);
    let chargeT = 0;
    const chargeTick = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!chargeG.active) return;
        chargeT += 16;
        const prog  = Math.min(chargeT / PRE_MS, 1);
        const pulse = Math.sin(chargeT * 0.035) * 0.18 + 0.82;
        chargeG.clear();
        chargeG.setPosition(this.x, this.y);
        // Outer soft glow
        chargeG.fillStyle(C_MAIN, 0.12 * prog * pulse);
        chargeG.fillCircle(0, 0, P(30) + prog * P(10));
        // Mid ring
        chargeG.lineStyle(P(5), C_MAIN, 0.22 * pulse);
        chargeG.strokeCircle(0, 0, P(18) + prog * P(8));
        chargeG.lineStyle(P(2), C_LIGHT, (0.5 + prog * 0.4) * pulse);
        chargeG.strokeCircle(0, 0, P(18) + prog * P(8));
        // Core glow
        chargeG.lineStyle(P(1), C_HIGH, 0.45 * pulse);
        chargeG.strokeCircle(0, 0, P(16) + prog * P(6));
      },
    });

    // Seed landing indicator at each position
    const seedGs = positions.map(p => {
      const g = this.scene.add.graphics().setDepth(7);
      let t = 0;
      const timer = this.scene.time.addEvent({
        delay: 16, loop: true, callback: () => {
          if (!g.active) return;
          t += 16;
          const prog  = Math.min(t / PRE_MS, 1);
          const pulse = Math.sin(t * 0.030) * 0.22 + 0.78;
          g.clear();
          const r = P(10) + prog * P(14);
          // Outer soft glow
          g.fillStyle(C_MAIN, 0.08 * prog * pulse);
          g.fillCircle(p.x, p.y, r + P(6));
          // Shadow ring
          g.lineStyle(P(5), C_DARK, 0.30 * pulse);
          g.strokeCircle(p.x, p.y, r);
          // Main ring
          g.lineStyle(P(2.5), C_MAIN, (0.55 + prog * 0.35) * pulse);
          g.strokeCircle(p.x, p.y, r);
          // Highlight ring
          g.lineStyle(P(1), C_HIGH, 0.40 * pulse);
          g.strokeCircle(p.x, p.y, r - P(1.5));
          // Inner seed dot — grows with prog
          g.fillStyle(C_LIGHT, (0.7 + prog * 0.3) * pulse);
          g.fillCircle(p.x, p.y, P(4) + prog * P(4));
          g.lineStyle(P(1), C_HIGH, 0.8 * pulse);
          g.strokeCircle(p.x, p.y, P(4) + prog * P(4));
          // Sprout arrow (appears at prog > 0.5)
          if (prog > 0.5) {
            const sp = (prog - 0.5) / 0.5;
            const sh = P(10) * sp;
            g.lineStyle(P(2), 0x44dd22, 0.85 * sp * pulse);
            g.lineBetween(p.x, p.y - P(5), p.x, p.y - P(5) - sh);
            g.fillStyle(0x88ff44, 0.9 * sp * pulse);
            g.fillTriangle(
              p.x, p.y - P(5) - sh - P(5),
              p.x - P(4), p.y - P(5) - sh,
              p.x + P(4), p.y - P(5) - sh,
            );
          }
        },
      });
      return { g, timer };
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      chargeTick.destroy(); chargeG.destroy();
      seedGs.forEach(({ g, timer }) => { timer.destroy(); g.destroy(); });
      if (this.currentState === BossState.DEAD) return;
      this.onSpawnSeed?.(positions, positions.length);
      this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
    });
  }

  // ── 技能 2：藤蔓緩速 ──────────────────────────────────────

  private enterSlowZones(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const ZONE_COUNT = 5;
    const ZONE_R     = P(85);
    const ZONE_DUR   = 5500;
    const PRE_MS     = 800;
    const safeR      = this.arenaRadius * DPR * 0.75;
    const pad        = P(50);

    const positions: { x: number; y: number }[] = this.guestMode
      ? this.guestPts.slice(0, ZONE_COUNT)
      : (() => {
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i < ZONE_COUNT; i++) {
            const a = (i / ZONE_COUNT) * Math.PI * 2 + Math.random() * 0.8;
            const d = Phaser.Math.FloatBetween(safeR * 0.15, safeR * 0.90);
            const [nx, ny] = this.clampToArena(
              this.arenaCenter.x + Math.cos(a) * d,
              this.arenaCenter.y + Math.sin(a) * d, pad,
            );
            pts.push({ x: nx, y: ny });
          }
          return pts;
        })();

    this.setBossState(BossState.SLOW_ZONE_WARN, { pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })) });

    // Boss pulse visual
    const bossG = this.scene.add.graphics().setDepth(this.depth + 1);
    let bT = 0;
    const bossTick = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!bossG.active) return;
        bT += 16;
        const prog  = Math.min(bT / PRE_MS, 1);
        const pulse = Math.sin(bT * 0.025) * 0.2 + 0.8;
        bossG.clear(); bossG.setPosition(this.x, this.y);
        bossG.fillStyle(0x004400, 0.15 * prog * pulse);
        bossG.fillCircle(0, 0, P(28) + prog * P(12));
        bossG.lineStyle(P(4), 0x226600, 0.3 * pulse);
        bossG.strokeCircle(0, 0, P(20) + prog * P(6));
        bossG.lineStyle(P(2), 0x55dd22, (0.5 + prog * 0.4) * pulse);
        bossG.strokeCircle(0, 0, P(20) + prog * P(6));
        bossG.lineStyle(P(1), 0xaaffaa, 0.35 * pulse);
        bossG.strokeCircle(0, 0, P(18) + prog * P(4));
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      bossTick.destroy(); bossG.destroy();
      if (this.currentState === BossState.DEAD) return;
      this.onPlaceSlowZones?.(positions, ZONE_R, ZONE_DUR, this.x, this.y);
      this.stateTimer = this.scene.time.delayedCall(350, () => this.enterIdle());
    });
  }

  // ── 技能 3：根刺爆破 ──────────────────────────────────────

  private enterRootSpike(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
    this.setBossState(BossState.ROOT_WARN, { atkX: tx / DPR, atkY: ty / DPR });

    const WARN_MS = 900;

    // Boss charge visual (dark green/orange pulse)
    const bG = this.scene.add.graphics().setDepth(this.depth + 1);
    let rt = 0;
    const rtick = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!bG.active) return;
        rt += 16;
        const prog  = Math.min(rt / WARN_MS, 1);
        const pulse = Math.sin(rt * 0.03) * 0.20 + 0.80;
        bG.clear(); bG.setPosition(this.x, this.y);
        bG.fillStyle(C_DARK, 0.18 * prog * pulse);
        bG.fillCircle(0, 0, P(25) + prog * P(8));
        bG.lineStyle(P(5), C_DARK, 0.25 * pulse);
        bG.strokeCircle(0, 0, P(18) + prog * P(5));
        bG.lineStyle(P(2), C_MAIN, (0.45 + prog * 0.45) * pulse);
        bG.strokeCircle(0, 0, P(18) + prog * P(5));
        bG.lineStyle(P(1), C_HIGH, 0.4 * pulse);
        bG.strokeCircle(0, 0, P(16) + prog * P(3));
      },
    });

    // Immediately trigger spikeAt (it has its own 900ms warning)
    this.onPlaceSpike?.(tx, ty, this.scaleDmg(SPIKE_DMG));

    this.stateTimer = this.scene.time.delayedCall(WARN_MS, () => {
      rtick.destroy(); bG.destroy();
      if (this.currentState === BossState.DEAD) return;
      this.enterIdle();
    });
  }

  // ── 技能 4：花冠爆散 ──────────────────────────────────────

  private enterCrownBurst(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.CROWN_WARN, {});
    this.playDir(`${this.animPrefix}_attack`);

    const PRE_MS   = 1000;
    const PHASE1   = 550;
    const PHASE2   = PRE_MS - PHASE1;
    const PETAL_N  = 10;

    const crownG = this.scene.add.graphics().setDepth(this.depth + 1);
    let ct = 0;

    const crownTick = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        if (!crownG.active) return;
        ct += 16;
        const pulse = Math.sin(ct * 0.04) * 0.18 + 0.82;
        crownG.clear();
        crownG.setPosition(this.x, this.y);

        if (ct < PHASE1) {
          // Phase 1: petal particles spiral inward (drawn as incoming arcs)
          const inT = ct / PHASE1;
          const spiralCount = PETAL_N;
          for (let i = 0; i < spiralCount; i++) {
            const base  = (i / spiralCount) * Math.PI * 2;
            const sAngle = base + inT * Math.PI * 2.5;
            const sr     = P(60) + P(30) * (1 - inT);
            const px     = Math.cos(sAngle) * sr;
            const py     = Math.sin(sAngle) * sr;
            // Trail
            for (let tr = 1; tr <= 3; tr++) {
              const ta = sAngle - tr * 0.16;
              const tR = sr + tr * P(8);
              crownG.fillStyle(C_MID, (0.45 - tr * 0.12) * (0.4 + inT * 0.6));
              crownG.fillCircle(Math.cos(ta) * tR, Math.sin(ta) * tR, P(3 - tr * 0.5));
            }
            // Main incoming petal dot
            const dotSize = P(4) + inT * P(2);
            crownG.fillStyle(inT > 0.65 ? C_LIGHT : C_MAIN, 0.90 * pulse);
            crownG.fillCircle(px, py, dotSize);
            crownG.lineStyle(P(1), C_HIGH, 0.6 * pulse);
            crownG.strokeCircle(px, py, dotSize);
          }
        } else {
          // Phase 2: crown ring forms, builds to firing point
          const bT   = (ct - PHASE1) / PHASE2;
          const bPulse = Math.sin(bT * Math.PI * 10) * 0.3 + 0.7;

          // Central intense glow
          crownG.fillStyle(C_LIGHT, 0.25 * bT * bPulse);
          crownG.fillCircle(0, 0, P(24) + bT * P(8));
          crownG.fillStyle(0xffffff, 0.15 * bT * bPulse);
          crownG.fillCircle(0, 0, P(14));

          // Crown orbit ring
          const cR = ORBIT_R + P(8) + bT * P(6);
          crownG.lineStyle(P(6), C_MAIN, 0.30 * bPulse);
          crownG.strokeCircle(0, 0, cR);
          crownG.lineStyle(P(2.5), C_LIGHT, (0.7 + bT * 0.3) * bPulse);
          crownG.strokeCircle(0, 0, cR);
          crownG.lineStyle(P(1), C_HIGH, 0.55 * bPulse);
          crownG.strokeCircle(0, 0, cR - P(1.5));

          // Crown petal tips forming around ring
          for (let i = 0; i < PETAL_N; i++) {
            const a   = (i / PETAL_N) * Math.PI * 2 + ct * 0.002;
            const cpx = Math.cos(a) * cR;
            const cpy = Math.sin(a) * cR;
            const perp = a + Math.PI / 2;
            const hw   = P(3.5) * bT;
            const tipX = cpx + Math.cos(a) * P(7) * bT;
            const tipY = cpy + Math.sin(a) * P(7) * bT;

            crownG.fillStyle(C_DARK, 0.45 * bPulse);
            crownG.fillTriangle(
              tipX + P(1), tipY + P(1),
              cpx + Math.cos(perp) * hw + P(1), cpy + Math.sin(perp) * hw + P(1),
              cpx - Math.cos(perp) * hw + P(1), cpy - Math.sin(perp) * hw + P(1),
            );
            crownG.fillStyle(C_MAIN, 0.95 * bPulse);
            crownG.fillTriangle(
              tipX, tipY,
              cpx + Math.cos(perp) * hw, cpy + Math.sin(perp) * hw,
              cpx - Math.cos(perp) * hw, cpy - Math.sin(perp) * hw,
            );
            crownG.fillStyle(C_HIGH, 0.65 * bPulse);
            crownG.fillTriangle(
              tipX, tipY,
              cpx + Math.cos(perp) * hw, cpy + Math.sin(perp) * hw,
              cpx, cpy,
            );
          }

          // Outward burst rays as readying to fire
          const rayLen = P(18) * bT;
          for (let i = 0; i < PETAL_N; i++) {
            const ra = (i / PETAL_N) * Math.PI * 2;
            crownG.lineStyle(P(1.5), C_LIGHT, 0.55 * bT * bPulse);
            crownG.lineBetween(
              Math.cos(ra) * (cR + P(3)), Math.sin(ra) * (cR + P(3)),
              Math.cos(ra) * (cR + rayLen), Math.sin(ra) * (cR + rayLen),
            );
          }
        }
      },
    });

    this.stateTimer = this.scene.time.delayedCall(PRE_MS, () => {
      crownTick.destroy(); crownG.destroy();
      if (this.currentState === BossState.DEAD) return;

      // Fire burst + camera shake
      this.scene.cameras.main.shake(180, 0.015);
      for (let i = 0; i < PETAL_N; i++) {
        const a = (i / PETAL_N) * Math.PI * 2;
        this.onFirePetal?.(this.x, this.y, a, CROWN_SPEED, this.scaleDmg(CROWN_DMG), 0);
      }
      this.stateTimer = this.scene.time.delayedCall(450, () => this.enterIdle());
    });
  }

  protected override enterIdle(): void {
    super.enterIdle();
    this.play(`${this.animPrefix}_idle_down`, true);
  }
}
