import { Component, HostListener, signal, NgZone, inject, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NetworkService } from '../network/network.service';

export interface ChatMsg {
  nickname: string;
  text:     string;
  ts:       number;
}

const MAX_MESSAGES = 50;
const RATE_LIMIT_MS = 2000;

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './chat.component.html',
  styleUrl:    './chat.component.scss',
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  private readonly ngZone = inject(NgZone);

  @ViewChild('msgList') msgListRef!: ElementRef<HTMLDivElement>;

  readonly messages = signal<ChatMsg[]>([]);
  inputText = '';

  private _lastSentAt = 0;
  private _shouldScroll = false;
  private _minimized = true;
  get minimized(): boolean { return this._minimized; }

  // Intercept ALL pointer events at the host level.
  // stopPropagation prevents bubbling to window (where Phaser listens for pointerup).
  // setTimeout(0) on re-enable ensures Phaser's window listener fires while input is still disabled.
  @HostListener('pointerdown', ['$event'])
  onHostPointerDown(e: PointerEvent): void {
    e.stopPropagation();
    (window as any).__setGameInputEnabled?.(false);
  }

  @HostListener('pointerup', ['$event'])
  onHostPointerUp(e: PointerEvent): void {
    e.stopPropagation();
    // Re-enable only if text input doesn't have focus (user isn't typing)
    if (document.activeElement?.tagName !== 'INPUT') {
      setTimeout(() => (window as any).__setGameInputEnabled?.(true), 0);
    }
  }

  ngOnInit(): void {
    NetworkService.onChatMsg(msg => {
      this.ngZone.run(() => {
        this.messages.update(prev => {
          const next = [...prev, msg];
          return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
        });
        this._shouldScroll = true;
      });
    });

    NetworkService.onChatHistory(data => {
      this.ngZone.run(() => {
        this.messages.set(data.messages.slice(-MAX_MESSAGES));
        this._shouldScroll = true;
      });
    });
  }

  ngOnDestroy(): void {
    NetworkService.onChatMsg(() => {});
    NetworkService.onChatHistory(() => {});
  }

  ngAfterViewChecked(): void {
    if (this._shouldScroll) {
      this._shouldScroll = false;
      const el = this.msgListRef?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }

  onInputFocus(): void  { (window as any).__setGameInputEnabled?.(false); }
  onInputBlur(): void   { (window as any).__setGameInputEnabled?.(true);  }

  send(): void {
    const text = this.inputText.trim().slice(0, 60);
    if (!text) return;
    const now = Date.now();
    if (now - this._lastSentAt < RATE_LIMIT_MS) return;
    this._lastSentAt = now;
    const nickname = localStorage.getItem('playerName') || '???';
    this.messages.update(prev => {
      const next = [...prev, { nickname, text, ts: now }];
      return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
    });
    this._shouldScroll = true;
    NetworkService.sendChat(text);
    this.inputText = '';
  }

  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Enter') { e.preventDefault(); this.send(); }
  }

  toggleMinimize(): void { this._minimized = !this._minimized; }
}
