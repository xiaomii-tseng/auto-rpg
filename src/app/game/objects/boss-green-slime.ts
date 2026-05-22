import Phaser from 'phaser';
import { Boss, BossState } from './boss';
import { MONSTER_SCALE_BOSS } from '../data/monster-data';

const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;
const mf  = (ms: number) => MOB ? Math.round(ms * 2.0) : ms;

const PUDDLE_RADIUS = Math.round(50 * DPR);
const PUDDLE_MS     = 3000;
const PUDDLE_TICK   = 500;
const PUDDLE_DMG    = 75;
const SUMMON_DIST   = Math.round(90 * DPR);
const ORB_COUNT     = 3;

export class BossGreenSlime extends Boss {
  onSummonElite?: (x: number, y: number) => void;
  onPoisonTick?:  (x: number, y: number, radius: number, dmg: number) => void;

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.SUMMON_WARN: this.enterSummonWarn(); break;
      case BossState.POISON_WARN: this.enterPoisonWarn(); break;
    }
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.30) fn = () => this.enterAoeWarn();
    else if (roll < 0.60) fn = () => this.enterDashWarn();
    else if (roll < 0.70) fn = () => this.enterSummonWarn();  // 10%
    else                  fn = () => this.enterPoisonWarn();   // 30%
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 召喚菁英史萊姆 ────────────────────────────────────

  private enterSummonWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    let sx1: number, sy1: number, sx2: number, sy2: number;
    if (this.guestMode) {
      [{ x: sx1, y: sy1 }, { x: sx2, y: sy2 }] = this.guestPts as [typeof this.guestPts[0], typeof this.guestPts[0]];
    } else {
      const a1 = Math.random() * Math.PI * 2;
      const a2 = a1 + Math.PI + Phaser.Math.FloatBetween(-0.4, 0.4);
      sx1 = this.x + Math.cos(a1) * SUMMON_DIST;
      sy1 = this.y + Math.sin(a1) * SUMMON_DIST;
      sx2 = this.x + Math.cos(a2) * SUMMON_DIST;
      sy2 = this.y + Math.sin(a2) * SUMMON_DIST;
    }
    this.setBossState(BossState.SUMMON_WARN, { pts: [{ x: sx1! / DPR, y: sy1! / DPR }, { x: sx2! / DPR, y: sy2! / DPR }] });

    // ── 旋轉能量球 ─────────────────────────────────────
    const orbs = Array.from({ length: ORB_COUNT }, () => {
      const o = this.scene.add.graphics().setDepth(this.depth + 2);
      o.fillStyle(0x4488ff, 0.95);
      o.fillCircle(0, 0, P(5));
      o.lineStyle(P(2), 0xaabbff, 0.65);
      o.strokeCircle(0, 0, P(8));
      return o;
    });

    let orbAngle = 0;
    const orbTimer = this.scene.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => {
        orbAngle += 0.075;
        const bossR = 30 + Math.sin(orbAngle * 1.8) * 5;
        orbs.forEach((o, i) => {
          const a = orbAngle + (Math.PI * 2 / ORB_COUNT) * i;
          o.setPosition(this.x + Math.cos(a) * bossR, this.y + Math.sin(a) * bossR);
        });
      },
    });

    // ── Boss 脈動縮放 ───────────────────────────────────
    const scaleTween = this.scene.tweens.add({
      targets: this, scaleX: 2.22 * DPR, scaleY: 2.22 * DPR,
      duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    // ── 擴散綠環（每 600ms 一道）─────────────────────────
    for (let wave = 0; wave < 2; wave++) {
      this.scene.time.delayedCall(wave * 600, () => {
        if (this.currentState !== BossState.SUMMON_WARN) return;
        const rG = this.scene.add.graphics().setDepth(this.depth + 1).setPosition(this.x, this.y);
        const rs = { r: P(12), a: 0.8 };
        this.scene.tweens.add({
          targets: rs, r: P(52), a: 0, duration: 600, ease: 'Quad.Out',
          onUpdate: () => {
            rG.clear();
            rG.lineStyle(P(3), 0x4488ff, rs.a);
            rG.strokeCircle(0, 0, rs.r);
            rG.lineStyle(P(6), 0x2255cc, rs.a * 0.2);
            rG.strokeCircle(0, 0, rs.r);
          },
          onComplete: () => rG.destroy(),
        });
      });
    }

    // ── 上升綠光粒子 ────────────────────────────────────
    const emitter = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 30, max: 80 },
      angle: { min: 250, max: 290 },
      scale: { start: 1.8, end: 0 },
      alpha: { start: 0.85, end: 0 },
      tint: [0x4488ff, 0x88aaff, 0x2266ee],
      lifespan: { min: 450, max: 1000 },
      frequency: mf(35), quantity: mq(2), gravityY: -28,
    }).setDepth(9);

    // ── 傳送門警告圈 ────────────────────────────────────
    const portalG = this.scene.add.graphics().setDepth(9);
    this.drawPortalWarning(portalG, sx1, sy1);
    this.drawPortalWarning(portalG, sx2, sy2);
    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.25, duration: 220, yoyo: true, repeat: -1,
      onUpdate: () => portalG.setAlpha(pw.a),
    });

    this.stateTimer = this.scene.time.delayedCall(1400, () => {
      this.pulseTween?.stop();
      orbTimer.destroy();
      scaleTween.stop();
      this.setScale(MONSTER_SCALE_BOSS);
      orbs.forEach(o => o.destroy());
      emitter.destroy();
      portalG.destroy();
      this.spawnSummonVfx(sx1, sy1);
      this.spawnSummonVfx(sx2, sy2);
      this.onSummonElite?.(sx1, sy1);
      this.onSummonElite?.(sx2, sy2);
      this.enterIdle();
    });
  }

  // ── 毒液球 ────────────────────────────────────────────

  private enterPoisonWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    let tx: number, ty: number;
    if (this.guestMode) {
      tx = this.guestAtkX; ty = this.guestAtkY;
    } else {
      [tx, ty] = this.getTargetPos();
    }
    this.setBossState(BossState.POISON_WARN, { atkX: tx / DPR, atkY: ty / DPR });

    const warnG = this.scene.add.graphics().setDepth(8);
    this.drawPoisonWarning(warnG, tx, ty);
    const pw = { a: 1.0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: pw, a: 0.22, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => warnG.setAlpha(pw.a),
    });

    this.stateTimer = this.scene.time.delayedCall(400, () => {
      this.pulseTween?.stop();
      warnG.destroy();
      this.firePoisonBall(tx, ty);
    });
  }

  private firePoisonBall(tx: number, ty: number): void {
    const speed    = 210;
    const dist     = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
    const travelMs = Math.max(300, Math.round((dist / speed) * 1000));

    const ball = this.scene.add.graphics().setDepth(13).setPosition(this.x, this.y);
    const startX = this.x, startY = this.y;
    const midY   = Math.min(startY, ty) - 30;
    const prog   = { t: 0 };

    this.scene.tweens.add({
      targets: prog, t: 1, duration: travelMs, ease: 'Linear',
      onUpdate: () => {
        const t  = prog.t;
        const bx = startX + (tx - startX) * t;
        const by = startY * (1 - t) * (1 - t) + midY * 2 * t * (1 - t) + ty * t * t;
        ball.setPosition(bx, by);
        ball.clear();
        const shine = t * Math.PI * 4;
        ball.fillStyle(0x116611, 0.9);
        ball.fillCircle(0, 0, P(10));
        ball.lineStyle(P(3), 0x88ff44, 0.85);
        ball.strokeCircle(0, 0, P(10));
        ball.lineStyle(P(4), 0x44ff44, 0.25);
        ball.strokeCircle(0, 0, P(14));
        ball.fillStyle(0xccffcc, 0.65);
        ball.fillCircle(Math.cos(shine) * P(4), Math.sin(shine) * P(4), P(4));
      },
      onComplete: () => {
        ball.destroy();
        this.spawnPoisonPuddle(tx, ty);
        this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
      },
    });
  }

  private spawnPoisonPuddle(cx: number, cy: number): void {
    const r = PUDDLE_RADIUS;

    // 落地爆濺
    const splash = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 40, max: 130 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.0, end: 0 },
      alpha: { start: 0.95, end: 0 },
      tint: [0x44ff44, 0x22aa22, 0x88ff44, 0x005500, 0xaaffaa],
      lifespan: { min: 180, max: 480 },
      emitting: false,
    }).setDepth(11);
    splash.emitParticleAt(0, 0, 28);
    this.scene.time.delayedCall(600, () => { if (splash.active) splash.destroy(); });
    this.scene.cameras.main.shake(70, 0.005);

    // ── 毒地板主體 ─────────────────────────────────────
    const puddleG = this.scene.add.graphics().setDepth(7).setPosition(cx, cy);
    this.drawPuddle(puddleG, r);
    this.scene.tweens.add({
      targets: puddleG, alpha: 0, duration: PUDDLE_MS,
      onComplete: () => puddleG.destroy(),
    });

    // ── 脈動漣漪環 ─────────────────────────────────────
    const rippleG = this.scene.add.graphics().setDepth(8).setPosition(cx, cy);
    const rs = { r: r * 0.25, a: 0.75 };
    this.scene.tweens.add({
      targets: rs, r: r * 0.95, a: 0,
      duration: 700, ease: 'Quad.Out',
      repeat: Math.floor(PUDDLE_MS / 700),
      onUpdate: () => {
        rippleG.clear();
        rippleG.lineStyle(2, 0x88ff44, rs.a);
        rippleG.strokeCircle(0, 0, rs.r);
      },
      onRepeat: () => { rs.r = r * 0.25; rs.a = 0.75; },
      onComplete: () => rippleG.destroy(),
    });

    // ── 毒泡粒子 ───────────────────────────────────────
    const bubbles = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 8, max: 28 },
      angle: { min: 240, max: 300 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.75, end: 0 },
      tint: [0x44ff44, 0x88ff44, 0xaaffaa, 0x22dd22],
      lifespan: { min: 700, max: 1400 },
      frequency: mf(100), quantity: mq(2), gravityY: -18,
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Circle(0, 0, r * 0.7),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    }).setDepth(9);
    this.scene.time.delayedCall(PUDDLE_MS, () => { if (bubbles.active) bubbles.destroy(); });

    // ── 傷害 tick ──────────────────────────────────────
    const totalTicks = Math.floor(PUDDLE_MS / PUDDLE_TICK);
    let ticked = 0;
    const dmgTimer = this.scene.time.addEvent({
      delay: PUDDLE_TICK,
      repeat: totalTicks - 1,
      callback: () => {
        this.onPoisonTick?.(cx, cy, r, this.scaleDmg(PUDDLE_DMG));
        if (++ticked >= totalTicks) dmgTimer.destroy();
      },
    });
  }

  // ── VFX helpers ───────────────────────────────────────

  private drawPortalWarning(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    g.fillStyle(0x2255cc, 0.22);
    g.fillCircle(x, y, P(22));
    g.lineStyle(P(2), 0x4488ff, 0.88);
    g.strokeCircle(x, y, P(22));
    g.lineStyle(P(1), 0x88aaff, 0.5);
    g.lineBetween(x - P(13), y, x + P(13), y);
    g.lineBetween(x, y - P(13), x, y + P(13));
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) continue;
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle(0x4488ff, 0.65);
      g.fillRect(x + Math.cos(a) * P(27) - P(2), y + Math.sin(a) * P(27) - P(2), P(4), P(4));
    }
  }

  private drawPoisonWarning(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const r = PUDDLE_RADIUS;
    g.fillStyle(0xff0000, 0.12);
    g.fillCircle(x, y, r);
    g.lineStyle(P(3), 0xff2200, 0.90);
    g.strokeCircle(x, y, r);
    g.lineStyle(P(2), 0xff5500, 0.50);
    g.strokeCircle(x, y, r * 0.55);
    g.fillStyle(0xff3300, 0.72);
    g.fillRect(x - P(9), y - P(2), P(18), P(4));
    g.fillRect(x - P(2), y - P(9), P(4), P(18));
    g.fillStyle(0xff6600, 0.9);
    g.fillCircle(x, y, P(4));
  }

  private drawPuddle(g: Phaser.GameObjects.Graphics, r: number): void {
    // 深色毒液底層
    g.fillStyle(0x0a2a0a, 0.70);
    g.fillCircle(0, 0, r);
    // 外圍發光邊框
    g.lineStyle(P(4), 0x44ff44, 0.60);
    g.strokeCircle(0, 0, r);
    g.lineStyle(P(8), 0x22aa22, 0.20);
    g.strokeCircle(0, 0, r);
    // 中層半透明綠
    g.fillStyle(0x1a6b1a, 0.45);
    g.fillCircle(0, 0, r * 0.75);
    // 內圈亮環
    g.lineStyle(P(2), 0x88ff44, 0.55);
    g.strokeCircle(0, 0, r * 0.55);
    // 毒液高光斑（不對稱，模擬液體）
    g.fillStyle(0x66ff66, 0.22);
    g.fillCircle(-r * 0.25, -r * 0.2, r * 0.28);
    g.fillStyle(0x44dd44, 0.12);
    g.fillCircle(r * 0.2, r * 0.15, r * 0.18);
    // 邊緣毒液點
    for (let i = 0; i < 6; i++) {
      const a  = (i / 6) * Math.PI * 2 + 0.3;
      const dr = r * Phaser.Math.FloatBetween(0.82, 0.98);
      g.fillStyle(0x22ff22, 0.35);
      g.fillCircle(Math.cos(a) * dr, Math.sin(a) * dr, Phaser.Math.Between(P(2), P(4)));
    }
  }

  private spawnSummonVfx(cx: number, cy: number): void {
    const burst = this.scene.add.particles(cx, cy, 'pxl2', {
      speed: { min: 90, max: 250 },
      angle: { min: 0, max: 360 },
      scale: { start: 2.4, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x4488ff, 0x88aaff, 0x2255cc, 0xffffff, 0xaabbff],
      lifespan: { min: 200, max: 520 },
      emitting: false,
    }).setDepth(13);
    burst.emitParticleAt(0, 0, 30);
    this.scene.time.delayedCall(650, () => { if (burst.active) burst.destroy(); });
    this.scene.cameras.main.shake(55, 0.005);
  }
}
