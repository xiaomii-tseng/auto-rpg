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
const MRAIN_BASE_DMG = 90;

// ── 彗星術 ────────────────────────────────────────────────
const COMET_CHARGE_MS = 3000;
const COMET_FALL_MS   = 420;
const COMET_R1        = P(130); // inner ring   0–130px
const COMET_R2        = P(260); // mid  ring  131–260px
const COMET_R3        = P(390); // outer ring 261–390px
const COMET_DMG_INNER = 220;
const COMET_DMG_MID   = 130;
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
const EL_DMG_FIRE    = 110;
const EL_DMG_ICE     = 95;
const EL_DMG_THUNDER = 130;
const EL_DMG_VOID    = 80;

export class BossVampire2 extends Boss {
  onMeteorRainHit?:    (x: number, y: number, r: number, dmg: number) => void;
  onCometRingHit?:     (cx: number, cy: number, rInner: number, rOuter: number, dmg: number) => void;
  onElFireHit?:        (x: number, y: number, r: number, dmg: number) => void;
  onElIceHit?:         (x: number, y: number, r: number, dmg: number) => void;
  onElThunderHit?:     (x: number, y: number, r: number, dmg: number) => void;
  onElVoidHit?:        (cx: number, cy: number, r: number, dmg: number) => void;

  protected override walkAnimSuffix = 'run';
  private _elCollapseTriggered = false;

  constructor(scene: Phaser.Scene, x: number, y: number,
              totalHp: number, element: Element,
              spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    (this.body as Phaser.Physics.Arcade.Body).setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = P(85);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    // HP 降到 30% 以下，強制觸發一次禁咒（僅此一次）
    if (!this._elCollapseTriggered && this.currentHp / this.maxHpValue <= 0.30) {
      this._elCollapseTriggered = true;
      this.stateTimer = this.scene.time.delayedCall(
        this.getNextAttackDelay(), () => this.enterElCollapseWarn());
      return;
    }
    const fn = Math.random() < 0.50
      ? () => this.enterMeteorRainWarn()
      : () => this.enterCometWarn();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.V2_METEOR_RAIN_WARN: this.enterMeteorRainWarn(); break;
      case BossState.V2_COMET_WARN:       this.enterCometWarn();      break;
      case BossState.V2_EL_COLLAPSE_WARN: this.enterElCollapseWarn(); break;
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
        warnG.clear();
        for (const p of firePts) {
          warnG.fillStyle(0xff4400, wv.v * 0.20); warnG.fillCircle(p.x, p.y, EL_FIRE_R * 1.3);
          warnG.lineStyle(P(2), 0xff4400, wv.v * 0.90); warnG.strokeCircle(p.x, p.y, EL_FIRE_R);
        }
        for (const p of icePts) {
          warnG.fillStyle(0x44ccff, wv.v * 0.18); warnG.fillCircle(p.x, p.y, EL_ICE_R * 1.3);
          warnG.lineStyle(P(2), 0x88ddff, wv.v * 0.88); warnG.strokeCircle(p.x, p.y, EL_ICE_R);
        }
        for (const p of thunderPts) {
          warnG.fillStyle(0xffff33, wv.v * 0.15); warnG.fillCircle(p.x, p.y, EL_THUNDER_R * 1.3);
          warnG.lineStyle(P(1.5), 0xffff33, wv.v * 0.85); warnG.strokeCircle(p.x, p.y, EL_THUNDER_R);
        }
        warnG.lineStyle(P(2), 0x9900ff, wv.v * 0.55); warnG.strokeCircle(cx, cy, EL_VOID_R);
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
      orb.fillStyle(0xff4400, 0.92); orb.fillCircle(0, 0, EL_FIRE_R * 0.7);
      orb.fillStyle(0xffcc44, 0.80); orb.fillCircle(0, 0, EL_FIRE_R * 0.35);
      orb.lineStyle(P(3), 0xff8800, 0.90); orb.strokeCircle(0, 0, EL_FIRE_R * 0.7);

      const dist = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
      const ms   = Math.round((dist / EL_FIRE_SPEED) * 1000);
      this.scene.tweens.add({
        targets: orb, x: tx, y: ty, duration: ms, ease: 'Linear',
        onUpdate: () => {
          // 火尾
          const trail = this.scene.add.graphics({ x: orb.x, y: orb.y }).setDepth(64);
          trail.fillStyle(0xff5500, 0.55); trail.fillCircle(0, 0, EL_FIRE_R * 0.45);
          this.scene.tweens.add({ targets: trail, alpha: 0, scaleX: 1.5, scaleY: 1.5, duration: 180, onComplete: () => trail.destroy() });
        },
        onComplete: () => {
          // 爆炸
          const ex = orb.x, ey = orb.y;
          orb.destroy();
          const boom = this.scene.add.graphics({ x: ex, y: ey }).setDepth(66);
          boom.fillStyle(0xffffff, 0.90); boom.fillCircle(0, 0, EL_FIRE_R * 0.55);
          boom.fillStyle(0xff4400, 0.85); boom.fillCircle(0, 0, EL_FIRE_R);
          this.scene.tweens.add({ targets: boom, scaleX: 2.8, scaleY: 2.8, alpha: 0, duration: 380, ease: 'Quad.Out', onComplete: () => boom.destroy() });
          const shock = this.scene.add.graphics({ x: ex, y: ey }).setDepth(65);
          shock.lineStyle(P(3), 0xffaa44, 1); shock.strokeCircle(0, 0, EL_FIRE_R * 0.8);
          this.scene.tweens.add({ targets: shock, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 320, ease: 'Cubic.Out', onComplete: () => shock.destroy() });
          if (!this.guestMode) this.onElFireHit?.(ex, ey, EL_FIRE_R, dmgFire);
        },
      });
    }

    // ── 冰刺（從地板爆出）────────────────────────────────
    icePts.forEach((p, i) => {
      this.scene.time.delayedCall(i * 55 + 100, () => {
        if (this.currentState === BossState.DEAD) return;
        const spike = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(65);
        spike.fillStyle(0x44ccff, 0.85);
        for (let k = 0; k < 5; k++) {
          const a   = (k / 5) * Math.PI * 2;
          const len = P(28 + k * 4);
          spike.fillTriangle(
            Math.cos(a) * P(6), Math.sin(a) * P(6),
            Math.cos(a + 0.4) * P(6), Math.sin(a + 0.4) * P(6),
            Math.cos(a + 0.2) * len, Math.sin(a + 0.2) * len,
          );
        }
        spike.lineStyle(P(1.5), 0xaaeeff, 0.90); spike.strokeCircle(0, 0, EL_ICE_R * 0.5);
        spike.setScale(0, 0);
        this.scene.tweens.add({
          targets: spike, scaleX: 1, scaleY: 1, duration: 220, ease: 'Back.easeOut',
          onComplete: () => {
            if (!this.guestMode) this.onElIceHit?.(p.x, p.y, EL_ICE_R, dmgIce);
            this.scene.tweens.add({ targets: spike, alpha: 0, duration: 600, delay: 200, onComplete: () => spike.destroy() });
          },
        });
        // 地面冰霜擴散圈
        const frost = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(64);
        frost.fillStyle(0x44ccff, 0.28); frost.fillCircle(0, 0, EL_ICE_R);
        frost.lineStyle(P(2), 0xaaeeff, 0.70); frost.strokeCircle(0, 0, EL_ICE_R);
        this.scene.tweens.add({ targets: frost, alpha: 0, duration: 900, delay: 100, onComplete: () => frost.destroy() });
      });
    });

    // ── 閃電打擊（垂直閃電弧）────────────────────────────
    thunderPts.forEach((p, i) => {
      this.scene.time.delayedCall(i * 45 + 180, () => {
        if (this.currentState === BossState.DEAD) return;
        const boltG = this.scene.add.graphics().setDepth(66);
        const startY = p.y - P(220);
        // 主閃電弧（從上至下，鋸齒線）
        const drawBolt = (alpha: number) => {
          boltG.clear();
          boltG.lineStyle(P(8), 0x6666ff, 0.25 * alpha); boltG.lineBetween(p.x, startY, p.x, p.y);
          boltG.lineStyle(P(4), 0xccccff, 0.65 * alpha); boltG.lineBetween(p.x, startY, p.x, p.y);
          boltG.lineStyle(P(2), 0xffffff, 1.0 * alpha);
          let bx = p.x, by = startY;
          const segs = 8;
          for (let s = 1; s <= segs; s++) {
            const nx = p.x + (Math.random() - 0.5) * P(14) * (s < segs ? 1 : 0);
            const ny = startY + (p.y - startY) * (s / segs);
            boltG.beginPath(); boltG.moveTo(bx, by); boltG.lineTo(nx, ny); boltG.strokePath();
            bx = nx; by = ny;
          }
          // 命中閃光
          boltG.fillStyle(0xffffff, 0.80 * alpha); boltG.fillCircle(p.x, p.y, P(16));
        };
        drawBolt(1.0);
        const bv = { a: 1.0 };
        this.scene.tweens.add({
          targets: bv, a: 0, duration: 250, ease: 'Quad.In',
          onUpdate: () => drawBolt(bv.a), onComplete: () => boltG.destroy(),
        });
        // 地面閃電殘留
        const zap = this.scene.add.graphics({ x: p.x, y: p.y }).setDepth(63);
        zap.fillStyle(0xffff33, 0.35); zap.fillCircle(0, 0, EL_THUNDER_R);
        zap.lineStyle(P(2), 0xffff88, 0.85); zap.strokeCircle(0, 0, EL_THUNDER_R);
        this.scene.tweens.add({ targets: zap, alpha: 0, duration: 500, delay: 80, onComplete: () => zap.destroy() });
        if (!this.guestMode) this.onElThunderHit?.(p.x, p.y, EL_THUNDER_R, dmgThunder);
      });
    });

    // ── 虛空環（從 BOSS 向外擴張）─────────────────────────
    this.scene.time.delayedCall(250, () => {
      if (this.currentState === BossState.DEAD) return;
      const voidG = this.scene.add.graphics({ x: cx, y: cy }).setDepth(64);
      const vv = { r: P(30), a: 1.0 };
      const drawVoid = () => {
        voidG.clear();
        voidG.lineStyle(P(14), 0x9900ff, 0.55 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        voidG.lineStyle(P(6),  0xcc44ff, 0.85 * vv.a); voidG.strokeCircle(0, 0, vv.r);
        voidG.lineStyle(P(2),  0xeeccff, 1.0  * vv.a); voidG.strokeCircle(0, 0, vv.r);
      };
      drawVoid();
      this.scene.tweens.add({
        targets: vv, r: EL_VOID_R, duration: 600, ease: 'Quad.Out',
        onUpdate: () => drawVoid(),
        onComplete: () => {
          this.scene.tweens.add({
            targets: vv, a: 0, duration: 300,
            onUpdate: () => drawVoid(), onComplete: () => voidG.destroy(),
          });
        },
      });
      // 虛空粒子爆散
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const vp = this.scene.add.graphics({ x: cx + Math.cos(a) * EL_VOID_R * 0.3, y: cy + Math.sin(a) * EL_VOID_R * 0.3 }).setDepth(65);
        vp.fillStyle(0x9900ff, 0.85); vp.fillCircle(0, 0, P(5));
        this.scene.tweens.add({
          targets: vp,
          x: cx + Math.cos(a) * EL_VOID_R,
          y: cy + Math.sin(a) * EL_VOID_R,
          alpha: 0, duration: 550, ease: 'Quad.Out', onComplete: () => vp.destroy(),
        });
      }
      if (!this.guestMode) this.onElVoidHit?.(cx, cy, EL_VOID_R, dmgVoid);
    });

    this.stateTimer = this.scene.time.delayedCall(1800, () => this.enterIdle());
  }
}
