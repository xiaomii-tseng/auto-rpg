import Phaser from 'phaser';
import { InventoryStore } from '../data/inventory-store';
import { PlayerStore } from '../data/player-store';
import { PotionBarStore } from '../data/potion-bar-store';
import { ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L, ITEM_POTION_REVIVE } from '../data/monster-data';
import { generateEquipment, randomQuality, QUALITY_NAMES, QUALITY_COLORS, SLOT_NAMES, STAT_NAMES, BEHAVIOR_NAMES, BEHAVIOR_INFO, EquipSlot, EquipmentItem, applyEnhancement, revertEnhancement, ENHANCE_COST, ENHANCE_RATE, ENHANCE_COMPLETE_BONUS, ENHANCE_DEMOTE_FROM, ENHANCE_MAX } from '../data/equipment-data';
import { SaveStore } from '../data/save-store';
import { CardStore, CARD_SLOT_COUNT } from '../data/card-store';

import { getCardDef, getMonsterDef, monsterCardScale, monsterDetailScale } from '../data/monster-data';
import { QuestStore, Quest, STAR_EQUIP_QUALITY, getStarWeights } from '../data/quest-store';
import { NetworkService } from '../network/network.service';
import { SkinStore, SKINS } from '../data/skin-store';


const DPR = (window as any).__gameDpr as number;
const F = (n: number): string => `${Math.round(n * DPR)}px`;
const P = (n: number): number => Math.round(n * DPR);

const TOP_H  = P(52);

// Wood palette
const WB  = 0x140a02; // base (near-black)
const WD  = 0x2a1408; // dark wood
const WM  = 0x4a2814; // medium dark
const WMI = 0x5c3418; // medium
const WL  = 0x8b5e3c; // light wood
const WH  = 0xb07030; // highlight grain
const GOLD = 0xd4a044;
const IRON = 0x4a5560;

export function getPlayerName(): string {
  let name = localStorage.getItem('playerName');
  if (!name) {
    name = '勇者' + String(Math.floor(Math.random() * 900) + 100);
    localStorage.setItem('playerName', name);
  }
  return name;
}
export function setPlayerName(name: string): void {
  localStorage.setItem('playerName', name.slice(0, 8));
}

export class PrepScene extends Phaser.Scene {
  private goldText!:       Phaser.GameObjects.Text;
  private playerNameTxt?:  Phaser.GameObjects.Text;
  private multiMode     = false;
  private multiRoomNick = '';

  static fmtGold(n: number): string {
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}億`;
    if (n >= 10_000)      return `${(n / 10_000).toFixed(1)}萬`;
    return n.toLocaleString();
  }

  constructor() {
    super({ key: 'PrepScene' });
  }

  preload(): void {
    const cfg = { frameWidth: 64, frameHeight: 64 };
    const _skin = SKINS[SkinStore.get()];
    if (!this.textures.exists('player_idle_shadow'))
      this.load.spritesheet('player_idle_shadow', `${_skin.folder}/${_skin.prefix}_Idle_with_shadow.png`, cfg);
    // Load all skin idle previews for wardrobe panel
    SKINS.forEach((s, i) => {
      const key = `skin_preview_${i}`;
      if (!this.textures.exists(key))
        this.load.spritesheet(key, `${s.folder}/${s.prefix}_Idle_with_shadow.png`, cfg);
    });
    if (!this.textures.exists('bg_prep'))
      this.load.image('bg_prep', 'other/bg1.png');
    if (!this.textures.exists('icon_fight'))
      this.load.image('icon_fight', 'other/fight.webp');
    if (!this.textures.exists('icon_coin'))
      this.load.image('icon_coin', 'other/coin.webp');
    ['hat','outfit','shoes','ring','sword'].forEach(cat => {
      for (let i = 1; i <= 5; i++) {
        const key = `equip_${cat}${i}`;
        if (!this.textures.exists(key))
          this.load.image(key, `equip/${cat}${i}.webp`);
      }
    });
    // Boss idle sprites for quest panel
    const bossSprites: [string, string][] = [
      ['slime_idle',  'sprite/slime/PNG/Slime1/With_shadow/Slime1_Idle_with_shadow.png'],
      ['slime2_idle', 'sprite/slime/PNG/Slime2/With_shadow/Slime2_Idle_with_shadow.png'],
      ['slime3_idle', 'sprite/slime/PNG/Slime3/With_shadow/Slime3_Idle_with_shadow.png'],
      ['plant3_idle', 'sprite/flower/PNG/Plant3/With_shadow/Plant3_Idle_with_shadow.png'],
    ];
    bossSprites.forEach(([key, path]) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, path, cfg);
    });
    if (!this.textures.exists('icon_stone_broken'))     this.load.image('icon_stone_broken',     'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact'))     this.load.image('icon_stone_intact',     'other/ore1.webp');
    if (!this.textures.exists('icon_stone_guard'))      this.load.image('icon_stone_guard',      'other/ore3.webp');
    if (!this.textures.exists('icon_quest_reroll'))     this.load.image('icon_quest_reroll',     'other/ore4.webp');
    if (!this.textures.exists('icon_potion_health_s'))  this.load.image('icon_potion_health_s',  'other/coin.webp');
    if (!this.textures.exists('icon_potion_health_m'))  this.load.image('icon_potion_health_m',  'other/coin.webp');
    if (!this.textures.exists('icon_potion_health_l'))  this.load.image('icon_potion_health_l',  'other/coin.webp');
    if (!this.textures.exists('icon_potion_revive'))    this.load.image('icon_potion_revive',    'other/coin.webp');
    if (!this.textures.exists('icon_gold'))          this.load.image('icon_gold',          'other/coin.webp');
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    // 瀏覽器執行時嘗試觸控觸發全螢幕；PWA 已由 manifest 處理，失敗時靜默忽略
    if (!this.scale.isFullscreen) {
      this.input.once('pointerdown', () => {
        try {
          if (!this.scale.isFullscreen) this.scale.startFullscreen();
        } catch { /* PWA manifest fullscreen 已接管，忽略 */ }
      });
    }

    const hasSave = SaveStore.load();
    if (!hasSave) {
      // 新玩家：隨機送一把普通品質武器
      const startSword = generateEquipment('sword', 'normal');
      PlayerStore.equipDirect('sword', startSword);
      InventoryStore.addGold(100);
      InventoryStore.addItem('quest_reroll', '任務重製石', 10);
    }

    this.generateItemIcons();

    // Always rebuild so frames reference the currently loaded texture (texture may have been
    // removed and reloaded by GameScene between visits to PrepScene)
    if (this.anims.exists('player_idle_shadow')) this.anims.remove('player_idle_shadow');
    this.anims.create({
      key: 'player_idle_shadow',
      frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }),
      frameRate: 5,
      repeat: 0,
    });

    this.drawBackground(W, H);
    this.drawTopBar(W);
    this.drawCenterHero(W, H);
    this.drawBottomNav(W, H);
    this.drawAmbientParticles(W, H);

    const onGoldChange = () => {
      this.goldText?.setText(InventoryStore.getGold().toLocaleString());
    };
    InventoryStore.onChange(onGoldChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => InventoryStore.offChange(onGoldChange));

    // Auto-save on any store change
    const autoSave = () => SaveStore.save();
    PlayerStore.onChange(autoSave);
    InventoryStore.onChange(autoSave);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      PlayerStore.offChange(autoSave);
      InventoryStore.offChange(autoSave);
    });
  }

  // ── Item icon textures (shared with GameScene) ──────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateItemIcons(): void {
    const mk = (fn: (g: Phaser.GameObjects.Graphics) => void, key: string, sz = 32) => {
      if (this.textures.exists(key)) return;
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      fn(g);
      g.generateTexture(key, sz, sz);
      g.destroy();
    };

    mk(g => {
      g.fillStyle(0x44cc44, 1); g.fillCircle(16, 18, 13);
      g.fillStyle(0x22aa22, 1); g.fillCircle(10, 22, 8); g.fillCircle(22, 22, 8);
      g.fillStyle(0x88ff88, 0.5); g.fillCircle(12, 12, 5);
    }, 'icon_slime_chunk');

    mk(g => {
      g.fillStyle(0x44ddaa, 1); g.fillCircle(16, 20, 10);
      g.fillStyle(0x22bbaa, 1); g.fillTriangle(16, 4, 8, 20, 24, 20);
      g.fillStyle(0xaaffee, 0.6); g.fillCircle(13, 14, 4);
    }, 'icon_slime_essence');

    // icon_gold 已在 preload 以真實圖片載入
  }

  // ── Background ──────────────────────────────────────────

  private drawBackground(W: number, H: number): void {
    const img = this.add.image(W / 2, H / 2 - 60, 'bg_prep');
    img.setDisplaySize(W, H).setOrigin(0.5);

    // Dark overlay
    const ov = this.add.graphics();
    ov.fillStyle(0x000000, 0.15);
    ov.fillRect(0, 0, W, H);

    // Vignette — top, bottom, left, right edges
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0);
    vig.fillRect(0, 0, W, H / 3);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.55, 0.55);
    vig.fillRect(0, H * 0.65, W, H * 0.35);
    // Side vignettes
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    vig.fillRect(0, 0, W * 0.18, H);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    vig.fillRect(W * 0.82, 0, W * 0.18, H);

    // Warm ground light pool — where the hero stands
    const heroPoolY = H * 0.58;
    const pool = this.add.graphics().setDepth(2);
    pool.fillStyle(0xff6622, 0.07);
    pool.fillEllipse(W / 2, heroPoolY, W * 0.55, H * 0.22);
    pool.fillStyle(0xff9944, 0.04);
    pool.fillEllipse(W / 2, heroPoolY, W * 0.75, H * 0.30);
    this.tweens.add({
      targets: pool, alpha: { from: 0.8, to: 1.15 },
      duration: 2800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // ── Top bar (wooden beam) ───────────────────────────────

  private drawTopBar(W: number): void {
    const CY    = TOP_H / 2;
    const AV_R     = P(19);   // avatar radius
    const AV_CX = P(8) + AV_R;
    const AV_CY = CY;
    const SET_W    = P(36);
    const SET_X = W - SET_W - P(5);

    // Name block width ~90px, then EXP bar fills to settings
    const nameBlockW = P(90);
    const EXP_X0     = AV_CX + AV_R + P(10) + nameBlockW + P(8);
    const EXP_X1     = SET_X - P(8);
    const EXP_BAR_H = P(9);
    const EXP_BAR_Y  = CY + P(9);

    // ── Bar background ────────────────────────────────────
    const gfx = this.add.graphics();
    gfx.fillStyle(0x180a02, 1);
    gfx.fillRect(0, 0, W, TOP_H);
    // Subtle top highlight
    gfx.fillStyle(0xffd060, 0.12);
    gfx.fillRect(0, 0, W, 2);
    // Bottom gold ledge
    gfx.fillStyle(GOLD, 0.7);
    gfx.fillRect(0, TOP_H - 2, W, 1);
    gfx.fillStyle(WB, 1);
    gfx.fillRect(0, TOP_H - 1, W, 1);

    // ── Avatar (circle) ───────────────────────────────────
    const avG = this.add.graphics();
    // Outer gold ring glow
    avG.fillStyle(GOLD, 0.25);
    avG.fillCircle(AV_CX, AV_CY, AV_R + P(4));
    // Body
    avG.fillStyle(WM, 1);
    avG.fillCircle(AV_CX, AV_CY, AV_R);
    // Inner top highlight
    avG.fillStyle(0xffffff, 0.08);
    avG.fillCircle(AV_CX - P(3), AV_CY - P(5), AV_R * 0.55);
    // Gold ring border
    avG.lineStyle(2.5, GOLD, 0.9);
    avG.strokeCircle(AV_CX, AV_CY, AV_R);
    avG.lineStyle(1, 0xffe8a0, 0.3);
    avG.strokeCircle(AV_CX, AV_CY, AV_R - P(4));

    this.add.text(AV_CX, AV_CY + 1, '勇', {
      fontSize: F(15), fontStyle: 'bold',
      color: '#ffe0a0', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── Name + Lv stacked ─────────────────────────────────
    const nameX = AV_CX + AV_R + P(10);
    this.playerNameTxt = this.add.text(nameX, CY - P(8), getPlayerName(), {
      fontSize: F(15), fontStyle: 'bold',
      color: '#ffe8b0', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0, 0.5);
    // Hit zone for name editing
    const nameHit = this.add.rectangle(nameX + P(45), CY - P(8), P(90), P(22))
      .setInteractive({ useHandCursor: true }).setDepth(30);
    nameHit.on('pointerdown', () => this.showNameEditDialog(W, this.scale.height));

    const lvLabel = this.add.text(nameX, CY + P(9), '', {
      fontSize: F(15), fontStyle: 'bold', color: '#c8a050', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);

    // ── EXP bar ───────────────────────────────────────────
    const expBarW   = EXP_X1 - EXP_X0;
    const expTrack  = this.add.graphics();
    // Track shadow
    expTrack.fillStyle(0x000000, 0.5);
    expTrack.fillRoundedRect(EXP_X0, EXP_BAR_Y - EXP_BAR_H / 2 + 1, expBarW, EXP_BAR_H, P(4));
    // Track bg — dark wood
    expTrack.fillStyle(0x160c02, 1);
    expTrack.fillRoundedRect(EXP_X0, EXP_BAR_Y - EXP_BAR_H / 2, expBarW, EXP_BAR_H, P(4));
    expTrack.lineStyle(1, GOLD, 0.35);
    expTrack.strokeRoundedRect(EXP_X0, EXP_BAR_Y - EXP_BAR_H / 2, expBarW, EXP_BAR_H, P(4));
    // EXP label above bar
    this.add.text(EXP_X0 + expBarW / 2, EXP_BAR_Y - EXP_BAR_H / 2 - P(5), 'EXP', {
      fontSize: F(15), fontStyle: 'bold', color: '#c8a050', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 1);

    const expFillGfx = this.add.graphics();

    // ── Gold badge (below topbar, right-aligned, fixed width) ──
    const BADGE_W  = P(154);
    const BADGE_H  = P(28);
    const BADGE_Y  = TOP_H + P(4);
    const BADGE_X  = W - BADGE_W - P(4);   // left edge

    const goldBg = this.add.graphics().setDepth(5);
    goldBg.fillStyle(0x0e0600, 0.9);
    goldBg.fillRoundedRect(BADGE_X, BADGE_Y, BADGE_W, BADGE_H, { tl: 0, tr: 0, bl: 10, br: 10 });
    goldBg.lineStyle(1.5, GOLD, 0.55);
    goldBg.strokeRoundedRect(BADGE_X, BADGE_Y, BADGE_W, BADGE_H, { tl: 0, tr: 0, bl: 10, br: 10 });
    goldBg.fillStyle(GOLD, 0.18);
    goldBg.fillRect(BADGE_X, BADGE_Y, BADGE_W, 2);

    const ICON_X = BADGE_X + P(16);
    const TXT_CY = BADGE_Y + BADGE_H / 2;
    this.add.image(ICON_X, TXT_CY, 'icon_coin').setDisplaySize(P(20), P(20)).setDepth(6);
    this.goldText = this.add.text(ICON_X + P(14), TXT_CY,
      InventoryStore.getGold().toLocaleString(), {
        fontSize: F(15), fontStyle: 'bold',
        color: '#f0d090', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5).setDepth(6);

    // ── Settings button ───────────────────────────────────
    const sg = this.add.graphics();
    sg.fillStyle(WM, 1);
    sg.fillRoundedRect(SET_X, CY - P(15), SET_W, P(30), P(6));
    sg.lineStyle(1.5, WL, 0.6);
    sg.strokeRoundedRect(SET_X, CY - P(15), SET_W, P(30), P(6));
    sg.fillStyle(GOLD, 0.18);
    sg.fillRoundedRect(SET_X, CY - P(15), SET_W, P(8), { tl: P(6), tr: P(6), bl: 0, br: 0 });
    this.add.text(SET_X + SET_W / 2, CY + P(1), '≡', {
      fontSize: F(22), fontStyle: 'bold', color: '#d4a050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5);

    // ── Reactive update ───────────────────────────────────
    const drawExpBar = () => {
      const cur  = PlayerStore.getExp();
      const need = PlayerStore.expToNext();
      const pct  = Phaser.Math.Clamp(cur / need, 0, 1);

      expFillGfx.clear();
      if (pct > 0) {
        const fillW = Math.max(5, (expBarW - 2) * pct);
        // Main fill — amber
        expFillGfx.fillStyle(0xc87020, 1);
        expFillGfx.fillRoundedRect(EXP_X0 + 1, EXP_BAR_Y - EXP_BAR_H / 2 + 1, fillW, EXP_BAR_H - 2, P(3));
        // Top gloss — bright gold
        expFillGfx.fillStyle(0xffcc44, 0.45);
        expFillGfx.fillRoundedRect(EXP_X0 + 1, EXP_BAR_Y - EXP_BAR_H / 2 + 1, fillW, P(4), { tl: P(3), tr: P(3), bl: 0, br: 0 });
        // Edge glow — amber
        expFillGfx.fillStyle(0xffaa22, 0.6);
        expFillGfx.fillRect(EXP_X0 + fillW - 2, EXP_BAR_Y - EXP_BAR_H / 2 + 2, P(3), EXP_BAR_H - P(4));
      }
      lvLabel.setText(`Lv.${PlayerStore.getLevel()}`);
    };
    drawExpBar();

    PlayerStore.onChange(drawExpBar);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PlayerStore.offChange(drawExpBar));
  }

  // ── Bottom navigation bar ──────────────────────────────

  private drawBottomNav(W: number, H: number): void {
    const BAR_H = P(78);
    const barY  = H - BAR_H;
    const gfx   = this.add.graphics().setDepth(20);

    // Bar background — two-tone: slightly lighter strip at top
    gfx.fillStyle(0x0e0806, 1);
    gfx.fillRect(0, barY, W, BAR_H);
    gfx.fillStyle(0x1c1008, 1);
    gfx.fillRect(0, barY, W, P(14));

    // Gold top border (2 lines: bright + dark)
    gfx.fillStyle(0xffd060, 0.7);
    gfx.fillRect(0, barY, W, 1);
    gfx.fillStyle(0x8b5010, 0.5);
    gfx.fillRect(0, barY + 1, W, 2);

    // Bottom fade-out hint
    gfx.fillStyle(0x000000, 0.3);
    gfx.fillRect(0, barY + BAR_H - P(6), W, P(6));

    // ── Battle button constants (needed for gap calc) ─────
    const BTN_W    = P(100);
    const BTN_H    = P(68);
    const cx       = W / 2;
    const bcy      = barY + BAR_H / 2;   // centred in bar
    const CENTER_R = BTN_W / 2 + P(28);   // half of no-draw zone on each side

    // ── Platform arch under battle button ─────────────────
    const archGfx = this.add.graphics().setDepth(21);
    const archW = (CENTER_R + P(2)) * 2;
    const archX = cx - CENTER_R - P(2);
    // Outer shadow
    archGfx.fillStyle(0x000000, 0.4);
    archGfx.fillRoundedRect(archX + P(2), barY, archW, BAR_H + P(4), { tl: P(20), tr: P(20), bl: 0, br: 0 });
    // Body
    archGfx.fillStyle(0x1c0e04, 1);
    archGfx.fillRoundedRect(archX, barY - P(2), archW, BAR_H + P(4), { tl: P(20), tr: P(20), bl: 0, br: 0 });
    // Inner top highlight
    archGfx.fillStyle(0xffffff, 0.04);
    archGfx.fillRoundedRect(archX + P(2), barY - P(2), archW - P(4), P(10), { tl: P(18), tr: P(18), bl: 0, br: 0 });
    // Gold arc top
    archGfx.fillStyle(GOLD, 0.75);
    archGfx.fillRoundedRect(archX, barY - P(2), archW, P(2), { tl: P(20), tr: P(20), bl: 0, br: 0 });
    // Gold border sides
    archGfx.lineStyle(1.5, GOLD, 0.45);
    archGfx.strokeRoundedRect(archX, barY - P(2), archW, BAR_H + P(4), { tl: P(20), tr: P(20), bl: 0, br: 0 });

    // ── Nav buttons ──────────────────────────────────────
    const navItems: { label: string; icon: string; accent: number; onClick: () => void }[] = [
      { label: '裝備', icon: '⚔',  accent: 0xaa88cc,  onClick: () => this.showEquipmentPanel(W, H) },
      { label: '卡片', icon: '♦',  accent: 0xcc6688,  onClick: () => this.openCardWindow(W, H) },
      { label: '物品', icon: '⊕',  accent: 0x70b858,  onClick: () => this.showItemPanel(W, H) },
      { label: '商店', icon: '✦',  accent: 0xd47820,  onClick: () => this.showShopPanel(W, H) },
    ];

    // Each side has two buttons occupying the space outside CENTER_R
    const sideW  = cx - CENTER_R;           // available width per side
    const slotW  = sideW / 2;
    const btnH   = BAR_H - P(8);
    const btnSlots = [
      slotW * 0.5,
      slotW * 1.5,
      W - slotW * 1.5,
      W - slotW * 0.5,
    ];

    navItems.forEach((item, pos) => {
      const bx = btnSlots[pos];
      const by = barY + btnH / 2 + P(4);
      this.addNavBtn(gfx, bx, by, slotW - P(6), btnH, item.icon, item.label, item.accent, item.onClick);
    });

    // ── Battle button (center, elevated) ──────────────────
    const btng = this.add.graphics().setDepth(22);

    // Edge glow — single thin outward stroke
    const EX = cx - BTN_W / 2, EY = bcy - BTN_H / 2;
    btng.lineStyle(4, 0xffcc44, 0.6);
    btng.strokeRoundedRect(EX - P(3), EY - P(3), BTN_W + P(6), BTN_H + P(6), P(17));

    // Button drop shadow
    btng.fillStyle(0x000000, 0.5);
    btng.fillRoundedRect(cx - BTN_W / 2 + P(4), bcy - BTN_H / 2 + P(6), BTN_W, BTN_H, P(14));

    // Main body
    btng.fillStyle(0xb83800, 1);
    btng.fillRoundedRect(cx - BTN_W / 2, bcy - BTN_H / 2, BTN_W, BTN_H, P(14));

    // Top highlight (lighter gradient band)
    btng.fillStyle(0xff7722, 1);
    btng.fillRoundedRect(cx - BTN_W / 2 + P(2), bcy - BTN_H / 2 + P(2), BTN_W - P(4), BTN_H * 0.5, P(12));

    // Specular gleam top-left
    btng.fillStyle(0xffffff, 0.10);
    btng.fillRoundedRect(cx - BTN_W / 2 + P(6), bcy - BTN_H / 2 + P(5), BTN_W * 0.4, P(8), P(4));

    // Outer gold border
    btng.lineStyle(3, 0xffcc44, 1);
    btng.strokeRoundedRect(cx - BTN_W / 2, bcy - BTN_H / 2, BTN_W, BTN_H, P(14));

    // Inner bright ring
    btng.lineStyle(1, 0xffee88, 0.55);
    btng.strokeRoundedRect(cx - BTN_W / 2 + P(3), bcy - BTN_H / 2 + P(3), BTN_W - P(6), BTN_H - P(6), P(11));

    // Shimmer scan bar — masked to button shape
    const maskShape = this.add.graphics().setVisible(false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRoundedRect(EX, EY, BTN_W, BTN_H, 14);

    const shimmerGfx = this.add.graphics().setDepth(22.5);
    shimmerGfx.setMask(maskShape.createGeometryMask());

    const sh = { p: -0.25 };
    this.tweens.add({
      targets: sh, p: 1.25,
      duration: 1600, repeat: -1, repeatDelay: 1200, ease: 'Sine.easeIn',
      onUpdate: () => {
        shimmerGfx.clear();
        const sx = EX + sh.p * BTN_W;
        shimmerGfx.fillStyle(0xffffff, 0.04);
        shimmerGfx.fillRect(sx - P(14), EY, P(14), BTN_H);
        shimmerGfx.fillStyle(0xffffff, 0.16);
        shimmerGfx.fillRect(sx,         EY, P(14), BTN_H);
        shimmerGfx.fillStyle(0xffffff, 0.04);
        shimmerGfx.fillRect(sx + P(14), EY, P(14), BTN_H);
      },
    });

    // Container at button center — safe to scale (scales from its own origin)
    const btnCnt = this.add.container(cx, bcy).setDepth(23);

    const fightIcon = this.add.image(0, -P(10), 'icon_fight').setDisplaySize(P(36), P(36));
    const battleTxt = this.add.text(0, P(20), '出  戰', {
      fontSize: F(17), fontStyle: 'bold',
      color: '#fff8e0', stroke: '#6b1800', strokeThickness: 3,
    }).setOrigin(0.5);
    btnCnt.add([fightIcon, battleTxt]);

    // Idle alpha pulse (btng separately — Graphics must NOT be scaled)
    this.tweens.add({
      targets: [btng, btnCnt],
      alpha: { from: 1, to: 0.82 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });

    const battleHit = this.add.rectangle(cx, bcy, BTN_W, BTN_H)
      .setInteractive({ useHandCursor: true })
      .setDepth(24);

    battleHit.on('pointerdown', () => {
      this.tweens.killTweensOf([btng, btnCnt]);
      this.tweens.add({ targets: btnCnt, scaleX: 0.88, scaleY: 0.88, alpha: 0.85, duration: 80, ease: 'Sine.easeOut' });
      this.tweens.add({ targets: btng,   alpha: 0.85, duration: 80 });
      if (this.multiMode) {
        this.showRoomPanel(W, H);
      } else {
        this.showQuestPanel(W, H);
      }
    });

    battleHit.on('pointerup', () => {
      this.tweens.killTweensOf([btng, btnCnt]);
      this.tweens.add({ targets: btnCnt, scaleX: 1, scaleY: 1, alpha: 1, duration: 120, ease: 'Back.easeOut' });
      this.tweens.add({ targets: btng,   alpha: 1, duration: 120 });
    });

    // ── Single / Multi toggle above battle button ─────────
    const toggleY  = barY - P(24);
    const halfTW   = P(64);
    const tH       = P(30);
    const tGap     = P(8);
    const toggleGfx = this.add.graphics().setDepth(25);

    const drawToggle = () => {
      toggleGfx.clear();
      const colors  = [0x1e0e06, 0x1e0e06] as const;
      const active  = [!this.multiMode, this.multiMode];
      for (let i = 0; i < 2; i++) {
        const tx = cx - tGap / 2 - halfTW + i * (halfTW * 2 + tGap);
        toggleGfx.fillStyle(active[i] ? 0xb83800 : colors[i], 1);
        toggleGfx.fillRoundedRect(tx - halfTW, toggleY - tH / 2, halfTW * 2, tH, P(6));
        toggleGfx.lineStyle(1.5, active[i] ? 0xffcc44 : 0x4a2e14, 1);
        toggleGfx.strokeRoundedRect(tx - halfTW, toggleY - tH / 2, halfTW * 2, tH, P(6));
      }
    };
    drawToggle();

    const toggleTexts = ['⚔ 單人', '⚑ 雙人'].map((label, i) => {
      const tx = cx - tGap / 2 - halfTW + i * (halfTW * 2 + tGap);
      return this.add.text(tx, toggleY, label, {
        fontSize: F(15), fontStyle: 'bold',
        color: '#e8cc90', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(26);
    });

    for (let i = 0; i < 2; i++) {
      const tx = cx - tGap / 2 - halfTW + i * (halfTW * 2 + tGap);
      this.add.rectangle(tx, toggleY, halfTW * 2, tH)
        .setInteractive({ useHandCursor: true }).setDepth(27)
        .on('pointerdown', () => {
          this.multiMode = i === 1;
          drawToggle();
          toggleTexts.forEach((t, j) => t.setColor(this.multiMode === (j === 1) ? '#ffffff' : '#e8cc90'));
        });
    }

    // ── Wardrobe button (bottom-left, above nav bar) ─────────
    const skinBtnW = P(72);
    const skinBtnH = P(26);
    const skinBtnX = P(10) + skinBtnW / 2;
    const skinBtnY = barY - P(24);
    const skinGfx  = this.add.graphics().setDepth(25);
    const drawSkinBtn = () => {
      skinGfx.clear();
      skinGfx.fillStyle(0x000000, 0.35);
      skinGfx.fillRoundedRect(skinBtnX - skinBtnW / 2 + P(2), skinBtnY - skinBtnH / 2 + P(2), skinBtnW, skinBtnH, P(5));
      skinGfx.fillStyle(0x1a0e04, 1);
      skinGfx.fillRoundedRect(skinBtnX - skinBtnW / 2, skinBtnY - skinBtnH / 2, skinBtnW, skinBtnH, P(5));
      skinGfx.lineStyle(1.5, 0x886622, 0.8);
      skinGfx.strokeRoundedRect(skinBtnX - skinBtnW / 2, skinBtnY - skinBtnH / 2, skinBtnW, skinBtnH, P(5));
    };
    drawSkinBtn();
    const skinLabel = this.add.text(skinBtnX, skinBtnY, '造型', {
      fontSize: F(13), color: '#d4a044',
    }).setOrigin(0.5).setDepth(26);

    const openWardrobePanel = () => {
      const PD    = 30;
      const COLS  = 2;
      const CARD_W = P(100), CARD_H = P(110);
      const GAP   = P(12);
      const panelW = COLS * CARD_W + (COLS + 1) * GAP;
      const panelH = Math.ceil(SKINS.length / COLS) * (CARD_H + GAP) + GAP + P(PD);
      const px = W / 2, py = barY - panelH / 2 - P(8);
      const wardObjs: Phaser.GameObjects.GameObject[] = [];
      const bg = this.add.graphics().setDepth(60);
      bg.fillStyle(0x000000, 0.55);
      bg.fillRect(0, 0, W, H);
      bg.fillStyle(0x1a0e04, 1);
      bg.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, P(12));
      bg.lineStyle(1.5, 0xffd060, 0.6);
      bg.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, P(12));
      wardObjs.push(bg);
      const title = this.add.text(px, py - panelH / 2 + P(14), '選擇造型', {
        fontSize: F(14), color: '#ffd060', fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(61);
      wardObjs.push(title);
      const currentSkin = SkinStore.get();
      SKINS.forEach((skin, i) => {
        const col   = i % COLS;
        const row   = Math.floor(i / COLS);
        const cx    = px - panelW / 2 + GAP + col * (CARD_W + GAP) + CARD_W / 2;
        const cy    = py - panelH / 2 + P(PD) + GAP + row * (CARD_H + GAP) + CARD_H / 2;
        const isSelected = i === currentSkin;
        const cardGfx = this.add.graphics().setDepth(61);
        const drawCard = (hover: boolean) => {
          cardGfx.clear();
          cardGfx.fillStyle(isSelected ? 0x3a2200 : (hover ? 0x2a1800 : 0x0e0806), 1);
          cardGfx.fillRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, P(8));
          cardGfx.lineStyle(1.5, isSelected ? 0xffd060 : (hover ? 0xaa7722 : 0x554422), isSelected ? 1 : 0.7);
          cardGfx.strokeRoundedRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H, P(8));
        };
        drawCard(false);
        wardObjs.push(cardGfx);
        const previewKey = `skin_preview_${i}`;
        const sp = this.add.sprite(cx, cy - P(14), previewKey)
          .setScale(1.6 * DPR).setDepth(62).setFrame(0);
        wardObjs.push(sp);
        const lbl = this.add.text(cx, cy + CARD_H / 2 - P(18), skin.label, {
          fontSize: F(11), color: isSelected ? '#ffd060' : '#c8a060',
        }).setOrigin(0.5).setDepth(62);
        wardObjs.push(lbl);
        const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H)
          .setInteractive({ useHandCursor: true }).setDepth(63);
        wardObjs.push(hit);
        hit.on('pointerover',  () => { if (!isSelected) drawCard(true); });
        hit.on('pointerout',   () => { if (!isSelected) drawCard(false); });
        hit.on('pointerdown',  () => {
          wardObjs.forEach(o => o.destroy());
          if (i !== currentSkin) {
            SkinStore.set(i);
            if (this.textures.exists('player_idle_shadow')) this.textures.remove('player_idle_shadow');
            if (this.anims.exists('player_idle_shadow'))    this.anims.remove('player_idle_shadow');
            if (this.anims.exists('_lobby_idle'))           this.anims.remove('_lobby_idle');
            this.scene.restart();
          }
        });
      });
      // Close on backdrop click
      const closeBg = this.add.rectangle(W / 2, H / 2, W, H)
        .setInteractive().setDepth(59).setAlpha(0.001);
      wardObjs.push(closeBg);
      closeBg.on('pointerdown', () => wardObjs.forEach(o => o.destroy()));
    };

    this.add.rectangle(skinBtnX, skinBtnY, skinBtnW, skinBtnH)
      .setInteractive({ useHandCursor: true }).setDepth(27)
      .on('pointerdown', () => openWardrobePanel())
      .on('pointerover',  () => { skinLabel.setColor('#ffe080'); })
      .on('pointerout',   () => { skinLabel.setColor('#d4a044'); });

    battleHit.on('pointerover', () => {
      this.tweens.killTweensOf([btng, btnCnt]);
      this.tweens.add({ targets: btnCnt, scaleX: 1.08, scaleY: 1.08, alpha: 1, duration: 150, ease: 'Back.easeOut' });
      this.tweens.add({ targets: btng,   alpha: 1, duration: 150 });
    });

    battleHit.on('pointerout', () => {
      this.tweens.killTweensOf([btng, btnCnt]);
      this.tweens.add({
        targets: btnCnt, scaleX: 1, scaleY: 1, duration: 120, ease: 'Sine.easeOut',
        onComplete: () => {
          this.tweens.add({ targets: [btng, btnCnt], alpha: { from: 1, to: 0.82 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        },
      });
    });
  }

  private addNavBtn(
    gfx: Phaser.GameObjects.Graphics,
    x: number, y: number, w: number, h: number,
    icon: string, label: string, _accent: number, onClick: () => void,
  ): void {
    const halfW = w / 2;
    const halfH = h / 2;

    // Drop shadow
    gfx.fillStyle(0x000000, 0.4);
    gfx.fillRoundedRect(x - halfW + P(2), y - halfH + P(3), w, h, P(8));

    // Wood base
    gfx.fillStyle(0x1e0e06, 1);
    gfx.fillRoundedRect(x - halfW, y - halfH, w, h, P(8));

    // Wood grain — inner lighter panel
    gfx.fillStyle(0x2e1a0a, 1);
    gfx.fillRoundedRect(x - halfW + P(1), y - halfH + P(1), w - P(2), h - P(2), P(7));

    // Top edge highlight
    gfx.fillStyle(0x4a2e14, 0.7);
    gfx.fillRoundedRect(x - halfW + P(2), y - halfH + P(2), w - P(4), h * 0.42, { tl: P(6), tr: P(6), bl: 0, br: 0 });

    // Outer aged-gold border
    gfx.lineStyle(1.5, GOLD, 0.75);
    gfx.strokeRoundedRect(x - halfW, y - halfH, w, h, P(8));

    // Inner highlight border
    gfx.lineStyle(0.5, 0xffd080, 0.22);
    gfx.strokeRoundedRect(x - halfW + P(2), y - halfH + P(2), w - P(4), h - P(4), P(6));

    // Icon glyph — warm gold
    this.add.text(x, y - P(10), icon, {
      fontSize: F(18), fontStyle: 'bold', color: '#ffd060',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(21);

    // Label — parchment
    this.add.text(x, y + P(13), label, {
      fontSize: F(15), fontStyle: 'bold',
      color: '#e8cc90', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(21);

    const hit = this.add.rectangle(x, y, w, h)
      .setInteractive({ useHandCursor: true })
      .setDepth(22);

    hit.on('pointerdown', () => {
      this.tweens.add({ targets: hit, scaleX: 0.93, scaleY: 0.93, duration: 60, yoyo: true, ease: 'Sine.easeOut' });
      onClick();
    });
  }

  // ── Craft panel ─────────────────────────────────────────

  private openForgeWindow(_W: number, _H: number): void {
    // 製作系統已移除，裝備改由懸賞任務獲得
  }


  // ── Quest panel (wanted posters, horizontal scroll) ────

  private showQuestPanel(W: number, H: number, baseDepth = 500): void {
    const PW = Math.min(W - P(16), P(500));
    const PH = Math.min(H - P(20), P(370));
    const D  = baseDepth;

    const panelX = (W - PW) / 2;
    const panelY = (H - PH) / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const closeAll = () => objs.forEach(o => o.destroy());

    // ── Backdrop ──────────────────────────────────────────
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.88)
      .setInteractive().setDepth(D);
    objs.push(backdrop);
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < panelX || ptr.x > panelX + PW ||
          ptr.y < panelY || ptr.y > panelY + PH) closeAll();
    });

    // ── Panel shell ───────────────────────────────────────
    const bg = this.add.graphics().setDepth(D + 1);
    objs.push(bg);

    // Drop shadow
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(panelX + P(5), panelY + P(5), PW, PH);

    // Outer gold border
    bg.fillStyle(0xa06810, 1);
    bg.fillRect(panelX - P(3), panelY - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(0xffd060, 0.7);
    bg.fillRect(panelX - P(3), panelY - P(3), PW + P(6), P(2));
    bg.fillStyle(0xffd060, 0.3);
    bg.fillRect(panelX - P(3), panelY - P(1), P(2), PH + P(4));

    // Panel body
    bg.fillStyle(0x160e04, 1);
    bg.fillRect(panelX, panelY, PW, PH);

    // Subtle wood grain
    for (let i = 0; i < 14; i++) {
      const gy = panelY + P(8) + i * (PH / 14);
      bg.fillStyle(0xffffff, i % 4 === 0 ? 0.025 : 0.01);
      bg.fillRect(panelX + P(4), gy, PW - P(8), P(1));
    }

    // Header bar
    bg.fillStyle(0x241408, 1);
    bg.fillRect(panelX, panelY, PW, P(44));
    bg.fillStyle(0x3a2010, 1);
    bg.fillRect(panelX, panelY, PW, P(18));

    // Gold divider under header
    bg.fillStyle(0xc88020, 1);
    bg.fillRect(panelX, panelY + P(44), PW, P(2));
    bg.fillStyle(0xffe080, 0.35);
    bg.fillRect(panelX, panelY + P(44), PW, P(1));

    // Corner rivets
    ([
      [panelX - P(3), panelY - P(3)], [panelX + PW - P(7), panelY - P(3)],
      [panelX - P(3), panelY + PH - P(7)], [panelX + PW - P(7), panelY + PH - P(7)],
    ] as [number, number][]).forEach(([rx, ry]) => {
      bg.fillStyle(0xffe080, 1); bg.fillRect(rx, ry, P(10), P(10));
      bg.fillStyle(0x7a4a08, 1); bg.fillRect(rx + P(2), ry + P(2), P(6), P(6));
      bg.fillStyle(0xffe080, 0.5); bg.fillRect(rx + P(3), ry + P(3), P(2), P(2));
    });

    // Panel title
    objs.push(this.add.text(W / 2, panelY + P(22), '✦  懸 賞 告 示  ✦', {
      fontSize: F(16), fontStyle: 'bold',
      color: '#ffe080', stroke: '#2a1000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 2));

    const closeBtn = this.add.text(panelX + PW - P(18), panelY + P(22), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#ff6644', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(D + 2);
    objs.push(closeBtn);
    closeBtn.on('pointerdown', closeAll);

    // Reroll stone count — 左側 header，不壓到右邊叉叉
    const ticketQty = InventoryStore.getItemQty('quest_reroll');
    const rerollY   = panelY + P(22);
    const rerollX   = panelX + P(12);
    if (this.textures.exists('icon_quest_reroll')) {
      objs.push(this.add.image(rerollX + P(14), rerollY, 'icon_quest_reroll')
        .setDisplaySize(P(28), P(28)).setDepth(D + 2));
    }
    objs.push(this.add.text(rerollX + P(30), rerollY, `×${ticketQty}`, {
      fontSize: F(15), fontStyle: 'bold', color: ticketQty > 0 ? '#ffdd44' : '#665533',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── 3 Bounty cards ───────────────────────────────────
    const quests    = QuestStore.getQuests();
    const GAP       = P(12);
    const cardAreaX = panelX + P(12);
    const cardAreaY = panelY + P(52);
    const cardAreaW = PW - P(24);
    const CARD_W    = Math.floor((cardAreaW - GAP * 2) / 3);
    const CARD_H    = PH - P(64);

    const renderCard = (quest: Quest, idx: number) => {
      const cx     = cardAreaX + idx * (CARD_W + GAP);
      const def    = getMonsterDef(quest.bossId);
      const status = quest.status;
      const dimmed = status === 'claimed';
      const canDismiss = status !== 'completed';

      // Layout
      const BANNER_H   = P(32);
      const CIRCLE_Y   = cardAreaY + BANNER_H + P(50);
      const CIRCLE_R = P(38);
      const NAME_Y     = CIRCLE_Y + CIRCLE_R + P(14);
      const DIV_Y      = NAME_Y + P(17);
      const FLAVOR_TOP = DIV_Y + P(7);
      const FLAVOR_H   = CARD_H - (FLAVOR_TOP - cardAreaY) - P(76);
      const GOLD_Y     = cardAreaY + CARD_H - P(52);
      const BTN_Y      = cardAreaY + CARD_H - P(22);
      const BTN_H      = P(24);

      const cg = this.add.graphics().setDepth(D + 2);
      objs.push(cg);

      // Card shadow
      cg.fillStyle(0x000000, 0.4);
      cg.fillRect(cx + P(3), cardAreaY + P(3), CARD_W, CARD_H);

      // Parchment body
      cg.fillStyle(dimmed ? 0xb0946a : 0xf0dcac, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, CARD_H);
      // Edge darkening
      cg.fillStyle(0x000000, 0.08);
      cg.fillRect(cx, cardAreaY, CARD_W, P(4));
      cg.fillRect(cx, cardAreaY + CARD_H - P(4), CARD_W, P(4));
      cg.fillRect(cx, cardAreaY, P(4), CARD_H);
      cg.fillRect(cx + CARD_W - P(4), cardAreaY, P(4), CARD_H);

      // Card outer border (double-line)
      cg.lineStyle(2.5, dimmed ? 0x664422 : 0x7a3200, 1);
      cg.strokeRect(cx + P(1), cardAreaY + P(1), CARD_W - P(2), CARD_H - P(2));
      cg.lineStyle(1, dimmed ? 0x997744 : 0xdd8844, 0.4);
      cg.strokeRect(cx + P(4), cardAreaY + P(4), CARD_W - P(8), CARD_H - P(8));

      // ── Red banner ──
      cg.fillStyle(dimmed ? 0x3a1212 : 0x780606, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, BANNER_H);
      cg.fillStyle(dimmed ? 0x552222 : 0xaa1010, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, P(5));
      cg.fillStyle(0x000000, 0.25);
      cg.fillRect(cx, cardAreaY + BANNER_H - P(4), CARD_W, P(4));
      cg.lineStyle(1, dimmed ? 0x886644 : 0xffcc44, 0.65);
      cg.lineBetween(cx + P(5), cardAreaY + P(1), cx + CARD_W - P(5), cardAreaY + P(1));
      cg.lineBetween(cx + P(5), cardAreaY + BANNER_H - P(2), cx + CARD_W - P(5), cardAreaY + BANNER_H - P(2));

      objs.push(this.add.text(cx + CARD_W / 2, cardAreaY + P(10), '懸  賞', {
        fontSize: F(15), fontStyle: 'bold',
        color: dimmed ? '#aa8866' : '#ffe090',
        stroke: dimmed ? '#1a0800' : '#3a0000', strokeThickness: 2,
        padding: { top: 2, bottom: 1 },
      }).setOrigin(0.5).setDepth(D + 3));

      // Star rating row
      const starStr = '★'.repeat(quest.star) + '☆'.repeat(5 - quest.star);
      const starColors: Record<number, string> = { 1: '#aabbcc', 2: '#88ccff', 3: '#88ff88', 4: '#ffdd44', 5: '#ff8844' };
      objs.push(this.add.text(cx + CARD_W / 2, cardAreaY + BANNER_H - P(10), starStr, {
        fontSize: F(15), fontStyle: 'bold',
        color: dimmed ? '#776655' : (starColors[quest.star] ?? '#ffffff'),
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 3));

      // ── Dismiss X (top-right of card) ──
      if (canDismiss) {
        const hasTicket = InventoryStore.getItemQty('quest_reroll') > 0;
        const xColor    = hasTicket ? '#ff6666' : '#554433';
        const xTxt = this.add.text(cx + CARD_W - P(6), cardAreaY + P(6), '✕', {
          fontSize: F(15), fontStyle: 'bold', color: xColor, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(D + 5);
        objs.push(xTxt);
        if (hasTicket) {
          xTxt.setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(32), -P(4), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
          xTxt.on('pointerover', () => xTxt.setColor('#ffffff'));
          xTxt.on('pointerout',  () => xTxt.setColor(xColor));
          xTxt.on('pointerdown', () => {
            InventoryStore.spendItem('quest_reroll', 1);
            if (status === 'accepted') QuestStore.abandonQuest(quest.id);
            QuestStore.dismissQuest(quest.id);
            SaveStore.save();
            closeAll();
            this.showQuestPanel(W, H);
          });
        }
      }

      // ── Portrait circle ──
      cg.fillStyle(0x000000, 0.2);
      cg.fillCircle(cx + CARD_W / 2 + P(2), CIRCLE_Y + P(2), CIRCLE_R);
      cg.fillStyle(dimmed ? 0x8a6030 : 0xb87820, 1);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.fillStyle(dimmed ? 0xa07840 : 0xf0d898, 0.5);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - P(4));
      cg.lineStyle(2.5, dimmed ? 0xb09060 : 0xffe080, 0.9);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xc89030, 0.4);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - P(5));

      // Boss sprite
      const spriteKey   = def ? `${def.spriteKey}_idle` : 'slime_idle';
      const isPlantBoss = def?.spriteKey?.startsWith('plant');
      const idleFrames  = isPlantBoss ? 3 : 5;   // plant idle = 4 frames (0-3), slime = 6 (0-5)
      const bossScale   = isPlantBoss ? 3.0 * DPR * 0.8 : 3.0 * DPR;
      const animKey     = `q_${quest.bossId}`;
      if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: idleFrames }),
          frameRate: 8, repeat: -1,
        });
      }
      if (this.textures.exists(spriteKey)) {
        const sp = this.add.sprite(cx + CARD_W / 2, CIRCLE_Y, spriteKey, 0)
          .setScale(bossScale).setDepth(D + 3);
        if (def?.tint) def.fillTint ? sp.setTintFill(def.tint) : sp.setTint(def.tint);
        if (this.anims.exists(animKey)) sp.play(animKey);
        if (dimmed) sp.setAlpha(0.4);
        objs.push(sp);
      }

      // ── Boss name ──
      objs.push(this.add.text(cx + CARD_W / 2, NAME_Y, def?.name ?? '???', {
        fontSize: F(15), fontStyle: 'bold',
        color: dimmed ? '#7a5030' : '#1e0c00',
        stroke: dimmed ? '#00000000' : '#e8c070', strokeThickness: 1,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 3));

      // Name underline
      cg.lineStyle(1.5, dimmed ? 0xaa7744 : 0xcc7722, 0.7);
      cg.lineBetween(cx + P(10), DIV_Y, cx + CARD_W - P(10), DIV_Y);

      // ── Flavor text box ──
      const flavorClipX = cx + P(7);
      const flavorClipW = CARD_W - P(14);

      cg.fillStyle(0x000000, 0.06);
      cg.fillRect(flavorClipX + P(1), FLAVOR_TOP + P(1), flavorClipW, FLAVOR_H);
      cg.fillStyle(dimmed ? 0x7a5a28 : 0xcc9840, 0.22);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.fillStyle(0xffffff, 0.1);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, P(2));
      cg.lineStyle(1.5, dimmed ? 0x664422 : 0x7a3400, 0.85);
      cg.strokeRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xdd7722, 0.35);
      cg.strokeRect(flavorClipX + P(2), FLAVOR_TOP + P(2), flavorClipW - P(4), FLAVOR_H - P(4));

      const flavorTxt = this.add.text(
        cx + CARD_W / 2, FLAVOR_TOP + P(5), quest.flavorText, {
        fontSize: F(15), fontStyle: 'bold', lineSpacing: 3,
        color: dimmed ? '#6a5030' : '#3a1c04',
        wordWrap: { width: flavorClipW - P(12), useAdvancedWrap: true }, align: 'center',
        padding: { top: 4, bottom: 4 },
      }).setOrigin(0.5, 0).setDepth(D + 3);
      objs.push(flavorTxt);

      const maskGfx = this.make.graphics({ add: false } as any);
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillRect(flavorClipX + P(1), FLAVOR_TOP - P(3), flavorClipW - P(2), FLAVOR_H + P(3));
      flavorTxt.setMask(maskGfx.createGeometryMask());
      objs.push(maskGfx);

      if (flavorTxt.height > FLAVOR_H - P(8)) {
        const arrow = this.add.text(cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H - P(8), '▼', {
          fontSize: F(15), fontStyle: 'bold', color: '#aa6622',
        }).setOrigin(0.5).setDepth(D + 4);
        objs.push(arrow);
        const dz = this.add.zone(
          cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H / 2, flavorClipW, FLAVOR_H,
        ).setInteractive().setDepth(D + 5);
        objs.push(dz);
        const minY = FLAVOR_TOP + P(5) - (flavorTxt.height - (FLAVOR_H - P(10)));
        const maxY = FLAVOR_TOP + 5;
        let ds = 0, ts = 0;
        dz.on('pointerdown', (p: Phaser.Input.Pointer) => { ds = p.y; ts = flavorTxt.y; });
        dz.on('pointermove', (p: Phaser.Input.Pointer) => {
          if (!p.isDown) return;
          flavorTxt.y = Phaser.Math.Clamp(ts + (p.y - ds), minY, maxY);
          arrow.setVisible(flavorTxt.y > minY + 2);
        });
      }

      // ── Gold row ──
      cg.fillStyle(dimmed ? 0x442200 : 0x6a3800, 0.25);
      cg.fillRect(cx + P(6), GOLD_Y - P(12), CARD_W - P(12), P(23));
      cg.lineStyle(1, dimmed ? 0x886644 : 0xcc8822, 0.6);
      cg.strokeRect(cx + P(6), GOLD_Y - P(12), CARD_W - P(12), P(23));

      if (quest.isEquipReward) {
        objs.push(this.add.text(cx + CARD_W / 2, GOLD_Y, '裝備獎勵', {
          fontSize: F(16), fontStyle: 'bold',
          color: dimmed ? '#776655' : '#ffe8a0',
          strokeThickness: 0,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 3));
      } else {
        const coinImg = this.add.image(cx + CARD_W / 2 - P(18), GOLD_Y, 'icon_coin')
          .setDisplaySize(P(18), P(18)).setDepth(D + 3);
        if (dimmed) coinImg.setAlpha(0.5);
        objs.push(coinImg);
        objs.push(this.add.text(cx + CARD_W / 2 - P(7), GOLD_Y, `${quest.reward}`, {
          fontSize: F(16), fontStyle: 'bold',
          color: dimmed ? '#776644' : '#e8c060',
          stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(D + 3));
      }

      // ── Action button ──
      const btnW = CARD_W - 28;
      const btnX = cx + CARD_W / 2;

      {
        let bgC  = 0x1a3a0c, ltC  = 0x44cc22, txtC = '#88ee44', label = '接  受';
        if (status === 'completed') { bgC = 0x382000; ltC = 0xddaa00; txtC = '#ffdd44'; label = '領  取'; }
        if (status === 'claimed')   { bgC = 0x1c1810; ltC = 0x554433; txtC = '#665544'; label = '已領取'; }

        const bg2 = this.add.graphics().setDepth(D + 3);
        objs.push(bg2);
        bg2.fillStyle(0x000000, 0.35);
        bg2.fillRect(btnX - btnW / 2 + P(2), BTN_Y - BTN_H / 2 + P(2), btnW, BTN_H);
        bg2.fillStyle(bgC, 1);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);
        bg2.fillStyle(0xffffff, 0.12);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, P(3));
        bg2.lineStyle(1.5, ltC, 0.9);
        bg2.strokeRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);

        objs.push(this.add.text(btnX, BTN_Y, label, {
          fontSize: F(15), fontStyle: 'bold',
          color: txtC, stroke: '#000000', strokeThickness: 2,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 4));

        if (status === 'available' || status === 'accepted' || status === 'completed') {
          const hit = this.add.rectangle(btnX, BTN_Y, btnW, BTN_H)
            .setInteractive({ useHandCursor: true }).setDepth(D + 5);
          objs.push(hit);
          hit.on('pointerdown', () => {
            if (status === 'available' || status === 'accepted') showConfirm(quest);
            else if (quest.isEquipReward) showEquipRewardModal(quest, closeAll);
            else claimQuest(quest, closeAll);
          });
        }
      }
    };

    quests.forEach((q, i) => renderCard(q, i));

    // ── Star probability panel (right of quest board) ─────
    const spW = (W - PW) / 2 - P(12);
    if (spW >= P(55)) {
      const spX  = panelX + PW + P(6);
      const spY  = panelY;
      const spH  = PH;
      const spBg = this.add.graphics().setDepth(D + 1);
      objs.push(spBg);
      spBg.fillStyle(0x000000, 0.5);
      spBg.fillRect(spX + P(3), spY + P(3), spW, spH);
      spBg.fillStyle(0x1a0e00, 1);
      spBg.fillRect(spX, spY, spW, spH);
      spBg.lineStyle(P(1.5), 0x7a5020, 1);
      spBg.strokeRect(spX, spY, spW, spH);

      objs.push(this.add.text(spX + spW / 2, spY + P(14), '出現率', {
        fontSize: F(10), fontStyle: 'bold', color: '#ffe080',
        stroke: '#2a1000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 2));

      const weights  = getStarWeights(PlayerStore.getLevel());
      const total    = Object.values(weights).reduce((s, w) => s + w, 0);
      const starChar = ['★', '★★', '★★★', '★★★★', '★★★★★'];
      const rowH     = (spH - P(28)) / 5;

      for (let i = 0; i < 5; i++) {
        const star = i + 1;
        const pct  = total > 0 ? weights[star] / total : 0;
        const ry   = spY + P(26) + i * rowH;
        const pad  = P(5);
        const barW = spW - pad * 2;
        const barH = P(4);

        // star label
        const starColor = ['#aaffaa', '#ffdd88', '#88ccff', '#ff99ff', '#ffaa44'][i];
        objs.push(this.add.text(spX + spW / 2, ry, starChar[i], {
          fontSize: F(8), color: starColor,
        }).setOrigin(0.5, 0).setDepth(D + 2));

        // percentage text
        const pctText = pct < 0.005 ? '—' : `${Math.round(pct * 100)}%`;
        objs.push(this.add.text(spX + spW / 2, ry + P(11), pctText, {
          fontSize: F(9), fontStyle: 'bold', color: '#ffffff',
        }).setOrigin(0.5, 0).setDepth(D + 2));

        // bar
        const barG = this.add.graphics().setDepth(D + 2);
        objs.push(barG);
        barG.fillStyle(0x333333, 1);
        barG.fillRect(spX + pad, ry + P(22), barW, barH);
        if (pct > 0) {
          const fillColor = [0x44cc44, 0xddcc22, 0x2299ff, 0xcc44cc, 0xff8822][i];
          barG.fillStyle(fillColor, 1);
          barG.fillRect(spX + pad, ry + P(22), Math.round(barW * pct), barH);
        }
      }
    }

    // ── Confirm dialog ────────────────────────────────────
    const showConfirm = (quest: Quest) => {
      const cW = P(240), cH = P(96);
      const cX = W / 2 - cW / 2, cY = H / 2 - cH / 2;
      const co: Phaser.GameObjects.GameObject[] = [];
      const closeCo = () => co.forEach(o => o.destroy());

      const cbg = this.add.graphics().setDepth(D + 10);
      co.push(cbg);
      cbg.fillStyle(0x000000, 0.5);
      cbg.fillRect(cX + P(4), cY + P(4), cW, cH);
      cbg.fillStyle(0xa06810, 1);
      cbg.fillRect(cX - P(3), cY - P(3), cW + P(6), cH + P(6));
      cbg.fillStyle(0xffe080, 0.6);
      cbg.fillRect(cX - P(3), cY - P(3), cW + P(6), P(2));
      cbg.fillStyle(0x160e04, 1);
      cbg.fillRect(cX, cY, cW, cH);
      ([
        [cX - P(3), cY - P(3)], [cX + cW - P(7), cY - P(3)],
        [cX - P(3), cY + cH - P(7)], [cX + cW - P(7), cY + cH - P(7)],
      ] as [number, number][]).forEach(([rx, ry]) => {
        cbg.fillStyle(0xffe080, 1); cbg.fillRect(rx, ry, P(10), P(10));
        cbg.fillStyle(0x7a4a08, 1); cbg.fillRect(rx + P(2), ry + P(2), P(6), P(6));
      });

      co.push(this.add.text(W / 2, cY + P(28), '確定接受這份懸賞？', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));

      const drawBtn = (
        gfx: Phaser.GameObjects.Graphics,
        bx: number, by: number, bw: number, bh: number,
        bgCol: number, ltCol: number,
      ) => {
        gfx.fillStyle(0x000000, 0.35); gfx.fillRect(bx + P(2), by + P(2), bw, bh);
        gfx.fillStyle(bgCol, 1);       gfx.fillRect(bx, by, bw, bh);
        gfx.fillStyle(0xffffff, 0.14); gfx.fillRect(bx, by, bw, P(3));
        gfx.lineStyle(1.5, ltCol, 0.9); gfx.strokeRect(bx, by, bw, bh);
      };

      const yg = this.add.graphics().setDepth(D + 11);
      co.push(yg);
      drawBtn(yg, cX + P(14), cY + P(58), P(96), P(26), 0x1a3a0c, 0x44cc22);
      co.push(this.add.text(cX + P(62), cY + P(71), '出  發', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#88ee44', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const yHit = this.add.rectangle(cX + P(62), cY + P(71), P(96), P(26))
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(yHit);
      yHit.on('pointerdown', () => {
        QuestStore.acceptQuest(quest.id);
        closeCo(); closeAll();
        if (this.multiRoomNick) {
          // Co-op: host sends ready with quest + boss info, server broadcasts gameStart
          NetworkService.sendReady(this.multiRoomNick, PlayerStore.getLevel(), quest.id, quest.star, quest.bossId);
          this.multiRoomNick = '';
        } else {
          this.scene.start('GameScene', { ownSkinId: SkinStore.get() });
        }
      });

      const ng = this.add.graphics().setDepth(D + 11);
      co.push(ng);
      drawBtn(ng, cX + P(130), cY + P(58), P(96), P(26), 0x3a0808, 0xcc2222);
      co.push(this.add.text(cX + P(178), cY + P(71), '取  消', {
        fontSize: F(15), fontStyle: 'bold',
        color: '#ff6644', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const nHit = this.add.rectangle(cX + P(178), cY + P(71), P(96), P(26))
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(nHit);
      nHit.on('pointerdown', closeCo);
    };

    // ── Equip reward modal ────────────────────────────────
    const showEquipRewardModal = (quest: Quest, afterClose: () => void) => {
      const items = QuestStore.getEquipOptions(quest.id);

      const CARD_W = P(155);
      const CARD_H = P(255);
      const GAP    = P(10);
      const MW = CARD_W * 3 + GAP * 4;
      const MH = CARD_H + P(44) + GAP * 2;
      const mx = W / 2 - MW / 2;
      const my = H / 2 - MH / 2;
      const MD = D + 10;
      const mo: Phaser.GameObjects.GameObject[] = [];
      const closeMo = () => mo.forEach(o => o.destroy());

      // Backdrop
      const mbk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75)
        .setDepth(MD).setInteractive();
      mbk.on('pointerdown', closeMo);
      mo.push(mbk);

      // Panel
      const mg = this.add.graphics().setDepth(MD + 1);
      mo.push(mg);
      mg.fillStyle(WD, 1); mg.fillRect(mx, my, MW, MH);
      mg.lineStyle(2, GOLD, 0.9); mg.strokeRect(mx, my, MW, MH);
      mg.fillStyle(WB, 1); mg.fillRect(mx, my, MW, P(44));
      mg.lineStyle(1, GOLD, 0.4); mg.lineBetween(mx, my + P(44), mx + MW, my + P(44));

      mo.push(this.add.text(W / 2, my + P(22), '選擇獎勵裝備', {
        fontSize: F(16), fontStyle: 'bold',
        color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(MD + 2));

      // 右上角叉叉（可晚點再選）
      const xBtn = this.add.text(mx + MW - P(14), my + P(22), '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(MD + 3);
      xBtn.on('pointerdown', closeMo);
      mo.push(xBtn);

      items.forEach((item, idx) => {
        const cx = mx + GAP + idx * (CARD_W + GAP);
        const cy = my + P(44) + GAP;
        const qColor = QUALITY_COLORS[item.quality];
        const qHex   = '#' + qColor.toString(16).padStart(6, '0');

        // Card bg
        const rg = this.add.graphics().setDepth(MD + 2);
        mo.push(rg);
        const drawCard = (hover: boolean) => {
          rg.clear();
          rg.fillStyle(hover ? WL : WM, 1);
          rg.fillRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
          rg.lineStyle(hover ? 2.5 : 1.5, qColor, hover ? 1 : 0.75);
          rg.strokeRoundedRect(cx, cy, CARD_W, CARD_H, P(7));
          rg.fillStyle(qColor, 0.35);
          rg.fillRoundedRect(cx, cy, CARD_W, P(5), { tl: P(7), tr: P(7), bl: 0, br: 0 });
        };
        drawCard(false);

        // Image box — 80×80
        const imgBg = this.add.graphics().setDepth(MD + 3);
        mo.push(imgBg);
        imgBg.fillStyle(0x0a0600, 0.7);
        imgBg.fillRoundedRect(cx + (CARD_W - P(90)) / 2, cy + P(14), P(90), P(90), P(5));
        imgBg.lineStyle(1.5, qColor, 0.5);
        imgBg.strokeRoundedRect(cx + (CARD_W - P(90)) / 2, cy + P(14), P(90), P(90), P(5));

        if (this.textures.exists(item.texture))
          mo.push(this.add.image(cx + CARD_W / 2, cy + P(59), item.texture)
            .setDisplaySize(P(76), P(76)).setDepth(MD + 4));

        // Slot name
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(106), SLOT_NAMES[item.slot], {
          fontSize: F(15), fontStyle: 'bold',
          color: '#e8c070', stroke: '#0a0600', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Quality badge
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(126), QUALITY_NAMES[item.quality], {
          fontSize: F(15), fontStyle: 'bold',
          color: qHex, stroke: '#0a0600', strokeThickness: 2,
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Affixes
        const affixLines = item.affixes.map(a => {
          const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
          return `${STAT_NAMES[a.stat]} +${isPct ? (a.value*100).toFixed(1)+'%' : a.value}`;
        });
        if (item.behavior) affixLines.push(BEHAVIOR_NAMES[item.behavior]);
        mo.push(this.add.text(cx + CARD_W / 2, cy + P(146), affixLines.join('\n'), {
          fontSize: F(15), fontStyle: 'bold', color: '#88cc88',
          stroke: '#0a0600', strokeThickness: 2,
          align: 'center', lineSpacing: 4,
          wordWrap: { width: CARD_W - P(12) },
        }).setOrigin(0.5, 0).setDepth(MD + 3));

        // Hit zone
        const hit = this.add.rectangle(cx + CARD_W / 2, cy + CARD_H / 2, CARD_W, CARD_H)
          .setInteractive({ useHandCursor: true }).setDepth(MD + 5);
        mo.push(hit);
        hit.on('pointerover',  () => drawCard(true));
        hit.on('pointerout',   () => drawCard(false));
        hit.on('pointerdown', () => {
          PlayerStore.addOwned(item);
          QuestStore.claimQuest(quest.id);
          SaveStore.save();
          closeMo();
          afterClose();
          this.showQuestPanel(W, H);
        });
      });
    };

    // ── Claim ─────────────────────────────────────────────
    const claimQuest = (quest: Quest, afterClose: () => void) => {
      const gold = QuestStore.claimQuest(quest.id);
      InventoryStore.addGold(gold);
      SaveStore.save();
      afterClose();
      this.showQuestPanel(W, H);
    };

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, closeAll);
  }

  // ── Equipment panel (wooden cabinet) ───────────────────

  private showEquipmentPanel(W: number, H: number): void {
    const PW = Math.min(W - P(16), P(640));
    const PH = Math.min(H - P(16), P(560));
    const D  = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
          ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        PlayerStore.offChange(onStoreChange);
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1); bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL,   1); bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD,   1); bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5);  bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08); bg.lineBetween(px + P(2), ry + 1, px + PW - P(2), ry + 1);
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, P(42));
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + P(40), PW, P(2));
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + P(42), PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + P(21), '裝  備', {
      fontSize: F(17), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    // Close button lives OUTSIDE the container at depth D+1 so it is always the
    // topmost interactive object regardless of container child ordering.
    const closeBtn = this.add.text(W / 2 + px + PW - P(22), H / 2 + py + P(21), '✕', {
      fontSize: F(16), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(D + 1).setScrollFactor(0);
    const closePanelFn = () => {
      if (closeBtn.active) closeBtn.destroy();
      PlayerStore.offChange(onStoreChange);
      if (container.active) container.destroy();
    };
    closeBtn.on('pointerdown', closePanelFn);
    container.once('destroy', () => { if (closeBtn.active) closeBtn.destroy(); });

    // ── Slot definitions ──────────────────────────────────
    const slotDefs: { label: string; color: number; slotKey: EquipSlot }[] = [
      { label: '武器', color: 0xdd8844, slotKey: 'sword'  },
      { label: '頭盔', color: 0xddcc88, slotKey: 'hat'    },
      { label: '衣服', color: 0x88aadd, slotKey: 'outfit' },
      { label: '鞋子', color: 0xaa8866, slotKey: 'shoes'  },
      { label: '飾品1', color: 0xff88cc, slotKey: 'ring1'  },
      { label: '飾品2', color: 0xff66aa, slotKey: 'ring2'  },
    ];
    const tabDefs: { label: string; color: number; slotKeys: EquipSlot[] }[] = [
      { label: '武器', color: 0xdd8844, slotKeys: ['sword']         },
      { label: '頭盔', color: 0xddcc88, slotKeys: ['hat']           },
      { label: '衣服', color: 0x88aadd, slotKeys: ['outfit']        },
      { label: '鞋子', color: 0xaa8866, slotKeys: ['shoes']         },
      { label: '飾品', color: 0xff88cc, slotKeys: ['ring1', 'ring2'] },
    ];

    // ── 裝備格子：3 欄 × 2 列 ────────────────────────────
    const slotSz   = P(76);
    const slotGap  = P(8);
    const ECOLS    = 3;
    const EROWS    = 2;
    const eGridX  = px + P(12);
    const eGridY  = py + P(50);
    const eGridH  = EROWS * slotSz + (EROWS - 1) * slotGap;

    // ── 人物屬性區（裝備格下方，左欄同寬）───────────────
    const eGridW  = ECOLS * slotSz + (ECOLS - 1) * slotGap;
    const statsX  = eGridX;
    const statsY  = eGridY + eGridH + P(10);
    const statsW  = eGridW;
    const statsH  = P(140);

    // ── 右欄（清單區）────────────────────────────────────
    const rightColX = eGridX + eGridW + P(26);
    const rightColW = px + PW - P(10) - rightColX;
    const rightColTop = py + P(50);

    // ── Top equipped slots (reactive) ─────────────────────
    const topSlotsLayer = this.add.container(0, 0);
    container.add(topSlotsLayer);

    // ── Stats layer (reactive) ────────────────────────────
    const statsLayer = this.add.container(0, 0);
    container.add(statsLayer);

    // ── Equipped slot detail overlay ──────────────────────
    // ── 共用按鈕繪製 ──────────────────────────────────────
    const drawBtn = (
      det: Phaser.GameObjects.Container,
      cx: number, cy: number, bw: number, bh: number,
      label: string, bgClr: number, borderClr: number, txtClr: string,
      onClick: () => void,
    ) => {
      const g = this.add.graphics();
      g.fillStyle(bgClr, 1);         g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(borderClr, 0.12);  g.fillRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.lineStyle(2, borderClr, 0.85); g.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
      g.fillStyle(borderClr, 0.35);  g.fillRect(cx - bw / 2, cy - bh / 2, bw, 2);
      det.add(g);
      const t = this.add.text(cx, cy, label, {
        fontSize: F(15), fontStyle: 'bold', color: txtClr, stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5);
      det.add(t);
      const hit = this.add.rectangle(cx, cy, bw, bh).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onClick);
      det.add(hit);
    };

    const showBehaviorModal = (behavior: import('../data/equipment-data').AttackBehavior) => {
      const info = BEHAVIOR_INFO[behavior];
      const { width: W, height: H } = this.scale;
      const mw = P(340);

      const probe = this.add.text(-9999, -9999, info.desc, {
        fontSize: F(15), fontStyle: 'bold', wordWrap: { width: mw - P(32), useAdvancedWrap: true }, lineSpacing: 3,
      });
      const descH = probe.height;
      probe.destroy();

      const titleH    = P(48);
      const sepGap    = P(14);
      const formulaH  = P(28) + info.formula.length * P(20);
      const statsH    = P(28) + Math.ceil(info.relatedStats.length / 2) * P(22);
      const closeBtnH = P(44);
      const mh = titleH + descH + sepGap + P(14) + formulaH + P(12) + statsH + closeBtnH;
      const mx = W / 2 - mw / 2;
      const my = H / 2 - mh / 2;

      const D = 900;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const s = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };

      const prevTopOnly = this.input.topOnly;
      this.input.topOnly = true; // 只有最高 depth 的物件收到事件，完全阻擋下層點擊
      const closeModal = () => {
        this.input.topOnly = prevTopOnly;
        objs.forEach(o => o.destroy());
      };

      // 全螢幕遮罩，depth 900，攔截所有點擊
      const overlay = s(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55)
        .setInteractive({ useHandCursor: false }).setDepth(D));
      overlay.on('pointerdown', () => closeModal());

      const bg = s(this.add.graphics().setDepth(D + 1));
      bg.fillStyle(0x1a1008, 0.97); bg.fillRect(mx, my, mw, mh);
      bg.lineStyle(P(2), 0xc49050, 0.8); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(0xc49050, 0.35); bg.fillRect(mx, my, mw, P(3));

      s(this.add.text(mx + mw / 2, my + P(20), BEHAVIOR_NAMES[behavior], {
        fontSize: F(17), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5, 0).setDepth(D + 2));

      s(this.add.text(mx + P(16), my + titleH, info.desc, {
        fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa', wordWrap: { width: mw - P(32), useAdvancedWrap: true }, lineSpacing: 3,
      }).setOrigin(0, 0).setDepth(D + 2));

      const sepY = my + titleH + descH + sepGap;
      const sepG = s(this.add.graphics().setDepth(D + 2));
      sepG.fillStyle(0xc49050, 0.3); sepG.fillRect(mx + P(12), sepY, mw - P(24), 1);

      s(this.add.text(mx + P(16), sepY + P(8), '傷害公式', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050',
      }).setOrigin(0, 0).setDepth(D + 2));

      info.formula.forEach((line, i) => {
        s(this.add.text(mx + P(16), sepY + P(26) + i * P(20), `• ${line}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#aaddaa',
        }).setOrigin(0, 0).setDepth(D + 2));
      });

      // ── 影響數值 ──────────────────────────────────────────
      const statsY = sepY + P(26) + info.formula.length * P(20) + P(12);
      const statsG = s(this.add.graphics().setDepth(D + 2));
      statsG.fillStyle(0xc49050, 0.3); statsG.fillRect(mx + P(12), statsY, mw - P(24), 1);

      s(this.add.text(mx + P(16), statsY + P(8), '影響數值', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050',
      }).setOrigin(0, 0).setDepth(D + 2));

      const STAT_TAG_COLORS: Partial<Record<import('../data/equipment-data').StatKey, number>> = {
        atk: 0x6633aa, hp: 0xaa3333, def: 0x336688, crit: 0xcc8800,
        atkSpeed: 0x227744, speed: 0x225588, lifesteal: 0x883344, evasion: 0x557722,
      };
      info.relatedStats.forEach(({ stat, note }, i) => {
        const col  = i % 2;
        const row  = Math.floor(i / 2);
        const tx   = mx + P(16) + col * ((mw - P(32)) / 2);
        const ty   = statsY + P(26) + row * P(22);
        const tagW = (mw - P(40)) / 2;
        const tagH = P(18);
        const tagG = s(this.add.graphics().setDepth(D + 2));
        const c    = STAT_TAG_COLORS[stat] ?? 0x444444;
        tagG.fillStyle(c, 0.25); tagG.fillRoundedRect(tx, ty, tagW, tagH, P(4));
        tagG.lineStyle(P(1), c, 0.6); tagG.strokeRoundedRect(tx, ty, tagW, tagH, P(4));
        s(this.add.text(tx + tagW / 2, ty + tagH / 2, `${STAT_NAMES[stat]}  ${note}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ddd8cc',
        }).setOrigin(0.5, 0.5).setDepth(D + 3));
      });

      const closeY = my + mh - P(22);
      const closeG = s(this.add.graphics().setDepth(D + 2));
      closeG.fillStyle(0x3a2000, 1); closeG.fillRect(mx + mw / 2 - P(40), closeY - P(14), P(80), P(28));
      closeG.lineStyle(P(2), 0xc49050, 0.7); closeG.strokeRect(mx + mw / 2 - P(40), closeY - P(14), P(80), P(28));

      const closeT = s(this.add.text(mx + mw / 2, closeY, '關  閉', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D + 3));
      closeT.on('pointerdown', () => closeModal());
    };

    const showEnhanceModal = (item: EquipmentItem, onClose: () => void) => {
      const { width: W, height: H } = this.scale;
      const mw = P(300);
      const ED = 960;
      const eo: Phaser.GameObjects.GameObject[] = [];
      const es = <T extends Phaser.GameObjects.GameObject>(o: T): T => { eo.push(o); return o; };
      const closeEnhance = () => { eo.forEach(o => o.destroy()); onClose(); };

      const isPct  = (stat: string) => ['crit','atkSpeed','lifesteal','evasion','critDmg','dotBonus'].includes(stat);
      const fmtVal = (stat: string, val: number) => isPct(stat) ? (val * 100).toFixed(1) + '%' : String(val);
      const fmtGain = (stat: string, gain: number) => isPct(stat) ? `+${(gain * 100).toFixed(1)}%` : `+${gain}`;

      let useComplete = false;
      let useGuard    = false;

      const TITLE_H    = P(44);
      const LEVEL_H    = P(38);
      const AFFIX_ROW  = P(24);
      const BEH_ROW    = item.behavior ? P(24) : 0;
      const STONE_IN_H = P(22);   // 破損強化石持有行
      const INFO_H     = P(24);   // 成功率 + 消耗行
      const STONE_ROW  = P(26);
      const HINT_H     = P(18);   // 按鈕上方提示
      const BTN_H      = P(42);
      const RESULT_H   = P(28);
      const PAD        = P(10);
      const mh = TITLE_H + LEVEL_H + PAD + item.affixes.length * AFFIX_ROW + BEH_ROW +
                 PAD + STONE_IN_H + INFO_H + STONE_ROW * 2 + PAD + HINT_H + BTN_H + RESULT_H + PAD;
      const mx = W / 2 - mw / 2;
      const my = H / 2 - mh / 2;

      es(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setInteractive().setDepth(ED));

      const bg = es(this.add.graphics().setDepth(ED + 1));
      bg.fillStyle(WD, 0.97); bg.fillRect(mx, my, mw, mh);
      bg.lineStyle(P(2), GOLD, 0.85); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(WB, 1); bg.fillRect(mx, my, mw, TITLE_H);
      bg.lineStyle(P(1), GOLD, 0.4); bg.lineBetween(mx, my + TITLE_H, mx + mw, my + TITLE_H);

      es(this.add.text(W / 2, my + TITLE_H / 2, '強 化 裝 備', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(ED + 2));
      es(this.add.text(mx + mw - P(16), my + TITLE_H / 2, '✕', {
        fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true }).setDepth(ED + 3))
        .on('pointerdown', closeEnhance);

      const levelTxt = es(this.add.text(W / 2, my + TITLE_H + LEVEL_H / 2, '', {
        fontSize: F(19), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(ED + 2));

      // ── 詞綴列（移除「必定↑/隨機↑」，改到按鈕上方提示）────────
      const affixStartY = my + TITLE_H + LEVEL_H + PAD;
      const valTexts: Phaser.GameObjects.Text[] = [];
      item.affixes.forEach((a, i) => {
        const ay = affixStartY + i * AFFIX_ROW + AFFIX_ROW / 2;
        es(this.add.text(mx + P(10), ay, STAT_NAMES[a.stat], {
          fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(ED + 2));
        valTexts.push(es(this.add.text(mx + mw - P(10), ay, '', {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(1, 0.5).setDepth(ED + 2)));
      });

      if (item.behavior) {
        const by = affixStartY + item.affixes.length * AFFIX_ROW + BEH_ROW / 2;
        es(this.add.text(mx + P(10), by, '攻擊模式', {
          fontSize: F(15), fontStyle: 'bold', color: '#aaaaaa', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5).setDepth(ED + 2));
        es(this.add.text(mx + mw - P(10), by, BEHAVIOR_NAMES[item.behavior], {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(1, 0.5).setDepth(ED + 2));
      }

      // ── 資訊區 ─────────────────────────────────────────
      const infoBase  = affixStartY + item.affixes.length * AFFIX_ROW + BEH_ROW + PAD;

      // 列1：破損強化石持有數（左側 ◆ 圖示 + 顏色提示）
      const stoneInY  = infoBase + STONE_IN_H / 2;
      const stoneTxt  = es(this.add.text(mx + P(10), stoneInY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffcc66', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));

      // 列2：成功率 | 消耗 N 顆
      const infoY    = infoBase + STONE_IN_H + INFO_H / 2;
      const rateTxt  = es(this.add.text(mx + P(10), infoY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaccff', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const costTxt  = es(this.add.text(mx + mw - P(10), infoY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffdd66', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(1, 0.5).setDepth(ED + 2));

      // ── 石頭 toggle 行 ──────────────────────────────────
      const stoneBase = infoBase + STONE_IN_H + INFO_H;

      const cmpY    = stoneBase + STONE_ROW / 2;
      const cmpChkG = es(this.add.graphics().setDepth(ED + 2));
      const cmpChkT = es(this.add.text(mx + P(15), cmpY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#44ff88', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(ED + 3));
      const cmpLbl  = es(this.add.text(mx + P(28), cmpY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const cmpHit  = es(this.add.rectangle(W / 2, cmpY, mw - P(20), STONE_ROW - P(4)).setDepth(ED + 4));

      const grdY    = stoneBase + STONE_ROW + STONE_ROW / 2;
      const grdChkG = es(this.add.graphics().setDepth(ED + 2));
      const grdChkT = es(this.add.text(mx + P(15), grdY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffaa44', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(ED + 3));
      const grdLbl  = es(this.add.text(mx + P(28), grdY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#ccbbaa', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setDepth(ED + 2));
      const grdHit  = es(this.add.rectangle(W / 2, grdY, mw - P(20), STONE_ROW - P(4)).setDepth(ED + 4));

      // ── 按鈕上方提示 ──────────────────────────────────
      const hintY   = stoneBase + STONE_ROW * 2 + PAD + HINT_H / 2;
      const hintTxt = es(this.add.text(W / 2, hintY, '', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(ED + 2));

      // ── 強化按鈕 ──────────────────────────────────────
      const bx   = mx + P(12);
      const btnY = stoneBase + STONE_ROW * 2 + PAD + HINT_H;
      const bw   = mw - P(24);
      const btnG = es(this.add.graphics().setDepth(ED + 2));
      const drawEnhBtn = (enabled: boolean) => {
        btnG.clear();
        btnG.fillStyle(enabled ? 0x5a3800 : 0x2a1a08, 1); btnG.fillRect(bx, btnY, bw, BTN_H);
        btnG.lineStyle(P(2), enabled ? GOLD : 0x443322, enabled ? 0.9 : 0.3);
        btnG.strokeRect(bx, btnY, bw, BTN_H);
        if (enabled) { btnG.fillStyle(GOLD, 0.3); btnG.fillRect(bx, btnY, bw, P(2)); }
      };
      const btnLbl = es(this.add.text(W / 2, btnY + BTN_H / 2, '強  化', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(ED + 3));
      const btnHit = es(this.add.rectangle(W / 2, btnY + BTN_H / 2, bw, BTN_H)
        .setInteractive({ useHandCursor: true }).setDepth(ED + 4));

      const resultTxt = es(this.add.text(W / 2, btnY + BTN_H + RESULT_H / 2, '', {
        fontSize: F(15), fontStyle: 'bold', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(ED + 2));

      // ── 畫面特效 ──────────────────────────────────────
      const playFlash = (color: number) => {
        const fl = es(this.add.rectangle(W / 2, my + mh / 2, mw - 4, mh - 4, color, 0.4)
          .setDepth(ED + 9));
        this.tweens.add({ targets: fl, alpha: 0, duration: 500, ease: 'Power2' });
      };

      // ── Refresh ───────────────────────────────────────
      const refresh = () => {
        const lv    = item.enhancement;
        const maxed = lv >= ENHANCE_MAX;
        const base  = maxed ? 0 : ENHANCE_RATE[lv];
        const rate  = Math.min(1, base + (useComplete ? ENHANCE_COMPLETE_BONUS : 0));

        levelTxt.setText(`+${lv}${!maxed ? `  →  +${lv + 1}` : '  （最高）'}`);
        levelTxt.setColor(lv >= ENHANCE_DEMOTE_FROM ? '#ff9966' : '#ffe066');
        item.affixes.forEach((a, i) => valTexts[i]?.setText(fmtVal(a.stat, a.value)));

        // 破損強化石：持有數 + 本次消耗
        const brokenQty  = InventoryStore.getItemQty('stone_broken');
        const needStones = !maxed ? ENHANCE_COST[lv] : 0;
        const enoughBrk  = brokenQty >= needStones;
        stoneTxt.setText(
          maxed ? `◆ 破損強化石  持有 ${brokenQty} 顆`
                : `◆ 破損強化石  持有 ${brokenQty} 顆  消耗 ${needStones} 顆`
        );
        stoneTxt.setColor(enoughBrk ? '#ffcc66' : '#ff6666');

        if (!maxed) {
          const rateStr = useComplete
            ? `成功率  ${(base * 100).toFixed(0)}% + 8% = ${(rate * 100).toFixed(0)}%`
            : `成功率  ${(rate * 100).toFixed(0)}%`;
          rateTxt.setText(rateStr);
          costTxt.setText('');
          const isSword = item.slot === 'sword' && item.affixes.length >= 3;
          hintTxt.setText(isSword ? '必定強化攻擊力，另隨機提升一條詞綴' : '隨機強化一條詞綴屬性');
        } else {
          rateTxt.setText(''); costTxt.setText(''); hintTxt.setText('');
        }
        drawEnhBtn(!maxed);
        btnLbl.setAlpha(maxed ? 0.4 : 1);
        if (maxed) btnHit.removeInteractive(); else btnHit.setInteractive({ useHandCursor: true });

        // 完整強化石：持有數 + 消耗說明
        const intactQty = InventoryStore.getItemQty('stone_intact');
        const canCmp    = !maxed && intactQty > 0;
        cmpChkG.clear();
        cmpChkG.fillStyle(useComplete ? 0x1a4428 : 0x1a1208, 1);
        cmpChkG.lineStyle(1, useComplete ? 0x44cc88 : 0x554433, 1);
        cmpChkG.fillRect(mx + P(8), cmpY - P(7), P(14), P(14)); cmpChkG.strokeRect(mx + P(8), cmpY - P(7), P(14), P(14));
        cmpChkT.setText(useComplete ? '✓' : '');
        cmpLbl.setText(`完整強化石 ×${intactQty}  消耗1 → +8%`);
        cmpLbl.setColor(intactQty === 0 ? '#ff6666' : '#ccbbaa');
        cmpChkG.setAlpha(canCmp ? 1 : 0.35); cmpChkT.setAlpha(canCmp ? 1 : 0.35); cmpLbl.setAlpha(canCmp ? 1 : 0.35);
        if (canCmp) cmpHit.setInteractive({ useHandCursor: true }); else cmpHit.removeInteractive();
        if (!canCmp) useComplete = false;

        // 防退石：持有數 + 消耗說明（失敗時才消耗）
        const guardQty = InventoryStore.getItemQty('stone_guard');
        const canGrd   = !maxed && lv >= ENHANCE_DEMOTE_FROM && guardQty > 0;
        const showGrd  = !maxed && lv >= ENHANCE_DEMOTE_FROM;
        grdChkG.clear();
        grdChkG.fillStyle(useGuard ? 0x3a2208 : 0x1a1208, 1);
        grdChkG.lineStyle(1, useGuard ? 0xcc7722 : 0x554433, 1);
        grdChkG.fillRect(mx + P(8), grdY - P(7), P(14), P(14)); grdChkG.strokeRect(mx + P(8), grdY - P(7), P(14), P(14));
        grdChkT.setText(useGuard && showGrd ? '✓' : '');
        grdLbl.setText(
          showGrd
            ? `防退石 ×${guardQty}  失敗消耗1 → 防退`
            : '防退石  ─  (需+5以上)'
        );
        grdLbl.setColor(showGrd && guardQty === 0 ? '#ff6666' : '#ccbbaa');
        const grdAlpha = showGrd ? (guardQty > 0 ? 1 : 0.5) : 0.25;
        grdChkG.setAlpha(grdAlpha); grdChkT.setAlpha(grdAlpha); grdLbl.setAlpha(grdAlpha);
        if (canGrd) grdHit.setInteractive({ useHandCursor: true }); else grdHit.removeInteractive();
        if (!canGrd) useGuard = false;
      };
      refresh();

      cmpHit.on('pointerdown', () => {
        if (InventoryStore.getItemQty('stone_intact') > 0) { useComplete = !useComplete; refresh(); }
      });
      grdHit.on('pointerdown', () => {
        if (InventoryStore.getItemQty('stone_guard') > 0) { useGuard = !useGuard; refresh(); }
      });

      // 每條詞綴的持久綠色加成文字（再次強化或關閉時清除）
      const gainTexts: (Phaser.GameObjects.Text | null)[] = item.affixes.map(() => null);
      const clearGainTexts = () => {
        for (let i = 0; i < gainTexts.length; i++) {
          gainTexts[i]?.destroy();
          gainTexts[i] = null;
          valTexts[i]?.setX(mx + mw - 10);
        }
      };

      btnHit.on('pointerdown', () => {
        clearGainTexts();   // 每次按下清除上次的加成提示
        const lv   = item.enhancement;
        if (lv >= ENHANCE_MAX) return;
        const cost = ENHANCE_COST[lv];
        if (InventoryStore.getItemQty('stone_broken') < cost) {
          resultTxt.setText('破損強化石不足！').setColor('#ff4444'); return;
        }
        if (useComplete && InventoryStore.getItemQty('stone_intact') < 1) {
          resultTxt.setText('完整強化石不足！').setColor('#ff4444'); return;
        }
        InventoryStore.spendItem('stone_broken', cost);
        if (useComplete) InventoryStore.spendItem('stone_intact', 1);
        const rate = Math.min(1, ENHANCE_RATE[lv] + (useComplete ? ENHANCE_COMPLETE_BONUS : 0));

        if (Math.random() < rate) {
          const beforeVals = item.affixes.map(a => a.value);
          const boosted    = applyEnhancement(item);
          PlayerStore.notify(); SaveStore.save(); refresh();
          playFlash(0x00cc55);
          for (const idx of boosted) {
            const gain = item.affixes[idx].value - beforeVals[idx];
            const gy   = affixStartY + idx * AFFIX_ROW + AFFIX_ROW / 2;
            // 浮動文字：從詞綴上方飄起消失
            const ft = es(this.add.text(W / 2, gy, fmtGain(item.affixes[idx].stat, gain), {
              fontSize: F(15), fontStyle: 'bold', color: '#aaffcc',
              stroke: '#002200', strokeThickness: 2,
            }).setOrigin(0.5, 1).setDepth(ED + 10));
            this.tweens.add({
              targets: ft, y: gy - P(30), alpha: 0, duration: 700, ease: 'Power2',
              onComplete: () => ft.destroy(),
            });
            // 持久顯示：數字往左移，右側放綠色加成
            valTexts[idx].setX(mx + mw - P(52));
            const gt = es(this.add.text(mx + mw - P(10), gy, fmtGain(item.affixes[idx].stat, gain), {
              fontSize: F(15), fontStyle: 'bold', color: '#44ff88',
              stroke: '#003300', strokeThickness: 2,
            }).setOrigin(1, 0.5).setDepth(ED + 10));
            gainTexts[idx] = gt;
          }
          const names = boosted.map(idx => STAT_NAMES[item.affixes[idx].stat]).join('、');
          resultTxt.setText(`✓ 成功！${names} 提升`).setColor('#44ff88');
        } else {
          if (lv >= ENHANCE_DEMOTE_FROM) {
            if (useGuard && InventoryStore.getItemQty('stone_guard') > 0) {
              InventoryStore.spendItem('stone_guard', 1);
              playFlash(0xff8800);
              resultTxt.setText('✗ 失敗（防退石保護）').setColor('#ffaa44');
            } else {
              revertEnhancement(item);
              PlayerStore.notify();
              playFlash(0xff2222);
              this.cameras.main.shake(200, 0.004);
              resultTxt.setText(`✗ 失敗，退至 +${item.enhancement}`).setColor('#ff4444');
            }
          } else {
            playFlash(0xff4422);
            resultTxt.setText('✗ 強化失敗').setColor('#ff6644');
          }
          SaveStore.save(); refresh();
        }
      });
    };

    let activeDetail: Phaser.GameObjects.Container | null = null;

    const showEquippedDetail = (item: import('../data/equipment-data').EquipmentItem, equipSlot: EquipSlot) => {
      if (activeDetail) { activeDetail.destroy(); activeDetail = null; }
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH   = py + PH - areaTop - P(6);
      const rcx     = rightColX + rightColW / 2;   // centre of right column

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - P(4), areaTop, rightColW + P(8), areaH);
      det.add(detBg);
      // 只擋右欄，讓左欄裝備格可直接點擊切換
      det.add(this.add.rectangle(rcx, areaTop + areaH / 2, rightColW + P(8), areaH, 0, 0).setInteractive());

      const backBtn = this.add.text(rightColX + P(8), areaTop + P(16), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeEquipped = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeEquipped());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + P(32), areaTop + P(60), item.texture).setDisplaySize(P(56), P(56)));

      det.add(this.add.text(rightColX + P(72), areaTop + P(38), item.enhancement > 0 ? `【+${item.enhancement}】${item.name}` : item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY = areaTop + P(58);
      if (item.behavior) {
        det.add(this.add.text(rightColX + P(72), statOffsetY, `攻擊模式：${BEHAVIOR_NAMES[item.behavior]}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0));
        const viewBtn = this.add.text(rightColX + rightColW - P(8), statOffsetY, '查看', {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
          backgroundColor: '#3a2000', padding: { x: 5, y: 2 },
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        viewBtn.on('pointerdown', () => showBehaviorModal(item.behavior!));
        det.add(viewBtn);
        statOffsetY += P(18);
      }
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
        statParts.push(`${STAT_NAMES[a.stat]} +${isPct ? (a.value * 100).toFixed(1) + '%' : a.value}`);
      });
      det.add(this.add.text(rightColX + P(72), statOffsetY, statParts.join('\n'), {
        fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = (item.behavior ? 1 : 0) * P(18) + statParts.length * P(18) + P(12);
      dg.fillStyle(WB, 1);   dg.fillRect(rightColX, areaTop + P(50) + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + P(51) + statBlockH, rightColW, 1);
      det.add(dg);

      // 脫下 | 強化
      const btnH = P(38), btnW = P(136), btnGap = P(8);
      const btnY = areaTop + areaH - P(28);
      drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY, btnW, btnH,
        '脫  下', 0x3a1a1a, 0xcc4444, '#ee8888',
        () => { PlayerStore.unequip(equipSlot); closeEquipped(); });
      drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY, btnW, btnH,
        '強  化', 0x3a2800, 0xf0c040, '#ffe066',
        () => showEnhanceModal(item, () => { closeEquipped(); showEquippedDetail(item, equipSlot); }));
    };

    // ── buildTopSlots：3欄×2列六宮格 ─────────────────────
    const buildTopSlots = () => {
      topSlotsLayer.removeAll(true);
      const eq = PlayerStore.getEquipped();
      slotDefs.forEach((s, i) => {
        const col  = i % ECOLS;
        const row  = Math.floor(i / ECOLS);
        const sx   = eGridX + col * (slotSz + slotGap);
        const sy   = eGridY + row * (slotSz + slotGap);
        const item = eq[s.slotKey];

        const sg = this.add.graphics();
        sg.fillStyle(WB, 1); sg.fillRect(sx, sy, slotSz, slotSz);
        sg.fillStyle(item ? WMI : WM, 1); sg.fillRect(sx + P(2), sy + P(2), slotSz - P(4), slotSz - P(4));
        sg.lineStyle(1.5, item ? GOLD : WL, item ? 0.5 : 0.4);
        sg.strokeRect(sx, sy, slotSz, slotSz);
        sg.fillStyle(s.color, 0.55); sg.fillRect(sx, sy, slotSz, P(3));
        topSlotsLayer.add(sg);

        if (item && this.textures.exists(item.texture)) {
          topSlotsLayer.add(
            this.add.image(sx + slotSz / 2, sy + slotSz / 2 - P(8), item.texture)
              .setDisplaySize(P(48), P(48)),
          );
          sg.fillStyle(0x000000, 0.5); sg.fillRect(sx, sy + slotSz - P(18), slotSz, P(18));
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz - P(10), item.enhancement > 0 ? `+${item.enhancement} ${item.name}` : item.name, {
            fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));

          const tap = this.add.rectangle(sx + slotSz / 2, sy + slotSz / 2, slotSz, slotSz)
            .setInteractive({ useHandCursor: true });
          tap.on('pointerdown', () => showEquippedDetail(item, s.slotKey));
          topSlotsLayer.add(tap);
        } else {
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz / 2 - P(4), s.label, {
            fontSize: F(15), fontStyle: 'bold', color: '#b08040', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));
        }
      });
    };
    buildTopSlots();

    // ── buildStats：人物屬性（全寬 2列×3欄）──────────────────
    const buildStats = () => {
      statsLayer.removeAll(true);
      const s  = CardStore.getTotalStats();
      const lv = PlayerStore.getLevel();

      const sg = this.add.graphics();
      sg.fillStyle(WD, 0.55); sg.fillRect(statsX, statsY, statsW, statsH);
      sg.lineStyle(1, WL, 0.25); sg.strokeRect(statsX, statsY, statsW, statsH);
      sg.fillStyle(WB, 0.6); sg.fillRect(statsX, statsY, statsW, P(20));
      statsLayer.add(sg);

      statsLayer.add(this.add.text(statsX + statsW / 2, statsY + P(10), '人 物 屬 性', {
        fontSize: F(15), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));

      const allRows = [
        [{ label: 'Lv',   value: `${lv}`,                             color: '#ffee88' }, { label: 'HP',    value: `${s.maxHp}`,                              color: '#88ee88' }],
        [{ label: '攻擊', value: `${s.atk}`,                          color: '#ff8855' }, { label: '防禦',  value: `${s.def}`,                               color: '#88aaff' }],
        [{ label: '速度', value: `${s.speed}`,                        color: '#ffff88' }, { label: '暴擊',  value: `${(s.crit * 100).toFixed(0)}%`,           color: '#ffaa44' }],
        [{ label: '攻速', value: `${(s.atkSpeed * 100).toFixed(0)}%`, color: '#ff88ff' }, { label: '閃避',  value: `${(s.evasion * 100).toFixed(1)}%`,        color: '#aaddff' }],
        [{ label: '爆傷', value: `${((1 + s.critDmg) * 100).toFixed(0)}%`, color: '#ffdd44' }, { label: '吸血', value: `${(s.lifesteal * 100).toFixed(1)}%`, color: '#ff6699' }],
        [{ label: '持續傷害', value: `+${(s.dotBonus * 100).toFixed(0)}%`, color: '#cc88ff' }, { label: '穿甲', value: `${s.penetration}`, color: '#ff9944' }],
      ];
      const colW2 = statsW / 2;
      const rowH  = (statsH - P(20)) / 6;

      allRows.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const cx = statsX + ci * colW2;
          const ry = statsY + P(20) + ri * rowH + rowH / 2;
          statsLayer.add(this.add.text(cx + P(6), ry, cell.label, { fontSize: F(15), fontStyle: 'bold', color: '#888888', stroke: '#000', strokeThickness: 1 }).setOrigin(0, 0.5));
          statsLayer.add(this.add.text(cx + colW2 - P(6), ry, cell.value, { fontSize: F(15), fontStyle: 'bold', color: cell.color, stroke: '#000', strokeThickness: 1 }).setOrigin(1, 0.5));
        });
      });
    };
    buildStats();

    // ── 垂直分隔線 ────────────────────────────────────────
    const divGfx = this.add.graphics();
    const divX   = rightColX - P(13);
    divGfx.fillStyle(WB, 1);   divGfx.fillRect(divX, py + P(44), 2, PH - P(52));
    divGfx.fillStyle(WH, 0.3); divGfx.fillRect(divX + P(2), py + P(44), 1, PH - P(52));
    container.add(divGfx);

    // ── Tabs（右欄頂部）──────────────────────────────────
    const tabH     = P(30);
    const tabY    = rightColTop;
    const tabW    = rightColW / tabDefs.length;
    let activeTab = 0;

    const tabGfx = this.add.graphics();
    const tabLabels: Phaser.GameObjects.Text[] = [];

    const redrawTabs = (active: number) => {
      tabGfx.clear();
      tabDefs.forEach((t, i) => {
        const tx = rightColX + i * tabW;
        tabGfx.fillStyle(i === active ? WMI : WD, 1); tabGfx.fillRect(tx, tabY, tabW, tabH);
        tabGfx.lineStyle(1, WB, 0.25); tabGfx.lineBetween(tx + 2, tabY + tabH / 2, tx + tabW - 2, tabY + tabH / 2);
        tabGfx.lineStyle(1, i === active ? WH : WM, i === active ? 0.7 : 0.3);
        tabGfx.strokeRect(tx, tabY, tabW, tabH);
        if (i === active) { tabGfx.fillStyle(t.color, 0.65); tabGfx.fillRect(tx, tabY, tabW, 3); }
      });
    };
    redrawTabs(0);
    container.add(tabGfx);

    // ── Grid（右欄）─────────────────────────────────────
    const gridY    = tabY + tabH + P(6);
    const cellSz   = P(68);
    const cellGap  = P(7);
    const gridLeft = rightColX;
    const cols     = Math.floor((rightColW + cellGap) / (cellSz + cellGap));
    const gridH    = PH / 2 - P(10) - gridY;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridWheelHandler: ((...args: any[]) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridMoveHandler:  ((...args: any[]) => void) | null = null;

    const gridLayer = this.add.container(0, 0);
    container.add(gridLayer);

    // ── Equip comparison popup ────────────────────────────
    const showEquipComparison = (
      newItem:     import('../data/equipment-data').EquipmentItem,
      currentItem: import('../data/equipment-data').EquipmentItem,
      onConfirm: () => void,
    ) => {
      const compD = D + 20;
      const objs: Phaser.GameObjects.GameObject[] = [];
      const s = <T extends Phaser.GameObjects.GameObject>(o: T): T => { objs.push(o); return o; };
      const closeComp = () => objs.forEach(o => o.destroy());

      // 全螢幕遮罩（絕對座標）
      s(this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65)
        .setInteractive().setDepth(compD))
        .on('pointerdown', closeComp);

      const PDW = P(380), PDH = P(320);
      const CW  = P(158), CH  = P(200), GAP = P(24);
      const mx  = W / 2 - PDW / 2;   // popup 左上角 x
      const my  = H / 2 - PDH / 2;   // popup 左上角 y
      const pcx = W / 2;             // popup 中心 x
      const TITLE_H = P(28);
      const CARD_CY = my + TITLE_H + CH / 2 + P(10);
      const BTN_Y   = my + PDH - P(26);

      const bg = s(this.add.graphics().setDepth(compD + 1));
      bg.fillStyle(WD, 0.97); bg.fillRect(mx, my, PDW, PDH);
      bg.lineStyle(2, GOLD, 0.85); bg.strokeRect(mx, my, PDW, PDH);
      bg.lineStyle(1, GOLD, 0.3);  bg.strokeRect(mx + 4, my + 4, PDW - 8, PDH - 8);
      bg.fillStyle(WB, 1); bg.fillRect(mx, my, PDW, TITLE_H);
      bg.lineStyle(1, GOLD, 0.4); bg.lineBetween(mx, my + TITLE_H, mx + PDW, my + TITLE_H);

      s(this.add.text(pcx, my + TITLE_H / 2, '替換裝備', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 2));

      s(this.add.text(pcx, CARD_CY, '→', {
        fontSize: F(20), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 2));

      const isPct = (stat: string) => ['crit','atkSpeed','lifesteal','evasion','critDmg','dotBonus'].includes(stat);
      const fmtV  = (stat: string, v: number) => isPct(stat) ? `${(v * 100).toFixed(1)}%` : String(v);

      const drawItemCard = (
        item: import('../data/equipment-data').EquipmentItem,
        cx: number, labelTxt: string, labelColor: string,
      ) => {
        const cy = CARD_CY;
        const qColorNum = QUALITY_COLORS[item.quality] ?? 0xffffff;
        const qColorStr = '#' + qColorNum.toString(16).padStart(6, '0');

        const mg = s(this.add.graphics().setDepth(compD + 2));
        mg.fillStyle(0x1a0e06, 1);   mg.fillRect(cx - CW / 2, cy - CH / 2, CW, CH);
        mg.lineStyle(2, qColorNum, 0.8); mg.strokeRect(cx - CW / 2, cy - CH / 2, CW, CH);

        s(this.add.text(cx, cy - CH / 2 + P(8), labelTxt, {
          fontSize: F(15), fontStyle: 'bold', color: labelColor, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        s(this.add.text(cx, cy - CH / 2 + P(24), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: qColorStr, stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: CW - P(12) }, align: 'center',
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        s(this.add.text(cx, cy - CH / 2 + P(44), item.enhancement > 0 ? `+${item.enhancement} 強化` : '未強化', {
          fontSize: F(15), fontStyle: 'bold', color: item.enhancement > 0 ? '#ffd060' : '#667766', stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0).setDepth(compD + 3));

        let ay = cy - CH / 2 + P(62);
        item.affixes.forEach(a => {
          s(this.add.text(cx, ay, `${STAT_NAMES[a.stat]}  +${fmtV(a.stat, a.value)}`, {
            fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#000', strokeThickness: 1,
          }).setOrigin(0.5, 0).setDepth(compD + 3));
          ay += P(18);
        });

        if (item.behavior) {
          s(this.add.text(cx, cy + CH / 2 - P(8), BEHAVIOR_NAMES[item.behavior], {
            fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#000', strokeThickness: 1,
          }).setOrigin(0.5, 1).setDepth(compD + 3));
        }
      };

      const cardCX = CW / 2 + GAP / 2;
      drawItemCard(currentItem, pcx - cardCX, '現有', '#ff9999');
      drawItemCard(newItem,     pcx + cardCX, '新增', '#99ff99');

      // ── Buttons ─────────────────────────────────────────
      const BW = P(118), BH = P(30);

      const confirmBg = s(this.add.graphics().setDepth(compD + 2));
      confirmBg.fillStyle(0x0e2a0e, 1); confirmBg.fillRect(pcx - BW - 4, BTN_Y - BH / 2, BW, BH);
      confirmBg.lineStyle(1.5, 0x44cc44, 0.9); confirmBg.strokeRect(pcx - BW - 4, BTN_Y - BH / 2, BW, BH);
      s(this.add.text(pcx - BW / 2 - 4, BTN_Y, '確認替換', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 3));
      s(this.add.rectangle(pcx - BW / 2 - 4, BTN_Y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(compD + 4))
        .on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); closeComp(); onConfirm(); });

      const cancelBg = s(this.add.graphics().setDepth(compD + 2));
      cancelBg.fillStyle(0x1a1a1a, 1); cancelBg.fillRect(pcx + 4, BTN_Y - BH / 2, BW, BH);
      cancelBg.lineStyle(1.5, 0x666666, 0.9); cancelBg.strokeRect(pcx + 4, BTN_Y - BH / 2, BW, BH);
      s(this.add.text(pcx + BW / 2 + 4, BTN_Y, '取  消', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(compD + 3));
      s(this.add.rectangle(pcx + BW / 2 + 4, BTN_Y, BW, BH).setInteractive({ useHandCursor: true }).setDepth(compD + 4))
        .on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); closeComp(); });
    };

    // ── Detail overlay ────────────────────────────────────
    const showItemDetail = (item: import('../data/equipment-data').EquipmentItem) => {
      if (activeDetail) { activeDetail.destroy(); activeDetail = null; }
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH   = py + PH - areaTop - P(6);
      const rcx     = rightColX + rightColW / 2;

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - P(4), areaTop, rightColW + P(8), areaH);
      det.add(detBg);
      // 只擋右欄，讓左欄裝備格可直接點擊切換
      det.add(this.add.rectangle(rcx, areaTop + areaH / 2, rightColW + P(8), areaH, 0, 0).setInteractive());

      const backBtn = this.add.text(rightColX + P(8), areaTop + P(16), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeItem = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeItem());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + P(32), areaTop + P(60), item.texture).setDisplaySize(P(56), P(56)));

      det.add(this.add.text(rightColX + P(72), areaTop + P(38), item.enhancement > 0 ? `【+${item.enhancement}】${item.name}` : item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY2 = areaTop + P(58);
      if (item.behavior) {
        det.add(this.add.text(rightColX + P(72), statOffsetY2, `攻擊模式：${BEHAVIOR_NAMES[item.behavior]}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0));
        const viewBtn = this.add.text(rightColX + rightColW - P(8), statOffsetY2, '查看', {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
          backgroundColor: '#3a2000', padding: { x: 5, y: 2 },
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        viewBtn.on('pointerdown', () => showBehaviorModal(item.behavior!));
        det.add(viewBtn);
        statOffsetY2 += P(18);
      }
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
        statParts.push(`${STAT_NAMES[a.stat]} +${isPct ? (a.value * 100).toFixed(1) + '%' : a.value}`);
      });
      det.add(this.add.text(rightColX + P(72), statOffsetY2, statParts.join('\n'), {
        fontSize: F(15), fontStyle: 'bold', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = (item.behavior ? 1 : 0) * P(18) + statParts.length * P(18) + P(12);
      dg.fillStyle(WB, 1);   dg.fillRect(rightColX, areaTop + P(50) + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + P(51) + statBlockH, rightColW, 1);
      det.add(dg);

      const btnH = P(38), btnW = P(136), btnGap = P(8);
      const btnY = areaTop + areaH - P(28);

      if (item.slot === 'ring1') {
        // ── 飾品：飾品1/2 兩個槽位按鈕 + 強化按鈕 ──────────
        const slotBtnY = btnY - P(46);
        const hW  = (btnW - 4) / 2;
        const cx1 = rcx - btnW / 2 + hW / 2;
        const cx2 = rcx + btnW / 2 - hW / 2;
        const eq1 = PlayerStore.getEquipped()['ring1'];
        const eq2 = PlayerStore.getEquipped()['ring2'];

        const drawSlotBtn = (g: Phaser.GameObjects.Graphics, cx: number, occupied: boolean) => {
          g.fillStyle(0x5a3800, 1); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          g.fillStyle(GOLD, occupied ? 0.06 : 0.14); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          g.lineStyle(occupied ? 1.5 : 2, GOLD, occupied ? 0.5 : 0.85);
          g.strokeRect(cx - hW / 2, slotBtnY - btnH / 2, hW, btnH);
          if (!occupied) { g.fillStyle(GOLD, 0.35); g.fillRect(cx - hW / 2, slotBtnY - btnH / 2, hW, 2); }
        };
        const slotBtnGfx = this.add.graphics();
        drawSlotBtn(slotBtnGfx, cx1, !!eq1);
        drawSlotBtn(slotBtnGfx, cx2, !!eq2);
        det.add(slotBtnGfx);

        det.add(this.add.text(cx1, slotBtnY - P(7), '飾品 1', { fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx1, slotBtnY + P(9), eq1 ? eq1.name.slice(0, 6) : '空', { fontSize: F(15), fontStyle: 'bold', color: eq1 ? '#cc8888' : '#558855' }).setOrigin(0.5));
        det.add(this.add.text(cx2, slotBtnY - P(7), '飾品 2', { fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx2, slotBtnY + P(9), eq2 ? eq2.name.slice(0, 6) : '空', { fontSize: F(15), fontStyle: 'bold', color: eq2 ? '#cc8888' : '#558855' }).setOrigin(0.5));

        const hit1 = this.add.rectangle(cx1, slotBtnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit1.on('pointerdown', () => {
          if (eq1) { showEquipComparison(item, eq1, () => { PlayerStore.equipToSlot(item, 'ring1'); SaveStore.save(); closeItem(); }); }
          else { PlayerStore.equipToSlot(item, 'ring1'); SaveStore.save(); closeItem(); }
        });
        det.add(hit1);
        const hit2 = this.add.rectangle(cx2, slotBtnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit2.on('pointerdown', () => {
          if (eq2) { showEquipComparison(item, eq2, () => { PlayerStore.equipToSlot(item, 'ring2'); SaveStore.save(); closeItem(); }); }
          else { PlayerStore.equipToSlot(item, 'ring2'); SaveStore.save(); closeItem(); }
        });
        det.add(hit2);
        drawBtn(det, rcx, btnY, btnW, btnH,
          '強  化', 0x3a2800, 0xf0c040, '#ffe066',
          () => showEnhanceModal(item, () => { closeItem(); showItemDetail(item); }));
      } else {
        // ── 一般裝備：裝備 | 強化 ──────────────────────────
        const currentEquipped = PlayerStore.getEquipped()[item.slot as import('../data/equipment-data').EquipSlot];
        drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY, btnW, btnH,
          '裝  備', 0x5a3800, GOLD, '#e8c070',
          () => {
            if (currentEquipped) {
              showEquipComparison(item, currentEquipped, () => { PlayerStore.equip(item); SaveStore.save(); closeItem(); });
            } else {
              PlayerStore.equip(item); SaveStore.save(); closeItem();
            }
          });
        drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY, btnW, btnH,
          '強  化', 0x3a2800, 0xf0c040, '#ffe066',
          () => showEnhanceModal(item, () => { closeItem(); showItemDetail(item); }));
      }
    };

    const buildGrid = () => {
      if (gridWheelHandler) { this.input.off('wheel', gridWheelHandler); gridWheelHandler = null; }
      if (gridMoveHandler)  { this.input.off('pointermove', gridMoveHandler); gridMoveHandler = null; }
      gridLayer.removeAll(true);

      const slotKeys = tabDefs[activeTab].slotKeys;
      const items    = PlayerStore.getOwned().filter(it => slotKeys.includes(it.slot));

      if (items.length === 0) {
        gridLayer.add(this.add.text(rightColX + rightColW / 2, gridY + 32, '尚無裝備', {
          fontSize: F(15), fontStyle: 'bold', color: '#5a3820', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const rows      = Math.ceil(items.length / cols);
      const contentH  = rows * (cellSz + cellGap) - cellGap;
      let   scrollY   = 0;
      const maxScroll = Math.max(0, contentH - gridH);

      const scrollCnt = this.add.container(0, gridY);
      gridLayer.add(scrollCnt);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      maskShape.fillStyle(0xffffff);
      maskShape.fillRect(W / 2 + rightColX, H / 2 + gridY, rightColW, gridH);
      scrollCnt.setMask(maskShape.createGeometryMask());

      const applyScroll = (dy: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy, 0, maxScroll);
        scrollCnt.y = gridY - scrollY;
      };

      const gg = this.add.graphics();
      scrollCnt.add(gg);

      items.forEach((item, idx) => {
        const col  = idx % cols;
        const row  = Math.floor(idx / cols);
        const cx2  = gridLeft + col * (cellSz + cellGap);
        const cy2  = row * (cellSz + cellGap);   // relative to scrollCnt
        const col2 = slotDefs[activeTab].color;

        gg.fillStyle(WB, 1); gg.fillRect(cx2, cy2, cellSz, cellSz);
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + P(2), cy2 + P(2), cellSz - P(4), cellSz - P(4));
        gg.fillStyle(col2, 0.5); gg.fillRect(cx2, cy2, cellSz, P(3));
        gg.lineStyle(1.5, WL, 0.35); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        if (this.textures.exists(item.texture))
          scrollCnt.add(
            this.add.image(cx2 + cellSz / 2, cy2 + cellSz / 2 - P(8), item.texture).setDisplaySize(P(42), P(42)),
          );

        gg.fillStyle(0x000000, 0.5); gg.fillRect(cx2, cy2 + cellSz - P(18), cellSz, P(18));
        scrollCnt.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - P(10), item.enhancement > 0 ? `+${item.enhancement} ${item.name}` : item.name, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe8a0', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));

        const tap = this.add.rectangle(cx2 + cellSz / 2, cy2 + cellSz / 2, cellSz, cellSz)
          .setInteractive({ useHandCursor: true });
        tap.on('pointerdown', () => showItemDetail(item));
        scrollCnt.add(tap);
      });

      gridMoveHandler = (ptr: Phaser.Input.Pointer) => {
        if (!ptr.isDown) return;
        applyScroll(ptr.prevPosition.y - ptr.y);
      };
      gridWheelHandler = (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
        applyScroll((dy as number) * 0.6);
      };
      this.input.on('pointermove', gridMoveHandler!);
      this.input.on('wheel', gridWheelHandler!);
    };
    buildGrid();

    // ── Tab bar ───────────────────────────────────────────
    tabDefs.forEach((t, i) => {
      const lbl = this.add.text(rightColX + i * tabW + tabW / 2, tabY + tabH / 2, t.label, {
        fontSize: F(15), fontStyle: 'bold', color: i === 0 ? '#e8c070' : '#7a5830',
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5);
      tabLabels.push(lbl);
      container.add(lbl);

      const hit = this.add.rectangle(rightColX + i * tabW + tabW / 2, tabY + tabH / 2, tabW, tabH)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        tabLabels[activeTab].setStyle({ color: '#7a5830' });
        activeTab = i;
        tabLabels[activeTab].setStyle({ color: '#e8c070' });
        redrawTabs(activeTab);
        buildGrid();
      });
      container.add(hit);
    });

    // ── Reactive refresh ──────────────────────────────────
    const onStoreChange = () => {
      if (!container.active) return;
      buildTopSlots();
      buildStats();
      buildGrid();
    };
    PlayerStore.onChange(onStoreChange);
    CardStore.onChange(onStoreChange);
    const cleanupGrid = () => {
      PlayerStore.offChange(onStoreChange);
      CardStore.offChange(onStoreChange);
      if (gridWheelHandler) this.input.off('wheel', gridWheelHandler);
      if (gridMoveHandler)  this.input.off('pointermove', gridMoveHandler);
    };
    container.once('destroy', cleanupGrid);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupGrid);
  }

  // ── Item panel ──────────────────────────────────────────

  private showItemPanel(W: number, H: number): void {
    const PW = Math.min(P(480), W - P(20));
    const PH = Math.min(P(500), H - P(40));
    const D  = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
          ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        InventoryStore.offChange(onItemChange);
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL, 1);
    bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + P(2), ry + P(1), px + PW - P(2), ry + P(1));
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9);
    bg.fillRect(px, py, PW, P(36));
    bg.fillStyle(WH, 0.4);
    bg.fillRect(px, py + P(34), PW, P(2));
    bg.fillStyle(WB, 1);
    bg.fillRect(px, py + P(36), PW, P(1));
    container.add(bg);

    container.add(this.add.text(0, py + P(18), '物  品', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - P(20), py + P(18), '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      InventoryStore.offChange(onItemChange);
      container.destroy();
    });
    container.add(closeBtn);

    // ── Potion bar config ─────────────────────────────────
    const POTION_ITEMS = [
      { id: ITEM_POTION_HEALTH_S, name: '小型回復藥水' },
      { id: ITEM_POTION_REVIVE,   name: '復活藥水' },
    ];
    const potionSecY  = py + P(44);
    const potionSlotSZ = P(80), potionSlotGap = P(8);

    container.add(this.add.text(0, potionSecY + P(10), '快捷藥水配置', {
      fontSize: F(13), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5, 0));

    const potionSlotObjs: Array<{
      bg: Phaser.GameObjects.Graphics;
      icon: Phaser.GameObjects.Image | null;
      lbl: Phaser.GameObjects.Text;
    }> = [];

    const redrawPotionSlots = () => {
      potionSlotObjs.forEach((obj, idx) => {
        const itemId = PotionBarStore.getSlot(idx as 0 | 1);
        const qty    = itemId ? InventoryStore.getItemQty(itemId) : 0;
        const cx2    = px + P(10) + idx * (potionSlotSZ + potionSlotGap) + potionSlotSZ / 2;
        const sy     = potionSecY + P(28);
        const bx2    = cx2 - potionSlotSZ / 2;
        obj.bg.clear();
        obj.bg.fillStyle(0x1a1200, 1);
        obj.bg.fillRoundedRect(bx2, sy, potionSlotSZ, potionSlotSZ, P(6));
        obj.bg.lineStyle(P(2), itemId ? 0xddaa00 : 0x554422, itemId ? 0.85 : 0.4);
        obj.bg.strokeRoundedRect(bx2, sy, potionSlotSZ, potionSlotSZ, P(6));
        if (obj.icon) { obj.icon.destroy(); obj.icon = null; }
        if (itemId && this.textures.exists(`icon_${itemId}`)) {
          const img = this.add.image(cx2, sy + potionSlotSZ / 2 - P(10), `icon_${itemId}`)
            .setDisplaySize(P(36), P(36)).setAlpha(qty > 0 ? 1 : 0.35);
          container.add(img);
          obj.icon = img;
        }
        const itemName = POTION_ITEMS.find(p => p.id === itemId)?.name ?? '（空）';
        obj.lbl.setText(itemName).setPosition(cx2, sy + potionSlotSZ - P(8));
      });
    };

    [0, 1].forEach(idx => {
      const cx2 = px + P(10) + idx * (potionSlotSZ + potionSlotGap) + potionSlotSZ / 2;
      const sy   = potionSecY + P(28);
      const bx2  = cx2 - potionSlotSZ / 2;

      const bg = this.add.graphics();
      container.add(bg);
      const lbl = this.add.text(cx2, sy + potionSlotSZ - P(8), '', {
        fontSize: F(12), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
        wordWrap: { width: potionSlotSZ - P(4) }, align: 'center',
      }).setOrigin(0.5, 1);
      container.add(lbl);
      potionSlotObjs.push({ bg, icon: null, lbl });

      // slot label number
      container.add(this.add.text(bx2 + P(5), sy + P(5), `${idx + 1}`, {
        fontSize: F(12), fontStyle: 'bold', color: '#888866', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));

      // hit zone → open picker
      const hit = this.add.rectangle(cx2, sy + potionSlotSZ / 2, potionSlotSZ, potionSlotSZ)
        .setInteractive({ useHandCursor: true });
      container.add(hit);
      hit.on('pointerdown', () => {
        // show picker overlay inside the panel
        const pickObjs: Phaser.GameObjects.GameObject[] = [];
        const closePick = () => pickObjs.forEach(o => o.destroy());

        const pickBg = this.add.graphics();
        pickBg.fillStyle(0x1a1200, 0.97);
        pickBg.fillRoundedRect(px + P(4), py + P(37), PW - P(8), PH - P(41), P(6));
        pickBg.lineStyle(P(2), 0x554422, 0.8);
        pickBg.strokeRoundedRect(px + P(4), py + P(37), PW - P(8), PH - P(41), P(6));
        pickObjs.push(pickBg);
        container.add(pickBg);

        const pickBlocker = this.add.rectangle(
          px + P(4) + (PW - P(8)) / 2,
          py + P(37) + (PH - P(41)) / 2,
          PW - P(8), PH - P(41),
        ).setInteractive()
          .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => ev.stopPropagation());
        pickObjs.push(pickBlocker);
        container.add(pickBlocker);

        const backBtn = this.add.text(px + P(18), py + P(52), '← 返回', {
          fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
        backBtn.on('pointerdown', closePick);
        pickObjs.push(backBtn);
        container.add(backBtn);

        const titleTxt = this.add.text(0, py + P(52), `選擇藥水槽 ${idx + 1}`, {
          fontSize: F(14), fontStyle: 'bold', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5, 0.5);
        pickObjs.push(titleTxt);
        container.add(titleTxt);

        // "清除" button
        const clearBtn = this.add.text(px + PW - P(18), py + P(52), '清除', {
          fontSize: F(13), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(1, 0.5).setInteractive({ useHandCursor: true });
        clearBtn.on('pointerdown', () => {
          PotionBarStore.setSlot(idx as 0 | 1, null);
          SaveStore.save();
          redrawPotionSlots();
          closePick();
        });
        pickObjs.push(clearBtn);
        container.add(clearBtn);

        // list available potions (exclude whatever the other slot already has)
        const otherSlot = PotionBarStore.getSlot(idx === 0 ? 1 : 0 as 0 | 1);
        const available = POTION_ITEMS.filter(p => InventoryStore.getItemQty(p.id) > 0 && p.id !== otherSlot);
        if (available.length === 0) {
          const empty = this.add.text(0, py + P(100), '背包中沒有藥水', {
            fontSize: F(15), fontStyle: 'bold', color: '#7a5830', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5);
          pickObjs.push(empty);
          container.add(empty);
        } else {
          available.forEach((p, pi) => {
            const ey   = py + P(88) + pi * (P(70) + P(8));
            const rowBg = this.add.graphics();
            rowBg.fillStyle(0x2a1e00, 1);
            rowBg.fillRoundedRect(px + P(10), ey, PW - P(20), P(64), P(6));
            rowBg.lineStyle(P(1), 0x554422, 0.6);
            rowBg.strokeRoundedRect(px + P(10), ey, PW - P(20), P(64), P(6));
            pickObjs.push(rowBg);
            container.add(rowBg);

            if (this.textures.exists(`icon_${p.id}`)) {
              const img = this.add.image(px + P(46), ey + P(32), `icon_${p.id}`)
                .setDisplaySize(P(44), P(44));
              pickObjs.push(img);
              container.add(img);
            }

            const nameTxt = this.add.text(px + P(80), ey + P(18), p.name, {
              fontSize: F(14), fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 2,
            });
            pickObjs.push(nameTxt);
            container.add(nameTxt);

            const qtyTxt = this.add.text(px + P(80), ey + P(38), `數量：${InventoryStore.getItemQty(p.id)}`, {
              fontSize: F(13), color: '#ffe866', stroke: '#1a0800', strokeThickness: 1,
            });
            pickObjs.push(qtyTxt);
            container.add(qtyTxt);

            const rowHit = this.add.rectangle(px + P(10) + (PW - P(20)) / 2, ey + P(32), PW - P(20), P(64))
              .setInteractive({ useHandCursor: true });
            pickObjs.push(rowHit);
            container.add(rowHit);
            rowHit.on('pointerover',  () => rowBg.setAlpha(0.7));
            rowHit.on('pointerout',   () => rowBg.setAlpha(1));
            rowHit.on('pointerdown', () => {
              PotionBarStore.setSlot(idx as 0 | 1, p.id);
              SaveStore.save();
              redrawPotionSlots();
              closePick();
            });
          });
        }
      });
    });

    redrawPotionSlots();
    PotionBarStore.onChange(redrawPotionSlots);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PotionBarStore.offChange(redrawPotionSlots));

    // ── Item grid ─────────────────────────────────────────
    const gridY    = py + P(44) + P(120);
    const cellSz   = P(80);
    const cellGap  = P(8);
    const gridLeft = px + P(10);
    const cols     = Math.floor((PW - P(20) + cellGap) / (cellSz + cellGap));

    const gridContainer = this.add.container(0, 0);
    container.add(gridContainer);

    // ── Item detail overlay ───────────────────────────────
    const showItemDetail = (item: import('../data/inventory-store').InventoryItem) => {
      const det = this.add.container(0, 0);
      container.add(det);

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.97); detBg.fillRect(px + P(4), py + P(37), PW - P(8), PH - P(41));
      det.add(detBg);

      // Invisible blocker — prevents clicks from passing through to item grid behind
      const blocker = this.add.rectangle(
        px + P(4) + (PW - P(8)) / 2,
        py + P(37) + (PH - P(41)) / 2,
        PW - P(8), PH - P(41),
      ).setInteractive()
        .on('pointerdown', (_p: any, _lx: any, _ly: any, ev: any) => ev.stopPropagation());
      det.add(blocker);

      const backBtn = this.add.text(px + P(16), py + P(51), '← 返回', {
        fontSize: F(15), fontStyle: 'bold', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => det.destroy());
      det.add(backBtn);

      const iconKey = `icon_${item.id}`;
      if (this.textures.exists(iconKey)) {
        const iconBg = this.add.graphics();
        iconBg.fillStyle(WM, 1); iconBg.fillRect(-P(36), py + P(76), P(72), P(72));
        iconBg.lineStyle(2, WL, 0.6); iconBg.strokeRect(-P(36), py + P(76), P(72), P(72));
        det.add(iconBg);
        det.add(this.add.image(0, py + P(112), iconKey).setDisplaySize(P(56), P(56)));
      }

      det.add(this.add.text(0, py + P(160), item.name, {
        fontSize: F(16), fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));

      const qtyBg = this.add.graphics();
      qtyBg.fillStyle(WM, 1); qtyBg.fillRect(-P(40), py + P(182), P(80), P(26));
      qtyBg.lineStyle(1, WL, 0.4); qtyBg.strokeRect(-P(40), py + P(182), P(80), P(26));
      det.add(qtyBg);
      det.add(this.add.text(0, py + P(195), `數量：${item.qty}`, {
        fontSize: F(15), fontStyle: 'bold', color: '#e8e070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      const dg = this.add.graphics();
      dg.fillStyle(WB, 1);  dg.fillRect(px + P(16), py + P(218), PW - P(32), P(1));
      dg.fillStyle(WH, 0.3); dg.fillRect(px + P(16), py + P(219), PW - P(32), P(1));
      det.add(dg);

      det.add(this.add.text(0, py + P(232), '消耗材料・可用於製作裝備', {
        fontSize: F(15), fontStyle: 'bold', color: '#8aaa88', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));
    };

    const buildGrid = () => {
      gridContainer.removeAll(true);
      const allItems = InventoryStore.getAllItems();

      if (allItems.length === 0) {
        gridContainer.add(this.add.text(0, gridY + 40, '背包是空的', {
          fontSize: F(15), fontStyle: 'bold', color: '#7a5830', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const gg = this.add.graphics();
      gridContainer.add(gg);
      allItems.forEach((item, idx) => {
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const cx2 = gridLeft + col * (cellSz + cellGap);
        const cy2 = gridY    + row * (cellSz + cellGap);

        gg.fillStyle(WB, 1); gg.fillRect(cx2, cy2, cellSz, cellSz);
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + P(2), cy2 + P(2), cellSz - P(4), cellSz - P(4));
        gg.fillStyle(0x70b858, 0.6); gg.fillRect(cx2, cy2, cellSz, P(3));
        gg.lineStyle(1.5, WL, 0.4); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        const iconKey = `icon_${item.id}`;
        if (this.textures.exists(iconKey)) {
          gridContainer.add(
            this.add.image(cx2 + cellSz / 2, cy2 + P(34), iconKey).setDisplaySize(P(44), P(44)),
          );
        }

        gridContainer.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - P(4), item.name, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: cellSz - P(6) }, align: 'center',
        }).setOrigin(0.5, 1));

        gridContainer.add(this.add.text(cx2 + cellSz - P(3), cy2 + P(4), `×${item.qty}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffe866', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(1, 0));

        const tap = this.add.rectangle(cx2 + cellSz / 2, cy2 + cellSz / 2, cellSz, cellSz)
          .setInteractive({ useHandCursor: true });
        tap.on('pointerup', () => showItemDetail(item));
        gridContainer.add(tap);
      });
    };

    buildGrid();

    const onItemChange = () => {
      if (!container.active) return;
      buildGrid();
    };
    InventoryStore.onChange(onItemChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => InventoryStore.offChange(onItemChange));
  }

  // ── Center hero ─────────────────────────────────────────

  // ── Card Window ─────────────────────────────────────────

  private openCardWindow(W: number, H: number): void {
    const PW = Math.min(W - P(16), P(480));
    const PH = Math.min(H - P(20), P(560));
    const D  = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
          ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        cleanup();
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell (same wood style)
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - P(3), py - P(3), PW + P(6), PH + P(6));
    bg.fillStyle(WL, 1);
    bg.fillRect(px - P(2), py - P(2), PW + P(4), PH + P(4));
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / P(24)); row++) {
      const ry = py + row * P(24);
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + P(2), ry, px + PW - P(2), ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + P(2), ry + 1, px + PW - P(2), ry + 1);
    }
    [[px, py], [px + PW - P(8), py], [px, py + PH - P(8)], [px + PW - P(8), py + PH - P(8)]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, P(8), P(8));
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + P(2), ry + P(2), P(4), P(4));
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, P(36));
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + P(34), PW, P(2));
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + P(36), PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + P(18), '卡  片', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - P(20), py + P(18), '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ hitArea: new Phaser.Geom.Rectangle(-P(18), -P(16), P(44), P(44)), hitAreaCallback: Phaser.Geom.Rectangle.Contains, useHandCursor: true });
    closeBtn.on('pointerdown', () => { cleanup(); container.destroy(); });
    container.add(closeBtn);

    // Layout constants
    const CARD_W   = P(72);
    const CARD_H   = P(96);
    const SLOT_GAP = P(8);
    const slotsTotW = CARD_SLOT_COUNT * CARD_W + (CARD_SLOT_COUNT - 1) * SLOT_GAP;
    const slotsX0   = -slotsTotW / 2;
    const slotsY    = py + P(58);
    const INV_TOP   = slotsY + CARD_H + P(24);
    const INV_H     = py + PH - INV_TOP - P(8);
    const INV_COLS = 5;
    const INV_GAP   = P(10);
    const invTotW   = INV_COLS * CARD_W + (INV_COLS - 1) * INV_GAP;
    const invX0     = -invTotW / 2;

    // ── Equipped slots label ──────────────────────────────
    container.add(this.add.text(0, slotsY - P(14), '裝備中', {
      fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5));

    // ── Content sub-container (rebuilt on change) ──────────
    let contentCnt = this.add.container(0, 0);
    container.add(contentCnt);

    // ── Helper: 持有欄卡片（木質風格）────────────────────────
    const drawInvCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x    = cx - w / 2, y = cy - h / 2;
      const SILV = 0xb87333;   // 銅色框
      // 陰影
      g.fillStyle(0x000000, 0.35);
      g.fillRect(x + P(2), y + P(2), w, h);
      // 底色
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：銀灰色
      g.lineStyle(2.5, SILV, 0.9);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, SILV, 0.4);
      g.strokeRect(x + P(3), y + P(3), w - P(6), h - P(6));
      // 四角裝飾點
      const cr = P(3);
      g.fillStyle(SILV, 0.85);
      g.fillCircle(x + cr + P(1),     y + cr + P(1),     cr);
      g.fillCircle(x + w - cr - P(1), y + cr + P(1),     cr);
      g.fillCircle(x + cr + P(1),     y + h - cr - P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + h - cr - P(1), cr);
      // 上下橫紋
      g.lineStyle(1.5, SILV, 0.45);
      g.lineBetween(x + P(10), y + P(8),     x + w - P(10), y + P(8));
      g.lineBetween(x + P(10), y + h - P(8), x + w - P(10), y + h - P(8));
    };

    // ── Helper: 菁英卡片（銀框質感）─────────────────────────
    const drawEliteCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x    = cx - w / 2, y = cy - h / 2;
      const SILV = 0x9aacb8;   // 銀色框
      // 陰影
      g.fillStyle(0x000000, 0.4);
      g.fillRect(x + 2, y + 2, w, h);
      // 底色
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：銀色
      g.lineStyle(2.5, SILV, 0.95);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, SILV, 0.45);
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      // 四角裝飾點
      const cr = 3;
      g.fillStyle(SILV, 0.9);
      g.fillCircle(x + cr + 1,     y + cr + 1,     cr);
      g.fillCircle(x + w - cr - 1, y + cr + 1,     cr);
      g.fillCircle(x + cr + 1,     y + h - cr - 1, cr);
      g.fillCircle(x + w - cr - 1, y + h - cr - 1, cr);
      // 上下橫紋
      g.lineStyle(1.5, SILV, 0.5);
      g.lineBetween(x + 10, y + 8,     x + w - 10, y + 8);
      g.lineBetween(x + 10, y + h - 8, x + w - 10, y + h - 8);
    };

    // ── Helper: Boss 卡片（金框質感）─────────────────────────
    const drawBossCard = (
      g: Phaser.GameObjects.Graphics,
      cx: number, cy: number, w: number, h: number,
    ) => {
      const x = cx - w / 2, y = cy - h / 2;
      const GOLD = 0xf0c040;
      // 陰影
      g.fillStyle(0x000000, 0.5);
      g.fillRect(x + P(3), y + P(3), w, h);
      // 底色（同小怪卡）
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：金色粗框
      g.lineStyle(2.5, GOLD, 0.95);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, GOLD, 0.45);
      g.strokeRect(x + P(3), y + P(3), w - P(6), h - P(6));
      // 四角裝飾點
      const cr = P(3);
      g.fillStyle(GOLD, 0.9);
      g.fillCircle(x + cr + P(1),     y + cr + P(1),     cr);
      g.fillCircle(x + w - cr - P(1), y + cr + P(1),     cr);
      g.fillCircle(x + cr + P(1),     y + h - cr - P(1), cr);
      g.fillCircle(x + w - cr - P(1), y + h - cr - P(1), cr);
      // 上下橫紋
      g.lineStyle(1.5, GOLD, 0.55);
      g.lineBetween(x + P(10), y + P(8),     x + w - P(10), y + P(8));
      g.lineBetween(x + P(10), y + h - P(8), x + w - P(10), y + h - P(8));
    };

    // ── Slot-pick overlay ─────────────────────────────────
    let slotPickLayer: Phaser.GameObjects.Container | null = null;

    const clearSlotPick = () => { slotPickLayer?.destroy(); slotPickLayer = null; };

    const showComparison = (
      newCardId: string,
      newDef: NonNullable<ReturnType<typeof getCardDef>>,
      oldCardId: string,
      slot: number,
    ) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 6);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.65).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      const oldDef = getCardDef(oldCardId)!;

      // ── fixed layout ──────────────────────────────────────
      const PDW    = P(340), PDH = P(310);
      const CW     = P(130), CH  = P(175);
      const GAP    = P(20);
      const CARD_Y = -P(20);
      const BTN_Y  = PDH / 2 - P(24);
      const popY   = 0;

      // backdrop
      const pbg = this.add.graphics();
      pbg.fillStyle(0x1a0e06, 0.97);
      pbg.fillRect(-PDW / 2, popY - PDH / 2, PDW, PDH);
      pbg.lineStyle(2, 0xc89040, 0.8);
      pbg.strokeRect(-PDW / 2, popY - PDH / 2, PDW, PDH);
      pbg.lineStyle(1, 0xc89040, 0.3);
      pbg.strokeRect(-PDW / 2 + P(4), popY - PDH / 2 + P(4), PDW - P(8), PDH - P(8));
      // title bar
      pbg.fillStyle(0x2a1608, 1);
      pbg.fillRect(-PDW / 2, popY - PDH / 2, PDW, P(26));
      pbg.lineStyle(1, 0xc89040, 0.4);
      pbg.lineBetween(-PDW / 2, popY - PDH / 2 + P(26), PDW / 2, popY - PDH / 2 + P(26));
      slotPickLayer.add(pbg);

      slotPickLayer.add(this.add.text(0, popY - PDH / 2 + P(13), '替換卡片', {
        fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));

      // arrow
      slotPickLayer.add(this.add.text(0, popY + CARD_Y, '→', {
        fontSize: F(20), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));

      // mini card
      const drawMiniCard = (def: NonNullable<ReturnType<typeof getCardDef>>, cx: number, label: string, labelColor: string) => {
        const cy      = popY + CARD_Y;
        const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
        const frameC  = monTier >= 5 ? 0xf0c040 : monTier === 3 ? 0x60a8e0 : 0x9aacb8;
        const mg = this.add.graphics();
        mg.fillStyle(0x2a1a08, 1);
        mg.fillRect(cx - CW / 2, cy - CH / 2, CW, CH);
        mg.lineStyle(2, frameC, 0.9);
        mg.strokeRect(cx - CW / 2, cy - CH / 2, CW, CH);
        slotPickLayer!.add(mg);

        // label (現有 / 新增)
        slotPickLayer!.add(this.add.text(cx, cy - CH / 2 + P(8), label, {
          fontSize: F(15), fontStyle: 'bold', color: labelColor, stroke: '#000', strokeThickness: 1,
        }).setOrigin(0.5, 0));

        // card name
        slotPickLayer!.add(this.add.text(cx, cy - CH / 2 + P(24), def.name, {
          fontSize: F(15), fontStyle: 'bold', color: '#f0d080', stroke: '#000', strokeThickness: 2,
          wordWrap: { width: CW - P(12) }, align: 'center',
        }).setOrigin(0.5, 0));

        // monster sprite — same scale logic as detail popup
        const monDef = getMonsterDef(def.monsterId);
        if (monDef) {
          try {
            const sprScale = monsterCardScale(monTier);
            const sp = this.add.sprite(cx, cy - P(8), `${monDef.spriteKey}_idle`, 0).setScale(sprScale);
            if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
            slotPickLayer!.add(sp);
          } catch { /* */ }
        }

        // effect desc
        slotPickLayer!.add(this.add.text(cx, cy + CH / 2 - P(8), def.desc, {
          fontSize: F(15), fontStyle: 'bold', color: '#c8a060', stroke: '#000', strokeThickness: 1,
          wordWrap: { width: CW - P(12), useAdvancedWrap: true }, align: 'center', maxLines: 3,
        }).setOrigin(0.5, 1));
      };

      const cardCX = CW / 2 + GAP / 2;
      drawMiniCard(oldDef,  -cardCX, '現有', '#ff9999');
      drawMiniCard(newDef,   cardCX, '新增', '#99ff99');

      // ── Buttons (inside frame) ──────────────────────────
      const BW = P(118), BH = P(30);
      const btnY = popY + BTN_Y;

      const confirmBg = this.add.graphics();
      confirmBg.fillStyle(0x0e2a0e, 1); confirmBg.fillRect(-BW - P(4), btnY - BH / 2, BW, BH);
      confirmBg.lineStyle(1.5, 0x44cc44, 0.9); confirmBg.strokeRect(-BW - P(4), btnY - BH / 2, BW, BH);
      slotPickLayer.add(confirmBg);
      slotPickLayer.add(this.add.text(-BW / 2 - P(4), btnY, '確認替換', {
        fontSize: F(15), fontStyle: 'bold', color: '#88ff88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));
      const confirmHit = this.add.rectangle(-BW / 2 - P(4), btnY, BW, BH).setInteractive({ useHandCursor: true });
      confirmHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        CardStore.equip(newCardId, slot);
        SaveStore.save();
        clearSlotPick();
      });
      slotPickLayer.add(confirmHit);

      const cancelBg = this.add.graphics();
      cancelBg.fillStyle(0x1a1a1a, 1); cancelBg.fillRect(P(4), btnY - BH / 2, BW, BH);
      cancelBg.lineStyle(1.5, 0x666666, 0.9); cancelBg.strokeRect(P(4), btnY - BH / 2, BW, BH);
      slotPickLayer.add(cancelBg);
      slotPickLayer.add(this.add.text(BW / 2 + P(4), btnY, '取  消', {
        fontSize: F(15), fontStyle: 'bold', color: '#aaaaaa', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5));
      const cancelHit = this.add.rectangle(BW / 2 + P(4), btnY, BW, BH).setInteractive({ useHandCursor: true });
      cancelHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); clearSlotPick(); });
      slotPickLayer.add(cancelHit);
    };

    // 從裝備槽出發，選庫存卡片來比較/替換
    const enterInventoryPick = (fromSlot: number, fromCardId: string) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 5);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.5).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      slotPickLayer.add(this.add.text(0, slotsY - P(18), '請選擇要替換進來的卡片　（點擊空白處取消）', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1));

      const invItems = CardStore.getInventory();
      const INV_COLS2 = INV_COLS, ROW_H2 = CARD_H + INV_GAP;

      invItems.forEach(({ cardId, qty }, idx) => {
        const def = getCardDef(cardId);
        if (!def) return;
        const col = idx % INV_COLS2;
        const row = Math.floor(idx / INV_COLS2);
        const cx  = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
        const cy  = INV_TOP + row * ROW_H2 + CARD_H / 2;

        // 疊帶上限檢查（排除 fromSlot 本身）
        const eq = CardStore.getEquipped();
        const countElsewhere = eq.filter((s, i) => s === cardId && i !== fromSlot).length;
        const canEquip = countElsewhere < CardStore.getStackLimit(cardId);

        const cg = this.add.graphics();
        const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
        monTier >= 5 ? drawBossCard(cg, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(cg, cx, cy, CARD_W, CARD_H) : drawInvCard(cg, cx, cy, CARD_W, CARD_H);
        slotPickLayer!.add(cg);
        drawCardFace(slotPickLayer!, def, cx, cy, '', qty);

        if (canEquip) {
          const hg = this.add.graphics();
          hg.lineStyle(2.5, 0x44ff88, 1);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
          hg.fillStyle(0x44ff88, 0.12);
          hg.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotPickLayer!.add(hg);

          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            showComparison(cardId, def as NonNullable<ReturnType<typeof getCardDef>>, fromCardId, fromSlot);
          });
          slotPickLayer!.add(hit);
        } else {
          const dimOvl = this.add.graphics();
          dimOvl.fillStyle(0x000000, 0.5);
          dimOvl.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotPickLayer!.add(dimOvl);
        }
      });
    };

    const enterSlotPick = (pickCardId: string, pickDef: NonNullable<ReturnType<typeof getCardDef>>) => {
      clearSlotPick();
      slotPickLayer = this.add.container(0, 0).setDepth(D + 5);
      container.add(slotPickLayer);

      const dim = this.add.rectangle(0, 0, W, H, 0x000000, 0.45).setInteractive();
      dim.on('pointerdown', clearSlotPick);
      slotPickLayer.add(dim);

      slotPickLayer.add(this.add.text(0, slotsY - P(18), '請選擇要配置的格子　（點擊空白處取消）', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5, 1));

      const eq = CardStore.getEquipped();
      for (let i = 0; i < CARD_SLOT_COUNT; i++) {
        const cx = slotsX0 + i * (CARD_W + SLOT_GAP) + CARD_W / 2;
        const cy = slotsY + CARD_H / 2;

        const countElsewhere = eq.filter((s, idx) => s === pickCardId && idx !== i).length;
        const canEquip = countElsewhere < CardStore.getStackLimit(pickCardId);

        const hg = this.add.graphics();
        if (canEquip) {
          hg.lineStyle(2.5, 0x44ff88, 1);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
          hg.fillStyle(0x44ff88, 0.18);
          hg.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
        } else {
          hg.lineStyle(2, 0x666666, 0.5);
          hg.strokeRect(cx - CARD_W / 2 - P(3), cy - CARD_H / 2 - P(3), CARD_W + P(6), CARD_H + P(6));
        }
        slotPickLayer.add(hg);

        if (canEquip) {
          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            const currentId = eq[i];
            if (currentId) {
              const currentDef = getCardDef(currentId);
              if (currentDef) showComparison(pickCardId, pickDef, currentId, i);
              else { CardStore.equip(pickCardId, i); SaveStore.save(); clearSlotPick(); }
            } else {
              CardStore.equip(pickCardId, i);
              SaveStore.save();
              clearSlotPick();
            }
          });
          slotPickLayer.add(hit);
        }
      }
    };

    // ── Card detail popup (card-styled) ───────────────────
    let detailPopup: Phaser.GameObjects.Container | null = null;
    const showCardDetail = (
      def: ReturnType<typeof getCardDef> & object,
      equippedSlot: number | null,   // null = from inventory
      cardId: string,
    ) => {
      detailPopup?.destroy();
      const PDW      = P(200);
      const PDH      = P(310);
      const BANNER_H = P(52);
      const D2       = D + 10;

      const pop = this.add.container(0, 0).setDepth(D2);
      container.add(pop);
      detailPopup = pop;

      // Full-panel dim backdrop — click to close
      const dimBg = this.add.rectangle(0, 0, W, H, 0x000000, 0.6).setInteractive();
      dimBg.on('pointerdown', () => { pop.destroy(); detailPopup = null; });
      pop.add(dimBg);

      // ── Card body ─────────────────────────────────────
      const monDefPre  = getMonsterDef(def.monsterId);
      const monTierPre = monDefPre?.tier ?? 1;
      const isBoss     = monTierPre >= 5;
      const isElite    = monTierPre === 3;
      // Boss=金, 菁英=銀, 小怪=銅
      const FRAME_CLR  = isBoss ? 0xf0c040 : isElite ? 0x9aacb8 : 0xb87333;
      const FRAME_CLR2 = isBoss ? 0xffee88 : isElite ? 0xc8d8e0 : 0xd4a070;
      const cg = this.add.graphics();

      // 陰影
      cg.fillStyle(0x000000, 0.5);
      cg.fillRect(-PDW / 2 + P(4), -PDH / 2 + P(4), PDW, PDH);

      // 底色（亮木色）
      cg.fillStyle(WMI, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 外框粗線（加外發光層）
      cg.lineStyle(6, FRAME_CLR, 0.2);
      cg.strokeRect(-PDW / 2 - P(2), -PDH / 2 - P(2), PDW + P(4), PDH + P(4));
      cg.lineStyle(4, FRAME_CLR, 0.95);
      cg.strokeRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 內框細線
      cg.lineStyle(1.5, FRAME_CLR2, 0.6);
      cg.strokeRect(-PDW / 2 + P(5), -PDH / 2 + P(5), PDW - P(10), PDH - P(10));

      // 四角裝飾點
      const PCR = P(4);
      cg.fillStyle(FRAME_CLR, 0.9);
      cg.fillCircle(-PDW / 2 + PCR + P(1), -PDH / 2 + PCR + P(1), PCR);
      cg.fillCircle( PDW / 2 - PCR - P(1), -PDH / 2 + PCR + P(1), PCR);
      cg.fillCircle(-PDW / 2 + PCR + P(1),  PDH / 2 - PCR - P(1), PCR);
      cg.fillCircle( PDW / 2 - PCR - P(1),  PDH / 2 - PCR - P(1), PCR);

      // Banner（標題區）
      cg.fillStyle(WM, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, BANNER_H);

      // Banner 上下橫紋
      cg.lineStyle(1.5, FRAME_CLR, 0.6);
      cg.lineBetween(-PDW / 2 + P(14), -PDH / 2 + P(6),          PDW / 2 - P(14), -PDH / 2 + P(6));
      cg.lineBetween(-PDW / 2 + P(14), -PDH / 2 + BANNER_H - P(6), PDW / 2 - P(14), -PDH / 2 + BANNER_H - P(6));

      // 底部橫紋
      cg.lineStyle(1.5, FRAME_CLR2, 0.4);
      cg.lineBetween(-PDW / 2 + P(14), PDH / 2 - P(10), PDW / 2 - P(14), PDH / 2 - P(10));
      pop.add(cg);

      // ── Banner: card name (vertically centered) ───────
      pop.add(this.add.text(0, -PDH / 2 + BANNER_H / 2, def.name, {
        fontSize: F(15), fontStyle: 'bold',
        color: '#f0d080',
        stroke: '#1a0800', strokeThickness: 2,
        wordWrap: { width: PDW - P(20), useAdvancedWrap: true }, align: 'center',
        maxLines: 2,
      }).setOrigin(0.5, 0.5));

      // ── Monster sprite (animated) ─────────────────────
      const SPRITE_Y = -PDH / 2 + BANNER_H + P(62);
      const monDef = getMonsterDef(def.monsterId);
      if (monDef) {
        const spriteKey  = `${monDef.spriteKey}_idle`;
        const animKey    = `card_idle_${def.monsterId}`;
        const spriteScale = monsterDetailScale(monDef.tier);
        try {
          if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
            this.anims.create({
              key: animKey,
              frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: 5 }),
              frameRate: 8, repeat: -1,
            });
          }
          const sp = this.add.sprite(0, SPRITE_Y, spriteKey, 0).setScale(spriteScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          if (this.anims.exists(animKey)) sp.play(animKey);
          pop.add(sp);
        } catch { /* texture not loaded */ }
      }

      // ── Divider ──────────────────────────────────────
      const DIVIDER_Y = SPRITE_Y + P(56);
      const dg = this.add.graphics();
      dg.lineStyle(1, WH, 0.4);
      dg.lineBetween(-PDW / 2 + P(16), DIVIDER_Y, PDW / 2 - P(16), DIVIDER_Y);
      pop.add(dg);

      // ── Effect description ────────────────────────────
      pop.add(this.add.text(0, DIVIDER_Y + P(10), def.desc, {
        fontSize: F(15), fontStyle: 'bold', color: '#c8a060',
        stroke: '#1a0800', strokeThickness: 1,
        wordWrap: { width: PDW - P(24), useAdvancedWrap: true }, align: 'center',
        maxLines: 3,
      }).setOrigin(0.5, 0));

      // ── Tier & stack limit info ────────────────────────
      const detMonTier   = getMonsterDef(def.monsterId)?.tier ?? 1;
      const detTierName  = detMonTier >= 5 ? 'Boss' : detMonTier === 3 ? '菁英' : '一般';
      const detLimit     = CardStore.getStackLimit(cardId);
      const detEquipped  = CardStore.getEquipped().filter(s => s === cardId).length;
      const detTierColor = detMonTier >= 5 ? '#ffd060' : detMonTier === 3 ? '#80c8ff' : '#88dd88';
      pop.add(this.add.text(0, PDH / 2 - P(56), `裝備上限 ${detEquipped}/${detLimit}`, {
        fontSize: F(15), fontStyle: 'bold', color: detTierColor,
        stroke: '#1a0800', strokeThickness: 1, align: 'center',
      }).setOrigin(0.5, 0.5));

      // ── Action buttons ────────────────────────────────
      const isEquipped = equippedSlot !== null;
      const atDetLimit = !isEquipped && detEquipped >= detLimit;
      const BH = P(32), btnY = PDH / 2 - P(28);

      if (isEquipped) {
        // 裝備中：「取下」左、「替換」右
        const HBW = (PDW - P(48)) / 2;
        const makeBtn = (ox: number, label: string, bgC: number, borderC: number, txtC: string, cb: () => void) => {
          const bg = this.add.graphics();
          bg.fillStyle(bgC, 1);    bg.fillRect(ox - HBW / 2, btnY - BH / 2, HBW, BH);
          bg.lineStyle(1.5, borderC, 0.9); bg.strokeRect(ox - HBW / 2, btnY - BH / 2, HBW, BH);
          pop.add(bg);
          pop.add(this.add.text(ox, btnY, label, {
            fontSize: F(15), fontStyle: 'bold', color: txtC, stroke: '#000', strokeThickness: 2,
          }).setOrigin(0.5));
          const hit = this.add.rectangle(ox, btnY, HBW, BH).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', (ptr: Phaser.Input.Pointer) => { ptr.event.stopPropagation(); cb(); });
          pop.add(hit);
        };
        const ox0 = -(HBW / 2 + P(4)), ox1 = HBW / 2 + P(4);
        makeBtn(ox0, '取  下', 0x3a1010, 0xcc4444, '#ff8888', () => {
          CardStore.unequip(equippedSlot!);
          SaveStore.save();
          pop.destroy(); detailPopup = null;
        });
        const hasInv = CardStore.getInventory().some(({ cardId: cid }) => {
          const eq = CardStore.getEquipped();
          return eq.filter((s, i) => s === cid && i !== equippedSlot!).length < CardStore.getStackLimit(cid);
        });
        if (hasInv) {
          makeBtn(ox1, '替  換', 0x0a1e30, 0x4488cc, '#88ccff', () => {
            pop.destroy(); detailPopup = null;
            enterInventoryPick(equippedSlot!, cardId);
          });
        }
      } else {
        // 庫存中：「配置」或「已達上限」
        const BW = PDW - P(40);
        const btnBg = this.add.graphics();
        btnBg.fillStyle(atDetLimit ? 0x2a2a2a : 0x0e2a0e, 1);
        btnBg.fillRect(-BW / 2, btnY - BH / 2, BW, BH);
        btnBg.lineStyle(1.5, atDetLimit ? 0x666666 : 0x44cc44, 0.9);
        btnBg.strokeRect(-BW / 2, btnY - BH / 2, BW, BH);
        pop.add(btnBg);
        pop.add(this.add.text(0, btnY, atDetLimit ? '已達上限' : '配  置', {
          fontSize: F(15), fontStyle: 'bold',
          color: atDetLimit ? '#666666' : '#88ff88', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5));
        if (!atDetLimit) {
          const btnHit = this.add.rectangle(0, btnY, BW, BH).setInteractive({ useHandCursor: true });
          btnHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            ptr.event.stopPropagation();
            pop.destroy(); detailPopup = null;
            enterSlotPick(cardId, def as NonNullable<ReturnType<typeof getCardDef>>);
          });
          pop.add(btnHit);
        }
      }
    };

    // ── Helper: draw card face (name only) ─────────────────
    const drawCardFace = (
      target: Phaser.GameObjects.Container,
      def: ReturnType<typeof getCardDef> & object,
      cx: number, cy: number,
      _slotLabel: string,
      qty?: number,
    ) => {
      // A/B/C 浮水印
      const variant = def.id.slice(-1).toUpperCase();
      if (variant === 'A' || variant === 'B' || variant === 'C') {
        const vColor = '#ffffff';
        target.add(this.add.text(cx, cy, variant, {
          fontSize: F(88), fontStyle: 'bold', color: vColor,
        }).setOrigin(0.5).setAlpha(0.15));
      }

      // 數量標籤（右上角）
      if (qty !== undefined && qty > 1) {
        target.add(this.add.text(cx + CARD_W / 2 - P(2), cy - CARD_H / 2 + P(3), `×${qty}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffee88', stroke: '#000000', strokeThickness: 1,
        }).setOrigin(1, 0));
      }
      // 怪物精靈圖，播放 idle 動畫
      const monDef = getMonsterDef(def.monsterId);
      if (monDef) {
        const spriteKey = `${monDef.spriteKey}_idle`;
        const animKey   = `card_idle_${def.monsterId}`;
        try {
          if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
            this.anims.create({
              key: animKey,
              frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: 5 }),
              frameRate: 8, repeat: -1,
            });
          }
          const baseScale = monsterCardScale(monDef.tier);
          const sp = this.add.sprite(cx, cy, spriteKey, 0).setScale(baseScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          if (this.anims.exists(animKey)) sp.play(animKey);
          target.add(sp);
        } catch { /* 紋理尚未載入 */ }
      }
    };

    // ── Rebuild function ───────────────────────────────────
    let savedScrollY = 0;   // 保留 scroll 位置跨 rebuild
    const rebuild = () => {
      detailPopup?.destroy();
      detailPopup = null;
      contentCnt.destroy();
      contentCnt = this.add.container(0, 0);
      container.add(contentCnt);

      const eq       = CardStore.getEquipped();
      const invItems = CardStore.getInventory();

      // ── Equipped row ──────────────────────────────────
      for (let i = 0; i < CARD_SLOT_COUNT; i++) {
        const cx     = slotsX0 + i * (CARD_W + SLOT_GAP) + CARD_W / 2;
        const cy     = slotsY + CARD_H / 2;
        const cardId = eq[i];
        const def    = cardId ? getCardDef(cardId) : null;

        const slotGfx = this.add.graphics();
        if (def) {
          const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
          monTier >= 5 ? drawBossCard(slotGfx, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(slotGfx, cx, cy, CARD_W, CARD_H) : drawInvCard(slotGfx, cx, cy, CARD_W, CARD_H);
        } else {
          slotGfx.lineStyle(1, WM, 0.5);
          slotGfx.strokeRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          slotGfx.fillStyle(WD, 0.3);
          slotGfx.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
        }
        contentCnt.add(slotGfx);

        if (def) {
          drawCardFace(contentCnt, def, cx, cy, `${i + 1}`);
          const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
          hit.on('pointerdown', () => showCardDetail(def, i, cardId!));
          contentCnt.add(hit);
        } else {
          contentCnt.add(this.add.text(cx, cy, `${i + 1}`, {
            fontSize: F(15), fontStyle: 'bold', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5));
        }
      }

      // Separator
      const sepGfx = this.add.graphics();
      sepGfx.fillStyle(WB, 1);   sepGfx.fillRect(px + P(8), INV_TOP - P(10), PW - P(16), 1);
      sepGfx.fillStyle(WH, 0.2); sepGfx.fillRect(px + P(8), INV_TOP - P(9),  PW - P(16), 1);
      contentCnt.add(sepGfx);
      contentCnt.add(this.add.text(0, INV_TOP - P(5), '持有卡片', {
        fontSize: F(15), fontStyle: 'bold', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5, 1));

      // ── Inventory scroll area ──────────────────────────
      if (invItems.length === 0) {
        contentCnt.add(this.add.text(0, INV_TOP + INV_H / 2, '尚未獲得任何卡片', {
          fontSize: F(15), fontStyle: 'bold', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const ROWS      = Math.ceil(invItems.length / INV_COLS);
      const ROW_H     = CARD_H + INV_GAP;
      const contentH  = ROWS * ROW_H;
      const maxScroll = Math.max(0, contentH - INV_H);
      savedScrollY    = Phaser.Math.Clamp(savedScrollY, 0, maxScroll);

      const scrollCnt = this.add.container(0, INV_TOP - savedScrollY);
      contentCnt.add(scrollCnt);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      maskShape.fillStyle(0xffffff);
      maskShape.fillRect(W / 2 + px + P(4), H / 2 + INV_TOP, PW - P(8), INV_H);
      scrollCnt.setMask(maskShape.createGeometryMask());

      const applyScroll = (dy: number) => {
        savedScrollY = Phaser.Math.Clamp(savedScrollY + dy, 0, maxScroll);
        scrollCnt.y = INV_TOP - savedScrollY;
      };

      // Build cards once at fixed positions
      invItems.forEach(({ cardId, qty }, idx) => {
        const def = getCardDef(cardId);
        if (!def) return;
        const col = idx % INV_COLS;
        const row = Math.floor(idx / INV_COLS);
        const cx  = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
        const cy  = row * ROW_H + CARD_H / 2;

        const cg = this.add.graphics();
        const monTier = getMonsterDef(def.monsterId)?.tier ?? 1;
        monTier >= 5 ? drawBossCard(cg, cx, cy, CARD_W, CARD_H) : monTier === 3 ? drawEliteCard(cg, cx, cy, CARD_W, CARD_H) : drawInvCard(cg, cx, cy, CARD_W, CARD_H);
        scrollCnt.add(cg);

        drawCardFace(scrollCnt, def, cx, cy, '', qty);

        // Stack limit badge (bottom-left)
        const equippedCount = eq.filter(s => s === cardId).length;
        const stackLimit    = CardStore.getStackLimit(cardId);
        const atLimit       = equippedCount >= stackLimit;
        const badgeColor    = atLimit ? '#cc2222' : equippedCount > 0 ? '#cc8800' : '#226622';
        scrollCnt.add(this.add.text(cx - CARD_W / 2 + P(2), cy + CARD_H / 2 - P(2), `${equippedCount}/${stackLimit}`, {
          fontSize: F(15), fontStyle: 'bold', color: '#ffffff',
          stroke: '#000000', strokeThickness: 1,
          backgroundColor: badgeColor, padding: { x: 2, y: 1 },
        }).setOrigin(0, 1));

        // Dim overlay if at stack limit
        if (atLimit) {
          const dimOvl = this.add.graphics();
          dimOvl.fillStyle(0x000000, 0.45);
          dimOvl.fillRect(cx - CARD_W / 2, cy - CARD_H / 2, CARD_W, CARD_H);
          scrollCnt.add(dimOvl);
        }

      });

      // Single hit zone covering the inventory area — avoids overlapping equipped-slot hits
      const invZone = this.add.rectangle(0, INV_TOP + INV_H / 2, PW - P(16), INV_H)
        .setInteractive({ useHandCursor: true });
      contentCnt.add(invZone);
      invZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        // Convert screen pointer to contentCnt-local coords
        const localX = ptr.x - (W / 2);
        const localY = ptr.y - (H / 2) - scrollCnt.y;
        invItems.forEach(({ cardId }, idx) => {
          const col = idx % INV_COLS;
          const row = Math.floor(idx / INV_COLS);
          const cx  = invX0 + col * (CARD_W + INV_GAP) + CARD_W / 2;
          const cy  = row * ROW_H + CARD_H / 2;
          if (Math.abs(localX - cx) <= CARD_W / 2 && Math.abs(localY - cy) <= CARD_H / 2) {
            const def = getCardDef(cardId);
            if (def) showCardDetail(def, null, cardId);
          }
        });
      });

      // Drag scroll
      this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => {
        if (!ptr.isDown) return;
        applyScroll(ptr.prevPosition.y - ptr.y);
      });

      // Wheel scroll
      this.input.on('wheel', (_ptr: unknown, _objs: unknown, _dx: number, dy: number) => {
        applyScroll(dy * 0.6);
      });
    };

    rebuild();

    // Auto-update on card change
    const onCardChange = () => rebuild();
    CardStore.onChange(onCardChange);

    const cleanup = () => {
      CardStore.offChange(onCardChange);
      this.input.off('pointermove');
      this.input.off('wheel');
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  }

  private showRoomPanel(W: number, H: number): void {
    const D  = 600;
    const PW = Math.min(W - P(32), P(360));
    const PH = Math.min(P(410), H - P(40));
    const px = W / 2 - PW / 2;
    const py = H / 2 - PH / 2;

    const panelObjs:   Phaser.GameObjects.GameObject[] = [];
    const contentObjs: Phaser.GameObjects.GameObject[] = [];

    const closeAll = () => {
      [...panelObjs, ...contentObjs].forEach(o => o.destroy());
      this.cleanDomInputs();
      NetworkService.disconnect();
    };
    const clearContent = () => {
      contentObjs.forEach(o => o.destroy());
      contentObjs.length = 0;
      this.cleanDomInputs();
    };

    // ── Persistent backdrop + panel shell ────────────────────────────
    panelObjs.push(
      this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.82).setInteractive().setDepth(D),
    );
    const bg = this.add.graphics().setDepth(D + 1);
    panelObjs.push(bg);
    bg.fillStyle(0x000000, 0.5); bg.fillRect(px + P(4), py + P(4), PW, PH);
    bg.fillStyle(0x1a0e04, 1);   bg.fillRect(px, py, PW, PH);
    bg.lineStyle(P(2), 0xd4a044, 0.9); bg.strokeRect(px, py, PW, PH);
    bg.fillStyle(0xffe080, 0.6); bg.fillRect(px, py, PW, P(2));

    panelObjs.push(this.add.text(W / 2, py + P(24), '⚑  多人連線', {
      fontSize: F(18), fontStyle: 'bold', color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2));

    // ── Button helpers ───────────────────────────────────────────────
    const BH = P(34);
    const addBtn = (
      objs: Phaser.GameObjects.GameObject[],
      label: string, cx: number, cy: number, bw: number, col: number,
      cb: () => void,
    ) => {
      const g = this.add.graphics().setDepth(D + 2);
      objs.push(g);
      g.fillStyle(0x000000, 0.35); g.fillRect(cx - bw/2 + P(2), cy - BH/2 + P(2), bw, BH);
      g.fillStyle(col, 1);         g.fillRect(cx - bw/2, cy - BH/2, bw, BH);
      g.fillStyle(0xffffff, 0.12); g.fillRect(cx - bw/2, cy - BH/2, bw, P(4));
      g.lineStyle(1.5, 0xffcc44, 0.8); g.strokeRect(cx - bw/2, cy - BH/2, bw, BH);
      objs.push(this.add.text(cx, cy, label, {
        fontSize: F(15), fontStyle: 'bold', color: '#fff8e0', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 3));
      const hit = this.add.rectangle(cx, cy, bw, BH).setInteractive({ useHandCursor: true }).setDepth(D + 4);
      objs.push(hit);
      hit.on('pointerdown', cb);
      return hit;
    };

    // Persistent cancel button at panel bottom
    addBtn(panelObjs, '取消', W / 2, py + PH - P(22), P(90), 0x3a0808, closeAll);

    // ── Slot card helper ─────────────────────────────────────────────
    const SLOT_H = P(155);
    const slotW  = (PW - P(48)) / 2;
    const slotY  = py + P(90) + SLOT_H / 2;
    const leftCx  = px + P(16) + slotW / 2;
    const rightCx = px + P(32) + slotW + slotW / 2;

    if (this.anims.exists('_lobby_idle')) this.anims.remove('_lobby_idle');
    this.anims.create({
      key: '_lobby_idle',
      frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }),
      frameRate: 5, repeat: -1,
    });

    const drawSlot = (cx: number, name: string | null, level: number, badge: string, skinId = 0, tint = 0xffddaa) => {
      const sx = cx - slotW / 2;
      const sy = slotY - SLOT_H / 2;
      const g  = this.add.graphics().setDepth(D + 2);
      contentObjs.push(g);
      g.fillStyle(0x0d0804, 0.9); g.fillRect(sx, sy, slotW, SLOT_H);
      g.lineStyle(P(1.5), name ? 0xd4a044 : 0x443322, 0.8); g.strokeRect(sx, sy, slotW, SLOT_H);

      // Badge label (top, small is fine since it's a tag)
      contentObjs.push(this.add.text(cx, sy + P(8), badge, {
        fontSize: F(11), fontStyle: 'bold', color: name ? '#ffe080' : '#554433',
      }).setOrigin(0.5, 0).setDepth(D + 3));

      if (!name) {
        contentObjs.push(this.add.text(cx, slotY, '？', {
          fontSize: F(28), color: '#443322',
        }).setOrigin(0.5).setDepth(D + 3));
        return;
      }

      // Per-skin lobby animation (uses preloaded skin_preview_N texture)
      const animKey = `_lobby_idle_${skinId}`;
      if (!this.anims.exists(animKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(`skin_preview_${skinId}`, { start: 0, end: 3 }),
          frameRate: 5, repeat: -1,
        });
      }

      // Sprite — positioned with room for text at bottom; may slightly overflow top, that's OK
      const textAreaH = P(38);
      const sprY = sy + (SLOT_H - textAreaH) / 2 + P(10);
      const spr = this.add.sprite(cx, sprY, `skin_preview_${skinId}`, 0)
        .setScale(DPR * 2.2).setTint(tint).setDepth(D + 3);
      contentObjs.push(spr);
      spr.play(animKey);

      // Name + level anchored at bottom of slot
      contentObjs.push(this.add.text(cx, sy + SLOT_H - P(3), name, {
        fontSize: F(15), fontStyle: 'bold', color: '#e8d0a0', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(D + 4));
      if (level > 0) {
        contentObjs.push(this.add.text(cx, sy + SLOT_H - P(20), `Lv ${level}`, {
          fontSize: F(15), color: '#aabbcc', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5, 1).setDepth(D + 4));
      }
    };

    // ── Screen 1 : Mode select ───────────────────────────────────────
    const showModeSelect = () => {
      clearContent();

      contentObjs.push(this.add.text(W / 2, py + P(52), '選擇模式', {
        fontSize: F(15), color: '#aaaaaa',
      }).setOrigin(0.5).setDepth(D + 2));

      const nickInput = this.makeTextInput(
        contentObjs, px + P(16), py + P(68), PW - P(32), P(32), '暱稱（最多8字）', D + 2, getPlayerName(),
      );

      const errTxt = this.add.text(W / 2, py + P(112), '', {
        fontSize: F(15), color: '#ff6644',
      }).setOrigin(0.5).setDepth(D + 5);
      contentObjs.push(errTxt);

      const validate = () => {
        const nick = nickInput.getValue();
        if (!nick) { errTxt.setText('請先輸入暱稱'); return null; }
        errTxt.setText('');
        return nick;
      };

      // Large mode buttons
      const BBTH = P(52);
      const bigBtn = (label: string, cx: number, col: number, cb: () => void) => {
        const bw = (PW - P(48)) / 2;
        const cy = py + P(170);
        const g  = this.add.graphics().setDepth(D + 2);
        contentObjs.push(g);
        g.fillStyle(0x000000, 0.4); g.fillRect(cx - bw/2 + P(3), cy - BBTH/2 + P(3), bw, BBTH);
        g.fillStyle(col, 1);        g.fillRect(cx - bw/2, cy - BBTH/2, bw, BBTH);
        g.fillStyle(0xffffff, 0.15); g.fillRect(cx - bw/2, cy - BBTH/2, bw, P(6));
        g.lineStyle(P(2), 0xffcc44, 0.85); g.strokeRect(cx - bw/2, cy - BBTH/2, bw, BBTH);
        contentObjs.push(this.add.text(cx, cy, label, {
          fontSize: F(16), fontStyle: 'bold', color: '#fff8e0', stroke: '#1a0800', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(D + 3));
        const hit = this.add.rectangle(cx, cy, bw, BBTH).setInteractive({ useHandCursor: true }).setDepth(D + 4);
        contentObjs.push(hit);
        hit.on('pointerdown', cb);
      };

      const bw    = (PW - P(48)) / 2;
      bigBtn('創建房間', px + P(16) + bw / 2,       0x0e2a0a, async () => {
        const nick = validate(); if (!nick) return;
        await showCreateLobby(nick);
      });
      bigBtn('加入房間', px + P(32) + bw + bw / 2, 0x0a1a2a, () => {
        const nick = validate(); if (!nick) return;
        showJoinInput(nick);
      });
    };

    // ── Screen 2a : Host lobby ───────────────────────────────────────
    const showCreateLobby = async (nick: string) => {
      clearContent();

      const loadTxt = this.add.text(W / 2, py + PH / 2, '連線中…', {
        fontSize: F(15), color: '#ffdd44',
      }).setOrigin(0.5).setDepth(D + 2);
      contentObjs.push(loadTxt);

      let payload: Awaited<ReturnType<typeof NetworkService.createRoom>>;
      try {
        payload = await NetworkService.createRoom(nick);
      } catch {
        loadTxt.setText('連線失敗，請確認 server 是否運行').setColor('#ff4444');
        addBtn(contentObjs, '← 返回', W / 2, py + P(200), P(110), 0x3a1a04, () => showModeSelect());
        return;
      }
      loadTxt.destroy();
      contentObjs.splice(contentObjs.indexOf(loadTxt), 1);

      let partnerIn     = false;
      let partnerNick   = '';
      let partnerLevel  = 0;
      let partnerSkinId = 0;

      const rebuildLobby = () => {
        clearContent();

        // Room code
        contentObjs.push(this.add.text(W / 2, py + P(52), '房間代碼', {
          fontSize: F(15), color: '#aaaaaa',
        }).setOrigin(0.5).setDepth(D + 2));
        contentObjs.push(this.add.text(W / 2, py + P(68), payload.roomCode, {
          fontSize: F(26), fontStyle: 'bold', color: '#ffe080', stroke: '#2a1000', strokeThickness: 3,
        }).setOrigin(0.5).setDepth(D + 2));

        // Slots
        const myLevel = PlayerStore.getLevel();
        drawSlot(leftCx,  nick,                          myLevel,      '房主 (你)', SkinStore.get(),  0xffddaa);
        drawSlot(rightCx, partnerIn ? partnerNick : null, partnerLevel, '夥伴',      partnerSkinId,    0xaaddff);

        // Status — just below slots
        const slotBottom = py + P(90) + SLOT_H;
        const statusMsg = partnerIn ? '夥伴已加入！可以出發了' : '等待夥伴加入…';
        const statusCol = partnerIn ? '#88ee44' : '#886644';
        contentObjs.push(this.add.text(W / 2, slotBottom + P(14), statusMsg, {
          fontSize: F(15), color: statusCol,
        }).setOrigin(0.5).setDepth(D + 2));

        // 出發 button — anchored below status text, not relative to panel bottom
        const startCol    = partnerIn ? 0x1a5a0a : 0x242018;
        const startBorder = partnerIn ? 0xffcc44 : 0x443322;
        const startLblCol = partnerIn ? '#fff8e0' : '#665533';
        const startG = this.add.graphics().setDepth(D + 2);
        contentObjs.push(startG);
        const sBtnW = P(100), sBtnH = P(28);
        const sBtnX = W / 2, sBtnY = slotBottom + P(14) + P(18) + sBtnH / 2;
        startG.fillStyle(0x000000, 0.35); startG.fillRect(sBtnX - sBtnW/2 + P(2), sBtnY - sBtnH/2 + P(2), sBtnW, sBtnH);
        startG.fillStyle(startCol, 1);    startG.fillRect(sBtnX - sBtnW/2, sBtnY - sBtnH/2, sBtnW, sBtnH);
        startG.fillStyle(0xffffff, 0.12); startG.fillRect(sBtnX - sBtnW/2, sBtnY - sBtnH/2, sBtnW, P(4));
        startG.lineStyle(1.5, startBorder, 0.8); startG.strokeRect(sBtnX - sBtnW/2, sBtnY - sBtnH/2, sBtnW, sBtnH);
        contentObjs.push(this.add.text(sBtnX, sBtnY, '出  發', {
          fontSize: F(15), fontStyle: 'bold', color: startLblCol, stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(D + 3));
        if (partnerIn) {
          const sHit = this.add.rectangle(sBtnX, sBtnY, sBtnW, sBtnH)
            .setInteractive({ useHandCursor: true }).setDepth(D + 4);
          contentObjs.push(sHit);
          sHit.on('pointerdown', () => {
            this.multiRoomNick = nick;
            this.showQuestPanel(W, H, 700);
          });
        }
      };

      rebuildLobby();

      // Push host's own name/level into Colyseus schema so guest can read it
      NetworkService.sendPlayerInfo(nick, PlayerStore.getLevel(), SkinStore.get());

      // Primary: schema state change (works without custom server messages)
      NetworkService.onPartnerInfoReady((name, level, skinId) => {
        partnerIn = true; partnerNick = name; partnerLevel = level; partnerSkinId = skinId;
        rebuildLobby();
      });
      // Backup: explicit server message (works when server is rebuilt)
      NetworkService.onPartnerJoined(data => {
        partnerIn = true;
        partnerNick   = data.nickname ?? partnerNick;
        partnerLevel  = data.level    ?? partnerLevel;
        partnerSkinId = data.skinId   ?? partnerSkinId;
        rebuildLobby();
      });

      NetworkService.onGameStart(p => {
        [...panelObjs, ...contentObjs].forEach(o => o.destroy());
        this.cleanDomInputs();
        this.scene.start('GameScene', {
          seed: p.seed, questStar: p.questStar, bossMonsterId: p.bossMonsterId,
          mapParams: p.mapParams, partnerNickname: p.guestNickname,
          ownSkinId: p.hostSkinId, partnerSkinId: p.guestSkinId,
        });
      });
    };

    // ── Screen 2b : Join code input ──────────────────────────────────
    const showJoinInput = (nick: string) => {
      clearContent();

      contentObjs.push(this.add.text(W / 2, py + P(68), '輸入房間代碼', {
        fontSize: F(15), fontStyle: 'bold', color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 2));

      const codeInput = this.makeTextInput(
        contentObjs, W / 2 - P(75), py + P(92), P(150), P(40), '4位代碼', D + 2,
      );

      const errTxt = this.add.text(W / 2, py + P(148), '', {
        fontSize: F(15), color: '#ff6644',
      }).setOrigin(0.5).setDepth(D + 5);
      contentObjs.push(errTxt);

      addBtn(contentObjs, '加入房間', W / 2, py + P(186), P(130), 0x0a1a3a, async () => {
        const code = codeInput.getValue();
        if (!code) { errTxt.setText('請輸入房間代碼'); return; }
        errTxt.setText('加入中…').setColor('#ffdd44');
        try {
          const joined = await NetworkService.joinRoom(code, nick);
          NetworkService.sendPlayerInfo(nick, PlayerStore.getLevel(), SkinStore.get());
          // Read host info from live schema first; fall back to joined payload
          const hostState = NetworkService.getPartnerState() as any;
          const hostName   = hostState?.nickname ?? joined.hostNickname ?? '';
          const hostLevel  = hostState?.level    ?? joined.hostLevel    ?? 0;
          const hostSkinId = hostState?.skinId   ?? joined.hostSkinId  ?? 0;
          showGuestLobby(nick, hostName, hostLevel, hostSkinId);
        } catch {
          errTxt.setText('加入失敗，代碼錯誤或房間不存在').setColor('#ff4444');
        }
      });

      addBtn(contentObjs, '← 返回', W / 2, py + P(232), P(100), 0x3a1a04, () => showModeSelect());
    };

    // ── Screen 2c : Guest lobby ──────────────────────────────────────
    const showGuestLobby = (nick: string, hostName = '', hostLevel = 0, hostSkinId = 0) => {
      let _hostName   = hostName;
      let _hostLevel  = hostLevel;
      let _hostSkinId = hostSkinId;

      const rebuildContent = () => {
        clearContent();

        contentObjs.push(this.add.text(W / 2, py + P(52), '已加入房間', {
          fontSize: F(15), fontStyle: 'bold', color: '#88ee44', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(D + 2));

        const myLevel = PlayerStore.getLevel();
        drawSlot(leftCx,  _hostName || '?', _hostLevel, '房主', _hostSkinId,     0xaaddff);
        drawSlot(rightCx, nick,             myLevel,    '你',   SkinStore.get(), 0xffddaa);

        contentObjs.push(this.add.text(W / 2, py + P(90) + SLOT_H + P(14), '等待房主出發…', {
          fontSize: F(15), color: '#886644',
        }).setOrigin(0.5).setDepth(D + 2));
      };

      rebuildContent();

      // Update host slot whenever schema syncs with host's name/level
      NetworkService.onPartnerInfoReady((name, level, skinId) => {
        _hostName   = name;
        _hostLevel  = level;
        _hostSkinId = skinId;
        rebuildContent();
      });

      NetworkService.onGameStart(payload => {
        try { if (payload.questId) QuestStore.acceptQuest(payload.questId); } catch { /* guest */ }
        [...panelObjs, ...contentObjs].forEach(o => o.destroy());
        this.cleanDomInputs();
        this.scene.start('GameScene', {
          seed: payload.seed, questStar: payload.questStar, bossMonsterId: payload.bossMonsterId,
          mapParams: payload.mapParams, partnerNickname: payload.hostNickname,
          ownSkinId: payload.guestSkinId, partnerSkinId: payload.hostSkinId,
        });
      });
    };

    showModeSelect();
  }

  private makeTextInput(
    objs: Phaser.GameObjects.GameObject[],
    x: number, y: number, w: number, h: number,
    placeholder: string, depth: number,
    initialValue = '',
  ): { getValue(): string; setValue(v: string): void } {
    // Hidden real input for keyboard — positioned off-screen to avoid DPR issues
    const el = document.createElement('input');
    el.type = 'text'; el.maxLength = 12;
    Object.assign(el.style, {
      position: 'fixed', top: '0', left: '0',
      width: '1px', height: '1px', opacity: '0',
      pointerEvents: 'none', fontSize: '16px',
    });
    document.body.appendChild(el);
    (this as any)._domInputs = (this as any)._domInputs ?? [];
    (this as any)._domInputs.push(el);

    // Visual box
    const gfx = this.add.graphics().setDepth(depth);
    objs.push(gfx);
    gfx.fillStyle(0x1a1208, 1); gfx.fillRect(x, y, w, h);
    gfx.lineStyle(P(2), 0x886622, 1); gfx.strokeRect(x, y, w, h);

    const txt = this.add.text(x + P(8), y + h / 2, placeholder, {
      fontSize: F(15), color: '#886644',
    }).setOrigin(0, 0.5).setDepth(depth + 1);
    objs.push(txt);

    // Invisible hit area — click to focus hidden input
    const hit = this.add.rectangle(x + w / 2, y + h / 2, w, h)
      .setInteractive({ useHandCursor: true }).setDepth(depth + 2);
    objs.push(hit);
    hit.on('pointerdown', () => el.focus());

    el.addEventListener('input', () => {
      const val = el.value.slice(0, 8); el.value = val;
      txt.setText(val || placeholder).setColor(val ? '#ffe0a0' : '#886644');
    });

    const setValue = (v: string) => {
      el.value = v.slice(0, 8);
      txt.setText(v || placeholder).setColor(v ? '#ffe0a0' : '#886644');
    };
    if (initialValue) setValue(initialValue);

    return { getValue: () => el.value.trim().slice(0, 8), setValue };
  }

  private showNameEditDialog(W: number, H: number): void {
    const D  = 950;
    const bw = Math.min(P(260), W - P(32));
    const bh = P(130);
    const bx = W / 2 - bw / 2;
    const by = H / 2 - bh / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const close = () => { objs.forEach(o => o.destroy()); this.cleanDomInputs(); };

    const bk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.65)
      .setInteractive().setDepth(D);
    objs.push(bk);
    bk.on('pointerdown', close);

    const box = this.add.graphics().setDepth(D + 1);
    objs.push(box);
    box.fillStyle(0x1a0e04, 0.97); box.fillRoundedRect(bx, by, bw, bh, P(8));
    box.lineStyle(P(2), GOLD, 0.85); box.strokeRoundedRect(bx, by, bw, bh, P(8));

    objs.push(this.add.text(W / 2, by + P(18), '設定名稱', {
      fontSize: F(15), fontStyle: 'bold', color: '#ffe080', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2));

    const inp = this.makeTextInput(objs, bx + P(16), by + P(36), bw - P(32), P(30), '名稱（最多8字）', D + 2, getPlayerName());

    // Confirm button
    const btnW = P(100), btnH = P(28);
    const btnX = W / 2, btnY = by + bh - P(20);
    const btnG = this.add.graphics().setDepth(D + 2);
    objs.push(btnG);
    btnG.fillStyle(0x2a4a10, 1); btnG.fillRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(5));
    btnG.lineStyle(P(1.5), GOLD, 0.7); btnG.strokeRoundedRect(btnX - btnW / 2, btnY - btnH / 2, btnW, btnH, P(5));
    objs.push(this.add.text(btnX, btnY, '確  定', {
      fontSize: F(14), fontStyle: 'bold', color: '#ccff88', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 3));
    const btnHit = this.add.rectangle(btnX, btnY, btnW, btnH)
      .setInteractive({ useHandCursor: true }).setDepth(D + 4);
    objs.push(btnHit);
    btnHit.on('pointerdown', () => {
      const name = inp.getValue() || '勇者';
      setPlayerName(name);
      this.playerNameTxt?.setText(name);
      close();
    });
  }

  private cleanDomInputs(): void {
    ((this as any)._domInputs ?? []).forEach((el: HTMLElement) => el.remove());
    (this as any)._domInputs = [];
  }

  private showComingSoon(W: number, H: number, label: string): void {
    const D   = 900;
    const bk  = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setInteractive().setDepth(D);
    const box = this.add.graphics().setDepth(D + 1);
    const bw = 260, bh = 100;
    box.fillStyle(0x1a1208, 0.97); box.fillRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
    box.lineStyle(2, 0xd4a044, 0.8); box.strokeRect(W / 2 - bw / 2, H / 2 - bh / 2, bw, bh);
    const txt = this.add.text(W / 2, H / 2 - 14, `${label}`, {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D + 2);
    const sub = this.add.text(W / 2, H / 2 + 14, '功能待開發', {
      fontSize: F(15), fontStyle: 'bold', color: '#886644', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(D + 2);
    const close = () => { bk.destroy(); box.destroy(); txt.destroy(); sub.destroy(); };
    bk.on('pointerdown', close);
  }

  private showShopPanel(W: number, H: number): void {
    const PW = Math.min(P(320), W - P(20));
    const PH = Math.min(P(500), H - P(40));
    const D  = 500;

    const container = this.add.container(W / 2, H / 2).setDepth(D);

    // Backdrop
    const backdrop = this.add.rectangle(0, 0, W, H, 0x000000, 0.78).setInteractive();
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < W / 2 - PW / 2 || ptr.x > W / 2 + PW / 2 ||
          ptr.y < H / 2 - PH / 2 || ptr.y > H / 2 + PH / 2) {
        container.destroy();
      }
    });
    container.add(backdrop);

    const px = -PW / 2;
    const py = -PH / 2;

    // Panel shell (wood style)
    const bg = this.add.graphics();
    bg.fillStyle(IRON, 1);
    bg.fillRect(px - 3, py - 3, PW + 6, PH + 6);
    bg.fillStyle(WL, 1);
    bg.fillRect(px - 2, py - 2, PW + 4, PH + 4);
    bg.fillStyle(WD, 1);
    bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / 24); row++) {
      const ry = py + row * 24;
      bg.lineStyle(1, WB, 0.5);
      bg.lineBetween(px + 2, ry, px + PW - 2, ry);
      bg.lineStyle(1, WH, 0.08);
      bg.lineBetween(px + 2, ry + 1, px + PW - 2, ry + 1);
    }
    [[px, py], [px + PW - 8, py], [px, py + PH - 8], [px + PW - 8, py + PH - 8]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx!, ry!, 8, 8);
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx! + 2, ry! + 2, 4, 4);
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '商  店', {
      fontSize: F(15), fontStyle: 'bold', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: F(15), fontStyle: 'bold', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => container.destroy());
    container.add(closeBtn);

    // ── Shop items ──────────────────────────────────────────
    const SHOP_ITEMS: { id: string; name: string; price: number; desc: string; color: number }[] = [
      { id: ITEM_POTION_HEALTH_S, name: '小型回復藥水', price:  500, desc: '使用後回復 50 HP',  color: 0x44ff88 },
      { id: ITEM_POTION_HEALTH_M, name: '中型回復藥水', price: 1500, desc: '使用後回復 100 HP', color: 0x44ddff },
      { id: ITEM_POTION_HEALTH_L, name: '大型回復藥水', price: 3000, desc: '使用後回復 200 HP', color: 0xff88ff },
      { id: ITEM_POTION_REVIVE,   name: '復活藥水',     price: 5000, desc: '在範圍內復活隊友',  color: 0xffee44 },
    ];

    const ROW_H   = P(80);
    const ROW_PAD = P(8);
    const ICON_SZ = P(56);
    const HEADER_H = P(56);  // height of header area (title + gold)

    // Gold display
    let goldLabel: Phaser.GameObjects.Text;
    const refreshGold = () => {
      goldLabel?.setText(`💰 ${InventoryStore.getGold().toLocaleString()} 金幣`);
    };
    goldLabel = this.add.text(0, py + P(40), '', {
      fontSize: F(14), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5, 0);
    refreshGold();
    container.add(goldLabel);

    const onInvChange = () => refreshGold();
    InventoryStore.onChange(onInvChange);
    container.once(Phaser.GameObjects.Events.DESTROY, () => InventoryStore.offChange(onInvChange));

    // ── Scrollable items area ──────────────────────────────
    const viewH    = PH - HEADER_H;
    const contentH = SHOP_ITEMS.length * (ROW_H + ROW_PAD);
    let   scrollY  = 0;
    const maxScroll = Math.max(0, contentH - viewH);

    // Mask in world coordinates (clips the scroll area)
    const maskGfx = this.add.graphics();
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(W / 2 + px, H / 2 + py + HEADER_H, PW, viewH);
    const scrollMask = maskGfx.createGeometryMask();
    container.once(Phaser.GameObjects.Events.DESTROY, () => maskGfx.destroy());

    // Container for scrollable rows (origin at top of content area)
    const scrollCont = this.add.container(0, py + HEADER_H);
    scrollCont.setMask(scrollMask);
    container.add(scrollCont);

    SHOP_ITEMS.forEach((item, i) => {
      const ry  = i * (ROW_H + ROW_PAD);
      const mid = ry + ROW_H / 2;
      const lx  = -PW / 2;  // left edge (equivalent to px)

      // Row background
      const rowGfx = this.add.graphics();
      rowGfx.fillStyle(WM, 0.6);
      rowGfx.fillRoundedRect(lx + P(8), ry, PW - P(16), ROW_H, P(6));
      rowGfx.lineStyle(P(1), WL, 0.35);
      rowGfx.strokeRoundedRect(lx + P(8), ry, PW - P(16), ROW_H, P(6));
      rowGfx.fillStyle(item.color, 0.85);
      rowGfx.fillRoundedRect(lx + P(8), ry, P(4), ROW_H, P(3));
      scrollCont.add(rowGfx);

      // Icon
      const iconX = lx + P(20) + ICON_SZ / 2;
      const iconBg = this.add.graphics();
      iconBg.fillStyle(0x0a0800, 0.6);
      iconBg.fillRoundedRect(iconX - ICON_SZ / 2, mid - ICON_SZ / 2, ICON_SZ, ICON_SZ, P(5));
      iconBg.lineStyle(P(1), item.color, 0.45);
      iconBg.strokeRoundedRect(iconX - ICON_SZ / 2, mid - ICON_SZ / 2, ICON_SZ, ICON_SZ, P(5));
      scrollCont.add(iconBg);
      const iconKey = `icon_${item.id}`;
      if (this.textures.exists(iconKey))
        scrollCont.add(this.add.image(iconX, mid, iconKey).setDisplaySize(P(40), P(40)));

      // Text
      const tx = iconX + ICON_SZ / 2 + P(10);
      const colorHex = `#${item.color.toString(16).padStart(6, '0')}`;
      scrollCont.add(this.add.text(tx, mid - P(20), item.name, {
        fontSize: F(14), fontStyle: 'bold', color: colorHex, stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0));
      scrollCont.add(this.add.text(tx, mid - P(4), item.desc, {
        fontSize: F(12), color: '#a08060', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));
      scrollCont.add(this.add.text(tx, mid + P(12), `${item.price} 金幣`, {
        fontSize: F(13), fontStyle: 'bold', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));

      // Buy button
      const BW = P(56), BH = P(28);
      const bx = PW / 2 - P(16) - BW / 2;
      const btnGfx = this.add.graphics();
      const drawBtn = (hover: boolean) => {
        btnGfx.clear();
        btnGfx.fillStyle(hover ? 0x5a3008 : 0x2a1800, 1);
        btnGfx.fillRoundedRect(bx - BW / 2, mid - BH / 2, BW, BH, P(5));
        btnGfx.lineStyle(P(1), GOLD, hover ? 1 : 0.6);
        btnGfx.strokeRoundedRect(bx - BW / 2, mid - BH / 2, BW, BH, P(5));
      };
      drawBtn(false);
      scrollCont.add(btnGfx);
      scrollCont.add(this.add.text(bx, mid, '購買', {
        fontSize: F(14), fontStyle: 'bold', color: '#e8c870', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      const hit = this.add.rectangle(bx, mid, BW, BH).setInteractive({ useHandCursor: true });
      hit.on('pointerover',  () => drawBtn(true));
      hit.on('pointerout',   () => drawBtn(false));
      hit.on('pointerdown',  () => {
        if (!InventoryStore.spendGold(item.price)) return;
        InventoryStore.addItem(item.id, item.name, 1);
        SaveStore.save();
        refreshGold();
      });
      scrollCont.add(hit);
    });

    // Mouse wheel scroll
    const onWheel = (_ptr: any, _gos: any, _dx: any, dy: number) => {
      if (!container.active) return;
      scrollY = Math.max(0, Math.min(maxScroll, scrollY + dy * 0.6));
      scrollCont.y = py + HEADER_H - scrollY;
    };
    this.input.on('wheel', onWheel);
    container.once(Phaser.GameObjects.Events.DESTROY, () => this.input.off('wheel', onWheel));

    // Touch drag scroll
    let dragStartY = 0, dragStartScroll = 0;
    const onDragStart = (ptr: Phaser.Input.Pointer) => {
      if (!container.active) return;
      dragStartY = ptr.y; dragStartScroll = scrollY;
    };
    const onDragMove = (ptr: Phaser.Input.Pointer) => {
      if (!container.active || !ptr.isDown) return;
      scrollY = Math.max(0, Math.min(maxScroll, dragStartScroll - (ptr.y - dragStartY)));
      scrollCont.y = py + HEADER_H - scrollY;
    };
    this.input.on('pointerdown', onDragStart);
    this.input.on('pointermove', onDragMove);
    container.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.input.off('pointerdown', onDragStart);
      this.input.off('pointermove', onDragMove);
    });
  }

  private drawCenterHero(W: number, H: number): void {
    const cx       = W / 2;
    const BOTTOM_H = P(78);
    const availH   = H - TOP_H - BOTTOM_H;
    const heroY    = TOP_H + availH * 0.50;
    const scale    = 1.75 * DPR;


    // ── Animated hero sprite ───────────────────────────────
    this.textures.get('player_idle_shadow').setFilter(Phaser.Textures.FilterMode.NEAREST);
    const hero = this.add.sprite(cx, heroY, 'player_idle_shadow', 0)
      .setScale(scale)
      .setTint(0xffddaa)
      .setDepth(11);

    const playIdle = () => {
      hero.play('player_idle_shadow');
      hero.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        hero.setFrame(0);
        this.time.delayedCall(Phaser.Math.Between(2200, 4000), playIdle);
      });
    };
    playIdle();

  }


  private drawAmbientParticles(W: number, H: number): void {
    const BOTTOM_H  = P(78);
    const zoneTop   = TOP_H + P(40);
    const zoneBot   = H - BOTTOM_H - P(20);
    const colors    = [0xffd060, 0x88ddff, 0xffaa44, 0xaaffcc, 0xff88cc];

    for (let i = 0; i < 22; i++) {
      const g     = this.add.graphics().setDepth(7);
      const size  = Phaser.Math.FloatBetween(1.2, 3.2);
      const x     = Phaser.Math.Between(10, W - 10);
      const y     = Phaser.Math.Between(zoneTop, zoneBot);
      const alpha = Phaser.Math.FloatBetween(0.18, 0.55);
      const color = Phaser.Utils.Array.GetRandom(colors);

      // Star shape: cross of 2 rects
      g.fillStyle(color, 1);
      g.fillRect(-size, -size * 0.35, size * 2, size * 0.7);
      g.fillRect(-size * 0.35, -size, size * 0.7, size * 2);

      g.setPosition(x, y).setAlpha(0);

      this.tweens.add({
        targets: g,
        alpha:   { from: 0, to: alpha },
        duration: Phaser.Math.Between(700, 1600),
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        delay: Phaser.Math.Between(0, 2500),
      });

      this.tweens.add({
        targets: g,
        x: x + Phaser.Math.Between(-40, 40),
        y: y - Phaser.Math.Between(50, 130),
        angle: Phaser.Math.Between(-45, 45),
        duration: Phaser.Math.Between(3500, 8000),
        ease: 'Sine.easeInOut',
        repeat: -1, yoyo: true,
        delay: Phaser.Math.Between(0, 3000),
      });
    }
  }
}
