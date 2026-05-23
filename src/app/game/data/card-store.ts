import { StatBonus } from './equipment-data';
import { PlayerStore, EffectiveStats } from './player-store';
import { getCardDef } from './monster-data';
import { SkillTreeStore } from './skill-tree-store';

export const CARD_SLOT_COUNT = 3;

// 3個裝備槽 (cardId or null)
const equipped: (string | null)[] = Array(CARD_SLOT_COUNT).fill(null);

// 卡片庫存: cardId → 數量 (可疊加)
const inventory: Map<string, number> = new Map();

const listeners: Array<() => void> = [];

// 依 cardType 決定同張卡的裝備上限
function getCardStackLimit(cardId: string): number {
  const def = getCardDef(cardId);
  if (!def) return 1;
  if (def.cardType === 'b') return 1;
  if (def.cardType === 'e') return 2;
  return 3;  // normal
}

// ── 組合偵測與加成 ─────────────────────────────────────────
// 傳入已裝備的卡片 ID 陣列，回傳所有觸發的組合加成總和

export interface ComboInfo {
  id: string;    // 組合識別碼
  name: string;  // 顯示名稱
  bonus: StatBonus;
}

function detectCombos(slots: ReadonlyArray<string | null>): ComboInfo[] {
  const cards = slots.filter(Boolean).map(id => getCardDef(id!)).filter(Boolean) as NonNullable<ReturnType<typeof getCardDef>>[];
  if (cards.length === 0) return [];

  const raceCount   = new Map<string, number>();
  const typeSet     = new Set<string>();
  const familySet   = new Set<string>();
  const cardIdCount = new Map<string, number>();

  for (const c of cards) {
    raceCount.set(c.race, (raceCount.get(c.race) ?? 0) + 1);
    typeSet.add(c.cardType);
    familySet.add(c.family);
    cardIdCount.set(c.id, (cardIdCount.get(c.id) ?? 0) + 1);
  }

  // ── 精通（Combo5）：同一張卡疊滿，疊加在任意陣型 combo 上 ──
  let masteryCombo: ComboInfo | null = null;
  for (const [cardId, cnt] of cardIdCount.entries()) {
    const def = getCardDef(cardId);
    if (!def || def.cardType === 'b') continue;
    if (cnt >= getCardStackLimit(cardId)) {
      masteryCombo = {
        id: `combo5_${cardId}`,
        name: `${def.name}精通`,
        bonus: scaleBonusByFactor(def.effect, 0.5),
      };
      break;
    }
  }

  // ── 陣型 combo（互斥，取最高優先）──
  let formationCombo: ComboInfo | null = null;

  // 優先 1：Combo1 同家族×3
  if (!formationCombo && familySet.size === 1 && cards.length === CARD_SLOT_COUNT) {
    const family = [...familySet][0];
    const combo = COMBO1_BONUSES[family];
    if (combo) formationCombo = { id: `combo1_${family}`, name: combo.name, bonus: combo.bonus };
  }

  // 優先 2：Combo2 同種族跨家族 n/e/b 各一
  if (!formationCombo) {
    for (const [race, count] of raceCount.entries()) {
      if (count === 3 && familySet.size >= 2 && typeSet.has('n') && typeSet.has('e') && typeSet.has('b')) {
        if (cards.every(c => c.race === race)) {
          const combo = COMBO2_BONUSES[race];
          if (combo) { formationCombo = { id: `combo2_${race}`, name: combo.name, bonus: combo.bonus }; break; }
        }
      }
    }
  }

  // 優先 3：Combo4 同階級×3
  if (!formationCombo && typeSet.size === 1 && cards.length === CARD_SLOT_COUNT) {
    const type = [...typeSet][0];
    const combo = COMBO4_BONUSES[type];
    if (combo) formationCombo = { id: `combo4_${type}`, name: combo.name, bonus: combo.bonus };
  }

  // 優先 4：Combo3 同種族×3 保底
  if (!formationCombo) {
    for (const [race, count] of raceCount.entries()) {
      if (count === 3) {
        const combo = COMBO3_BONUSES[race];
        if (combo) { formationCombo = { id: `combo3_${race}`, name: combo.name, bonus: combo.bonus }; break; }
      }
    }
  }

  const results: ComboInfo[] = [];
  if (formationCombo) results.push(formationCombo);
  if (masteryCombo)   results.push(masteryCombo);
  return results;
}

/** 將 StatBonus 所有數值乘以 factor（用於精通加成） */
function scaleBonusByFactor(src: StatBonus, factor: number): StatBonus {
  const result: StatBonus = {};
  for (const key of Object.keys(src) as (keyof StatBonus)[]) {
    const v = src[key];
    if (typeof v === 'number') (result as any)[key] = v * factor;
  }
  return result;
}

// ── 組合一加成表（每個家族的專屬效果）──
const COMBO1_BONUSES: Record<string, { name: string; bonus: StatBonus }> = {
  slime_green: { name: '綠史萊姆家族：生命強化', bonus: { hpPct: 0.15 } },
  slime_red:   { name: '紅史萊姆家族：爆擊強化', bonus: { critDmgMult: 1.25 } },
  slime_blue:  { name: '藍史萊姆家族：防禦轉換', bonus: { defToEvasion: 30 } },  // 每30防禦+3%迴避
  slime_white: { name: '白史萊姆家族：迅捷強化', bonus: { atkSpeedMult: 1.20 } },
  slime_zombie:{ name: '殭屍史萊姆家族：燃燒延長', bonus: { burnMaxStackBonus: 3 } },
  slime_lava:  { name: '熔岩史萊姆家族：穿透爆發', bonus: { condPenAtk: 28 } },  // 穿透≥100時攻擊+28
  plant1:      { name: '食人花家族：強攻陣容', bonus: { atk: 15, dmgVsEliteOrBoss: 0.08 } },
  plant2:      { name: '藤蔓花家族：危機本能', bonus: { evasion: 0.06 } },
  plant3:      { name: '不死花家族：召喚強化', bonus: { summonDmgMult: 1.20 } },
  orc1:        { name: '獸人 菁英獸人 獸人族長：蠻力法則', bonus: { critToAtk: 1.0, allDmgPct: 0.10 } },
  orc2:        { name: '獸人戰士 菁英獸人戰士 獸人戰士長：業火狂潮', bonus: { blazingShieldChance: 0.15, blazingShieldAtkPct: 0.15 } },
  orc3:        { name: '獸人武士 菁英獸人武士 獸人武士長：一閃共鳴', bonus: { impaleDmgPct: 0.60, atkSpeedMult: 1.15 } },
  vampire1:    { name: '吸血鬼家族：靈魂收割', bonus: { soulHarvest: 1 } },
  vampire2:    { name: '吸血鬼法師家族：恐懼光環', bonus: { fearAura: 1 } },
  vampire3:    { name: '吸血鬼術士家族：血脈噴張', bonus: { bloodRage: 1 } },
};

// ── 組合二加成表（同種族 N+E+B 不同家族）──
const COMBO2_BONUSES: Record<string, { name: string; bonus: StatBonus }> = {
  slime:   { name: '史萊姆跨族陣容', bonus: { dmgVsAnyElement: 0.10, condCritDmgBonus: 0.10 } },
  flower:  { name: '花怪跨族陣容',   bonus: { hpRegen: 2.0, takenDmgPct: -0.08 } },
  orc:     { name: '獸人跨族狂戰陣容', bonus: { allDmgPct: 0.10, takenDmgPct: 0.05 } },
  vampire: { name: '吸血鬼跨族共鳴', bonus: { lifesteal: 0.025, allDmgPct: 0.08 } },
};

// ── 組合四加成表（同階級×3）──
const COMBO4_BONUSES: Record<string, { name: string; bonus: StatBonus }> = {
  n: { name: '普通卡陣容', bonus: { allDmgPct: 0.10 } },
  e: { name: '菁英卡陣容', bonus: { dmgVsEliteOrBoss: 0.15 } },
  b: { name: 'Boss卡陣容',  bonus: { dmgVsBoss: 0.25 } },
};

// ── 組合三加成表（同種族任意三張）──
const COMBO3_BONUSES: Record<string, { name: string; bonus: StatBonus }> = {
  slime:   { name: '史萊姆族共鳴', bonus: { dmgVsAnyElement: 0.08 } },
  flower:  { name: '花怪族共鳴',   bonus: { hpRegen: 1.5 } },
  orc:     { name: '獸人族共鳴',   bonus: { atk: 10, penetration: 10 } },
  vampire: { name: '吸血鬼族共鳴', bonus: { lifesteal: 0.02, dmgVsNone: 0.10 } },
};

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
      b.burnedEnemyDmgAmp    = (b.burnedEnemyDmgAmp    ?? 0) + (e.burnedEnemyDmgAmp    ?? 0);
      b.condLowHpAtk         = (b.condLowHpAtk         ?? 0) + (e.condLowHpAtk         ?? 0);
      b.freeRevive           = (b.freeRevive           ?? 0) + (e.freeRevive           ?? 0);
      b.maxHpPct             = (b.maxHpPct             ?? 0) + (e.maxHpPct             ?? 0);
      b.weaponRefineAtk      = (b.weaponRefineAtk      ?? 0) + (e.weaponRefineAtk      ?? 0);
      b.weaponRefineHp       = (b.weaponRefineHp       ?? 0) + (e.weaponRefineHp       ?? 0);
      b.critToAtk            = (b.critToAtk            ?? 0) + (e.critToAtk            ?? 0);
      b.blazingShieldChance  = (b.blazingShieldChance  ?? 0) + (e.blazingShieldChance  ?? 0);
      b.blazingShieldAtkPct  = (b.blazingShieldAtkPct  ?? 0) + (e.blazingShieldAtkPct  ?? 0);
      if ((e.blazingShieldMs ?? 0) > 0)
        b.blazingShieldMs = Math.max(b.blazingShieldMs ?? 0, e.blazingShieldMs!);
      b.blazingShieldHealPct = (b.blazingShieldHealPct ?? 0) + (e.blazingShieldHealPct ?? 0);
      b.impaleDmgPct         = (b.impaleDmgPct         ?? 0) + (e.impaleDmgPct         ?? 0);
      if ((e.impaleCharge ?? 0) > 0) {
        b.impaleCharge = b.impaleCharge
          ? Math.min(b.impaleCharge, e.impaleCharge!)
          : e.impaleCharge;
      }
      if ((e.damageCap ?? 0) > 0)
        b.damageCap = b.damageCap ? Math.min(b.damageCap, e.damageCap!) : e.damageCap;
      b.soulHarvest = (b.soulHarvest ?? 0) + (e.soulHarvest ?? 0);
      b.fearAura    = (b.fearAura    ?? 0) + (e.fearAura    ?? 0);
      b.bloodRage   = (b.bloodRage   ?? 0) + (e.bloodRage   ?? 0);
    }
    return b;
  },

  /** 裝備 + 卡片的完整數值，遊戲場景使用此函式 */
  getTotalStats(): EffectiveStats {
    const base     = PlayerStore.getStats();
    const cardBonus = this.getEquippedBonus();
    const skillBonus = SkillTreeStore.getBonus();

    // 合併組合加成
    const combos = detectCombos(equipped);
    const bonus: StatBonus = { ...cardBonus };
    for (const key of Object.keys(skillBonus) as (keyof StatBonus)[]) {
      (bonus as any)[key] = ((bonus[key] as number) ?? 0) + ((skillBonus[key] as number) ?? 0);
    }
    for (const combo of combos) {
      for (const key of Object.keys(combo.bonus) as (keyof StatBonus)[]) {
        // 乘算欄位取最大值而非累加（避免多組合疊乘過強）
        if (key === 'critDmgMult' || key === 'atkSpeedMult' || key === 'summonDmgMult') {
          (bonus as any)[key] = Math.max((bonus[key] as number) ?? 1, (combo.bonus[key] as number) ?? 1);
        } else {
          (bonus as any)[key] = ((bonus[key] as number) ?? 0) + ((combo.bonus[key] as number) ?? 0);
        }
      }
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
    const rawCrit  = Math.min(base.crit + (bonus.crit ?? 0), 1);
    const critConv = bonus.critToAtk ?? 0;
    // critToAtk：暴擊率每1%轉為+N攻擊，同時暴擊判定歸零
    const critConvAtk = critConv > 0 ? Math.round(rawCrit * 100 * critConv) : 0;
    const flatCrit    = critConv > 0 ? 0 : rawCrit;
    const flatAtk  = base.atk   + (bonus.atk ?? 0) + (enh8 ? (bonus.weaponEnhance8Atk ?? 0) : 0) + refineAtk + critConvAtk;
    const flatHp   = base.maxHp + (bonus.hp  ?? 0) + (enh8 ? (bonus.weaponEnhance8Hp  ?? 0) : 0) + refineHp;
    const flatPen  = base.penetration + (bonus.penetration ?? 0);
    const flatCritDmg = base.critDmg + (bonus.critDmg ?? 0);

    // 條件加成 resolve
    const condAtk    = (bonus.condPenAtk    && flatPen  >= 100)  ? (bonus.condPenAtk    ?? 0) : 0;
    const condHpPct  = (bonus.condHpPct     && flatHp   >= 800)  ? (bonus.condHpPct     ?? 0) : 0;
    const condCritDmg= (bonus.condCritDmgBonus && flatCrit >= 0.5) ? (bonus.condCritDmgBonus ?? 0) : 0;

    // 組合一乘算欄位處理
    const critDmgMult    = bonus.critDmgMult    ?? 1;
    const atkSpeedMult   = bonus.atkSpeedMult   ?? 1;
    const summonDmgMult  = bonus.summonDmgMult  ?? 1;
    // 藍史萊姆組合一：每 defToEvasion 防禦 → +3% 迴避
    const defVal = Math.round((base.def + (bonus.def ?? 0) + meleeDef) * (1 + (bonus.defPct ?? 0)));
    const defEvasion = (bonus.defToEvasion && bonus.defToEvasion > 0)
      ? Math.floor(defVal / bonus.defToEvasion) * 0.03
      : 0;

    return {
      atk:         Math.round((flatAtk + condAtk) * (1 + (bonus.atkPct ?? 0))),
      maxHp:       Math.round(flatHp * (1 + (bonus.hpPct ?? 0) + condHpPct + (bonus.maxHpPct ?? 0) + (SkillTreeStore.getAttackMode() === 'aura' ? 0.40 : 0))),
      def:         defVal,
      speed:       base.speed     + (bonus.speed    ?? 0),
      crit:        flatCrit,
      attackArc:   Math.min(base.attackArc + (bonus.attackArc ?? 0), 360),
      atkSpeed:    (base.atkSpeed    + (bonus.atkSpeed    ?? 0)) * atkSpeedMult,
      lifesteal:   Math.min(base.lifesteal + (bonus.lifesteal ?? 0), 0.12),
      evasion:     base.evasion     + (bonus.evasion     ?? 0) + defEvasion,
      critDmg:     (flatCritDmg + condCritDmg) * critDmgMult,
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
      allDmgPct:            (base.allDmgPct ?? 0) + (bonus.allDmgPct ?? 0) || undefined,
      takenDmgPct:          bonus.takenDmgPct,
      potionHealPct:        base.potionHealPct,
      onKillHeal:           base.onKillHeal,
      eliteKillerPct:       base.eliteKillerPct,
      dropRatePct:          base.dropRatePct,
      rarityBonus:          base.rarityBonus,
      killShieldPerKill:    base.killShieldPerKill,
      executePct:           base.executePct,
      regenShieldMax:       base.regenShieldMax,
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
      summonFlowerDmgPct:   (bonus.summonFlowerDmgPct ?? 0) * summonDmgMult || bonus.summonFlowerDmgPct,
      flowerSummonMode:     bonus.flowerSummonMode,
      lavaSlimeCompanion:   bonus.lavaSlimeCompanion,
      executeBelow15:       bonus.executeBelow15,
      burnedEnemyDmgAmp:    bonus.burnedEnemyDmgAmp,
      condLowHpAtk:         bonus.condLowHpAtk,
      freeRevive:           bonus.freeRevive,
      maxHpPct:             bonus.maxHpPct,
      weaponRefineAtk:      bonus.weaponRefineAtk,
      weaponRefineHp:       bonus.weaponRefineHp,
      critToAtk:            bonus.critToAtk,
      blazingShieldChance:  bonus.blazingShieldChance,
      blazingShieldAtkPct:  bonus.blazingShieldAtkPct,
      blazingShieldMs:      bonus.blazingShieldMs,
      blazingShieldHealPct: bonus.blazingShieldHealPct,
      impaleCharge:         bonus.impaleCharge,
      impaleDmgPct:         bonus.impaleDmgPct,
      damageCap:            bonus.damageCap,
      soulHarvest:          bonus.soulHarvest,
      fearAura:             bonus.fearAura,
      bloodRage:            bonus.bloodRage,
      lifestealInstant:     bonus.lifestealInstant,
    };
  },

  /** 回傳目前觸發的所有組合資訊（供 UI 顯示用） */
  getComboInfos(): ComboInfo[] {
    return detectCombos(equipped);
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

