import Phaser from 'phaser';
import { Boss, BossState } from './boss';
import type { Element } from '../data/equipment-data';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// 蝙蝠風暴（先散射200px，再追蹤最近玩家）
const BAT_WARN_MS    = 700;
const BAT_COUNT      = 12;
const BAT_STAGGER    = 70;
const BAT_SCATTER_MS = 300;   // 散射到200px的時間
const BAT_SCATTER_R  = P(100);
const BAT_TRAVEL     = 4000;  // 追蹤持續時間
const BAT_SPEED      = P(110);
const BAT_HIT_R      = P(22);
const BAT_DMG        = 35;

// 猩紅雨（全場，高密度，2x 時間）
const RAIN_WARN_MS  = 500;
const RAIN_COUNT    = 140;
const RAIN_WAVES    = 12;     // 6 × 2
const RAIN_WAVE_MS  = 300;
const RAIN_FALL_MS  = 320;
const RAIN_HIT_R    = P(18);
const RAIN_DMG      = 42;

// 魅惑凝視（追蹤線→鎖定→300ms後超寬光束）
const GAZE_TRACK_MS  = 1000;  // 追蹤持續
const GAZE_LOCK_DELAY = 300;  // 鎖定後延遲
const GAZE_BEAM_R    = P(15); // 對齊主光束視覺寬度
const GAZE_DMG       = 180;

// 黑夜降靈
const DARK_SHOW_MS   = 1200; // 安全區顯示時間
const DARK_NIGHT_MS  = 2000;
const DARK_SAFE_R    = P(35);
const DARK_SAFE_COUNT = 4;

// 血針掃射（標記全場，350ms）
const NEEDLE_WARN_MS   = 350;
const NEEDLE_ROUNDS    = 5;
const NEEDLE_INTERVAL  = 180;
const NEEDLE_PER_ROUND = 3;
const NEEDLE_ORIGIN_R  = P(130);
const NEEDLE_HIT_R     = P(16);
const NEEDLE_DMG       = 38;

export class BossVampire1 extends Boss {
  onBatHit?:            (x: number, y: number, r: number, dmg: number) => void;
  onCrimsonNeedle?:     (x: number, y: number, r: number, dmg: number) => void;
  onNeedleLand?:        (x: number, y: number, r: number, dmg: number) => void;
  onGazeHit?:           (bx: number, by: number, tx: number, ty: number, r: number, dmg: number) => void;
  onDarkNightActivate?: (zones: { x: number; y: number; r: number }[]) => void;
  onDarkNightLift?:     () => void;
  onDarkNightPunish?:   () => void;
  onNeedleHit?:         (x: number, y: number, r: number, dmg: number) => void;

  getAllTargetPositions?: () => [number, number][];

  protected override walkAnimSuffix = 'run';

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = P(90);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const roll = Math.random();
    let fn: () => void;
    // bat28%  rain24%  gaze20%  dark16%  barrage12%
    if      (roll < 0.28) fn = () => this.enterBatStormWarn();
    else if (roll < 0.52) fn = () => this.enterCrimsonRainWarn();
    else if (roll < 0.72) fn = () => this.enterGazeWarn();
    else if (roll < 0.88) fn = () => this.enterDarkNightWarn();
    else                  fn = () => this.enterNeedleBarrageWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.V1_BAT_STORM_WARN:      this.enterBatStormWarn();      break;
      case BossState.V1_CRIMSON_RAIN_WARN:   this.enterCrimsonRainWarn();   break;
      case BossState.V1_GAZE_WARN:           this.enterGazeWarn();          break;
      case BossState.V1_DARK_NIGHT_WARN:     this.enterDarkNightWarn();     break;
      case BossState.V1_DARK_NIGHT_ACTIVE:   this.enterDarkNightActive((this.guestPts ?? []).map(p => ({ x: p.x, y: p.y, r: DARK_SAFE_R }))); break;
      case BossState.V1_NEEDLE_BARRAGE_WARN: this.enterNeedleBarrageWarn(); break;
    }
  }

  // ── 蝙蝠風暴 ─────────────────────────────────────────────────
  // 加難：密集12隻 + 低散射，第一波攻完稍後再補第二波追位

  private enterBatStormWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    const fw = { v: 0.4 };
    const warnG = this.scene.add.graphics().setDepth(8);
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: fw, v: 1.0, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        warnG.lineStyle(P(2), 0x440088, fw.v * 0.8);
        warnG.strokeCircle(this.x, this.y, P(95));
      },
    });

    const em = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 40, max: 110 }, angle: { min: 0, max: 360 },
      scale: { start: 1.2, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0x220033, 0x440055, 0x660088, 0x330044],
      lifespan: { min: 200, max: 450 }, frequency: 28, quantity: mq(3),
    }).setDepth(this.depth + 1);

    const [tx, ty] = this.getTargetPos();
    this.setBossState(BossState.V1_BAT_STORM_WARN, { atkX: tx / DPR, atkY: ty / DPR });

    this.scene.time.delayedCall(BAT_WARN_MS - 200, () => {
      if (this.currentState !== BossState.V1_BAT_STORM_WARN) return;
      this.playDir(`${this.animPrefix}_attack`);
    });

    this.stateTimer = this.scene.time.delayedCall(BAT_WARN_MS, () => {
      this.pulseTween?.stop(); warnG.destroy(); em.destroy();
      this._fireBatWave();
    });
  }

  private _fireBatWave(): void {
    if (this.currentState === BossState.DEAD) return;
    const dmg = this.scaleDmg(BAT_DMG);

    // BOSS 背後方向（朝向玩家的反方向）
    const [tx, ty] = this.getTargetPos();
    const backAng = Math.atan2(ty - this.y, tx - this.x) + Math.PI;
    const HALF_CONE = Math.PI / 6; // ±30°，共 60°

    for (let i = 0; i < BAT_COUNT; i++) {
      this.scene.time.delayedCall(i * BAT_STAGGER, () => {
        if (this.currentState === BossState.DEAD) return;
        const spawnAng = backAng + Phaser.Math.FloatBetween(-HALF_CONE, HALF_CONE);
        this._flyBat(this.x, this.y, spawnAng, dmg);
      });
    }

    // 蝙蝠剩最後 1 秒爆炸時 BOSS 才恢復行動
    this.stateTimer = this.scene.time.delayedCall(BAT_COUNT * BAT_STAGGER + BAT_SCATTER_MS + BAT_TRAVEL - 1000, () => this.enterIdle());
  }

  private _flyBat(ox: number, oy: number, spawnAng: number, dmg: number): void {
    const bat = this.scene.add.graphics({ x: ox, y: oy }).setDepth(55);
    this._drawBatShape(bat);
    bat.setRotation(spawnAng);

    // Phase 1: 散射到 200px（不造成傷害）
    const scatterX = ox + Math.cos(spawnAng) * BAT_SCATTER_R;
    const scatterY = oy + Math.sin(spawnAng) * BAT_SCATTER_R;
    this.scene.tweens.add({
      targets: bat, x: scatterX, y: scatterY,
      duration: BAT_SCATTER_MS, ease: 'Quad.Out',
      onComplete: () => {
        if (!bat.active) return;
        // Phase 2: 追蹤最近玩家
        let elapsed = 0;
        const TICK = 16;
        const moveTimer = this.scene.time.addEvent({
          delay: TICK, loop: true,
          callback: () => {
            elapsed += TICK;
            if (!bat.active) { moveTimer.destroy(); return; }
            if (elapsed >= BAT_TRAVEL) {
              moveTimer.destroy();
              const ex = bat.x, ey = bat.y;
              const splash = this.scene.add.graphics({ x: ex, y: ey }).setDepth(54);
              splash.fillStyle(0x440055, 0.75); splash.fillCircle(0, 0, P(16));
              this.scene.tweens.add({ targets: splash, alpha: 0, scaleX: 2.5, scaleY: 2.5, duration: 240, onComplete: () => splash.destroy() });
              bat.destroy();
              if (!this.guestMode) this.onBatHit?.(ex, ey, BAT_HIT_R, dmg);
              return;
            }
            const [tx, ty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
            const ang = Math.atan2(ty - bat.y, tx - bat.x);
            bat.x += Math.cos(ang) * BAT_SPEED * (TICK / 1000);
            bat.y += Math.sin(ang) * BAT_SPEED * (TICK / 1000);
            bat.setRotation(ang);
            bat.setScale(1, Math.abs(Math.sin(bat.x * 0.06)) * 0.6 + 0.5);
          },
        });
      },
    });
  }

  private _drawBatShape(g: Phaser.GameObjects.Graphics): void {
    g.fillStyle(0x220033, 0.95); g.fillEllipse(0, 0, P(12), P(7));
    g.fillStyle(0x550077, 0.80); g.fillEllipse(-P(9), -P(2), P(9), P(4));
    g.fillStyle(0x550077, 0.80); g.fillEllipse(P(9),  -P(2), P(9), P(4));
    g.fillStyle(0x8844aa, 0.60); g.fillCircle(-P(4), -P(2), P(2));
    g.fillStyle(0x8844aa, 0.60); g.fillCircle(P(4),  -P(2), P(2));
  }

  // ── 猩紅雨（全場）────────────────────────────────────────────

  private enterCrimsonRainWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    // Cover the entire arena with needles
    const aR  = this.arenaRadius * 0.90;
    const cx  = this.arenaCenter.x;
    const cy  = this.arenaCenter.y;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < RAIN_COUNT; i++) {
      const ang  = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * aR; // uniform over disk
      positions.push({ x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist });
    }
    this.setBossState(BossState.V1_CRIMSON_RAIN_WARN, {
      pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })),
    });

    // 前搖：BOSS 往天空發射一陣血針
    for (let i = 0; i < 18; i++) {
      this.scene.time.delayedCall(i * 22, () => {
        if (this.currentState === BossState.DEAD) return;
        const n = this.scene.add.graphics({
          x: this.x + P(Phaser.Math.Between(-14, 14)),
          y: this.y - P(8),
        }).setDepth(58);
        n.fillStyle(0xcc0022, 0.92); n.fillRect(-P(2), -P(16), P(4), P(16));
        n.fillStyle(0xff3355, 0.80); n.fillTriangle(-P(3), -P(16), P(3), -P(16), 0, -P(24));
        const spreadAng = -Math.PI / 2 + Phaser.Math.FloatBetween(-0.45, 0.45);
        const dist = P(Phaser.Math.Between(180, 320));
        this.scene.tweens.add({
          targets: n,
          x: n.x + Math.cos(spreadAng) * dist,
          y: n.y + Math.sin(spreadAng) * dist,
          alpha: 0,
          duration: RAIN_WARN_MS - i * 22,
          ease: 'Quad.Out',
          onComplete: () => n.destroy(),
        });
      });
    }

    this.stateTimer = this.scene.time.delayedCall(RAIN_WARN_MS, () => {
      this._fireRainWave(this.guestMode ? (this.guestPts ?? []).map(p => ({ x: p.x, y: p.y })) : positions, 0);
    });
  }

  private _fireRainWave(positions: { x: number; y: number }[], wave: number): void {
    if (this.currentState === BossState.DEAD) return;
    const perWave = Math.ceil(positions.length / RAIN_WAVES);
    const slice   = positions.slice(wave * perWave, (wave + 1) * perWave);
    const dmg     = this.scaleDmg(RAIN_DMG);
    slice.forEach(p => this._dropNeedle(p.x, p.y, dmg));

    if (wave + 1 < RAIN_WAVES) {
      this.stateTimer = this.scene.time.delayedCall(RAIN_WAVE_MS, () => this._fireRainWave(positions, wave + 1));
    } else {
      this.stateTimer = this.scene.time.delayedCall(RAIN_WAVE_MS + 400, () => this.enterIdle());
    }
  }

  private _dropNeedle(tx: number, ty: number, dmg: number): void {
    const needle = this.scene.add.graphics({ x: tx, y: ty - P(160) }).setDepth(57);
    needle.fillStyle(0xaa0022, 0.9);  needle.fillRect(-P(2), 0, P(4), P(18));
    needle.fillStyle(0xff2244, 0.75); needle.fillTriangle(-P(3), 0, P(3), 0, 0, -P(8));

    this.scene.tweens.add({
      targets: needle, y: ty, duration: RAIN_FALL_MS, ease: 'Quad.In',
      onComplete: () => {
        needle.destroy();
        // 落地爆炸
        const sp = this.scene.add.graphics({ x: tx, y: ty }).setDepth(56);
        sp.fillStyle(0xff2244, 0.80); sp.fillCircle(0, 0, RAIN_HIT_R * 0.7);
        this.scene.tweens.add({ targets: sp, alpha: 0, scaleX: 2.2, scaleY: 2.2, duration: 220, onComplete: () => sp.destroy() });
        // 殘留地面紅圈（0.6s）
        const pool = this.scene.add.graphics({ x: tx, y: ty }).setDepth(55);
        pool.fillStyle(0x880011, 0.60); pool.fillCircle(0, 0, RAIN_HIT_R);
        pool.lineStyle(P(1.5), 0xff2244, 0.85); pool.strokeCircle(0, 0, RAIN_HIT_R);
        this.scene.tweens.add({ targets: pool, alpha: 0, duration: 600, ease: 'Quad.In', onComplete: () => pool.destroy() });
        if (!this.guestMode) {
          this.onCrimsonNeedle?.(tx, ty, RAIN_HIT_R, dmg);
          this.onNeedleLand?.(tx, ty, RAIN_HIT_R, Math.round(dmg * 0.6));
        }
      },
    });
  }

  // ── 魅惑凝視（追蹤→鎖定→300ms延遲→超寬光束）────────────────

  private enterGazeWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.updateDirToTarget();
    this.playDir(`${this.animPrefix}_idle`);

    // Guest mode: host already sent the locked position in atkX/Y; show 300ms locked line then fire
    if (this.guestMode) {
      this._enterGazeLocked(this.guestAtkX, this.guestAtkY);
      return;
    }

    // Host: track player for GAZE_TRACK_MS, then lock + send sync
    const chargeOrb = this.scene.add.graphics({ x: this.x, y: this.y - P(8) }).setDepth(62);
    const co = { r: P(4) };
    this.scene.tweens.add({
      targets: co, r: P(30), duration: GAZE_TRACK_MS + GAZE_LOCK_DELAY, ease: 'Sine.In',
      onUpdate: () => {
        chargeOrb.clear();
        const pct = co.r / P(30);
        chargeOrb.fillStyle(0x7700cc, 0.58 + pct * 0.38);
        chargeOrb.fillCircle(0, 0, co.r);
        chargeOrb.lineStyle(P(2), 0xeeddff, 0.9);
        chargeOrb.strokeCircle(0, 0, co.r);
        chargeOrb.fillStyle(0xffffff, 0.50 + pct * 0.50);
        chargeOrb.fillCircle(0, 0, co.r * 0.38);
      },
    });

    const em = this.scene.add.particles(this.x, this.y - P(8), 'pxl2', {
      speed: { min: 60, max: 150 }, angle: { min: 0, max: 360 },
      scale: { start: 1.5, end: 0 }, alpha: { start: 0.8, end: 0 },
      tint: [0x5500aa, 0x8833ff, 0xcc77ff, 0xeeddff],
      lifespan: { min: 250, max: 500 }, frequency: 22, quantity: mq(3),
    }).setDepth(63);

    // Live tracking line
    const warnG  = this.scene.add.graphics().setDepth(7);
    let trackX = 0, trackY = 0;

    const trackTimer = this.scene.time.addEvent({
      delay: 16, loop: true,
      callback: () => {
        if (this.currentState === BossState.DEAD) return;
        [trackX, trackY] = this.getTargetPos();
        const ang = Math.atan2(trackY - this.y, trackX - this.x);
        const ex = this.x + Math.cos(ang) * P(1800);
        const ey = this.y + Math.sin(ang) * P(1800);
        warnG.clear();
        warnG.lineStyle(P(12), 0x6600bb, 0.18);
        warnG.lineBetween(this.x, this.y, ex, ey);
        warnG.lineStyle(P(4), 0xcc44ff, 0.50);
        warnG.lineBetween(this.x, this.y, ex, ey);
      },
    });

    // Set state without syncing (guests stay uninformed during tracking)
    this.setBossState(BossState.V1_GAZE_WARN);

    // Lock at GAZE_TRACK_MS
    this.scene.time.delayedCall(GAZE_TRACK_MS, () => {
      if (this.currentState === BossState.DEAD) { trackTimer.destroy(); warnG.destroy(); chargeOrb.destroy(); em.destroy(); return; }
      trackTimer.destroy();
      const [lx, ly] = this.getTargetPos();
      // Sync locked position to guests NOW
      this.setBossState(BossState.V1_GAZE_WARN, { atkX: lx / DPR, atkY: ly / DPR });

      // Show locked bright line for GAZE_LOCK_DELAY (延伸穿透)
      const lockAng = Math.atan2(ly - this.y, lx - this.x);
      const lockEx  = this.x + Math.cos(lockAng) * P(1800);
      const lockEy  = this.y + Math.sin(lockAng) * P(1800);
      warnG.clear();
      warnG.lineStyle(P(18), 0x8800cc, 0.28);
      warnG.lineBetween(this.x, this.y, lockEx, lockEy);
      warnG.lineStyle(P(7), 0xff44ff, 0.80);
      warnG.lineBetween(this.x, this.y, lockEx, lockEy);

      this.stateTimer = this.scene.time.delayedCall(GAZE_LOCK_DELAY, () => {
        warnG.destroy(); chargeOrb.destroy(); em.destroy();
        this.playDir(`${this.animPrefix}_attack`);
        this._fireGaze(lx, ly);
      });
    });
  }

  // Guest entry: just show locked line then fire
  private _enterGazeLocked(tx: number, ty: number): void {
    const ang = Math.atan2(ty - this.y, tx - this.x);
    const ex  = this.x + Math.cos(ang) * P(1800);
    const ey  = this.y + Math.sin(ang) * P(1800);
    const warnG = this.scene.add.graphics().setDepth(7);
    warnG.lineStyle(P(18), 0x8800cc, 0.28);
    warnG.lineBetween(this.x, this.y, ex, ey);
    warnG.lineStyle(P(7), 0xff44ff, 0.80);
    warnG.lineBetween(this.x, this.y, ex, ey);

    this.stateTimer = this.scene.time.delayedCall(GAZE_LOCK_DELAY, () => {
      warnG.destroy();
      this.playDir(`${this.animPrefix}_attack`);
      this._fireGaze(tx, ty);
    });
  }

  private _fireGaze(aimX: number, aimY: number): void {
    if (this.currentState === BossState.DEAD) return;
    // 延伸光束到地圖外，aimX/Y 只決定方向
    const angle = Math.atan2(aimY - this.y, aimX - this.x);
    const tx = this.x + Math.cos(angle) * P(1800);
    const ty = this.y + Math.sin(angle) * P(1800);
    this.scene.cameras.main.shake(220, 0.016);

    const beamG = this.scene.add.graphics().setDepth(65);
    const proxy = { a: 1.0 };

    const drawBeam = (alpha: number) => {
      beamG.clear();
      // Super-wide outer glow
      beamG.lineStyle(P(90), 0x5500aa, 0.12 * alpha);
      beamG.lineBetween(this.x, this.y, tx, ty);
      beamG.lineStyle(P(55), 0x8833ff, 0.35 * alpha);
      beamG.lineBetween(this.x, this.y, tx, ty);
      beamG.lineStyle(P(30), 0xcc55ff, 0.70 * alpha);
      beamG.lineBetween(this.x, this.y, tx, ty);
      beamG.lineStyle(P(14), 0xee88ff, 0.92 * alpha);
      beamG.lineBetween(this.x, this.y, tx, ty);
      beamG.lineStyle(P(5), 0xffeeff, 1.00 * alpha);
      beamG.lineBetween(this.x, this.y, tx, ty);
      // Side sparks
      for (let j = 0; j < 6; j++) {
        const t0       = Math.random();
        const len      = P(Phaser.Math.Between(20, 40));
        const px0      = this.x + (tx - this.x) * t0;
        const py0      = this.y + (ty - this.y) * t0;
        const perpAng  = Math.atan2(ty - this.y, tx - this.x) + Math.PI / 2;
        const side     = Math.random() > 0.5 ? 1 : -1;
        beamG.lineStyle(P(2), 0xffeeff, 0.70 * alpha);
        beamG.lineBetween(px0, py0, px0 + Math.cos(perpAng) * side * len, py0 + Math.sin(perpAng) * side * len);
      }
    };
    drawBeam(1.0);

    this.scene.tweens.add({
      targets: proxy, a: 0, duration: 430, ease: 'Quad.In',
      onUpdate: () => drawBeam(proxy.a),
      onComplete: () => beamG.destroy(),
    });

    if (!this.guestMode) this.onGazeHit?.(this.x, this.y, tx, ty, GAZE_BEAM_R, this.scaleDmg(GAZE_DMG));

    this.stateTimer = this.scene.time.delayedCall(580, () => this.enterIdle());
  }

  // ── 黑夜降靈 ────────────────────────────────────────────────

  private enterDarkNightWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    // 對角十字，每次隨機旋轉一個基礎角度
    type Zone = { x: number; y: number; r: number };
    const D = P(200);
    const zones: Zone[] = this.guestMode
      ? (this.guestPts ?? []).map(p => ({ x: p.x, y: p.y, r: DARK_SAFE_R }))
      : (() => {
          const baseAng = Math.random() * Math.PI / 2; // 0~90° 隨機旋轉
          return [0, 1, 2, 3].map(i => {
            const ang = baseAng + i * (Math.PI / 2);
            return { x: this.arenaCenter.x + Math.cos(ang) * D, y: this.arenaCenter.y + Math.sin(ang) * D, r: DARK_SAFE_R };
          });
        })();

    if (!this.guestMode) {
      this.setBossState(BossState.V1_DARK_NIGHT_WARN, {
        pts: zones.map(z => ({ x: z.x / DPR, y: z.y / DPR })),
      });
    }

    // 顯示所有安全區（warn 期間）
    const safeGfx = this.scene.add.graphics().setDepth(9);
    const sg = { v: 0.5 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: sg, v: 1.0, duration: 180, yoyo: true, repeat: -1,
      onUpdate: () => {
        safeGfx.clear();
        for (const z of zones) {
          safeGfx.fillStyle(0x00ff88, sg.v * 0.25);
          safeGfx.fillCircle(z.x, z.y, z.r);
          safeGfx.lineStyle(P(3), 0x00ff88, sg.v * 0.9);
          safeGfx.strokeCircle(z.x, z.y, z.r);
        }
      },
    });

    const em = this.scene.add.particles(this.x, this.y, 'pxl2', {
      speed: { min: 100, max: 220 }, angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 }, alpha: { start: 0.95, end: 0 },
      tint: [0x000000, 0x110011, 0x220022, 0x330033],
      lifespan: { min: 300, max: 600 }, frequency: 18, quantity: mq(4),
    }).setDepth(this.depth + 1);

    this.stateTimer = this.scene.time.delayedCall(DARK_SHOW_MS, () => {
      this.pulseTween?.stop(); safeGfx.destroy(); em.destroy();
      this.enterDarkNightActive(zones);
    });
  }

  enterDarkNightActive(zones: { x: number; y: number; r: number }[]): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.V1_DARK_NIGHT_ACTIVE, {
      pts: zones.map(z => ({ x: z.x / DPR, y: z.y / DPR })),
    });
    if (!this.guestMode) this.onDarkNightActivate?.(zones);

    this.stateTimer = this.scene.time.delayedCall(DARK_NIGHT_MS - 200, () => {
      if (this.currentState === BossState.DEAD) return;
      if (!this.guestMode) this.onDarkNightLift?.();  // 先撤黑夜
      this.scene.time.delayedCall(200, () => {
        if (this.currentState === BossState.DEAD) return;
        if (!this.guestMode) this.onDarkNightPunish?.();
        this.enterIdle();
      });
    });
  }

  // ── 血針掃射（標記全場玩家，450ms）──────────────────────────

  private enterNeedleBarrageWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    const allTargets: [number, number][] = this.guestMode
      ? (this.guestPts ?? []).map(p => [p.x, p.y] as [number, number])
      : (this.getAllTargetPositions?.() ?? [this.getTargetPos()]);

    this.setBossState(BossState.V1_NEEDLE_BARRAGE_WARN, {
      pts: allTargets.map(([x, y]) => ({ x: x / DPR, y: y / DPR })),
    });

    // Draw crosshair on EVERY target
    const allMarkers = allTargets.map(([tx, ty]) => {
      const g = this.scene.add.graphics().setDepth(60);
      return { g, tx, ty };
    });
    const mw = { v: 0.5 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: mw, v: 1.0, duration: 150, yoyo: true, repeat: -1,
      onUpdate: () => {
        for (const { g, tx, ty } of allMarkers) {
          g.clear();
          const r  = P(28);
          const bl = P(9);
          g.lineStyle(P(2.5), 0xcc0022, mw.v * 0.95);
          g.strokeCircle(tx, ty, r);
          g.lineBetween(tx - r, ty, tx + r, ty);
          g.lineBetween(tx, ty - r, tx, ty + r);
          for (const [sx, sy, dx, dy] of [
            [-1,-1, 1, 0],[-1,-1, 0, 1],[1,-1,-1, 0],[1,-1, 0, 1],
            [-1, 1, 1, 0],[-1, 1, 0,-1],[1, 1,-1, 0],[1, 1, 0,-1],
          ] as const) {
            g.lineBetween(tx + sx * r, ty + sy * r, tx + sx * r + dx * bl, ty + sy * r + dy * bl);
          }
        }
      },
    });

    this.stateTimer = this.scene.time.delayedCall(NEEDLE_WARN_MS, () => {
      this.pulseTween?.stop(); allMarkers.forEach(m => m.g.destroy());
      this._fireAllNeedleRounds(allTargets, 0);
    });
  }

  private _fireAllNeedleRounds(targets: [number, number][], round: number): void {
    if (this.currentState === BossState.DEAD) return;
    const dmg = this.scaleDmg(NEEDLE_DMG);
    for (const [tx, ty] of targets) {
      for (let n = 0; n < NEEDLE_PER_ROUND; n++) {
        const ang = Math.random() * Math.PI * 2;
        const ox  = tx + Math.cos(ang) * NEEDLE_ORIGIN_R;
        const oy  = ty + Math.sin(ang) * NEEDLE_ORIGIN_R;
        this._launchNeedle(ox, oy, tx, ty, dmg);
      }
    }
    if (round + 1 < NEEDLE_ROUNDS) {
      this.stateTimer = this.scene.time.delayedCall(NEEDLE_INTERVAL, () => this._fireAllNeedleRounds(targets, round + 1));
    } else {
      this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
    }
  }

  private _launchNeedle(ox: number, oy: number, tx: number, ty: number, dmg: number): void {
    const ang    = Phaser.Math.Angle.Between(ox, oy, tx, ty);
    const needle = this.scene.add.graphics({ x: ox, y: oy }).setDepth(56);
    needle.fillStyle(0xaa0022, 0.92); needle.fillRect(-P(1.5), -P(14), P(3), P(14));
    needle.fillStyle(0xff3355, 0.80); needle.fillTriangle(-P(2.5), -P(14), P(2.5), -P(14), 0, -P(20));
    needle.setRotation(ang + Math.PI / 2);

    const dist     = Phaser.Math.Distance.Between(ox, oy, tx, ty);
    const duration = Math.round((dist / P(520)) * 1000);

    this.scene.tweens.add({
      targets: needle, x: tx, y: ty, duration, ease: 'Cubic.In',
      onComplete: () => {
        needle.destroy();
        const sp = this.scene.add.graphics({ x: tx, y: ty }).setDepth(55);
        sp.fillStyle(0x880011, 0.65); sp.fillCircle(0, 0, P(12));
        this.scene.tweens.add({ targets: sp, alpha: 0, scaleX: 2.0, scaleY: 2.0, duration: 200, onComplete: () => sp.destroy() });
        if (!this.guestMode) this.onNeedleHit?.(tx, ty, NEEDLE_HIT_R, dmg);
      },
    });
  }
}
