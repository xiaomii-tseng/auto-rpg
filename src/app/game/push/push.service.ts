import { Injectable, inject } from '@angular/core';
import { SwPush } from '@angular/service-worker';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

const LS_ENDPOINT = 'push_sub_endpoint';
const LS_DISMISSED = 'push_prompt_dismissed';

@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush);
  private readonly auth   = inject(AuthService);

  get isSupported(): boolean { return this.swPush.isEnabled && !!environment.vapidPublicKey; }
  get isSubscribed(): boolean { return !!localStorage.getItem(LS_ENDPOINT); }
  get isDismissed(): boolean { return !!localStorage.getItem(LS_DISMISSED); }

  dismiss(): void { localStorage.setItem(LS_DISMISSED, '1'); }

  async subscribe(): Promise<boolean> {
    if (!this.isSupported) return false;
    try {
      const sub = await this.swPush.requestSubscription({ serverPublicKey: environment.vapidPublicKey! });
      const token = this.auth.getToken();
      if (!token) return false;
      const r = await fetch(`${environment.apiUrl}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!r.ok) return false;
      localStorage.setItem(LS_ENDPOINT, sub.toJSON().endpoint ?? '');
      return true;
    } catch {
      return false;
    }
  }

  async unsubscribe(): Promise<void> {
    const endpoint = localStorage.getItem(LS_ENDPOINT);
    if (!endpoint) return;
    const token = this.auth.getToken();
    try {
      await this.swPush.unsubscribe();
      if (token) {
        await fetch(`${environment.apiUrl}/push/unsubscribe`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ endpoint }),
        });
      }
    } finally {
      localStorage.removeItem(LS_ENDPOINT);
    }
  }
}
