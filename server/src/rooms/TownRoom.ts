import { Room, Client } from 'colyseus';
import { TownRoomState, TownPlayerState } from './TownRoomSchema';

interface PendingInvite {
  fromSid: string;
  toSid:   string;
  timer:   ReturnType<typeof setTimeout>;
}

export class TownRoom extends Room<TownRoomState> {
  maxClients = 30;
  private _pendingInvites = new Map<string, PendingInvite>(); // key = fromSid

  onCreate(): void {
    const { TownRoomState: TRS } = require('./TownRoomSchema');
    this.setState(new TRS());

    this.onMessage<{ x: number; y: number; lastDir: string }>('townMove', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x = Math.max(0, Math.min(1, msg.x));
      p.y = Math.max(0, Math.min(1, msg.y));
      p.lastDir = msg.lastDir;
      this.broadcast('townPos', {
        sessionId: client.sessionId, x: p.x, y: p.y, lastDir: p.lastDir,
      }, { except: client });
    });

    this.onMessage<{ nickname: string; level: number; skinId: number }>('townInfo', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.nickname = msg.nickname || '';
      p.level    = msg.level   ?? 1;
      p.skinId   = msg.skinId  ?? 0;
      this.broadcast('townPlayerInfo', {
        sessionId: client.sessionId, nickname: p.nickname, level: p.level, skinId: p.skinId,
      });
    });

    // ── Party invite ──────────────────────────────────────────

    this.onMessage<{ targetSessionId: string; fromNickname: string }>('partyInvite', (client, msg) => {
      const target = this.clients.find(c => c.sessionId === msg.targetSessionId);
      if (!target) { client.send('partyDeclined', { reason: 'offline' }); return; }

      // Cancel any existing outgoing invite from this client
      const prev = this._pendingInvites.get(client.sessionId);
      if (prev) { clearTimeout(prev.timer); this._pendingInvites.delete(client.sessionId); }

      const timer = setTimeout(() => {
        this._pendingInvites.delete(client.sessionId);
        client.send('partyCancelled', {});
        const t = this.clients.find(c => c.sessionId === msg.targetSessionId);
        t?.send('partyCancelled', {});
      }, 30000);

      this._pendingInvites.set(client.sessionId, { fromSid: client.sessionId, toSid: msg.targetSessionId, timer });
      target.send('partyInvite', { fromSessionId: client.sessionId, fromNickname: msg.fromNickname });
    });

    this.onMessage<{ accept: boolean; toSessionId: string }>('partyInviteResponse', (client, msg) => {
      const invite = this._pendingInvites.get(msg.toSessionId);
      if (!invite || invite.toSid !== client.sessionId) return;
      clearTimeout(invite.timer);
      this._pendingInvites.delete(msg.toSessionId);

      const inviter = this.clients.find(c => c.sessionId === msg.toSessionId);
      if (!inviter) return;

      if (msg.accept) {
        inviter.send('partyAccepted', { guestSessionId: client.sessionId });
      } else {
        inviter.send('partyDeclined', { reason: 'declined' });
      }
    });

    // Leader sends this after creating the GameRoom; server forwards to guest
    this.onMessage<{ targetSessionId: string; roomCode: string }>('partyRoomReady', (client, msg) => {
      const target = this.clients.find(c => c.sessionId === msg.targetSessionId);
      target?.send('partyRoomCode', { roomCode: msg.roomCode });
    });

    // Either party member sends this to notify the other that the party is disbanded
    this.onMessage<{ targetSessionId: string }>('partyDisband', (client, msg) => {
      const target = this.clients.find(c => c.sessionId === msg.targetSessionId);
      target?.send('partyCancelled', {});
    });
  }

  onJoin(client: Client): void {
    const p = new TownPlayerState();
    p.sessionId = client.sessionId;
    p.x = 0.45 + (Math.random() - 0.5) * 0.10;
    p.y = 0.45 + (Math.random() - 0.5) * 0.10;
    this.state.players.set(client.sessionId, p);

    const existing: { sessionId: string; x: number; y: number; lastDir: string; nickname: string; level: number; skinId: number }[] = [];
    this.state.players.forEach(pl => {
      if (pl.sessionId !== client.sessionId) {
        existing.push({
          sessionId: pl.sessionId, x: pl.x, y: pl.y, lastDir: pl.lastDir,
          nickname: pl.nickname, level: pl.level, skinId: pl.skinId,
        });
      }
    });
    client.send('townJoined', { sessionId: client.sessionId, x: p.x, y: p.y, existing });

    this.broadcast('townPlayerJoined', {
      sessionId: client.sessionId, x: p.x, y: p.y, lastDir: 'down', nickname: '', level: 1, skinId: 0,
    }, { except: client });
  }

  onLeave(client: Client): void {
    // Cancel any pending invite involving this client and notify the other party
    this._pendingInvites.forEach((inv, key) => {
      if (inv.fromSid === client.sessionId || inv.toSid === client.sessionId) {
        clearTimeout(inv.timer);
        this._pendingInvites.delete(key);
        const otherSid = inv.fromSid === client.sessionId ? inv.toSid : inv.fromSid;
        const other = this.clients.find(c => c.sessionId === otherSid);
        other?.send('partyCancelled', {});
      }
    });
    this.state.players.delete(client.sessionId);
    this.broadcast('townPlayerLeft', { sessionId: client.sessionId });
  }
}
