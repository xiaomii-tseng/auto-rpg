import Phaser from 'phaser';
import { BossState } from './boss';
import { BossOrc1 } from './boss-orc1';
import { BossOrc2 } from './boss-orc2';
import { BossOrc3 } from './boss-orc3';
import type { Element } from '../data/equipment-data';

const _SKIP = new Set(['constructor', 'applyUniqueState', 'pickNextAttack']);
const _mixin = (Target: any, Source: any) =>
  Object.getOwnPropertyNames(Source.prototype)
    .filter(m => !_SKIP.has(m) && !(m in Target.prototype))
    .forEach(m => { Target.prototype[m] = Source.prototype[m]; });

export class BossOrcLegendary extends BossOrc3 {
  // Orc1 callbacks
  onWhirlTick?:     (x: number, y: number, r: number, dmg: number) => void;
  onWhirlSlash?:    (wx: number, wy: number, tx: number, ty: number) => void;
  onSummonOrc?:     (x: number, y: number) => void;
  onFanSlash?:      (bx: number, by: number, angle: number, half: number, range: number, dmg: number) => void;
  onBoulderLand?:   (x: number, y: number, r: number, dmg: number) => void;
  onSlowZoneTick?:  (x: number, y: number, r: number) => void;
  onRoar?:          () => void;
  // Orc2 callbacks
  onJumpLand?:      (x: number, y: number, r: number, dmg: number) => void;
  onFissure?:       (bx: number, by: number, angle: number, len: number, dmg: number) => void;
  onFieldFracture?: (safeZones: { x: number; y: number; r: number }[], dmg: number, duration: number, tickMs: number) => void;
  onBoulderRoll?:   (bx: number, by: number, angle: number, speed: number, r: number, dmg: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    if (this.tryChargeIfFar()) return;
    const attacks: Array<() => void> = [
      () => (this as any).enterOrcWhirlWarn(),
      () => (this as any).enterOrcFanWarn(),
      () => (this as any).enterOrcBoulderWarn(),
      () => (this as any).enterOrcSummonWarn(),
      () => (this as any).enterOrcRoarWarn(),
      () => (this as any).enterOrc2JumpWarn(),
      () => (this as any).enterOrc2FissureWarn(),
      () => (this as any).enterOrc2FractureWarn(),
      () => (this as any).enterOrc2RollWarn(),
      () => (this as any).enterOrc3StormWarn(),
      () => (this as any).enterBurialWarn(),
      () => (this as any).enterIronWarn(),
      () => (this as any).enterBushidoWarn(),
      () => (this as any).enterVanishWarn(),
    ];
    const fn = attacks[Math.floor(Math.random() * attacks.length)];
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    if (state.startsWith('ORC2_'))
      (BossOrc2.prototype as any).applyUniqueState.call(this, state);
    else if (state.startsWith('ORC_') && !state.startsWith('ORC3_'))
      (BossOrc1.prototype as any).applyUniqueState.call(this, state);
    else
      super.applyUniqueState(state);
  }
}

_mixin(BossOrcLegendary, BossOrc1);
_mixin(BossOrcLegendary, BossOrc2);
