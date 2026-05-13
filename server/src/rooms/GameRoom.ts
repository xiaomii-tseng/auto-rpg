import { Room, Client } from 'colyseus';
import type { GameRoomState } from './GameRoomSchema';
import type { MapParams } from '../../../shared/types';

function mkRng(seed: number) {
  let s = (Math.abs(seed) % 2_147_483_646) + 1;
  const next = () => (s = (s * 16807) % 2_147_483_647) / 2_147_483_647;
  return {
    between: (a: number, b: number) => Math.floor(a + next() * (b - a + 1)),
    float:   (a: number, b: number) => a + next() * (b - a),
  };
}
import { PlayerState } from './GameRoomSchema';
import { codeMap, generateCode } from '../codeRegistry';
import {
  MsgReady, MsgMove, MsgHpUpdate,
  MsgMinionSync, MsgMinionHit, MsgBossHit, MsgBossSync, MsgRewardSync, MsgRunEnd, MsgMinionAttack,
} from '../../../shared/types';

export class GameRoom extends Room<GameRoomState> {
  maxClients = 2;

  private _gameCode = '';
  private minionState: Record<string, import('../../../shared/types').MinionState> = {};
  private bossHp    = 0;
  private bossDead  = false;

  onCreate(): void {
    // Lazy import to avoid circular dep with Schema decorator order
    const { GameRoomState: GRS } = require('./GameRoomSchema');
    const state = new GRS();
    state.seed = Math.floor(Math.random() * 1_000_000);
    this.setState(state);

    // Register 4-digit code
    this._gameCode = generateCode();
    codeMap.set(this._gameCode, this.roomId);

    this.onMessage<MsgReady>('ready', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.nickname = msg.nickname;
      if (msg.level) p.level = msg.level;

      const isHost = client.sessionId === this.state.hostId;

      // Host selecting a quest starts a new round — reset per-round state
      if (isHost && msg.questId) {
        this.bossHp    = 0;
        this.bossDead  = false;
        this.minionState = {};
        this.state.phase = 'lobby';
        this.state.seed  = Math.floor(Math.random() * 1_000_000);
        this.state.players.forEach(pl => { pl.isReady = false; });
      }

      // Host is only truly "ready" when they've selected a quest.
      // The early info-only send (no questId) just stores nickname/level.
      if (!isHost || msg.questId) {
        p.isReady = true;
      }

      // Guest sends ready right after joining — notify host with name+level
      if (!isHost) {
        const hostClient = this.clients.find(c => c.sessionId === this.state.hostId);
        hostClient?.send('partnerJoined', { nickname: msg.nickname, level: p.level, skinId: p.skinId });
      }

      if (msg.questId)       this.state.questId       = msg.questId;
      if (msg.questStar)     this.state.questStar     = msg.questStar;
      if (msg.bossMonsterId) this.state.bossMonsterId = msg.bossMonsterId;
      this.tryStartGame();
    });

    this.onMessage<MsgMove>('move', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.x = msg.x; p.y = msg.y; p.lastDir = msg.lastDir;
      p.hp = msg.hp; p.maxHp = msg.maxHp;
      this.broadcast('partnerPos', { x: msg.x, y: msg.y, lastDir: msg.lastDir, hp: msg.hp, maxHp: msg.maxHp }, { except: client });
    });

    this.onMessage<{ animKey: string }>('attack', (client, msg) => {
      this.broadcast('attack', msg, { except: client });
    });

    this.onMessage<MsgHpUpdate>('hp', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.hp    = msg.hp;
      p.maxHp = msg.maxHp;
    });

    this.onMessage<{ nickname: string; level: number; skinId?: number }>('playerInfo', (client, msg) => {
      const p = this.state.players.get(client.sessionId);
      if (!p) return;
      p.nickname = msg.nickname;
      if (msg.level)                  p.level  = msg.level;
      if (msg.skinId !== undefined)   p.skinId = msg.skinId;
      // Notify every other connected client about this player's updated info
      this.clients.forEach(other => {
        if (other.sessionId !== client.sessionId) {
          other.send('partnerJoined', { nickname: p.nickname, level: p.level, skinId: p.skinId });
        }
      });
      // Also send back the partner's info to the sender (covers restore-from-game / late-join cases)
      let partner: import('./GameRoomSchema').PlayerState | undefined;
      this.state.players.forEach((pl: import('./GameRoomSchema').PlayerState) => {
        if (pl.sessionId !== client.sessionId) partner = pl;
      });
      if (partner?.nickname) {
        client.send('partnerJoined', { nickname: partner.nickname, level: partner.level, skinId: partner.skinId });
      }
    });

    this.onMessage<MsgMinionSync>('minionSync', (client, msg) => {
      if (client.sessionId !== this.state.hostId) return;
      msg.minions.forEach(m => { this.minionState[m.id] = m; });
      this.broadcast('minionSync', msg, { except: client });
    });

    this.onMessage<MsgMinionHit>('minionHit', (_client, msg) => {
      const m = this.minionState[msg.minionId];
      if (!m || m.isDead) return;
      m.hp -= msg.damage;
      if (m.hp <= 0) { m.hp = 0; m.isDead = true; }
      this.broadcast('minionHit', { minionId: msg.minionId, hp: m.hp, isDead: m.isDead });
    });

    this.onMessage<{ hp: number }>('bossInit', (_client, msg) => {
      if (this.bossHp === 0) this.bossHp = msg.hp;  // host sets once after game starts
    });

    this.onMessage<MsgBossSync>('bossSync', (client, msg) => {
      this.broadcast('bossSync', msg, { except: client });
    });

    this.onMessage<MsgBossHit>('bossHit', (_client, msg) => {
      if (this.bossDead) return;
      this.bossHp -= msg.damage;
      const dead = this.bossHp <= 0;
      if (dead) { this.bossHp = 0; this.bossDead = true; }
      this.broadcast('bossHit', { hp: this.bossHp, isDead: dead });
    });

    this.onMessage<MsgRewardSync>('rewardSync', (client, msg) => {
      this.broadcast('rewardSync', msg, { except: client });
    });

    this.onMessage<MsgRunEnd>('runEnd', (_client, msg) => {
      this.state.phase = 'ended';
      this.broadcast('runEnd', { won: msg.won });
    });

    this.onMessage<MsgMinionAttack>('minionAttack', (client, msg) => {
      if (client.sessionId !== this.state.hostId) return;
      this.broadcast('minionAttack', msg, { except: client });
    });

    this.onMessage('playerDead', (client) => {
      this.broadcast('partnerDead', {}, { except: client });
    });

    this.onMessage<{ type: string; amount: number }>('potionEffect', (client, msg) => {
      this.broadcast('potionEffect', msg, { except: client });
    });
  }

  onJoin(client: Client): void {
    const isHost = this.clients.length === 1;

    const p = new PlayerState();
    p.sessionId = client.sessionId;
    p.hp = 100; p.maxHp = 100;
    this.state.players.set(client.sessionId, p);

    if (isHost) {
      this.state.hostId = client.sessionId;
    }

    const hostP = this.state.players.get(this.state.hostId);
    client.send('joined', {
      sessionId:       client.sessionId,
      isHost,
      seed:            this.state.seed,
      roomCode:        this._gameCode,
      hostNickname:    !isHost ? (hostP?.nickname ?? '') : '',
      hostLevel:       !isHost ? (hostP?.level    ?? 1)  : 0,
      hostSkinId:      !isHost ? (hostP?.skinId   ?? 0)  : 0,
    });
  }

  async onLeave(client: Client, consented: boolean): Promise<void> {
    if (!consented) {
      // 非主動離開（場景切換間隙斷線）→ 給 30 秒重連，保留 player state
      try {
        await this.allowReconnection(client, 90);
        return;  // 重連成功，player state 已保留
      } catch {
        // 30 秒內未重連 → 正常離開流程
      }
    }
    const isHost = client.sessionId === this.state.hostId;
    this.state.players.delete(client.sessionId);
    if (this.state.phase === 'playing') {
      this.broadcast('partnerLeft', {});
    } else if (isHost) {
      this.broadcast('roomClosed', {});
      this.disconnect();
    }
  }

  onDispose(): void {
    codeMap.delete(this._gameCode);
  }

  private tryStartGame(): void {
    const players = [...this.state.players.values()];
    const host = players.find(p => p.sessionId === this.state.hostId);
    if (players.length === 2 && host?.isReady && !!this.state.questId) {
      this.state.phase = 'playing';

      // Generate map layout on the server so both clients receive identical params
      const rng = mkRng(this.state.seed);
      const angle0 = rng.float(0, Math.PI * 2);
      const count  = rng.between(3, 5);
      const segments = Array.from({ length: count }, () => ({
        angleDelta: rng.float(-Math.PI * 0.5, Math.PI * 0.5),
        distRatio:  rng.float(0, 1),   // client maps this to P(600)..P(800)
      }));
      const mapParams: MapParams = { angle0, segments, bossArenaShape: rng.between(0, 3) };

      const guest = players.find(p => p.sessionId !== this.state.hostId);
      this.broadcast('gameStart', {
        seed:          this.state.seed,
        questStar:     this.state.questStar,
        bossMonsterId: this.state.bossMonsterId,
        hostId:        this.state.hostId,
        questId:       this.state.questId,
        mapParams,
        hostNickname:  host?.nickname  ?? '',
        guestNickname: guest?.nickname ?? '',
        hostSkinId:    host?.skinId    ?? 0,
        guestSkinId:   guest?.skinId   ?? 0,
      });
    }
  }

  setBossHp(hp: number): void { this.bossHp = hp; }
}
