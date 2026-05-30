import { t } from '../i18n/i18n';

export type EquipSlot     = 'hat' | 'outfit' | 'shoes' | 'ring1' | 'ring2' | 'sword';
export type EquipCategory = 'hat' | 'outfit' | 'shoes' | 'ring'  | 'sword';
export type EquipQuality  = 'normal' | 'good' | 'fine' | 'perfect' | 'legendary';
export type StatKey       = 'atk' | 'hp' | 'def' | 'crit' | 'speed' | 'atkSpeed' | 'lifesteal' | 'evasion' | 'critDmg' | 'hpRegen' | 'dotBonus' | 'penetration'
                          | 'potionHealPct' | 'onKillHeal' | 'eliteKillerPct' | 'dropRatePct' | 'rarityBonus'
                          | 'killShieldPerKill' | 'executePct' | 'regenShieldMax' | 'allDmgPct' | 'maxHpPct';
export type AttackBehavior = 'slash180' | 'whirlwind' | 'dashPierce' | 'projectile' | 'aura' | 'multiHit' | 'chargeSlam' | 'boomerang' | 'magicFire' | 'knifeThrow' | 'flowerMode';

export type Element = 'none' | 'water' | 'fire' | 'grass';

export const ELEMENT_NAMES: Record<Element, string> = {
  none: t('equip.element.none'), water: t('equip.element.water'), fire: t('equip.element.fire'), grass: t('equip.element.grass'),
};

export const ELEMENT_COLORS: Record<Element, number> = {
  none: 0x888888, water: 0x44aaff, fire: 0xff5522, grass: 0x44cc44,
};

export function getElementMultiplier(atk: Element, def: Element): number {
  if (atk === 'none' || def === 'none') return 1;
  if ((atk === 'water' && def === 'fire')  ||
      (atk === 'fire'  && def === 'grass') ||
      (atk === 'grass' && def === 'water')) return 1.35;
  if ((atk === 'fire'  && def === 'water') ||
      (atk === 'grass' && def === 'fire')  ||
      (atk === 'water' && def === 'grass')) return 0.75;
  return 1;
}

// Kept for card system compatibility
export interface StatBonus {
  // ── 固定值 ──
  atk?:         number;
  hp?:          number;
  speed?:       number;
  def?:         number;
  crit?:        number;
  attackArc?:   number;
  atkSpeed?:    number;
  evasion?:     number;
  critDmg?:     number;
  dotBonus?:    number;
  penetration?: number;
  lifesteal?:   number;
  hpRegen?:     number;
  // ── 百分比加成（套用在固定值加完之後）──
  atkPct?:      number;  // ATK ×(1+X)
  hpPct?:       number;  // MaxHP ×(1+X)
  defPct?:      number;  // DEF ×(1+X)
  // ── 條件加成 ──
  weaponEnhance8Atk?:      number;  // 武器≥+8 時 ATK+X
  weaponEnhance8Hp?:       number;  // 武器≥+8 時 HP+X
  weaponEnhance8DotBonus?: number;  // 武器≥+8 時 dotBonus+X
  // ── 目標傷害加成（乘數，加在 1 上面）──
  dmgVsFire?:         number;  // 對火屬性 +X%
  dmgVsWater?:        number;  // 對水屬性 +X%
  dmgVsGrass?:        number;  // 對草屬性 +X%
  dmgVsNone?:         number;  // 對無屬性 +X%
  dmgVsAnyElement?:   number;  // 對火/水/草 +X%
  dmgVsEliteOrBoss?:  number;  // 對菁英/Boss +X%
  dmgVsSlime?:        number;  // 對史萊姆種族 +X%
  dmgVsPlant?:        number;  // 對花草種族 +X%
  dmgVsBoss?:         number;  // 對 Boss 專屬 +X%
  // ── 技能特化 ──
  whirlwindRangePct?:   number;  // 旋風斬範圍 ×(1+X)
  whirlwindDmgPct?:     number;  // 旋風斬傷害 ×(1+X)
  slash180DmgPct?:      number;  // 半月斬傷害 ×(1+X)
  burnMaxStackBonus?:   number;  // 燃燒上限 +X 層
  burnSpread?:          number;  // 燃燒擴散半徑（張數 × 80px）
  burnSpreadSkillPx?:   number;  // 技能燃燒擴散半徑（CSS px，game scene 乘 DPR）
  burnDoubleStack?:     number;  // 業火：1 = 所有目標每 tick 疊兩層
  dashDistBonus?:       number;  // 瞬步斬距離 +X（物理像素，卡片用）
  dashDistPct?:         number;  // 瞬步斬距離 ×(1+X)（百分比，技能用）
  dashDmgPct?:          number;  // 瞬步斬傷害 ×(1+X)
  dashDoubleHit?:       number;  // 瞬步二連（1 = 啟用，每次 65%）
  multiHitNoStagger?:   number;  // 五連斬無僵直（1 = 啟用）
  multiHitDmgPct?:      number;  // 五連斬傷害 ×(1+X)
  chargeSlamStunChance?:number;  // 蓄力重擊暈眩機率
  chargeSlamDmgPct?:    number;  // 蓄力重擊傷害 ×(1+X)
  chargeSlamOverload?:  number;  // 超載蓄力（1=啟用，蓄力時間×2，傷害×1.5）
  boomerangRangePct?:   number;  // 迴旋飛刃範圍 ×(1+X)
  boomerangDmgPct?:     number;  // 迴旋飛刃傷害 ×(1+X)
  auraRadiusPct?:       number;  // 血環半徑 ×(1+X)
  auraDmgPct?:          number;  // 血環傷害 ×(1+X)
  projectileDistBonus?: number;  // 風刃距離 +X（物理像素，卡片用）
  projectileDistPct?:   number;  // 風刃距離 ×(1+X)（百分比，技能用）
  projectileDmgPct?:    number;  // 風刃傷害 ×(1+X)
  projectileFan?:       number;  // 扇形風刃（1=啟用，三發各80%）
  // ── 條件判斷加成（在 getTotalStats 內 resolve）──
  condCritDmgBonus?:    number;  // 爆擊率≥50% 時 critDmg +X
  condPenAtk?:          number;  // 穿甲≥100 時 ATK +X
  condHpPct?:           number;  // maxHp≥800 時 HP ×(1+X)
  // ── 玻璃砲 ──
  allDmgPct?:           number;  // 所有主動攻擊傷害 ×(1+X)（不含 burn tick）
  takenDmgPct?:         number;  // 受到傷害 ×(1+X)
  // ── 條件 DoT ──
  condDotStackBonus?:   number;  // dotBonus≥30% 時每層 burn +X（加入 1+dotBonus 後的乘數）
  // ── 特殊機制（卡片觸發效果）──
  orbitFireBalls?:      number;  // 繞玩家旋轉火球數量（疊加，ATK×15%，1秒傷害CD/怪）
  orbitIceBalls?:       number;  // 繞玩家旋轉冰球數量（疊加，ATK×10%+緩速20%，1秒CD）
  periodicKnives?:      number;  // 每4秒飛刀層數（1=6方位，2=12方位，ATK×40%，穿透）
  knifeIntervalReduction?: number; // 飛刀冷卻縮短（ms）
  knifeDoubleCount?:       number; // 飛刀數量加倍
  knifeHoming?:            number; // 飛刀追蹤（數量減半）
  knifeDmgPct?:            number; // 飛刀傷害加成
  overkillSplash?:      number;  // 溢出傷害AOE（1=啟用，半徑15px）
  overkillInfiniteChain?: number; // 溢出可無限連鎖
  overkillDmgPct?:        number; // 溢出傷害加成
  overkillRadiusMult?:    number; // 溢出範圍倍率
  bloodlust?:                  number; // 暴徒本能（1=啟用）
  bloodlustDmgPerStack?:       number; // 暴徒：每層傷害加成
  bloodlustMaxStacks?:         number; // 暴徒層數上限
  sanguine?:                   number; // 嗜血本能（1=啟用）
  sanguineMaxStacks?:          number; // 嗜血層數上限
  bloodlustAtkSpeedPerStack?:  number; // 嗜血：每層攻速加成
  damageSplash?:          number; // 傷害濺射（1=啟用）
  damageSplashPct?:       number; // 濺射傷害比例
  damageSplashCount?:     number; // 濺射目標數量
  lightningStrike?:     number;  // 每秒落雷最遠敵人（1=啟用，ATK×12%）
  divineShieldChance?:  number;  // 攻擊時觸發神盾護體機率（DEF+20持續3秒，機率疊加）
  summonFlowerChance?:  number;  // 攻擊時召喚友軍花怪機率（卡片用）
  summonFlowerCap?:     number;  // 友軍花怪上限 +N（卡片用）
  summonFlowerCapPair?: number;  // 友軍花怪上限 pair 加成（累積2才+1，菁英卡用）
  skillFlowerChance?:   number;  // 攻擊時召喚不死花機率（技能樹用）
  skillFlowerCap?:      number;  // 不死花同時存在上限（技能樹用，root=1）
  skillFlowerHpPct?:    number;  // 不死花HP加成倍率（技能樹用）
  summonFlowerDmgPct?:  number;  // 不死花傷害加成
  freeRevive?:          number;  // 每局免費復活次數（滿血，無敵1秒）
  // ── Boss卡片專屬效果 ──
  maxHpPct?:            number;  // 最大HP百分比變化（可負數，-0.2=-20%）
  orbitBallDmgPct?:     number;  // 旋轉球（火球/冰球）傷害加成（1.0=+100%）
  orbitFireBallDmgPct?: number;  // 火球專屬傷害加成
  orbitIceBallDmgPct?:  number;  // 冰球專屬傷害加成
  onHitLightningChance?:number;  // 攻擊觸發落雷機率（隨機目標，ATK×50%×lightningDmgBonus）
  lightningDmgBonus?:         number;  // 落雷傷害加成（1.0=+100%，套用在落雷傷害上）
  lightningIntervalReduction?: number; // 落雷間隔縮短（ms）
  lightningSingleTarget?:      number; // 落雷變為單體
  infiniteDivineShield?:number;  // 無限神盾護體（1=啟用，受傷後立即重新觸發）
  weaponRefineAtk?:     number;  // 武器每精煉+2、ATK+X（累計）
  weaponRefineHp?:      number;  // 武器每精煉+2、HP+X（累計）
  flowerSummonMode?:    number;  // 取消原攻擊，改為召喚花怪模式（最多3隻，CD 3s，ATK×35%，HP×100%，穿透，0.8s攻速，對BOSS-22.5%）
  lavaSlimeCompanion?:  number;  // 岩漿史萊姆夥伴（HP×120%，ATK×70%，40px巡邏，100px aggro，8s重生）
  executeBelow15?:      number;  // 敵人HP低於12%時直接斬殺（欄位名稱保留相容舊存檔）
  burnedEnemyDmgAmp?:  number;  // 對燃燒中敵人傷害加成
  condLowHpAtk?:       number;  // 玩家HP<40%時ATK+X
  // ── 組合加成專用乘算欄位 ──
  critDmgMult?:         number;  // 爆擊傷害乘算（1.25 = ×1.25）
  atkSpeedMult?:        number;  // 攻速乘算
  summonDmgMult?:       number;  // 召喚物傷害乘算
  defToEvasion?:        number;  // 每N防禦轉換迴避率（值為除數，30 = 每30防禦+3%迴避）
  // ── 獸人族專屬機制 ──
  critToAtk?:             number;  // 每1%暴擊率→+N攻擊力（暴擊判定同時關閉）
  blazingShieldChance?:   number;  // 受擊時觸發業火盾機率
  blazingShieldAtkPct?:   number;  // 業火盾期間ATK加成比例
  blazingShieldMs?:       number;  // 業火盾持續時間（ms）
  blazingShieldHealPct?:  number;  // 業火盾觸發時回復HP%
  impaleCharge?:          number;  // 蓄勁一閃：每N次攻擊觸發爆發
  impaleDmgPct?:          number;  // 蓄勁一閃：爆發傷害加成比例
  // ── 吸血鬼族專屬機制 ──
  damageCap?:   number;  // 單次受傷上限（佔最大HP比例，0.51=51%）
  soulHarvest?: number;  // 靈魂收割：擊殺觸發衝擊波+回血（1=啟用）
  fearAura?:    number;  // 恐懼光環：降低周圍敵人攻速和移動速度（1=啟用）
  bloodRage?:   number;  // 血脈噴張：低血量時傷害和吸血量增加（1=啟用）
  lifestealInstant?: number;  // 即時吸血：跳過蓄血池，命中時直接回復（1=啟用）
  // ── 靜止加成 ──
  standstillDmgPct?:       number;  // 不移動時傷害加成比例（0.05=+5%）
  standstillDmgReductionPct?: number;  // 不移動時受傷減少比例（0.03=減3%）
  // ── 攻擊觸發飛刀 ──
  onHitKnifeChance?: number;  // 每次攻擊命中有X%機率觸發散射飛刀
  // ── 再生護盾 ──
  regenShieldMax?:    number;  // 自動再生護盾上限（HP值，停止受傷2.5s後每秒回填25%）
  regenShieldMaxPct?: number;  // 自動再生護盾上限（最大HP倍率，0.15=15%）
}

// ── Affix system ───────────────────────────────────────────────────────────────

export interface Affix {
  stat:  StatKey;
  value: number;
}

export interface EquipmentItem {
  id:          string;
  name:        string;
  slot:        EquipSlot;
  texture:     string;          // Phaser texture key, e.g. 'equip_hat3'
  quality:     EquipQuality;
  affixes:     Affix[];         // 非武器 2 條；武器 3 條（攻擊力固定＋2隨機）
  enhancement: number;          // 0~10
  enhanceLog:  number[][];      // 每次強化提升的詞綴 index，用於退階還原
  baseAffixes?: Affix[];        // 第一次精煉前的詞綴快照，供重鑄還原用
  favorite?:   boolean;         // 最愛標記，防止被販售或市場上架
}

// ── Constants ──────────────────────────────────────────────────────────────────

// 品質決定詞綴數量（非武器）；武器在此基礎上額外加固定 ATK 詞綴
export const QUALITY_AFFIX_COUNT: Record<EquipQuality, number> = {
  normal: 1, good: 2, fine: 3, perfect: 4, legendary: 0,
};

// 所有品質共用同一數值範圍，鐘型分布（3次均值）
// 依詞墜類型分三級浮動範圍
const ROLL_COMBAT:  [number, number] = [0.50, 1.50]; // 戰鬥核心 ±50%
const ROLL_DEFENSE: [number, number] = [0.70, 1.30]; // 防禦生存 ±30%
const ROLL_UTILITY: [number, number] = [0.85, 1.15]; // 功能輔助 ±15%

export const STAT_ROLL_RANGE: Record<StatKey, [number, number]> = {
  atk:              ROLL_COMBAT,
  crit:             ROLL_COMBAT,
  critDmg:          ROLL_COMBAT,
  atkSpeed:         ROLL_COMBAT,
  dotBonus:         ROLL_COMBAT,
  lifesteal:        ROLL_COMBAT,
  penetration:      ROLL_COMBAT,
  eliteKillerPct:   ROLL_COMBAT,
  executePct:       ROLL_COMBAT,
  allDmgPct:        ROLL_COMBAT,
  hp:               ROLL_DEFENSE,
  def:              ROLL_DEFENSE,
  evasion:          ROLL_DEFENSE,
  onKillHeal:       ROLL_DEFENSE,
  regenShieldMax:   ROLL_DEFENSE,
  killShieldPerKill:ROLL_DEFENSE,
  maxHpPct:         ROLL_DEFENSE,
  speed:            ROLL_UTILITY,
  hpRegen:          ROLL_UTILITY,
  dropRatePct:      ROLL_UTILITY,
  rarityBonus:      ROLL_UTILITY,
  potionHealPct:    ROLL_UTILITY,
};

function rollBell(range: [number, number]): number {
  const [lo, hi] = range;
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  return lo + r * (hi - lo);
}

// 武器攻擊力依品質獨立區間（鐘型分布）
export const SWORD_ATK_RANGE: Record<EquipQuality, [number, number]> = {
  normal:  [ 8, 28],
  good:    [16, 40],
  fine:    [28, 52],
  perfect: [40, 64],
  legendary: [0, 0],
};

function rollAtkForQuality(quality: EquipQuality): number {
  const [lo, hi] = SWORD_ATK_RANGE[quality];
  const r = (Math.random() + Math.random() + Math.random()) / 3;
  return Math.round(lo + r * (hi - lo));
}

export const QUALITY_NAMES: Record<EquipQuality, string> = {
  normal: t('equip.quality.normal'), good: t('equip.quality.good'), fine: t('equip.quality.fine'), perfect: t('equip.quality.perfect'), legendary: t('equip.quality.legendary'),
};

export const QUALITY_COLORS: Record<EquipQuality, number> = {
  normal:  0xaaaaaa,
  good:    0x44dd44,
  fine:    0x4488ff,
  perfect: 0xffdd00,
  legendary: 0xee2222,
};

export const SLOT_NAMES: Record<EquipSlot, string> = {
  hat: t('equip.slot.hat'), outfit: t('equip.slot.outfit'), shoes: t('equip.slot.shoes'),
  ring1: t('equip.slot.ring1'), ring2: t('equip.slot.ring2'), sword: t('equip.slot.sword'),
};

export const STAT_NAMES: Record<StatKey, string> = {
  atk:              t('stat.atk'),
  hp:               t('stat.hp'),
  def:              t('stat.def'),
  crit:             t('stat.crit'),
  speed:            t('stat.speed'),
  atkSpeed:         t('stat.atkSpeed'),
  lifesteal:        t('stat.lifesteal'),
  evasion:          t('stat.evasion'),
  critDmg:          t('stat.critDmg'),
  hpRegen:          t('stat.hpRegen'),
  dotBonus:         t('stat.dotBonus'),
  penetration:      t('stat.penetration'),
  potionHealPct:    t('stat.potionHealPct'),
  onKillHeal:       t('stat.onKillHeal'),
  eliteKillerPct:   t('stat.eliteKillerPct'),
  dropRatePct:      t('stat.dropRatePct'),
  rarityBonus:      t('stat.rarityBonus'),
  killShieldPerKill:t('stat.killShieldPerKill'),
  executePct:       t('stat.executePct'),
  regenShieldMax:   t('stat.regenShieldMax'),
  allDmgPct:        t('stat.allDmgPct'),
  maxHpPct:         t('stat.maxHpPct'),
};

const PCT_DISPLAY  = new Set(['crit', 'atkSpeed', 'lifesteal', 'evasion', 'critDmg', 'dotBonus',
  'potionHealPct', 'eliteKillerPct', 'dropRatePct', 'rarityBonus', 'executePct', 'allDmgPct', 'maxHpPct']);
const DEC2_DISPLAY = new Set(['hpRegen']);

export function fmtAffixValue(stat: string, value: number): string {
  if (PCT_DISPLAY.has(stat))  return (value * 100).toFixed(2) + '%';
  if (DEC2_DISPLAY.has(stat)) return value.toFixed(2);
  return String(value);
}

export const BEHAVIOR_NAMES: Record<AttackBehavior, string> = {
  slash180:   t('behavior.slash180'),
  whirlwind:  t('behavior.whirlwind'),
  dashPierce: t('behavior.dashPierce'),
  projectile: t('behavior.projectile'),
  aura:       t('behavior.aura'),
  multiHit:   t('behavior.multiHit'),
  chargeSlam: t('behavior.chargeSlam'),
  boomerang:  t('behavior.boomerang'),
  magicFire:  t('behavior.magicFire'),
  knifeThrow: t('behavior.knifeThrow'),
  flowerMode: t('behavior.flowerMode'),
};

export interface BehaviorInfo {
  desc:         string;
  formula:      string[];
  relatedStats: { stat: StatKey; note: string }[];
}

export const BEHAVIOR_INFO: Record<AttackBehavior, BehaviorInfo> = {
  slash180: {
    desc:    t('behavior.slash180.desc'),
    formula: [t('behavior.slash180.f1'), t('behavior.slash180.f2'), t('behavior.slash180.f3')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  whirlwind: {
    desc:    t('behavior.whirlwind.desc'),
    formula: [t('behavior.whirlwind.f1'), t('behavior.whirlwind.f2'), t('behavior.whirlwind.f3')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  dashPierce: {
    desc:    t('behavior.dashPierce.desc'),
    formula: [t('behavior.dashPierce.f1'), t('behavior.dashPierce.f2')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  projectile: {
    desc:    t('behavior.projectile.desc'),
    formula: [t('behavior.projectile.f1'), t('behavior.projectile.f2')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  aura: {
    desc:    t('behavior.aura.desc'),
    formula: [t('behavior.aura.f1'), t('behavior.aura.f2'), t('behavior.aura.f3')],
    relatedStats: [
      { stat: 'hp',       note: t('stat.hp') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  multiHit: {
    desc:    t('behavior.multiHit.desc'),
    formula: [t('behavior.multiHit.f1'), t('behavior.multiHit.f2'), t('behavior.multiHit.f3')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  chargeSlam: {
    desc:    t('behavior.chargeSlam.desc'),
    formula: [t('behavior.chargeSlam.f1'), t('behavior.chargeSlam.f2')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  boomerang: {
    desc:    t('behavior.boomerang.desc'),
    formula: [t('behavior.boomerang.f1'), t('behavior.boomerang.f2')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'crit',     note: t('stat.crit') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  magicFire: {
    desc:    t('behavior.magicFire.desc'),
    formula: [t('behavior.magicFire.f1'), t('behavior.magicFire.f2'), t('behavior.magicFire.f3')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  knifeThrow: {
    desc:    t('behavior.knifeThrow.desc'),
    formula: [t('behavior.knifeThrow.f1'), t('behavior.knifeThrow.f2')],
    relatedStats: [
      { stat: 'atk',      note: t('stat.atk') },
      { stat: 'atkSpeed', note: t('stat.atkSpeed') },
    ],
  },
  flowerMode: {
    desc:    t('behavior.flowerMode.desc'),
    formula: [t('behavior.flowerMode.f1'), t('behavior.flowerMode.f2')],
    relatedStats: [
      { stat: 'atk', note: t('stat.atk') },
      { stat: 'hp',  note: t('stat.hp') },
    ],
  },
};

export const STAT_BASE: Record<StatKey, number> = {
  atk:       20,
  hp:        18,
  def:         5,
  crit:       0.025,
  speed:     12,
  atkSpeed:   0.03,
  lifesteal:  0.003,
  evasion:    0.02,
  critDmg:     0.05,
  hpRegen:     1.0,
  dotBonus:    0.075,
  penetration:  7,
  potionHealPct:    0.025,
  onKillHeal:       4,
  eliteKillerPct:   0.04,
  dropRatePct:      0.025,
  rarityBonus:      0.03,
  killShieldPerKill: 5,
  executePct:       0.025,
  regenShieldMax:   12,
  allDmgPct:        0.035,
  maxHpPct:         0.025,
};

export const ENHANCE_INCREMENT: Record<StatKey, number> = {
  atk:       1,
  hp:        2,
  def:       1,
  crit:      0.003,
  speed:     1,
  atkSpeed:  0.003,
  lifesteal: 0.00042,
  evasion:   0.0015,
  critDmg:   0.005,
  hpRegen:   0.12,
  dotBonus:  0.010,
  penetration: 1,
  potionHealPct:    0.005,
  onKillHeal:       1,
  eliteKillerPct:   0.006,
  dropRatePct:      0.006,
  rarityBonus:      0.004,
  killShieldPerKill:2,
  executePct:       0.004,
  regenShieldMax:   3,
  allDmgPct:        0.005,
  maxHpPct:         0.005,
};

export const ENHANCE_LEVEL_MULT: Record<number, number> = {
  1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 4, 7: 5, 8: 6, 9: 8, 10: 10,
};

// Affix pools per slot category
// 武器固定有攻擊力+攻擊模式，此 pool 只用於剩餘 2 條隨機詞墜
export const SLOT_AFFIX_POOL: Record<EquipCategory, StatKey[]> = {
  sword:  ['crit', 'critDmg', 'atkSpeed', 'dotBonus', 'lifesteal', 'penetration', 'eliteKillerPct', 'executePct', 'allDmgPct'],
  hat:    ['hp', 'def', 'hpRegen', 'crit', 'atkSpeed', 'evasion', 'onKillHeal', 'regenShieldMax', 'maxHpPct', 'killShieldPerKill'],
  outfit: ['hp', 'def', 'lifesteal', 'evasion', 'hpRegen', 'onKillHeal', 'killShieldPerKill', 'regenShieldMax', 'maxHpPct'],
  shoes:  ['speed', 'hp', 'def', 'evasion', 'hpRegen', 'dropRatePct', 'rarityBonus', 'killShieldPerKill', 'onKillHeal', 'regenShieldMax', 'maxHpPct'],
  ring:   ['critDmg', 'dotBonus', 'crit', 'atkSpeed', 'penetration', 'potionHealPct', 'dropRatePct', 'rarityBonus', 'allDmgPct', 'eliteKillerPct'],
};

export const ATTACK_BEHAVIORS: AttackBehavior[] = [
  'slash180', 'whirlwind', 'dashPierce', 'projectile', 'aura', 'multiHit', 'chargeSlam', 'boomerang', 'magicFire',
];

const TEXTURE_COUNT: Record<EquipCategory, number> = {
  hat: 5, outfit: 5, shoes: 5, ring: 5, sword: 70,
};

// Valid sword texture numbers — excludes missing/reserved files (13,17 moved to red; 40 never existed; 58 moved to red)
const SWORD_VALID_TEXTURES: number[] = [
  ...Array.from({ length: 39 }, (_, i) => i + 1).filter(n => n !== 13 && n !== 17),
  ...Array.from({ length: 30 }, (_, i) => i + 41).filter(n => n !== 58),
];

const PCT_STATS = new Set<StatKey>(['crit', 'atkSpeed', 'lifesteal', 'evasion', 'critDmg', 'dotBonus', 'hpRegen',
  'potionHealPct', 'eliteKillerPct', 'dropRatePct', 'rarityBonus', 'executePct', 'allDmgPct', 'maxHpPct']);

// ── Helpers ────────────────────────────────────────────────────────────────────

export function slotToCategory(slot: EquipSlot): EquipCategory {
  return (slot === 'ring1' || slot === 'ring2') ? 'ring' : slot as EquipCategory;
}

function pickAffixes(category: EquipCategory, count: number): Affix[] {
  const pool = [...SLOT_AFFIX_POOL[category]];
  const chosen: StatKey[] = [];
  while (chosen.length < count && pool.length > 0) {
    const i = Math.floor(Math.random() * pool.length);
    chosen.push(pool.splice(i, 1)[0]);
  }
  return chosen.map(stat => {
    const raw = STAT_BASE[stat] * rollBell(STAT_ROLL_RANGE[stat]);
    const value = PCT_STATS.has(stat)
      ? Math.round(raw * 1000) / 1000
      : Math.round(raw);
    return { stat, value };
  });
}

// ── Generation ─────────────────────────────────────────────────────────────────

export function generateEquipment(slot: EquipSlot, quality: EquipQuality): EquipmentItem {
  const cat    = slotToCategory(slot);
  const texNum = slot === 'sword'
    ? SWORD_VALID_TEXTURES[Math.floor(Math.random() * SWORD_VALID_TEXTURES.length)]
    : Math.floor(Math.random() * TEXTURE_COUNT[cat]) + 1;

  let affixes: Affix[];

  if (slot === 'sword') {
    const fixedAtk: Affix = { stat: 'atk', value: rollAtkForQuality(quality) };
    affixes = [fixedAtk, ...pickAffixes('sword', QUALITY_AFFIX_COUNT[quality])];
  } else {
    affixes = pickAffixes(cat, QUALITY_AFFIX_COUNT[quality]);
  }

  return {
    id:          `${slot}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name:        SLOT_NAMES[slot],
    slot,
    texture:     `equip_${cat}${texNum}`,
    quality,
    affixes,
    enhancement: 0,
    enhanceLog:  [],
  };
}

export function randomQuality(weights?: Partial<Record<EquipQuality, number>>, rarityBonus: number = 0): EquipQuality {
  const w = { normal: 0.50, good: 0.30, fine: 0.15, perfect: 0.05, ...weights };
  if (rarityBonus > 0) {
    w.good    *= (1 + rarityBonus * 0.5);
    w.fine    *= (1 + rarityBonus * 1.0);
    w.perfect *= (1 + rarityBonus * 2.0);
  }
  const total = (w.normal ?? 0) + (w.good ?? 0) + (w.fine ?? 0) + (w.perfect ?? 0);
  const roll = Math.random() * total;
  if (roll < w.normal!)                          return 'normal';
  if (roll < w.normal! + w.good!)                return 'good';
  if (roll < w.normal! + w.good! + w.fine!)      return 'fine';
  return 'perfect';
}

export type MonsterType = 'small' | 'elite' | 'boss';

const DROP_QUALITY_WEIGHTS: Record<MonsterType, Record<number, Record<EquipQuality, number>>> = {
  small: {
    1: { normal: 95,   good:  5,    fine:  0,    perfect: 0,   legendary: 0 },
    2: { normal: 80,   good: 20,    fine:  0,    perfect: 0,   legendary: 0 },
    3: { normal: 78,   good: 20.5,  fine:  1.5,  perfect: 0,   legendary: 0 },
    4: { normal: 75,   good: 21.4,  fine:  3.0,  perfect: 0.6, legendary: 0 },
    5: { normal: 70,   good: 24,    fine:  5.1,  perfect: 0.9, legendary: 0 },
  },
  elite: {
    1: { normal: 78.8, good: 21.2,  fine:  0,    perfect: 0,   legendary: 0 },
    2: { normal: 58.8, good: 41.2,  fine:  0,    perfect: 0,   legendary: 0 },
    3: { normal: 50,   good: 44,    fine:  6,    perfect: 0,   legendary: 0 },
    4: { normal: 47.2, good: 36,    fine: 15.4,  perfect: 1.4, legendary: 0 },
    5: { normal: 44.7, good: 31.3,  fine: 21,    perfect: 3,   legendary: 0 },
  },
  boss: {
    1: { normal: 85.8, good: 15,    fine:  0,    perfect: 0,   legendary: 0 },
    2: { normal: 70,   good: 30,    fine:  0,    perfect: 0,   legendary: 0 },
    3: { normal: 55,   good: 33,    fine: 12,    perfect: 0,   legendary: 0 },
    4: { normal: 49,   good: 28,    fine: 20.9,  perfect: 2.1, legendary: 0 },
    5: { normal: 47.1, good: 23.4,  fine: 25.7,  perfect: 3.8, legendary: 0 },
  },
};

export function getDropQualityWeights(type: MonsterType, star: number): Record<EquipQuality, number> {
  const s = Math.min(Math.max(Math.round(star), 1), 5);
  return DROP_QUALITY_WEIGHTS[type][s];
}

export function getItemStats(item: EquipmentItem): Partial<Record<StatKey, number>> {
  const out: Partial<Record<StatKey, number>> = {};
  for (const a of item.affixes) {
    out[a.stat] = (out[a.stat] ?? 0) + a.value;
  }
  return out;
}

// ── Refinement system constants ────────────────────────────────────────────────

export const ENHANCE_MAX = 10;

export const ENHANCE_COST: Record<number, number> = {
  0: 1, 1: 1, 2: 1, 3: 1, 4: 1,
  5: 2, 6: 2, 7: 2, 8: 3, 9: 3,
};

export const EQUIP_SELL_BASE: Record<EquipQuality, number> = {
  normal:  20,
  good:    65,
  fine:    180,
  perfect: 450,
  legendary: 2000,
};

export function calcEquipSellPrice(item: EquipmentItem): number {
  return Math.round((EQUIP_SELL_BASE[item.quality] ?? 20) * (1 + 0.15 * (item.enhancement ?? 0)));
}

// 失敗不退階，成功率略低於原版
export const ENHANCE_RATE: Record<number, number> = {
  0: 0.70, 1: 0.60, 2: 0.55, 3: 0.48, 4: 0.40,
  5: 0.35, 6: 0.22, 7: 0.14, 8: 0.10, 9: 0.06,
};

export const ENHANCE_ALL_AFFIX_CHANCE = 0.40;

// 每次精煉各詞綴的隨機增幅範圍（線性，套用於基底值，對標現行 +10 水準）
export const REFINE_INCREMENT_RANGE: Record<StatKey, [number, number]> = {
  atk:         [5,      10    ],
  hp:          [6,      9     ],
  def:         [2,      3     ],
  crit:        [0.008,  0.012 ],
  speed:       [4,      6     ],
  atkSpeed:    [0.008,  0.012 ],
  lifesteal:   [0.0014, 0.0021],
  evasion:     [0.006,  0.009 ],
  critDmg:     [0.013,  0.020 ],
  hpRegen:     [0.4,    0.6   ],
  dotBonus:    [0.030,  0.045 ],
  penetration: [2.5,    3.5   ],
  potionHealPct:    [0.008, 0.012 ],
  onKillHeal:       [1.2,   1.8   ],
  eliteKillerPct:   [0.012, 0.018 ],
  dropRatePct:      [0.008, 0.012 ],
  rarityBonus:      [0.008, 0.012 ],
  killShieldPerKill:[1,     2     ],
  executePct:       [0.008, 0.012 ],
  regenShieldMax:   [3,     5     ],
  allDmgPct:        [0.012, 0.018 ],
  maxHpPct:         [0.008, 0.012 ],
};

// 精煉成功：提升指定詞綴，若未指定則隨機抽一條；boostAll=true 時提升全部詞綴
export function applyEnhancement(item: EquipmentItem, forcedIndex?: number, boostAll?: boolean): number[] {
  if (item.enhancement >= ENHANCE_MAX) return [];
  if (!item.baseAffixes) item.baseAffixes = item.affixes.map(a => ({ ...a }));

  const indices: number[] = [];

  if (boostAll) {
    for (let i = 0; i < item.affixes.length; i++) indices.push(i);
  } else if (forcedIndex !== undefined && forcedIndex < item.affixes.length) {
    indices.push(forcedIndex);
  } else {
    const pool = item.affixes.map((_, i) => i);
    const pick = Math.floor(Math.random() * pool.length);
    indices.push(pool[pick]);
  }

  for (const idx of indices) {
    const { stat } = item.affixes[idx];
    const [lo, hi] = REFINE_INCREMENT_RANGE[stat];
    const inc = lo + Math.random() * (hi - lo);
    item.affixes[idx].value = PCT_STATS.has(stat)
      ? Math.round((item.affixes[idx].value + inc) * 1000) / 1000
      : Math.round(item.affixes[idx].value + inc);
  }

  item.enhancement++;
  if (!item.enhanceLog) item.enhanceLog = [];
  item.enhanceLog.push(indices);
  return indices;
}

// 重鑄：還原到精煉前的原始詞綴值，消耗由呼叫方處理
export function recastItem(item: EquipmentItem): void {
  const base = item.baseAffixes;
  if (base) {
    item.affixes = base.map(a => ({ ...a }));
    item.baseAffixes = undefined;
  }
  item.enhancement = 0;
  item.enhanceLog  = [];
}

// 保留供存檔相容性（目前不再因失敗呼叫）
export function revertEnhancement(item: EquipmentItem): void {
  if (item.enhancement <= 0) return;
  const log     = item.enhanceLog ?? [];
  const indices = log.length > 0 ? log.pop()! : [];
  for (const idx of indices) {
    if (idx >= item.affixes.length) continue;
    const { stat } = item.affixes[idx];
    const [lo, hi] = REFINE_INCREMENT_RANGE[stat];
    const avg = (lo + hi) / 2;
    item.affixes[idx].value = PCT_STATS.has(stat)
      ? Math.round((item.affixes[idx].value - avg) * 1000) / 1000
      : Math.round(item.affixes[idx].value - avg);
  }
  item.enhancement--;
}

// ── Legendary weapons ──────────────────────────────────────────────────────────

const _LEGENDARY_DEFS: Record<string, { name: string; texture: string; affixes: Affix[] }> = {
  legendary_slime_sword: {
    name: t('item.legendary_slime_sword'), texture: 'equip_legendary_sw1',
    affixes: [{ stat: 'atk', value: 380 }],
  },
  legendary_flower_sword: {
    name: t('item.legendary_flower_sword'), texture: 'equip_legendary_sw2',
    affixes: [{ stat: 'atk', value: 230 }, { stat: 'hp', value: 150 }, { stat: 'eliteKillerPct', value: 0.30 }],
  },
  legendary_orc_sword: {
    name: t('item.legendary_orc_sword'), texture: 'equip_legendary_sw3',
    affixes: [{ stat: 'atk', value: 260 }, { stat: 'atkSpeed', value: 0.30 }],
  },
  legendary_vampire_sword: {
    name: t('item.legendary_vampire_sword'), texture: 'equip_legendary_sw4',
    affixes: [{ stat: 'atk', value: 220 }, { stat: 'speed', value: 25 }, { stat: 'evasion', value: 0.30 }],
  },
};

export const LEGENDARY_BOSS_WEAPON: Record<string, string> = {
  boss_slime_legendary:   'legendary_slime_sword',
  boss_flower_legendary:  'legendary_flower_sword',
  boss_orc_legendary:     'legendary_orc_sword',
  boss_vampire_legendary: 'legendary_vampire_sword',
};

export function getEquipDisplayName(item: { id: string; slot: string; quality: EquipQuality }): string {
  if (item.quality === 'legendary') {
    const match = item.id.match(/^(legendary_[a-z_]+)_\d+_\d+$/);
    if (match) return t((`item.${match[1]}`) as import('../i18n/i18n').LangKey);
  }
  return SLOT_NAMES[item.slot as EquipSlot] ?? item.slot;
}

export function generateLegendaryWeapon(weaponId: string): EquipmentItem {
  const def = _LEGENDARY_DEFS[weaponId];
  return {
    id:          `${weaponId}_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name:        def.name,
    slot:        'sword',
    texture:     def.texture,
    quality:     'legendary',
    affixes:     def.affixes.map(a => ({ ...a })),
    enhancement: 0,
    enhanceLog:  [],
  };
}
