import { Component, Output, EventEmitter, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule }  from '@angular/forms';
import { AuthService }  from './auth.service';

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

  // ── PWA install panel ──────────────────────────────────
  readonly isStandalone = window.matchMedia('(display-mode: standalone)').matches
                       || (navigator as any).standalone === true;
  readonly isIOS     = /iphone|ipad|ipod/i.test(navigator.userAgent);
  readonly isAndroid = /android/i.test(navigator.userAgent);
  readonly showPwaPanel = !this.isStandalone;

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
      if (!this.loginAccount || !this.loginPassword) { this.showError('請填寫帳號與密碼'); return; }
    } else {
      if (!this.regPlayerName || !this.regAccount || !this.regPassword || !this.regEmail) { this.showError('請填寫必填欄位'); return; }
      if (this.regPassword.length < 6) { this.showError('密碼至少需要 6 個字元'); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.regEmail)) { this.showError('請輸入有效的電子郵件'); return; }
    }

    this.error.set('');
    this.loadingHint.set('');
    this.loading.set(true);
    try {
      await this.auth.waitForServer(() => { this.loadingHint.set('伺服器啟動中，請稍候...'); });
      this.loadingHint.set('');
      if (this.tab() === 'login') {
        await this.auth.login(this.loginAccount, this.loginPassword, this.rememberMe);
      } else {
        await this.auth.register(this.regPlayerName, this.regAccount, this.regPassword, this.regEmail, this.regNickname || undefined);
      }
      this.loggedIn.emit();
    } catch (e: any) {
      this.error.set(e.message ?? '發生錯誤');
    } finally {
      this.loading.set(false);
      this.loadingHint.set('');
    }
  }

  private showError(msg: string) {
    this.error.set(msg);
  }
}
