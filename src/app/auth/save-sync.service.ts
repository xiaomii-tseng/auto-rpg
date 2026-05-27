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

  /** 不管 dirty flag，強制上傳並等待完成 — 登出前用 */
  async uploadNow(): Promise<void> {
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    this._dirty = true;
    await this._upload();
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

      // TODO: 單裝置限制暫時關閉
      // if (res.status === 409) {
      //   this._forceLogout('此帳號已在其他裝置登入，你已被登出'); return;
      // }

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

    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '99999',
      background: 'rgba(0,0,0,0.82)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
      background: '#160e04',
      border: '2px solid #a06810',
      borderRadius: '12px',
      padding: '32px 28px 24px',
      maxWidth: '320px',
      width: '88vw',
      textAlign: 'center',
      fontFamily: 'sans-serif',
      boxShadow: '0 0 32px rgba(160,104,16,0.4)',
    });

    const msg = document.createElement('p');
    msg.textContent = message;
    Object.assign(msg.style, {
      color: '#ffe08a', fontSize: '16px', lineHeight: '1.6',
      marginBottom: '24px', marginTop: '0',
    });

    const btn = document.createElement('button');
    btn.textContent = '確定';
    Object.assign(btn.style, {
      background: '#a06810', color: '#fff',
      border: 'none', borderRadius: '8px',
      padding: '10px 40px', fontSize: '16px',
      cursor: 'pointer', fontWeight: 'bold',
    });
    btn.addEventListener('click', () => window.location.reload());

    box.appendChild(msg);
    box.appendChild(btn);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }
}
