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
    await this.login(account, password, false);
  }

  logout(): void {
    this._user = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTO_LOGIN_KEY);
  }

  getToken(): string { return this._user?.accessToken ?? ''; }

  /** 登入後同步存檔：有雲端存檔就下載，否則上傳本地（新玩家建檔） */
  async syncSave(): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    // Render 免費版冷啟動可能很慢，最多重試 3 次
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${environment.apiUrl}/save`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) break;

        const data = await res.json();

        if (data.save_data && Object.keys(data.save_data).length > 0) {
          // 雲端有存檔 → 覆蓋本地，確保帳號之間不互污
          localStorage.setItem('auto_rpg_save', JSON.stringify(data.save_data));
        } else {
          // 無雲端存檔 → 清掉本地（可能是別帳號的舊資料），寫入初始存檔
          const initSave = makeInitialSave();
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
