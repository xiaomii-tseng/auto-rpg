import Phaser from 'phaser';
import { getMonsterDef } from '../data/monster-data';
import { clearBattleSkins, queueBattleAssets } from '../data/scene-assets';
import { t } from '../i18n/i18n';

const DPR = (window as any).__gameDpr as number;
const P = (n: number) => Math.round(n * DPR);
const F = (n: number) => `${Math.round(n * DPR)}px`;

const MIN_DISPLAY_MS = 600;

export class BattleLoadScene extends Phaser.Scene {
  private _gameData: any;

  constructor() { super({ key: 'BattleLoadScene' }); }

  init(data: any): void { this._gameData = data; }

  create(): void {
    const W = this.scale.width, H = this.scale.height;
    const questStar: number = this._gameData?.questStar     ?? 1;
    const bossId:    string = this._gameData?.bossMonsterId ?? '';
    const bossName:  string = getMonsterDef(bossId)?.name   ?? '???';

    // ── Background ───────────────────────────────────────────
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x04040e, 0x04040e, 0x0c0c22, 0x0c0c22, 1);
    bg.fillRect(0, 0, W, H);

    const vig = this.add.graphics();
    for (let i = 0; i < 8; i++) {
      vig.fillStyle(0x000000, 0.06 - i * 0.007);
      vig.fillCircle(W / 2, H / 2, Math.min(W, H) * (0.5 + i * 0.08));
    }

    // ── Stars ────────────────────────────────────────────────
    const starTxt = this.add.text(W / 2, H * 0.30, '★'.repeat(questStar), {
      fontSize: F(28), fontStyle: 'bold',
      color: '#ffd84d', stroke: '#7a4400', strokeThickness: P(3),
      shadow: { offsetX: 0, offsetY: 0, color: '#ffaa00', blur: P(14), fill: true },
    }).setOrigin(0.5).setAlpha(0);

    const labelTxt = this.add.text(W / 2, H * 0.44, 'B O S S', {
      fontSize: F(12), fontStyle: 'bold', color: '#886644', letterSpacing: P(4),
    }).setOrigin(0.5).setAlpha(0);

    const divG = this.add.graphics().setAlpha(0);
    divG.lineStyle(P(1), 0x886644, 0.5);
    divG.lineBetween(W / 2 - P(90), H * 0.44, W / 2 - P(54), H * 0.44);
    divG.lineBetween(W / 2 + P(54), H * 0.44, W / 2 + P(90), H * 0.44);

    const bossNameTxt = this.add.text(W / 2, H * 0.54, bossName, {
      fontSize: F(34), fontStyle: 'bold',
      color: '#ffffff', stroke: '#220000', strokeThickness: P(4),
      shadow: { offsetX: 0, offsetY: 0, color: '#cc3300', blur: P(18), fill: true },
    }).setOrigin(0.5).setAlpha(0);

    // ── Loading bar ──────────────────────────────────────────
    const BAR_W = W * 0.55, BAR_H = P(6);
    const barX = W / 2 - BAR_W / 2, barY = H * 0.78;

    const barBg = this.add.graphics().setAlpha(0);
    barBg.fillStyle(0x111122, 1);
    barBg.fillRoundedRect(barX - P(2), barY - P(2), BAR_W + P(4), BAR_H + P(4), P(4));
    barBg.lineStyle(P(1), 0x443322, 0.7);
    barBg.strokeRoundedRect(barX - P(2), barY - P(2), BAR_W + P(4), BAR_H + P(4), P(4));

    const barFill = this.add.graphics().setAlpha(0);
    const drawBar = (pct: number) => {
      barFill.clear();
      const w = BAR_W * pct;
      if (w < 1) return;
      barFill.fillGradientStyle(0x884400, 0xcc6600, 0xffaa22, 0xff7700, 1);
      barFill.fillRoundedRect(barX, barY, w, BAR_H, P(3));
      barFill.fillStyle(0xffffff, 0.18);
      barFill.fillRoundedRect(barX, barY, w, BAR_H * 0.45, P(2));
    };
    drawBar(0);

    const loadingTxt = this.add.text(W / 2, barY + P(18), t('battle.loading.hint'), {
      fontSize: F(13), color: '#886644',
    }).setOrigin(0.5).setAlpha(0);

    // ── Fade in ──────────────────────────────────────────────
    this.tweens.add({
      targets: [starTxt, labelTxt, divG, bossNameTxt, barBg, barFill, loadingTxt],
      alpha: 1, duration: 400, ease: 'Sine.easeOut',
    });

    // ── Real asset loading ───────────────────────────────────
    const startTime = Date.now();
    const done = () => {
      drawBar(1);
      const wait = Math.max(0, MIN_DISPLAY_MS - (Date.now() - startTime));
      this.time.delayedCall(wait, () => {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          this.scene.start('GameScene', this._gameData);
        });
      });
    };

    clearBattleSkins(this);
    queueBattleAssets(this, this._gameData?.ownSkinId ?? 0, this._gameData?.partnerSkinId ?? 0);
    this.load.on('progress', (v: number) => drawBar(v));
    this.load.once('complete', done);
    this.load.start();

    if (!this.load.isLoading()) done();
  }
}
