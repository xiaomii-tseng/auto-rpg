import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Dummy } from '../objects/dummy';
import { VirtualJoystick } from '../ui/joystick';
import { WeaponSystem } from '../systems/weapon-system';
import { WeaponHUD } from '../ui/weapon-hud';

const WORLD_W = 1600;
const WORLD_H = 1200;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private joystick!: VirtualJoystick;
  private weaponSystem!: WeaponSystem;
  private weaponHud!: WeaponHUD;
  private rangeCircle!: Phaser.GameObjects.Graphics;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
  };

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

    this.enemies = this.physics.add.group({ classType: Dummy, runChildUpdate: false });

    const dummyPositions = [
      [400, 300], [800, 250], [1200, 400],
      [300, 700], [700, 600], [1100, 700],
      [500, 1000], [1000, 950],
    ];
    for (const [x, y] of dummyPositions) {
      this.enemies.add(new Dummy(this, x, y), true);
    }

    this.player = new Player(this, WORLD_W / 2, WORLD_H / 2);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    // Weapon system owns all bullet pools and collision setup
    this.weaponSystem = new WeaponSystem(this, this.player, this.enemies);

    // HUD
    this.weaponHud = new WeaponHUD(this);
    this.weaponHud.refresh(this.weaponSystem.slots, this.weaponSystem.activeSlot);
    this.weaponHud.flashName(this.weaponSystem.activeWeapon);

    this.weaponSystem.onWeaponChanged = (weapon, slot) => {
      this.weaponHud.refresh(this.weaponSystem.slots, slot);
      this.weaponHud.flashName(weapon);
    };

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
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };

    // Mobile: tap inactive weapon slot to switch
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x <= this.scale.width * 0.5) return;
      const tapped = this.weaponHud.hitTestSlot(pointer.x, pointer.y);
      if (tapped !== null && tapped !== this.weaponSystem.activeSlot) {
        this.weaponSystem.switch();
      }
    });

    this.joystick = new VirtualJoystick(this);

    this.addHUD();
  }

  override update(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) {
      this.weaponSystem.switch();
    }

    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    if (this.keys.left.isDown || this.keys.a.isDown) vx = -1;
    else if (this.keys.right.isDown || this.keys.d.isDown) vx = 1;

    if (this.keys.up.isDown || this.keys.w.isDown) vy = -1;
    else if (this.keys.down.isDown || this.keys.s.isDown) vy = 1;

    this.player.move(vx, vy);

    if (!this.player.moving) {
      this.weaponSystem.startAttacking();
    } else {
      this.weaponSystem.stopAttacking();
    }

    this.drawRangeCircle();
  }

  private drawRangeCircle(): void {
    this.rangeCircle.clear();
    if (!this.player.moving) {
      this.rangeCircle.lineStyle(1, 0xffffff, 0.12);
      this.rangeCircle.strokeCircle(
        this.player.x, this.player.y,
        this.weaponSystem.activeWeapon.range,
      );
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
    g.lineStyle(3, 0x4444aa, 0.8);
    g.strokeRect(0, 0, WORLD_W, WORLD_H);
  }

  private generateTextures(): void {
    // Player (16x24)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    pg.fillStyle(0x4a9eff); pg.fillRect(4, 8, 8, 10);
    pg.fillStyle(0xffcc99); pg.fillRect(5, 1, 6, 7);
    pg.fillStyle(0x222222); pg.fillRect(6, 3, 1, 2); pg.fillRect(9, 3, 1, 2);
    pg.fillStyle(0x2244aa); pg.fillRect(4, 18, 3, 6); pg.fillRect(9, 18, 3, 6);
    pg.fillStyle(0x3388dd); pg.fillRect(1, 9, 3, 7); pg.fillRect(12, 9, 3, 7);
    pg.generateTexture('player', 16, 24);
    pg.destroy();

    // Dummy (20x32)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    dg.fillStyle(0x8B5E3C); dg.fillRect(8, 14, 4, 18);
    dg.fillStyle(0xA0522D); dg.fillRect(2, 10, 16, 5);
    dg.fillStyle(0xA0522D); dg.fillRect(6, 1, 8, 9);
    dg.fillStyle(0x6B4226); dg.fillRect(4, 28, 12, 4);
    dg.fillStyle(0x5C3317); dg.fillRect(8, 6, 4, 2);
    dg.generateTexture('dummy', 20, 32);
    dg.destroy();

    // Bullet — white base; tint applied per weapon via configure()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
    bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
    bg.generateTexture('bullet', 8, 8);
    bg.destroy();
  }

  private addHUD(): void {
    const style = { fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 };
    this.add.text(12, 12, 'WASD / Joystick: Move\nStop to Auto-Attack\nQ / Tap Slot: Switch Weapon', style)
      .setScrollFactor(0)
      .setDepth(200);

    this.add.text(this.scale.width - 12, 12, 'AUTO RPG', {
      fontSize: '18px', color: '#88aaff', stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200);

    // Boss challenge button (bottom-right, above weapon HUD)
    const btn = this.add.text(this.scale.width - 12, this.scale.height - 90, '⚔ 挑戰 Boss', {
      fontSize: '16px', color: '#ffdd88',
      backgroundColor: '#442200',
      padding: { x: 14, y: 8 },
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(200)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerout',  () => btn.setStyle({ color: '#ffdd88' }));
    btn.on('pointerdown', () => this.scene.start('BossScene'));
  }
}
