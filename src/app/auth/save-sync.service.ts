import { Injectable, inject } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { decryptSave } from '../game/data/save-store';

const SAVE_KEY = 'auto_rpg_save';
const SAVE_TS_KEY = 'rg_save_ts';
const DEBOUNCE_MS = 30_000;

@Injectable({ providedIn: 'root' })
export class SaveSyncService {
  private auth = inject(AuthService);

  private _dirty     = false;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _uploading = false;

  init(): void {
    window.addEventListener('beforeunload', () => this.forceUpload());
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
    const token = this.auth.getToken();
    if (!token || this._uploading) return;
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return;

    this._uploading = true;
    this._dirty = false;
    try {
      const saveData  = JSON.parse(decryptSave(raw));
      const sessionId = this.auth.getSessionId();
      const body      = JSON.stringify({ saveData, version: saveData.version ?? '', sessionId });
      const res = await fetch(`${environment.apiUrl}/save`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body,
      });

      if (res.status === 409) {
        this._forceLogout('此帳號已在其他裝置登入，你已被登出'); return;
      }

      if (res.status === 401) {
        // Token 過期 → 嘗試 refresh 再重試一次
        const refreshed = await this.auth.refreshAccessToken();
        if (refreshed) {
          const newToken = this.auth.getToken();
          const res2 = await fetch(`${environment.apiUrl}/save`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${newToken}` },
            body,
          });
          if (res2.ok) {
            localStorage.setItem(SAVE_TS_KEY, String(Date.now()));
            return;
          }
        }
        this._dirty = true; // refresh 失敗，標記 dirty 等下次
        return;
      }

      if (res.ok) {
        localStorage.setItem(SAVE_TS_KEY, String(Date.now()));
      } else {
        this._dirty = true;
      }
    } catch (_) {
      this._dirty = true;
    } finally {
      this._uploading = false;
    }
  }

  private _forceLogout(message: string): void {
    ['rg_user', 'rg_auto_login', 'rg_remember', 'auto_rpg_save', 'rg_save_ts', 'playerName']
      .forEach(k => localStorage.removeItem(k));
    alert(message);
    window.location.reload();
  }
}
