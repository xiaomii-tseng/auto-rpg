import Phaser from 'phaser';
import { queueTownAssets } from '../data/scene-assets';

const DPR = (window as any).__gameDpr as number;
const P = (n: number) => Math.round(n * DPR);
const F = (n: number) => `${Math.round(n * DPR)}px`;

const MIN_DISPLAY_MS = 600;

export class TownLoadingScene extends Phaser.Scene {
  constructor() { super({ key: 'TownLoadingScene' }); }

  preload(): void {
    this.load.image('town-loading', 'other/town-loading.png');
  }

  create(): void {
    const W = this.scale.width, H = this.scale.height;

    // ── Background image ─────────────────────────────────────
    const img = this.add.image(W / 2, H / 2, 'town-loading');
    img.setScale(Math.max(W / img.width, H / img.height));

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.52);
    overlay.fillRect(0, 0, W, H);

    const vig = this.add.graphics();
    for (let i = 0; i < 8; i++) {
      vig.fillStyle(0x000000, 0.06 - i * 0.007);
      vig.fillCircle(W / 2, H / 2, Math.min(W, H) * (0.5 + i * 0.08));
    }

    // ── Village label ────────────────────────────────────────
    const labelTxt = this.add.text(W / 2, H * 0.38, 'V I L L A G E', {
      fontSize: F(12), fontStyle: 'bold', color: '#8aaa66', letterSpacing: P(4),
    }).setOrigin(0.5).setAlpha(0);

    const divG = this.add.graphics().setAlpha(0);
    divG.lineStyle(P(1), 0x6a8846, 0.6);
    divG.lineBetween(W / 2 - P(106), H * 0.38, W / 2 - P(66), H * 0.38);
    divG.lineBetween(W / 2 + P(66),  H * 0.38, W / 2 + P(106), H * 0.38);

    const nameTxt = this.add.text(W / 2, H * 0.48, '亞特', {
      fontSize: F(38), fontStyle: 'bold',
      color: '#e8d4a0', stroke: '#1a1000', strokeThickness: P(4),
      shadow: { offsetX: 0, offsetY: 0, color: '#7a5c20', blur: P(20), fill: true },
    }).setOrigin(0.5).setAlpha(0);

    // ── Loading bar ──────────────────────────────────────────
    const BAR_W = W * 0.55, BAR_H = P(6);
    const barX = W / 2 - BAR_W / 2, barY = H * 0.78;

    const barBg = this.add.graphics().setAlpha(0);
    barBg.fillStyle(0x111108, 1);
    barBg.fillRoundedRect(barX - P(2), barY - P(2), BAR_W + P(4), BAR_H + P(4), P(4));
    barBg.lineStyle(P(1), 0x443c22, 0.7);
    barBg.strokeRoundedRect(barX - P(2), barY - P(2), BAR_W + P(4), BAR_H + P(4), P(4));

    const barFill = this.add.graphics().setAlpha(0);
    const drawBar = (pct: number) => {
      barFill.clear();
      const w = BAR_W * pct;
      if (w < 1) return;
      barFill.fillGradientStyle(0x3a6614, 0x5a9620, 0x8dc84a, 0x60a828, 1);
      barFill.fillRoundedRect(barX, barY, w, BAR_H, P(3));
      barFill.fillStyle(0xffffff, 0.15);
      barFill.fillRoundedRect(barX, barY, w, BAR_H * 0.45, P(2));
    };
    drawBar(0);

    const loadingTxt = this.add.text(W / 2, barY + P(18), '進入亞特…', {
      fontSize: F(13), color: '#7a9c55',
    }).setOrigin(0.5).setAlpha(0);

    // ── Fade in ──────────────────────────────────────────────
    this.tweens.add({
      targets: [labelTxt, divG, nameTxt, barBg, barFill, loadingTxt],
      alpha: 1, duration: 400, ease: 'Sine.easeOut',
    });

    // ── Real asset loading ───────────────────────────────────
    const startTime = Date.now();
    const done = () => {
      drawBar(1);
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startTime));
      this.time.delayedCall(wait, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('PrepScene'));
      });
    };

    queueTownAssets(this);
    this.load.on('progress', (v: number) => drawBar(v));
    this.load.once('complete', done);
    this.load.start();

    // If nothing queued (all cached), complete fires synchronously before the listener → call manually
    if (!this.load.isLoading()) done();
  }
}
