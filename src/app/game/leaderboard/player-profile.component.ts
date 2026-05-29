import { Component, inject, effect, signal, computed, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlayerProfileVisibilityService } from './player-profile-visibility.service';
import { EquipQuality, StatKey, fmtAffixValue, STAT_NAMES, getEquipDisplayName, SLOT_NAMES, EquipSlot } from '../data/equipment-data';
import { getCardDef } from '../data/monster-data';
import { SKILL_NODES, ATTACK_MODES, MODE_COLORS, AttackModeId } from '../data/skill-tree-store';
import { t } from '../i18n/i18n';

export const QUALITY_COLORS: Record<EquipQuality, string> = {
  normal:    '#aaaaaa',
  good:      '#44dd44',
  fine:      '#4488ff',
  perfect:   '#ffdd00',
  legendary: '#ee2222',
};

const QUALITY_BG: Record<EquipQuality, string> = {
  normal:    'rgba(170,187,204,0.10)',
  good:      'rgba(85,204,85,0.10)',
  fine:      'rgba(68,153,255,0.10)',
  perfect:   'rgba(204,68,255,0.10)',
  legendary: 'rgba(255,170,34,0.12)',
};

const CARD_TYPE_COLOR: Record<string, string> = {
  n: '#aabbcc', e: '#4499ff', b: '#ffaa44', l: '#ff4455',
};
const CARD_TYPE_LABEL: Record<string, string> = {
  n: '普通', e: '精英', b: '首領', l: '傳說',
};

function textureToImgSrc(texture: string): string {
  if (texture.startsWith('equip_legendary_sw')) {
    const n = texture.replace('equip_legendary_sw', '');
    return `equip/weapons/Icons/red/sw${n}.png`;
  }
  if (texture.startsWith('equip_sword')) {
    const n = parseInt(texture.replace('equip_sword', ''), 10);
    if (n >= 41) {
      const i = n - 40;
      return `equip/weapons/Icons/icon_32_2_${String(i).padStart(2, '0')}.png`;
    }
    return `equip/weapons/Icons/Iicon_32_${String(n).padStart(2, '0')}.png`;
  }
  const m = texture.match(/^equip_(.+)$/);
  if (m) return `equip/${m[1]}.webp`;
  return '';
}

function modeColor(modeId: string): string {
  const c = MODE_COLORS[modeId] ?? 0xaabbcc;
  return `#${c.toString(16).padStart(6, '0')}`;
}

const SLOT_ORDER: EquipSlot[] = ['sword', 'hat', 'outfit', 'shoes', 'ring1', 'ring2'];

interface ProfileEquipItem {
  id: string;
  name: string;
  slot: string;
  quality: EquipQuality;
  affixes: { stat: StatKey; value: number }[];
  enhancement: number;
  texture: string;
}

interface PlayerProfile {
  playerId: string;
  level: number;
  equipped: Record<string, ProfileEquipItem | null>;
  cards: { equipped: (string | null)[] };
  skillTree: { learned: string[]; attackMode: string };
}

@Component({
  selector: 'app-player-profile',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './player-profile.component.html',
  styleUrl:    './player-profile.component.scss',
})
export class PlayerProfileComponent implements OnDestroy {
  private vis = inject(PlayerProfileVisibilityService);

  readonly profile  = signal<PlayerProfile | null>(null);
  readonly loading  = signal(false);
  readonly fetchErr = signal(false);

  readonly slotOrder = SLOT_ORDER;

  // Slot display helpers
  readonly slotDefs: { key: EquipSlot; label: string; color: string }[] = [
    { key: 'sword',  label: SLOT_NAMES['sword'],  color: '#dd8844' },
    { key: 'hat',    label: SLOT_NAMES['hat'],    color: '#ddcc88' },
    { key: 'outfit', label: SLOT_NAMES['outfit'], color: '#88aadd' },
    { key: 'shoes',  label: SLOT_NAMES['shoes'],  color: '#aa8866' },
    { key: 'ring1',  label: SLOT_NAMES['ring1'],  color: '#ff88cc' },
    { key: 'ring2',  label: SLOT_NAMES['ring2'],  color: '#ff66aa' },
  ];

  readonly learnedNodes = computed(() => {
    const p = this.profile();
    if (!p) return [];
    const learnedSet = new Set(p.skillTree.learned);
    return SKILL_NODES.filter(n => learnedSet.has(n.id));
  });

  readonly attackModeLabel = computed(() => {
    const p = this.profile();
    if (!p) return '';
    return ATTACK_MODES.find(m => m.id === p.skillTree.attackMode)?.label ?? p.skillTree.attackMode;
  });

  readonly attackModeColor = computed(() => {
    const p = this.profile();
    if (!p) return '#aabbcc';
    return modeColor(p.skillTree.attackMode);
  });

  private _prevId = '';
  private _fetchEffect = effect(() => {
    const id = this.vis.playerId();
    if (!id || id === this._prevId) return;
    this._prevId = id;
    this.profile.set(null);
    this.fetchErr.set(false);
    this.loading.set(true);
    this._fetch(id);
  });

  private async _fetch(playerId: string): Promise<void> {
    try {
      const raw   = localStorage.getItem('rg_user');
      const token = raw ? (JSON.parse(raw) as { accessToken: string }).accessToken : '';
      const api   = (window as any).__apiUrl as string ?? '';
      const resp  = await fetch(`${api}/leaderboard/player-profile/${encodeURIComponent(playerId)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (resp.ok) {
        this.profile.set(await resp.json());
      } else {
        this.fetchErr.set(true);
      }
    } catch {
      this.fetchErr.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  getItem(slot: EquipSlot): ProfileEquipItem | null {
    return this.profile()?.equipped[slot] ?? null;
  }

  qualityColor(q: EquipQuality): string { return QUALITY_COLORS[q] ?? '#aabbcc'; }
  qualityBg(q: EquipQuality): string    { return QUALITY_BG[q]     ?? 'transparent'; }

  itemDisplayName(item: ProfileEquipItem): string {
    return getEquipDisplayName(item as any);
  }

  itemEnhancement(item: ProfileEquipItem): string {
    return item.enhancement > 0 ? `+${item.enhancement} ` : '';
  }

  itemImgSrc(item: ProfileEquipItem): string {
    return textureToImgSrc(item.texture);
  }

  affixLine(a: { stat: StatKey; value: number }): string {
    const name = (STAT_NAMES as Record<string, string>)[a.stat] ?? a.stat;
    return `${name} +${fmtAffixValue(a.stat, a.value)}`;
  }

  getCardDef = getCardDef;
  cardTypeColor(type: string): string  { return CARD_TYPE_COLOR[type]  ?? '#aabbcc'; }
  cardTypeLabel(type: string): string  { return CARD_TYPE_LABEL[type]  ?? type; }

  nodeColor(modeId: string | undefined): string {
    return modeId ? modeColor(modeId) : '#aabbcc';
  }

  @HostListener('document:keydown.escape')
  close(): void { this.vis.close(); }

  ngOnDestroy(): void {}
}
