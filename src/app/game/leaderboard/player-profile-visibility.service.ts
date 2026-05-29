import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PlayerProfileVisibilityService {
  readonly visible   = signal(false);
  readonly playerId  = signal('');

  open(playerId: string): void {
    this.playerId.set(playerId);
    this.visible.set(true);
  }
  close(): void { this.visible.set(false); }
}
