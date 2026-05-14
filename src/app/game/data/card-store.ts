import { StatBonus } from './equipment-data';
import { PlayerStore, EffectiveStats } from './player-store';
import { getCardDef } from './monster-data';
import { SkillTreeStore } from './skill-tree-store';

export const CARD_SLOT_COUNT = 5;

// 5個裝備槽 (cardId or null)
const equipped: (string | null)[] = Array(CARD_SLOT_COUNT).fill(null);

// 卡片庫存: cardId → 數量 (可疊加)
const inventory: Map<string, number> = new Map();

const listeners: Array<() => void> = [];

// 依 monsterId 前綴決定同張卡的裝備上限
function getCardStackLimit(cardId: string): number {
  const def = getCardDef(cardId);
  if (!def) return 1;
  if (def.monsterId.startsWith('boss_'))  return 1;
  if (def.monsterId.startsWith('elite_')) return 2;
  return 3;
}

export const CardStore = {

  // ── Inventory ──────────────────────────────────────────────

  addCard(cardId: string, qty = 1): void {
    inventory.set(cardId, (inventory.get(cardId) ?? 0) + qty);
    this.notify();
  },

  getInventoryQty(cardId: string): number {
    return inventory.get(cardId) ?? 0;
  },

  removeFromInventory(cardId: string, qty = 1): boolean {
    const cur = inventory.get(cardId) ?? 0;
    if (cur < qty) return false;
    const next = cur - qty;
    if (next <= 0) inventory.delete(cardId);
    else inventory.set(cardId, next);
    this.notify();
    return true;
  },

  getInventory(): { cardId: string; qty: number }[] {
    return Array.from(inventory.entries())
      .filter(([, qty]) => qty > 0)
      .map(([cardId, qty]) => ({ cardId, qty }));
  },

  // ── Equip / Unequip ────────────────────────────────────────

  getStackLimit(cardId: string): number {
    return getCardStackLimit(cardId);
  },

  equip(cardId: string, slot: number): void {
    if (slot < 0 || slot >= CARD_SLOT_COUNT) return;
    if ((inventory.get(cardId) ?? 0) <= 0) return;

    // 疊帶上限：排除目標槽位本身再計數
    const countElsewhere = equipped.filter((s, i) => s === cardId && i !== slot).length;
    if (countElsewhere >= getCardStackLimit(cardId)) return;

    const current = equipped[slot];
    if (current) {
      inventory.set(current, (inventory.get(current) ?? 0) + 1);
    }

    const newQty = (inventory.get(cardId) ?? 0) - 1;
    if (newQty <= 0) inventory.delete(cardId);
    else inventory.set(cardId, newQty);

    equipped[slot] = cardId;
    this.notify();
  },

  equipAuto(cardId: string): void {
    const slot = equipped.findIndex(s => s === null);
    if (slot !== -1) this.equip(cardId, slot);
  },

  unequip(slot: number): void {
    const cardId = equipped[slot];
    if (!cardId) return;
    inventory.set(cardId, (inventory.get(cardId) ?? 0) + 1);
    equipped[slot] = null;
    this.notify();
  },

  getEquipped(): ReadonlyArray<string | null> {
    return equipped;
  },

  // ── Stats ──────────────────────────────────────────────────

  getEquippedBonus(): StatBonus {
    const b: StatBonus = {};
    for (const cardId of equipped) {
      if (!cardId) continue;
      const def = getCardDef(cardId);
      if (!def) continue;
      const e = def.effect;
      b.atk         = (b.atk         ?? 0) + (e.atk         ?? 0);
      b.hp          = (b.hp          ?? 0) + (e.hp          ?? 0);
      b.def         = (b.def         ?? 0) + (e.def         ?? 0);
      b.speed       = (b.speed       ?? 0) + (e.speed       ?? 0);
      b.crit        = (b.crit        ?? 0) + (e.crit        ?? 0);
      b.attackArc   = (b.attackArc   ?? 0) + (e.attackArc   ?? 0);
      b.atkSpeed    = (b.atkSpeed    ?? 0) + (e.atkSpeed    ?? 0);
      b.evasion     = (b.evasion     ?? 0) + (e.evasion     ?? 0);
      b.critDmg     = (b.critDmg     ?? 0) + (e.critDmg     ?? 0);
      b.dotBonus    = (b.dotBonus    ?? 0) + (e.dotBonus    ?? 0);
      b.penetration = (b.penetration ?? 0) + (e.penetration ?? 0);
      b.lifesteal   = (b.lifesteal   ?? 0) + (e.lifesteal   ?? 0);
      b.hpRegen     = (b.hpRegen     ?? 0) + (e.hpRegen     ?? 0);
      b.atkPct      = (b.atkPct      ?? 0) + (e.atkPct      ?? 0);
      b.hpPct       = (b.hpPct       ?? 0) + (e.hpPct       ?? 0);
      b.defPct      = (b.defPct      ?? 0) + (e.defPct      ?? 0);
      b.weaponEnhance8Atk      = (b.weaponEnhance8Atk      ?? 0) + (e.weaponEnhance8Atk      ?? 0);
      b.weaponEnhance8Hp       = (b.weaponEnhance8Hp       ?? 0) + (e.weaponEnhance8Hp       ?? 0);
      b.weaponEnhance8DotBonus = (b.weaponEnhance8DotBonus ?? 0) + (e.weaponEnhance8DotBonus ?? 0);
      b.dmgVsFire        = (b.dmgVsFire        ?? 0) + (e.dmgVsFire        ?? 0);
      b.dmgVsWater       = (b.dmgVsWater       ?? 0) + (e.dmgVsWater       ?? 0);
      b.dmgVsGrass       = (b.dmgVsGrass       ?? 0) + (e.dmgVsGrass       ?? 0);
      b.dmgVsNone        = (b.dmgVsNone        ?? 0) + (e.dmgVsNone        ?? 0);
      b.dmgVsAnyElement  = (b.dmgVsAnyElement  ?? 0) + (e.dmgVsAnyElement  ?? 0);
      b.dmgVsEliteOrBoss = (b.dmgVsEliteOrBoss ?? 0) + (e.dmgVsEliteOrBoss ?? 0);
      b.dmgVsSlime       = (b.dmgVsSlime       ?? 0) + (e.dmgVsSlime       ?? 0);
      b.dmgVsBoss        = (b.dmgVsBoss        ?? 0) + (e.dmgVsBoss        ?? 0);
      b.whirlwindRangePct    = (b.whirlwindRangePct    ?? 0) + (e.whirlwindRangePct    ?? 0);
      b.whirlwindDmgPct      = (b.whirlwindDmgPct      ?? 0) + (e.whirlwindDmgPct      ?? 0);
      b.slash180DmgPct       = (b.slash180DmgPct       ?? 0) + (e.slash180DmgPct       ?? 0);
      b.burnMaxStackBonus    = (b.burnMaxStackBonus    ?? 0) + (e.burnMaxStackBonus    ?? 0);
      b.burnSpread           = (b.burnSpread           ?? 0) + (e.burnSpread           ?? 0);
      b.burnSpreadSkillPx    = (b.burnSpreadSkillPx    ?? 0) + (e.burnSpreadSkillPx    ?? 0);
      b.burnDoubleStack      = (b.burnDoubleStack      ?? 0) + (e.burnDoubleStack      ?? 0);
      b.dashDistBonus        = (b.dashDistBonus        ?? 0) + (e.dashDistBonus        ?? 0);
      b.dashDistPct          = (b.dashDistPct          ?? 0) + (e.dashDistPct          ?? 0);
      b.dashDmgPct           = (b.dashDmgPct           ?? 0) + (e.dashDmgPct           ?? 0);
      b.dashDoubleHit        = (b.dashDoubleHit        ?? 0) + (e.dashDoubleHit        ?? 0);
      b.multiHitNoStagger    = (b.multiHitNoStagger    ?? 0) + (e.multiHitNoStagger    ?? 0);
      b.multiHitDmgPct       = (b.multiHitDmgPct       ?? 0) + (e.multiHitDmgPct       ?? 0);
      b.chargeSlamStunChance = (b.chargeSlamStunChance ?? 0) + (e.chargeSlamStunChance ?? 0);
      b.chargeSlamDmgPct     = (b.chargeSlamDmgPct     ?? 0) + (e.chargeSlamDmgPct     ?? 0);
      b.chargeSlamOverload   = (b.chargeSlamOverload   ?? 0) + (e.chargeSlamOverload   ?? 0);
      b.boomerangRangePct    = (b.boomerangRangePct    ?? 0) + (e.boomerangRangePct    ?? 0);
      b.boomerangDmgPct      = (b.boomerangDmgPct      ?? 0) + (e.boomerangDmgPct      ?? 0);
      b.auraRadiusPct        = (b.auraRadiusPct        ?? 0) + (e.auraRadiusPct        ?? 0);
      b.auraDmgPct           = (b.auraDmgPct           ?? 0) + (e.auraDmgPct           ?? 0);
      b.projectileDistBonus  = (b.projectileDistBonus  ?? 0) + (e.projectileDistBonus  ?? 0);
      b.projectileDistPct    = (b.projectileDistPct    ?? 0) + (e.projectileDistPct    ?? 0);
      b.projectileDmgPct     = (b.projectileDmgPct     ?? 0) + (e.projectileDmgPct     ?? 0);
      b.projectileFan        = (b.projectileFan        ?? 0) + (e.projectileFan        ?? 0);
      b.condCritDmgBonus     = (b.condCritDmgBonus     ?? 0) + (e.condCritDmgBonus     ?? 0);
      b.condPenAtk           = (b.condPenAtk           ?? 0) + (e.condPenAtk           ?? 0);
      b.condHpPct            = (b.condHpPct            ?? 0) + (e.condHpPct            ?? 0);
      b.allDmgPct            = (b.allDmgPct            ?? 0) + (e.allDmgPct            ?? 0);
      b.takenDmgPct          = (b.takenDmgPct          ?? 0) + (e.takenDmgPct          ?? 0);
      b.dropRateMult         = (b.dropRateMult         ?? 0) + (e.dropRateMult         ?? 0);
      b.condDotStackBonus    = (b.condDotStackBonus    ?? 0) + (e.condDotStackBonus    ?? 0);
      b.orbitFireBalls       = (b.orbitFireBalls       ?? 0) + (e.orbitFireBalls       ?? 0);
      b.orbitIceBalls        = (b.orbitIceBalls        ?? 0) + (e.orbitIceBalls        ?? 0);
      b.orbitBallDmgPct      = (b.orbitBallDmgPct      ?? 0) + (e.orbitBallDmgPct      ?? 0);
      b.orbitFireBallDmgPct  = (b.orbitFireBallDmgPct  ?? 0) + (e.orbitFireBallDmgPct  ?? 0);
      b.orbitIceBallDmgPct   = (b.orbitIceBallDmgPct   ?? 0) + (e.orbitIceBallDmgPct   ?? 0);
      b.periodicKnives         = (b.periodicKnives         ?? 0) + (e.periodicKnives         ?? 0);
      b.knifeIntervalReduction = (b.knifeIntervalReduction ?? 0) + (e.knifeIntervalReduction ?? 0);
      b.knifeDoubleCount       = (b.knifeDoubleCount       ?? 0) + (e.knifeDoubleCount       ?? 0);
      b.knifeHoming            = (b.knifeHoming            ?? 0) + (e.knifeHoming            ?? 0);
      b.knifeDmgPct            = (b.knifeDmgPct            ?? 0) + (e.knifeDmgPct            ?? 0);
      b.overkillSplash          = (b.overkillSplash          ?? 0) + (e.overkillSplash          ?? 0);
      b.overkillInfiniteChain   = (b.overkillInfiniteChain   ?? 0) + (e.overkillInfiniteChain   ?? 0);
      b.overkillDmgPct          = (b.overkillDmgPct          ?? 0) + (e.overkillDmgPct          ?? 0);
      b.bloodlust                  = (b.bloodlust                  ?? 0) + (e.bloodlust                  ?? 0);
      b.bloodlustDmgPerStack       = (b.bloodlustDmgPerStack       ?? 0) + (e.bloodlustDmgPerStack       ?? 0);
      b.bloodlustMaxStacks         = (b.bloodlustMaxStacks         ?? 0) + (e.bloodlustMaxStacks         ?? 0);
      b.sanguine                   = (b.sanguine                   ?? 0) + (e.sanguine                   ?? 0);
      b.sanguineMaxStacks          = (b.sanguineMaxStacks          ?? 0) + (e.sanguineMaxStacks          ?? 0);
      b.bloodlustAtkSpeedPerStack  = (b.bloodlustAtkSpeedPerStack  ?? 0) + (e.bloodlustAtkSpeedPerStack  ?? 0);
      b.damageSplash            = (b.damageSplash            ?? 0) + (e.damageSplash            ?? 0);
      b.damageSplashPct         = (b.damageSplashPct         ?? 0) + (e.damageSplashPct         ?? 0);
      b.damageSplashCount       = (b.damageSplashCount       ?? 0) + (e.damageSplashCount       ?? 0);
      b.lightningStrike      = (b.lightningStrike      ?? 0) + (e.lightningStrike      ?? 0);
      b.onHitLightningChance = (b.onHitLightningChance ?? 0) + (e.onHitLightningChance ?? 0);
      b.lightningDmgBonus          = (b.lightningDmgBonus          ?? 0) + (e.lightningDmgBonus          ?? 0);
      b.lightningIntervalReduction = (b.lightningIntervalReduction ?? 0) + (e.lightningIntervalReduction ?? 0);
      b.lightningSingleTarget      = (b.lightningSingleTarget      ?? 0) + (e.lightningSingleTarget      ?? 0);
      b.divineShieldChance   = (b.divineShieldChance   ?? 0) + (e.divineShieldChance   ?? 0);
      b.infiniteDivineShield = (b.infiniteDivineShield ?? 0) + (e.infiniteDivineShield ?? 0);
      b.summonFlowerChance   = (b.summonFlowerChance   ?? 0) + (e.summonFlowerChance   ?? 0);
      b.summonFlowerCap      = (b.summonFlowerCap      ?? 0) + (e.summonFlowerCap      ?? 0);
      b.summonFlowerCapPair  = (b.summonFlowerCapPair  ?? 0) + (e.summonFlowerCapPair  ?? 0);
      b.skillFlowerChance    = (b.skillFlowerChance    ?? 0) + (e.skillFlowerChance    ?? 0);
      b.skillFlowerCap       = (b.skillFlowerCap       ?? 0) + (e.skillFlowerCap       ?? 0);
      b.skillFlowerHpPct     = (b.skillFlowerHpPct     ?? 0) + (e.skillFlowerHpPct     ?? 0);
      b.summonFlowerDmgPct   = (b.summonFlowerDmgPct   ?? 0) + (e.summonFlowerDmgPct   ?? 0);
      b.flowerSummonMode     = (b.flowerSummonMode     ?? 0) + (e.flowerSummonMode     ?? 0);
      b.lavaSlimeCompanion   = (b.lavaSlimeCompanion   ?? 0) + (e.lavaSlimeCompanion   ?? 0);
      b.executeBelow15       = (b.executeBelow15       ?? 0) + (e.executeBelow15       ?? 0);
      b.freeRevive           = (b.freeRevive           ?? 0) + (e.freeRevive           ?? 0);
      b.maxHpPct             = (b.maxHpPct             ?? 0) + (e.maxHpPct             ?? 0);
      b.weaponRefineAtk      = (b.weaponRefineAtk      ?? 0) + (e.weaponRefineAtk      ?? 0);
      b.weaponRefineHp       = (b.weaponRefineHp       ?? 0) + (e.weaponRefineHp       ?? 0);
    }
    return b;
  },

  /** 裝備 + 卡片的完整數值，遊戲場景使用此函式 */
  getTotalStats(): EffectiveStats {
    const base     = PlayerStore.getStats();
    const cardBonus = this.getEquippedBonus();
    const skillBonus = SkillTreeStore.getBonus();
    // 合併技能樹加成
    const bonus: StatBonus = { ...cardBonus };
    for (const key of Object.keys(skillBonus) as (keyof StatBonus)[]) {
      (bonus as any)[key] = ((bonus[key] as number) ?? 0) + ((skillBonus[key] as number) ?? 0);
    }
    const sword    = PlayerStore.getEquipped().sword;
    const swordEnh = sword?.enhancement ?? 0;
    const enh8     = swordEnh >= 8;
    const MELEE_BEHAVIORS = ['slash180', 'whirlwind', 'dashPierce', 'aura', 'multiHit', 'chargeSlam'];
    const meleeDef = MELEE_BEHAVIORS.includes(SkillTreeStore.getAttackMode()) ? 15 : 0;

    // 精煉加成（每+2精煉 ATK/HP+X）
    const refineSteps = Math.floor(swordEnh / 2);
    const refineAtk   = refineSteps * (bonus.weaponRefineAtk ?? 0);
    const refineHp    = refineSteps * (bonus.weaponRefineHp  ?? 0);

    // 先算出中間值，用於條件判斷
    const flatAtk  = base.atk   + (bonus.atk ?? 0) + (enh8 ? (bonus.weaponEnhance8Atk ?? 0) : 0) + refineAtk;
    const flatHp   = base.maxHp + (bonus.hp  ?? 0) + (enh8 ? (bonus.weaponEnhance8Hp  ?? 0) : 0) + refineHp;
    const flatPen  = base.penetration + (bonus.penetration ?? 0);
    const flatCrit = Math.min(base.crit + (bonus.crit ?? 0), 1);
    const flatCritDmg = base.critDmg + (bonus.critDmg ?? 0);

    // 條件加成 resolve
    const condAtk    = (bonus.condPenAtk    && flatPen  >= 100)  ? (bonus.condPenAtk    ?? 0) : 0;
    const condHpPct  = (bonus.condHpPct     && flatHp   >= 800)  ? (bonus.condHpPct     ?? 0) : 0;
    const condCritDmg= (bonus.condCritDmgBonus && flatCrit >= 0.5) ? (bonus.condCritDmgBonus ?? 0) : 0;

    return {
      atk:         Math.round((flatAtk + condAtk) * (1 + (bonus.atkPct ?? 0))),
      maxHp:       Math.round(flatHp * (1 + (bonus.hpPct ?? 0) + condHpPct + (bonus.maxHpPct ?? 0))),
      def:         Math.round((base.def + (bonus.def ?? 0) + meleeDef) * (1 + (bonus.defPct ?? 0))),
      speed:       base.speed     + (bonus.speed    ?? 0),
      crit:        flatCrit,
      attackArc:   Math.min(base.attackArc + (bonus.attackArc ?? 0), 360),
      atkSpeed:    base.atkSpeed    + (bonus.atkSpeed    ?? 0),
      lifesteal:   Math.min(base.lifesteal + (bonus.lifesteal ?? 0), 0.12),
      evasion:     base.evasion     + (bonus.evasion     ?? 0),
      critDmg:     flatCritDmg + condCritDmg,
      hpRegen:     base.hpRegen     + (bonus.hpRegen     ?? 0),
      dotBonus:    base.dotBonus    + (bonus.dotBonus    ?? 0) + (enh8 ? (bonus.weaponEnhance8DotBonus ?? 0) : 0) + ((bonus.burnSpread ?? 0) >= 2 ? 0.10 : 0),
      penetration: flatPen,
      dmgVsFire:        bonus.dmgVsFire,
      dmgVsWater:       bonus.dmgVsWater,
      dmgVsGrass:       bonus.dmgVsGrass,
      dmgVsNone:        bonus.dmgVsNone,
      dmgVsAnyElement:  bonus.dmgVsAnyElement,
      dmgVsEliteOrBoss: bonus.dmgVsEliteOrBoss,
      dmgVsSlime:       bonus.dmgVsSlime,
      dmgVsPlant:       bonus.dmgVsPlant,
      dmgVsBoss:        bonus.dmgVsBoss,
      whirlwindRangePct:    bonus.whirlwindRangePct,
      whirlwindDmgPct:      bonus.whirlwindDmgPct,
      slash180DmgPct:       bonus.slash180DmgPct,
      burnMaxStackBonus:    bonus.burnMaxStackBonus,
      burnSpread:           bonus.burnSpread,
      burnSpreadSkillPx:    bonus.burnSpreadSkillPx,
      burnDoubleStack:      bonus.burnDoubleStack,
      dashDistBonus:        bonus.dashDistBonus,
      dashDistPct:          bonus.dashDistPct,
      dashDmgPct:           bonus.dashDmgPct,
      dashDoubleHit:        bonus.dashDoubleHit,
      multiHitNoStagger:    bonus.multiHitNoStagger,
      multiHitDmgPct:       bonus.multiHitDmgPct,
      chargeSlamStunChance: bonus.chargeSlamStunChance,
      chargeSlamDmgPct:     bonus.chargeSlamDmgPct,
      chargeSlamOverload:   bonus.chargeSlamOverload,
      boomerangRangePct:    bonus.boomerangRangePct,
      boomerangDmgPct:      bonus.boomerangDmgPct,
      auraRadiusPct:        bonus.auraRadiusPct,
      auraDmgPct:           bonus.auraDmgPct,
      projectileDistBonus:  bonus.projectileDistBonus,
      projectileDistPct:    bonus.projectileDistPct,
      projectileDmgPct:     bonus.projectileDmgPct,
      projectileFan:        bonus.projectileFan,
      allDmgPct:            bonus.allDmgPct,
      takenDmgPct:          bonus.takenDmgPct,
      dropRateMult:         bonus.dropRateMult || 1,
      condDotStackBonus:    bonus.condDotStackBonus,
      orbitFireBalls:       bonus.orbitFireBalls,
      orbitIceBalls:        bonus.orbitIceBalls,
      orbitBallDmgPct:      bonus.orbitBallDmgPct,
      orbitFireBallDmgPct:  bonus.orbitFireBallDmgPct,
      orbitIceBallDmgPct:   bonus.orbitIceBallDmgPct,
      periodicKnives:          bonus.periodicKnives,
      knifeIntervalReduction:  bonus.knifeIntervalReduction,
      knifeDoubleCount:        bonus.knifeDoubleCount,
      knifeHoming:             bonus.knifeHoming,
      knifeDmgPct:             bonus.knifeDmgPct,
      overkillSplash:          bonus.overkillSplash,
      overkillInfiniteChain:   bonus.overkillInfiniteChain,
      overkillDmgPct:          bonus.overkillDmgPct,
      bloodlust:                  bonus.bloodlust,
      bloodlustDmgPerStack:       bonus.bloodlustDmgPerStack,
      bloodlustMaxStacks:         bonus.bloodlustMaxStacks,
      sanguine:                   bonus.sanguine,
      sanguineMaxStacks:          bonus.sanguineMaxStacks,
      bloodlustAtkSpeedPerStack:  bonus.bloodlustAtkSpeedPerStack,
      damageSplash:            bonus.damageSplash,
      damageSplashPct:         bonus.damageSplashPct,
      damageSplashCount:       bonus.damageSplashCount,
      lightningStrike:      bonus.lightningStrike,
      onHitLightningChance: bonus.onHitLightningChance,
      lightningDmgBonus:          bonus.lightningDmgBonus,
      lightningIntervalReduction: bonus.lightningIntervalReduction,
      lightningSingleTarget:      bonus.lightningSingleTarget,
      divineShieldChance:   bonus.divineShieldChance,
      infiniteDivineShield: bonus.infiniteDivineShield,
      summonFlowerChance:   bonus.summonFlowerChance,
      summonFlowerCap:      bonus.summonFlowerCap,
      summonFlowerCapPair:  bonus.summonFlowerCapPair,
      skillFlowerChance:    bonus.skillFlowerChance,
      skillFlowerCap:       bonus.skillFlowerCap,
      skillFlowerHpPct:     bonus.skillFlowerHpPct,
      summonFlowerDmgPct:   bonus.summonFlowerDmgPct,
      flowerSummonMode:     bonus.flowerSummonMode,
      lavaSlimeCompanion:   bonus.lavaSlimeCompanion,
      executeBelow15:       bonus.executeBelow15,
      freeRevive:           bonus.freeRevive,
      maxHpPct:             bonus.maxHpPct,
      weaponRefineAtk:      bonus.weaponRefineAtk,
      weaponRefineHp:       bonus.weaponRefineHp,
    };
  },

  // ── Internal load helpers (used by SaveStore only) ────────

  setEquippedDirect(slots: (string | null)[]): void {
    for (let i = 0; i < CARD_SLOT_COUNT; i++) equipped[i] = slots[i] ?? null;
  },

  setInventoryDirect(entries: { cardId: string; qty: number }[]): void {
    inventory.clear();
    for (const { cardId, qty } of entries) {
      if (qty > 0) inventory.set(cardId, qty);
    }
  },

  // ── Change listeners ───────────────────────────────────────

  onChange(fn: () => void): void { listeners.push(fn); },

  offChange(fn: () => void): void {
    const idx = listeners.indexOf(fn);
    if (idx !== -1) listeners.splice(idx, 1);
  },

  notify(): void { listeners.forEach(fn => fn()); },
};

