import Phaser from 'phaser';
import { Boss, BossState } from './boss';
import type { Element } from '../data/equipment-data';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// ── 隕石雨 ────────────────────────────────────────────────
const MRAIN_WARN_MS  = 900;   // warn phase before first meteor
const MRAIN_COUNT    = 24;    // total meteors
const MRAIN_STAGGER  = 140;   // ms between each meteor launch
const MRAIN_R        = P(55); // radius (2.5× original P(22))
const MRAIN_FALL_MS  = 580;
const MRAIN_BASE_DMG = 75;

// ── 彗星術 ────────────────────────────────────────────────
const COMET_CHARGE_MS = 3000;
const COMET_FALL_MS   = 420;
const COMET_R1        = P(130); // inner ring   0–130px
const COMET_R2        = P(260); // mid  ring  131–260px
const COMET_R3        = P(390); // outer ring 261–390px
const COMET_DMG_INNER = 100;
const COMET_DMG_MID   = 80;
const COMET_DMG_OUTER = 65;

// ── 禁咒：元素崩解 ────────────────────────────────────────
const EL_CHARGE_MS   = 2000;  // 蓄力時間
const EL_FIRE_COUNT  = 8;     // 火焰波數量（均勻360°）
const EL_FIRE_R      = P(48); // 火焰彈半徑（爆炸時）
const EL_FIRE_SPEED  = P(340);
const EL_ICE_COUNT   = 6;     // 冰刺落點數量
const EL_ICE_R       = P(40);
const EL_THUNDER_CNT = 8;     // 閃電打擊數量
const EL_THUNDER_R   = P(30);
const EL_VOID_R      = P(280);// 虛空環半徑
const EL_DMG_FIRE    = 75;
const EL_DMG_ICE     = 75;
const EL_DMG_THUNDER = 75;
const EL_DMG_VOID    = 75;

export class BossVampire2 extends Boss {
  onMeteorRainHit?:    (x: number, y: number, r: number, dmg: number) => void;
  onCometRingHit?:     (cx: number, cy: number, rInner: number, rOuter: number, dmg: number) => void;
  onElFireHit?:        (x: number, y: number, r: number, dmg: number) => void;
  onElIceHit?:         (x: number, y: number, r: number, dmg: number) => void;
  onElThunderHit?:     (x: number, y: number, r: number, dmg: number) => void;
  onElVoidHit?:        (cx: number, cy: number, r: number, dmg: number) => void;
  onLightningArcHit?:  (dmg: number) => void;
  onIceDomainStart?:   (cx: number, cy: number) => void;
  onIceDomainEnd?:     () => void;
  onTornadoHit?:       (dmg: number) => void;

  protected override walkAnimSuffix = 'run';
  private _elCollapseTriggered = false;
  private _iceDomainActive     = false;

  constructor(scene: Phaser.Scene, x: number, y: number,
              totalHp: number, element: Element,
              spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    (this.body as Phaser.Physics.Arcade.Body).setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = P(85);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    if (!this._elCollapseTriggered && this.currentHp / this.maxHpValue <= 0.30) {
      this._elCollapseTriggered = true;
      this.stateTimer = this.scene.time.delayedCall(
        this.getNextAttackDelay(), () => this.enterElCollapseWarn());
      return;
    }
    const pool: Array<() => void> = [
      () => this.enterMeteorRainWarn(),
      () => this.enterCometWarn(),
      () => this.enterLightningChain(),
      () => this.enterTornadoStorm(),
    ];
    if (!this._iceDomainActive) pool.push(() => this.enterIceDomain());
    const fn = pool[Math.floor(Math.random() * pool.length)];
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.V2_METEOR_RAIN_WARN: this.enterMeteorRainWarn(); break;
      case BossState.V2_COMET_WARN:       this.enterCometWarn();      break;
      case BossState.V2_EL_COLLAPSE_WARN: this.enterElCollapseWarn(); break;
      case BossState.V3_LIGHTNING_CHAIN:  this.enterLightningChain(); break;
      case BossState.V3_ICE_DOMAIN:       this.enterIceDomain();      break;
      case BossState.V3_TORNADO_STORM:    this.enterTornadoStorm();   break;
    }
  }

  // ════════════════════════════════════════════════════════
  //  技能一：隕石雨
  // ════════════════════════════════════════════════════════

  private enterMeteorRainWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    // 全場隨機落點
    const aR  = this.arenaRadius * 0.88;
    const cx  = this.arenaCenter.x, cy = this.arenaCenter.y;
    const positions: { x: number; y: number }[] = [];
    for (let i = 0; i < MRAIN_COUNT; i++) {
      const ang  = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * aR;
      positions.push({ x: cx + Math.cos(ang) * dist, y: cy + Math.sin(ang) * dist });
    }

    this.setBossState(BossState.V2_METEOR_RAIN_WARN, {
      pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })),
    });

    // 落點警示圈（warn 期間顯示，開始落雨時銷毀）
    const markers: Phaser.GameObjects.Graphics[] = [];
    for (const pos of positions) {
      const mg = this.scene.add.graphics({ x: pos.x, y: pos.y }).setDepth(49);
      mg.lineStyle(P(2.2), 0xff3300, 0.80); mg.strokeCircle(0, 0, MRAIN_R * 1.1);
      mg.fillStyle(0xff2200, 0.08); mg.fillCircle(0, 0, MRAIN_R * 1.1);
      markers.push(mg);
      this.scene.tweens.add({
        targets: mg, alpha: { from: 0.3, to: 1 },
        yoyo: true, repeat: -1, duration: 220, ease: 'Sine.InOut',
      });
    }

    // BOSS 蓄力：暗紅粒子聚集
    const chargeEm = this.scene.add.particles(this.x, this.y - P(12), 'pxl2', {
      speed: { min: 80, max: 210 }, angle: { min: 0, max: 360 },
      scale: { start: 2.2, end: 0 }, alpha: { start: 1.0, end: 0 },
      tint: [0xcc3300, 0xff5500, 0xff8800, 0xffcc44, 0x660000],
      lifespan: { min: 280, max: 550 }, frequency: 14, quantity: mq(4),
    }).setDepth(this.depth + 1);

    // warn 期間 BOSS 動作：往天上射出一串火球表示發動
    for (let i = 0; i < 20; i++) {
      this.scene.time.delayedCall(i * 38, () => {
        if (this.currentState === BossState.DEAD) return;
        const orb = this.scene.add.graphics({
          x: this.x + P(Phaser.Math.Between(-18, 18)),
          y: this.y - P(10),
        }).setDepth(62);
        orb.fillStyle(0xff4400, 0.90); orb.fillCircle(0, 0, P(5));
        orb.fillStyle(0xffcc44, 0.70); orb.fillCircle(0, 0, P(2.5));
        const ang = -Math.PI / 2 + Phaser.Math.FloatBetween(-0.5, 0.5);
        this.scene.tweens.add({
          targets: orb,
          x: orb.x + Math.cos(ang) * P(Phaser.Math.Between(60, 160)),
          y: orb.y + Math.sin(ang) * P(Phaser.Math.Between(60, 160)),
          alpha: 0, duration: MRAIN_WARN_MS - i * 38,
          ease: 'Quad.Out', onComplete: () => orb.destroy(),
        });
      });
    }

    this.stateTimer = this.scene.time.delayedCall(MRAIN_WARN_MS, () => {
      chargeEm.destroy();
      markers.forEach(m => { this.scene.tweens.killTweensOf(m); m.destroy(); });
      this._fireRainSequence(
        this.guestMode
          ? (this.guestPts ?? []).map(p => ({ x: p.x, y: p.y }))
          : positions,
        0,
      );
    });
  }

  private _fireRainSequence(positions: { x: number; y: number }[], idx: number): void {
    if (this.currentState === BossState.DEAD) return;
    this._dropBigMeteor(positions[idx].x, positions[idx].y, this.scaleDmg(MRAIN_BASE_DMG));
    if (idx + 1 < positions.length) {
      this.stateTimer = this.scene.time.delayedCall(
        MRAIN_STAGGER, () => this._fireRainSequence(positions, idx + 1));
    } else {
      this.stateTimer = this.scene.time.delayedCall(
        MRAIN_FALL_MS + 700, () => this.enterIdle());
    }
  }

  private _dropBigMeteor(tx: number, ty: number, dmg: number): void {
    const startY = ty - P(190);

    const shadowG = this.scene.add.graphics({ x: tx, y: ty }).setDepth(48);

    // 隕石本體（出發時縮小，落地後 scale=1）
    const meteorG = this.scene.add.graphics({ x: tx, y: startY }).setDepth(61);
    meteorG.fillStyle(0xff4400, 0.95); meteorG.fillCircle(0, 0, MRAIN_R);
    meteorG.fillStyle(0x110000, 0.55); meteorG.fillCircle(MRAIN_R * 0.20, MRAIN_R * 0.18, MRAIN_R * 0.55);
    meteorG.lineStyle(P(4.5), 0xff8800, 0.92); meteorG.strokeCircle(0, 0, MRAIN_R);
    meteorG.lineStyle(P(2),   0xffcc44, 0.55); meteorG.strokeCircle(0, 0, MRAIN_R * 0.55);
    meteorG.fillStyle(0xffffff, 0.30); meteorG.fillCircle(-MRAIN_R * 0.25, -MRAIN_R * 0.25, MRAIN_R * 0.22);
    meteorG.setScale(0.22);

    // 下落過程：火焰尾跡 + 火星
    const fireEvt = this.scene.time.addEvent({
      delay: 60, repeat: Math.floor(MRAIN_FALL_MS / 60),
      callback: () => {
        if (!meteorG.active) return;
        const s = meteorG.scaleX;
        const streak = this.scene.add.graphics({ x: meteorG.x, y: meteorG.y }).setDepth(60);
        const sLen = P(55) * s;
        for (let j = 0; j < 4; j++) {
          const a   = -Math.PI / 2 + (j - 1.5) * 0.20 + (Math.random() - 0.5) * 0.10;
          const col = [0xff8800, 0xff5500, 0xff3300, 0xcc2200][j];
          streak.lineStyle(P(3.8 - j * 0.7), col, 0.72 - j * 0.12);
          streak.beginPath(); streak.moveTo(0, 0);
          streak.lineTo(Math.cos(a) * sLen, Math.sin(a) * sLen); streak.strokePath();
        }
        // 火星
        const spark = this.scene.add.graphics({
          x: meteorG.x + (Math.random() - 0.5) * P(14) * s,
          y: meteorG.y,
        }).setDepth(59);
        spark.fillStyle([0xff6600, 0xff8800, 0xffcc00][Math.floor(Math.random() * 3)], 0.85);
        spark.fillCircle(0, 0, P(2.2) * s);
        this.scene.tweens.add({ targets: spark, y: spark.y - P(22), alpha: 0, duration: 200, onComplete: () => spark.destroy() });
        this.scene.tweens.add({ targets: streak, alpha: 0, duration: 185, ease: 'Quad.Out', onComplete: () => streak.destroy() });
      },
    });

    this.scene.tweens.add({
      targets: meteorG, y: ty, scaleX: 1, scaleY: 1,
      duration: MRAIN_FALL_MS, ease: 'Quad.In',
      onUpdate: () => {
        const t = Math.max(0, (meteorG.y - startY) / (ty - startY));
        shadowG.clear();
        // 暗影橢圓（全程）
        shadowG.fillStyle(0x330000, 0.44 * t);
        shadowG.fillEllipse(0, 0, MRAIN_R * 2.8 * t, MRAIN_R * 0.85 * t);
        // 最後 45% 才出現的紅色警示圈（越近越亮）
        if (t > 0.55) {
          const a = (t - 0.55) / 0.45;
          shadowG.lineStyle(P(3), 0xff2200, a * 0.95);
          shadowG.strokeCircle(0, 0, MRAIN_R * 1.1);
          shadowG.fillStyle(0xff2200, a * 0.12);
          shadowG.fillCircle(0, 0, MRAIN_R * 1.1);
        }
      },
      onComplete: () => {
        fireEvt.destroy(); meteorG.destroy(); shadowG.destroy();

        this.scene.cameras.main.shake(110, 0.011);

        // 焦痕
        const crater = this.scene.add.graphics({ x: tx, y: ty }).setDepth(15);
        crater.fillStyle(0x1a0700, 0.88); crater.fillCircle(0, 0, MRAIN_R * 1.05);
        crater.fillStyle(0x2e1000, 0.48); crater.fillCircle(0, 0, MRAIN_R * 1.35);
        crater.lineStyle(P(2), 0x662200, 0.60); crater.strokeCircle(0, 0, MRAIN_R * 1.05);
        this.scene.tweens.add({ targets: crater, alpha: 0, duration: 1800, delay: 200, ease: 'Quad.In', onComplete: () => crater.destroy() });

        // 中心爆閃
        const core = this.scene.add.graphics({ x: tx, y: ty }).setDepth(65);
        core.fillStyle(0xffffff, 1);   core.fillCircle(0, 0, MRAIN_R * 0.70);
        core.fillStyle(0xff8800, 0.92); core.fillCircle(0, 0, MRAIN_R * 0.42);
        this.scene.tweens.add({ targets: core, alpha: 0, scaleX: 0.08, scaleY: 0.08, duration: 175, ease: 'Quad.In', onComplete: () => core.destroy() });

        // 衝擊薄環
        const shock = this.scene.add.graphics({ x: tx, y: ty }).setDepth(64);
        shock.lineStyle(P(4.5), 0xffaa44, 1); shock.strokeCircle(0, 0, MRAIN_R * 0.80);
        this.scene.tweens.add({ targets: shock, scaleX: 3.2, scaleY: 3.2, alpha: 0, duration: 400, ease: 'Cubic.Out', onComplete: () => shock.destroy() });

        // 橘紅光暈
        const halo = this.scene.add.graphics({ x: tx, y: ty }).setDepth(63);
        halo.lineStyle(P(10), 0xff5500, 0.72); halo.strokeCircle(0, 0, MRAIN_R * 0.60);
        this.scene.tweens.add({ targets: halo, scaleX: 2.6, scaleY: 2.6, alpha: 0, duration: 550, ease: 'Quad.Out', onComplete: () => halo.destroy() });

        // 碎石（12 片）
        for (let i = 0; i < 12; i++) {
          const a    = (i / 12) * Math.PI * 2 + (Math.random() - 0.5) * 0.40;
          const dist = P(Phaser.Math.Between(24, 60));
          const piece = this.scene.add.graphics({ x: tx, y: ty }).setDepth(62);
          const pr    = P(Phaser.Math.Between(4, 9));
          piece.fillStyle([0x882200, 0xaa3300, 0x661100, 0x993300][i % 4], 0.94);
          piece.fillEllipse(0, 0, pr * 2.3, pr);
          piece.lineStyle(P(0.8), 0xffaa44, 0.55); piece.strokeEllipse(0, 0, pr * 2.3, pr);
          this.scene.tweens.add({
            targets: piece,
            x: tx + Math.cos(a) * dist, y: ty + Math.sin(a) * dist,
            rotation: Phaser.Math.FloatBetween(Math.PI, Math.PI * 3.5),
            alpha: 0, duration: Phaser.Math.Between(360, 560), ease: 'Quad.Out',
            onComplete: () => piece.destroy(),
          });
        }

        // 塵埃（14 顆）
        for (let i = 0; i < 14; i++) {
          const a  = (i / 14) * Math.PI * 2 + Math.random() * 0.25;
          const r1 = P(Phaser.Math.Between(22, 56));
          const dust = this.scene.add.graphics({ x: tx + Math.cos(a) * MRAIN_R * 0.45, y: ty + Math.sin(a) * MRAIN_R * 0.45 }).setDepth(62);
          dust.fillStyle(0xcc5500, Phaser.Math.FloatBetween(0.45, 0.72));
          dust.fillCircle(0, 0, P(Phaser.Math.Between(2, 5)));
          this.scene.tweens.add({
            targets: dust,
            x: tx + Math.cos(a) * r1, y: ty + Math.sin(a) * r1,
            alpha: 0, duration: Phaser.Math.Between(380, 640), ease: 'Quad.Out',
            onComplete: () => dust.destroy(),
          });
        }

        if (!this.guestMode) this.onMeteorRainHit?.(tx, ty, MRAIN_R * 1.1, dmg);
      },
    });
  }

  // ════════════════════════════════════════════════════════
  //  技能二：彗星術
  // ════════════════════════════════════════════════════════

  private enterCometWarn(): void {
    if (this.currentState === BossState.DEAD) return;

    // ① 瞬移到場地中間
    const destX = this.arenaCenter.x;
    const destY = this.arenaCenter.y;

    // 原位消失閃光
    const vanishG = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(72);
    vanishG.fillStyle(0x5500aa, 0.88); vanishG.fillCircle(0, 0, P(48));
    this.scene.tweens.add({ targets: vanishG, alpha: 0, scaleX: 3.2, scaleY: 3.2, duration: 300, onComplete: () => vanishG.destroy() });

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.setPosition(destX, destY);
    this.playDir(`${this.animPrefix}_attack`);

    // 落地閃光
    const arriveG = this.scene.add.graphics({ x: destX, y: destY }).setDepth(72);
    arriveG.fillStyle(0x8800cc, 0.80); arriveG.fillCircle(0, 0, P(55));
    this.scene.tweens.add({ targets: arriveG, alpha: 0, scaleX: 2.8, scaleY: 2.8, duration: 380, onComplete: () => arriveG.destroy() });

    // 落點：場地中心（彗星從頭上落到中心，BOSS在場底蓄力）
    const impactX = this.arenaCenter.x, impactY = this.arenaCenter.y;

    // 最內圈從蓄力開始就亮起紅色
    const fill1 = this._makeRedFill(impactX, impactY, 0, COMET_R1);

    // 召喚圈（在落點中心慢慢展開，藍色）
    const summonCircle = this.scene.add.graphics({ x: impactX, y: impactY }).setDepth(7);
    const sc = { r: 0, a: 0 };
    this.scene.tweens.add({
      targets: sc, r: COMET_R3 * 1.02, a: 0.45,
      duration: COMET_CHARGE_MS * 0.4, ease: 'Quad.Out',
      onUpdate: () => {
        summonCircle.clear();
        summonCircle.lineStyle(P(2), 0x0066ff, sc.a * 0.6);
        summonCircle.strokeCircle(0, 0, sc.r);
        for (let k = 0; k < 8; k++) {
          const ang = (k / 8) * Math.PI * 2 + this.scene.time.now * 0.0014;
          summonCircle.fillStyle(0x44aaff, sc.a * 0.9);
          summonCircle.fillCircle(Math.cos(ang) * sc.r, Math.sin(ang) * sc.r, P(3.5));
        }
      },
    });

    this.setBossState(BossState.V2_COMET_WARN, {
      atkX: impactX / DPR, atkY: impactY / DPR,
    });

    // ② 彗星在BOSS頭頂成形（蓄力3秒），由上往下落
    const cometAboveY = destY - P(95); // BOSS頭頂上方
    const cometG = this.scene.add.graphics({ x: impactX, y: cometAboveY }).setDepth(68);

    // 蓄力粒子（藍色）
    const chargeEm = this.scene.add.particles(impactX, cometAboveY, 'pxl2', {
      speed: { min: 60, max: 180 }, angle: { min: 0, max: 360 },
      scale: { start: 2.5, end: 0 }, alpha: { start: 1.0, end: 0 },
      tint: [0x0055ff, 0x0088ff, 0x44aaff, 0x88ccff, 0xaaddff],
      lifespan: { min: 300, max: 700 }, frequency: 18, quantity: mq(5),
    }).setDepth(69);

    // 三段傷害圈警示（藍色）
    const warnG = this.scene.add.graphics().setDepth(7);
    const wr = { v: 0 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: wr, v: 1, duration: 220, yoyo: true, repeat: -1,
      onUpdate: () => {
        warnG.clear();
        warnG.fillStyle(0x0044cc, wr.v * 0.10);
        warnG.fillCircle(impactX, impactY, COMET_R1);
        warnG.lineStyle(P(3), 0x0066ff, wr.v * 0.75);
        warnG.strokeCircle(impactX, impactY, COMET_R1);

        warnG.fillStyle(0x0055dd, wr.v * 0.06);
        warnG.fillCircle(impactX, impactY, COMET_R2);
        warnG.lineStyle(P(2.5), 0x0088ff, wr.v * 0.55);
        warnG.strokeCircle(impactX, impactY, COMET_R2);

        warnG.lineStyle(P(1.8), 0x44aaff, wr.v * 0.38);
        warnG.strokeCircle(impactX, impactY, COMET_R3);
      },
    });

    // 彗星本體（藍色）隨時間生長
    const co = { t: 0.0 };
    const drawComet = (t: number) => {
      cometG.clear();
      const r = P(14 + 56 * t);
      // 外層藍色冰晶殼
      cometG.fillStyle(0x0055ff, 0.94); cometG.fillCircle(0, 0, r);
      // 暗色深藍紋路
      cometG.fillStyle(0x000033, 0.58); cometG.fillCircle(r * 0.18, r * 0.15, r * 0.58);
      cometG.fillStyle(0x000022, 0.35); cometG.fillCircle(-r * 0.22, r * 0.20, r * 0.35);
      // 外輪廓光（亮藍）
      cometG.lineStyle(P(4 + 3 * t), 0x44aaff, 0.90); cometG.strokeCircle(0, 0, r);
      // 高亮核心（白→淡藍）
      cometG.fillStyle(0xffffff, 0.65 * t + 0.08); cometG.fillCircle(0, 0, r * 0.36);
      cometG.fillStyle(0xaaddff, 0.85); cometG.fillCircle(0, 0, r * 0.18);
      // 藍色能量尾（往上 5 條）
      const tailLen = P(70 + 130 * t);
      const tailColors = [0x44aaff, 0x0088ff, 0x0055ff, 0x0033cc, 0x001188];
      for (let j = 0; j < 5; j++) {
        const a   = -Math.PI / 2 + (j - 2) * 0.18 + (Math.random() - 0.5) * 0.04;
        const len = tailLen * (1 - j * 0.16);
        cometG.lineStyle(P(Math.max(1, (5 - j) * 2.2 * t)), tailColors[j], 0.78 - j * 0.12);
        cometG.beginPath(); cometG.moveTo(0, 0);
        cometG.lineTo(Math.cos(a) * len, Math.sin(a) * len); cometG.strokePath();
      }
      // 冰晶碎片（偶爾）
      if (Math.random() < 0.35 * t) {
        const sa  = Math.random() * Math.PI * 2;
        const sp  = this.scene.add.graphics({ x: cometG.x + Math.cos(sa) * r, y: cometG.y + Math.sin(sa) * r }).setDepth(67);
        sp.fillStyle(0xaaddff, 0.80); sp.fillCircle(0, 0, P(2));
        this.scene.tweens.add({ targets: sp, x: sp.x + Math.cos(sa) * P(22), y: sp.y + Math.sin(sa) * P(22), alpha: 0, duration: 260, onComplete: () => sp.destroy() });
      }
    };

    this.scene.tweens.add({
      targets: co, t: 1.0, duration: COMET_CHARGE_MS, ease: 'Sine.easeIn',
      onUpdate: () => {
        drawComet(co.t);
        // 鏡頭在最後 30% 開始顫抖，逐漸加強
        if (co.t > 0.70) {
          const intensity = (co.t - 0.70) / 0.30;
          this.scene.cameras.main.shake(60, 0.006 * intensity);
        }
      },
      onComplete: () => {
        chargeEm.destroy(); summonCircle.destroy();
        this.pulseTween?.stop();
        // 定格警示圈（保持顯示直到爆炸結束）
        warnG.clear();
        warnG.lineStyle(P(2.5), 0x0066ff, 0.60); warnG.strokeCircle(impactX, impactY, COMET_R1);
        warnG.lineStyle(P(2.0), 0x0088ff, 0.45); warnG.strokeCircle(impactX, impactY, COMET_R2);
        warnG.lineStyle(P(1.5), 0x44aaff, 0.30); warnG.strokeCircle(impactX, impactY, COMET_R3);
        this._releaseComet(cometG, impactX, impactY, warnG, fill1);
      },
    });
  }

  private _releaseComet(cometG: Phaser.GameObjects.Graphics, impactX: number, impactY: number,
                        warnG: Phaser.GameObjects.Graphics, fill1: Phaser.GameObjects.Graphics): void {
    if (this.currentState === BossState.DEAD) { cometG.destroy(); warnG.destroy(); fill1.destroy(); return; }

    const startY = cometG.y;
    const shadowG = this.scene.add.graphics({ x: impactX, y: impactY }).setDepth(48);

    // 落下前：亮白光暈出現，代表要落地了
    const preFlash = this.scene.add.graphics({ x: impactX, y: impactY }).setDepth(70);
    preFlash.fillStyle(0xff8800, 0.0); preFlash.fillCircle(0, 0, P(30));
    this.scene.tweens.add({ targets: preFlash, alpha: 0.55, duration: COMET_FALL_MS * 0.5, yoyo: true, onComplete: () => preFlash.destroy() });

    this.scene.tweens.add({
      targets: cometG, x: impactX, y: impactY,
      duration: COMET_FALL_MS, ease: 'Quad.In',
      onUpdate: () => {
        const prog = Math.max(0, (cometG.y - startY) / (impactY - startY));
        shadowG.clear();
        shadowG.fillStyle(0x000033, 0.50 * prog);
        shadowG.fillEllipse(0, 0, P(130) * prog, P(44) * prog);
        // 落下過程繼續保有藍色能量尾（往上）
        cometG.clear();
        const r = P(70);
        cometG.fillStyle(0x0055ff, 0.94); cometG.fillCircle(0, 0, r);
        cometG.fillStyle(0x000033, 0.55); cometG.fillCircle(r * 0.18, r * 0.15, r * 0.55);
        cometG.lineStyle(P(6), 0x44aaff, 0.90); cometG.strokeCircle(0, 0, r);
        cometG.fillStyle(0xffffff, 0.75); cometG.fillCircle(0, 0, r * 0.35);
        cometG.fillStyle(0xaaddff, 0.90); cometG.fillCircle(0, 0, r * 0.18);
        const tailLen = P(200 + 80 * prog);
        const tailCols = [0x44aaff, 0x0088ff, 0x0055ff, 0x0033cc, 0x001188];
        for (let j = 0; j < 5; j++) {
          const a = -Math.PI / 2 + (j - 2) * 0.18;
          cometG.lineStyle(P(Math.max(1, (5 - j) * 2.2)), tailCols[j], 0.80 - j * 0.12);
          cometG.beginPath(); cometG.moveTo(0, 0);
          cometG.lineTo(Math.cos(a) * tailLen * (1 - j * 0.16), Math.sin(a) * tailLen * (1 - j * 0.16)); cometG.strokePath();
        }
      },
      onComplete: () => {
        cometG.destroy(); shadowG.destroy();
        this._cometImpact(impactX, impactY, warnG, fill1);
      },
    });
  }

  private _cometImpact(cx: number, cy: number, warnG: Phaser.GameObjects.Graphics,
                       fill1: Phaser.GameObjects.Graphics): void {
    // Stage 1 (t=0): 觸發傷害，fill1淡出，立刻亮起 zone 2
    this._cometStage(cx, cy, 0, COMET_R1, 0x0044cc, 0x0066ff, 11, COMET_DMG_INNER, true);
    const fill2 = this._makeRedFill(cx, cy, COMET_R1, COMET_R2);
    this.scene.tweens.add({ targets: fill1, alpha: 0, duration: 380, onComplete: () => fill1.destroy() });

    // Stage 2 (t=900ms): 觸發傷害，fill2淡出，立刻亮起 zone 3
    this.scene.time.delayedCall(900, () => {
      if (this.currentState === BossState.DEAD) { fill2.destroy(); return; }
      this._cometStage(cx, cy, COMET_R1, COMET_R2, 0x0055dd, 0x0088ff, 8, COMET_DMG_MID, false);
      const fill3 = this._makeRedFill(cx, cy, COMET_R2, COMET_R3);
      this.scene.tweens.add({ targets: fill2, alpha: 0, duration: 380, onComplete: () => fill2.destroy() });

      // Stage 3 (t=1800ms): 觸發傷害，fill3淡出
      this.scene.time.delayedCall(900, () => {
        if (this.currentState === BossState.DEAD) { fill3.destroy(); return; }
        this._cometStage(cx, cy, COMET_R2, COMET_R3, 0x0077ee, 0x44aaff, 5, COMET_DMG_OUTER, false);
        this.scene.tweens.add({ targets: fill3, alpha: 0, duration: 380, onComplete: () => fill3.destroy() });
      });
    });

    // 爆炸結束後淡出警示圈
    this.scene.time.delayedCall(2400, () => {
      this.scene.tweens.killTweensOf(warnG);
      this.scene.tweens.add({ targets: warnG, alpha: 0, duration: 400, onComplete: () => warnG.destroy() });
    });
    this.stateTimer = this.scene.time.delayedCall(2900, () => this.enterIdle());
  }

  private _makeRedFill(cx: number, cy: number, rInner: number, rOuter: number): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics({ x: cx, y: cy }).setDepth(30);

    const drawZone = (ri: number, ro: number) => {
      // 底層：深暗紅色
      g.fillStyle(0x6a000e, 0.38);
      if (ri > 0) {
        g.beginPath(); g.arc(0, 0, ro, 0, Math.PI * 2, false); g.arc(0, 0, ri, 0, Math.PI * 2, true); g.fillPath();
      } else { g.fillCircle(0, 0, ro); }
      // 中層：偏暖紅色光暈（讓內部看起來有深度）
      g.fillStyle(0xcc1a00, 0.14);
      if (ri > 0) {
        g.beginPath(); g.arc(0, 0, ro, 0, Math.PI * 2, false); g.arc(0, 0, ri, 0, Math.PI * 2, true); g.fillPath();
      } else { g.fillCircle(0, 0, ro); }
      // 外緣：厚橘紅描邊
      g.lineStyle(P(5.5), 0xff2200, 0.72); g.strokeCircle(0, 0, ro);
      // 外緣細白高光
      g.lineStyle(P(1.5), 0xff9966, 0.45); g.strokeCircle(0, 0, ro - P(3));
      if (ri > 0) {
        // 內圈邊線（略暗）
        g.lineStyle(P(3.5), 0xcc2200, 0.55); g.strokeCircle(0, 0, ri);
        g.lineStyle(P(1),   0xff8844, 0.30); g.strokeCircle(0, 0, ri + P(3));
      }
    };

    drawZone(rInner, rOuter);
    return g;
  }

  private _cometStage(cx: number, cy: number,
                      rInner: number, rOuter: number,
                      colorDark: number, colorLight: number,
                      lineW: number, baseDmg: number, isFirst: boolean): void {
    // 鏡頭（第一段最強，後段遞減）
    const shakeIntensity = isFirst ? 0.032 : 0.016;
    this.scene.cameras.main.shake(400, shakeIntensity);
    if (isFirst) {
      this.scene.cameras.main.flash(50, 180, 220, 255, true);
      // 中心核爆（只第一段有）
      const coreFlash = this.scene.add.graphics({ x: cx, y: cy }).setDepth(9999);
      coreFlash.fillStyle(0xffffff, 1.0); coreFlash.fillCircle(0, 0, P(85));
      coreFlash.fillStyle(0xaaddff, 0.90); coreFlash.fillCircle(0, 0, P(50));
      this.scene.tweens.add({ targets: coreFlash, alpha: 0, scaleX: 5, scaleY: 5, duration: 360, ease: 'Quad.Out', onComplete: () => coreFlash.destroy() });
    }

    // 填充底色（僅這段環帶）
    const fill = this.scene.add.graphics({ x: cx, y: cy }).setDepth(9982);
    if (rInner === 0) {
      fill.fillStyle(colorDark, 0.38); fill.fillCircle(0, 0, rOuter);
    } else {
      // 環形填色
      fill.fillStyle(colorDark, 0.28); fill.fillCircle(0, 0, rOuter);
      fill.fillStyle(0x000000, 1.0);   fill.fillCircle(0, 0, rInner); // 挖洞（用黑色蓋住內圈）
    }
    this.scene.tweens.add({ targets: fill, alpha: 0, duration: 650, ease: 'Quad.Out', onComplete: () => fill.destroy() });

    // 主衝擊環（從 rInner 擴張到 rOuter）
    const ring = this.scene.add.graphics({ x: cx, y: cy }).setDepth(9986);
    ring.lineStyle(P(lineW), colorLight, 1.0);
    ring.strokeCircle(0, 0, rInner > 0 ? rInner * 0.8 : P(20));
    const endScale = rOuter / (rInner > 0 ? rInner * 0.8 : P(20));
    this.scene.tweens.add({ targets: ring, scaleX: endScale, scaleY: endScale, alpha: 0, duration: 600, ease: 'Quad.Out', onComplete: () => ring.destroy() });

    // 次薄環（略慢）
    this.scene.time.delayedCall(55, () => {
      const ring2 = this.scene.add.graphics({ x: cx, y: cy }).setDepth(9985);
      ring2.lineStyle(P(lineW * 0.5), colorLight, 0.70);
      ring2.strokeCircle(0, 0, rInner > 0 ? rInner * 0.6 : P(15));
      const s2 = rOuter / (rInner > 0 ? rInner * 0.6 : P(15));
      this.scene.tweens.add({ targets: ring2, scaleX: s2, scaleY: s2, alpha: 0, duration: 780, ease: 'Cubic.Out', onComplete: () => ring2.destroy() });
    });

    // 第一段才噴碎石＋塵雲
    if (isFirst) {
      for (let i = 0; i < 18; i++) {
        const a    = (i / 18) * Math.PI * 2 + (Math.random() - 0.5) * 0.30;
        const dist = P(Phaser.Math.Between(55, 130));
        const piece = this.scene.add.graphics({ x: cx, y: cy }).setDepth(9988);
        const pr    = P(Phaser.Math.Between(5, 12));
        piece.fillStyle([0x002299, 0x003399, 0x0044aa, 0x0055cc][i % 4], 0.95);
        piece.fillEllipse(0, 0, pr * 2.4, pr);
        piece.lineStyle(P(1), 0x88ccff, 0.65); piece.strokeEllipse(0, 0, pr * 2.4, pr);
        this.scene.tweens.add({
          targets: piece,
          x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
          rotation: Phaser.Math.FloatBetween(Math.PI, Math.PI * 4.5),
          alpha: 0, duration: Phaser.Math.Between(500, 850), ease: 'Quad.Out',
          onComplete: () => piece.destroy(),
        });
      }
      for (let i = 0; i < 16; i++) {
        const a   = (i / 16) * Math.PI * 2 + Math.random() * 0.20;
        const r0  = P(30), r1 = P(Phaser.Math.Between(70, 150));
        const dust = this.scene.add.graphics({ x: cx + Math.cos(a) * r0, y: cy + Math.sin(a) * r0 }).setDepth(9990);
        dust.fillStyle(0x0066cc, Phaser.Math.FloatBetween(0.50, 0.75));
        dust.fillCircle(0, 0, P(Phaser.Math.Between(4, 10)));
        this.scene.tweens.add({
          targets: dust,
          x: cx + Math.cos(a) * r1, y: cy + Math.sin(a) * r1,
          alpha: 0, duration: Phaser.Math.Between(600, 1000), ease: 'Quad.Out',
          onComplete: () => dust.destroy(),
        });
      }
      // 持久冰凍坑（藍色）
      const crater = this.scene.add.graphics({ x: cx, y: cy }).setDepth(14);
      crater.fillStyle(0x000033, 0.90); crater.fillCircle(0, 0, P(70));
      crater.fillStyle(0x000055, 0.55); crater.fillCircle(0, 0, P(90));
      crater.lineStyle(P(2), 0x004499, 0.65); crater.strokeCircle(0, 0, P(70));
      this.scene.tweens.add({ targets: crater, alpha: 0, duration: 2800, delay: 1000, ease: 'Quad.In', onComplete: () => crater.destroy() });
    }

    // 傷害判定
    if (!this.guestMode) {
      this.onCometRingHit?.(cx, cy, rInner, rOuter, this.scaleDmg(baseDmg));
    }
  }

  // ════════════════════════════════════════════════════════
  //  禁咒：元素崩解（HP ≤ 30% 強制觸發一次）
  // ════════════════════════════════════════════════════════

  private enterElCollapseWarn(): void {
    if (this.currentState === BossState.DEAD) return;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    this.setBossState(BossState.V2_EL_COLLAPSE_WARN);

    const cx = this.arenaCenter.x, cy = this.arenaCenter.y;
    const aR = this.arenaRadius * 0.84;
    const bossX = this.x, bossY = this.y;
    let runeAngle = 0;

    // ── 蓄力旋渦粒子（4 色循環）────────────────────────────
    const COLORS = [0xff4400, 0x44ccff, 0xffff33, 0x9900ff];
    const vortexEms = COLORS.map((tint, i) =>
      this.scene.add.particles(this.x, this.y - P(8), 'pxl2', {
        speed: { min: 90, max: 240 }, angle: { min: 0, max: 360 },
        scale: { start: 2.8, end: 0 }, alpha: { start: 1.0, end: 0 },
        tint, lifespan: { min: 350, max: 750 },
        frequency: 22 + i * 4, quantity: mq(3),
      }).setDepth(this.depth + 1)
    );

    // ── 地板四元素預警圈（蓄力期間出現）─────────────────────
    // 火焰: 均勻10個落點 / 冰刺: 6個 / 閃電: 8個 / 虛空: 正中央1圈
    const firePts: { x: number; y: number }[] = [];
    for (let i = 0; i < EL_FIRE_COUNT; i++) {
      const a = (i / EL_FIRE_COUNT) * Math.PI * 2;
      firePts.push({ x: cx + Math.cos(a) * aR * 0.75, y: cy + Math.sin(a) * aR * 0.75 });
    }
    const icePts: { x: number; y: number }[] = [];
    for (let i = 0; i < EL_ICE_COUNT; i++) {
      const a = (i / EL_ICE_COUNT) * Math.PI * 2 + Math.PI / EL_ICE_COUNT;
      icePts.push({ x: cx + Math.cos(a) * aR * 0.55, y: cy + Math.sin(a) * aR * 0.55 });
    }
    const thunderPts: { x: number; y: number }[] = [];
    for (let i = 0; i < EL_THUNDER_CNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * aR;
      thunderPts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
    }

    // 預警畫面 (四色脈衝)
    const warnG = this.scene.add.graphics().setDepth(8);
    const wv = { v: 0.2 };
    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: wv, v: 0.9, duration: 200, yoyo: true, repeat: -1,
      onUpdate: () => {
        runeAngle += 0.012;
        warnG.clear();

        // ─ 旋轉法陣 ─────────────────────────────────────────
        // Outer rotating ring — 8 bright notch segments
        warnG.lineStyle(P(2.5), 0xcc44ff, 0.20 + wv.v * 0.14); warnG.strokeCircle(cx, cy, aR * 0.92);
        for (let i = 0; i < 8; i++) {
          const a = runeAngle + Math.PI * 2 * i / 8;
          warnG.lineStyle(P(5.5), 0xcc44ff, 0.42 + wv.v * 0.36);
          warnG.beginPath(); warnG.arc(cx, cy, aR * 0.92, a - 0.09, a + 0.09, false); warnG.strokePath();
        }
        // Mid counter-rotating ring — 6 segments
        warnG.lineStyle(P(1.5), 0x9900ff, 0.16 + wv.v * 0.10); warnG.strokeCircle(cx, cy, aR * 0.63);
        for (let i = 0; i < 6; i++) {
          const a = -runeAngle * 0.72 + Math.PI * 2 * i / 6;
          warnG.lineStyle(P(3.5), 0x9900ff, 0.32 + wv.v * 0.26);
          warnG.beginPath(); warnG.arc(cx, cy, aR * 0.63, a - 0.11, a + 0.11, false); warnG.strokePath();
        }
        // 4 elemental quadrant spokes
        for (let i = 0; i < 4; i++) {
          const a = runeAngle * 0.45 + Math.PI / 2 * i;
          warnG.lineStyle(P(2), COLORS[i], 0.22 + wv.v * 0.20);
          warnG.beginPath();
          warnG.moveTo(cx + Math.cos(a) * aR * 0.16, cy + Math.sin(a) * aR * 0.16);
          warnG.lineTo(cx + Math.cos(a) * aR * 0.58, cy + Math.sin(a) * aR * 0.58);
          warnG.strokePath();
        }
        // Central void orb (pulsing)
        warnG.fillStyle(0x440088, 0.10 + wv.v * 0.08); warnG.fillCircle(cx, cy, P(56));
        warnG.fillStyle(0x7700cc, 0.18 + wv.v * 0.14); warnG.fillCircle(cx, cy, P(33));
        warnG.fillStyle(0xbb44ff, 0.42 + wv.v * 0.35); warnG.fillCircle(cx, cy, P(13));
        warnG.fillStyle(0xeeccff, 0.78 + wv.v * 0.18); warnG.fillCircle(cx, cy, P(5));
        warnG.lineStyle(P(2), 0xcc44ff, 0.28 + wv.v * 0.28); warnG.strokeCircle(cx, cy, P(45));
        warnG.lineStyle(P(1), 0xbb88ff, 0.16 + wv.v * 0.14); warnG.strokeCircle(cx, cy, P(65));

        // ─ BOSS 能量光環 ──────────────────────────────────────
        warnG.fillStyle(0x440088, 0.07 + wv.v * 0.06); warnG.fillCircle(bossX, bossY, P(60));
        warnG.lineStyle(P(1.5), 0xcc44ff, 0.20 + wv.v * 0.16); warnG.strokeCircle(bossX, bossY, P(53));
        for (let i = 0; i < 4; i++) {
          const ba = runeAngle * 1.9 + Math.PI / 2 * i;
          warnG.lineStyle(P(4), COLORS[i], 0.26 + wv.v * 0.30);
          warnG.beginPath(); warnG.arc(bossX, bossY, P(53), ba, ba + 1.05, false); warnG.strokePath();
        }

        // ─ 元素預警圈 ─────────────────────────────────────────
        for (const p of firePts) {
          warnG.fillStyle(0xff3300, wv.v * 0.20); warnG.fillCircle(p.x, p.y, EL_FIRE_R * 1.5);
          warnG.lineStyle(P(3.5), 0xff5500, wv.v * 0.95); warnG.strokeCircle(p.x, p.y, EL_FIRE_R);
          warnG.lineStyle(P(1.5), 0xffaa00, wv.v * 0.58); warnG.strokeCircle(p.x, p.y, EL_FIRE_R * 0.55);
          warnG.lineStyle(P(1), 0xff8800, wv.v * 0.32);
          warnG.lineBetween(p.x - EL_FIRE_R * 0.68, p.y, p.x + EL_FIRE_R * 0.68, p.y);
          warnG.lineBetween(p.x, p.y - EL_FIRE_R * 0.68, p.x, p.y + EL_FIRE_R * 0.68);
        }
        for (const p of icePts) {
          warnG.fillStyle(0x33aaff, wv.v * 0.17); warnG.fillCircle(p.x, p.y, EL_ICE_R * 1.5);
          warnG.lineStyle(P(3.5), 0x66ccff, wv.v * 0.92); warnG.strokeCircle(p.x, p.y, EL_ICE_R);
          warnG.lineStyle(P(1.5), 0xccf0ff, wv.v * 0.52); warnG.strokeCircle(p.x, p.y, EL_ICE_R * 0.50);
          for (let k = 0; k < 6; k++) {
            const sa = Math.PI / 3 * k;
            warnG.lineStyle(P(1), 0xaaddff, wv.v * 0.32);
            warnG.lineBetween(p.x + Math.cos(sa) * P(5), p.y + Math.sin(sa) * P(5),
              p.x + Math.cos(sa) * EL_ICE_R * 0.68, p.y + Math.sin(sa) * EL_ICE_R * 0.68);
          }
        }
        for (const p of thunderPts) {
          warnG.fillStyle(0xffff22, wv.v * 0.14); warnG.fillCircle(p.x, p.y, EL_THUNDER_R * 1.5);
          warnG.lineStyle(P(3), 0xffff33, wv.v * 0.90); warnG.strokeCircle(p.x, p.y, EL_THUNDER_R);
          warnG.lineStyle(P(1.5), 0xffffff, wv.v * 0.48); warnG.strokeCircle(p.x, p.y, EL_THUNDER_R * 0.46);
        }
        // Void ring (triple layer)
        warnG.lineStyle(P(4.5), 0x8800cc, wv.v * 0.52); warnG.strokeCircle(cx, cy, EL_VOID_R);
        warnG.lineStyle(P(2.5), 0xcc44ff, wv.v * 0.42); warnG.strokeCircle(cx, cy, EL_VOID_R * 1.04);
        warnG.lineStyle(P(1.5), 0x9900ff, wv.v * 0.28); warnG.strokeCircle(cx, cy, EL_VOID_R * 0.95);
      },
    });

    // ── BOSS 緩緩懸浮（視覺放大）──────────────────────────
    this.scene.tweens.add({
      targets: this, y: this.y - P(12), duration: EL_CHARGE_MS * 0.8,
      ease: 'Sine.easeInOut', yoyo: true,
    });

    // ── 蓄力最後 500ms 鏡頭微顫 ──────────────────────────
    this.scene.time.delayedCall(EL_CHARGE_MS - 500, () => {
      if (this.currentState === BossState.DEAD) return;
      this.scene.cameras.main.shake(500, 0.012);
    });

    this.stateTimer = this.scene.time.delayedCall(EL_CHARGE_MS, () => {
      this.pulseTween?.stop(); warnG.destroy();
      vortexEms.forEach(e => e.destroy());
      this._fireElementalCollapse(firePts, icePts, thunderPts, cx, cy);
    });
  }

  private _fireElementalCollapse(
    firePts: { x: number; y: number }[],
    icePts:  { x: number; y: number }[],
    thunderPts: { x: number; y: number }[],
    cx: number, cy: number,
  ): void {
    if (this.currentState === BossState.DEAD) return;

    // ── 全屏色彩閃光（4 色輪流）─────────────────────────
    const flashColors: [number, number, number][] = [
      [220, 80,  0  ],  // fire orange
      [0,  170, 255 ],  // ice blue
      [255, 255, 50 ],  // lightning yellow
      [150, 0,  220 ],  // void purple
    ];
    flashColors.forEach(([r, g, b], i) => {
      this.scene.time.delayedCall(i * 80, () =>
        this.scene.cameras.main.flash(55, r, g, b, true));
    });
    this.scene.cameras.main.shake(600, 0.025);

    const dmgFire    = this.scaleDmg(EL_DMG_FIRE);
    const dmgIce     = this.scaleDmg(EL_DMG_ICE);
    const dmgThunder = this.scaleDmg(EL_DMG_THUNDER);
    const dmgVoid    = this.scaleDmg(EL_DMG_VOID);

    // ── 火焰波（均勻放射，移動式）────────────────────────
    for (let i = 0; i < EL_FIRE_COUNT; i++) {
      const angle = (i / EL_FIRE_COUNT) * Math.PI * 2;
      const tx = this.x + Math.cos(angle) * this.arenaRadius * 1.1;
      const ty = this.y + Math.sin(angle) * this.arenaRadius * 1.1;
      const orb = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(65);
      // Layered fire orb
      orb.fillStyle(0xff2000, 0.07); orb.fillCircle(0, 0, EL_FIRE_R * 2.0);
      orb.fillStyle(0xff4400, 0.18); orb.fillCircle(0, 0, EL_FIRE_R * 1.4);
      orb.fillStyle(0xff5500, 0.86); orb.fillCircle(0, 0, EL_FIRE_R * 0.72);
      orb.fillStyle(0xff9900, 0.92); orb.fillCircle(0, 0, EL_FIRE_R * 0.46);
      orb.fillStyle(0xffee55, 0.96); orb.fillCircle(0, 0, EL_FIRE_R * 0.22);
      orb.fillStyle(0xffffff, 1.00); orb.fillCircle(0, 0, EL_FIRE_R * 0.09);
      orb.lineStyle(P(3.5), 0xff6600, 0.90); orb.strokeCircle(0, 0, EL_FIRE_R * 0.72);
      orb.lineStyle(P(2),   0xff9900, 0.50); orb.strokeCircle(0, 0, EL_FIRE_R * 1.15);

      const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
      const ms   = Math.round((dist / EL_FIRE_SPEED) * 1000);
      this.scene.tweens.add({
        targets: orb, x: tx, y: ty, duration: ms, ease: 'Linear',
        onUpdate: () => {
          const trail = this.scene.add.graphics({ x: orb.x, y: orb.y }).setDepth(64);
          trail.fillStyle(0xff2200, 0.10); trail.fillCircle(0, 0, EL_FIRE_R * 1.1);
          trail.fillStyle(0xff5500, 0.52); trail.fillCircle(0, 0, EL_FIRE_R * 0.58);
          trail.fillStyle(0xffaa00, 0.66); trail.fillCircle(0, 0, EL_FIRE_R * 0.28);
          this.scene.tweens.add({ targets: trail, alpha: 0, scaleX: 1.9, scaleY: 1.9, duration: 240, onComplete: () => trail.destroy() });
        },
        onComplete: () => {
          const ex = orb.x, ey = orb.y;
          orb.destroy();
          // Inner white flash
          const flash = this.scene.add.graphics({ x: ex, y: ey }).setDepth(69);
          flash.fillStyle(0xffffff, 1.0); flash.fillCircle(0, 0, EL_FIRE_R * 0.5);
          this.scene.tweens.add({ targets: flash, scaleX: 2.0, scaleY: 2.0, alpha: 0, duration: 150, ease: 'Quad.Out', onComplete: () => flash.destroy() });
          // Main explosion (3 layers)
          const boom = this.scene.add.graphics({ x: ex, y: ey }).setDepth(67);
          boom.fillStyle(0xff2200, 0.92); boom.fillCircle(0, 0, EL_FIRE_R * 1.1);
          boom.fillStyle(0xff7700, 0.88); boom.fillCircle(0, 0, EL_FIRE_R * 0.70);
          boom.fillStyle(0xffcc22, 0.93); boom.fillCircle(0, 0, EL_FIRE_R * 0.38);
          this.scene.tweens.add({ targets: boom, scaleX: 3.2, scaleY: 3.2, alpha: 0, duration: 460, ease: 'Quad.Out', onComplete: () => boom.destroy() });
          // Shockwave ring 1
          const shock1 = this.scene.add.graphics({ x: ex, y: ey }).setDepth(66);
          shock1.lineStyle(P(5), 0xff7700, 0.92); shock1.strokeCircle(0, 0, EL_FIRE_R * 0.55);
          this.scene.tweens.add({ targets: shock1, scaleX: 5.2, scaleY: 5.2, alpha: 0, duration: 380, ease: 'Cubic.Out', onComplete: () => shock1.destroy() });
          // Shockwave ring 2
          const shock2 = this.scene.add.graphics({ x: ex, y: ey }).setDepth(65);
          shock2.lineStyle(P(2.5), 0xff4400, 0.55); shock2.strokeCircle(0, 0, EL_FIRE_R * 0.7);
          this.scene.tweens.add({ targets: shock2, scaleX: 7.5, scaleY: 7.5, alpha: 0, duration: 540, delay: 60, ease: 'Quad.Out', onComplete: () => shock2.destroy() });
          // Embers flying outward
          for (let k = 0; k < 8; k++) {
            const ea = Math.PI * 2 * k / 8 + Phaser.Math.FloatBetween(-0.35, 0.35);
            const ed = EL_FIRE_R * Phaser.Math.FloatBetween(1.5, 3.0);
            const em = this.scene.add.graphics({ x: ex, y: ey }).setDepth(66);
            em.fillStyle(k % 2 === 0 ? 0xff6600 : 0xffaa00, 0.90);
            em.fillCircle(0, 0, P(Phaser.Math.Between(3, 6)));
            this.scene.tweens.add({
              targets: em, x: ex + Math.cos(ea) * ed, y: ey + Math.sin(ea) * ed,
              alpha: 0, scaleX: 0.15, scaleY: 0.15,
              duration: Phaser.Math.Between(300, 490), ease: 'Quad.Out',
              onComplete: () => em.destroy(),
            });
          }
          if (!this.guestMode) this.onElFireHit?.(ex, ey, EL_FIRE_R, dmgFire);
        },
      });
    }

    // ── 冰刺（從地板爆出）────────────────────────────────
    icePts.forEach((p, i) => {
      // Pre-eruption frost crack lines (100ms before spike)
      this.scene.time.delayedCall(i * 55, () => {
        if (this.currentState === BossState.DEAD) return;
        const crack = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(63);
        crack.lineStyle(P(1.5), 0x88ccff, 0.70);
        for (let k = 0; k < 6; k++) {
          const ca = Math.PI / 3 * k;
          let cx2 = 0, cy2 = 0;
          crack.beginPath(); crack.moveTo(0, 0);
          for (let s = 0; s < 3; s++) {
            const na = ca + Phaser.Math.FloatBetween(-0.28, 0.28);
            const segLen = P(18 + k * 3) / 3;
            cx2 += Math.cos(na) * segLen; cy2 += Math.sin(na) * segLen;
            crack.lineTo(cx2, cy2);
          }
          crack.strokePath();
        }
        crack.fillStyle(0x66aaff, 0.28); crack.fillCircle(0, 0, P(7));
        crack.setScale(0.1);
        this.scene.tweens.add({ targets: crack, scaleX: 1, scaleY: 1, alpha: 0.90, duration: 130, ease: 'Back.Out' });
        this.scene.time.delayedCall(700, () => { if (crack.active) crack.destroy(); });
      });

      // Spike eruption (+100ms after crack)
      this.scene.time.delayedCall(i * 55 + 100, () => {
        if (this.currentState === BossState.DEAD) return;
        const spike = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(65);
        // Ground frost base
        spike.fillStyle(0x1188cc, 0.22); spike.fillCircle(0, 0, EL_ICE_R * 1.2);
        spike.fillStyle(0x33aaee, 0.38); spike.fillCircle(0, 0, EL_ICE_R * 0.82);
        // 3 large + 2 medium crystal spires
        const spireData = [
          { a: -Math.PI / 2,        len: P(45), w: P(8)   },
          { a: -Math.PI / 2 + 0.65, len: P(37), w: P(6.5) },
          { a: -Math.PI / 2 - 0.65, len: P(37), w: P(6.5) },
          { a: -Math.PI / 2 + 1.25, len: P(24), w: P(4.5) },
          { a: -Math.PI / 2 - 1.25, len: P(24), w: P(4.5) },
        ];
        for (const spire of spireData) {
          spike.fillStyle(0x55bbee, 0.88);
          spike.fillTriangle(
            Math.cos(spire.a + Math.PI / 2) * spire.w, Math.sin(spire.a + Math.PI / 2) * spire.w,
            Math.cos(spire.a - Math.PI / 2) * spire.w, Math.sin(spire.a - Math.PI / 2) * spire.w,
            Math.cos(spire.a) * spire.len,             Math.sin(spire.a) * spire.len,
          );
          // Shine facet
          spike.fillStyle(0xeef8ff, 0.58);
          spike.fillTriangle(
            0, 0,
            Math.cos(spire.a + Math.PI / 2) * spire.w * 0.38, Math.sin(spire.a + Math.PI / 2) * spire.w * 0.38,
            Math.cos(spire.a) * spire.len * 0.72,             Math.sin(spire.a) * spire.len * 0.72,
          );
        }
        spike.lineStyle(P(2.5), 0x99eeff, 0.88); spike.strokeCircle(0, 0, EL_ICE_R * 0.48);
        spike.lineStyle(P(1.5), 0xccf4ff, 0.55); spike.strokeCircle(0, 0, EL_ICE_R * 0.26);
        spike.setScale(0, 0);
        this.scene.tweens.add({
          targets: spike, scaleX: 1, scaleY: 1, duration: 200, ease: 'Back.easeOut',
          onComplete: () => {
            if (!this.guestMode) this.onElIceHit?.(p.x, p.y, EL_ICE_R, dmgIce);
            // Ice shards burst outward
            for (let k = 0; k < 7; k++) {
              const sa = Math.PI * 2 * k / 7 + Phaser.Math.FloatBetween(-0.35, 0.35);
              const shard = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(67);
              shard.fillStyle(0xaaeeff, 0.92);
              const sw = P(2.5), sl = P(9 + k * 1.5);
              shard.fillTriangle(
                Math.cos(sa + Math.PI / 2) * sw, Math.sin(sa + Math.PI / 2) * sw,
                Math.cos(sa - Math.PI / 2) * sw, Math.sin(sa - Math.PI / 2) * sw,
                Math.cos(sa) * sl, Math.sin(sa) * sl,
              );
              this.scene.tweens.add({
                targets: shard,
                x: p.x + Math.cos(sa) * P(28 + k * 8), y: p.y + Math.sin(sa) * P(28 + k * 8),
                alpha: 0, rotation: sa,
                duration: 260 + k * 28, ease: 'Quad.Out', onComplete: () => shard.destroy(),
              });
            }
            this.scene.tweens.add({ targets: spike, alpha: 0, duration: 620, delay: 200, onComplete: () => spike.destroy() });
          },
        });
        // Ground frost circle
        const frost = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(64);
        frost.fillStyle(0x44bbff, 0.28); frost.fillCircle(0, 0, EL_ICE_R);
        frost.lineStyle(P(2.5), 0xaaeeff, 0.78); frost.strokeCircle(0, 0, EL_ICE_R);
        frost.lineStyle(P(1.5), 0xccf0ff, 0.45); frost.strokeCircle(0, 0, EL_ICE_R * 0.6);
        this.scene.tweens.add({ targets: frost, alpha: 0, duration: 960, delay: 100, onComplete: () => frost.destroy() });
      });
    });

    // ── 閃電打擊（垂直閃電弧）────────────────────────────
    thunderPts.forEach((p, i) => {
      // Pre-strike ground glow (120ms before bolt)
      this.scene.time.delayedCall(i * 45 + 60, () => {
        if (this.currentState === BossState.DEAD) return;
        const preGlow = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(62);
        preGlow.fillStyle(0xffffaa, 0.48); preGlow.fillCircle(0, 0, P(22));
        preGlow.lineStyle(P(2.5), 0xffff55, 0.88); preGlow.strokeCircle(0, 0, P(19));
        this.scene.tweens.add({ targets: preGlow, alpha: 0, scaleX: 1.8, scaleY: 1.8, duration: 200, onComplete: () => preGlow.destroy() });
      });

      this.scene.time.delayedCall(i * 45 + 180, () => {
        if (this.currentState === BossState.DEAD) return;
        const boltG = this.scene.add.graphics().setDepth(66);
        const startY = p.y - P(230);

        const drawBolt = (alpha: number) => {
          boltG.clear();
          // Atmospheric glow
          boltG.lineStyle(P(14), 0x3333bb, 0.16 * alpha); boltG.lineBetween(p.x, startY, p.x, p.y);
          boltG.lineStyle(P(8),  0x6666dd, 0.28 * alpha); boltG.lineBetween(p.x, startY, p.x, p.y);

          // Main jagged bolt path
          const pts: { x: number; y: number }[] = [{ x: p.x, y: startY }];
          const segs = 11;
          for (let s = 1; s < segs; s++) {
            pts.push({ x: p.x + Phaser.Math.FloatBetween(-P(13), P(13)), y: startY + (p.y - startY) * (s / segs) });
          }
          pts.push({ x: p.x, y: p.y });
          boltG.lineStyle(P(3.5), 0xccccff, 0.70 * alpha);
          boltG.beginPath(); boltG.moveTo(pts[0].x, pts[0].y);
          pts.forEach(pt => boltG.lineTo(pt.x, pt.y)); boltG.strokePath();
          boltG.lineStyle(P(1.5), 0xffffff, 1.0 * alpha);
          boltG.beginPath(); boltG.moveTo(pts[0].x, pts[0].y);
          pts.forEach(pt => boltG.lineTo(pt.x, pt.y)); boltG.strokePath();

          // Branch 1 (~35% down)
          const b1 = pts[Math.floor(segs * 0.35)];
          const b1a = Math.PI / 2 + Phaser.Math.FloatBetween(0.4, 0.9) * (Math.random() > 0.5 ? 1 : -1);
          boltG.lineStyle(P(2), 0xaaaaff, 0.52 * alpha);
          boltG.beginPath(); boltG.moveTo(b1.x, b1.y);
          boltG.lineTo(b1.x + Math.cos(b1a) * P(25) + Phaser.Math.FloatBetween(-P(5), P(5)), b1.y + Math.sin(b1a) * P(22));
          boltG.lineTo(b1.x + Math.cos(b1a) * P(46), b1.y + Math.sin(b1a) * P(40)); boltG.strokePath();

          // Branch 2 (~62% down)
          const b2 = pts[Math.floor(segs * 0.62)];
          const b2a = Math.PI / 2 + Phaser.Math.FloatBetween(0.3, 0.7) * (Math.random() > 0.5 ? 1 : -1);
          boltG.lineStyle(P(1.5), 0xaaaaff, 0.40 * alpha);
          boltG.beginPath(); boltG.moveTo(b2.x, b2.y);
          boltG.lineTo(b2.x + Math.cos(b2a) * P(28), b2.y + Math.sin(b2a) * P(24)); boltG.strokePath();

          // Impact flash
          boltG.fillStyle(0xffffff, 0.92 * alpha); boltG.fillCircle(p.x, p.y, P(18));
          boltG.fillStyle(0xddddff, 0.62 * alpha); boltG.fillCircle(p.x, p.y, P(30));
        };

        drawBolt(1.0);
        const bv = { a: 1.0 };
        this.scene.tweens.add({
          targets: bv, a: 0, duration: 260, ease: 'Quad.In',
          onUpdate: () => drawBolt(bv.a), onComplete: () => boltG.destroy(),
        });
        // Electric burst ring
        const burst = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(65);
        burst.lineStyle(P(4.5), 0xeeeeff, 0.95); burst.strokeCircle(0, 0, P(14));
        burst.fillStyle(0xffffff, 0.72); burst.fillCircle(0, 0, P(9));
        this.scene.tweens.add({ targets: burst, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 280, ease: 'Cubic.Out', onComplete: () => burst.destroy() });
        // Ground electric residue
        const zap = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(63);
        zap.fillStyle(0xffff33, 0.35); zap.fillCircle(0, 0, EL_THUNDER_R);
        zap.lineStyle(P(2.5), 0xffff88, 0.90); zap.strokeCircle(0, 0, EL_THUNDER_R);
        zap.lineStyle(P(1.5), 0xffffff, 0.55); zap.strokeCircle(0, 0, EL_THUNDER_R * 0.55);
        this.scene.tweens.add({ targets: zap, alpha: 0, duration: 560, delay: 80, onComplete: () => zap.destroy() });
        if (!this.guestMode) this.onElThunderHit?.(p.x, p.y, EL_THUNDER_R, dmgThunder);
      });
    });

    // ── 虛空環（從中心向外擴張）──────────────────────────
    this.scene.time.delayedCall(250, () => {
      if (this.currentState === BossState.DEAD) return;
      const voidG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(64);
      const vv = { r: P(30), a: 1.0 };
      const drawVoid = () => {
        voidG.clear();
        // Dark inner shadow (consumes the arena center)
        voidG.fillStyle(0x220044, 0.10 * vv.a); voidG.fillCircle(0, 0, vv.r * 0.82);
        // Layered void ring (wider, more dramatic)
        voidG.lineStyle(P(22), 0x5500aa, 0.36 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        voidG.lineStyle(P(13), 0x8800cc, 0.56 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        voidG.lineStyle(P(7),  0xcc44ff, 0.86 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        voidG.lineStyle(P(2.5), 0xeeccff, 1.00 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        // Outer faint halo
        voidG.lineStyle(P(2), 0x9900ff, 0.22 * vv.a); voidG.strokeCircle(0, 0, vv.r * 1.06);
      };
      drawVoid();
      this.scene.tweens.add({
        targets: vv, r: EL_VOID_R, duration: 600, ease: 'Quad.Out',
        onUpdate: () => drawVoid(),
        onComplete: () => {
          // Secondary ripple expanding outward from final position
          const rv = { r: EL_VOID_R * 0.65, a: 0.68 };
          const rippleG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(63);
          this.scene.tweens.add({
            targets: rv, r: EL_VOID_R * 1.20, a: 0, duration: 560, ease: 'Quad.Out',
            onUpdate: () => { rippleG.clear(); rippleG.lineStyle(P(3.5), 0xcc44ff, rv.a); rippleG.strokeCircle(0, 0, rv.r); },
            onComplete: () => rippleG.destroy(),
          });
          this.scene.tweens.add({
            targets: vv, a: 0, duration: 330,
            onUpdate: () => drawVoid(), onComplete: () => voidG.destroy(),
          });
        },
      });
      // 20 void particles with slight spiral motion
      for (let k = 0; k < 20; k++) {
        const a = (k / 20) * Math.PI * 2;
        const vp = this.scene.add.graphics({
          x: cx + Math.cos(a) * EL_VOID_R * 0.28,
          y: cy + Math.sin(a) * EL_VOID_R * 0.28,
        }).setDepth(65);
        vp.fillStyle(k % 3 === 0 ? 0xcc44ff : 0x9900ff, 0.92);
        vp.fillCircle(0, 0, P(k % 4 === 0 ? 6 : 4));
        const destA = a + 0.22;
        const destR = EL_VOID_R * Phaser.Math.FloatBetween(0.88, 1.12);
        this.scene.tweens.add({
          targets: vp,
          x: cx + Math.cos(destA) * destR, y: cy + Math.sin(destA) * destR,
          alpha: 0, scaleX: 0.25, scaleY: 0.25,
          duration: Phaser.Math.Between(460, 680), ease: 'Quad.Out', onComplete: () => vp.destroy(),
        });
      }
      if (!this.guestMode) this.onElVoidHit?.(cx, cy, EL_VOID_R, dmgVoid);
    });

    this.stateTimer = this.scene.time.delayedCall(1800, () => this.enterIdle());
  }

  // ════════════════════════════════════════════════════════
  //  技能四：雷霆連鎖
  // ════════════════════════════════════════════════════════

  private enterLightningChain(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.V3_LIGHTNING_CHAIN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const cx = this.arenaCenter.x, cy = this.arenaCenter.y;
    const orbDist = this.arenaRadius * 0.45;
    let orbAngle = -Math.PI / 4;
    const WARMUP = 750;
    const SPIN_FULL = (0.85 / 1000) * 55;
    let elapsedT = 0;
    let pulseT = 0;
    let arcActive = false; // stays off during warmup

    const getOrbPos = () => Array.from({ length: 4 }, (_, i) => {
      const a = orbAngle + (Math.PI / 2 * i);
      return { x: cx + Math.cos(a) * orbDist, y: cy + Math.sin(a) * orbDist };
    });

    const orbG = this.scene.add.graphics().setDepth(51);
    const arcG = this.scene.add.graphics().setDepth(50);

    const draw = () => {
      const grow = Math.min(elapsedT / WARMUP, 1.0);
      const eg = grow * grow * (3 - 2 * grow); // smoothstep
      if (eg < 0.01) return;
      const pv = (0.65 + 0.35 * Math.sin(pulseT * 0.012)) * eg;
      const ringRot = pulseT * 0.003;
      const pos = getOrbPos();
      const orbR = P(18) * eg;

      orbG.clear();
      // Central energy node — scales with warmup
      orbG.fillStyle(0x1166cc, 0.10 * pv); orbG.fillCircle(cx, cy, P(30) * eg);
      orbG.fillStyle(0x3399ff, 0.28 * pv); orbG.fillCircle(cx, cy, P(16) * eg);
      orbG.fillStyle(0x99ddff, 0.65 * pv); orbG.fillCircle(cx, cy, P(8) * eg);
      orbG.fillStyle(0xffffff, 0.90 * pv); orbG.fillCircle(cx, cy, P(3.5) * eg);
      orbG.lineStyle(P(1.5), 0x44aaff, 0.28 * pv); orbG.strokeCircle(cx, cy, P(24) * eg);
      orbG.lineStyle(P(1), 0x88ccff, 0.16 * pv); orbG.strokeCircle(cx, cy, P(36) * eg);

      for (const p of pos) {
        // Atmospheric corona
        orbG.fillStyle(0x1155bb, 0.05 * pv); orbG.fillCircle(p.x, p.y, orbR * 3.4);
        orbG.fillStyle(0x2277cc, 0.11 * pv); orbG.fillCircle(p.x, p.y, orbR * 2.3);
        // Main orb body — radius grows with eg
        orbG.fillStyle(0x1d55bb, 0.85 * pv); orbG.fillCircle(p.x, p.y, orbR);
        orbG.fillStyle(0x55aaff, 0.90 * pv); orbG.fillCircle(p.x, p.y, orbR * 0.60);
        orbG.fillStyle(0xbbd8ff, 0.95 * pv); orbG.fillCircle(p.x, p.y, orbR * 0.32);
        orbG.fillStyle(0xffffff, 1.0 * pv);  orbG.fillCircle(p.x, p.y, orbR * 0.13);
        // Outer ring
        orbG.lineStyle(P(2.5), 0x44aaff, 0.85 * pv); orbG.strokeCircle(p.x, p.y, orbR);
        // Rotating arc pair
        orbG.lineStyle(P(3), 0x00ccff, 0.65 * pv);
        orbG.beginPath(); orbG.arc(p.x, p.y, orbR * 1.50, ringRot, ringRot + 1.15, false); orbG.strokePath();
        orbG.beginPath(); orbG.arc(p.x, p.y, orbR * 1.50, ringRot + Math.PI, ringRot + Math.PI + 1.15, false); orbG.strokePath();
        // Faint outer rune ring
        orbG.lineStyle(P(1), 0x88bbff, 0.20 * pv); orbG.strokeCircle(p.x, p.y, orbR * 2.5);
      }

      arcG.clear();
      if (arcActive) {
        for (let i = 0; i < 4; i++) {
          const a = pos[i], b = pos[(i + 1) % 4];
          // Wide electric glow
          arcG.lineStyle(P(18), 0x2244cc, 0.05);
          arcG.beginPath(); arcG.moveTo(a.x, a.y); arcG.lineTo(b.x, b.y); arcG.strokePath();
          arcG.lineStyle(P(10), 0x4488dd, 0.13);
          arcG.beginPath(); arcG.moveTo(a.x, a.y); arcG.lineTo(b.x, b.y); arcG.strokePath();
          // Main bolt
          arcG.lineStyle(P(2.5), 0x44aaff, 0.92);
          this._drawLightningLine(arcG, a.x, a.y, b.x, b.y, 9);
          // White inner core
          arcG.lineStyle(P(1), 0xddf4ff, 0.72);
          this._drawLightningLine(arcG, a.x, a.y, b.x, b.y, 7);
        }
        // Faint center-to-orb spokes
        for (const p of pos) {
          arcG.lineStyle(P(1.5), 0x4488ff, 0.16 * pv);
          this._drawLightningLine(arcG, cx, cy, p.x, p.y, 4);
        }
      }
    };

    const animTimer = this.scene.time.addEvent({
      delay: 55, loop: true,
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); return; }
        elapsedT += 55;
        pulseT += 55;
        // Spin ramps from 0 → full over warmup window
        orbAngle += SPIN_FULL * Math.min(elapsedT / WARMUP, 1.0);
        draw();
      },
    });

    const dmgTimer = this.scene.time.addEvent({
      delay: 200, loop: true,
      callback: () => {
        if (this.currentState === BossState.DEAD || !arcActive) return;
        const [px, py] = this.getTargetPos();
        const pos = getOrbPos();
        for (let i = 0; i < 4; i++) {
          const a = pos[i], b = pos[(i + 1) % 4];
          if (this._distToSegment(px, py, a.x, a.y, b.x, b.y) <= P(24)) {
            this.onLightningArcHit?.(this.scaleDmg(55));
            break;
          }
        }
      },
    });

    // Warmup done → arcs fire + boss enters idle
    this.stateTimer = this.scene.time.delayedCall(WARMUP, () => {
      if (this.currentState !== BossState.DEAD) {
        arcActive = true;
        this.enterIdle();
      }
    });

    // ON 0.75s → OFF 0.5s × 4 cycles, all offset past warmup
    [750, 1250, 2000, 2500, 3250, 3750, 4500].forEach((t, idx) => {
      this.scene.time.delayedCall(WARMUP + t, () => {
        if (this.currentState === BossState.DEAD) return;
        arcActive = (idx % 2 === 1); // even = OFF, odd = ON
      });
    });

    // Cleanup at warmup + 5s
    this.scene.time.delayedCall(WARMUP + 5000, () => {
      animTimer.destroy(); dmgTimer.destroy();
      this.scene.tweens.add({
        targets: [orbG, arcG], alpha: 0, duration: 320,
        onComplete: () => { orbG.destroy(); arcG.destroy(); },
      });
    });
  }

  private _distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Phaser.Math.Distance.Between(px, py, ax, ay);
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Phaser.Math.Distance.Between(px, py, ax + t * dx, ay + t * dy);
  }

  private _drawLightningLine(g: Phaser.GameObjects.Graphics,
    x1: number, y1: number, x2: number, y2: number, segs: number): void {
    const pts = [{ x: x1, y: y1 }];
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      pts.push({
        x: x1 + (x2 - x1) * t + Phaser.Math.FloatBetween(-P(11), P(11)),
        y: y1 + (y2 - y1) * t + Phaser.Math.FloatBetween(-P(11), P(11)),
      });
    }
    pts.push({ x: x2, y: y2 });
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    g.strokePath();
  }

  // ════════════════════════════════════════════════════════
  //  技能五：冰封領域
  // ════════════════════════════════════════════════════════

  private enterIceDomain(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.V3_ICE_DOMAIN);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const iceCX = this.x, iceCY = this.y;
    const innerR = P(170), outerR = P(250);
    const midR = (innerR + outerR) * 0.5;

    // ── Static base layer ──────────────────────────────────
    const iceG = this.scene.add.graphics().setDepth(28);

    // Layered fill: outer edge fades to lighter blue toward center of ring
    iceG.fillStyle(0xaadeff, 0.07);
    iceG.beginPath(); iceG.arc(iceCX, iceCY, outerR * 1.06, 0, Math.PI * 2, false);
    iceG.arc(iceCX, iceCY, innerR * 0.94, 0, Math.PI * 2, true); iceG.fillPath();
    iceG.fillStyle(0x88ccff, 0.13);
    iceG.beginPath(); iceG.arc(iceCX, iceCY, outerR, 0, Math.PI * 2, false);
    iceG.arc(iceCX, iceCY, innerR, 0, Math.PI * 2, true); iceG.fillPath();
    iceG.fillStyle(0x66aaee, 0.10);
    iceG.beginPath(); iceG.arc(iceCX, iceCY, outerR * 0.91, 0, Math.PI * 2, false);
    iceG.arc(iceCX, iceCY, innerR * 1.09, 0, Math.PI * 2, true); iceG.fillPath();

    // Outer & inner glow rings
    iceG.lineStyle(P(5), 0xaadeff, 0.85); iceG.strokeCircle(iceCX, iceCY, outerR);
    iceG.lineStyle(P(2.5), 0x77bbee, 0.45); iceG.strokeCircle(iceCX, iceCY, outerR + P(5));
    iceG.lineStyle(P(3.5), 0x88ddff, 0.70); iceG.strokeCircle(iceCX, iceCY, innerR);
    iceG.lineStyle(P(1.5), 0x77bbee, 0.38); iceG.strokeCircle(iceCX, iceCY, innerR - P(4));
    // Mid dotted ring
    iceG.lineStyle(P(1), 0xbbdeff, 0.18); iceG.strokeCircle(iceCX, iceCY, midR);

    // 16 thin radial marks
    iceG.lineStyle(P(1), 0xbbddff, 0.18);
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * 2 * i / 16;
      iceG.beginPath();
      iceG.moveTo(iceCX + Math.cos(a) * innerR * 1.06, iceCY + Math.sin(a) * innerR * 1.06);
      iceG.lineTo(iceCX + Math.cos(a) * outerR * 0.94, iceCY + Math.sin(a) * outerR * 0.94);
      iceG.strokePath();
    }

    // 8 ice crystal spikes at midR
    for (let i = 0; i < 8; i++) {
      const baseA = Math.PI * 2 * i / 8;
      const bx = iceCX + Math.cos(baseA) * midR;
      const by = iceCY + Math.sin(baseA) * midR;
      const outA = baseA;
      const sL = P(16), sW = P(5.5);
      // Outward spike (diamond)
      const op = [
        { x: bx + Math.cos(outA) * sL,           y: by + Math.sin(outA) * sL },
        { x: bx + Math.cos(outA + Math.PI / 2) * sW, y: by + Math.sin(outA + Math.PI / 2) * sW },
        { x: bx - Math.cos(outA) * sL * 0.45,    y: by - Math.sin(outA) * sL * 0.45 },
        { x: bx + Math.cos(outA - Math.PI / 2) * sW, y: by + Math.sin(outA - Math.PI / 2) * sW },
      ];
      iceG.fillStyle(0xddf0ff, 0.72);
      iceG.beginPath(); iceG.moveTo(op[0].x, op[0].y);
      op.forEach(p => iceG.lineTo(p.x, p.y)); iceG.closePath(); iceG.fillPath();
      iceG.lineStyle(P(1.5), 0xaaddff, 0.95);
      iceG.beginPath(); iceG.moveTo(op[0].x, op[0].y);
      op.forEach(p => iceG.lineTo(p.x, p.y)); iceG.closePath(); iceG.strokePath();
      // Inward spike (smaller)
      const ip = [
        { x: bx - Math.cos(outA) * sL * 0.65,        y: by - Math.sin(outA) * sL * 0.65 },
        { x: bx + Math.cos(outA + Math.PI / 2) * sW * 0.55, y: by + Math.sin(outA + Math.PI / 2) * sW * 0.55 },
        { x: bx + Math.cos(outA) * sL * 0.18,         y: by + Math.sin(outA) * sL * 0.18 },
        { x: bx + Math.cos(outA - Math.PI / 2) * sW * 0.55, y: by + Math.sin(outA - Math.PI / 2) * sW * 0.55 },
      ];
      iceG.fillStyle(0xbbdeff, 0.50);
      iceG.beginPath(); iceG.moveTo(ip[0].x, ip[0].y);
      ip.forEach(p => iceG.lineTo(p.x, p.y)); iceG.closePath(); iceG.fillPath();
    }

    // ── Animated shimmer layer ─────────────────────────────
    const shimG = this.scene.add.graphics().setDepth(29);
    let shimT = 0;
    const shimTimer = this.scene.time.addEvent({
      delay: 80, loop: true,
      callback: () => {
        if (!this._iceDomainActive) { shimTimer.destroy(); return; }
        shimT += 80;
        shimG.clear();
        // 4 rotating glint arcs on midR
        for (let i = 0; i < 4; i++) {
          const a = shimT * 0.0009 + Math.PI / 2 * i;
          const alpha = 0.18 + 0.14 * Math.sin(shimT * 0.0035 + i * 1.3);
          shimG.lineStyle(P(3.5), 0xffffff, alpha);
          shimG.beginPath(); shimG.arc(iceCX, iceCY, midR, a, a + 0.38, false); shimG.strokePath();
        }
        // Slow outer ring arc pulse
        const outerAlpha = 0.10 + 0.09 * Math.sin(shimT * 0.002);
        shimG.lineStyle(P(6), 0xaaddff, outerAlpha);
        shimG.beginPath(); shimG.arc(iceCX, iceCY, outerR, -shimT * 0.0004, -shimT * 0.0004 + Math.PI * 0.9, false); shimG.strokePath();
        // 20 scattered frost sparkle dots in ring
        for (let i = 0; i < 20; i++) {
          const a = Math.PI * 2 * i / 20 + shimT * 0.00015;
          const r = innerR + (outerR - innerR) * ((i * 0.618) % 1);
          const alpha = 0.12 + 0.16 * Math.sin(shimT * 0.005 + i * 0.8);
          shimG.fillStyle(0xffffff, alpha);
          shimG.fillCircle(iceCX + Math.cos(a) * r, iceCY + Math.sin(a) * r, P(2.2));
        }
      },
    });

    this._iceDomainActive = true;
    this.onIceDomainStart?.(iceCX, iceCY);

    this.stateTimer = this.scene.time.delayedCall(700, () => {
      if (this.currentState !== BossState.DEAD) this.enterIdle();
    });

    this.scene.time.delayedCall(6000, () => {
      this._iceDomainActive = false;
      this.onIceDomainEnd?.();
      this.scene.tweens.add({
        targets: [iceG, shimG], alpha: 0, duration: 800,
        onComplete: () => { iceG.destroy(); shimG.destroy(); },
      });
    });
  }

  // ════════════════════════════════════════════════════════
  //  技能六：龍捲風暴
  // ════════════════════════════════════════════════════════

  private enterTornadoStorm(): void {
    if (this.currentState === BossState.DEAD) return;
    this.setBossState(BossState.V3_TORNADO_STORM);
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.getTargetPos();
    const ang = Math.atan2(ty - this.y, tx - this.x);
    let bx = this.x, by = this.y;
    const vx = Math.cos(ang) * P(60), vy = Math.sin(ang) * P(60);
    const bigG = this._makeTornadoGfx(bx, by, P(36), 0x88bbff, true);

    // Smooth rotation via tween (runs at frame-rate, not timer-rate)
    const bigRotTween = this.scene.tweens.add({
      targets: bigG,
      rotation: `+=${Math.PI * 2}`,
      duration: 950,
      ease: 'Linear',
      repeat: -1,
    });

    // Position updated at 33ms (~30fps) — much smoother than 80ms
    const moveTimer = this.scene.time.addEvent({
      delay: 33, loop: true,
      callback: () => {
        if (this.currentState === BossState.DEAD) { moveTimer.destroy(); return; }
        bx += vx * (33 / 1000); by += vy * (33 / 1000);
        bigG.x = bx; bigG.y = by;
      },
    });
    // Damage check on a separate 100ms cadence (keeps same dps as before)
    const bigHitTimer = this.scene.time.addEvent({
      delay: 100, loop: true,
      callback: () => {
        if (this.currentState === BossState.DEAD) { bigHitTimer.destroy(); return; }
        const [px, py] = this.getTargetPos();
        if (Phaser.Math.Distance.Between(px, py, bx, by) <= P(36))
          this.onTornadoHit?.(this.scaleDmg(65));
      },
    });

    const branchTimer = this.scene.time.addEvent({
      delay: 1000, repeat: 3,
      callback: () => {
        if (this.currentState === BossState.DEAD) { branchTimer.destroy(); return; }
        const baseDir = Phaser.Math.FloatBetween(0, Math.PI * 2);
        for (let q = 0; q < 4; q++) {
          const dir = baseDir + q * (Math.PI / 2);
          const svx = Math.cos(dir) * P(170), svy = Math.sin(dir) * P(170);
          const sg = this._makeTornadoGfx(bx, by, P(18), 0x66aacc, false);
          let sx = bx, sy = by;

          const sgRotTween = this.scene.tweens.add({
            targets: sg,
            rotation: `+=${Math.PI * 2}`,
            duration: 550,
            ease: 'Linear',
            repeat: -1,
          });
          const sm = this.scene.time.addEvent({
            delay: 33, loop: true,
            callback: () => {
              if (!sg.active) { sm.destroy(); return; }
              sx += svx * (33 / 1000); sy += svy * (33 / 1000);
              sg.x = sx; sg.y = sy;
            },
          });
          const smHitTimer = this.scene.time.addEvent({
            delay: 100, loop: true,
            callback: () => {
              if (!sg.active) { smHitTimer.destroy(); return; }
              const [px, py] = this.getTargetPos();
              if (Phaser.Math.Distance.Between(px, py, sx, sy) <= P(18))
                this.onTornadoHit?.(this.scaleDmg(38));
            },
          });
          this.scene.time.delayedCall(2000, () => {
            sm.destroy(); smHitTimer.destroy(); sgRotTween.stop();
            this.scene.tweens.add({ targets: sg, alpha: 0, duration: 260, onComplete: () => sg.destroy() });
          });
        }
      },
    });

    this.stateTimer = this.scene.time.delayedCall(4000, () => {
      moveTimer.destroy(); bigHitTimer.destroy(); branchTimer.destroy();
      bigRotTween.stop();
      this.scene.tweens.add({ targets: bigG, alpha: 0, duration: 320, onComplete: () => bigG.destroy() });
      this.enterIdle();
    });
  }

  private _makeTornadoGfx(x: number, y: number, r: number, color: number, big: boolean): Phaser.GameObjects.Graphics {
    const g = this.scene.add.graphics({ x, y }).setDepth(52);

    // Atmospheric haze (3 layers — spin will make them look like turbulence)
    g.fillStyle(color, 0.04); g.fillCircle(0, 0, r * 2.8);
    g.fillStyle(color, 0.09); g.fillCircle(0, 0, r * 2.1);
    g.fillStyle(color, 0.17); g.fillCircle(0, 0, r * 1.55);

    // Main body gradient layers
    g.fillStyle(color, 0.38); g.fillCircle(0, 0, r);
    g.fillStyle(color, 0.58); g.fillCircle(0, 0, r * 0.66);
    g.fillStyle(0xccebff, 0.68); g.fillCircle(0, 0, r * 0.36);
    g.fillStyle(0xffffff, 0.82); g.fillCircle(0, 0, r * 0.16);

    // Spiral arc bands (rotate with the graphic → look like spinning vortex)
    const arms = big ? 5 : 4;
    const spiralRadii = big
      ? [r * 0.28, r * 0.46, r * 0.63, r * 0.79, r * 0.93]
      : [r * 0.32, r * 0.53, r * 0.72, r * 0.91];
    for (let ri = 0; ri < spiralRadii.length; ri++) {
      const rr = spiralRadii[ri];
      const lw = Math.max(P(big ? 2.6 - ri * 0.28 : 1.8 - ri * 0.22), P(0.7));
      g.lineStyle(lw, 0xffffff, 0.62 - ri * 0.09);
      for (let i = 0; i < arms; i++) {
        const sa = Math.PI * 2 * i / arms + ri * 0.42;
        const ea = sa + Math.PI * 2 / arms * 0.58;
        g.beginPath(); g.arc(0, 0, rr, sa, ea, false); g.strokePath();
      }
    }

    // Stroke rings (outer glow + core ring)
    g.lineStyle(P(big ? 5 : 3), color, 0.88); g.strokeCircle(0, 0, r);
    g.lineStyle(P(big ? 3 : 2), color, 0.55); g.strokeCircle(0, 0, r * 1.40);
    g.lineStyle(P(big ? 2 : 1.2), color, 0.28); g.strokeCircle(0, 0, r * 1.80);
    g.lineStyle(P(big ? 2 : 1.2), 0xffffff, 0.45); g.strokeCircle(0, 0, r * 0.50);

    // Debris particles scattered through the vortex body
    const dots = big ? 16 : 10;
    for (let i = 0; i < dots; i++) {
      const da = Math.PI * 2 * i / dots + Phaser.Math.FloatBetween(0, 0.7);
      const dr = Phaser.Math.FloatBetween(r * 0.22, r * 0.96);
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.18, 0.54));
      g.fillCircle(Math.cos(da) * dr, Math.sin(da) * dr, P(big ? 2.2 : 1.4));
    }

    return g;
  }
}
