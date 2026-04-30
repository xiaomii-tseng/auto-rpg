import Phaser from 'phaser';
import { VERSION } from '../version';

const TOP_H  = 52;
const SIDE_W = 76;

export class PrepScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PrepScene' });
  }

  preload(): void {
    const cfg = { frameWidth: 64, frameHeight: 64 };
    if (!this.textures.exists('player_idle_shadow'))
      this.load.spritesheet('player_idle_shadow', 'sprite/hero/PNG/Swordsman_lvl1/With_shadow/Swordsman_lvl1_Idle_with_shadow.png', cfg);
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    if (!this.anims.exists('player_idle_shadow')) {
      this.anims.create({
        key: 'player_idle_shadow',
        frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }),
        frameRate: 5,
        repeat: 0,
      });
    }

    this.drawBackground(W, H);
    this.drawTopBar(W);
    this.drawSidebars(W, H);
    this.drawCenterHero(W, H);
    this.drawBattleButton(W, H);

    this.add.text(W / 2, H / 3, VERSION, {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(999);
  }

  // ── Background (stone floor) ────────────────────────────

  private drawBackground(W: number, H: number): void {
    // Base fill
    this.add.rectangle(W / 2, H / 2, W, H, 0x1e1b18);

    const gfx = this.add.graphics();
    const tW = 88;
    const tH = 56;

    for (let row = 0; row <= Math.ceil(H / tH); row++) {
      const offset = (row % 2 === 0) ? 0 : tW / 2;
      for (let col = -1; col <= Math.ceil(W / tW) + 1; col++) {
        const tx = col * tW + offset;
        const ty = row * tH;

        // Vary stone shade slightly per tile
        const v = ((row * 7 + col * 13) % 5);
        const shade = [0x35302b, 0x302c28, 0x3a3530, 0x2e2a26, 0x383330][v];
        gfx.fillStyle(shade, 1);
        gfx.fillRect(tx + 1, ty + 1, tW - 1, tH - 1);

        // Top highlight (light edge)
        gfx.fillStyle(0x4a4540, 0.45);
        gfx.fillRect(tx + 1, ty + 1, tW - 1, 3);

        // Left highlight
        gfx.fillStyle(0x444040, 0.25);
        gfx.fillRect(tx + 1, ty + 1, 3, tH - 1);

        // Bottom shadow
        gfx.fillStyle(0x100d0a, 0.5);
        gfx.fillRect(tx + 1, ty + tH - 3, tW - 1, 3);
      }
    }

    // Mortar grid
    gfx.lineStyle(1, 0x100d0a, 0.9);
    for (let row = 0; row <= Math.ceil(H / tH) + 1; row++) {
      const offset = (row % 2 === 0) ? 0 : tW / 2;
      const y = row * tH;
      // horizontal line
      gfx.lineBetween(0, y, W, y);
      // vertical lines (offset per row)
      for (let col = -1; col <= Math.ceil(W / tW) + 2; col++) {
        const x = col * tW + offset;
        gfx.lineBetween(x, y, x, y + tH);
      }
    }

    // Subtle dark vignette overlay
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
    vig.fillRect(0, 0, W, H / 3);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.45, 0.45);
    vig.fillRect(0, H * 0.67, W, H * 0.33);
  }

  // ── Top bar ─────────────────────────────────────────────

  private drawTopBar(W: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x050e1a, 0.96);
    gfx.fillRect(0, 0, W, TOP_H);
    gfx.lineStyle(1, 0x1b3352, 0.7);
    gfx.lineBetween(0, TOP_H, W, TOP_H);

    // Player avatar
    const avGfx = this.add.graphics();
    avGfx.fillStyle(0x1a3d6e, 1);
    avGfx.fillCircle(34, TOP_H / 2, 20);
    avGfx.lineStyle(2, 0x4488dd, 0.8);
    avGfx.strokeCircle(34, TOP_H / 2, 20);
    this.add.text(34, TOP_H / 2, '勇', {
      fontSize: '14px', color: '#99ccff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(60, TOP_H / 2 - 7, '玩家一號', {
      fontSize: '12px', color: '#ddeeff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5);
    this.add.text(60, TOP_H / 2 + 8, 'Rank 1', {
      fontSize: '10px', color: '#667788',
    }).setOrigin(0, 0.5);

    // Resources
    this.addResource(248, TOP_H / 2, 0xffdd22, '10,032');
    this.addResource(380, TOP_H / 2, 0xffaa22, '830');
    this.addResource(490, TOP_H / 2, 0x44eeaa, '111');

    // Settings
    const cy = TOP_H / 2;
    const sg = this.add.graphics();
    sg.fillStyle(0x0d1e30, 0.9);
    sg.fillRect(W - 48, cy - 16, 38, 32);
    sg.lineStyle(1, 0x2a4a6a, 0.5);
    sg.strokeRect(W - 48, cy - 16, 38, 32);
    this.add.text(W - 29, cy, '≡', {
      fontSize: '22px', color: '#5577aa', stroke: '#000', strokeThickness: 1,
    }).setOrigin(0.5);
  }

  private addResource(x: number, y: number, iconColor: number, value: string): void {
    const bg = this.add.graphics();
    bg.fillStyle(0x060f1c, 0.85);
    bg.fillRect(x - 14, y - 14, 78, 28);
    bg.lineStyle(1, iconColor, 0.2);
    bg.strokeRect(x - 14, y - 14, 78, 28);

    const ig = this.add.graphics();
    ig.fillStyle(iconColor, 0.9);
    ig.fillCircle(x, y, 11);

    this.add.text(x + 16, y, value, {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5);
  }

  // ── Sidebars ────────────────────────────────────────────

  private drawSidebars(W: number, H: number): void {
    const midH   = H - TOP_H;
    const btnSz  = 66;
    const gap    = 10;

    // Left: 3 buttons
    const leftDefs = [
      { label: '任務', accent: 0xffdd22, badge: 2 },
      { label: '商店', accent: 0xffaa22, badge: 0 },
      { label: '拍賣', accent: 0xee44aa, badge: 0 },
    ];
    const leftTotalH = leftDefs.length * btnSz + (leftDefs.length - 1) * gap;
    const leftY0 = TOP_H + (midH - leftTotalH) / 2;
    leftDefs.forEach((b, i) => {
      const by = leftY0 + i * (btnSz + gap) + btnSz / 2;
      this.addSideBtn(SIDE_W / 2, by, btnSz, b.label, b.accent, b.badge);
    });

    // Right: 1 button (好友), centered
    const rightY = TOP_H + midH / 2;
    this.addSideBtn(W - SIDE_W / 2, rightY, btnSz, '好友', 0x44ff88, 0);
  }

  private addSideBtn(x: number, y: number, sz: number, label: string, accent: number, badge = 0): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x07111e, 0.93);
    gfx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    gfx.lineStyle(1.5, accent, 0.4);
    gfx.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    gfx.fillStyle(accent, 0.65);
    gfx.fillRect(x - sz / 2, y - sz / 2, sz, 4);

    this.add.text(x, y + 5, label, {
      fontSize: '13px', color: '#bbccdd', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    if (badge > 0) {
      const bg2 = this.add.graphics();
      bg2.fillStyle(0xff2233, 1);
      bg2.fillCircle(x + sz / 2 - 8, y - sz / 2 + 8, 10);
      this.add.text(x + sz / 2 - 8, y - sz / 2 + 8, String(badge), {
        fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5);
    }
  }

  // ── Center hero ─────────────────────────────────────────

  private drawCenterHero(W: number, H: number): void {
    const cx    = W / 2;
    const midH  = H - TOP_H;
    const cy    = TOP_H + midH * 0.44;
    const scale = 4.4;

    const platformGfx = this.add.graphics();
    platformGfx.fillStyle(0x1155aa, 0.08);
    platformGfx.fillEllipse(cx, cy + 130, 200, 40);

    const shadowGfx = this.add.graphics();
    shadowGfx.fillStyle(0x000000, 0.28);
    shadowGfx.fillEllipse(cx, cy + 134, 130, 18);

    const hero = this.add.sprite(cx, cy, 'player_idle_shadow', 0)
      .setScale(scale)
      .setDepth(10);
    const playIdle = () => {
      hero.play('player_idle_shadow');
      hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        hero.setFrame(0);
        this.time.delayedCall(Phaser.Math.Between(2000, 3500), playIdle);
      });
    };
    playIdle();

    const nameGfx = this.add.graphics();
    nameGfx.fillStyle(0x060f1c, 0.8);
    nameGfx.fillRect(cx - 64, cy + 140, 128, 24);
    nameGfx.lineStyle(1, 0x2244aa, 0.5);
    nameGfx.strokeRect(cx - 64, cy + 140, 128, 24);
    this.add.text(cx, cy + 152, '劍士  Lv.1', {
      fontSize: '13px', color: '#88aacc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
  }

  // ── Battle button (standalone) ──────────────────────────

  private drawBattleButton(W: number, H: number): void {
    const battleBtn = this.add.text(W / 2, H - 36, '對  戰', {
      fontSize: '28px',
      color: '#0a0800',
      backgroundColor: '#ffdd00',
      padding: { x: 36, y: 10 },
      stroke: '#bb8800',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    battleBtn.on('pointerover', () => battleBtn.setStyle({ backgroundColor: '#ffe633' }));
    battleBtn.on('pointerout',  () => battleBtn.setStyle({ backgroundColor: '#ffdd00' }));
    battleBtn.on('pointerdown', () => this.scene.start('GameScene'));

    this.tweens.add({
      targets: battleBtn,
      scaleX: 1.04, scaleY: 1.04,
      duration: 800, yoyo: true, repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
