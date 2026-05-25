import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { makeInitialSave } from '../game/data/save-store';

export interface AuthUser {
  userId:   string;
  playerId: string;
  nickname: string | null;
  accessToken:  string;
  refreshToken: string;
}

const USER_KEY        = 'rg_user';
const REMEMBER_KEY    = 'rg_remember';
const AUTO_LOGIN_KEY  = 'rg_auto_login';
const LOGIN_TIMEOUT   = 20_000; // 20 秒沒回應視為失敗

async function fetchWithTimeout(url: string, options: RequestInit, ms = LOGIN_TIMEOUT): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } catch (e: any) {
    if (e.name === 'AbortError') throw new Error('伺服器連線逾時，請稍後再試');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user: AuthUser | null = null;

  get user(): AuthUser | null { return this._user; }
  get isLoggedIn(): boolean    { return !!this._user; }

  /** 讀 localStorage，若有登入資料直接還原（自動登入） */
  init(): boolean {
    if (localStorage.getItem(AUTO_LOGIN_KEY) !== '1') return false;
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return false;
    try {
      this._user = JSON.parse(raw) as AuthUser;
      return true;
    } catch { return false; }
  }

  /** 取已記住的帳號（供畫面預填） */
  getSavedAccount(): string {
    return localStorage.getItem(REMEMBER_KEY) ?? '';
  }

  /**
   * 確認伺服器已醒來。Render 免費版冷啟動最多約 60 秒。
   * 每 3 秒 ping /health 一次，最多 25 次（~75 秒）。
   * onWaiting 在第一次失敗後呼叫，讓 UI 顯示等待提示。
   */
  async waitForServer(onWaiting: () => void): Promise<void> {
    for (let i = 0; i < 25; i++) {
      try {
        const res = await fetchWithTimeout(`${environment.apiUrl}/health`, {}, 8_000);
        if (res.ok) return;
      } catch {}
      if (i === 0) onWaiting();
      await new Promise(r => setTimeout(r, 3_000));
    }
    throw new Error('伺服器連線失敗，請稍後再試');
  }

  async login(account: string, password: string, rememberMe: boolean): Promise<void> {
    const res = await fetchWithTimeout(`${environment.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '登入失敗');

    if (rememberMe) {
      localStorage.setItem(REMEMBER_KEY,   account);
      localStorage.setItem(AUTO_LOGIN_KEY, '1');
    } else {
      localStorage.removeItem(REMEMBER_KEY);
      localStorage.removeItem(AUTO_LOGIN_KEY);
    }

    this._persist(data);
  }

  async register(playerId: string, account: string, password: string, nickname?: string): Promise<void> {
    const res = await fetchWithTimeout(`${environment.apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password, playerId, nickname: nickname || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '註冊失敗');
    // 清掉舊的本地存檔，新帳號應該從乾淨狀態開始
    localStorage.removeItem('auto_rpg_save');
    await this.login(account, password, true);
  }

  logout(): void {
    this._user = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTO_LOGIN_KEY);
  }

  getToken(): string { return this._user?.accessToken ?? ''; }

  /** 用 refreshToken 換新的 accessToken，成功後更新 localStorage */
  async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this._user?.refreshToken;
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${environment.apiUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      if (!this._user) return false;
      this._user.accessToken  = data.accessToken;
      this._user.refreshToken = data.refreshToken;
      localStorage.setItem('rg_user', JSON.stringify(this._user));
      return true;
    } catch { return false; }
  }

  /** 登入後同步存檔：有雲端存檔就下載，否則上傳本地（新玩家建檔） */
  async syncSave(): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    const playerId = this._user?.playerId ?? '';

    // 保底：登入後立刻把玩家名稱寫入 localStorage，
    // 確保遊戲拿到正確名稱而非隨機勇者xxx
    if (playerId) localStorage.setItem('playerName', playerId);

    // Render 免費版冷啟動可能很慢，最多重試 3 次
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${environment.apiUrl}/save`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) break;

        const data = await res.json();

        if (data.save_data && Object.keys(data.save_data).length > 0) {
          // 雙裝置衝突：比較時間戳，保留較新的存檔
          const cloudTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          const localTs = Number(localStorage.getItem('rg_save_ts') ?? '0');
          if (cloudTs >= localTs) {
            // 雲端較新 → 覆蓋本地
            localStorage.setItem('auto_rpg_save', JSON.stringify(data.save_data));
            localStorage.setItem('rg_save_ts', String(cloudTs));
          } else {
            // 本地較新 → 上傳本地到雲端
            const localSave = JSON.parse(localStorage.getItem('auto_rpg_save') ?? '{}');
            await fetch(`${environment.apiUrl}/save`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({ saveData: localSave, version: localSave.version ?? '' }),
            });
          }
        } else {
          // 無雲端存檔 → 新玩家，寫入帶有玩家名稱的初始存檔
          const initSave = makeInitialSave(playerId);
          localStorage.setItem('auto_rpg_save', JSON.stringify(initSave));
          await fetch(`${environment.apiUrl}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ saveData: initSave, version: initSave.version }),
          });
        }
        return; // 成功就離開
      } catch (_) {
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
  }

  private _persist(data: AuthUser): void {
    this._user = data;
    localStorage.setItem(USER_KEY, JSON.stringify(data));
  }
}
