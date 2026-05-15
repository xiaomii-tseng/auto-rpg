import { Schema, MapSchema, type } from '@colyseus/schema';

export class TownPlayerState extends Schema {
  @type('string')  sessionId: string = '';
  @type('string')  nickname:  string = '';
  @type('float32') x:         number = 0.5;  // normalized 0-1
  @type('float32') y:         number = 0.5;  // normalized 0-1
  @type('string')  lastDir:   string = 'down';
  @type('uint8')   skinId:    number = 0;
  @type('uint16')  level:     number = 1;
}

export class TownRoomState extends Schema {
  @type({ map: TownPlayerState }) players = new MapSchema<TownPlayerState>();
}
