import { Client, Room } from 'colyseus.js';
import { GameRoomState, PlayerState, MapParams, MsgMove, MsgHpUpdate, MsgMinionSync, MsgMinionHit, MsgBossHit, MsgBossSync, MsgRewardSync } from '../../../../shared/types';

const HOST     = window.location.hostname;
const WS_URL   = `ws://${HOST}:3001`;
const HTTP_URL = `http://${HOST}:3001`;

export interface JoinedPayload {
  sessionId: string;
  isHost:    boolean;
  seed:      number;
  roomCode:  string;
}

export interface GameStartPayload {
  seed:          number;
  questStar:     number;
  bossMonsterId: string;
  hostId:        string;
  questId:       string;
  mapParams:     MapParams;
}

class NetworkServiceClass {
  private client?: Client;
  private room?:   Room<GameRoomState>;

  isHost    = false;
  sessionId = '';

  // ── Connect ───────────────────────────────────────────────

  async createRoom(nickname: string): Promise<JoinedPayload> {
    this.client = new Client(WS_URL);
    this.room   = await this.client.create<GameRoomState>('game');
    return this._afterJoin(nickname);
  }

  async joinRoom(gameCode: string, nickname: string): Promise<JoinedPayload> {
    // Resolve 4-digit code → real Colyseus roomId
    const res = await fetch(`${HTTP_URL}/room/${gameCode}`);
    if (!res.ok) throw new Error('Room not found');
    const { roomId } = await res.json() as { roomId: string };

    this.client = new Client(WS_URL);
    this.room   = await this.client.joinById<GameRoomState>(roomId);
    return this._afterJoin(nickname);
  }

  private _afterJoin(nickname: string): Promise<JoinedPayload> {
    return new Promise(resolve => {
      this.room!.onMessage<JoinedPayload>('joined', payload => {
        this.isHost    = payload.isHost;
        this.sessionId = payload.sessionId;
        // NOTE: ready is NOT sent here; host calls sendReady() after quest selection
        resolve({ ...payload, nickname } as JoinedPayload);
      });
    });
  }

  // ── Send ──────────────────────────────────────────────────

  /** Host calls this after selecting a quest; triggers gameStart on server */
  sendReady(nickname: string, questId: string, questStar: number, bossMonsterId: string): void {
    this.room?.send('ready', { nickname, questId, questStar, bossMonsterId });
  }

  sendMove(x: number, y: number, lastDir: string): void {
    this.room?.send('move', { x, y, lastDir } satisfies MsgMove);
  }

  sendAttack(animKey: string, x: number, y: number, dir: string, behavior: string): void {
    this.room?.send('attack', { animKey, x, y, dir, behavior });
  }

  sendHp(hp: number, maxHp: number): void {
    this.room?.send('hp', { hp, maxHp } satisfies MsgHpUpdate);
  }

  sendMinionSync(minions: MsgMinionSync['minions']): void {
    this.room?.send('minionSync', { minions } satisfies MsgMinionSync);
  }

  sendMinionHit(minionId: string, damage: number): void {
    this.room?.send('minionHit', { minionId, damage } satisfies MsgMinionHit);
  }

  sendBossInit(hp: number): void {
    this.room?.send('bossInit', { hp });
  }

  sendBossHit(damage: number): void {
    this.room?.send('bossHit', { damage });
  }

  sendBossSync(data: MsgBossSync): void {
    this.room?.send('bossSync', data);
  }

  sendRewardSync(data: MsgRewardSync): void {
    this.room?.send('rewardSync', data);
  }

  sendRunEnd(won: boolean): void {
    this.room?.send('runEnd', { won });
  }

  sendPlayerDead(): void {
    this.room?.send('playerDead', {});
  }

  sendPotionEffect(type: 'heal' | 'revive', amount: number): void {
    this.room?.send('potionEffect', { type, amount });
  }

  // ── Listen ────────────────────────────────────────────────

  /** Fires on the host when the 2nd player joins the room */
  onPartnerJoined(cb: () => void): void {
    this.room?.onMessage('partnerJoined', cb);
  }

  onGameStart(cb: (payload: GameStartPayload) => void): void {
    this.room?.onMessage<GameStartPayload>('gameStart', cb);
  }

  onPartnerMove(cb: (state: GameRoomState['players']) => void): void {
    this.room?.onStateChange(state => cb(state.players));
  }

  onPartnerPos(cb: (data: { x: number; y: number; lastDir: string }) => void): void {
    this.room?.onMessage('partnerPos', cb);
  }

  onPartnerAttack(cb: (data: { animKey: string; x: number; y: number; dir: string; behavior: string }) => void): void {
    this.room?.onMessage('attack', cb);
  }

  onMinionSync(cb: (data: MsgMinionSync) => void): void {
    this.room?.onMessage<MsgMinionSync>('minionSync', cb);
  }

  onMinionHit(cb: (data: { minionId: string; hp: number; isDead: boolean }) => void): void {
    this.room?.onMessage('minionHit', cb);
  }

  onBossHit(cb: (data: { hp: number; isDead: boolean }) => void): void {
    this.room?.onMessage('bossHit', cb);
  }

  onBossSync(cb: (data: MsgBossSync) => void): void {
    this.room?.onMessage<MsgBossSync>('bossSync', cb);
  }

  onRewardSync(cb: (data: MsgRewardSync) => void): void {
    this.room?.onMessage<MsgRewardSync>('rewardSync', cb);
  }

  onPartnerLeft(cb: () => void): void {
    this.room?.onMessage('partnerLeft', cb);
  }

  onPartnerDead(cb: () => void): void {
    this.room?.onMessage('partnerDead', cb);
  }

  onPotionEffect(cb: (data: { type: string; amount: number }) => void): void {
    this.room?.onMessage('potionEffect', cb);
  }

  onRunEnd(cb: (data: { won: boolean }) => void): void {
    this.room?.onMessage('runEnd', cb);
  }

  // ── State ─────────────────────────────────────────────────

  getPartnerState(): PlayerState | null {
    if (!this.room) return null;
    let found: PlayerState | null = null;
    const players = this.room.state.players as any;
    if (!players) return null;
    players.forEach((p: PlayerState) => {
      if (p.sessionId !== this.sessionId) found = p;
    });
    return found;
  }

  get roomCode(): string  { return this.room?.roomId ?? ''; }
  get connected(): boolean { return !!this.room; }

  disconnect(): void {
    this.room?.leave();
    this.room   = undefined;
    this.client = undefined;
  }
}

export const NetworkService = new NetworkServiceClass();
