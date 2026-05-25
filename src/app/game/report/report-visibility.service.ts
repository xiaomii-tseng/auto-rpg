import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ReportVisibilityService {
  readonly visible = signal(false);

  open(): void {
    this.visible.set(true);
    (window as any).__setGameInputEnabled?.(false);
  }
  close(): void {
    this.visible.set(false);
    (window as any).__setGameInputEnabled?.(true);
  }
}
