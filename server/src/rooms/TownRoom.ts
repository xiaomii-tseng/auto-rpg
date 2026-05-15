import { Room, Client } from 'colyseus';
import { TownRoomState, TownPlayerState } from './TownRoomSchema';

export class TownRoom extends Room<TownRoomState> {
  maxClients = 30;

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
    this.state.players.delete(client.sessionId);
    this.broadcast('townPlayerLeft', { sessionId: client.sessionId });
  }
}
