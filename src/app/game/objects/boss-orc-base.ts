import Phaser from 'phaser';
import { Boss } from './boss';

const DPR = (window as any).__gameDpr as number;

const CHARGE_DIST_THRESHOLD = Math.round(145 * DPR);
const CHARGE_WARN_MS        = 250;
const CHARGE_COOLDOWN_MS    = 6000;

export abstract class BossOrcBase extends Boss {
  private _chargeAvailableAt = 0;

  // 玩家距離過遠且冷卻結束 → 50% 機率強衝並回傳 true，否則回傳 false
  protected tryChargeIfFar(): boolean {
    const [px, py] = this.getTargetPos();
    const dist = Phaser.Math.Distance.Between(this.x, this.y, px, py);
    if (dist > CHARGE_DIST_THRESHOLD && this.scene.time.now >= this._chargeAvailableAt && Math.random() < 0.5) {
      this._chargeAvailableAt = this.scene.time.now + CHARGE_COOLDOWN_MS;
      this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), () => this.enterQuickDashWarn(CHARGE_WARN_MS));
      return true;
    }
    return false;
  }
}
