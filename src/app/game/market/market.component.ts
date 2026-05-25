import { Component, inject, signal, computed, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MarketVisibilityService } from './market-visibility.service';
import { MarketService, MarketListing, MyListing, MarketItemType, ListingsFilter } from './market.service';
import { AuthService } from '../../auth/auth.service';
import { EquipQuality, StatKey, fmtAffixValue, STAT_NAMES } from '../data/equipment-data';
import { decryptSave } from '../data/save-store';
import { getCardDef } from '../data/monster-data';

type Tab = 'browse' | 'mine';
type ListStep = null | 'select-item' | 'set-price';

const QUALITY_LABELS: Record<EquipQuality, string> = {
  normal: '普通', good: '良好', fine: '精良', perfect: '完美', legendary: '傳說',
};
const QUALITY_COLORS: Record<EquipQuality, string> = {
  normal: '#aabbcc', good: '#55cc55', fine: '#4499ff', perfect: '#cc44ff', legendary: '#ffaa22',
};
const AFFIX_LABELS: Partial<Record<StatKey, string>> = {
  atk: '攻擊力', hp: '最大HP', def: '防禦力', crit: '爆擊率', critDmg: '爆擊傷害',
  atkSpeed: '攻擊速度', lifesteal: '吸血', speed: '移動速度', evasion: '閃避率',
  penetration: '穿甲', hpRegen: 'HP恢復', dotBonus: '持續傷害',
};
const QUICK_AFFIXES = Object.keys(AFFIX_LABELS) as StatKey[];
const QUALITIES = Object.keys(QUALITY_LABELS) as EquipQuality[];

const POTION_FRAMES: Record<string, number> = {
  potion_health_s: 89, potion_health_m: 90, potion_health_l: 101,
  potion_revive: 93, potion_atk: 91, potion_def: 99, potion_speed: 95,
};

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
export class MarketComponent implements OnInit, OnDestroy {
  private vis  = inject(MarketVisibilityService);
  private svc  = inject(MarketService);
  private auth = inject(AuthService);

  // ── Tab ──────────────────────────────────────────────────────────────────
  tab = signal<Tab>('browse');

  // ── Browse filters ────────────────────────────────────────────────────────
  filterType    = signal<MarketItemType | ''>('');
  filterQuality = signal<EquipQuality | ''>('');
  filterAffix1  = signal<StatKey | ''>('');
  filterAffix2  = signal<StatKey | ''>('');
  filterAffix3  = signal<StatKey | ''>('');
  filterAffix4  = signal<StatKey | ''>('');
  filterName    = '';
  currentPage   = 1;

  // Custom dropdown state (shared across tabs)
  openDropdown = signal<string | null>(null);
  dropdownPos  = signal<{ top: number; left: number; width: number } | null>(null);

  @HostListener('document:click')
  closeDropdowns() { this.openDropdown.set(null); }

  showEquipFilters = computed(() => this.filterType() === 'equipment');

  // Equipment slot filter (used in listing picker)
  slotFilter = signal<string>('');
  readonly slotTabs = [
    { key: '',       label: '全部' },
    { key: 'sword',  label: '武器' },
    { key: 'hat',    label: '頭盔' },
    { key: 'outfit', label: '盔甲' },
    { key: 'shoes',  label: '鞋靴' },
    { key: 'ring',   label: '戒指' },
  ];
  filteredEquips = computed(() => {
    const f = this.slotFilter();
    if (!f) return this.ownedEquips();
    return this.ownedEquips().filter(eq =>
      f === 'ring' ? eq.slot.startsWith('ring') : eq.slot === f
    );
  });

  // ── Browse data ───────────────────────────────────────────────────────────
  listings      = signal<MarketListing[]>([]);
  browseLoading  = signal(false);
  browseError    = signal('');
  hasMore        = signal(false);
  browseStarted  = false;

  // ── My listings ───────────────────────────────────────────────────────────
  myListings  = signal<MyListing[]>([]);
  mineLoading = signal(false);
  mineError   = signal('');

  // ── List item flow ────────────────────────────────────────────────────────
  listStep       = signal<ListStep>(null);
  listType       = signal<MarketItemType>('equipment');
  listSelected   = signal<any>(null);
  listQty        = 1;
  listPrice      = 0;
  listSubmitting = signal(false);
  listError      = signal('');

  // Listing picker filters (independent from browse filters)
  listPickerQuality = signal<EquipQuality | ''>('');
  listPickerAffix1  = signal<StatKey | ''>('');
  listPickerAffix2  = signal<StatKey | ''>('');
  listPickerAffix3  = signal<StatKey | ''>('');
  listPickerAffix4  = signal<StatKey | ''>('');

  filteredListEquips = computed(() => {
    let items = this.filteredEquips();
    const q = this.listPickerQuality();
    if (q) items = items.filter(e => e.quality === q);
    const affixes = [this.listPickerAffix1(), this.listPickerAffix2(), this.listPickerAffix3(), this.listPickerAffix4()]
      .filter((a): a is StatKey => !!a);
    if (affixes.length) items = items.filter(e => affixes.every(a => e.affixes.some(aff => aff.stat === a)));
    return items;
  });

  // Owned items from save_data
  ownedEquips = signal<SaveEquipItem[]>([]);
  ownedItems  = signal<SaveInventoryItem[]>([]);
  ownedCards  = signal<SaveCardEntry[]>([]);

  // Potion data URLs (extracted from sprite sheet via canvas, same method as prep-scene)
  potionDataUrls = signal<Map<string, string>>(new Map());

  // ── Buy / cancel ──────────────────────────────────────────────────────────
  actionPending = signal<string | null>(null);
  actionError   = signal('');
  buyTarget     = signal<MarketListing | null>(null);
  buyQty        = 1;

  readonly qualityLabels = QUALITY_LABELS;
  readonly qualityColors = QUALITY_COLORS;
  readonly affixLabels   = AFFIX_LABELS;
  readonly qualities     = QUALITIES;
  readonly affixOptions  = QUICK_AFFIXES.map(key => ({ key, label: AFFIX_LABELS[key]! }));

  get myUserId(): string {
    const u = this.auth.user as any;
    return u?.userId ?? u?.user_id ?? '';
  }

  ngOnInit(): void {
    (window as any).__setGameInputEnabled?.(false);
    this.loadPotionSprites();
  }

  ngOnDestroy(): void { (window as any).__setGameInputEnabled?.(true); }

  close(): void { this.vis.close(); }

  // ─── Potion sprites (identical logic to prep-scene: frame.cutX/cutY via canvas) ───
  private async loadPotionSprites(): Promise<void> {
    const img = new Image();
    img.src = 'items/potions.png';
    await new Promise(r => { img.onload = r; img.onerror = r; });
    if (!img.naturalWidth) return;
    const cols = Math.floor(img.naturalWidth / 16);
    const urls = new Map<string, string>();
    for (const [id, frame] of Object.entries(POTION_FRAMES)) {
      const cutX = (frame % cols) * 16;
      const cutY = Math.floor(frame / cols) * 16;
      const canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      ctx.drawImage(img, cutX, cutY, 16, 16, 0, 0, 32, 32);
      urls.set(id, canvas.toDataURL());
    }
    this.potionDataUrls.set(urls);
  }

  consumableImgUrl(id: string): string {
    if (id in POTION_FRAMES) return this.potionDataUrls().get(id) ?? '';
    const map: Record<string, string> = {
      stone_broken:   'other/ore2.webp',
      stone_intact:   'other/ore1.webp',
      stone_guard:    'other/ore3.webp',
      quest_reroll:   'other/ore4.webp',
      blank_card:     'other/card.webp',
      ticket_slime:   'icon1/PNG/Transperent/Icon21.png',
      ticket_flower:  'icon1/PNG/Transperent/Icon37.png',
      ticket_orc:     'icon1/PNG/Transperent/Icon44.png',
      ticket_vampire: 'icon1/PNG/Transperent/Icon42.png',
    };
    return map[id] ?? 'other/ore1.webp';
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  setTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'mine' && this.myListings().length === 0) this.loadMine();
  }

  // ── Browse ────────────────────────────────────────────────────────────────
  async loadBrowse(reset = true): Promise<void> {
    this.browseStarted = true;
    if (reset) { this.currentPage = 1; this.listings.set([]); }
    this.browseLoading.set(true);
    this.browseError.set('');
    try {
      const filter: ListingsFilter = { page: this.currentPage, limit: 20 };
      if (this.filterType())    filter.type    = this.filterType() as MarketItemType;
      if (this.filterQuality()) filter.quality = this.filterQuality() as EquipQuality;
      const affixes = [this.filterAffix1(), this.filterAffix2(), this.filterAffix3(), this.filterAffix4()]
        .filter((a): a is StatKey => !!a);
      if (affixes.length) filter.affixes = affixes;
      if (this.filterName.trim()) filter.name = this.filterName.trim();
      const data = await this.svc.getListings(filter);
      this.listings.set(data);
      this.hasMore.set(data.length === 20);
    } catch (e: any) {
      this.browseError.set(e.message ?? '讀取失敗');
    } finally {
      this.browseLoading.set(false);
    }
  }

  setTypeFilter(t: MarketItemType): void {
    const next = this.filterType() === t ? '' : t;
    this.filterType.set(next);
    if (next !== 'equipment') {
      this.filterQuality.set('');
      this.filterAffix1.set(''); this.filterAffix2.set('');
      this.filterAffix3.set(''); this.filterAffix4.set('');
    }
    this.loadBrowse();
  }

  setQualityFilter(q: EquipQuality | ''): void { this.filterQuality.set(q); this.loadBrowse(); }
  setAffix(idx: number, val: StatKey | ''): void {
    [this.filterAffix1, this.filterAffix2, this.filterAffix3, this.filterAffix4][idx].set(val);
    this.loadBrowse();
  }

  toggleDropdown(id: string, btn: HTMLElement, event: MouseEvent): void {
    event.stopPropagation();
    if (this.openDropdown() === id) { this.openDropdown.set(null); return; }
    const panelRect = document.querySelector('.market-panel')?.getBoundingClientRect();
    const r = btn.getBoundingClientRect();
    this.dropdownPos.set({ top: panelRect ? panelRect.top + 8 : r.top, left: r.right + 6, width: 160 });
    this.openDropdown.set(id);
  }

  // Browse dropdowns
  pickQuality(q: EquipQuality | '', event: MouseEvent): void {
    event.stopPropagation(); this.setQualityFilter(q); this.openDropdown.set(null);
  }
  pickAffix(idx: number, val: StatKey | '', event: MouseEvent): void {
    event.stopPropagation(); this.setAffix(idx, val); this.openDropdown.set(null);
  }

  // Listing picker dropdowns
  pickListQuality(q: EquipQuality | '', event: MouseEvent): void {
    event.stopPropagation(); this.listPickerQuality.set(q); this.openDropdown.set(null);
  }
  pickListAffix(idx: number, val: StatKey | '', event: MouseEvent): void {
    event.stopPropagation();
    [this.listPickerAffix1, this.listPickerAffix2, this.listPickerAffix3, this.listPickerAffix4][idx].set(val);
    this.openDropdown.set(null);
  }
  pickListSlot(key: string, event: MouseEvent): void {
    event.stopPropagation(); this.slotFilter.set(key); this.openDropdown.set(null);
  }

  affixLabel(idx: number): string {
    const val = [this.filterAffix1, this.filterAffix2, this.filterAffix3, this.filterAffix4][idx]();
    return val ? (AFFIX_LABELS[val] ?? val) : `詞墜 ${idx + 1}`;
  }
  listAffixLabel(idx: number): string {
    const val = [this.listPickerAffix1, this.listPickerAffix2, this.listPickerAffix3, this.listPickerAffix4][idx]();
    return val ? (AFFIX_LABELS[val] ?? val) : `詞墜 ${idx + 1}`;
  }

  get qualityFilterLabel(): string {
    const q = this.filterQuality(); return q ? QUALITY_LABELS[q] : '品質（全部）';
  }
  get listQualityFilterLabel(): string {
    const q = this.listPickerQuality(); return q ? QUALITY_LABELS[q] : '品質（全部）';
  }
  get listSlotLabel(): string {
    return this.slotTabs.find(t => t.key === this.slotFilter())?.label ?? '部位（全部）';
  }

  onSearch(): void { this.loadBrowse(); }
  loadMore(): void { this.currentPage++; this.loadBrowse(false); }

  // ── Buy ───────────────────────────────────────────────────────────────────
  initBuy(listing: MarketListing, event: MouseEvent): void {
    event.stopPropagation();
    if (listing.item_type === 'equipment' || listing.qty <= 1) {
      this.buy(listing);
      return;
    }
    this.buyQty = 1;
    this.buyTarget.set(listing);
  }

  async confirmBuy(): Promise<void> {
    const item = this.buyTarget();
    if (!item) return;
    this.buyTarget.set(null);
    await this.buy(item, this.buyQty);
  }

  cancelBuy(): void { this.buyTarget.set(null); }

  async buy(listing: MarketListing, qty = 1): Promise<void> {
    this.actionError.set('');
    this.actionPending.set(listing.id);
    try {
      await this.svc.buyItem(listing.id, qty);
      if (qty >= listing.qty) {
        this.listings.update(ls => ls.filter(l => l.id !== listing.id));
      } else {
        this.listings.update(ls => ls.map(l => l.id === listing.id ? { ...l, qty: l.qty - qty } : l));
      }
    } catch (e: any) {
      const map: Record<string, string> = {
        listing_not_active: '商品已被購買',
        insufficient_gold:  '金幣不足',
        cannot_buy_own:     '不能購買自己的商品',
      };
      this.actionError.set(map[e.message] ?? e.message ?? '購買失敗');
    } finally { this.actionPending.set(null); }
  }

  // ── My listings ───────────────────────────────────────────────────────────
  async loadMine(): Promise<void> {
    this.mineLoading.set(true); this.mineError.set('');
    try { this.myListings.set(await this.svc.getMyListings()); }
    catch (e: any) { this.mineError.set(e.message ?? '讀取失敗'); }
    finally { this.mineLoading.set(false); }
  }

  async cancel(listing: MyListing): Promise<void> {
    this.actionError.set(''); this.actionPending.set(listing.id);
    try {
      await this.svc.cancelListing(listing.id);
      this.myListings.update(ls => ls.map(l => l.id === listing.id ? { ...l, status: 'cancelled' as const } : l));
    } catch (e: any) { this.actionError.set(e.message ?? '下架失敗'); }
    finally { this.actionPending.set(null); }
  }

  // ── List item flow ────────────────────────────────────────────────────────
  openListFlow(): void {
    const activeCount = this.myListings().filter(l => l.status === 'active').length;
    if (activeCount >= 8) {
      this.mineError.set('上架商品已達上限（最多 8 件），請先下架商品');
      return;
    }
    this.mineError.set('');
    this._loadSaveData();
    this.listStep.set('select-item');
    this.listType.set('equipment');
    this.listSelected.set(null);
    this.slotFilter.set('');
    this.listPickerQuality.set('');
    this.listPickerAffix1.set(''); this.listPickerAffix2.set('');
    this.listPickerAffix3.set(''); this.listPickerAffix4.set('');
    this.listQty = 1; this.listPrice = 0;
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

  setListType(t: MarketItemType): void {
    this.listType.set(t);
    this.slotFilter.set('');
    this.listPickerQuality.set('');
    this.listPickerAffix1.set(''); this.listPickerAffix2.set('');
    this.listPickerAffix3.set(''); this.listPickerAffix4.set('');
  }

  selectListItem(item: any): void {
    this.listSelected.set(item);
    this.listQty = 1; this.listPrice = 0;
    this.listStep.set('set-price');
  }

  backToSelectItem(): void { this.listStep.set('select-item'); }

  get maxListQty(): number {
    const item = this.listSelected();
    if (!item || this.listType() === 'equipment') return 1;
    return item.qty ?? 1;
  }

  get listItemId(): string {
    const item = this.listSelected();
    if (!item) return '';
    return this.listType() === 'card' ? item.cardId : item.id;
  }

  get listItemName(): string {
    const item = this.listSelected();
    if (!item) return '';
    if (this.listType() === 'card') return this.cardName(item.cardId);
    return item.name ?? '';
  }

  async confirmList(): Promise<void> {
    if (!this.listPrice || this.listPrice <= 0) { this.listError.set('請輸入售價'); return; }
    if (!this.listQty   || this.listQty   <= 0) { this.listError.set('請輸入數量'); return; }
    this.listSubmitting.set(true); this.listError.set('');
    try {
      await this.svc.listItem({ itemType: this.listType(), itemId: this.listItemId, qty: this.listQty, price: this.listPrice });
      this.listStep.set(null);
      await this.loadMine();
    } catch (e: any) {
      const errMap: Record<string, string> = {
        listing_limit_exceeded: '上架商品已達上限（最多 8 件）',
      };
      this.listError.set(errMap[e.message] ?? e.message ?? '上架失敗');
    }
    finally { this.listSubmitting.set(false); }
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

  equipImgUrl(texture: string): string {
    const m = texture.match(/^equip_([a-z]+)(\d+)$/);
    if (!m) return '';
    const [, cat, numStr] = m;
    const n = parseInt(numStr);
    if (cat === 'sword') {
      if (n >= 40) return `equip/weapons/Icons/icon_32_2_${String(n - 40).padStart(2, '0')}.png`;
      return `equip/weapons/Icons/Iicon_32_${String(n).padStart(2, '0')}.png`;
    }
    return `equip/${cat}${n}.webp`;
  }

  cardImgUrl(cardId: string): string {
    if (cardId.startsWith('slime_zombie')) return 'sprite/slime/PNG/Slime2/With_shadow/Slime2_Idle_with_shadow.png';
    if (cardId.startsWith('slime_lava'))   return 'sprite/slime/PNG/Slime3/With_shadow/Slime3_Idle_with_shadow.png';
    if (cardId.startsWith('slime_'))       return 'sprite/slime/PNG/Slime1/With_shadow/Slime1_Idle_with_shadow.png';
    if (cardId.startsWith('plant1'))       return 'sprite/flower/PNG/Plant1/With_shadow/Plant1_Idle_with_shadow.png';
    if (cardId.startsWith('plant2'))       return 'sprite/flower/PNG/Plant2/With_shadow/Plant2_Idle_with_shadow.png';
    if (cardId.startsWith('plant3'))       return 'sprite/flower/PNG/Plant3/With_shadow/Plant3_Idle_with_shadow.png';
    if (cardId.startsWith('orc1'))         return 'sprite/orc/PNG/Orc1/With_shadow/orc1_idle_with_shadow.png';
    if (cardId.startsWith('orc2'))         return 'sprite/orc/PNG/Orc2/With_shadow/orc2_idle_with_shadow.png';
    if (cardId.startsWith('orc3'))         return 'sprite/orc/PNG/Orc3/With_shadow/orc3_idle_with_shadow.png';
    if (cardId.startsWith('vampire1'))     return 'sprite/vampire/PNG/Vampires1/With_shadow/Vampires1_Idle_with_shadow.png';
    if (cardId.startsWith('vampire2'))     return 'sprite/vampire/PNG/Vampires2/With_shadow/Vampires2_Idle_with_shadow.png';
    if (cardId.startsWith('vampire3'))     return 'sprite/vampire/PNG/Vampires3/With_shadow/Vampires3_Idle_with_shadow.png';
    return 'other/card.webp';
  }

  cardName(cardId: string): string { return getCardDef(cardId)?.name ?? cardId; }

  isPotionId(id: string): boolean { return id in POTION_FRAMES; }

  browseImgUrl(item: MarketListing): string {
    const snap = item.item_snapshot;
    if (item.item_type === 'equipment') return this.equipImgUrl(snap?.texture ?? '');
    if (item.item_type === 'card')      return this.cardImgUrl(snap?.cardId ?? '');
    return this.consumableImgUrl(snap?.id ?? '');
  }

  affixDetails(item: SaveEquipItem): { name: string; val: string }[] {
    if (!item?.affixes) return [];
    return item.affixes.map(a => ({
      name: STAT_NAMES[a.stat as StatKey] ?? a.stat,
      val:  fmtAffixValue(a.stat, a.value),
    }));
  }

  formatGold(n: number): string {
    return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M`
         : n >= 1_000     ? `${(n / 1_000).toFixed(1)}K`
         : String(n);
  }
}
