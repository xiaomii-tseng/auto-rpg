import Phaser from 'phaser';
import { Boss, BossState } from './boss';

const DPR = (window as any).__gameDpr as number;
const P = (n: number): number => Math.round(n * DPR);

const REPEL_RANGE    = Math.round(70 * DPR);
const BLIND_DIST     = Math.round(55 * DPR);

const STORM_DMG      = 45;
const TRACKING_DMG   = 65;
const FAN_DMG        = 55;
const SPIRAL_DMG     = 40;

const STORM_SPEED    = Math.round(160 * DPR);
const TRACKING_SPEED = Math.round(49 * DPR);  // 70 * 0.7
const FAN_SPEED      = Math.round(190 * DPR);
const SPIRAL_SPEED   = Math.round(109 * DPR); // 91 * 1.2

export class BossFlowerOne extends Boss {
  onFirePetal?:   (fromX: number, fromY: number, angle: number, speed: number, dmg: number, blindDist: number, large?: boolean) => void;
  onRepelPlayer?: (bossX: number, bossY: number) => void;

  private repelCooldown = 0;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number,
              element: import('../data/equipment-data').Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    this.idleChaseSpeed = 0;
    this.idleStopRange  = 99999;
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.PETAL_STORM_WARN: this.enterPetalStorm(); break;
      case BossState.TRACKING_WARN:    this.enterTracking();   break;
      case BossState.FAN_WARN:         this.enterFan();        break;
      case BossState.SPIRAL_WARN:      this.enterSpiral();     break;
    }
  }

  override preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);
    if (this.guestMode || this.currentState !== BossState.IDLE) return;
    if (time > this.repelCooldown) {
      const [tx, ty] = this.getTargetPos();
      if (Phaser.Math.Distance.Between(this.x, this.y, tx, ty) < REPEL_RANGE) {
        this.repelCooldown = time + 2500;
        this.doRepel();
      }
    }
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const roll = Math.random();
    let fn: () => void;
    if      (roll < 0.30) fn = () => this.enterPetalStorm();
    else if (roll < 0.55) fn = () => this.enterFan();
    else if (roll < 0.75) fn = () => this.enterTracking();
    else                  fn = () => this.enterSpiral();
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  // ── 花瓣風暴：粉紅立體擴散圈 + 向外箭頭 ─────────────────
  private enterPetalStorm(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.PETAL_STORM_WARN);
    this.playDir(`${this.animPrefix}_attack`);
    if (!this.guestMode)
      this.onSyncState?.({ state: BossState.PETAL_STORM_WARN, x: this.x / DPR, y: this.y / DPR });

    const WARN_MS = 800;
    const warnG   = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(this.depth + 1);
    const arrowCount = 8;
    let t = 0;

    const warnTimer = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        t += 16;
        const prog  = Math.min(t / WARN_MS, 1);
        const pulse = Math.sin(t * 0.03) * 0.2 + 0.8;
        warnG.clear();
        warnG.setPosition(this.x, this.y);

        const ringR = P(14) + prog * P(42);

        // Outer glow ring (thick, dark)
        warnG.lineStyle(P(7), 0x990055, 0.22 * pulse);
        warnG.strokeCircle(0, 0, ringR);
        // Mid ring
        warnG.lineStyle(P(3.5), 0xff44aa, (0.45 + prog * 0.35) * pulse);
        warnG.strokeCircle(0, 0, ringR);
        // Inner bright ring (highlight)
        warnG.lineStyle(P(1.5), 0xffccee, (0.3 + prog * 0.5) * pulse);
        warnG.strokeCircle(0, 0, ringR - P(1.5));
        // Soft fill
        warnG.fillStyle(0xff44aa, (0.05 + prog * 0.08) * pulse);
        warnG.fillCircle(0, 0, ringR);

        // Outward arrows — 3D look: dark shadow + bright fill + highlight edge
        const arrowDist = ringR + P(3);
        const arrowLen  = P(7) + prog * P(11);
        const hw        = P(3) + prog * P(2);
        for (let i = 0; i < arrowCount; i++) {
          const a    = (i / arrowCount) * Math.PI * 2;
          const perp = a + Math.PI / 2;
          const tip  = { x: Math.cos(a) * (arrowDist + arrowLen), y: Math.sin(a) * (arrowDist + arrowLen) };
          const bl   = { x: Math.cos(a) * arrowDist + Math.cos(perp) * hw,  y: Math.sin(a) * arrowDist + Math.sin(perp) * hw };
          const br   = { x: Math.cos(a) * arrowDist - Math.cos(perp) * hw,  y: Math.sin(a) * arrowDist - Math.sin(perp) * hw };
          // Shadow
          warnG.fillStyle(0x660033, 0.55 * pulse);
          warnG.fillTriangle(tip.x + P(1), tip.y + P(1), bl.x + P(1), bl.y + P(1), br.x + P(1), br.y + P(1));
          // Dark face
          warnG.fillStyle(0xcc2288, (0.7 + prog * 0.3) * pulse);
          warnG.fillTriangle(tip.x, tip.y, br.x, br.y, bl.x, bl.y);
          // Bright face (left half)
          warnG.fillStyle(0xff88cc, (0.6 + prog * 0.35) * pulse);
          warnG.fillTriangle(tip.x, tip.y, bl.x, bl.y,
            (Math.cos(a) * arrowDist), (Math.sin(a) * arrowDist));
          // Highlight edge
          warnG.lineStyle(P(1), 0xffddee, 0.5 * pulse);
          warnG.beginPath();
          warnG.moveTo(bl.x, bl.y);
          warnG.lineTo(tip.x, tip.y);
          warnG.strokePath();
        }
      },
    });

    this.stateTimer = this.scene.time.delayedCall(WARN_MS, () => {
      warnTimer.destroy();
      warnG.destroy();
      const count = 16;
      for (let i = 0; i < count; i++)
        this.onFirePetal?.(this.x, this.y, (i / count) * Math.PI * 2, STORM_SPEED, this.scaleDmg(STORM_DMG), BLIND_DIST);
      this.scene.time.delayedCall(200, () => {
        if (this.currentState === BossState.DEAD) return;
        for (let i = 0; i < count; i++)
          this.onFirePetal?.(this.x, this.y, (i / count) * Math.PI * 2, STORM_SPEED, this.scaleDmg(STORM_DMG), BLIND_DIST);
        this.scene.cameras.main.shake(120, 0.008);
        this.stateTimer = this.scene.time.delayedCall(400, () => this.enterIdle());
      });
    });
  }

  // ── 追蹤花瓣：深紅立體鎖定準心 ──────────────────────────
  private enterTracking(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.TRACKING_WARN);
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
    if (!this.guestMode)
      this.onSyncState?.({ state: BossState.TRACKING_WARN, x: this.x / DPR, y: this.y / DPR,
        atkX: tx / DPR, atkY: ty / DPR });

    const WARN_MS = 800;
    const bossG   = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(this.depth + 1);
    const targG   = this.scene.add.graphics().setDepth(6);
    let t = 0;

    const warnTimer = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        t += 16;
        const prog  = Math.min(t / WARN_MS, 1);
        const pulse = Math.sin(t * 0.028) * 0.25 + 0.75;

        // Boss — layered red glow (立體感：外暈 → 中環 → 高光)
        bossG.clear();
        bossG.setPosition(this.x, this.y);
        bossG.fillStyle(0x880022, 0.2 * pulse);
        bossG.fillCircle(0, 0, P(30));
        bossG.lineStyle(P(6), 0xaa0033, 0.25 * pulse);
        bossG.strokeCircle(0, 0, P(22));
        bossG.lineStyle(P(2.5), 0xff2244, 0.75 * pulse);
        bossG.strokeCircle(0, 0, P(22));
        bossG.lineStyle(P(1), 0xff99aa, 0.45 * pulse);
        bossG.strokeCircle(0, 0, P(20));

        // Target at player — 4 closing L-brackets + crosshair + rings
        const [px, py] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
        targG.clear();

        const outerR = P(26);
        const innerR = P(8) + (1 - prog) * P(14);  // shrinks

        // Outer glow ring
        targG.lineStyle(P(5), 0x880022, 0.3 * pulse);
        targG.strokeCircle(px, py, outerR);
        // Outer ring
        targG.lineStyle(P(2), 0xff2244, 0.6 * pulse);
        targG.strokeCircle(px, py, outerR);
        // Inner ring (closing in)
        targG.lineStyle(P(5), 0x880022, 0.25 * pulse);
        targG.strokeCircle(px, py, innerR);
        targG.lineStyle(P(2), 0xff4466, 0.8 * pulse);
        targG.strokeCircle(px, py, innerR);
        // Highlight on rings
        targG.lineStyle(P(1), 0xffaabb, 0.4 * pulse);
        targG.strokeCircle(px, py, outerR - P(1));

        // 4 L-shaped corner brackets (closing inward)
        const bSize = P(8) + (1 - prog) * P(6);
        const bDist = outerR * 0.72;
        for (let q = 0; q < 4; q++) {
          const sign = [{ sx: 1, sy: 1 }, { sx: -1, sy: 1 }, { sx: -1, sy: -1 }, { sx: 1, sy: -1 }][q];
          const bx = px + sign.sx * bDist * 0.7;
          const by = py + sign.sy * bDist * 0.7;
          targG.lineStyle(P(2), 0xff2244, 0.85 * pulse);
          targG.beginPath();
          targG.moveTo(bx, by - sign.sy * bSize);
          targG.lineTo(bx, by);
          targG.lineTo(bx + sign.sx * bSize, by);
          targG.strokePath();
        }

        // Crosshair
        const cL = P(18);
        targG.lineStyle(P(1.5), 0xff2244, 0.7 * pulse);
        targG.lineBetween(px - cL, py, px - P(5), py);
        targG.lineBetween(px + P(5), py, px + cL, py);
        targG.lineBetween(px, py - cL, px, py - P(5));
        targG.lineBetween(px, py + P(5), px, py + cL);

        // Center fill — grows brighter
        targG.fillStyle(0xff2244, (0.3 + prog * 0.5) * pulse);
        targG.fillCircle(px, py, P(3) + prog * P(2));
        targG.lineStyle(P(1), 0xff99aa, 0.5 * pulse);
        targG.strokeCircle(px, py, P(3) + prog * P(2));
      },
    });

    this.stateTimer = this.scene.time.delayedCall(WARN_MS, () => {
      warnTimer.destroy();
      bossG.destroy();
      targG.destroy();
      if (this.currentState === BossState.DEAD) return;
      const [ttx, tty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
      const angle = Phaser.Math.Angle.Between(this.x, this.y, ttx, tty);
      this.onFirePetal?.(this.x, this.y, angle, TRACKING_SPEED, this.scaleDmg(TRACKING_DMG), -1, true);
      this.stateTimer = this.scene.time.delayedCall(800, () => this.enterIdle());
    });
  }

  // ── 扇形齊射：橙色立體扇形（乾淨無多餘圓圈）────────────
  private enterFan(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.FAN_WARN);
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
    if (!this.guestMode)
      this.onSyncState?.({ state: BossState.FAN_WARN, x: this.x / DPR, y: this.y / DPR,
        atkX: tx / DPR, atkY: ty / DPR });

    const baseAngle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    const fanHalf   = 0.28;
    const fanCount  = 9;
    const WARN_MS   = 700;

    const warnG = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(8);
    let warnT = 0;

    const warnTimer = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        warnT += 16;
        const prog  = Math.min(warnT / WARN_MS, 1);
        const pulse = Math.sin(warnT * 0.02) * 0.2 + 0.8;
        warnG.clear();
        warnG.setPosition(this.x, this.y);

        const rayLen = P(75) + prog * P(45);

        // Background fill — filled triangle fan (no slice)
        const lx = Math.cos(baseAngle - fanHalf) * rayLen;
        const ly = Math.sin(baseAngle - fanHalf) * rayLen;
        const rx = Math.cos(baseAngle + fanHalf) * rayLen;
        const ry = Math.sin(baseAngle + fanHalf) * rayLen;
        warnG.fillStyle(0xff6600, (0.06 + prog * 0.09) * pulse);
        warnG.fillTriangle(0, 0, lx, ly, rx, ry);

        // Fan rays with depth: outer glow + main line
        for (let i = 1; i < fanCount - 1; i++) {
          const a = baseAngle - fanHalf + (i / (fanCount - 1)) * fanHalf * 2;
          warnG.lineStyle(P(3), 0xcc4400, 0.18 * pulse);
          warnG.beginPath(); warnG.moveTo(0, 0);
          warnG.lineTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
          warnG.strokePath();
          warnG.lineStyle(P(1.5), 0xffaa00, 0.45 * pulse);
          warnG.beginPath(); warnG.moveTo(0, 0);
          warnG.lineTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
          warnG.strokePath();
        }

        // Boundary lines — 3 layers (shadow / main / highlight)
        for (const ba of [baseAngle - fanHalf, baseAngle + fanHalf]) {
          const ex = Math.cos(ba) * rayLen, ey = Math.sin(ba) * rayLen;
          warnG.lineStyle(P(5), 0x882200, 0.3 * pulse);
          warnG.lineBetween(0, 0, ex + P(1), ey + P(1));
          warnG.lineStyle(P(3), 0xff6600, 0.85 * pulse);
          warnG.lineBetween(0, 0, ex, ey);
          warnG.lineStyle(P(1), 0xffcc88, 0.5 * pulse);
          warnG.lineBetween(0, 0, ex, ey);
        }

        // Arc at tip connecting the two edges
        warnG.lineStyle(P(3), 0xff6600, 0.7 * pulse);
        warnG.beginPath();
        const arcSteps = 12;
        for (let s = 0; s <= arcSteps; s++) {
          const a = baseAngle - fanHalf + (s / arcSteps) * fanHalf * 2;
          if (s === 0) warnG.moveTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
          else         warnG.lineTo(Math.cos(a) * rayLen, Math.sin(a) * rayLen);
        }
        warnG.strokePath();
        // Highlight on arc
        warnG.lineStyle(P(1), 0xffdd88, 0.5 * pulse);
        warnG.beginPath();
        for (let s = 0; s <= arcSteps; s++) {
          const a = baseAngle - fanHalf + (s / arcSteps) * fanHalf * 2;
          if (s === 0) warnG.moveTo(Math.cos(a) * (rayLen - P(1)), Math.sin(a) * (rayLen - P(1)));
          else         warnG.lineTo(Math.cos(a) * (rayLen - P(1)), Math.sin(a) * (rayLen - P(1)));
        }
        warnG.strokePath();

        // Arrowhead at center ray tip
        const tipX = Math.cos(baseAngle) * (rayLen + P(6));
        const tipY = Math.sin(baseAngle) * (rayLen + P(6));
        const perp  = baseAngle + Math.PI / 2;
        const hw    = P(5);
        const base2 = { x: Math.cos(baseAngle) * rayLen, y: Math.sin(baseAngle) * rayLen };
        warnG.fillStyle(0x882200, 0.5 * pulse);
        warnG.fillTriangle(tipX + P(1), tipY + P(1),
          base2.x + Math.cos(perp) * hw + P(1), base2.y + Math.sin(perp) * hw + P(1),
          base2.x - Math.cos(perp) * hw + P(1), base2.y - Math.sin(perp) * hw + P(1));
        warnG.fillStyle(0xff8800, 0.9 * pulse);
        warnG.fillTriangle(tipX, tipY,
          base2.x + Math.cos(perp) * hw, base2.y + Math.sin(perp) * hw,
          base2.x - Math.cos(perp) * hw, base2.y - Math.sin(perp) * hw);
        warnG.lineStyle(P(1), 0xffcc44, 0.6 * pulse);
        warnG.beginPath();
        warnG.moveTo(base2.x + Math.cos(perp) * hw, base2.y + Math.sin(perp) * hw);
        warnG.lineTo(tipX, tipY);
        warnG.strokePath();
      },
    });

    this.stateTimer = this.scene.time.delayedCall(WARN_MS, () => {
      warnTimer.destroy();
      warnG.destroy();
      for (let i = 0; i < fanCount; i++) {
        const a = baseAngle - fanHalf + (i / (fanCount - 1)) * fanHalf * 2;
        this.onFirePetal?.(this.x, this.y, a, FAN_SPEED, this.scaleDmg(FAN_DMG), BLIND_DIST);
      }
      this.scene.cameras.main.shake(80, 0.005);
      this.stateTimer = this.scene.time.delayedCall(350, () => this.enterIdle());
    });
  }

  // ── 螺旋彈幕：黃綠立體旋轉弧形箭頭 ──────────────────────
  private enterSpiral(): void {
    if (this.currentState === BossState.DEAD) return;
    this.stateTimer?.destroy();
    this.pulseTween?.stop();
    this.setBossState(BossState.SPIRAL_WARN);
    this.playDir(`${this.animPrefix}_attack`);

    const [tx, ty] = this.guestMode ? [this.guestAtkX, this.guestAtkY] : this.getTargetPos();
    const startAngle = this.guestMode
      ? this.guestAngle
      : Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
    if (!this.guestMode)
      this.onSyncState?.({ state: BossState.SPIRAL_WARN, x: this.x / DPR, y: this.y / DPR,
        angle: startAngle });

    const PRE_MS = 600;
    const spinG  = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(this.depth + 1);
    let spinT = 0;

    const spinTimer = this.scene.time.addEvent({
      delay: 16, loop: true, callback: () => {
        spinT += 16;
        const prog     = Math.min(spinT / PRE_MS, 1);
        const rotation = spinT * 0.005;
        const pulse    = Math.sin(spinT * 0.025) * 0.2 + 0.8;
        spinG.clear();
        spinG.setPosition(this.x, this.y);

        const radii = [P(14), P(22), P(30)];
        radii.forEach((r, ring) => {
          const arcLen = (0.35 + prog * 0.45) * Math.PI;
          const aStart = rotation + ring * (Math.PI * 2 / 3);
          const aEnd   = aStart + arcLen;
          const alpha  = (0.4 + prog * 0.5) * pulse;
          const steps  = 18;

          // Outer glow
          spinG.lineStyle(P(5), 0x336600, 0.22 * alpha);
          spinG.beginPath();
          for (let s = 0; s <= steps; s++) {
            const a = aStart + (s / steps) * (aEnd - aStart);
            s === 0 ? spinG.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                    : spinG.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          spinG.strokePath();

          // Main arc
          spinG.lineStyle(P(2.5), 0x88ee44, alpha);
          spinG.beginPath();
          for (let s = 0; s <= steps; s++) {
            const a = aStart + (s / steps) * (aEnd - aStart);
            s === 0 ? spinG.moveTo(Math.cos(a) * r, Math.sin(a) * r)
                    : spinG.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          spinG.strokePath();

          // Highlight (inner edge of arc)
          spinG.lineStyle(P(1), 0xccff88, 0.5 * alpha);
          spinG.beginPath();
          for (let s = 0; s <= steps; s++) {
            const a = aStart + (s / steps) * (aEnd - aStart);
            const ri = r - P(1);
            s === 0 ? spinG.moveTo(Math.cos(a) * ri, Math.sin(a) * ri)
                    : spinG.lineTo(Math.cos(a) * ri, Math.sin(a) * ri);
          }
          spinG.strokePath();

          // Arrowhead at tip — shadow + fill + highlight
          const tipA  = aEnd;
          const perpA = tipA + Math.PI / 2;
          const tipX  = Math.cos(tipA) * r, tipY = Math.sin(tipA) * r;
          const hw = P(3.5);
          spinG.fillStyle(0x224400, 0.55 * alpha);
          spinG.fillTriangle(
            tipX + Math.cos(tipA) * P(6) + P(1), tipY + Math.sin(tipA) * P(6) + P(1),
            tipX + Math.cos(perpA) * hw + P(1),   tipY + Math.sin(perpA) * hw + P(1),
            tipX - Math.cos(perpA) * hw + P(1),   tipY - Math.sin(perpA) * hw + P(1));
          spinG.fillStyle(0x88ee44, alpha);
          spinG.fillTriangle(
            tipX + Math.cos(tipA) * P(6), tipY + Math.sin(tipA) * P(6),
            tipX + Math.cos(perpA) * hw,  tipY + Math.sin(perpA) * hw,
            tipX - Math.cos(perpA) * hw,  tipY - Math.sin(perpA) * hw);
          spinG.lineStyle(P(1), 0xccff88, 0.55 * alpha);
          spinG.beginPath();
          spinG.moveTo(tipX + Math.cos(perpA) * hw, tipY + Math.sin(perpA) * hw);
          spinG.lineTo(tipX + Math.cos(tipA) * P(6), tipY + Math.sin(tipA) * P(6));
          spinG.strokePath();
        });
      },
    });

    this.scene.time.delayedCall(PRE_MS, () => {
      spinTimer.destroy();
      spinG.destroy();
      const totalShots = 32;
      const interval   = 250;
      const rotPerShot = (Math.PI * 2 * 1.5) / totalShots;
      for (let i = 0; i < totalShots; i++) {
        this.scene.time.delayedCall(i * interval, () => {
          if (this.currentState === BossState.DEAD) return;
          this.onFirePetal?.(this.x, this.y, startAngle + i * rotPerShot, SPIRAL_SPEED, this.scaleDmg(SPIRAL_DMG), BLIND_DIST);
        });
      }
      this.stateTimer = this.scene.time.delayedCall(totalShots * interval + 300, () => this.enterIdle());
    });
  }

  // ── 近身驅趕：無傷害，推開玩家 ──────────────────────────
  private doRepel(): void {
    this.scene.cameras.main.shake(150, 0.012);
    this.onRepelPlayer?.(this.x, this.y);

    const burst = this.scene.add.graphics({ x: this.x, y: this.y }).setDepth(this.depth + 2);
    burst.lineStyle(P(4), 0xff44cc, 0.9);
    burst.strokeCircle(0, 0, P(20));
    this.scene.tweens.add({
      targets: burst, scaleX: 3.5, scaleY: 3.5, alpha: 0, duration: 400,
      ease: 'Quad.Out', onComplete: () => burst.destroy(),
    });
  }
}
