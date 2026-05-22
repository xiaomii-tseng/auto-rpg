import { EquipmentItem, EquipSlot, getItemStats } from './equipment-data';

export const BASE_ATK        = 30;
export const BASE_HP         = 80;
export const BASE_SPEED      = 120;
export const BASE_DEF        = 0;
export const BASE_CRIT       = 0;
export const BASE_ATTACK_ARC = 180;

const LEVEL_ATK     = 2;
const LEVEL_HP      = 10;
const BASE_HP_REGEN = 2;
const LEVEL_HP_REGEN = 0.05;

export interface EffectiveStats {
  atk:       number;
  maxHp:     number;
  speed:     number;
  def:       number;
  crit:      number;
  attackArc: number;
  atkSpeed:  number;
  lifesteal: number;
  evasion:   number;
  critDmg:        number;
  hpRegen:        number;
  dotBonus:       number;
  penetration:    number;
  dmgVsFire?:        number;
  dmgVsWater?:       number;
  dmgVsGrass?:       number;
  dmgVsNone?:        number;
  dmgVsAnyElement?:  number;
  dmgVsEliteOrBoss?: number;
  dmgVsSlime?:       number;
  dmgVsPlant?:       number;
  dmgVsBoss?:        number;
  // ── 技能特化 ──
  whirlwindRangePct?:    number;
  whirlwindDmgPct?:      number;
  slash180DmgPct?:       number;
  burnMaxStackBonus?:    number;
  burnSpread?:           number;
  burnSpreadSkillPx?:    number;
  burnDoubleStack?:      number;
  dashDistBonus?:        number;
  dashDistPct?:          number;
  dashDmgPct?:           number;
  dashDoubleHit?:        number;
  multiHitNoStagger?:    number;
  multiHitDmgPct?:       number;
  chargeSlamStunChance?: number;
  chargeSlamDmgPct?:     number;
  chargeSlamOverload?:   number;
  boomerangRangePct?:    number;
  boomerangDmgPct?:      number;
  auraRadiusPct?:        number;
  auraDmgPct?:           number;
  projectileDistBonus?:  number;
  projectileDistPct?:    number;
  projectileDmgPct?:     number;
  projectileFan?:        number;
  // ── 玻璃砲 ──
  allDmgPct?:    number;
  takenDmgPct?:  number;
  // ── 掉落 ──
  dropRateMult?: number;
  // ── 條件 DoT ──
  condDotStackBonus?: number;
  // ── 特殊機制（卡片觸發效果）──
  orbitFireBalls?:       number;
  orbitIceBalls?:        number;
  orbitBallDmgPct?:      number;
  orbitFireBallDmgPct?:  number;
  orbitIceBallDmgPct?:   number;
  periodicKnives?:       number;
  knifeIntervalReduction?: number;
  knifeDoubleCount?:       number;
  knifeHoming?:            number;
  knifeDmgPct?:            number;
  overkillSplash?:       number;
  overkillInfiniteChain?: number;
  overkillDmgPct?:        number;
  bloodlust?:                  number;
  bloodlustDmgPerStack?:       number;
  bloodlustMaxStacks?:         number;
  sanguine?:                   number;
  sanguineMaxStacks?:          number;
  bloodlustAtkSpeedPerStack?:  number;
  damageSplash?:          number;
  damageSplashPct?:       number;
  damageSplashCount?:     number;
  lightningStrike?:      number;
  onHitLightningChance?: number;
  lightningDmgBonus?:          number;
  lightningIntervalReduction?: number;
  lightningSingleTarget?:      number;
  divineShieldChance?:   number;
  infiniteDivineShield?: number;
  summonFlowerChance?:   number;
  summonFlowerCap?:      number;
  summonFlowerCapPair?:  number;
  skillFlowerChance?:    number;
  skillFlowerCap?:       number;
  skillFlowerHpPct?:     number;
  summonFlowerDmgPct?:   number;
  flowerSummonMode?:     number;
  lavaSlimeCompanion?:   number;
  executeBelow15?:       number;
  burnedEnemyDmgAmp?:   number;
  condLowHpAtk?:        number;
  freeRevive?:           number;
  maxHpPct?:             number;
  weaponRefineAtk?:      number;
  critToAtk?:             number;
  blazingShieldChance?:   number;
  blazingShieldAtkPct?:   number;
  blazingShieldMs?:       number;
  blazingShieldHealPct?:  number;
  impaleCharge?:          number;
  impaleDmgPct?:          number;
  weaponRefineHp?:       number;
  damageCap?:   number;
  soulHarvest?: number;
  fearAura?:    number;
  bloodRage?:   number;
  lifestealInstant?: number;
}

type EquippedMap = { [K in EquipSlot]: EquipmentItem | null };

const equipped: EquippedMap = {
  hat:    null,
  outfit: null,
  shoes:  null,
  ring1:  null,
  ring2:  null,
  sword:  null,
};

let level = 1;
let exp   = 0;
const owned:     EquipmentItem[] = [];
const listeners: Array<() => void> = [];

export const PlayerStore = {
  // ── Level / Exp ────────────────────────────────────────

  getLevel(): number { return level; },
  getExp():   number { return exp; },

  expToNext(lv = level): number { return Math.round(250 * Math.pow(1.1625, lv - 1)); },

  MAX_LEVEL: 50,

  addExp(amount: number): number {
    if (level >= PlayerStore.MAX_LEVEL) { exp = 0; this.notify(); return 0; }
    exp += amount;
    let levelsGained = 0;
    while (exp >= PlayerStore.expToNext() && level < PlayerStore.MAX_LEVEL) {
      exp -= PlayerStore.expToNext();
      level++;
      levelsGained++;
    }
    if (level >= PlayerStore.MAX_LEVEL) exp = 0;
    this.notify();
    return levelsGained;
  },

  // ── Internal load helpers (used by SaveStore only) ────

  setLevelExp(lv: number, ex: number): void {
    level = lv;
    exp   = ex;
  },

  equipDirect(slot: EquipSlot, item: EquipmentItem): void {
    equipped[slot] = item;
  },

  // ── Owned (received from quests, not yet equipped) ────

  addOwned(item: EquipmentItem): void {
    owned.push(item);
    this.notify();
  },

  removeOwned(item: EquipmentItem): boolean {
    const idx = owned.indexOf(item);
    if (idx === -1) return false;
    owned.splice(idx, 1);
    this.notify();
    return true;
  },

  getOwned(): ReadonlyArray<EquipmentItem> {
    return owned;
  },

  // ── Equipment ──────────────────────────────────────────

  equip(item: EquipmentItem): void {
    const idx = owned.indexOf(item);
    if (idx !== -1) owned.splice(idx, 1);
    let targetSlot = item.slot;
    if (targetSlot === 'ring1' && equipped['ring1'] && !equipped['ring2']) targetSlot = 'ring2';
    const prev = equipped[targetSlot];
    if (prev) owned.push(prev);
    equipped[targetSlot] = item;
    this.notify();
  },

  equipToSlot(item: EquipmentItem, slot: 'ring1' | 'ring2'): void {
    const idx = owned.indexOf(item);
    if (idx !== -1) owned.splice(idx, 1);
    const prev = equipped[slot];
    if (prev) owned.push(prev);
    equipped[slot] = item;
    this.notify();
  },

  unequip(slot: EquipSlot): void {
    const prev = equipped[slot];
    if (prev) owned.push(prev);
    equipped[slot] = null;
    this.notify();
  },

  getEquipped(): Readonly<EquippedMap> {
    return equipped;
  },

  isEquipped(itemId: string): boolean {
    return Object.values(equipped).some(e => e?.id === itemId);
  },

  getStats(): EffectiveStats {
    let atk       = BASE_ATK + (level - 1) * LEVEL_ATK;
    let maxHp     = BASE_HP  + (level - 1) * LEVEL_HP;
    let speed     = BASE_SPEED;
    let def       = BASE_DEF;
    let crit      = BASE_CRIT;
    let attackArc = BASE_ATTACK_ARC;
    let atkSpeed    = 0;
    let lifesteal   = 0;
    let evasion     = 0;
    let critDmg     = 0.5;
    let hpRegen     = BASE_HP_REGEN + (level - 1) * LEVEL_HP_REGEN;
    let dotBonus    = 0;
    let penetration = 0;

    for (const [, item] of Object.entries(equipped) as [EquipSlot, EquipmentItem | null][]) {
      if (!item) continue;
      const s = getItemStats(item);
      atk       += s.atk       ?? 0;
      maxHp     += s.hp        ?? 0;
      speed     += s.speed     ?? 0;
      def       += s.def       ?? 0;
      crit      += s.crit      ?? 0;
      atkSpeed  += s.atkSpeed  ?? 0;
      lifesteal += s.lifesteal ?? 0;
      evasion   += s.evasion   ?? 0;
      critDmg     += s.critDmg     ?? 0;
      hpRegen     += s.hpRegen     ?? 0;
      dotBonus    += s.dotBonus    ?? 0;
      penetration += s.penetration ?? 0;
    }

    return {
      atk, maxHp, speed, def,
      crit:      Math.min(crit, 1),
      attackArc: Math.min(attackArc, 360),
      atkSpeed:  Math.min(atkSpeed, 1),
      lifesteal: Math.min(lifesteal, 0.1),
      evasion:   Math.min(evasion, 0.75),
      critDmg,
      hpRegen,
      dotBonus,
      penetration,
    };
  },

  // ── Listeners ──────────────────────────────────────────

  onChange(fn: () => void): void { listeners.push(fn); },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void { listeners.forEach(fn => fn()); },
};
