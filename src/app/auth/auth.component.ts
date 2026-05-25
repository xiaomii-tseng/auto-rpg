import { Component, AfterViewInit, Output, EventEmitter, ViewChild, ElementRef, signal, computed, inject } from '@angular/core';
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
export class AuthComponent implements AfterViewInit {
  @Output() loggedIn = new EventEmitter<void>();
  @ViewChild('backdrop') backdropRef!: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);

  ngAfterViewInit(): void {
    if (window.innerHeight <= window.innerWidth) return;
    // 假橫版：套用跟 game-wrapper 完全一致的旋轉（用 JS 拿到精確像素值）
    const W = window.innerHeight; // landscape width = portrait height
    const H = window.innerWidth;  // landscape height = portrait width
    Object.assign(this.backdropRef.nativeElement.style, {
      top:             '0',
      left:            '0',
      right:           'auto',
      bottom:          'auto',
      width:           `${W}px`,
      height:          `${H}px`,
      transformOrigin: 'top left',
      transform:       `rotate(90deg) translateY(-100%)`,
    });
  }

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

  loading = false;
  error   = '';
  shake   = false;

  isLogin    = computed(() => this.tab() === 'login');
  isRegister = computed(() => this.tab() === 'register');

  switchTab(t: Tab) {
    if (this.tab() === t) return;
    this.tab.set(t);
    this.error = '';
  }

  async submit() {
    if (this.loading) return;
    this.error   = '';
    this.loading = true;
    try {
      if (this.tab() === 'login') {
        if (!this.loginAccount || !this.loginPassword) throw new Error('請填寫帳號與密碼');
        await this.auth.login(this.loginAccount, this.loginPassword, this.rememberMe);
      } else {
        if (!this.regPlayerName || !this.regAccount || !this.regPassword) throw new Error('請填寫必填欄位');
        if (this.regPassword.length < 6) throw new Error('密碼至少需要 6 個字元');
        await this.auth.register(this.regPlayerName, this.regAccount, this.regPassword, this.regNickname || undefined);
      }
      this.loggedIn.emit();
    } catch (e: any) {
      this.error = e.message ?? '發生錯誤';
      this.triggerShake();
    } finally {
      this.loading = false;
    }
  }

  private triggerShake() {
    this.shake = true;
    setTimeout(() => this.shake = false, 600);
  }
}
