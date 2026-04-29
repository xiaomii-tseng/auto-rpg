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
    this.generateTextures();
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.gameOver = false;

    this.physics.world.setBounds(0, 0, W, H);
    this.drawArenaFloor(W, H);

    // Player
    this.player = new Player(this, W / 2, H * 0.75);
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

    // Boss
    this.boss = new Boss(this, W / 2, H * 0.25);
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

    this.bossHpLabel.setText(`石像怪   ${this.boss.currentHp} / ${this.boss.maxHpValue}`);
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
      this.rangeCircle.lineStyle(1, 0xffffff, 0.12);
      this.rangeCircle.strokeCircle(
        this.player.x, this.player.y,
        this.weaponSystem.activeWeapon.range,
      );
    }
  }

  private drawArenaFloor(W: number, H: number): void {
    const g    = this.add.graphics().setDepth(0);
    const tile = 80;

    g.fillStyle(0x0d0d1f);
    g.fillRect(0, 0, W, H);

    for (let x = 0; x < W; x += tile) {
      for (let y = 0; y < H; y += tile) {
        const shade = ((x / tile + y / tile) % 2 === 0) ? 0x0d0d1f : 0x0f0f26;
        g.fillStyle(shade);
        g.fillRect(x, y, tile, tile);
      }
    }

    g.lineStyle(1, 0x334455, 0.22);
    for (let x = 0; x <= W; x += tile) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += tile) g.lineBetween(0, y, W, y);

    g.lineStyle(4, 0x882299, 0.65);
    g.strokeRect(2, 2, W - 4, H - 4);
  }

  private generateTextures(): void {
    if (!this.textures.exists('player')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      pg.fillStyle(0x4a9eff); pg.fillRect(4, 8, 8, 10);
      pg.fillStyle(0xffcc99); pg.fillRect(5, 1, 6, 7);
      pg.fillStyle(0x222222); pg.fillRect(6, 3, 1, 2); pg.fillRect(9, 3, 1, 2);
      pg.fillStyle(0x2244aa); pg.fillRect(4, 18, 3, 6); pg.fillRect(9, 18, 3, 6);
      pg.fillStyle(0x3388dd); pg.fillRect(1, 9, 3, 7); pg.fillRect(12, 9, 3, 7);
      pg.generateTexture('player', 16, 24);
      pg.destroy();
    }

    if (!this.textures.exists('bullet')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
      bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
      bg.generateTexture('bullet', 8, 8);
      bg.destroy();
    }

    // Boss: Stone Golem — 80×96, light source top-left
    // Uses fillGradientStyle(TL,TR,BL,BR,alpha) to fake 3-D shading on each surface
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;

    const HI   = 0xd2e2ce;   // lit highlight
    const MID  = 0x8a9e86;   // base mid-tone
    const SHAD = 0x4a5848;   // shadow face
    const DEEP = 0x222e22;   // deep recess / outline

    // Ground shadow
    b.fillStyle(0x000000, 0.35);
    b.fillEllipse(40, 94, 52, 10);

    // ── Legs ──────────────────────────────────────────
    // Left leg — front face lit
    b.fillGradientStyle(MID, SHAD, SHAD, DEEP, 1);     b.fillRect(14, 62, 18, 34);
    b.fillGradientStyle(HI,  MID,  MID,  SHAD, 1);     b.fillRect(14, 62,  7, 34); // convex highlight
    b.fillStyle(DEEP, 0.75);                             b.fillRect(14, 60, 18,  3); // leg-body join shadow
    // Right leg — more shadowed (behind body in 3/4)
    b.fillGradientStyle(SHAD, DEEP, DEEP, 0x121812, 1); b.fillRect(48, 62, 18, 34);
    b.fillGradientStyle(MID,  SHAD, SHAD, DEEP,    1);  b.fillRect(48, 62,  5, 20); // faint lit strip
    b.fillStyle(DEEP, 0.75);                             b.fillRect(48, 60, 18,  3);

    // ── Body ──────────────────────────────────────────
    b.fillGradientStyle(MID, SHAD, SHAD, DEEP, 1);      b.fillRect(12, 28, 56, 36); // base
    b.fillGradientStyle(HI,  HI,   MID,  SHAD, 1);      b.fillRect(18, 30, 30, 32); // front face lit panel
    b.fillGradientStyle(SHAD, DEEP, DEEP, 0x121812, 1);  b.fillRect(48, 28, 20, 36); // right-side dark face
    b.fillStyle(DEEP, 0.85);                              b.fillRect(12, 58, 56,  6); // underside shadow

    // Chest plate (raised detail — top lit, bottom cut-shadow)
    b.fillGradientStyle(HI, MID, MID, SHAD, 1);         b.fillRect(20, 32, 28, 18);
    b.fillStyle(DEEP, 0.65);                             b.fillRect(46, 32,  4, 18); // plate right shadow
    b.fillStyle(DEEP, 0.9);                              b.fillRect(20, 49, 28,  3); // plate bottom cutline

    // Stone cracks
    b.fillStyle(DEEP, 1);   b.fillRect(36, 30, 2, 18); b.fillRect(24, 44, 12, 2);
    b.fillStyle(HI,   0.3); b.fillRect(35, 30, 1, 18); b.fillRect(24, 43, 12, 1); // crack edge light

    // ── Shoulders ─────────────────────────────────────
    b.fillGradientStyle(HI,   MID,  MID,  SHAD, 1);    b.fillRect( 2, 22, 16, 16); // left lit
    b.fillStyle(HI, 0.75);                              b.fillRect( 2, 22, 14,  5); // top face
    b.fillStyle(HI, 0.9);                               b.fillRect( 2, 22,  5,  3); // corner specular
    b.fillGradientStyle(SHAD, DEEP, DEEP, 0x121812, 1); b.fillRect(62, 22, 16, 16); // right shadowed
    b.fillStyle(MID, 0.35);                             b.fillRect(62, 22,  4, 10); // faint rim light

    // ── Arms ──────────────────────────────────────────
    b.fillGradientStyle(MID, SHAD, SHAD, DEEP, 1);     b.fillRect( 0, 30, 14, 30); // left arm base
    b.fillGradientStyle(HI,  MID,  MID,  SHAD, 1);     b.fillRect( 0, 30,  6, 30); // convex highlight
    b.fillGradientStyle(SHAD, DEEP, DEEP, 0x121812, 1); b.fillRect(66, 30, 14, 30); // right arm
    b.fillStyle(MID, 0.28);                             b.fillRect(66, 30,  3, 20); // rim light

    // Fists
    b.fillGradientStyle(MID, SHAD, SHAD, DEEP, 1);     b.fillRect( 0, 58, 14, 10);
    b.fillStyle(HI, 0.55);                              b.fillRect( 0, 58,  6,  4);
    b.fillGradientStyle(SHAD, DEEP, DEEP, 0x121812, 1); b.fillRect(66, 58, 14, 10);

    // ── Neck ──────────────────────────────────────────
    b.fillGradientStyle(MID, SHAD, SHAD, DEEP, 1);     b.fillRect(28, 18, 24, 12);
    b.fillStyle(HI,   0.4);                             b.fillRect(28, 18, 10, 12); // front lit strip
    b.fillStyle(DEEP, 0.65);                            b.fillRect(28, 26, 24,  4); // head overhang shadow

    // ── Head ──────────────────────────────────────────
    b.fillGradientStyle(HI, MID, MID, SHAD, 1);        b.fillRect(16,  0, 48, 24); // base
    b.fillStyle(HI,   0.72);                            b.fillRect(16,  0, 48,  4); // crown (sunlit)
    b.fillGradientStyle(SHAD, DEEP, SHAD, DEEP, 1);    b.fillRect(56,  0,  8, 24); // right-side shadow
    b.fillStyle(DEEP, 0.78);                            b.fillRect(16, 20, 48,  4); // chin underside

    // Brow ridge (protruding — top lit, harsh bottom shadow)
    b.fillGradientStyle(HI, MID, MID, MID, 1);         b.fillRect(16, 13, 48,  7);
    b.fillStyle(DEEP, 0.9);                             b.fillRect(16, 19, 48,  2); // brow undercut

    // Forehead band (recessed stone ornament)
    b.fillStyle(SHAD, 0.95);                            b.fillRect(16,  6, 48,  5);
    b.fillStyle(HI,   0.5);                             b.fillRect(16,  5, 48,  1); // band top light

    // Head crack
    b.fillStyle(DEEP, 1);   b.fillRect(40, 0, 2, 10);
    b.fillStyle(HI,   0.35); b.fillRect(39, 0, 1, 10);

    // ── Eye Sockets — multi-layer for deep recession ───
    // Dark socket rim
    b.fillStyle(DEEP, 1);       b.fillRect(19, 13, 17, 9);  b.fillRect(44, 13, 17, 9);
    // AO inner wall (near-black)
    b.fillStyle(0x0d140d, 1);   b.fillRect(20, 14, 15, 7);  b.fillRect(45, 14, 15, 7);
    // Ambient base (deep red)
    b.fillStyle(0x881a00, 1);   b.fillRect(21, 14, 13, 6);  b.fillRect(46, 14, 13, 6);
    // Main eye glow (orange)
    b.fillStyle(0xff7700, 1);   b.fillRect(22, 14, 11, 5);  b.fillRect(47, 14, 11, 5);
    // Bright core (yellow-orange)
    b.fillStyle(0xffcc33, 1);   b.fillRect(23, 14,  8, 4);  b.fillRect(48, 14,  8, 4);
    // Vertical slit pupil
    b.fillStyle(0x110800, 1);   b.fillRect(25, 14,  4, 5);  b.fillRect(50, 14,  4, 5);
    // Specular glint (top-left of eye)
    b.fillStyle(0xffffff, 1);
    b.fillRect(23, 14, 3, 1); b.fillRect(23, 15, 1, 1);
    b.fillRect(48, 14, 3, 1); b.fillRect(48, 15, 1, 1);
    // Under-glow leak
    b.fillStyle(0xff4400, 0.4); b.fillRect(21, 19, 13, 3);  b.fillRect(46, 19, 13, 3);

    // ── Silhouette edge darkening (depth outline) ──────
    b.fillStyle(DEEP, 0.55); b.fillRect( 0, 0,  2, 96); // left edge
    b.fillStyle(DEEP, 0.55); b.fillRect(78, 0,  2, 96); // right edge
    b.fillStyle(DEEP, 0.45); b.fillRect( 0,94, 80,  2); // bottom edge

    b.generateTexture('boss', 80, 96);
    b.destroy();

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
