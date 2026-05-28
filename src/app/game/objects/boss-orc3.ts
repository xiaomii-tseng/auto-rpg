import Phaser from 'phaser';
import { BossState } from './boss';
import { BossOrcBase } from './boss-orc-base';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const MOB = !!(window as any).__gameMobile;
const mq  = (n: number) => MOB ? Math.max(1, Math.ceil(n * 0.5)) : n;

// 刀風亂舞
const STORM_WARN_MS  = 500;
const STORM_COUNT    = 12;
const STORM_DURATION = 2000;
const STORM_INTERVAL = Math.round(STORM_DURATION / STORM_COUNT);
const STORM_DMG      = mq(65);
const STORM_ANIM_DIRS = ['up', 'down', 'left', 'right'] as const;

// 武士道
const BUSHIDO_WARN_MS       = 700;
const BUSHIDO_GUARD_MS      = 1800;
const BUSHIDO_HIT_ROUNDS    = 5;   // rounds of scatter if guard is broken
const BUSHIDO_NOHIT_ROUNDS  = 1;   // rounds if player waits
const BUSHIDO_ROUND_DELAY   = 350; // ms between scatter rounds
const BUSHIDO_DMG           = mq(75);

// 武士葬
const BURIAL_WARN_MS  = 700;
const BURIAL_COUNT    = 15;
const BURIAL_TRAVEL   = 480;  // logical px, larger than normal
const BURIAL_DMG      = mq(75);

// 斬鐵
const IRON_WARN_MS = 900;
const IRON_DMG     = mq(90);

// 隱
const VANISH_HOLD_MS   = 350;  // pause before fading
const VANISH_FADE_MS   = 400;  // fade-out duration (handled by game.scene)
const VANISH_GAP_MS    = 150;  // invisible gap after teleport
const VANISH_APPEAR_MS = 350;  // fade-in duration (handled by game.scene)
const VANISH_OFFSET    = 90;   // logical px distance from target to appear

export class BossOrc3 extends BossOrcBase {
  // 刀風亂舞
  onBladeStorm?: (bx: number, by: number, angle: number, dmg: number) => void;
  onStormWarn?:  (bx: number, by: number, angles: number[], warnMs: number) => void;
  // 武士道
  onBushidoGuard?: (bx: number, by: number) => void;
  onBushidoBurst?: (bx: number, by: number, rounds: number, dmg: number) => void;
  onGuardBreak?: () => void;
  // 武士葬
  onBurial?: (warnMs: number, dmg: number) => void;
  // 斬鐵
  onIronWarn?:  (bx: number, by: number, angle: number, warnMs: number) => void;
  onIronSlash?: (bx: number, by: number, angle: number, dmg: number) => void;
  getIronTarget?: () => [number, number];
  // 隱
  onVanish?: (bx: number, by: number) => void;
  onAppear?: (nx: number, ny: number) => void;
  // 招式字幕
  onShowKanji?: (char: string, bx: number, by: number) => void;

  isGuarding = false;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: import('../data/equipment-data').Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(22, 16).setOffset(21, 24);
    this.idleChaseSpeed = Math.round(115 * DPR);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    if (this.tryChargeIfFar()) return;
    const roll = Math.random();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), () => {
      if      (roll < 0.25) this.enterOrc3StormWarn();
      else if (roll < 0.50) this.enterBurialWarn();
      else if (roll < 0.70) this.enterIronWarn();
      else if (roll < 0.85) this.enterBushidoWarn();
      else                  this.enterVanishWarn();
    });
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.ORC3_STORM_WARN: {
        const angles = (this.guestPts ?? []).map(p => Math.atan2(p.y, p.x));
        this.enterOrc3StormWarn(angles);
        break;
      }
      case BossState.ORC3_STORMING:
        this.enterOrc3Storming((this.guestPts ?? []).map(p => Math.atan2(p.y, p.x)));
        break;
      case BossState.ORC3_BUSHIDO_WARN:
        this.enterBushidoWarn();
        break;
      case BossState.ORC3_BUSHIDO_GUARD:
        this.enterBushidoGuard();
        break;
      case BossState.ORC3_BUSHIDO_BURST:
        this.enterBushidoBurst(Math.round(this.guestAngle) || 1);
        break;
      case BossState.ORC3_BURIAL_WARN:
        this.enterBurialWarn();
        break;
      case BossState.ORC3_IRON_WARN:
        this.enterIronWarn();
        break;
      case BossState.ORC3_VANISH:
        this.enterVanishWarn(this.guestAtkX, this.guestAtkY, this.guestAngle);
        break;
    }
  }

  // 凍在 attack 第 2 偵，製造蓄力感
  private holdAttackFrame(): void {
    this.updateDirToTarget();
    this.play(`${this.animPrefix}_attack_${this.bossDir}`, true);
    this.scene.time.delayedCall(10, () => {
      const anim = this.anims.currentAnim;
      if (anim && anim.frames.length > 1) this.anims.setCurrentFrame(anim.frames[1]);
      this.anims.pause();
    });
  }

  // ── 刀風亂舞 ────────────────────────────────────────────
  private enterOrc3StormWarn(presetAngles?: number[]): void {
    if (this.currentState === BossState.DEAD) return;

    const angles = presetAngles ?? (() => {
      const base = Math.random() * Math.PI * 2;
      return Array.from({ length: STORM_COUNT }, (_, i) =>
        base + (i / STORM_COUNT) * Math.PI * 2);
    })();

    this.onShowKanji?.('舞', this.x, this.y);
    this.setBossState(BossState.ORC3_STORM_WARN, {
      pts: angles.map(a => ({ x: Math.cos(a), y: Math.sin(a) })),
    });

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.holdAttackFrame();
    this.onStormWarn?.(this.x, this.y, angles, STORM_WARN_MS);

    this.stateTimer = this.scene.time.delayedCall(STORM_WARN_MS, () => {
      this.anims.resume();
      this.setBossState(BossState.ORC3_STORMING, {
        pts: angles.map(a => ({ x: Math.cos(a), y: Math.sin(a) })),
      });
      this.enterOrc3Storming(angles);
    });
  }

  private enterOrc3Storming(angles: number[]): void {
    if (this.currentState === BossState.DEAD) return;

    const animTimer = this.scene.time.addEvent({
      delay: 150,
      repeat: Math.ceil(STORM_DURATION / 150),
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); return; }
        const dir = STORM_ANIM_DIRS[Math.floor(Math.random() * STORM_ANIM_DIRS.length)];
        this.play(`${this.animPrefix}_attack_${dir}`, true);
      },
    });

    angles.forEach((angle, i) => {
      this.scene.time.delayedCall(i * STORM_INTERVAL, () => {
        if (this.currentState === BossState.DEAD) return;
        this.onBladeStorm?.(this.x, this.y, angle, this.scaleDmg(STORM_DMG));
      });
    });

    this.stateTimer = this.scene.time.delayedCall(STORM_DURATION + 200, () => {
      animTimer.destroy();
      this.enterIdle();
    });
  }

  // ── 武士道 ────────────────────────────────────────────────
  private enterBushidoWarn(): void {
    if (this.currentState === BossState.DEAD) return;

    this.onShowKanji?.('道', this.x, this.y);
    this.setBossState(BossState.ORC3_BUSHIDO_WARN);

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.holdAttackFrame();

    this.stateTimer = this.scene.time.delayedCall(BUSHIDO_WARN_MS, () => {
      this.setBossState(BossState.ORC3_BUSHIDO_GUARD);
      this.enterBushidoGuard();
    });
  }

  private enterBushidoGuard(): void {
    if (this.currentState === BossState.DEAD) return;

    this.isGuarding = true;
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);
    this.onBushidoGuard?.(this.x, this.y);

    const fireAndEnd = (rounds: number) => {
      this.isGuarding = false;
      this.onGuardBreak = undefined;
      if (this.currentState === BossState.DEAD) return;
      this.setBossState(BossState.ORC3_BUSHIDO_BURST, { angle: rounds });
      this.enterBushidoBurst(rounds);
    };

    // Guard broken by player hit → immediate 5-round burst
    this.onGuardBreak = () => {
      this.stateTimer?.destroy();
      fireAndEnd(BUSHIDO_HIT_ROUNDS);
    };

    // Guard expires naturally → 1-round burst
    this.stateTimer = this.scene.time.delayedCall(BUSHIDO_GUARD_MS, () => {
      fireAndEnd(BUSHIDO_NOHIT_ROUNDS);
    });
  }

  private enterBushidoBurst(rounds: number): void {
    if (this.currentState === BossState.DEAD) return;
    this.anims.resume();
    this.playDir(`${this.animPrefix}_attack`);
    this.onBushidoBurst?.(this.x, this.y, rounds, this.scaleDmg(BUSHIDO_DMG));
    this.scene.time.delayedCall(rounds * BUSHIDO_ROUND_DELAY + 400, () => this.enterIdle());
  }

  // ── 武士葬 ────────────────────────────────────────────────
  private enterBurialWarn(): void {
    if (this.currentState === BossState.DEAD) return;

    this.onShowKanji?.('葬', this.x, this.y);
    this.setBossState(BossState.ORC3_BURIAL_WARN);

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.holdAttackFrame();

    // Pass warnMs + dmg; game.scene handles arena-aware position generation
    this.onBurial?.(BURIAL_WARN_MS, this.scaleDmg(BURIAL_DMG));

    this.stateTimer = this.scene.time.delayedCall(BURIAL_WARN_MS + BURIAL_COUNT * 50 + 300, () => {
      if (this.currentState === BossState.DEAD) return;
      this.anims.resume();
      this.enterIdle();
    });
  }

  // ── 斬鐵 ──────────────────────────────────────────────────
  private enterIronWarn(presetAngle?: number): void {
    if (this.currentState === BossState.DEAD) return;

    const [px, py] = (this.getIronTarget ?? this.getTargetPos)();
    const angle = presetAngle ?? Phaser.Math.Angle.Between(this.x, this.y, px, py);

    // 前搖根據距離線性內插：近 = 700ms，遠(≥250px) = 250ms
    const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py);
    const warnMs = Math.round(700 - 450 * Math.min(dist / P(250), 1));

    this.onShowKanji?.('鐵', this.x, this.y);
    this.setBossState(BossState.ORC3_IRON_WARN, { angle });

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.holdAttackFrame();
    this.onIronWarn?.(this.x, this.y, angle, warnMs);

    this.stateTimer = this.scene.time.delayedCall(warnMs, () => {
      if (this.currentState === BossState.DEAD) return;
      this.anims.resume();
      this.playDir(`${this.animPrefix}_attack`);
      this.onIronSlash?.(this.x, this.y, angle, this.scaleDmg(IRON_DMG));
      this.scene.time.delayedCall(500, () => this.enterIdle());
    });
  }

  // ── 隱 ────────────────────────────────────────────────────
  private enterVanishWarn(presetX?: number, presetY?: number, presetSkill?: number): void {
    if (this.currentState === BossState.DEAD) return;

    const skillIdx = presetSkill !== undefined
      ? Math.round(presetSkill)
      : Math.floor(Math.random() * 4);

    const [px, py] = this.getTargetPos();
    const a = Math.random() * Math.PI * 2;
    const nx = presetX !== undefined ? presetX : (px + Math.cos(a) * P(VANISH_OFFSET));
    const ny = presetY !== undefined ? presetY : (py + Math.sin(a) * P(VANISH_OFFSET));

    this.onShowKanji?.('隱', this.x, this.y);
    this.setBossState(BossState.ORC3_VANISH, {
      atkX: nx / DPR, atkY: ny / DPR, angle: skillIdx,
    });

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.playDir(`${this.animPrefix}_idle`);

    // 蓄力 → 消失
    this.stateTimer = this.scene.time.delayedCall(VANISH_HOLD_MS, () => {
      if (this.currentState === BossState.DEAD) return;
      this.onVanish?.(this.x, this.y);

      // 傳送
      this.scene.time.delayedCall(VANISH_FADE_MS, () => {
        if (this.currentState === BossState.DEAD) return;
        (this.body as Phaser.Physics.Arcade.Body).reset(nx, ny);

        // 短暫空白後出現
        this.scene.time.delayedCall(VANISH_GAP_MS, () => {
          if (this.currentState === BossState.DEAD) return;
          this.onAppear?.(nx, ny);

          // 等出現特效後放招
          this.scene.time.delayedCall(VANISH_APPEAR_MS, () => {
            if (this.currentState === BossState.DEAD) return;
            this.fireRandomSkill(skillIdx);
          });
        });
      });
    });
  }

  private fireRandomSkill(skillIdx: number): void {
    if      (skillIdx === 0) this.enterOrc3StormWarn();
    else if (skillIdx === 1) this.enterBushidoWarn();
    else if (skillIdx === 2) this.enterBurialWarn();
    else                     this.enterIronWarn();
  }
}
