import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);

const BLOSSOM_DMG = 85;
const MIST_DMG    = 90;  // per hit (350ms check)
const VINE_DMG    = 70;  // per 500ms tick
const BURST_DMG   = 75;  // on projectile hit

const BLOSSOM_R  = Math.round(65 * DPR);
const MIST_RANGE = Math.round(550 * DPR);  // 毒霧球飄行距離
const VINE_LEN   = Math.round(650 * DPR);
const VINE_W     = Math.round(18 * DPR);
const BURST_DIST = Math.round(90 * DPR);
const BURST_R    = Math.round(45 * DPR);

export class BossFlowerTwo extends Boss {
  onPlaceBuds?:   (positions: { x: number; y: number }[], dmg: number, r: number, zoneDur: number) => void;
  onSprayMist?:   (fromX: number, fromY: number, angle: number, range: number, dmg: number) => void;
  onSpawnVines?:  (fromX: number, fromY: number, len: number, w: number, dmg: number, baseAngle: number, count: number) => void;
  onPoisonBurst?: (fromX: number, fromY: number, dist: number, r: number, dmg: number, count: number) => void;

  private get isPhase2(): boolean { return this.questStar >= 3 && this.currentHp / this.maxHpValue < 0.40; }

  private attackCount = 0;
  private burrowAfter = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number,
              element: import('../data/equipment-data').Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    this.idleChaseSpeed = 0;
    this.idleStopRange  = 99999;
    this.burrowAfter    = Phaser.Math.Between(2, 5);
  }

  override takeDamage(amount: number, penetration = 0): void {
    if (this.currentState === BossState.BURROW) return;
    super.takeDamage(amount, penetration);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.BLOSSOM_WARN: this.enterBlossom(); break;
      case BossState.MIST_WARN:    this.enterMist();    break;
      case BossState.VINE_WARN:    this.enterVine();    break;
      case BossState.BURST_WARN:   this.enterBurst();   break;
      case BossState.BURROW:       this.doBurrow();     break;
    }
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    this.attackCount++;
    if (this.attackCount >= this.burrowAfter) {
      this.attackCount = 0;
      this.burrowAfter = Phaser.Math.Between(2, 5);
      // 遁地使用較短間距（不算完整 CD）
      this.stateTimer = this.scene.time.delayedCall(
        Phaser.Math.Between(600, 1000), () => this.doBurrow(),
      );
      return;
    }
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.25) fn = () => this.enterBlossom();
    else if (roll < 0.50) fn = () => this.enterMist();
    else if (roll < 0.75) fn = () => this.enterVine();
    else                  fn = () => this.enterBurst();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 炸裂花苞 ─────────────────────────────────────────────
  private enterBlossom(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const PRE_MS   = 800;
    const ZONE_MS  = 2000;   // 倒數 2 秒爆炸
    const safeR    = this.arenaRadius * DPR * 0.78;
    const pad      = P(50);
    const budCount = this.isPhase2 ? 20 : 10;

    // Guest uses synced positions; host generates and syncs them
    const positions: { x: number; y: number }[] = this.guestMode
      ? this.guestPts
      : (() => {
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i < budCount; i++) {
            const a = Math.random() * Math.PI * 2;
            const d = Phaser.Math.FloatBetween(safeR * 0.08, safeR);
            const [nx, ny] = this.clampToArena(
              this.arenaCenter.x + Math.cos(a) * d,
              this.arenaCenter.y + Math.sin(a) * d,
              pad,
            );
            pts.push({ x: nx, y: ny });
          }
          return pts;
        })();

    this.setBossState(BossState.BLOSSOM_WARN, { pts: positions.map(p => ({ x: p.x / DPR, y: p.y / DPR })) });

    // 前搖：所有目標出現綠色脈衝警示圈
    const g = this.warningGfx;
    g.clear();
    let t = 0;
    const animTimer = this.scene.time.addEvent({
      delay: 30, repeat: Math.ceil(PRE_MS / 30),
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); g.clear(); return; }
        t = Math.min(t + 30 / PRE_MS, 1);
        g.clear();
        positions.forEach(p => {
          const pulse = 0.75 + Math.sin(t * Math.PI * 5) * 0.18;
          g.fillStyle(0x22ff44, 0.10 * t);
          g.fillCircle(p.x, p.y, BLOSSOM_R * pulse);
          g.lineStyle(P(2), 0x55ff55, 0.9 * t);
          g.strokeCircle(p.x, p.y, BLOSSOM_R * 0.78 * pulse);
          g.fillStyle(0xffffff, t);
          g.fillCircle(p.x, p.y, P(3));
        });
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      if (this.currentState === BossState.DEAD) return;
      animTimer.destroy(); g.clear();
      this.onPlaceBuds?.(positions, this.scaleDmg(BLOSSOM_DMG), BLOSSOM_R, ZONE_MS);
      this.enterIdle();
    });
  }

  // ── 毒霧噴灑 ─────────────────────────────────────────────
  private enterMist(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const angle = this.guestMode
      ? this.guestAngle
      : (() => { const [tx, ty] = this.getTargetPos(); return Phaser.Math.Angle.Between(this.x, this.y, tx, ty); })();
    this.setBossState(BossState.MIST_WARN, { angle });

    const PRE_MS = 900;
    const g = this.warningGfx;
    g.clear();

    // 前搖：一條直線從 Boss 往玩家方向延伸，帶箭頭
    let t = 0;
    const animTimer = this.scene.time.addEvent({
      delay: 25, repeat: Math.ceil(PRE_MS / 25),
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); g.clear(); return; }
        t = Math.min(t + 25 / PRE_MS, 1);
        g.clear();

        const lineLen = MIST_RANGE * Math.min(t * 1.4, 1);
        const ax = this.x + Math.cos(angle) * lineLen;
        const ay = this.y + Math.sin(angle) * lineLen;
        g.lineStyle(P(3), 0xeeff44, 0.85 * t);
        g.lineBetween(this.x, this.y, ax, ay);
        const hs = P(9) * Math.min(t * 2, 1);
        g.fillStyle(0xeeff44, 0.9 * t);
        g.fillTriangle(
          ax + Math.cos(angle) * hs,              ay + Math.sin(angle) * hs,
          ax + Math.cos(angle + 2.4) * hs * 0.55, ay + Math.sin(angle + 2.4) * hs * 0.55,
          ax + Math.cos(angle - 2.4) * hs * 0.55, ay + Math.sin(angle - 2.4) * hs * 0.55,
        );
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      if (this.currentState === BossState.DEAD) return;
      animTimer.destroy(); g.clear();
      this.onSprayMist?.(this.x, this.y, angle, MIST_RANGE, this.scaleDmg(MIST_DMG));
      if (this.isPhase2)
        this.onSprayMist?.(this.x, this.y, angle + Phaser.Math.DegToRad(12), MIST_RANGE, this.scaleDmg(MIST_DMG));
      this.scene.time.delayedCall(300, () => {
        if (this.currentState === BossState.DEAD) return;
        this.enterIdle();
      });
    });
  }

  // ── 藤蔓封路 ─────────────────────────────────────────────
  private enterVine(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.playDir(`${this.animPrefix}_attack`);

    const PRE_MS    = 800;
    const vineCount = this.isPhase2 ? 5 : 4;
    const baseAngle = this.guestMode
      ? this.guestAngle
      : Math.random() * (Math.PI * 2 / vineCount);
    this.setBossState(BossState.VINE_WARN, { angle: baseAngle });
    const dirs      = Array.from({ length: vineCount }, (_, i) => baseAngle + i * (Math.PI * 2 / vineCount));
    const g         = this.warningGfx;
    g.clear();

    // 前搖：藤蔓往外生長
    let growLen = 0;
    const animTimer = this.scene.time.addEvent({
      delay: 20, repeat: Math.ceil(PRE_MS / 20),
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); g.clear(); return; }
        growLen = Math.min(growLen + VINE_LEN * 20 / PRE_MS, VINE_LEN);
        g.clear();
        dirs.forEach(a => {
          const ex = this.x + Math.cos(a) * growLen;
          const ey = this.y + Math.sin(a) * growLen;
          g.lineStyle(P(7), 0x113300, 0.6);
          g.lineBetween(this.x, this.y, ex + Math.cos(a + Math.PI / 2) * P(2), ey + Math.sin(a + Math.PI / 2) * P(2));
          g.lineStyle(P(4), 0x33cc11, 0.9);
          g.lineBetween(this.x, this.y, ex, ey);
          g.lineStyle(P(1.5), 0xaaffaa, 0.5);
          g.lineBetween(this.x, this.y, ex - Math.cos(a + Math.PI / 2) * P(1), ey - Math.sin(a + Math.PI / 2) * P(1));
          if (growLen > P(30)) {
            g.fillStyle(0x88ff33, 0.95);
            g.fillTriangle(
              ex + Math.cos(a) * P(8),               ey + Math.sin(a) * P(8),
              ex + Math.cos(a + Math.PI / 2) * P(6), ey + Math.sin(a + Math.PI / 2) * P(6),
              ex + Math.cos(a - Math.PI / 2) * P(6), ey + Math.sin(a - Math.PI / 2) * P(6),
            );
          }
        });
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      if (this.currentState === BossState.DEAD) return;
      animTimer.destroy(); g.clear();
      this.onSpawnVines?.(this.x, this.y, VINE_LEN, VINE_W, this.scaleDmg(VINE_DMG), baseAngle, vineCount);
      this.enterIdle();
    });
  }

  // ── 毒域爆發 ─────────────────────────────────────────────
  private enterBurst(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.BURST_WARN, {});
    this.playDir(`${this.animPrefix}_attack`);

    const PRE_MS    = 900;
    const burstCount = this.isPhase2 ? 12 : 8;
    const g = this.warningGfx;
    g.clear();
    let t = 0;

    // 前搖：毒素粒子從外圍螺旋聚向 Boss 蓄力，後半蓄力圈 + N 道射線
    const animTimer = this.scene.time.addEvent({
      delay: 20, repeat: Math.ceil(PRE_MS / 20),
      callback: () => {
        if (this.currentState === BossState.DEAD) { animTimer.destroy(); g.clear(); return; }
        t = Math.min(t + 20 / PRE_MS, 1);
        g.clear();

        if (t < 0.65) {
          // 粒子螺旋聚集
          const inT = t / 0.65;
          for (let i = 0; i < burstCount; i++) {
            const base = (i / burstCount) * Math.PI * 2;
            const sAngle = base + inT * Math.PI * 1.5;
            const sr     = BURST_DIST * (1 - inT * 0.9);
            const px     = this.x + Math.cos(sAngle) * sr;
            const py     = this.y + Math.sin(sAngle) * sr;
            // 拖尾
            for (let tr = 1; tr <= 3; tr++) {
              const ta = sAngle - tr * 0.18;
              const tR = sr + tr * BURST_DIST * 0.05;
              g.fillStyle(0x44ff44, (0.5 - tr * 0.13) * (1 - inT * 0.4));
              g.fillCircle(this.x + Math.cos(ta) * tR, this.y + Math.sin(ta) * tR, P(3 - tr * 0.6));
            }
            // 主粒子
            g.fillStyle(inT > 0.7 ? 0xeeff22 : 0x88ff44, 0.9);
            g.fillCircle(px, py, P(4 + inT * 2));
            g.lineStyle(P(1), 0xccff44, 0.6);
            g.strokeCircle(px, py, P(6 + inT * 2));
          }
        } else {
          // 蓄力完成：中心脈衝 + N 道向外衝的射線
          const bT      = (t - 0.65) / 0.35;
          const nRays   = burstCount;
          const pulseR  = P(10) + Math.sin(bT * Math.PI * 8) * P(4);
          g.fillStyle(0xccff22, 0.9);
          g.fillCircle(this.x, this.y, pulseR);
          g.fillStyle(0xffffff, 0.7 * bT);
          g.fillCircle(this.x, this.y, pulseR * 0.5);
          const rayLen = BURST_DIST * bT;
          for (let i = 0; i < nRays; i++) {
            const a  = (i / nRays) * Math.PI * 2;
            const ex = this.x + Math.cos(a) * rayLen;
            const ey = this.y + Math.sin(a) * rayLen;
            g.lineStyle(P(2.5), 0xaaff44, 0.85 * bT);
            g.lineBetween(this.x, this.y, ex, ey);
            if (rayLen > P(15)) {
              g.fillStyle(0xeeff22, bT);
              g.fillTriangle(
                ex + Math.cos(a) * P(8),                   ey + Math.sin(a) * P(8),
                ex + Math.cos(a + Math.PI / 2) * P(5),     ey + Math.sin(a + Math.PI / 2) * P(5),
                ex + Math.cos(a - Math.PI / 2) * P(5),     ey + Math.sin(a - Math.PI / 2) * P(5),
              );
            }
          }
        }
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      if (this.currentState === BossState.DEAD) return;
      animTimer.destroy();
      g.clear();
      this.onPoisonBurst?.(this.x, this.y, BURST_DIST, BURST_R, this.scaleDmg(BURST_DMG), burstCount);
      this.scene.time.delayedCall(300, () => {
        if (this.currentState === BossState.DEAD) return;
        this.enterIdle();
      });
    });
  }

  // ── 遁地 ─────────────────────────────────────────────────
  private doBurrow(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.BURROW, {});
    this.warningGfx.clear();
    (this.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    const deathKey = `${this.animPrefix}_death_down`;

    // 冒出地面並回到 idle
    const emerge = () => {
      if (this.currentState === BossState.DEAD) return;
      this.setVisible(true);
      this.anims.playReverse(deathKey);

      let emerged = false;
      const onEmerged = () => {
        if (emerged || this.currentState === BossState.DEAD) return;
        emerged = true;
        this.enterIdle();
      };
      this.once(`animationcomplete-${deathKey}`, onEmerged);
      // 安全計時：若 hurt 動畫中斷冒出動畫，仍能繼續行動
      this.scene.time.delayedCall(1400, () => {
        if (!emerged && this.currentState === BossState.BURROW) onEmerged();
      });
    };

    // 隱形、傳送（Guest 只隱形，位置由 POS sync 更新）
    const teleport = () => {
      if (this.currentState === BossState.DEAD) return;
      this.setVisible(false);
      if (!this.guestMode) {
        const safeR    = this.arenaRadius * DPR * 0.55;
        const a        = Math.random() * Math.PI * 2;
        const dist     = Phaser.Math.FloatBetween(safeR * 0.15, safeR);
        const [nx, ny] = this.clampToArena(
          this.arenaCenter.x + Math.cos(a) * dist,
          this.arenaCenter.y + Math.sin(a) * dist,
          P(60),
        );
        this.setPosition(nx, ny);
        (this.body as Phaser.Physics.Arcade.Body).reset(nx, ny);
      }
      this.scene.time.delayedCall(350, emerge);
    };

    // 播死亡動畫（鑽地）
    this.play(deathKey, true);
    let sunk = false;
    const onSunk = () => {
      if (sunk || this.currentState === BossState.DEAD) return;
      sunk = true;
      teleport();
    };
    this.once(`animationcomplete-${deathKey}`, onSunk);
    // 安全計時：若 hurt 動畫中斷鑽地動畫，仍能完成傳送
    this.scene.time.delayedCall(1400, () => {
      if (!sunk && this.currentState === BossState.BURROW) onSunk();
    });
  }

  protected override enterIdle(): void {
    super.enterIdle();
    // 植物系沒有 walk 動畫，強制換回 idle
    this.play(`${this.animPrefix}_idle_down`, true);
  }
}
