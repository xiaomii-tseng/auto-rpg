import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Dummy } from '../objects/dummy';
import { Bullet } from '../objects/bullet';
import { VirtualJoystick } from '../ui/joystick';

const WORLD_W = 1600;
const WORLD_H = 1200;
const BULLET_POOL = 30;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  private joystick!: VirtualJoystick;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
  };
  private rangeCircle!: Phaser.GameObjects.Graphics;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    this.generateTextures();
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.drawTileFloor();

    // Groups
    this.enemies = this.physics.add.group({ classType: Dummy, runChildUpdate: false });
    this.bullets = this.physics.add.group({ classType: Bullet, runChildUpdate: false, maxSize: BULLET_POOL });

    // Spawn dummies
    const dummyPositions = [
      [400, 300], [800, 250], [1200, 400],
      [300, 700], [700, 600], [1100, 700],
      [500, 1000], [1000, 950],
    ];
    for (const [x, y] of dummyPositions) {
      const d = new Dummy(this, x, y);
      this.enemies.add(d, true);
    }

    // Player
    this.player = new Player(this, WORLD_W / 2, WORLD_H / 2);
    this.player.onFire = (fx, fy, tx, ty) => this.fireBullet(fx, fy, tx, ty);

    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Bullet ↔ enemy collision
    this.physics.add.overlap(
      this.bullets,
      this.enemies,
      (bullet, enemy) => {
        const b = bullet as Bullet;
        const e = enemy as Dummy;
        if (!b.active || !e.active) return;
        b.deactivate();
        e.takeDamage(b.dmg);
      },
      undefined,
      this
    );

    // Attack range indicator
    this.rangeCircle = this.add.graphics().setDepth(5);

    // Keyboard
    const kb = this.input.keyboard!;
    this.keys = {
      ...kb.createCursorKeys(),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Virtual joystick (mobile)
    this.joystick = new VirtualJoystick(this);

    this.addHUD();
  }

  override update(): void {
    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    // WASD / arrow keys override joystick
    if (this.keys.left.isDown || this.keys.a.isDown) vx = -1;
    else if (this.keys.right.isDown || this.keys.d.isDown) vx = 1;

    if (this.keys.up.isDown || this.keys.w.isDown) vy = -1;
    else if (this.keys.down.isDown || this.keys.s.isDown) vy = 1;

    this.player.move(vx, vy);

    if (!this.player.moving) {
      this.player.startAttacking(this.enemies);
    } else {
      this.player.stopAttacking();
    }

    this.drawRangeCircle();
  }

  private fireBullet(fromX: number, fromY: number, toX: number, toY: number): void {
    // Reuse from pool
    let bullet = this.bullets.getFirstDead(false) as Bullet | null;
    if (!bullet) {
      if (this.bullets.getLength() < BULLET_POOL) {
        bullet = new Bullet(this, fromX, fromY);
        this.bullets.add(bullet, true);
      } else {
        return;
      }
    }
    bullet.fire(fromX, fromY, toX, toY);
  }

  private drawRangeCircle(): void {
    this.rangeCircle.clear();
    if (!this.player.moving) {
      this.rangeCircle.lineStyle(1, 0xffffff, 0.12);
      this.rangeCircle.strokeCircle(this.player.x, this.player.y, this.player.range);
    }
  }

  private drawTileFloor(): void {
    const g = this.add.graphics().setDepth(0);
    const tileSize = 64;
    for (let x = 0; x < WORLD_W; x += tileSize) {
      for (let y = 0; y < WORLD_H; y += tileSize) {
        const shade = ((x / tileSize + y / tileSize) % 2 === 0) ? 0x16213e : 0x1a1a2e;
        g.fillStyle(shade);
        g.fillRect(x, y, tileSize, tileSize);
      }
    }
    // World border
    g.lineStyle(3, 0x4444aa, 0.8);
    g.strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  private generateTextures(): void {
    // Player: pixel character (16x24)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    // Body
    pg.fillStyle(0x4a9eff); pg.fillRect(4, 8, 8, 10);
    // Head
    pg.fillStyle(0xffcc99); pg.fillRect(5, 1, 6, 7);
    // Eyes
    pg.fillStyle(0x222222); pg.fillRect(6, 3, 1, 2); pg.fillRect(9, 3, 1, 2);
    // Legs
    pg.fillStyle(0x2244aa); pg.fillRect(4, 18, 3, 6); pg.fillRect(9, 18, 3, 6);
    // Arms
    pg.fillStyle(0x3388dd); pg.fillRect(1, 9, 3, 7); pg.fillRect(12, 9, 3, 7);
    pg.generateTexture('player', 16, 24);
    pg.destroy();

    // Dummy: wooden training dummy (20x32)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    // Post
    dg.fillStyle(0x8B5E3C); dg.fillRect(8, 14, 4, 18);
    // Body cross
    dg.fillStyle(0xA0522D); dg.fillRect(2, 10, 16, 5);
    // Head (round stump)
    dg.fillStyle(0xA0522D); dg.fillRect(6, 1, 8, 9);
    // Base
    dg.fillStyle(0x6B4226); dg.fillRect(4, 28, 12, 4);
    // Details
    dg.fillStyle(0x5C3317); dg.fillRect(8, 6, 4, 2);
    dg.generateTexture('dummy', 20, 32);
    dg.destroy();

    // Bullet: small glowing orb (8x8)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    bg.fillStyle(0xffff44, 1); bg.fillCircle(4, 4, 4);
    bg.fillStyle(0xffffff, 0.8); bg.fillCircle(4, 4, 2);
    bg.generateTexture('bullet', 8, 8);
    bg.destroy();
  }

  private addHUD(): void {
    const style = { fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 };
    this.add.text(12, 12, 'WASD / Joystick: Move\nStop to Auto-Attack', style)
      .setScrollFactor(0)
      .setDepth(200);

    this.add.text(this.scale.width - 12, 12, 'AUTO RPG', {
      fontSize: '18px', color: '#88aaff', stroke: '#000', strokeThickness: 4,
    })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(200);
  }
}
