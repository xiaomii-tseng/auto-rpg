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

export const STAT_POINT_PER_LEVEL = 1;

export type AllocStat =
  | 'hp' | 'hpRegen' | 'def' | 'evasion' | 'lifesteal'
  | 'speed' | 'atk' | 'crit' | 'atkSpeed' | 'critDmg'
  | 'dotBonus' | 'penetration';

export const ALLOC_STAT_INCREMENT: Record<AllocStat, number> = {
  hp:          5,
  hpRegen:     0.5,
  def:         1.5,
  evasion:     0.005,   // stored as fraction; display as %
  lifesteal:   0.0015,  // stored as fraction
  speed:       2.5,
  atk:         1.0,
  crit:        0.005,   // stored as fraction
  atkSpeed:    0.0075,  // stored as fraction
  critDmg:     0.0125,  // stored as fraction (base 0.5 = 50%)
  dotBonus:    0.02,    // stored as fraction
  penetration: 2.0,
};

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
  burnFieldEliteStacks?: number;
  dashDistBonus?:        number;
  dashDistPct?:          number;
  dashDmgPct?:           number;
  dashDoubleHit?:        number;
  multiHitRangePct?:     number;
  multiHitDmgPct?:       number;
  multiHitLightning?:    number;
  multiHitNoStagger?:    number;
  chargeSlamStunChance?: number;
  chargeSlamDmgPct?:     number;
  chargeSlamOverload?:   number;
  meteorGiant?:          number;
  boomerangRangePct?:    number;
  boomerangDmgPct?:      number;
  boomerangBounce?:      number;
  auraRadiusPct?:        number;
  auraDmgPct?:           number;
  auraBurn?:             number;
  projectileDistBonus?:  number;
  projectileDistPct?:    number;
  projectileDmgPct?:     number;
  projectileFan?:        number;
  // ── 雷射光束 ──
  laserRadiusPct?:          number;
  laserExplode?:            number;
  laserChain?:              number;
  laserDoubleDuration?:     number;
  // ── 玻璃砲 ──
  allDmgPct?:    number;
  takenDmgPct?:  number;
  // ── 新增詞墜 ──
  potionHealPct?:    number;
  onKillHeal?:       number;
  eliteKillerPct?:   number;
  dropRatePct?:      number;
  rarityBonus?:      number;
  killShieldPerKill?:number;
  executePct?:       number;
  regenShieldMax?:    number;
  // ── 條件 DoT ──
  condDotStackBonus?: number;
  // ── 特殊機制（卡片觸發效果）──
  orbitFireBalls?:       number;
  orbitIceBalls?:        number;
  orbitBallDmgPct?:      number;
  orbitFireBallDmgPct?:  number;
  orbitIceBallDmgPct?:   number;
  knifeDamageTrigger?:     number;
  knifeDoubleCount?:       number;
  knifeHoming?:            number;
  knifeDmgPct?:            number;
  overkillSplash?:       number;
  overkillInfiniteChain?: number;
  overkillDmgPct?:        number;
  overkillRadiusMult?:    number;
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
  lightningChancePct?:         number;
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
  flowerChargeSpeedPct?: number;
  flowerChargeCap?:      number;
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
  standstillDmgPct?:          number;
  standstillDmgReductionPct?: number;
  onHitKnifeChance?:          number;
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
let statPoints = 0;
const allocatedStats: Record<AllocStat, number> = {
  hp: 0, hpRegen: 0, def: 0, evasion: 0, lifesteal: 0,
  speed: 0, atk: 0, crit: 0, atkSpeed: 0, critDmg: 0, dotBonus: 0, penetration: 0,
};
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
      statPoints += STAT_POINT_PER_LEVEL;
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

  // ── Stat allocation ────────────────────────────────────

  getStatPoints(): number { return statPoints; },

  getAllocatedStats(): Readonly<Record<AllocStat, number>> { return allocatedStats; },

  allocateStat(key: AllocStat, amount: number): boolean {
    if (amount > 0 && statPoints < amount) return false;
    if (amount < 0 && allocatedStats[key] < -amount) return false;
    allocatedStats[key] += amount;
    statPoints -= amount;
    this.notify();
    return true;
  },

  resetAllocatedStats(): void {
    let total = 0;
    for (const k of Object.keys(allocatedStats) as AllocStat[]) {
      total += allocatedStats[k];
      allocatedStats[k] = 0;
    }
    statPoints += total;
    this.notify();
  },

  setStatPointsDirect(pts: number): void { statPoints = pts; },

  setAllocatedStatsDirect(data: Partial<Record<AllocStat, number>>): void {
    for (const k of Object.keys(allocatedStats) as AllocStat[]) {
      allocatedStats[k] = data[k] ?? 0;
    }
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

  removeManyOwned(items: EquipmentItem[]): void {
    const set = new Set(items);
    const before = owned.length;
    const kept = owned.filter(i => !set.has(i));
    owned.splice(0, owned.length, ...kept);
    if (owned.length !== before) this.notify();
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

  toggleFavorite(item: EquipmentItem): void {
    item.favorite = !item.favorite;
    this.notify();
  },

  isFavorite(item: EquipmentItem): boolean {
    return !!item.favorite;
  },

  getStats(): EffectiveStats {
    let atk       = BASE_ATK + (level - 1) * LEVEL_ATK + allocatedStats.atk * ALLOC_STAT_INCREMENT.atk;
    let maxHp     = BASE_HP  + (level - 1) * LEVEL_HP  + allocatedStats.hp  * ALLOC_STAT_INCREMENT.hp;
    let speed     = BASE_SPEED + allocatedStats.speed * ALLOC_STAT_INCREMENT.speed;
    let def       = BASE_DEF   + allocatedStats.def   * ALLOC_STAT_INCREMENT.def;
    let crit      = BASE_CRIT  + allocatedStats.crit  * ALLOC_STAT_INCREMENT.crit;
    let attackArc = BASE_ATTACK_ARC;
    let atkSpeed    = allocatedStats.atkSpeed    * ALLOC_STAT_INCREMENT.atkSpeed;
    let lifesteal   = allocatedStats.lifesteal   * ALLOC_STAT_INCREMENT.lifesteal;
    let evasion     = allocatedStats.evasion     * ALLOC_STAT_INCREMENT.evasion;
    let critDmg     = 0.5 + allocatedStats.critDmg * ALLOC_STAT_INCREMENT.critDmg;
    let hpRegen     = BASE_HP_REGEN + (level - 1) * LEVEL_HP_REGEN + allocatedStats.hpRegen * ALLOC_STAT_INCREMENT.hpRegen;
    let dotBonus    = allocatedStats.dotBonus    * ALLOC_STAT_INCREMENT.dotBonus;
    let penetration = allocatedStats.penetration * ALLOC_STAT_INCREMENT.penetration;
    let allDmgPct        = 0;
    let maxHpPct         = 0;
    let potionHealPct    = 0;
    let onKillHeal       = 0;
    let eliteKillerPct   = 0;
    let dropRatePct      = 0;
    let rarityBonus      = 0;
    let killShieldPerKill= 0;
    let executePct       = 0;
    let regenShieldMax   = 0;

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
      critDmg          += s.critDmg          ?? 0;
      hpRegen          += s.hpRegen          ?? 0;
      dotBonus         += s.dotBonus         ?? 0;
      penetration      += s.penetration      ?? 0;
      allDmgPct        += s.allDmgPct        ?? 0;
      maxHpPct         += s.maxHpPct         ?? 0;
      potionHealPct    += s.potionHealPct    ?? 0;
      onKillHeal       += s.onKillHeal       ?? 0;
      eliteKillerPct   += s.eliteKillerPct   ?? 0;
      dropRatePct      += s.dropRatePct      ?? 0;
      rarityBonus      += s.rarityBonus      ?? 0;
      killShieldPerKill+= s.killShieldPerKill?? 0;
      executePct       += s.executePct       ?? 0;
      regenShieldMax   += s.regenShieldMax   ?? 0;
    }

    if (maxHpPct > 0) maxHp = Math.round(maxHp * (1 + maxHpPct));

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
      allDmgPct:        allDmgPct        || undefined,
      maxHpPct:         maxHpPct         || undefined,
      potionHealPct:    potionHealPct    || undefined,
      onKillHeal:       onKillHeal       || undefined,
      eliteKillerPct:   eliteKillerPct   || undefined,
      dropRatePct:      dropRatePct      || undefined,
      rarityBonus:      rarityBonus      || undefined,
      killShieldPerKill:killShieldPerKill || undefined,
      executePct:       executePct       || undefined,
      regenShieldMax:   regenShieldMax   || undefined,
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
