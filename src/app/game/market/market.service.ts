import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { EquipQuality, StatKey } from '../data/equipment-data';

export type MarketItemType = 'equipment' | 'consumable' | 'card';

export interface MarketListing {
  id:              string;
  seller_user_id:  string;
  seller_nickname: string | null;
  item_type:       MarketItemType;
  item_name:       string;
  item_snapshot:   any;
  affix_stats:     string[] | null;
  quality:         EquipQuality | null;
  price:           number;
  qty:             number;
  created_at:      string;
}

export interface MyListing extends MarketListing {
  status:   'active' | 'sold' | 'cancelled';
  sold_at:  string | null;
}

export interface ListingsFilter {
  type?:     MarketItemType;
  quality?:  EquipQuality;
  affixes?:  StatKey[];
  name?:     string;
  page?:     number;
  limit?:    number;
}

@Injectable({ providedIn: 'root' })
export class MarketService {
  private auth = inject(AuthService);

  private get headers(): Record<string, string> {
    const token = this.auth.getToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  async getListings(filter: ListingsFilter = {}): Promise<MarketListing[]> {
    const params = new URLSearchParams();
    if (filter.type)              params.set('type',    filter.type);
    if (filter.quality)           params.set('quality', filter.quality);
    if (filter.name)              params.set('name',    filter.name);
    if (filter.page)              params.set('page',    String(filter.page));
    if (filter.limit)             params.set('limit',   String(filter.limit));
    if (filter.affixes?.length)   filter.affixes.forEach(a => params.append('affix', a));

    const res = await fetch(`${environment.apiUrl}/market/listings?${params}`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'fetch failed');
    return res.json();
  }

  async getMyListings(): Promise<MyListing[]> {
    const res = await fetch(`${environment.apiUrl}/market/my-listings`, {
      headers: this.headers,
    });
    if (!res.ok) throw new Error((await res.json()).error ?? 'fetch failed');
    return res.json();
  }

  async listItem(params: {
    itemType:  MarketItemType;
    itemId:    string;
    qty:       number;
    price:     number;
    itemName?: string;
  }): Promise<{ listingId: string }> {
    const res = await fetch(`${environment.apiUrl}/market/list`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify(params),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? 'list failed');
    return data;
  }

  async buyItem(listingId: string, qty = 0): Promise<{ qty_bought: number; cost: number }> {
    const res = await fetch(`${environment.apiUrl}/market/buy/${listingId}`, {
      method:  'POST',
      headers: this.headers,
      body:    JSON.stringify({ qty }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'buy failed');
    return { qty_bought: data.qty_bought, cost: data.cost };
  }

  async cancelListing(listingId: string): Promise<void> {
    const res = await fetch(`${environment.apiUrl}/market/list/${listingId}`, {
      method:  'DELETE',
      headers: this.headers,
    });
    const data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error ?? 'cancel failed');
  }
}
