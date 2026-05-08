import { Schema, MapSchema, type } from '@colyseus/schema';

export class PlayerState extends Schema {
  @type('string')  sessionId: string  = '';
  @type('string')  nickname:  string  = '';
  @type('float32') x:         number  = 0;
  @type('float32') y:         number  = 0;
  @type('int16')   hp:        number  = 100;
  @type('int16')   maxHp:     number  = 100;
  @type('string')  lastDir:   string  = 'down';
  @type('uint16')  level:     number  = 1;
  @type('boolean') isReady:   boolean = false;
}

export class GameRoomState extends Schema {
  @type('string') phase:         string = 'lobby';
  @type('uint32') seed:          number = 0;
  @type('uint8')  questStar:     number = 1;
  @type('string') bossMonsterId: string = '';
  @type('string') hostId:        string = '';
  @type('string') questId:       string = '';
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}
