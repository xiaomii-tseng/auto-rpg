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

  tab = signal<Tab>('login');

  // login fields
  loginAccount  = this.auth.getSavedAccount();
  loginPassword = '';
  rememberMe    = !!this.auth.getSavedAccount();

  // register fields
  regPlayerName = '';
  regAccount    = '';
  regPassword   = '';
  regNickname   = '';

  loading     = false;
  loadingHint = '';
  error       = '';
  shake       = false;

  isLogin    = computed(() => this.tab() === 'login');
  isRegister = computed(() => this.tab() === 'register');

  switchTab(t: Tab) {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.error = '';
  }

  async submit() {
    if (this.loading) return;
    // 前端驗證（不需要連線）
    if (this.tab() === 'login') {
      if (!this.loginAccount || !this.loginPassword) { this.showError('請填寫帳號與密碼'); return; }
    } else {
      if (!this.regPlayerName || !this.regAccount || !this.regPassword) { this.showError('請填寫必填欄位'); return; }
      if (this.regPassword.length < 6) { this.showError('密碼至少需要 6 個字元'); return; }
    }

    this.error       = '';
    this.loadingHint = '';
    this.loading     = true;
    try {
      await this.auth.waitForServer(() => { this.loadingHint = '伺服器啟動中，請稍候...'; });
      this.loadingHint = '';
      if (this.tab() === 'login') {
        await this.auth.login(this.loginAccount, this.loginPassword, this.rememberMe);
      } else {
        await this.auth.register(this.regPlayerName, this.regAccount, this.regPassword, this.regNickname || undefined);
      }
      this.loggedIn.emit();
    } catch (e: any) {
      this.error = e.message ?? '發生錯誤';
      this.triggerShake();
    } finally {
      this.loading     = false;
      this.loadingHint = '';
    }
  }

  private showError(msg: string) {
    this.error = msg;
    this.triggerShake();
  }

  private triggerShake() {
    this.shake = true;
    setTimeout(() => this.shake = false, 600);
  }
}
