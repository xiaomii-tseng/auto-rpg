import Phaser from 'phaser';
import { BossState } from './boss';
import { BossGreenSlime } from './boss-green-slime';
import { BossRedSlime } from './boss-red-slime';
import { BossBlueSlime } from './boss-blue-slime';
import { BossWhiteSlime } from './boss-white-slime';
import { BossZombieSlime } from './boss-zombie-slime';
import { BossLavaSlime } from './boss-lava-slime';
import type { Element } from '../data/equipment-data';

const _SKIP = new Set(['constructor', 'applyUniqueState', 'pickNextAttack']);
const _mixin = (Target: any, Source: any) =>
  Object.getOwnPropertyNames(Source.prototype)
    .filter(m => !_SKIP.has(m) && !(m in Target.prototype))
    .forEach(m => { Target.prototype[m] = Source.prototype[m]; });

export class BossSlimeLegendary extends BossLavaSlime {
  // GreenSlime callbacks
  onSummonElite?: (x: number, y: number) => void;
  onPoisonTick?:  (x: number, y: number, radius: number, dmg: number) => void;
  // RedSlime callbacks
  onJumpHit?: (x: number, y: number, radius: number, dmg: number) => void;
  onFanHit?:  (bx: number, by: number, angle: number, half: number, range: number, dmg: number) => void;
  // BlueSlime callbacks
  onSpikeHit?:   (x: number, y: number, dmg: number) => void;
  onMineExplode?: (x: number, y: number, radius: number, dmg: number) => void;
  // WhiteSlime callbacks
  onCrossHit?:   (dmg: number) => void;
  onOrbExplode?: (x: number, y: number, radius: number, dmg: number) => void;
  // ZombieSlime callbacks
  onSummonZombie?:  (x: number, y: number) => void;
  onPoisonFanHit?:  (dmg: number) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
  }

  protected override pickNextAttack(): void {
    if (this.guestMode) return;
    const attacks: Array<() => void> = [
      () => (this as any).enterSummonWarn(),
      () => (this as any).enterPoisonWarn(),
      () => (this as any).enterJumpWarn(),
      () => (this as any).enterFireFanWarn(),
      () => (this as any).enterIceSpikeWarn(),
      () => (this as any).enterIceMineWarn(),
      () => (this as any).enterHolyCrossWarn(),
      () => (this as any).enterHolyOrbsWarn(),
      () => (this as any).enterZombieSummonWarn(),
      () => (this as any).enterPoisonFanWarn(),
      () => (this as any).enterLavaBarrageWarn(),
      () => (this as any).enterLavaPillarWarn(),
    ];
    const fn = attacks[Math.floor(Math.random() * attacks.length)];
    this.stateTimer = this.scene.time.delayedCall(this.getNextAttackDelay(), fn);
  }

  protected override applyUniqueState(state: string): void {
    switch (state) {
      case BossState.SUMMON_WARN:
      case BossState.POISON_WARN:
        (BossGreenSlime.prototype as any).applyUniqueState.call(this, state); break;
      case BossState.JUMP_WARN:
      case BossState.FIRE_WARN:
        (BossRedSlime.prototype as any).applyUniqueState.call(this, state); break;
      case BossState.ICE_SPIKE_WARN:
      case BossState.ICE_MINE_WARN:
        (BossBlueSlime.prototype as any).applyUniqueState.call(this, state); break;
      case BossState.HOLY_CROSS_WARN:
      case BossState.HOLY_ORBS_WARN:
        (BossWhiteSlime.prototype as any).applyUniqueState.call(this, state); break;
      case BossState.ZOMBIE_SUMMON_WARN:
      case BossState.POISON_FAN_WARN:
        (BossZombieSlime.prototype as any).applyUniqueState.call(this, state); break;
      default:
        super.applyUniqueState(state);
    }
  }
}

_mixin(BossSlimeLegendary, BossGreenSlime);
_mixin(BossSlimeLegendary, BossRedSlime);
_mixin(BossSlimeLegendary, BossBlueSlime);
_mixin(BossSlimeLegendary, BossWhiteSlime);
_mixin(BossSlimeLegendary, BossZombieSlime);
