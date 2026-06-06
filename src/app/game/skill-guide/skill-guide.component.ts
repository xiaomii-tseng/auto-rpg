import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { SkillGuideVisibilityService } from './skill-guide-visibility.service';

export interface EffectEntry {
  id:         string;
  name:       string;
  badge:      string;
  badgeColor: string;
  lines:      string[];
}

export const EFFECT_ENTRIES: EffectEntry[] = [
  {
    id: 'bloodlust', name: '暴徒效果', badge: '疊層', badgeColor: '#ff6644',
    lines: [
      '爆擊時獲得 1 層，每次攻擊只計一次',
      '每層提升傷害，3 秒內未爆擊則所有層數歸零',
      '層數與加成量可透過技能樹提升',
    ],
  },
  {
    id: 'sanguine', name: '嗜血效果', badge: '疊層', badgeColor: '#ff6644',
    lines: [
      '每次命中獲得 1 層，每次攻擊只計一次',
      '每層提升攻擊速度，3 秒內未命中則所有層數歸零',
      '層數與加成量可透過技能樹提升',
    ],
  },
  {
    id: 'burn', name: '燃燒效果', badge: '持續傷害', badgeColor: '#ff8800',
    lines: [
      '施加在敵人身上的疊層持續傷害，來源：地獄火攻擊命中、灼燒血環命中等',
      '上限 10 層，層數越高持續傷害越強',
      '停止施加後 4 秒，所有層數同時消失',
      '達到 10 層時立刻觸發燃燒爆炸（範圍傷害）並歸零',
    ],
  },
  {
    id: 'overkill', name: '傷害溢出', badge: '爆發', badgeColor: '#cc88ff',
    lines: [
      '傷害超過目標剩餘 HP 時，超出的部分不會浪費',
      '超出量會轉換成範圍爆炸，對周圍敵人造成傷害',
      '若爆炸再次觸發溢出，可無限連鎖清場',
    ],
  },
  {
    id: 'splash', name: '傷害濺射', badge: '範圍', badgeColor: '#66bbff',
    lines: [
      '每次攻擊命中後，自動對附近數個敵人造成額外濺射傷害',
      '濺射傷害與目標數量可透過技能樹提升',
    ],
  },
  {
    id: 'aura', name: '血環（攻擊模式）', badge: '被動', badgeColor: '#ff4444',
    lines: [
      '不主動出擊，改為自動對周圍一圈敵人持續造成傷害',
      '適合搭配高防禦或召喚流，站樁輸出',
    ],
  },
];

@Component({
  selector: 'app-skill-guide',
  standalone: true,
  templateUrl: './skill-guide.component.html',
  styleUrl:    './skill-guide.component.scss',
})
export class SkillGuideComponent implements OnInit, OnDestroy {
  private readonly vis = inject(SkillGuideVisibilityService);

  readonly entries = EFFECT_ENTRIES;

  ngOnInit():    void { (window as any).__setGameInputEnabled?.(false); }
  ngOnDestroy(): void { (window as any).__setGameInputEnabled?.(true);  }

  close(): void { this.vis.close(); }
}
