import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss, BossState } from '../objects/boss';
import { StrikeEffect } from '../objects/strike-effect';
import { VirtualJoystick } from '../ui/joystick';
import { WeaponSystem } from '../systems/weapon-system';
import { WeaponHUD } from '../ui/weapon-hud';

export class BossScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private weaponSystem!: WeaponSystem;
  private weaponHud!: WeaponHUD;
  private joystick!: VirtualJoystick;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    q: Phaser.Input.Keyboard.Key;
  };

  private bossHpGfx!: Phaser.GameObjects.Graphics;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private playerHpGfx!: Phaser.GameObjects.Graphics;
  private rangeCircle!: Phaser.GameObjects.Graphics;
  private gameOver = false;

  constructor() {
    super({ key: 'BossScene' });
  }

  preload(): void {
    const pBase = 'sprite/player/PNG/Unarmed/Without_shadow/';
    const sBase = 'sprite/slime/PNG/Slime1/Without_shadow/';
    const cfg = { frameWidth: 64, frameHeight: 64 };
    if (!this.textures.exists('player_idle')) this.load.spritesheet('player_idle', pBase + 'Unarmed_Idle_without_shadow.png', cfg);
    if (!this.textures.exists('player_walk')) this.load.spritesheet('player_walk', pBase + 'Unarmed_Walk_without_shadow.png', cfg);
    if (!this.textures.exists('player_hurt')) this.load.spritesheet('player_hurt', pBase + 'Unarmed_Hurt_without_shadow.png', cfg);
    if (!this.textures.exists('slime_idle'))   this.load.spritesheet('slime_idle',   sBase + 'Slime1_Idle_without_shadow.png',   cfg);
    if (!this.textures.exists('slime_walk'))   this.load.spritesheet('slime_walk',   sBase + 'Slime1_Walk_without_shadow.png',   cfg);
    if (!this.textures.exists('slime_attack')) this.load.spritesheet('slime_attack', sBase + 'Slime1_Attack_without_shadow.png', cfg);
    if (!this.textures.exists('slime_hurt'))   this.load.spritesheet('slime_hurt',   sBase + 'Slime1_Hurt_without_shadow.png',   cfg);
    if (!this.textures.exists('slime_death'))  this.load.spritesheet('slime_death',  sBase + 'Slime1_Death_without_shadow.png',  cfg);
    this.generateTextures();
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.gameOver = false;

    const WW = Math.round(W * 1.5);
    const WH = Math.round(H * 1.5);
    // Camera shows full world; physics bounds inset so boss/player sprites stay inside the border
    this.physics.world.setBounds(36, 72, WW - 72, WH - 144);
    this.cameras.main.setBounds(0, 0, WW, WH);
    this.createAllAnims();
    this.drawArenaFloor(WW, WH);

    // Player — spawn at world center-bottom area
    this.player = new Player(this, W * 0.75, H * 1.1);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.player.onHpChanged = () => this.refreshPlayerBar();
    this.player.onDead = () => this.handlePlayerDead();

    // Boss group — passed to WeaponSystem so getNearestEnemy() can target the boss
    const bossGroup = this.physics.add.group();

    // WeaponSystem uses bossGroup as its enemies group:
    // - getNearestEnemy() will find the boss and trigger auto-attack
    // - internal collision callbacks call e.takeDamage() via duck typing (Boss has it)
    this.weaponSystem = new WeaponSystem(this, this.player, bossGroup);
    this.weaponHud = new WeaponHUD(this);
    this.weaponHud.refresh(this.weaponSystem.slots, this.weaponSystem.activeSlot);
    this.weaponHud.flashName(this.weaponSystem.activeWeapon);
    this.weaponSystem.onWeaponChanged = (w, slot) => {
      this.weaponHud.refresh(this.weaponSystem.slots, slot);
      this.weaponHud.flashName(w);
    };

    // Boss — spawn at world center-upper area
    this.boss = new Boss(this, W * 0.75, H * 0.4);
    this.boss.getTargetPos = () => [this.player.x, this.player.y];
    this.boss.onHpChanged = () => this.refreshBossBar();
    this.boss.onDead = () => this.handleBossDefeated();
    this.boss.onAoeExplode = (x, y) => {
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
      if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(30);
    };

    // Thunder Hammer: WeaponSystem fires against bossGroup normally,
    // but StrikeEffect also needs a direct callback to reach the boss
    this.weaponSystem.onStrikeFired = (x, y, dmg) => {
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.boss);
      if (dSq <= StrikeEffect.RADIUS ** 2 && this.boss.active) this.boss.takeDamage(dmg);
    };

    // Add boss to group AFTER WeaponSystem is set up (group is dynamic)
    bossGroup.add(this.boss, false);

    // Boss dash overlaps player
    const playerGroup = this.physics.add.group();
    playerGroup.add(this.player, false);
    this.physics.add.overlap(bossGroup, playerGroup, () => {
      if (this.boss.currentState === BossState.DASHING) {
        this.player.takeDamage(25);
      }
    });

    // HUD — Boss HP bar (top)
    this.bossHpGfx = this.add.graphics().setScrollFactor(0).setDepth(200);
    this.bossHpLabel = this.add.text(W / 2, 8, '', {
      fontSize: '12px', color: '#ffcccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);

    // HUD — Player HP bar (bottom-left)
    this.playerHpGfx = this.add.graphics().setScrollFactor(0).setDepth(200);
    this.add.text(16, H - 52, '玩家 HP', {
      fontSize: '11px', color: '#aaffaa', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(201);

    this.refreshBossBar();
    this.refreshPlayerBar();

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

    // Mobile: tap inactive slot to switch
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.x <= W * 0.5) return;
      const tapped = this.weaponHud.hitTestSlot(pointer.x, pointer.y);
      if (tapped !== null && tapped !== this.weaponSystem.activeSlot) {
        this.weaponSystem.switch();
      }
    });

    this.joystick = new VirtualJoystick(this);

    this.add.text(12, 12, 'WASD / Joystick: 移動\n停下自動攻擊\nQ: 換武器', {
      fontSize: '12px', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200);

    // Short delay before boss starts attacking
    this.time.delayedCall(1000, () => this.boss.start());
  }

  override update(): void {
    if (this.gameOver) return;

    if (Phaser.Input.Keyboard.JustDown(this.keys.q)) this.weaponSystem.switch();

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

  // ── HUD refresh ───────────────────────────────────────

  private refreshBossBar(): void {
    const W  = this.scale.width;
    const bw = W * 0.65;
    const bx = (W - bw) / 2;
    const by = 28;
    const bh = 18;

    this.bossHpGfx.clear();
    this.bossHpGfx.fillStyle(0x330000, 0.85);
    this.bossHpGfx.fillRect(bx - 4, by - 18, bw + 8, bh + 22);

    const pct   = this.boss.currentHp / this.boss.maxHpValue;
    const color = pct > 0.5 ? 0xcc2200 : pct > 0.25 ? 0xff4400 : 0xff0000;
    this.bossHpGfx.fillStyle(color);
    this.bossHpGfx.fillRect(bx, by, bw * pct, bh);
    this.bossHpGfx.lineStyle(2, 0xff4400, 0.8);
    this.bossHpGfx.strokeRect(bx, by, bw, bh);

    this.bossHpLabel.setText(`綠史萊姆   ${this.boss.currentHp} / ${this.boss.maxHpValue}`);
    this.bossHpLabel.setPosition(W / 2, by - 14);
  }

  private refreshPlayerBar(): void {
    const H  = this.scale.height;
    const bw = 180;
    const bx = 16;
    const by = H - 38;
    const bh = 14;

    this.playerHpGfx.clear();
    this.playerHpGfx.fillStyle(0x002200, 0.8);
    this.playerHpGfx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);

    const pct   = this.player.currentHp / this.player.maxHpValue;
    const color = pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2222;
    this.playerHpGfx.fillStyle(color);
    this.playerHpGfx.fillRect(bx, by, bw * pct, bh);
    this.playerHpGfx.lineStyle(2, 0x44ff88, 0.6);
    this.playerHpGfx.strokeRect(bx, by, bw, bh);
  }

  // ── Game-end handlers ─────────────────────────────────

  private handleBossDefeated(): void {
    this.gameOver = true;
    this.weaponSystem.stopAttacking();
    this.showEndScreen(true);
  }

  private handlePlayerDead(): void {
    this.gameOver = true;
    this.weaponSystem.stopAttacking();
    this.player.setActive(false).setVisible(false);
    this.showEndScreen(false);
  }

  private showEndScreen(victory: boolean): void {
    const W = this.scale.width;
    const H = this.scale.height;

    if (victory) {
      // Burst particles
      for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const p = this.add.graphics().setDepth(250).setPosition(W / 2, H / 2);
        p.fillStyle(0xffdd00, 1);
        p.fillCircle(0, 0, 7);
        this.tweens.add({
          targets: p,
          x: W / 2 + Math.cos(angle) * 200,
          y: H / 2 + Math.sin(angle) * 200,
          alpha: 0,
          duration: 950,
          ease: 'Sine.easeOut',
          onComplete: () => p.destroy(),
        });
      }
    }

    // Dark overlay
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(248);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);

    // Title text
    const titleText = victory ? '挑戰成功！' : '挑戰失敗';
    const titleColor = victory ? '#ffdd00' : '#ff4444';
    this.add.text(W / 2, H / 2 - 64, titleText, {
      fontSize: '44px', color: titleColor, stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250);

    // Button
    const btnLabel = victory ? '返回主選單' : '再次挑戰';
    const btnBg    = victory ? '#223322' : '#332222';
    const btn = this.add.text(W / 2, H / 2 + 24, btnLabel, {
      fontSize: '22px', color: '#ffffff',
      backgroundColor: btnBg,
      padding: { x: 28, y: 14 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250)
      .setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setStyle({ color: victory ? '#ffdd00' : '#ff8888' }));
    btn.on('pointerout',  () => btn.setStyle({ color: '#ffffff' }));
    btn.on('pointerdown', () => {
      if (victory) {
        this.scene.start('GameScene');
      } else {
        this.scene.restart();
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────

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

  private createAllAnims(): void {
    if (!this.anims.exists('player_idle')) {
      this.anims.create({ key: 'player_idle', frames: this.anims.generateFrameNumbers('player_idle', { start: 0, end: 11 }), frameRate: 8,  repeat: -1 });
      this.anims.create({ key: 'player_walk', frames: this.anims.generateFrameNumbers('player_walk', { start: 0, end: 5  }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: 'player_hurt', frames: this.anims.generateFrameNumbers('player_hurt', { start: 0, end: 4  }), frameRate: 14, repeat: 0  });
    }
    if (!this.anims.exists('slime_idle')) {
      this.anims.create({ key: 'slime_idle',   frames: this.anims.generateFrameNumbers('slime_idle',   { start: 0, end: 5  }), frameRate: 8,  repeat: -1 });
      this.anims.create({ key: 'slime_walk',   frames: this.anims.generateFrameNumbers('slime_walk',   { start: 0, end: 7  }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: 'slime_attack', frames: this.anims.generateFrameNumbers('slime_attack', { start: 0, end: 9  }), frameRate: 10, repeat: -1 });
      this.anims.create({ key: 'slime_hurt',   frames: this.anims.generateFrameNumbers('slime_hurt',   { start: 0, end: 4  }), frameRate: 14, repeat: 0  });
      this.anims.create({ key: 'slime_death',  frames: this.anims.generateFrameNumbers('slime_death',  { start: 0, end: 9  }), frameRate: 8,  repeat: 0  });
    }
  }

  private drawArenaFloor(W: number, H: number): void {
    // Grass tile base
    this.add.tileSprite(W / 2, H / 2, W, H, 'grass').setDepth(0);

    // Pixel-art arena boundary — stone border (4-pixel thick, 2 shades for depth)
    const border = this.add.graphics().setDepth(1);
    border.fillStyle(0x2e7018, 0.65);
    border.fillRect(0, 0, W, 6);
    border.fillRect(0, H - 6, W, 6);
    border.fillRect(0, 0, 6, H);
    border.fillRect(W - 6, 0, 6, H);
    border.fillStyle(0x1a5010, 0.8);
    border.fillRect(0, 0, W, 3);
    border.fillRect(0, 0, 3, H);
    border.fillStyle(0x70bc4c, 0.3);
    border.fillRect(3, H - 3, W - 3, 3);
    border.fillRect(W - 3, 3, 3, H - 3);
  }

  private generateTextures(): void {
    if (!this.textures.exists('grass')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const gg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      gg.fillStyle(0x5aa838, 1); gg.fillRect(0, 0, 64, 64);
      gg.fillStyle(0x70bc4c, 0.30); gg.fillRect(4, 6, 18, 10); gg.fillRect(38, 36, 16, 12); gg.fillRect(22, 50, 20, 14);
      gg.fillStyle(0x429228, 0.25); gg.fillRect(18, 28, 14, 10); gg.fillRect(46, 8, 14, 10); gg.fillRect(6, 44, 14, 14);
      gg.fillStyle(0x2e7018, 0.75);
      for (const [dx, dy] of [[4,4],[16,10],[28,4],[44,16],[56,28],[6,36],[20,44],[36,50],[52,42],[10,54],[40,24],[60,48],[30,32],[8,20],[50,58],[24,18]]) {
        gg.fillRect(dx, dy, 2, 2);
      }
      gg.fillStyle(0x88d060, 0.50);
      for (const [gx, gy] of [[10,2],[26,18],[48,2],[2,48],[58,54],[34,40],[18,60]]) { gg.fillRect(gx, gy, 1, 1); }
      gg.generateTexture('grass', 64, 64);
      gg.destroy();
    }

    if (!this.textures.exists('bullet')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
      bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
      bg.generateTexture('bullet', 8, 8);
      bg.destroy();
    }

    // Pixel particle textures — white squares tinted at emit time
    if (!this.textures.exists('pxl')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ppg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      ppg.fillStyle(0xffffff, 1); ppg.fillRect(0, 0, 4, 4);
      ppg.generateTexture('pxl', 4, 4);
      ppg.destroy();
    }

    if (!this.textures.exists('pxl2')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const spg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      spg.fillStyle(0xffffff, 1); spg.fillRect(0, 0, 2, 2);
      spg.generateTexture('pxl2', 2, 2);
      spg.destroy();
    }
  }
}
