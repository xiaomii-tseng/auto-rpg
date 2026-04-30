import Phaser from 'phaser';
import { VERSION } from '../version';

const TOP_H  = 52;
const BOT_H  = 54;
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
    const W = this.scale.width;   // 960
    const H = this.scale.height;  // 540

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
    this.drawBottomBar(W, H);

    this.add.text(W / 2, H / 2, VERSION, {
      fontSize: '20px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(999);
  }

  // ── Background ──────────────────────────────────────────

  private drawBackground(W: number, H: number): void {
    this.add.rectangle(W / 2, H / 2, W, H, 0x091624);

    // Hex grid overlay
    const gfx = this.add.graphics();
    gfx.lineStyle(0.6, 0x1a3a5c, 0.2);
    const r     = 28;
    const hexW  = r * Math.sqrt(3);
    const rowSt = r * 1.5;

    for (let row = -1; row <= Math.ceil(H / rowSt) + 1; row++) {
      for (let col = -1; col <= Math.ceil(W / hexW) + 1; col++) {
        const cx = col * hexW + (row % 2 !== 0 ? hexW / 2 : 0);
        const cy = row * rowSt;
        gfx.beginPath();
        for (let vi = 0; vi <= 6; vi++) {
          const a  = (vi / 6) * Math.PI * 2 - Math.PI / 6;
          const vx = cx + Math.cos(a) * (r - 1);
          const vy = cy + Math.sin(a) * (r - 1);
          if (vi === 0) gfx.moveTo(vx, vy); else gfx.lineTo(vx, vy);
        }
        gfx.strokePath();
      }
    }
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
    const midH  = H - TOP_H - BOT_H;
    const btnSz = 66;
    const gap   = 10;
    const n     = 3;
    const totalH = n * btnSz + (n - 1) * gap;
    const btnY0  = TOP_H + (midH - totalH) / 2;

    const leftDefs = [
      { label: '商店', accent: 0xffaa22, badge: 0 },
      { label: '英雄', accent: 0x44aaff, badge: 9 },
      { label: '新聞', accent: 0xff4455, badge: 1 },
    ];
    leftDefs.forEach((b, i) => {
      const by = btnY0 + i * (btnSz + gap) + btnSz / 2;
      this.addSideBtn(SIDE_W / 2, by, btnSz, b.label, b.accent, b.badge);
    });

    const rightDefs = [
      { label: '好友', accent: 0x44ff88, badge: 0 },
      { label: '戰隊', accent: 0xff6644, badge: 0 },
      { label: '現天', accent: 0xaa44ff, badge: 0 },
    ];
    rightDefs.forEach((b, i) => {
      const by = btnY0 + i * (btnSz + gap) + btnSz / 2;
      this.addSideBtn(W - SIDE_W / 2, by, btnSz, b.label, b.accent, b.badge);
    });
  }

  private addSideBtn(x: number, y: number, sz: number, label: string, accent: number, badge = 0): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x07111e, 0.93);
    gfx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
    gfx.lineStyle(1.5, accent, 0.4);
    gfx.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    // Accent top strip
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
    const midH  = H - TOP_H - BOT_H;
    const cy    = TOP_H + midH * 0.48;
    const scale = 4.4;

    // Platform glow
    const platformGfx = this.add.graphics();
    platformGfx.fillStyle(0x1155aa, 0.08);
    platformGfx.fillEllipse(cx, cy + 130, 200, 40);

    // Ground shadow
    const shadowGfx = this.add.graphics();
    shadowGfx.fillStyle(0x000000, 0.22);
    shadowGfx.fillEllipse(cx, cy + 134, 130, 18);

    // Hero sprite
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


    // Name tag
    const nameGfx = this.add.graphics();
    nameGfx.fillStyle(0x060f1c, 0.8);
    nameGfx.fillRect(cx - 64, cy + 140, 128, 24);
    nameGfx.lineStyle(1, 0x2244aa, 0.5);
    nameGfx.strokeRect(cx - 64, cy + 140, 128, 24);
    this.add.text(cx, cy + 152, '劍士  Lv.1', {
      fontSize: '13px', color: '#88aacc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);
  }

  // ── Bottom bar ──────────────────────────────────────────

  private drawBottomBar(W: number, H: number): void {
    const gfx = this.add.graphics();
    gfx.fillStyle(0x050e1a, 0.97);
    gfx.fillRect(0, H - BOT_H, W, BOT_H);
    gfx.lineStyle(1, 0x1b3352, 0.7);
    gfx.lineBetween(0, H - BOT_H, W, H - BOT_H);

    const by = H - BOT_H;

    // ── Token / pass (left) ──
    const passGfx = this.add.graphics();
    passGfx.fillStyle(0x7a4412, 1);
    passGfx.fillRect(8, by + 7, 40, 40);
    passGfx.lineStyle(1, 0xffaa44, 0.45);
    passGfx.strokeRect(8, by + 7, 40, 40);
    this.add.text(28, by + 27, '通', {
      fontSize: '15px', color: '#ffcc88', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(54, by + 16, '通行券', {
      fontSize: '10px', color: '#887766',
    }).setOrigin(0, 0.5);
    this.add.text(54, by + 32, '35 / 200', {
      fontSize: '12px', color: '#ccbbaa', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0.5);

    // Progress bar
    const pbGfx = this.add.graphics();
    pbGfx.fillStyle(0x1a1a1a, 1);
    pbGfx.fillRect(54, by + 42, 90, 5);
    pbGfx.fillStyle(0xffaa33, 1);
    pbGfx.fillRect(54, by + 42, 90 * (35 / 200), 5);

    // ── Event info (center) ──
    const ex = SIDE_W + (W - SIDE_W * 2 - 220) / 2 + SIDE_W;
    this.add.text(ex, by + 10, '活動剩餘：23小時', {
      fontSize: '10px', color: '#556677',
    }).setOrigin(0, 0);
    this.add.text(ex, by + 25, '史萊姆 Boss 挑戰', {
      fontSize: '14px', color: '#aabbcc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0, 0);

    // ── Battle button (right) ──
    const battleBtn = this.add.text(W - 110, H - BOT_H / 2, '對  戰', {
      fontSize: '28px',
      color: '#0a0800',
      backgroundColor: '#ffdd00',
      padding: { x: 26, y: 8 },
      stroke: '#bb8800',
      strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    battleBtn.on('pointerover', () => battleBtn.setStyle({ backgroundColor: '#ffe633' }));
    battleBtn.on('pointerout',  () => battleBtn.setStyle({ backgroundColor: '#ffdd00' }));
    battleBtn.on('pointerdown', () => this.scene.start('GameScene'));

    this.tweens.add({
      targets: battleBtn,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }
}
