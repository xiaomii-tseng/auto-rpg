import Phaser from 'phaser';
import { BossVampire1 } from './boss-vampire1';
import { BossVampire2 } from './boss-vampire2';
import { BossVampire3 } from './boss-vampire3';
import type { Element } from '../data/equipment-data';

const _SKIP = new Set(['constructor', 'applyUniqueState', 'pickNextAttack']);
const _mixin = (Target: any, Source: any) =>
  Object.getOwnPropertyNames(Source.prototype)
    .filter(m => !_SKIP.has(m) && !(m in Target.prototype))
    .forEach(m => { Target.prototype[m] = Source.prototype[m]; });

export class BossVampireLegendary extends BossVampire3 {
  // V1 callbacks
  getAllTargetPositions?: () => [number, number][];
  onBatHit?:             (x: number, y: number, r: number, dmg: number) => void;
  onCrimsonNeedle?:      (x: number, y: number, r: number, dmg: number) => void;
  onNeedleLand?:         (x: number, y: number, r: number, dmg: number) => void;
  onGazeHit?:            (bx: number, by: number, tx: number, ty: number, r: number, dmg: number) => void;
  onDarkNightActivate?:  (zones: { x: number; y: number; r: number }[]) => void;
  onDarkNightLift?:      () => void;
  onDarkNightPunish?:    () => void;
  onNeedleHit?:          (x: number, y: number, r: number, dmg: number) => void;
  // V2 callbacks
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

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    (this as any)._elCollapseTriggered = false;
    (this as any)._iceDomainActive     = false;
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    if (this.currentHp / this.maxHpValue <= 0.30 && !(this as any)._elCollapseTriggered) {
      this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), () => {
        (this as any).enterElCollapseWarn();
      });
      return;
    }
    const attacks: Array<() => void> = [
      () => (this as any).enterBatStormWarn(),
      () => (this as any).enterCrimsonRainWarn(),
      () => (this as any).enterGazeWarn(),
      () => (this as any).enterDarkNightWarn(),
      () => (this as any).enterNeedleBarrageWarn(),
      () => (this as any).enterMeteorRainWarn(),
      () => (this as any).enterCometWarn(),
      () => (this as any).enterLightningChain(),
      () => (this as any).enterIceDomain(),
      () => (this as any).enterTornadoStorm(),
      () => (this as any).enterScytheWarn(),
      () => (this as any).enterBurstWarn(),
      () => (this as any).enterSpikeHellWarn(),
      () => (this as any).enterBloodRiverWarn(),
    ];
    if (!this._splitActive) attacks.push(() => (this as any).enterBloodSplitWarn());
    const fn = attacks[Math.floor(Math.random() * attacks.length)];
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    if (state.startsWith('V1_'))
      (BossVampire1.prototype as any).applyUniqueState.call(this, state);
    else if (state.startsWith('V2_') || state.startsWith('V3_'))
      (BossVampire2.prototype as any).applyUniqueState.call(this, state);
    else
      super.applyUniqueState(state);
  }
}

_mixin(BossVampireLegendary, BossVampire1);
_mixin(BossVampireLegendary, BossVampire2);
