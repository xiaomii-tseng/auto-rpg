// Shared types used by both server and client

export interface MapSegment { angleDelta: number; distRatio: number }  // distRatio 0-1 → P(600)..P(800)
export interface MapParams   { angle0: number; segments: MapSegment[]; bossArenaShape: number }

export interface PlayerState {
  sessionId: string;
  nickname:  string;
  x:         number;
  y:         number;
  hp:        number;
  maxHp:     number;
  lastDir:   'down' | 'left' | 'right' | 'up';
  isReady:   boolean;
}

export interface MinionState {
  id:        string;
  x:         number;
  y:         number;
  hp:        number;
  maxHp:     number;
  isDead:    boolean;
  isDashing?: boolean;
}

export interface GameRoomState {
  phase:         'lobby' | 'playing' | 'ended';
  seed:          number;
  questStar:     number;
  bossMonsterId: string;
  hostId:        string;
  players:       Record<string, PlayerState>;
}

// Messages: client → server
export interface MsgReady        { nickname: string; level?: number; questId?: string; questStar?: number; bossMonsterId?: string }
export interface MsgMove         { x: number; y: number; lastDir: string; hp: number; maxHp: number }
export interface MsgHpUpdate     { hp: number; maxHp: number }
export interface MsgMinionSync   { minions: MinionState[] }  // host only
export interface MsgMinionHit    { minionId: string; damage: number }
export interface MsgBossHit      { damage: number }
export interface MsgBossSync     {
  state:  string;           // 'POS' | BossState value | 'PHASE2' | 'LAVA_PHASE2_PILLARS'
  x:      number;           // boss x (DPR-normalised)
  y:      number;           // boss y (DPR-normalised)
  atkX?:  number;           // attack target x (DPR-normalised)
  atkY?:  number;           // attack target y (DPR-normalised)
  angle?: number;           // for angular skills
  pts?:   { x: number; y: number }[];  // multi-point skills (DPR-normalised)
}
export interface MsgRewardSync   { isEquipReward: boolean; gold: number; star: number }
export interface MsgRunEnd       { won: boolean }
