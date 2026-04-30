import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss } from '../objects/boss';
import { SlashEffect } from '../objects/slash-effect';
import { VirtualJoystick } from '../ui/joystick';
import { PlayerStore } from '../data/player-store';
import { InventoryStore } from '../data/inventory-store';

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

    (this.boss.body as Phaser.Physics.Arcade.Body).immovable = true;
    this.physics.add.collider(this.player, bossGroup, undefined, () => {
      return this.boss.currentState !== 'DASHING';
    }, this);
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

    // Y-sort: higher Y → higher depth (drawn on top)
    this.player.setDepth(this.player.y);
    this.boss.setDepth(this.boss.y);
  }

  private meleeAttack(tx: number, ty: number): void {
    this.player.playAttack(tx, ty, () => {
      if (!this.boss.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      if (dist > MELEE_RANGE) return;
      const dir    = this.player.attackDir;
      const stats  = PlayerStore.getStats();
      const isCrit = Math.random() < stats.crit;
      const dmg    = stats.atk * (isCrit ? 2 : 1);
      this.boss.takeDamage(dmg);
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
    const bh = 7;

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

    const chunks  = Phaser.Math.Between(1, 3);
    const essence = Phaser.Math.Between(0, 1);
    const coins   = Phaser.Math.Between(20, 200);
    const expGain = Phaser.Math.Between(25, 50);

    InventoryStore.addItem('slime_chunk', '綠史萊姆碎塊', chunks);
    if (essence > 0)
      InventoryStore.addItem('slime_essence', '綠史萊姆精華', essence);
    InventoryStore.addGold(coins);
    PlayerStore.addExp(expGain);

    const drops: { icon: string; name: string; qty: number }[] = [
      { icon: 'icon_slime_chunk', name: '綠史萊姆碎塊', qty: chunks },
    ];
    if (essence > 0)
      drops.push({ icon: 'icon_slime_essence', name: '綠史萊姆精華', qty: essence });

    this.showVictoryScreen(coins, expGain, drops);
  }

  private handlePlayerDead(): void {
    this.gameOver = true;
    this.player.setActive(false).setVisible(false);
    this.showEndScreen(false);
  }

  private showVictoryScreen(coins: number, exp: number, drops: { icon: string; name: string; qty: number }[]): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const D = 250;

    this.launchFireworks(W, H);

    // Full overlay
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(D - 2);
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(0, 0, W, H);

    // ── Title ─────────────────────────────────────────────
    const titleY = H * 0.12;

    // Glow halo behind text
    const halo = this.add.graphics().setScrollFactor(0).setDepth(D);
    halo.fillStyle(0xffdd00, 0.07);
    halo.fillEllipse(W / 2, titleY, 340, 70);
    halo.fillStyle(0xffdd00, 0.04);
    halo.fillEllipse(W / 2, titleY, 440, 90);

    // Decorative lines flanking title
    const lineGfx = this.add.graphics().setScrollFactor(0).setDepth(D);
    lineGfx.lineStyle(1, 0xd4a044, 0.6);
    lineGfx.lineBetween(W / 2 - 160, titleY, W / 2 - 72, titleY);
    lineGfx.lineBetween(W / 2 + 72,  titleY, W / 2 + 160, titleY);
    lineGfx.fillStyle(0xd4a044, 0.8);
    lineGfx.fillRect(W / 2 - 162, titleY - 3, 6, 6);
    lineGfx.fillRect(W / 2 + 156, titleY - 3, 6, 6);

    this.add.text(W / 2, titleY, '勝  利', {
      fontSize: '46px', fontStyle: 'bold',
      color: '#ffe866', stroke: '#7a4400', strokeThickness: 7,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    // Subtitle
    this.add.text(W / 2, titleY + 34, 'V I C T O R Y', {
      fontSize: '11px', color: '#c49050', letterSpacing: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D);

    // ── Results panel ─────────────────────────────────────
    const rowH   = 34;
    const panelW = 260;
    const panelH = 40 + (drops.length + 2) * rowH + 14;
    const panelX = W / 2 - panelW / 2;
    const panelY = H * 0.28;

    const panel = this.add.graphics().setScrollFactor(0).setDepth(D);
    // Outer glow border
    panel.lineStyle(4, 0xd4a044, 0.15);
    panel.strokeRect(panelX - 4, panelY - 4, panelW + 8, panelH + 8);
    // Iron outer frame
    panel.fillStyle(0x1a1408, 1);
    panel.fillRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);
    // Gold border
    panel.lineStyle(1.5, 0xd4a044, 0.7);
    panel.strokeRect(panelX - 2, panelY - 2, panelW + 4, panelH + 4);
    // Panel body
    panel.fillStyle(0x0c1408, 0.97);
    panel.fillRect(panelX, panelY, panelW, panelH);
    // Title bar
    panel.fillStyle(0x1a2810, 1);
    panel.fillRect(panelX, panelY, panelW, 40);
    panel.fillStyle(0xd4a044, 0.6);
    panel.fillRect(panelX, panelY, panelW, 2);
    panel.fillStyle(0xd4a044, 0.12);
    panel.fillRect(panelX, panelY + 2, panelW, 38);
    // Divider after header
    panel.lineStyle(1, 0xd4a044, 0.2);
    panel.lineBetween(panelX + 12, panelY + 40, panelX + panelW - 12, panelY + 40);
    // Corner accents
    [[panelX, panelY], [panelX + panelW - 10, panelY],
     [panelX, panelY + panelH - 10], [panelX + panelW - 10, panelY + panelH - 10]]
      .forEach(([cx, cy]) => {
        panel.fillStyle(0xd4a044, 0.5);
        panel.fillRect(cx, cy, 10, 10);
        panel.fillStyle(0x0c1408, 1);
        panel.fillRect(cx + 2, cy + 2, 6, 6);
      });

    this.add.text(W / 2, panelY + 16, '獲  得', {
      fontSize: '11px', color: '#d4a044', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    // Item rows
    const renderRow = (ry: number, iconKey: string, name: string, valueStr: string, valueColor: string) => {
      const rowGfx = this.add.graphics().setScrollFactor(0).setDepth(D);
      rowGfx.lineStyle(1, 0xd4a044, 0.08);
      rowGfx.lineBetween(panelX + 10, ry + rowH, panelX + panelW - 10, ry + rowH);
      // Icon cell
      const iconSz = 24;
      rowGfx.fillStyle(0x1a2a10, 1);
      rowGfx.fillRect(panelX + 10, ry + (rowH - iconSz) / 2, iconSz, iconSz);
      rowGfx.lineStyle(1, 0xd4a044, 0.3);
      rowGfx.strokeRect(panelX + 10, ry + (rowH - iconSz) / 2, iconSz, iconSz);

      if (this.textures.exists(iconKey))
        this.add.image(panelX + 10 + iconSz / 2, ry + rowH / 2, iconKey)
          .setDisplaySize(18, 18).setScrollFactor(0).setDepth(D + 1);

      this.add.text(panelX + 42, ry + rowH / 2, name, {
        fontSize: '10px', color: '#c8c8c8', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(D + 1);

      this.add.text(panelX + panelW - 10, ry + rowH / 2, valueStr, {
        fontSize: '11px', fontStyle: 'bold', color: valueColor, stroke: '#000', strokeThickness: 2,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(D + 1);
    };

    drops.forEach((drop, i) =>
      renderRow(panelY + 40 + i * rowH, drop.icon, drop.name, `× ${drop.qty}`, '#88ee44'));
    renderRow(panelY + 40 + drops.length * rowH,       'icon_gold', '金幣', `+ ${coins}`, '#ffcc44');
    renderRow(panelY + 40 + (drops.length + 1) * rowH, 'icon_exp',  '經驗值', `+ ${exp}`,  '#88ccff');

    // ── Return button ─────────────────────────────────────
    const btnW  = 96;
    const btnH  = 23;
    const btnCX = W / 2;
    const btnCY = panelY + panelH + 42;

    const btnGfx = this.add.graphics().setScrollFactor(0).setDepth(D);
    // Shadow
    btnGfx.fillStyle(0x000000, 0.4);
    btnGfx.fillRect(btnCX - btnW / 2 + 3, btnCY - btnH / 2 + 3, btnW, btnH);
    // Outer frame
    btnGfx.fillStyle(0x2a1e04, 1);
    btnGfx.fillRect(btnCX - btnW / 2 - 2, btnCY - btnH / 2 - 2, btnW + 4, btnH + 4);
    // Gold border
    btnGfx.lineStyle(2, 0xd4a044, 0.85);
    btnGfx.strokeRect(btnCX - btnW / 2 - 2, btnCY - btnH / 2 - 2, btnW + 4, btnH + 4);
    // Body
    btnGfx.fillStyle(0x3a2a08, 1);
    btnGfx.fillRect(btnCX - btnW / 2, btnCY - btnH / 2, btnW, btnH);
    btnGfx.fillStyle(0xd4a044, 0.12);
    btnGfx.fillRect(btnCX - btnW / 2, btnCY - btnH / 2, btnW, btnH);
    // Top shine
    btnGfx.fillStyle(0xd4a044, 0.35);
    btnGfx.fillRect(btnCX - btnW / 2 + 2, btnCY - btnH / 2, btnW - 4, 2);

    const btnLabel = this.add.text(btnCX, btnCY, '返 回 大 廳', {
      fontSize: '10px', fontStyle: 'bold',
      color: '#e8c070', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);

    const hitArea = this.add.rectangle(btnCX, btnCY, btnW, btnH)
      .setScrollFactor(0).setDepth(D + 2).setInteractive({ useHandCursor: true });
    hitArea.on('pointerover', () => btnLabel.setStyle({ color: '#ffe866' }));
    hitArea.on('pointerout',  () => btnLabel.setStyle({ color: '#e8c070' }));
    hitArea.on('pointerdown', () => this.scene.start('PrepScene'));
  }

  private showEndScreen(victory: boolean): void {
    const W = this.scale.width;
    const H = this.scale.height;

    if (victory) this.launchFireworks(W, H);

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

  private launchFireworks(W: number, H: number): void {
    const colors = [0xffdd00, 0xff3355, 0x33aaff, 0x44ff88, 0xff66bb, 0xffffff, 0xff8833];

    const burst = (cx: number, cy: number, color: number, delay: number) => {
      this.time.delayedCall(delay, () => {
        // White flash
        const flash = this.add.graphics().setScrollFactor(0).setDepth(249).setPosition(cx, cy);
        flash.fillStyle(0xffffff, 1);
        flash.fillCircle(0, 0, 16);
        this.tweens.add({
          targets: flash, alpha: 0, scaleX: 3, scaleY: 3,
          duration: 250, ease: 'Cubic.easeOut',
          onComplete: () => flash.destroy(),
        });

        // Main sparks
        for (let i = 0; i < 24; i++) {
          const angle = (i / 24) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.15, 0.15);
          const dist  = Phaser.Math.Between(80, 170);
          const sz    = Phaser.Math.Between(3, 7);
          const c     = i % 5 === 0 ? 0xffffff : color;

          const spark = this.add.graphics().setScrollFactor(0).setDepth(250).setPosition(cx, cy);
          spark.fillStyle(c, 1);
          spark.fillCircle(0, 0, sz);
          this.tweens.add({
            targets: spark,
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            alpha: 0, scaleX: 0.1, scaleY: 0.1,
            duration: Phaser.Math.Between(700, 1200),
            ease: 'Cubic.easeOut',
            onComplete: () => spark.destroy(),
          });
        }

        // Inner sparkles
        for (let i = 0; i < 12; i++) {
          const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
          const dist  = Phaser.Math.Between(20, 55);
          const s = this.add.graphics().setScrollFactor(0).setDepth(250).setPosition(cx, cy);
          s.fillStyle(0xffffcc, 1);
          s.fillCircle(0, 0, 2);
          this.tweens.add({
            targets: s,
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            alpha: 0, duration: Phaser.Math.Between(300, 600),
            delay: Phaser.Math.Between(50, 200),
            ease: 'Sine.easeOut',
            onComplete: () => s.destroy(),
          });
        }
      });
    };

    const spots: [number, number][] = [
      [W / 2,    H / 2   ],
      [W * 0.28, H * 0.30],
      [W * 0.72, H * 0.30],
      [W * 0.20, H * 0.65],
      [W * 0.80, H * 0.65],
      [W / 2,    H * 0.18],
      [W / 2,    H * 0.78],
    ];

    spots.forEach(([x, y], i) =>
      burst(x, y, colors[i % colors.length], i * 320));
    spots.forEach(([x, y], i) =>
      burst(
        x + Phaser.Math.Between(-25, 25),
        y + Phaser.Math.Between(-25, 25),
        colors[(i + 3) % colors.length],
        2400 + i * 280,
      ));
  }

  // ── Scene helpers ─────────────────────────────────────

  private addHUD(): void {
    this.addAttackButton();
  }

  private addAttackButton(): void {
    const r = 40;
    const getBtnCenter = () => ({
      x: this.scale.width  - 100,
      y: this.scale.height - 120,
    });

    const gfx = this.add.graphics().setScrollFactor(0).setDepth(100).setAlpha(0.25);

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
    if (!this.textures.exists('icon_slime_chunk')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x44cc44, 1); g.fillCircle(16, 18, 13);
      g.fillStyle(0x22aa22, 1); g.fillCircle(10, 22, 8); g.fillCircle(22, 22, 8);
      g.fillStyle(0x88ff88, 0.5); g.fillCircle(12, 12, 5);
      g.generateTexture('icon_slime_chunk', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('icon_slime_essence')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x44ddaa, 1); g.fillCircle(16, 20, 10);
      g.fillStyle(0x22bbaa, 1);
      g.fillTriangle(16, 4, 8, 20, 24, 20);
      g.fillStyle(0xaaffee, 0.6); g.fillCircle(13, 14, 4);
      g.generateTexture('icon_slime_essence', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('icon_gold')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0xcc8800, 1); g.fillCircle(16, 16, 14);
      g.fillStyle(0xffcc00, 1); g.fillCircle(16, 16, 12);
      g.fillStyle(0xffee88, 0.7); g.fillCircle(12, 11, 5);
      g.fillStyle(0xcc8800, 1); g.fillRect(13, 9, 6, 14); g.fillRect(10, 12, 12, 3); g.fillRect(10, 19, 12, 3);
      g.generateTexture('icon_gold', 32, 32);
      g.destroy();
    }
    if (!this.textures.exists('icon_exp')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0x2244aa, 1); g.fillCircle(16, 16, 14);
      g.fillStyle(0x4488ff, 1); g.fillCircle(16, 16, 11);
      g.fillStyle(0xaaddff, 0.8); g.fillCircle(11, 10, 4);
      g.fillStyle(0xffffff, 1);
      g.fillRect(14, 8, 4, 16); g.fillRect(9, 13, 14, 4);
      g.generateTexture('icon_exp', 32, 32);
      g.destroy();
    }
  }
}
