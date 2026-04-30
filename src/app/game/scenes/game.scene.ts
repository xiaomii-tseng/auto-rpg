import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Dummy } from '../objects/dummy';
import { VirtualJoystick } from '../ui/joystick';
import { WeaponSystem } from '../systems/weapon-system';
import { WeaponHUD } from '../ui/weapon-hud';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private enemies!: Phaser.Physics.Arcade.Group;
  private joystick!: VirtualJoystick;
  private weaponSystem!: WeaponSystem;
  private weaponHud!: WeaponHUD;
  private rangeCircle!: Phaser.GameObjects.Graphics;
  private worldW = 0;
  private worldH = 0;
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
    const pBase = 'sprite/player/PNG/Unarmed/Without_shadow/';
    const cfg = { frameWidth: 64, frameHeight: 64 };
    this.load.spritesheet('player_idle', pBase + 'Unarmed_Idle_without_shadow.png', cfg);
    this.load.spritesheet('player_walk', pBase + 'Unarmed_Walk_without_shadow.png', cfg);
    this.load.spritesheet('player_hurt', pBase + 'Unarmed_Hurt_without_shadow.png', cfg);
    this.generateTextures();
  }

  create(): void {
    this.worldW = Math.round(this.scale.width  * 1.5);
    this.worldH = Math.round(this.scale.height * 1.5);

    // Camera shows full world; physics bounds inset so sprite visuals stay inside the border
    this.physics.world.setBounds(32, 40, this.worldW - 64, this.worldH - 80);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.createPlayerAnims();
    this.drawGrassFloor();

    this.enemies = this.physics.add.group({ classType: Dummy, runChildUpdate: false });

    // Spread dummies proportionally across the world
    const cols = 4, rows = 3;
    const padX = this.worldW / (cols + 1);
    const padY = this.worldH / (rows + 1);
    for (let r = 1; r <= rows; r++) {
      for (let c = 1; c <= cols; c++) {
        const x = padX * c + Phaser.Math.Between(-30, 30);
        const y = padY * r + Phaser.Math.Between(-30, 30);
        this.enemies.add(new Dummy(this, x, y), true);
      }
    }

    this.player = new Player(this, this.worldW / 2, this.worldH / 2);
    this.cameras.main.startFollow(this.player, true, 0.1, 0.1);

    this.weaponSystem = new WeaponSystem(this, this.player, this.enemies);

    this.weaponHud = new WeaponHUD(this);
    this.weaponHud.refresh(this.weaponSystem.slots, this.weaponSystem.activeSlot);
    this.weaponHud.flashName(this.weaponSystem.activeWeapon);

    this.weaponSystem.onWeaponChanged = (weapon, slot) => {
      this.weaponHud.refresh(this.weaponSystem.slots, slot);
      this.weaponHud.flashName(weapon);
    };

    this.rangeCircle = this.add.graphics().setDepth(5);

    const kb = this.input.keyboard!;
    this.keys = {
      ...kb.createCursorKeys(),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
    };

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
      this.rangeCircle.lineStyle(1, 0xffffff, 0.18);
      this.rangeCircle.strokeCircle(
        this.player.x, this.player.y,
        this.weaponSystem.effectiveRange,
      );
    }
  }

  private drawGrassFloor(): void {
    // TileSprite fills the entire world with the grass tile
    this.add.tileSprite(
      this.worldW / 2, this.worldH / 2,
      this.worldW, this.worldH,
      'grass',
    ).setDepth(0);

    // Subtle world boundary
    const border = this.add.graphics().setDepth(1);
    border.lineStyle(4, 0x2e7018, 0.7);
    border.strokeRect(2, 2, this.worldW - 4, this.worldH - 4);
  }

  private generateTextures(): void {
    // Grass tile — 64×64, base #A8DADC, 2×2 pixel grass tufts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    gg.fillStyle(0x5aa838, 1);
    gg.fillRect(0, 0, 64, 64);
    // Subtle lighter/darker patches for organic feel
    gg.fillStyle(0x70bc4c, 0.30); gg.fillRect(4, 6, 18, 10); gg.fillRect(38, 36, 16, 12); gg.fillRect(22, 50, 20, 14);
    gg.fillStyle(0x429228, 0.25); gg.fillRect(18, 28, 14, 10); gg.fillRect(46, 8, 14, 10); gg.fillRect(6, 44, 14, 14);
    // 2×2 grass dot tufts — darker accent
    gg.fillStyle(0x2e7018, 0.75);
    for (const [dx, dy] of [
      [4,4],[16,10],[28,4],[44,16],[56,28],[6,36],[20,44],[36,50],
      [52,42],[10,54],[40,24],[60,48],[30,32],[8,20],[50,58],[24,18],
    ]) { gg.fillRect(dx, dy, 2, 2); }
    // Single-pixel light glints
    gg.fillStyle(0x88d060, 0.50);
    for (const [gx, gy] of [[10,2],[26,18],[48,2],[2,48],[58,54],[34,40],[18,60]]) {
      gg.fillRect(gx, gy, 1, 1);
    }
    gg.generateTexture('grass', 64, 64);
    gg.destroy();

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

    // Bullet — white base; tint applied per weapon
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
    bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
    bg.generateTexture('bullet', 8, 8);
    bg.destroy();
  }

  private createPlayerAnims(): void {
    if (this.anims.exists('player_idle')) return;
    this.anims.create({ key: 'player_idle', frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 11 }), frameRate: 8,  repeat: -1 });
    this.anims.create({ key: 'player_walk', frames: this.anims.generateFrameNumbers('player_walk', { start: 0, end: 5  }), frameRate: 10, repeat: -1 });
    this.anims.create({ key: 'player_hurt', frames: this.anims.generateFrameNumbers('player_hurt', { start: 0, end: 4  }), frameRate: 14, repeat: 0  });
  }

  private addHUD(): void {
    const style = { fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 3 };
    this.add.text(12, 12, 'WASD / Joystick: 移動\n停下自動攻擊\nQ: 換武器', style)
      .setScrollFactor(0).setDepth(200);

    this.add.text(this.scale.width - 12, 12, 'AUTO RPG', {
      fontSize: '18px', color: '#4a9e9e', stroke: '#000', strokeThickness: 4,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(200);

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
