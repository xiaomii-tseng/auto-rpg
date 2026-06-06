import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { AffixGuideVisibilityService } from './affix-guide-visibility.service';
import {
  SLOT_AFFIX_POOL, STAT_BASE, STAT_ROLL_RANGE, STAT_NAMES,
  StatKey, EquipCategory,
} from '../data/equipment-data';

type SlotTab = 'all' | EquipCategory;

const SLOT_DISPLAY: Record<EquipCategory, string> = {
  sword: '武器', hat: '頭盔', outfit: '外套', shoes: '鞋子', ring: '戒指',
};

const SLOT_COLORS: Record<EquipCategory, string> = {
  sword: '#dd8844', hat: '#ddcc88', outfit: '#88aadd', shoes: '#aa8866', ring: '#ff88cc',
};

const AFFIX_DESC: Partial<Record<StatKey, string>> = {
  atk:               '提高所有攻擊的基礎傷害值',
  hp:                '增加最大生命值上限',
  def:               '比例減傷，公式：防禦力 ÷ (防禦力 + 65)，數值愈高邊際效益遞減',
  crit:              '攻擊有機率觸發爆擊，依爆擊傷害倍率造成額外傷害',
  speed:             '加快角色移動速度，提升機動性',
  atkSpeed:          '縮短攻擊冷卻時間，提高每秒輸出頻率',
  lifesteal:         '造成傷害時將等比例傷害值存入吸血池，吸血池每秒最多釋放最大HP的6%進行回復；持續輸出可不斷累積池子',
  evasion:           '有機率完全迴避敵人攻擊，不受任何傷害',
  critDmg:           '提高爆擊時的傷害加成倍率，與爆擊率搭配效益最大',
  hpRegen:           '每秒自動恢復生命值，適合持久消耗型戰鬥',
  dotBonus:          '提高燃燒持續傷害的傷害量',
  penetration:       '忽略敵人等量的防禦力，對高護甲目標提升顯著',
  potionHealPct:     '使用治療藥水時回復更多HP',
  onKillHeal:        '每次擊殺敵人時立即回復固定HP',
  eliteKillerPct:    '對精英怪與Boss造成額外百分比傷害加成',
  dropRatePct:       '提高敵人掉落裝備、物品與卡片的整體機率',
  rarityBonus:       '提高掉落高品質（精良以上）裝備的機率',
  killShieldPerKill: '每次擊殺後累積護盾值，上限為最大HP的50%；3秒未擊殺後護盾逐漸衰退回再生護盾上限',
  executePct:        '敵人殘血低於此百分比時必定斬殺，多件疊加可提高觸發門檻',
  regenShieldMax:    '停止受傷2.5秒後護盾以每秒25%速率自動回填，此為護盾上限值',
  allDmgPct:         '所有主動攻擊傷害的百分比加成（不含燃燒持續傷害）',
  maxHpPct:          '以百分比提升最大生命值，與固定HP加成疊加計算',
};

export interface AffixEntry {
  stat:  StatKey;
  name:  string;
  desc:  string;
  range: string;
  slots: { label: string; color: string }[];
}

const PCT_STATS = new Set<StatKey>([
  'crit', 'atkSpeed', 'lifesteal', 'evasion', 'critDmg', 'dotBonus',
  'potionHealPct', 'eliteKillerPct', 'dropRatePct', 'rarityBonus',
  'executePct', 'allDmgPct', 'maxHpPct',
]);

function fmtRange(stat: StatKey, value: number): string {
  if (PCT_STATS.has(stat)) return (value * 100).toFixed(2) + '%';
  if (stat === 'hpRegen') return value.toFixed(2);
  return String(Math.round(value));
}

function buildAllEntries(): Map<StatKey, AffixEntry> {
  const slotMap = new Map<StatKey, { label: string; color: string }[]>();
  for (const [cat, stats] of Object.entries(SLOT_AFFIX_POOL) as [EquipCategory, StatKey[]][]) {
    for (const stat of stats) {
      if (!slotMap.has(stat)) slotMap.set(stat, []);
      slotMap.get(stat)!.push({ label: SLOT_DISPLAY[cat], color: SLOT_COLORS[cat] });
    }
  }
  const result = new Map<StatKey, AffixEntry>();
  for (const [stat, slots] of slotMap) {
    const base    = STAT_BASE[stat];
    const [lo, hi] = STAT_ROLL_RANGE[stat];
    result.set(stat, {
      stat,
      name:  STAT_NAMES[stat],
      desc:  AFFIX_DESC[stat] ?? '',
      range: `${fmtRange(stat, base * lo)} ~ ${fmtRange(stat, base * hi)}`,
      slots,
    });
  }
  return result;
}

const ALL_ENTRY_MAP = buildAllEntries();

@Component({
  selector: 'app-affix-guide',
  standalone: true,
  templateUrl: './affix-guide.component.html',
  styleUrl:    './affix-guide.component.scss',
})
export class AffixGuideComponent implements OnInit, OnDestroy {
  private readonly vis = inject(AffixGuideVisibilityService);

  readonly activeTab = signal<SlotTab>('all');

  readonly tabs: { key: SlotTab; label: string }[] = [
    { key: 'all',    label: '全部' },
    { key: 'sword',  label: '武器' },
    { key: 'hat',    label: '頭盔' },
    { key: 'outfit', label: '外套' },
    { key: 'shoes',  label: '鞋子' },
    { key: 'ring',   label: '戒指' },
  ];

  get entries(): AffixEntry[] {
    const tab = this.activeTab();
    if (tab === 'all') return Array.from(ALL_ENTRY_MAP.values());
    return SLOT_AFFIX_POOL[tab]
      .map(stat => ALL_ENTRY_MAP.get(stat))
      .filter((e): e is AffixEntry => e != null);
  }

  ngOnInit():    void { (window as any).__setGameInputEnabled?.(false); }
  ngOnDestroy(): void { (window as any).__setGameInputEnabled?.(true);  }

  close(): void             { this.vis.close(); }
  setTab(tab: SlotTab): void { this.activeTab.set(tab); }
}
