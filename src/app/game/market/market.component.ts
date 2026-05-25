import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketVisibilityService } from './market-visibility.service';
import { MarketService, MarketListing, MyListing, MarketItemType, ListingsFilter } from './market.service';
import { AuthService } from '../../auth/auth.service';
import { EquipQuality, StatKey } from '../data/equipment-data';
import { decryptSave } from '../data/save-store';

type Tab = 'browse' | 'mine';
type ListStep = null | 'select-type' | 'select-item' | 'set-price';

const QUALITY_LABELS: Record<EquipQuality, string> = {
  normal: '普通', good: '良好', fine: '精良', perfect: '完美', legendary: '傳說',
};
const QUALITY_COLORS: Record<EquipQuality, string> = {
  normal: '#aabbcc', good: '#55cc55', fine: '#4499ff', perfect: '#cc44ff', legendary: '#ffaa22',
};
const AFFIX_LABELS: Partial<Record<StatKey, string>> = {
  atk: 'ATK', hp: 'HP', def: 'DEF', crit: '暴擊', critDmg: '暴傷',
  atkSpeed: '攻速', lifesteal: '吸血', speed: '移速', evasion: '閃避',
  penetration: '穿透', hpRegen: '回血', dotBonus: '持續傷害',
};
const QUICK_AFFIXES = Object.keys(AFFIX_LABELS) as StatKey[];
const QUALITIES = Object.keys(QUALITY_LABELS) as EquipQuality[];

interface SaveInventoryItem { id: string; name: string; qty: number }
interface SaveCardEntry    { cardId: string; qty: number }
interface SaveEquipItem    { id: string; name: string; slot: string; quality: EquipQuality; affixes: { stat: string; value: number }[]; enhancement: number; texture: string }

@Component({
  selector: 'app-market',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './market.component.html',
  styleUrl: './market.component.scss',
})
export class MarketComponent implements OnInit {
  private vis     = inject(MarketVisibilityService);
  private svc     = inject(MarketService);
  private auth    = inject(AuthService);

  // ── Tab ──────────────────────────────────────────────────────────────────
  tab = signal<Tab>('browse');

  // ── Browse filters ────────────────────────────────────────────────────────
  filterType    = signal<MarketItemType | ''>('');
  filterQuality = signal<EquipQuality | ''>('');
  filterAffixes = signal<StatKey[]>([]);
  filterName    = '';
  currentPage   = 1;

  showEquipFilters = computed(() => this.filterType() === 'equipment');

  // ── Browse data ───────────────────────────────────────────────────────────
  listings      = signal<MarketListing[]>([]);
  browseLoading = signal(false);
  browseError   = signal('');
  hasMore       = signal(false);

  // ── My listings ───────────────────────────────────────────────────────────
  myListings    = signal<MyListing[]>([]);
  mineLoading   = signal(false);
  mineError     = signal('');

  // ── List item flow ────────────────────────────────────────────────────────
  listStep      = signal<ListStep>(null);
  listType      = signal<MarketItemType>('equipment');
  listSelected  = signal<any>(null);
  listQty       = 1;
  listPrice     = 0;
  listSubmitting = signal(false);
  listError     = signal('');

  // items from save_data for the list-item picker
  ownedEquips    = signal<SaveEquipItem[]>([]);
  ownedItems     = signal<SaveInventoryItem[]>([]);
  ownedCards     = signal<SaveCardEntry[]>([]);

  // ── Buy / cancel ──────────────────────────────────────────────────────────
  actionPending = signal<string | null>(null); // listing id in progress
  actionError   = signal('');

  // expose to template
  readonly qualityLabels  = QUALITY_LABELS;
  readonly qualityColors  = QUALITY_COLORS;
  readonly affixLabels    = AFFIX_LABELS;
  readonly quickAffixes   = QUICK_AFFIXES;
  readonly qualities      = QUALITIES;

  get myUserId(): string { return this.auth.getUser()?.userId ?? ''; }

  ngOnInit(): void {
    this.loadBrowse();
  }

  close(): void { this.vis.close(); }

  // ── Tab switching ─────────────────────────────────────────────────────────
  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'mine' && this.myListings().length === 0) this.loadMine();
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  async loadBrowse(reset = true): Promise<void> {
    if (reset) { this.currentPage = 1; this.listings.set([]); }
    this.browseLoading.set(true);
    this.browseError.set('');
    try {
      const filter: ListingsFilter = {
        page:  this.currentPage,
        limit: 20,
      };
      if (this.filterType())    filter.type    = this.filterType() as MarketItemType;
      if (this.filterQuality()) filter.quality = this.filterQuality() as EquipQuality;
      if (this.filterAffixes().length) filter.affixes = this.filterAffixes();
      if (this.filterName.trim()) filter.name  = this.filterName.trim();

      const data = await this.svc.getListings(filter);
      this.listings.set(data);
      this.hasMore.set(data.length === 20);
    } catch (e: any) {
      this.browseError.set(e.message ?? '讀取失敗');
    } finally {
      this.browseLoading.set(false);
    }
  }

  setTypeFilter(t: MarketItemType | ''): void {
    this.filterType.set(t);
    if (t !== 'equipment') { this.filterQuality.set(''); this.filterAffixes.set([]); }
    this.loadBrowse();
  }

  setQualityFilter(q: EquipQuality | ''): void {
    this.filterQuality.set(this.filterQuality() === q ? '' : q);
    this.loadBrowse();
  }

  toggleAffix(a: StatKey): void {
    const cur = this.filterAffixes();
    this.filterAffixes.set(cur.includes(a) ? cur.filter(x => x !== a) : [...cur, a]);
    this.loadBrowse();
  }

  onSearch(): void { this.loadBrowse(); }

  loadMore(): void {
    this.currentPage++;
    this.loadBrowse(false);
  }

  // ── Buy ───────────────────────────────────────────────────────────────────
  async buy(listing: MarketListing): Promise<void> {
    this.actionError.set('');
    this.actionPending.set(listing.id);
    try {
      await this.svc.buyItem(listing.id);
      this.listings.update(ls => ls.filter(l => l.id !== listing.id));
    } catch (e: any) {
      const map: Record<string, string> = {
        listing_not_active: '商品已被購買',
        insufficient_gold:  '金幣不足',
        cannot_buy_own:     '不能購買自己的商品',
      };
      this.actionError.set(map[e.message] ?? e.message ?? '購買失敗');
    } finally {
      this.actionPending.set(null);
    }
  }

  // ── My listings ───────────────────────────────────────────────────────────
  async loadMine(): Promise<void> {
    this.mineLoading.set(true);
    this.mineError.set('');
    try {
      this.myListings.set(await this.svc.getMyListings());
    } catch (e: any) {
      this.mineError.set(e.message ?? '讀取失敗');
    } finally {
      this.mineLoading.set(false);
    }
  }

  async cancel(listing: MyListing): Promise<void> {
    this.actionError.set('');
    this.actionPending.set(listing.id);
    try {
      await this.svc.cancelListing(listing.id);
      this.myListings.update(ls => ls.map(l => l.id === listing.id ? { ...l, status: 'cancelled' as const } : l));
    } catch (e: any) {
      this.actionError.set(e.message ?? '下架失敗');
    } finally {
      this.actionPending.set(null);
    }
  }

  // ── List item flow ────────────────────────────────────────────────────────
  openListFlow(): void {
    this._loadSaveData();
    this.listStep.set('select-type');
    this.listType.set('equipment');
    this.listSelected.set(null);
    this.listQty = 1;
    this.listPrice = 0;
    this.listError.set('');
  }

  private _loadSaveData(): void {
    try {
      const raw = localStorage.getItem('auto_rpg_save');
      if (!raw) return;
      const save = JSON.parse(decryptSave(raw));
      this.ownedEquips.set(save?.player?.owned ?? []);
      this.ownedItems.set(save?.inventory?.items ?? []);
      this.ownedCards.set(save?.cards?.inventory ?? []);
    } catch { /* ignore */ }
  }

  selectListType(t: MarketItemType): void {
    this.listType.set(t);
    this.listStep.set('select-item');
  }

  selectListItem(item: any): void {
    this.listSelected.set(item);
    this.listQty   = 1;
    this.listPrice = 0;
    this.listStep.set('set-price');
  }

  backToSelectItem(): void { this.listStep.set('select-item'); }

  get maxListQty(): number {
    const item = this.listSelected();
    if (!item) return 1;
    if (this.listType() === 'equipment') return 1;
    return item.qty ?? 1;
  }

  get listItemId(): string {
    const item = this.listSelected();
    if (!item) return '';
    if (this.listType() === 'equipment')  return item.id;
    if (this.listType() === 'consumable') return item.id;
    return item.cardId;
  }

  get listItemName(): string {
    const item = this.listSelected();
    if (!item) return '';
    if (this.listType() === 'card') return item.cardId;
    return item.name ?? '';
  }

  async confirmList(): Promise<void> {
    if (!this.listPrice || this.listPrice <= 0) { this.listError.set('請輸入售價'); return; }
    if (!this.listQty   || this.listQty   <= 0) { this.listError.set('請輸入數量'); return; }
    this.listSubmitting.set(true);
    this.listError.set('');
    try {
      await this.svc.listItem({
        itemType: this.listType(),
        itemId:   this.listItemId,
        qty:      this.listQty,
        price:    this.listPrice,
      });
      this.listStep.set(null);
      await this.loadMine();
    } catch (e: any) {
      this.listError.set(e.message ?? '上架失敗');
    } finally {
      this.listSubmitting.set(false);
    }
  }

  cancelListFlow(): void { this.listStep.set(null); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  qualityColor(q: string | null): string {
    return q ? (QUALITY_COLORS[q as EquipQuality] ?? '#aabbcc') : '#aabbcc';
  }

  qualityLabel(q: string | null): string {
    return q ? (QUALITY_LABELS[q as EquipQuality] ?? q) : '';
  }

  statusLabel(s: string): string {
    return s === 'active' ? '上架中' : s === 'sold' ? '已售出' : '已下架';
  }

  statusColor(s: string): string {
    return s === 'active' ? '#55cc55' : s === 'sold' ? '#4499ff' : '#667788';
  }

  affixSummary(item: SaveEquipItem): string {
    if (!item?.affixes) return '';
    return item.affixes.map(a => AFFIX_LABELS[a.stat as StatKey] ?? a.stat).join(' / ');
  }

  formatGold(n: number): string {
    return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
         : n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`
         : String(n);
  }
}
