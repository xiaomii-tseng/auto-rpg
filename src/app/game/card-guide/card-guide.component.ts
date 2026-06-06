import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CardGuideVisibilityService } from './card-guide-visibility.service';

type RaceTab = 'all' | 'slime' | 'flower' | 'orc' | 'vampire' | 'formation';

export interface ComboEntry {
  id:             string;
  name:           string;
  condition:      string;
  conditionColor: string;
  race:           Exclude<RaceTab, 'all'>;
  effects:        string[];
}

const C1 = { label: '同家族×3',    color: '#ffcc44' };
const C2 = { label: '跨族一般/菁英/BOSS', color: '#44ccff' };
const C3 = { label: '同種族×3',    color: '#88cc88' };
const C4 = { label: '同階級×3',    color: '#cc88ff' };
const CM = { label: '精通',         color: '#ff8844' };

export const COMBO_ENTRIES: ComboEntry[] = [
  // ── 史萊姆同家族×3 ──────────────────────────────────────────
  { id: 'c1_slime_green',  name: '綠史萊姆家族：生命強化',  condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['HP上限 ×1.15（提升15%）'] },
  { id: 'c1_slime_red',    name: '紅史萊姆家族：爆擊強化',  condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['爆擊傷害 ×1.25（固定乘算，可與其他爆傷疊加）'] },
  { id: 'c1_slime_blue',   name: '藍史萊姆家族：防禦轉換',  condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['每30點防禦力自動轉換為迴避率+3%（防禦力越高越划算）'] },
  { id: 'c1_slime_white',  name: '白史萊姆家族：迅捷強化',  condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['攻擊速度 ×1.20（固定乘算）'] },
  { id: 'c1_slime_zombie', name: '殭屍史萊姆家族：燃燒延長', condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['燃燒上限+3層（需配合持續傷害build）'] },
  { id: 'c1_slime_lava',   name: '熔岩史萊姆家族：穿透爆發', condition: C1.label, conditionColor: C1.color, race: 'slime',
    effects: ['穿甲值累計≥100時，ATK額外+28（疊高穿甲才有效）'] },
  // 史萊姆跨族/種族
  { id: 'c2_slime', name: '史萊姆跨族陣容', condition: C2.label, conditionColor: C2.color, race: 'slime',
    effects: ['對有元素屬性（火/水/草）敵人傷害+10%', '爆擊率≥50%時，爆擊傷害額外+10%'] },
  { id: 'c3_slime', name: '史萊姆族共鳴',   condition: C3.label, conditionColor: C3.color, race: 'slime',
    effects: ['對有元素屬性（火/水/草）敵人傷害+8%'] },

  // ── 花怪同家族×3 ──────────────────────────────────────────
  { id: 'c1_plant1', name: '食人花家族：強攻陣容', condition: C1.label, conditionColor: C1.color, race: 'flower',
    effects: ['ATK+15', '對菁英怪/Boss傷害+8%'] },
  { id: 'c1_plant2', name: '藤蔓花家族：危機本能', condition: C1.label, conditionColor: C1.color, race: 'flower',
    effects: ['迴避率+6%'] },
  { id: 'c1_plant3', name: '不死花家族：召喚強化', condition: C1.label, conditionColor: C1.color, race: 'flower',
    effects: ['召喚物傷害 ×1.20（固定乘算）'] },
  // 花怪跨族/種族
  { id: 'c2_flower', name: '花怪跨族陣容', condition: C2.label, conditionColor: C2.color, race: 'flower',
    effects: ['HP每秒恢復+2', '受到傷害-8%'] },
  { id: 'c3_flower', name: '花怪族共鳴',   condition: C3.label, conditionColor: C3.color, race: 'flower',
    effects: ['HP每秒恢復+1.5'] },

  // ── 獸人同家族×3 ──────────────────────────────────────────
  { id: 'c1_orc1', name: '獸人族長：蠻力法則', condition: C1.label, conditionColor: C1.color, race: 'orc',
    effects: ['每1%爆擊率轉換為 ATK+1，同時關閉爆擊判定（純ATK流）', '全傷害+10%'] },
  { id: 'c1_orc2', name: '獸人戰士長：業火狂潮', condition: C1.label, conditionColor: C1.color, race: 'orc',
    effects: ['受擊時15%機率觸發業火盾（持續1.5秒）', '業火盾期間 ATK+15%'] },
  { id: 'c1_orc3', name: '獸人武士長：一閃共鳴', condition: C1.label, conditionColor: C1.color, race: 'orc',
    effects: ['蓄勁一閃爆發傷害+60%（需卡片/詞墜有蓄勁一閃才生效）', '攻擊速度 ×1.15'] },
  // 獸人跨族/種族
  { id: 'c2_orc', name: '獸人跨族狂戰陣容', condition: C2.label, conditionColor: C2.color, race: 'orc',
    effects: ['全傷害+10%', '受到傷害+5%（攻守交換，適合強攻流）'] },
  { id: 'c3_orc', name: '獸人族共鳴', condition: C3.label, conditionColor: C3.color, race: 'orc',
    effects: ['ATK+10', '穿甲+10'] },

  // ── 吸血鬼同家族×3 ──────────────────────────────────────────
  { id: 'c1_vampire1', name: '吸血鬼家族：靈魂收割', condition: C1.label, conditionColor: C1.color, race: 'vampire',
    effects: ['擊殺一般敵人時，以玩家為中心觸發衝擊波，對周圍敵人造成傷害並回復HP'] },
  { id: 'c1_vampire2', name: '吸血鬼法師家族：恐懼光環', condition: C1.label, conditionColor: C1.color, race: 'vampire',
    effects: ['持續降低周圍敵人的攻擊速度與移動速度（範圍光環，效果永久維持）'] },
  { id: 'c1_vampire3', name: '吸血鬼術士家族：血脈噴張', condition: C1.label, conditionColor: C1.color, race: 'vampire',
    effects: ['HP越低傷害和吸血越高', 'HP<30%時效果最強：傷害+50%、吸血大幅提升'] },
  // 吸血鬼跨族/種族
  { id: 'c2_vampire', name: '吸血鬼跨族共鳴', condition: C2.label, conditionColor: C2.color, race: 'vampire',
    effects: ['吸血+2.5%', '全傷害+8%'] },
  { id: 'c3_vampire', name: '吸血鬼族共鳴', condition: C3.label, conditionColor: C3.color, race: 'vampire',
    effects: ['吸血+2%', '對無元素屬性（無屬性）敵人傷害+10%'] },

  // ── 陣型（同階級×3）──────────────────────────────────────
  { id: 'c4_n', name: '普通卡陣容',  condition: C4.label, conditionColor: C4.color, race: 'formation',
    effects: ['全傷害+10%'] },
  { id: 'c4_e', name: '菁英卡陣容',  condition: C4.label, conditionColor: C4.color, race: 'formation',
    effects: ['對菁英怪/Boss傷害+15%'] },
  { id: 'c4_b', name: 'Boss卡陣容',  condition: C4.label, conditionColor: C4.color, race: 'formation',
    effects: ['對Boss傷害+25%'] },
  { id: 'mastery', name: '精通加成',  condition: CM.label, conditionColor: CM.color, race: 'formation',
    effects: [
      '同一張卡疊滿時額外觸發（疊加在任意陣型組合上）',
      '提供該卡片效果的50%作為額外加成',
      '普通卡疊3張、菁英卡疊2張、Boss卡疊1張即觸發',
    ] },
];

const PRIORITY_NOTE = [
  '同家族×3（最高）→ 跨族一般/菁英/BOSS → 同階級×3 → 同種族×3（保底）',
  '精通可疊加在任意陣型組合上，不互斥',
  '三個槽位都填卡才能觸發大多數組合',
];

@Component({
  selector: 'app-card-guide',
  standalone: true,
  templateUrl: './card-guide.component.html',
  styleUrl:    './card-guide.component.scss',
})
export class CardGuideComponent implements OnInit, OnDestroy {
  private readonly vis = inject(CardGuideVisibilityService);

  readonly activeTab = signal<RaceTab>('all');

  readonly tabs: { key: RaceTab; label: string }[] = [
    { key: 'all',       label: '全部'   },
    { key: 'slime',     label: '史萊姆' },
    { key: 'flower',    label: '花怪'   },
    { key: 'orc',       label: '獸人'   },
    { key: 'vampire',   label: '吸血鬼' },
    { key: 'formation', label: '陣型'   },
  ];

  readonly priorityNote = PRIORITY_NOTE;

  get entries(): ComboEntry[] {
    const tab = this.activeTab();
    if (tab === 'all') return COMBO_ENTRIES;
    return COMBO_ENTRIES.filter(e => e.race === tab);
  }

  ngOnInit():    void { (window as any).__setGameInputEnabled?.(false); }
  ngOnDestroy(): void { (window as any).__setGameInputEnabled?.(true);  }

  close(): void              { this.vis.close(); }
  setTab(tab: RaceTab): void { this.activeTab.set(tab); }
}
