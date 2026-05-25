import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export interface AuthUser {
  userId:   string;
  playerId: string;
  nickname: string | null;
  accessToken:  string;
  refreshToken: string;
}

const USER_KEY        = 'rg_user';
const REMEMBER_KEY    = 'rg_remember';   // 存帳號（不存密碼）
const AUTO_LOGIN_KEY  = 'rg_auto_login'; // 是否自動登入

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
    const res = await fetch(`${environment.apiUrl}/auth/login`, {
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
    const res = await fetch(`${environment.apiUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account, password, playerId, nickname: nickname || undefined }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? '註冊失敗');
    await this.login(account, password, false);
  }

  logout(): void {
    this._user = null;
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(AUTO_LOGIN_KEY);
  }

  getToken(): string { return this._user?.accessToken ?? ''; }

  /** 登入後同步存檔：有雲端存檔就下載，否則上傳本地（新玩家建檔）*/
  async syncSave(): Promise<void> {
    const token = this.getToken();
    if (!token) return;

    try {
      const res = await fetch(`${environment.apiUrl}/save`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();

      if (data.save_data && Object.keys(data.save_data).length > 0) {
        // 雲端有存檔 → 寫入 localStorage，PrepScene 會讀取
        localStorage.setItem('auto_rpg_save', JSON.stringify(data.save_data));
      } else {
        // 新玩家，上傳當前本地存檔（可能是空的，也沒關係）
        const local = localStorage.getItem('auto_rpg_save');
        const saveData = local ? JSON.parse(local) : {};
        await fetch(`${environment.apiUrl}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ saveData, version: saveData.version ?? '' }),
        });
      }
    } catch (_) {}
  }

  private _persist(data: AuthUser): void {
    this._user = data;
    localStorage.setItem(USER_KEY, JSON.stringify(data));
  }
}
