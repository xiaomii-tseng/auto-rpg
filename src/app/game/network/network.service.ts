import { Client, Room } from 'colyseus.js';
import { GameRoomState, PlayerState, MapParams, MsgMove, MsgHpUpdate, MsgMinionSync, MsgMinionHit, MsgBossHit, MsgBossSync, MsgRewardSync, MsgMinionAttack } from '../../../../shared/types';

const isLocal  = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
const WS_URL   = isLocal ? 'ws://localhost:3001' : 'wss://minirpg-q1zq.onrender.com';
const HTTP_URL = isLocal ? 'http://localhost:3001' : 'https://minirpg-q1zq.onrender.com';

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
  seed:           number;
  questStar:      number;
  bossMonsterId:  string;
  hostId:         string;
  questId:        string;
  mapParams:      MapParams;
  playerCount:    number;
  hostNickname:   string;
  guestNickname:  string;
  hostSkinId:     number;
  guestSkinId:    number;
  guestNicknames?: string[];
  guestSkinIds?:   number[];
}

// ── Town callbacks ─────────────────────────────────────────────────────────
interface TownCallbacks {
  townPos?:          (data: { sessionId: string; x: number; y: number; lastDir: string }) => void;
  townPlayerJoined?: (data: { sessionId: string; x: number; y: number; lastDir: string; nickname: string; level: number; skinId: number }) => void;
  townPlayerLeft?:   (data: { sessionId: string }) => void;
  townPlayerInfo?:   (data: { sessionId: string; nickname: string; level: number; skinId: number }) => void;
  // Party invite flow
  partyInvite?:    (data: { fromSessionId: string; fromNickname: string; roomCode: string }) => void;
  partyAccepted?:  (data: { guestSessionId: string }) => void;
  partyDeclined?:  (data: { reason: string; targetSessionId?: string }) => void;
  partyRoomCode?:  (data: { roomCode: string }) => void;
  partyCancelled?: () => void;
}

// ── Replaceable callback slots ─────────────────────────────────────────────
interface Callbacks {
  gameStart?:        (p: GameStartPayload) => void;
  partnerJoined?:    (data: { sessionId?: string; nickname: string; level: number; skinId: number }) => void;
  partnerInfoReady?: (name: string, level: number, skinId: number) => void;
  partnerMove?:      (players: GameRoomState['players']) => void;
  partnerPos?:       (data: { sessionId?: string; x: number; y: number; lastDir: string; hp: number; maxHp: number }) => void;
  partnerAttack?:    (data: { sessionId?: string; animKey: string; x: number; y: number; dir: string; behavior: string }) => void;
  partnerLeft?:      () => void;
  partnerDead?:      (data?: { sessionId?: string }) => void;
  roomClosed?:       () => void;
  minionSync?:       (data: MsgMinionSync) => void;
  minionHit?:        (data: { minionId: string; hp: number; isDead: boolean }) => void;
  minionAttack?:     (data: MsgMinionAttack) => void;
  bossHit?:          (data: { hp: number; isDead: boolean }) => void;
  bossSync?:         (data: MsgBossSync) => void;
  rewardSync?:       (data: MsgRewardSync) => void;
  runEnd?:           (data: { won: boolean }) => void;
  potionEffect?:     (data: { type: string; amount: number }) => void;
  reconnected?:      () => void;
  reconnectFailed?:  () => void;
}

class NetworkServiceClass {
  private client?: Client;
  private room?:   Room<GameRoomState>;

  // ── TownRoom (shared hub, separate connection) ─────────
  private townClient?: Client;
  private townRoom?:   Room<any>;
  private _townCbs: TownCallbacks = {};
  townSessionId = '';

  isHost    = false;
  sessionId = '';
  gameCode  = '';
  partyMode = false; // true when room was formed via town party invite
  private _hostSid = ''; // cached from gameStart message (schema-independent)

  private _cbs: Callbacks = {};
  private _autoLobby = false;
  private _lastPartnerNick  = '';
  private _lastPartnerLevel = 0;

  private _reconnectionToken = '';
  private _disconnected      = false;
  private _reconnecting      = false;
  private _visibilityHandler = () => this._onVisibilityChange();

  /** 從多人遊戲退出時設旗標，PrepScene 啟動後呼叫 consumeAutoLobby() 一次性讀取 */
  setAutoLobby(): void  { this._autoLobby = true; }
  consumeAutoLobby(): boolean { const v = this._autoLobby; this._autoLobby = false; return v; }

  // ── Connect ───────────────────────────────────────────────

  async createRoom(nickname: string): Promise<JoinedPayload> {
    this.client = new Client(WS_URL);
    this.room   = await this.client.create<GameRoomState>('game');
    this._registerForwarders();
    return this._afterJoin(nickname);
  }

  async joinRoom(gameCode: string, nickname: string): Promise<JoinedPayload> {
    const res = await fetch(`${HTTP_URL}/room/${gameCode}`);
    if (!res.ok) throw new Error('Room not found');
    const { roomId } = await res.json() as { roomId: string };

    this.client = new Client(WS_URL);
    this.room   = await this.client.joinById<GameRoomState>(roomId);
    this._registerForwarders();
    return this._afterJoin(nickname);
  }

  // Registers one set of Colyseus listeners per room. Callbacks are forwarded
  // to the replaceable _cbs slots, so re-registering scene callbacks is safe.
  private _registerForwarders(): void {
    const r = this.room!;
    r.onMessage<GameStartPayload>('gameStart',    p  => { this._hostSid = p.hostId; this._cbs.gameStart?.(p); });
    r.onMessage('partnerJoined',  (d: any)        => this._cbs.partnerJoined?.(d));
    r.onMessage('partnerPos',     (d: any)        => this._cbs.partnerPos?.(d));
    r.onMessage('attack',         (d: any)        => this._cbs.partnerAttack?.(d));
    r.onMessage('partnerLeft',    ()              => this._cbs.partnerLeft?.());
    r.onMessage('roomClosed',     ()              => this._cbs.roomClosed?.());
    r.onMessage('partnerDead',    (d: any)        => this._cbs.partnerDead?.(d));
    r.onMessage<MsgMinionSync>('minionSync',      d  => this._cbs.minionSync?.(d));
    r.onMessage('minionHit',      (d: any)        => this._cbs.minionHit?.(d));
    r.onMessage<MsgMinionAttack>('minionAttack',  d  => this._cbs.minionAttack?.(d));
    r.onMessage('bossHit',        (d: any)        => this._cbs.bossHit?.(d));
    r.onMessage<MsgBossSync>('bossSync',          d  => this._cbs.bossSync?.(d));
    r.onMessage<MsgRewardSync>('rewardSync',      d  => this._cbs.rewardSync?.(d));
    r.onMessage('runEnd',         (d: any)        => this._cbs.runEnd?.(d));
    r.onMessage('potionEffect',   (d: any)        => this._cbs.potionEffect?.(d));

    // Single onStateChange forwarder for both partnerInfoReady and partnerMove
    r.onStateChange(state => {
      this._cbs.partnerMove?.(state.players);
      if (!this._cbs.partnerInfoReady) return;
      const players = state.players as any;
      if (!players?.forEach) return;
      players.forEach((p: any) => {
        if (p.sessionId !== this.sessionId && p.nickname) {
          const nickChanged  = p.nickname !== this._lastPartnerNick;
          const levelChanged = (p.level ?? 1) !== this._lastPartnerLevel;
          if (nickChanged || levelChanged) {
            this._lastPartnerNick  = p.nickname;
            this._lastPartnerLevel = p.level ?? 1;
            this._cbs.partnerInfoReady?.(p.nickname, p.level ?? 1, p.skinId ?? 0);
          }
        }
      });
    });
  }

  private _afterJoin(nickname: string): Promise<JoinedPayload> {
    return new Promise(resolve => {
      this.room!.onMessage<JoinedPayload>('joined', payload => {
        this.isHost    = payload.isHost;
        this.sessionId = payload.sessionId;
        this.gameCode  = payload.roomCode;
        this._reconnectionToken = (this.room as any).reconnectionToken ?? '';
        this._disconnected = false;
        this._setupReconnect();
        resolve({ ...payload, nickname } as JoinedPayload);
      });
    });
  }

  private _setupReconnect(): void {
    this.room!.onLeave((code) => {
      // code 1000 = clean close (player quit intentionally)
      if (code !== 1000) this._disconnected = true;
    });
    document.removeEventListener('visibilitychange', this._visibilityHandler);
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private _onVisibilityChange(): void {
    if (!document.hidden && this._disconnected && !this._reconnecting) {
      this._tryReconnect();
    }
  }

  private async _tryReconnect(): Promise<void> {
    if (this._reconnecting || !this._reconnectionToken || !this.client) return;
    this._reconnecting = true;
    this._disconnected = false;
    try {
      const newRoom = await this.client.reconnect<GameRoomState>(this._reconnectionToken);
      this.room = newRoom;
      this._reconnectionToken = (newRoom as any).reconnectionToken ?? this._reconnectionToken;
      this._registerForwarders();
      this._setupReconnect();
      this._cbs.reconnected?.();
    } catch {
      this._disconnected = false;
      this._cbs.reconnectFailed?.();
    } finally {
      this._reconnecting = false;
    }
  }

  isReconnecting(): boolean { return this._reconnecting; }

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

  sendPotionEffect(type: 'heal' | 'revive' | 'atk' | 'def' | 'speed', amount: number): void {
    this.room?.send('potionEffect', { type, amount });
  }

  /** Sync local nickname+level+skin into Colyseus schema (no isReady side-effects) */
  sendPlayerInfo(nickname: string, level: number, skinId: number): void {
    this.room?.send('playerInfo', { nickname, level, skinId });
  }

  // ── Listen ────────────────────────────────────────────────
  // Each on* call simply replaces the callback slot.
  // The underlying Colyseus listener is registered once per room in _registerForwarders.

  /** Fires on the host when the 2nd player joins the room */
  onPartnerJoined(cb: (data: { sessionId?: string; nickname: string; level: number; skinId: number }) => void): void {
    this._cbs.partnerJoined = cb;
    // No immediate fire from schema — schema is unreliable on the client (classes not registered).
    // The server's playerInfo handler sends partnerJoined for all existing players back to the
    // new joiner, so all partners are always delivered via WebSocket message.
  }

  /** Fires whenever the partner's info first appears (or changes) in the Colyseus schema */
  onPartnerInfoReady(cb: (nickname: string, level: number, skinId: number) => void): void {
    this._cbs.partnerInfoReady = cb;
    const partner = this.getPartnerState() as any;
    if (partner) {
      // 立即觸發並更新追蹤變數，避免後續 onStateChange 重複 rebuild
      this._lastPartnerNick  = partner.nickname ?? '';
      this._lastPartnerLevel = partner.level    ?? 1;
      cb(this._lastPartnerNick, this._lastPartnerLevel, partner.skinId ?? 0);
    }
  }

  onGameStart(cb: (payload: GameStartPayload) => void): void {
    this._cbs.gameStart = cb;
  }

  onPartnerMove(cb: (state: GameRoomState['players']) => void): void {
    this._cbs.partnerMove = cb;
  }

  onPartnerPos(cb: (data: { sessionId?: string; x: number; y: number; lastDir: string; hp: number; maxHp: number }) => void): void {
    this._cbs.partnerPos = cb;
  }

  onPartnerAttack(cb: (data: { sessionId?: string; animKey: string; x: number; y: number; dir: string; behavior: string }) => void): void {
    this._cbs.partnerAttack = cb;
  }

  onMinionSync(cb: (data: MsgMinionSync) => void): void {
    this._cbs.minionSync = cb;
  }

  onMinionHit(cb: (data: { minionId: string; hp: number; isDead: boolean }) => void): void {
    this._cbs.minionHit = cb;
  }

  sendMinionAttack(data: MsgMinionAttack): void {
    this.room?.send('minionAttack', data);
  }

  onMinionAttack(cb: (data: MsgMinionAttack) => void): void {
    this._cbs.minionAttack = cb;
  }

  onBossHit(cb: (data: { hp: number; isDead: boolean }) => void): void {
    this._cbs.bossHit = cb;
  }

  onBossSync(cb: (data: MsgBossSync) => void): void {
    this._cbs.bossSync = cb;
  }

  onRewardSync(cb: (data: MsgRewardSync) => void): void {
    this._cbs.rewardSync = cb;
  }

  onPartnerLeft(cb: () => void): void {
    this._cbs.partnerLeft = cb;
  }

  onRoomClosed(cb: () => void): void {
    this._cbs.roomClosed = cb;
  }

  onPartnerDead(cb: (data?: { sessionId?: string }) => void): void {
    this._cbs.partnerDead = cb;
  }

  onPotionEffect(cb: (data: { type: string; amount: number }) => void): void {
    this._cbs.potionEffect = cb;
  }

  onRunEnd(cb: (data: { won: boolean }) => void): void {
    this._cbs.runEnd = cb;
  }

  onReconnected(cb: () => void): void       { this._cbs.reconnected     = cb; }
  onReconnectFailed(cb: () => void): void   { this._cbs.reconnectFailed = cb; }

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

  getPartnersState(): PlayerState[] {
    const result: PlayerState[] = [];
    const players = this.room?.state.players as any;
    if (!players) return result;
    players.forEach((p: PlayerState) => {
      if (p.sessionId !== this.sessionId) result.push(p);
    });
    return result;
  }

  get hostSessionId(): string {
    return this._hostSid || (this.room?.state as any)?.hostId || '';
  }

  get roomCode(): string  { return this.room?.roomId ?? ''; }
  get connected(): boolean { return !!this.room; }

  // ── Lifecycle ─────────────────────────────────────────────

  /** 遊戲開始時清除舊大廳 callbacks，防止 Guest 先退出時觸發 stale rebuild */
  clearLobbyCallbacks(): void {
    this._lastPartnerNick  = '';
    this._lastPartnerLevel = 0;
    this._cbs.partnerInfoReady = undefined;
    this._cbs.partnerJoined    = undefined;
    this._cbs.gameStart        = undefined;
  }

  /**
   * Clear game-scene callbacks so stale handlers from a finished round
   * don't fire in the next round. Call from GameScene's shutdown handler.
   */
  clearGameCallbacks(): void {
    this._lastPartnerNick  = '';   // 重置讓大廳重新偵測等級變化
    this._lastPartnerLevel = 0;
    // 清掉上一輪大廳的舊 callbacks，避免 sendPlayerInfo 觸發 stale rebuild
    this._cbs.partnerInfoReady = undefined;
    this._cbs.partnerJoined    = undefined;
    this._cbs.gameStart        = undefined;
    this._cbs.partnerPos    = undefined;
    this._cbs.partnerAttack = undefined;
    this._cbs.partnerLeft   = undefined;
    this._cbs.roomClosed    = undefined;
    this._cbs.partnerDead   = undefined;
    this._cbs.partnerMove   = undefined;
    this._cbs.minionSync    = undefined;
    this._cbs.minionHit     = undefined;
    this._cbs.minionAttack  = undefined;
    this._cbs.bossHit       = undefined;
    this._cbs.bossSync      = undefined;
    this._cbs.rewardSync    = undefined;
    this._cbs.runEnd        = undefined;
    this._cbs.potionEffect  = undefined;
  }

  // ── Town room ─────────────────────────────────────────────

  async joinTown(): Promise<{ sessionId: string; x: number; y: number; existing: any[] }> {
    if (this.townRoom) return { sessionId: this.townSessionId, x: 0.5, y: 0.5, existing: [] };
    console.log('[Town] connecting to:', WS_URL);
    this.townClient = new Client(WS_URL);
    this.townRoom = await this.townClient.joinOrCreate<any>('town');
    this._registerTownForwarders();
    return new Promise(resolve => {
      this.townRoom!.onMessage<any>('townJoined', payload => {
        this.townSessionId = payload.sessionId;
        resolve(payload);
      });
    });
  }

  private _registerTownForwarders(): void {
    const r = this.townRoom!;
    r.onMessage('townPos',          (d: any) => this._townCbs.townPos?.(d));
    r.onMessage('townPlayerJoined', (d: any) => this._townCbs.townPlayerJoined?.(d));
    r.onMessage('townPlayerLeft',   (d: any) => this._townCbs.townPlayerLeft?.(d));
    r.onMessage('townPlayerInfo',   (d: any) => this._townCbs.townPlayerInfo?.(d));
    r.onMessage('partyInvite',      (d: any) => this._townCbs.partyInvite?.(d));
    r.onMessage('partyAccepted',    (d: any) => this._townCbs.partyAccepted?.(d));
    r.onMessage('partyDeclined',    (d: any) => this._townCbs.partyDeclined?.(d));
    r.onMessage('partyRoomCode',    (d: any) => this._townCbs.partyRoomCode?.(d));
    r.onMessage('partyCancelled',   ()       => this._townCbs.partyCancelled?.());
  }

  sendTownMove(x: number, y: number, lastDir: string): void {
    this.townRoom?.send('townMove', { x, y, lastDir });
  }

  sendTownInfo(nickname: string, level: number, skinId: number): void {
    this.townRoom?.send('townInfo', { nickname, level, skinId });
  }

  sendPartyInvite(targetSessionId: string, fromNickname: string, roomCode: string): void {
    this.townRoom?.send('partyInvite', { targetSessionId, fromNickname, roomCode });
  }

  sendPartyInviteResponse(accept: boolean, toSessionId: string): void {
    this.townRoom?.send('partyInviteResponse', { accept, toSessionId });
  }

  sendPartyRoomReady(targetSessionId: string, roomCode: string): void {
    this.townRoom?.send('partyRoomReady', { targetSessionId, roomCode });
  }

  sendPartyDisband(targetSessionId: string): void {
    this.townRoom?.send('partyDisband', { targetSessionId });
  }

  onTownPos(cb: (data: { sessionId: string; x: number; y: number; lastDir: string }) => void): void {
    this._townCbs.townPos = cb;
  }

  onTownPlayerJoined(cb: (data: { sessionId: string; x: number; y: number; lastDir: string; nickname: string; level: number; skinId: number }) => void): void {
    this._townCbs.townPlayerJoined = cb;
  }

  onTownPlayerLeft(cb: (data: { sessionId: string }) => void): void {
    this._townCbs.townPlayerLeft = cb;
  }

  onTownPlayerInfo(cb: (data: { sessionId: string; nickname: string; level: number; skinId: number }) => void): void {
    this._townCbs.townPlayerInfo = cb;
  }

  onPartyInvite(cb: (data: { fromSessionId: string; fromNickname: string; roomCode: string }) => void): void {
    this._townCbs.partyInvite = cb;
  }

  onPartyAccepted(cb: (data: { guestSessionId: string }) => void): void {
    this._townCbs.partyAccepted = cb;
  }

  onPartyDeclined(cb: (data: { reason: string; targetSessionId?: string }) => void): void {
    this._townCbs.partyDeclined = cb;
  }

  onPartyRoomCode(cb: (data: { roomCode: string }) => void): void {
    this._townCbs.partyRoomCode = cb;
  }

  onPartyCancelled(cb: () => void): void {
    this._townCbs.partyCancelled = cb;
  }

  leaveTown(): void {
    this.townRoom?.leave();
    this.townRoom    = undefined;
    this.townClient  = undefined;
    this.townSessionId = '';
    this._townCbs    = {};
  }

  get townConnected(): boolean { return !!this.townRoom; }

  disconnect(): void {
    document.removeEventListener('visibilitychange', this._visibilityHandler);
    this._disconnected      = false;
    this._reconnecting      = false;
    this._reconnectionToken = '';
    this.room?.leave();
    this.room      = undefined;
    this.client    = undefined;
    this.isHost    = false;
    this.sessionId = '';
    this.gameCode  = '';
    this.partyMode = false;
    this._hostSid  = '';
    this._cbs      = {};
  }
}

export const NetworkService = new NetworkServiceClass();
