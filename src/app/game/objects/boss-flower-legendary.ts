import Phaser from 'phaser';
import { BossState } from './boss';
import { BossFlowerOne } from './boss-flower-one';
import { BossFlowerTwo } from './boss-flower-two';
import { BossFlowerThree } from './boss-flower-three';
import type { Element } from '../data/equipment-data';

const _SKIP = new Set(['constructor', 'applyUniqueState', 'pickNextAttack']);
const _mixin = (Target: any, Source: any) =>
  Object.getOwnPropertyNames(Source.prototype)
    .filter(m => !_SKIP.has(m) && !(m in Target.prototype))
    .forEach(m => { Target.prototype[m] = Source.prototype[m]; });

export class BossFlowerLegendary extends BossFlowerThree {
  // FlowerOne callbacks (onFirePetal with large param)
  declare onFirePetal: ((fromX: number, fromY: number, angle: number, speed: number, dmg: number, blindDist: number, large?: boolean) => void) | undefined;
  onRepelPlayer?: (bossX: number, bossY: number) => void;
  // FlowerTwo callbacks
  onPlaceBuds?:   (positions: { x: number; y: number }[], dmg: number, r: number, zoneDur: number) => void;
  onSprayMist?:   (fromX: number, fromY: number, angle: number, range: number, dmg: number) => void;
  onSpawnVines?:  (fromX: number, fromY: number, len: number, w: number, dmg: number, baseAngle: number, count: number) => void;
  onPoisonBurst?: (fromX: number, fromY: number, dist: number, r: number, dmg: number, count: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
    // FlowerOne + FlowerTwo instance fields not initialized by super (FlowerThree)
    (this as any).repelCooldown = 0;
    (this as any).attackCount   = 0;
    (this as any).burrowAfter   = 0;
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const attacks: Array<() => void> = [
      // FlowerOne attacks
      () => (this as any).enterPetalStorm(),
      () => (this as any).enterTracking(),
      () => (this as any).enterFan(),
      () => (this as any).enterSpiral(),
      // FlowerTwo attacks
      () => (this as any).enterBlossom(),
      () => (this as any).enterMist(),
      () => (this as any).enterVine(),
      () => (this as any).enterBurst(),
      () => (this as any).doBurrow(),
      // FlowerThree attacks
      () => (this as any).enterSeedScatter(),
      () => (this as any).enterSlowZones(),
      () => (this as any).enterRootSpike(),
      () => (this as any).enterCrownBurst(),
    ];
    const fn = attacks[Math.floor(Math.random() * attacks.length)];
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.PETAL_STORM_WARN:
      case BossState.TRACKING_WARN:
      case BossState.FAN_WARN:
      case BossState.SPIRAL_WARN:
        (BossFlowerOne.prototype as any).applyUniqueState.call(this, state);
        break;
      case BossState.BLOSSOM_WARN:
      case BossState.MIST_WARN:
      case BossState.VINE_WARN:
      case BossState.BURST_WARN:
      case BossState.BURROW:
        (BossFlowerTwo.prototype as any).applyUniqueState.call(this, state);
        break;
      default:
        super.applyUniqueState(state);
    }
  }
}

_mixin(BossFlowerLegendary, BossFlowerOne);
_mixin(BossFlowerLegendary, BossFlowerTwo);
