import { Client, Room } from 'colyseus.js';
import { GameRoomState, PlayerState, MapParams, MsgMove, MsgHpUpdate, MsgMinionSync, MsgMinionHit, MsgBossHit, MsgBossSync, MsgRewardSync, MsgMinionAttack } from '../../../../shared/types';

// ← 部署到 Render 後把這裡換成你的網址（不含 https://）
const RENDER_HOST = 'minirpg-q1zq.onrender.com';

const localHost = window.location.hostname;
const isProd    = localHost !== 'localhost' && localHost !== '127.0.0.1';
const WS_URL   = isProd ? `wss://${RENDER_HOST}`         : `ws://${localHost}:3001`;
const HTTP_URL = isProd ? `https://${RENDER_HOST}`        : `http://${localHost}:3001`;

export interface JoinedPayload {
  sessionId:     string;
  isHost:        boolean;
  seed:          number;
  roomCode:      string;
  hostNickname?: string;
  hostLevel?:    number;
  hostSkinId?:   number;
}

export interface GameStartPayload {
  seed:          number;
  questStar:     number;
  bossMonsterId: string;
  hostId:        string;
  questId:       string;
  mapParams:     MapParams;
  hostNickname:  string;
  guestNickname: string;
  hostSkinId:    number;
  guestSkinId:   number;
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
  sendReady(nickname: string, level: number, questId: string, questStar: number, bossMonsterId: string): void {
    this.room?.send('ready', { nickname, level, questId, questStar, bossMonsterId });
  }

  sendMove(x: number, y: number, lastDir: string, hp: number, maxHp: number): void {
    this.room?.send('move', { x, y, lastDir, hp, maxHp } satisfies MsgMove);
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

  /** Sync local nickname+level+skin into Colyseus schema (no isReady side-effects) */
  sendPlayerInfo(nickname: string, level: number, skinId: number): void {
    this.room?.send('playerInfo', { nickname, level, skinId });
  }

  // ── Listen ────────────────────────────────────────────────

  /** Fires on the host when the 2nd player joins the room */
  onPartnerJoined(cb: (data: { nickname: string; level: number; skinId: number }) => void): void {
    this.room?.onMessage('partnerJoined', cb);
  }

  /** Fires whenever the partner's info first appears (or changes) in the Colyseus schema */
  onPartnerInfoReady(cb: (nickname: string, level: number, skinId: number) => void): void {
    let lastNick = '';
    this.room?.onStateChange(state => {
      const players = state.players as any;
      if (!players?.forEach) return;
      players.forEach((p: any) => {
        if (p.sessionId !== this.sessionId && p.nickname && p.nickname !== lastNick) {
          lastNick = p.nickname;
          cb(p.nickname, p.level ?? 1, p.skinId ?? 0);
        }
      });
    });
  }

  onGameStart(cb: (payload: GameStartPayload) => void): void {
    this.room?.onMessage<GameStartPayload>('gameStart', cb);
  }

  onPartnerMove(cb: (state: GameRoomState['players']) => void): void {
    this.room?.onStateChange(state => cb(state.players));
  }

  onPartnerPos(cb: (data: { x: number; y: number; lastDir: string; hp: number; maxHp: number }) => void): void {
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

  sendMinionAttack(data: MsgMinionAttack): void {
    this.room?.send('minionAttack', data);
  }

  onMinionAttack(cb: (data: MsgMinionAttack) => void): void {
    this.room?.onMessage<MsgMinionAttack>('minionAttack', cb);
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
