import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

const SAVE_KEY = 'auto_rpg_save';
const DEBOUNCE_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class SaveSyncService {
  private _token   = '';
  private _dirty   = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _uploading = false;

  init(token: string): void {
    this._token = token;
  }

  /** SaveStore.save() 之後呼叫，啟動 debounce 計時器 */
  markDirty(): void {
    this._dirty = true;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this._upload(), DEBOUNCE_MS);
  }

  /** 立刻上傳（不等 debounce）— 玩家切走 / 關卡結束時用 */
  forceUpload(): void {
    if (!this._dirty) return;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._upload();
  }

  private async _upload(): Promise<void> {
    if (!this._token || this._uploading) return;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;

    this._uploading = true;
    this._dirty = false;
    try {
      const saveData = JSON.parse(raw);
      await fetch(`${environment.apiUrl}/save`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${this._token}`,
        },
        body: JSON.stringify({ saveData, version: saveData.version ?? '' }),
      });
    } catch (_) {
      this._dirty = true; // 失敗就補回 dirty，等下次重試
    } finally {
      this._uploading = false;
    }
  }
}
