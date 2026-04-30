import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss } from '../objects/boss';
import { SlashEffect } from '../objects/slash-effect';
import { VirtualJoystick } from '../ui/joystick';

const MELEE_RANGE = 95;

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private slashEffect!: SlashEffect;
  private joystick!: VirtualJoystick;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private bossHpGfx!: Phaser.GameObjects.Graphics;
  private bossHpLabel!: Phaser.GameObjects.Text;
  private gameOver = false;
  private worldW = 0;
  private worldH = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    const pBase = 'sprite/hero/PNG/Swordsman_lvl1/Without_shadow/';
    const sBase = 'sprite/slime/PNG/Slime1/With_shadow/';
    const cfg = { frameWidth: 64, frameHeight: 64 };
    const ws = 'sprite/hero/PNG/Swordsman_lvl1/With_shadow/';
    if (!this.textures.exists('player_idle_shadow'))       this.load.spritesheet('player_idle_shadow',       ws + 'Swordsman_lvl1_Idle_with_shadow.png',       cfg);
    if (!this.textures.exists('player_run_shadow'))        this.load.spritesheet('player_run_shadow',        ws + 'Swordsman_lvl1_Run_with_shadow.png',        cfg);
    if (!this.textures.exists('player_attack_shadow'))     this.load.spritesheet('player_attack_shadow',     ws + 'Swordsman_lvl1_attack_with_shadow.png',     cfg);
    if (!this.textures.exists('player_run_attack_shadow')) this.load.spritesheet('player_run_attack_shadow', ws + 'Swordsman_lvl1_Run_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('player_hurt'))              this.load.spritesheet('player_hurt',              pBase + 'Swordsman_lvl1_Hurt_without_shadow.png', cfg);
    if (!this.textures.exists('slime_idle'))   this.load.spritesheet('slime_idle',   sBase + 'Slime1_Idle_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_walk'))   this.load.spritesheet('slime_walk',   sBase + 'Slime1_Walk_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_run'))    this.load.spritesheet('slime_run',    sBase + 'Slime1_Run_with_shadow.png',    cfg);
    if (!this.textures.exists('slime_attack')) this.load.spritesheet('slime_attack', sBase + 'Slime1_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime_hurt'))   this.load.spritesheet('slime_hurt',   sBase + 'Slime1_Hurt_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_death'))  this.load.spritesheet('slime_death',  sBase + 'Slime1_Death_with_shadow.png',  cfg);
    this.generateTextures();
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    this.worldW = Math.round(W * 1.5);
    this.worldH = Math.round(H * 1.5);
    this.gameOver = false;

    this.physics.world.setBounds(32, 40, this.worldW - 64, this.worldH - 80);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.createPlayerAnims();
    this.createSlimeAnims();
    this.drawArenaFloor();

    this.player = new Player(this, this.worldW * 0.5, this.worldH * 0.75);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.player.onDead = () => this.handlePlayerDead();

    this.slashEffect = new SlashEffect(this);

    this.boss = new Boss(this, this.worldW * 0.5, this.worldH * 0.25);
    this.boss.getTargetPos = () => [this.player.x, this.player.y];
    this.boss.onHpChanged = () => this.refreshBossBar();
    this.boss.onDead = () => this.handleBossDefeated();
    this.boss.onAoeExplode = (x, y) => {
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
      if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(30);
    };

    const bossGroup = this.physics.add.group();
    bossGroup.add(this.boss, false);
    // group.add() resets body defaults (collideWorldBounds → false), so re-assert here
    this.player.setCollideWorldBounds(true);
    (this.boss.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    this.physics.add.overlap(bossGroup, this.player, () => {
      if (this.boss.currentState === 'DASHING') this.player.takeDamage(25);
    });

    this.bossHpGfx = this.add.graphics().setScrollFactor(0).setDepth(200);
    this.bossHpLabel = this.add.text(W / 2, 8, '', {
      fontSize: '12px', color: '#ffcccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(201);
    this.refreshBossBar();

    const kb = this.input.keyboard!;
    this.keys = {
      ...kb.createCursorKeys(),
      w:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d:     kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    const onResize = () => this.physics.world.setBounds(32, 40, this.worldW - 64, this.worldH - 80);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(this);
    this.addHUD();
    this.time.delayedCall(1000, () => this.boss.start());
  }

  override update(): void {
    if (this.gameOver) return;

    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      const tx = this.boss.active ? this.boss.x : this.player.x;
      const ty = this.boss.active ? this.boss.y : this.player.y - 1;
      this.meleeAttack(tx, ty);
    }

    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    if (this.keys.left.isDown || this.keys.a.isDown) vx = -1;
    else if (this.keys.right.isDown || this.keys.d.isDown) vx = 1;
    if (this.keys.up.isDown || this.keys.w.isDown) vy = -1;
    else if (this.keys.down.isDown || this.keys.s.isDown) vy = 1;

    this.player.move(vx, vy);
  }

  private meleeAttack(tx: number, ty: number): void {
    this.player.playAttack(tx, ty, () => {
      if (!this.boss.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      if (dist > MELEE_RANGE) return;
      const dir = this.player.attackDir;
      this.boss.takeDamage(30);
      this.slashEffect.play(this.boss.x, this.boss.y, dir);
      this.boss.knockback(this.player.x, this.player.y);
    });
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

  // ── Game-end handlers ─────────────────────────────────

  private handleBossDefeated(): void {
    this.gameOver = true;
    this.showEndScreen(true);
  }

  private handlePlayerDead(): void {
    this.gameOver = true;
    this.player.setActive(false).setVisible(false);
    this.showEndScreen(false);
  }

  private showEndScreen(victory: boolean): void {
    const W = this.scale.width;
    const H = this.scale.height;

    if (victory) {
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

    const overlay = this.add.graphics().setScrollFactor(0).setDepth(248);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);

    const titleText  = victory ? '挑戰成功！' : '挑戰失敗';
    const titleColor = victory ? '#ffdd00'    : '#ff4444';
    this.add.text(W / 2, H / 2 - 64, titleText, {
      fontSize: '44px', color: titleColor, stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(250);

    if (victory) {
      const btn = this.add.text(W / 2, H / 2 + 24, '返回大廳', {
        fontSize: '22px', color: '#ffffff',
        backgroundColor: '#223322',
        padding: { x: 28, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setInteractive({ useHandCursor: true });
      btn.on('pointerover', () => btn.setStyle({ color: '#ffdd00' }));
      btn.on('pointerout',  () => btn.setStyle({ color: '#ffffff' }));
      btn.on('pointerdown', () => this.scene.start('PrepScene'));
    } else {
      const retryBtn = this.add.text(W / 2 - 100, H / 2 + 24, '再次挑戰', {
        fontSize: '20px', color: '#ffffff',
        backgroundColor: '#332222',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setInteractive({ useHandCursor: true });
      retryBtn.on('pointerover', () => retryBtn.setStyle({ color: '#ff8888' }));
      retryBtn.on('pointerout',  () => retryBtn.setStyle({ color: '#ffffff' }));
      retryBtn.on('pointerdown', () => this.scene.restart());

      const lobbyBtn = this.add.text(W / 2 + 100, H / 2 + 24, '返回大廳', {
        fontSize: '20px', color: '#ffffff',
        backgroundColor: '#223322',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setInteractive({ useHandCursor: true });
      lobbyBtn.on('pointerover', () => lobbyBtn.setStyle({ color: '#ffdd00' }));
      lobbyBtn.on('pointerout',  () => lobbyBtn.setStyle({ color: '#ffffff' }));
      lobbyBtn.on('pointerdown', () => this.scene.start('PrepScene'));
    }
  }

  // ── Scene helpers ─────────────────────────────────────

  private addHUD(): void {
    this.add.text(12, 12, 'WASD / Joystick: 移動\nSpace / 攻擊鍵: 揮劍', {
      fontSize: '12px', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(200);

    this.addAttackButton();
  }

  private addAttackButton(): void {
    const r = 40;
    const getBtnCenter = () => ({
      x: this.scale.width  - 68,
      y: this.scale.height - 80,
    });

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(100);

    const drawBtn = (pressed: boolean) => {
      gfx.clear();
      const { x: cx, y: cy } = getBtnCenter();
      const oy = pressed ? 1 : 0;

      // Drop shadow
      gfx.fillStyle(0x000000, 0.5);
      gfx.fillCircle(cx + 3, cy + 3, r);

      // Outer ring (dark border)
      gfx.fillStyle(0x150000, 1);
      gfx.fillCircle(cx, cy, r);

      // Bevel highlight ring (top-left offset)
      if (!pressed) {
        gfx.fillStyle(0xb82800, 1);
        gfx.fillCircle(cx - 1, cy - 1, r - 2);
      }

      // Main fill
      gfx.fillStyle(pressed ? 0x4a0e00 : 0x6a1500, 1);
      gfx.fillCircle(cx + (pressed ? 1 : 0), cy + (pressed ? 1 : 0), r - (pressed ? 2 : 4));

      // Inner glow highlight (top area)
      if (!pressed) {
        gfx.fillStyle(0xff6633, 0.28);
        gfx.fillCircle(cx - 5, cy - 10, 13);
      }

      // ── Pixel sword icon ──────────────────────────────
      const ox = cx;

      // blade (silver)
      gfx.fillStyle(0xdddddd, 1);
      gfx.fillRect(ox - 2, cy - 18 + oy, 4, 24);
      // blade shine
      gfx.fillStyle(0xffffff, 1);
      gfx.fillRect(ox - 1, cy - 17 + oy, 1, 18);
      // blade tip
      gfx.fillStyle(0xbbbbbb, 1);
      gfx.fillRect(ox - 1, cy - 20 + oy, 2, 2);

      // guard (gold)
      gfx.fillStyle(0xddaa00, 1);
      gfx.fillRect(ox - 9, cy + 5 + oy, 18, 4);
      gfx.fillStyle(0x997700, 1);
      gfx.fillRect(ox - 9, cy + 5 + oy, 3, 4);
      gfx.fillRect(ox + 6,  cy + 5 + oy, 3, 4);

      // grip (brown)
      gfx.fillStyle(0x884422, 1);
      gfx.fillRect(ox - 2, cy + 9 + oy, 4, 9);
      gfx.fillStyle(0xaa6633, 1);
      gfx.fillRect(ox - 2, cy + 11 + oy, 4, 2);
      gfx.fillRect(ox - 2, cy + 14 + oy, 4, 2);

      // pommel (gold)
      gfx.fillStyle(0xddaa00, 1);
      gfx.fillRect(ox - 4, cy + 18 + oy, 8, 4);
    };

    drawBtn(false);

    // Use scene-level pointer events so multi-touch works on iOS
    const activeIds = new Set<number>();

    const onDown = (ptr: Phaser.Input.Pointer) => {
      const { x: cx, y: cy } = getBtnCenter();
      if (Phaser.Math.Distance.Between(ptr.x, ptr.y, cx, cy) > r) return;
      activeIds.add(ptr.id);
      drawBtn(true);
      if (this.gameOver) return;
      const tx = this.boss.active ? this.boss.x : this.player.x;
      const ty = this.boss.active ? this.boss.y : this.player.y - 1;
      this.meleeAttack(tx, ty);
    };

    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (!activeIds.has(ptr.id)) return;
      activeIds.delete(ptr.id);
      if (activeIds.size === 0) drawBtn(false);
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointerup',   onUp);

    const onResize = () => drawBtn(false);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointerup',   onUp);
      this.scale.off('resize', onResize);
    });
  }

  private createPlayerAnims(): void {
    if (!this.anims.exists('player_idle_down'))
      this.anims.create({ key: 'player_idle_down',  frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0,  end: 3  }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_left'))
      this.anims.create({ key: 'player_idle_left',  frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_right'))
      this.anims.create({ key: 'player_idle_right', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 24, end: 27 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_up'))
      this.anims.create({ key: 'player_idle_up',    frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 36, end: 39 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_run_down'))
      this.anims.create({ key: 'player_run_down',    frames: this.anims.generateFrameNumbers('player_run_shadow',  { start: 0,  end: 7  }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_left'))
      this.anims.create({ key: 'player_run_left',    frames: this.anims.generateFrameNumbers('player_run_shadow',  { start: 8,  end: 15 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_right'))
      this.anims.create({ key: 'player_run_right',   frames: this.anims.generateFrameNumbers('player_run_shadow',  { start: 16, end: 23 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_up'))
      this.anims.create({ key: 'player_run_up',      frames: this.anims.generateFrameNumbers('player_run_shadow',  { start: 24, end: 31 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_attack_down'))
      this.anims.create({ key: 'player_attack_down',      frames: this.anims.generateFrameNumbers('player_attack_shadow',     { start: 0,  end: 7  }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_left'))
      this.anims.create({ key: 'player_attack_left',      frames: this.anims.generateFrameNumbers('player_attack_shadow',     { start: 8,  end: 15 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_right'))
      this.anims.create({ key: 'player_attack_right',     frames: this.anims.generateFrameNumbers('player_attack_shadow',     { start: 16, end: 23 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_up'))
      this.anims.create({ key: 'player_attack_up',        frames: this.anims.generateFrameNumbers('player_attack_shadow',     { start: 24, end: 31 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_down'))
      this.anims.create({ key: 'player_run_attack_down',  frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 0,  end: 7  }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_left'))
      this.anims.create({ key: 'player_run_attack_left',  frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 8,  end: 15 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_right'))
      this.anims.create({ key: 'player_run_attack_right', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 16, end: 23 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_up'))
      this.anims.create({ key: 'player_run_attack_up',    frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 24, end: 31 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_hurt'))
      this.anims.create({ key: 'player_hurt',             frames: this.anims.generateFrameNumbers('player_hurt',              { start: 0,  end: 4  }), frameRate: 14, repeat: 0 });
  }

  private createSlimeAnims(): void {
    if (this.anims.exists('slime_idle_down')) return;
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    // cols × rows: idle=6×4, walk=8×4, run=8×4, attack=10×4, hurt=5×4, death=10×4
    const defs = [
      { base: 'slime_idle',   tex: 'slime_idle',   cols: 6,  fps: 8,  repeat: -1 },
      { base: 'slime_walk',   tex: 'slime_walk',   cols: 8,  fps: 10, repeat: -1 },
      { base: 'slime_run',    tex: 'slime_run',    cols: 8,  fps: 14, repeat: -1 },
      { base: 'slime_attack', tex: 'slime_attack', cols: 10, fps: 10, repeat: -1 },
      { base: 'slime_hurt',   tex: 'slime_hurt',   cols: 5,  fps: 14, repeat: 0  },
      { base: 'slime_death',  tex: 'slime_death',  cols: 10, fps: 8,  repeat: 0  },
    ];
    dirs.forEach((dir, row) => {
      defs.forEach(d => {
        const start = row * d.cols;
        this.anims.create({
          key: `${d.base}_${dir}`,
          frames: this.anims.generateFrameNumbers(d.tex, { start, end: start + d.cols - 1 }),
          frameRate: d.fps,
          repeat: d.repeat,
        });
      });
    });
  }

  private drawArenaFloor(): void {
    this.add.tileSprite(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 'grass').setDepth(0);

    // Draw border at physics bounds position so visual aligns with actual boundary
    const px = 32, py = 40, pw = this.worldW - 64, ph = this.worldH - 80;
    const border = this.add.graphics().setDepth(1);
    border.fillStyle(0x2e7018, 0.65);
    border.fillRect(px,          py,          pw, 6);   // top
    border.fillRect(px,          py + ph - 6, pw, 6);   // bottom
    border.fillRect(px,          py,          6,  ph);  // left
    border.fillRect(px + pw - 6, py,          6,  ph);  // right
    border.fillStyle(0x1a5010, 0.8);
    border.fillRect(px,          py, pw, 3);
    border.fillRect(px,          py, 3,  ph);
    border.fillStyle(0x70bc4c, 0.3);
    border.fillRect(px + 3,      py + ph - 3, pw - 3, 3);
    border.fillRect(px + pw - 3, py + 3,      3, ph - 3);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateTextures(): void {
    if (!this.textures.exists('grass')) {
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
      const bg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      bg.fillStyle(0xffffff, 1); bg.fillCircle(4, 4, 4);
      bg.fillStyle(0xffffff, 0.7); bg.fillCircle(4, 4, 2);
      bg.generateTexture('bullet', 8, 8);
      bg.destroy();
    }
    if (!this.textures.exists('pxl')) {
      const ppg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      ppg.fillStyle(0xffffff, 1); ppg.fillRect(0, 0, 4, 4);
      ppg.generateTexture('pxl', 4, 4);
      ppg.destroy();
    }
    if (!this.textures.exists('pxl2')) {
      const spg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      spg.fillStyle(0xffffff, 1); spg.fillRect(0, 0, 2, 2);
      spg.generateTexture('pxl2', 2, 2);
      spg.destroy();
    }
  }
}
