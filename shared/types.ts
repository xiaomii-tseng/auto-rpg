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
export interface MsgMinionHit    { minionId: string; damage: number; forceKill?: boolean }
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
export interface MsgMinionAttack {
  minionId: string;
  type:     'shoot' | 'triple' | 'explode' | 'spike' | 'blade_wave' | 'triple_wave' | 'arc_slash' | 'leap_slam' | 'spin_slash' | 'ground_crack' | 'whirl_slash' | 'blood_needle' | 'meteor' | 'blood_burst' | 'triple_needle' | 'lightning_ring' | 'orbit_burst' | 'blood_channel';
  mx:       number;  // minion x (DPR-normalised)
  my:       number;  // minion y (DPR-normalised)
  tx:       number;  // target x (DPR-normalised)
  ty:       number;  // target y (DPR-normalised)
  atk:      number;  // raw atk value for damage calculation
  isElite?: boolean;
}
