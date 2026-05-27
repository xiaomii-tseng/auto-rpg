import { Component, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { AuthService }  from './auth.service';
import { t, getLang, setLang } from '../game/i18n/i18n';

type Tab = 'login' | 'register';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './auth.component.html',
  styleUrl: './auth.component.scss',
})
export class AuthComponent {
  @Output() loggedIn = new EventEmitter<void>();

  private auth = inject(AuthService);

  readonly t = t;
  readonly currentLang = getLang();

  toggleLang(): void {
    setLang(this.currentLang === 'zh' ? 'en' : 'zh');
  }

  // ── PWA install panel ──────────────────────────────────
  readonly isStandalone = window.matchMedia('(display-mode: standalone)').matches
                       || window.matchMedia('(display-mode: fullscreen)').matches
                       || (navigator as any).standalone === true;
  readonly isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  readonly isAndroid = /android/i.test(navigator.userAgent);
  // 已安裝且在瀏覽器開啟時（canInstall=false 且非 iOS）也隱藏安裝面板
  readonly showPwaPanel = !this.isStandalone
    && (this.isIOS || !!(window as any).__pwaPrompt);

  canInstall = signal(!!(window as any).__pwaPrompt && !this.isIOS);

  async installPWA() {
    const prompt = (window as any).__pwaPrompt;
    if (!prompt) return;
    prompt.prompt();
    const result = await prompt.userChoice;
    if (result.outcome === 'accepted') {
      (window as any).__pwaPrompt = null;
      this.canInstall.set(false);
    }
  }

  tab = signal<Tab>('login');

  // login fields
  loginAccount  = this.auth.getSavedAccount();
  loginPassword = '';
  rememberMe    = true;

  // register fields
  regPlayerName = '';
  regAccount    = '';
  regPassword   = '';
  regEmail      = '';
  regNickname   = '';

  loading     = signal(false);
  loadingHint = signal('');
  error       = signal('');

  isLogin    = computed(() => this.tab() === 'login');
  isRegister = computed(() => this.tab() === 'register');

  switchTab(t: Tab) {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.error.set('');
  }

  async submit() {
    if (this.loading()) return;
    // 前端驗證（不需要連線）
    if (this.tab() === 'login') {
      if (!this.loginAccount || !this.loginPassword) { this.showError(t('auth.error.fillAccount')); return; }
    } else {
      if (!this.regPlayerName || !this.regAccount || !this.regPassword || !this.regEmail) { this.showError(t('auth.error.fillRequired')); return; }
      if (this.regPassword.length < 6) { this.showError(t('auth.error.shortPassword')); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.regEmail)) { this.showError(t('auth.error.badEmail')); return; }
    }

    this.error.set('');
    this.loadingHint.set('');
    this.loading.set(true);
    try {
      await this.auth.waitForServer(() => { this.loadingHint.set(t('auth.loading.server')); });
      this.loadingHint.set('');
      if (this.tab() === 'login') {
        await this.auth.login(this.loginAccount, this.loginPassword, this.rememberMe);
      } else {
        await this.auth.register(this.regPlayerName, this.regAccount, this.regPassword, this.regEmail, this.regNickname || undefined);
      }
      this.loggedIn.emit();
    } catch (e: any) {
      this.error.set(e.message ?? t('auth.error.general'));
    } finally {
      this.loading.set(false);
      this.loadingHint.set('');
    }
  }

  private showError(msg: string) {
    this.error.set(msg);
  }
}
