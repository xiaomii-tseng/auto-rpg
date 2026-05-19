import { Room, Client } from 'colyseus';

interface TownPlayer {
  sessionId: string;
  x:         number;
  y:         number;
  lastDir:   string;
  nickname:  string;
  level:     number;
  skinId:    number;
}

interface PendingInvite {
  fromSid: string;
  toSid:   string;
  timer:   ReturnType<typeof setTimeout>;
}

export class TownRoom extends Room {
  maxClients = 30;
  private _players        = new Map<string, TownPlayer>();
  private _pendingInvites = new Map<string, PendingInvite>(); // key = toSid

  onCreate(): void {
    this.onMessage<{ x: number; y: number; lastDir: string }>('townMove', (client, msg) => {
      const p = this._players.get(client.sessionId);
      if (!p) return;
      p.x = Math.max(0, Math.min(1, msg.x));
      p.y = Math.max(0, Math.min(1, msg.y));
      p.lastDir = msg.lastDir;
      this.broadcast('townPos', {
        sessionId: client.sessionId, x: p.x, y: p.y, lastDir: p.lastDir,
      }, { except: client });
    });

    this.onMessage<{ nickname: string; level: number; skinId: number }>('townInfo', (client, msg) => {
      const p = this._players.get(client.sessionId);
      if (!p) return;
      p.nickname = msg.nickname || '';
      p.level    = msg.level   ?? 1;
      p.skinId   = msg.skinId  ?? 0;
      this.broadcast('townPlayerInfo', {
        sessionId: client.sessionId, nickname: p.nickname, level: p.level, skinId: p.skinId,
      });
    });

    // ── Party invite ──────────────────────────────────────────

    // Key = toSid so leader can have multiple pending invites simultaneously
    this.onMessage<{ targetSessionId: string; fromNickname: string; roomCode: string }>('partyInvite', (client, msg) => {
      const target = this.clients.find(c => c.sessionId === msg.targetSessionId);
      if (!target) { client.send('partyDeclined', { reason: 'offline', targetSessionId: msg.targetSessionId }); return; }

      // Cancel any existing invite already pending TO this target
      const prev = this._pendingInvites.get(msg.targetSessionId);
      if (prev) { clearTimeout(prev.timer); this._pendingInvites.delete(msg.targetSessionId); }

      const timer = setTimeout(() => {
        this._pendingInvites.delete(msg.targetSessionId);
        client.send('partyDeclined', { reason: 'timeout', targetSessionId: msg.targetSessionId });
        target.send('partyCancelled', {});
      }, 30000);

      this._pendingInvites.set(msg.targetSessionId, { fromSid: client.sessionId, toSid: msg.targetSessionId, timer });
      target.send('partyInvite', { fromSessionId: client.sessionId, fromNickname: msg.fromNickname, roomCode: msg.roomCode });
    });

    this.onMessage<{ accept: boolean; toSessionId: string }>('partyInviteResponse', (client, msg) => {
      const invite = this._pendingInvites.get(client.sessionId);
      if (!invite || invite.fromSid !== msg.toSessionId) return;
      clearTimeout(invite.timer);
      this._pendingInvites.delete(client.sessionId);

      const inviter = this.clients.find(c => c.sessionId === msg.toSessionId);
      if (!inviter) return;

      if (msg.accept) {
        inviter.send('partyAccepted', { guestSessionId: client.sessionId });
      } else {
        inviter.send('partyDeclined', { reason: 'declined', targetSessionId: client.sessionId });
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

    // Animal host broadcasts state to all other clients
    this.onMessage<any>('townAnimal', (client, msg) => {
      this.broadcast('townAnimal', msg, { except: client });
    });
  }

  onJoin(client: Client): void {
    const p: TownPlayer = {
      sessionId: client.sessionId,
      x:         0.45 + (Math.random() - 0.5) * 0.10,
      y:         0.45 + (Math.random() - 0.5) * 0.10,
      lastDir:   'down',
      nickname:  '',
      level:     1,
      skinId:    0,
    };
    this._players.set(client.sessionId, p);

    const existing: TownPlayer[] = [];
    this._players.forEach(pl => {
      if (pl.sessionId !== client.sessionId) existing.push({ ...pl });
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
    this._players.delete(client.sessionId);
    this.broadcast('townPlayerLeft', { sessionId: client.sessionId });
  }
}
