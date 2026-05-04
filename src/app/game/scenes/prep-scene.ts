import Phaser from 'phaser';
import { InventoryStore } from '../data/inventory-store';
import { PlayerStore } from '../data/player-store';
import { generateEquipment, randomQuality, QUALITY_NAMES, QUALITY_COLORS, SLOT_NAMES, STAT_NAMES, BEHAVIOR_NAMES, BEHAVIOR_INFO, EquipSlot, EquipmentItem } from '../data/equipment-data';
import { SaveStore } from '../data/save-store';
import { CardStore, CARD_SLOT_COUNT } from '../data/card-store';
import { getCardDef, getMonsterDef } from '../data/monster-data';
import { QuestStore, Quest, STAR_EQUIP_QUALITY } from '../data/quest-store';


const TOP_H  = 52;
const SIDE_W = 76;

// Wood palette
const WB  = 0x140a02; // base (near-black)
const WD  = 0x2a1408; // dark wood
const WM  = 0x4a2814; // medium dark
const WMI = 0x5c3418; // medium
const WL  = 0x8b5e3c; // light wood
const WH  = 0xb07030; // highlight grain
const GOLD = 0xd4a044;
const IRON = 0x4a5560;

export class PrepScene extends Phaser.Scene {
  private goldText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'PrepScene' });
  }

  preload(): void {
    const cfg = { frameWidth: 64, frameHeight: 64 };
    if (!this.textures.exists('player_idle_shadow'))
      this.load.spritesheet('player_idle_shadow', 'sprite/hero/PNG/Swordsman_lvl1/With_shadow/Swordsman_lvl1_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('bg_prep'))
      this.load.image('bg_prep', 'other/leader.webp');
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
    ];
    bossSprites.forEach(([key, path]) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, path, cfg);
    });
    if (!this.textures.exists('icon_stone_broken')) this.load.image('icon_stone_broken', 'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact'))  this.load.image('icon_stone_intact',  'other/ore1.webp');
    if (!this.textures.exists('icon_quest_reroll'))  this.load.image('icon_quest_reroll',  'other/ore4.webp');
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
      // 測試用：每種攻擊模式各一把，slash180 直接裝備
      const testBehaviors: import('../data/equipment-data').AttackBehavior[] =
        ['whirlwind', 'dashPierce', 'projectile', 'aura', 'multiHit', 'chargeSlam', 'boomerang', 'magicFire'];
      const behaviorLabels: Record<string, string> = {
        slash180: '半月斬', whirlwind: '旋風斬', dashPierce: '瞬步斬',
        projectile: '風刃', aura: '血環', multiHit: '五連斬', chargeSlam: '蓄力重擊',
        boomerang: '迴旋飛刃', magicFire: '地獄火',
      };
      PlayerStore.equipDirect('sword', {
        id: 'sword_test_slash180', name: '半月斬', slot: 'sword',
        texture: 'equip_sword1', quality: 'perfect',
        affixes: [{ stat: 'atk', value: 20 }, { stat: 'crit', value: 0.15 }],
        behavior: 'slash180', enhancement: 0,
      });
      testBehaviors.forEach((bv) => {
        const sword: EquipmentItem = {
          id:          `sword_test_${bv}`,
          name:        behaviorLabels[bv],
          slot:        'sword',
          texture:     'equip_sword1',
          quality:     'perfect',
          affixes:     [{ stat: 'atk', value: 20 }, { stat: 'crit', value: 0.15 }],
          behavior:    bv,
          enhancement: 0,
        };
        PlayerStore.addOwned(sword);
      });
    }

    // 若存檔中尚未有新技能武器，補入背包（版本升級補丁）
    {
      const allIds = new Set([
        ...PlayerStore.getOwned().map(e => e.id),
        ...Object.values(PlayerStore.getEquipped()).filter(Boolean).map(e => e!.id),
      ]);
      const patch: { bv: import('../data/equipment-data').AttackBehavior; label: string }[] = [
        { bv: 'boomerang', label: '迴旋飛刃' },
        { bv: 'magicFire', label: '地獄火' },
      ];
      for (const { bv, label } of patch) {
        if (!allIds.has(`sword_test_${bv}`)) {
          PlayerStore.addOwned({
            id:          `sword_test_${bv}`,
            name:        label,
            slot:        'sword',
            texture:     'equip_sword1',
            quality:     'perfect',
            affixes:     [{ stat: 'atk', value: 20 }, { stat: 'crit', value: 0.15 }],
            behavior:    bv,
            enhancement: 0,
          });
        }
      }
    }
    this.generateItemIcons();

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
    // Render at low resolution then scale up → pixel art look
    const PDIV = 3;                          // 1 pixel = 5×5 screen pixels
    const rtW  = Math.round(W / PDIV);
    const rtH  = Math.round(H / PDIV);

    const tmp = this.add.image(rtW / 2, rtH / 2 - Math.round(60 / PDIV), 'bg_prep');
    tmp.setScale(rtW / tmp.width);

    const rt = this.add.renderTexture(0, 0, rtW, rtH);
    rt.draw(tmp);
    tmp.destroy();

    // Scale up with nearest-neighbor for chunky pixels
    rt.setOrigin(0, 0).setDisplaySize(W, H);
    try { (rt as any).texture?.setFilter?.(Phaser.Textures.FilterMode.NEAREST); } catch (_) {}

    // Dark overlay
    const ov = this.add.graphics();
    ov.fillStyle(0x000000, 0.3);
    ov.fillRect(0, 0, W, H);

    // Vignette
    const vig = this.add.graphics();
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.55, 0.55, 0, 0);
    vig.fillRect(0, 0, W, H / 3);
    vig.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.45, 0.45);
    vig.fillRect(0, H * 0.67, W, H * 0.33);
  }

  // ── Top bar (wooden beam) ───────────────────────────────

  private drawTopBar(W: number): void {
    const gfx = this.add.graphics();

    // Beam bg
    gfx.fillStyle(0x1e0c04, 1);
    gfx.fillRect(0, 0, W, TOP_H);

    // Grain lines
    for (let y = 5; y < TOP_H - 4; y += 7) {
      gfx.lineStyle(1, WD, 0.4);
      gfx.lineBetween(0, y, W, y);
    }

    // Bottom carved ledge
    gfx.fillStyle(WH, 0.5);
    gfx.fillRect(0, TOP_H - 3, W, 1);
    gfx.fillStyle(WB, 1);
    gfx.fillRect(0, TOP_H - 2, W, 2);

    // Iron corner bolts
    [0, W - 6].forEach(bx => {
      gfx.fillStyle(IRON, 1);
      gfx.fillRect(bx, 0, 6, 6);
      gfx.fillRect(bx, TOP_H - 6, 6, 6);
    });

    // ── Layout constants ──────────────────────────────────
    const CY     = TOP_H / 2;
    const AV_X   = 8;
    const AV_SZ  = 36;
    const INFO_X = AV_X + AV_SZ + 8;   // x = 52
    const BH     = 24;                  // badge height
    const SET_W  = 30;
    const GAP    = 5;
    const GOLD_W = 180;
    const EXP_W  = 180;
    const SET_X  = W - SET_W - 6;
    const GOLD_X = SET_X - GAP - GOLD_W;
    const EXPB_X = GOLD_X - GAP - EXP_W;

    // ── Avatar ────────────────────────────────────────────
    const avG = this.add.graphics();
    avG.fillStyle(WM, 1);      avG.fillRect(AV_X, 8, AV_SZ, AV_SZ);
    avG.lineStyle(2, WH, 0.8); avG.strokeRect(AV_X, 8, AV_SZ, AV_SZ);
    avG.fillStyle(WD, 0.5);    avG.fillRect(AV_X, 8, AV_SZ, 3);
    this.add.text(AV_X + AV_SZ / 2, CY, '勇', {
      fontSize: '14px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);

    // ── Name (left info area, centred & larger) ───────────
    this.add.text(INFO_X, CY, '玩家一號', {
      fontSize: '14px', color: '#ffe8b0', stroke: '#1a0800', strokeThickness: 3,
    }).setOrigin(0, 0.5);

    // ── EXP badge (Lv section + bar) ──────────────────────
    const LV_W  = 40;  // left "Lv.N" column width
    const expBg = this.add.graphics();
    // Badge background
    expBg.fillStyle(WD, 0.95); expBg.fillRect(EXPB_X, CY - BH / 2, EXP_W, BH);
    expBg.lineStyle(1, 0x3a6a8a, 0.6); expBg.strokeRect(EXPB_X, CY - BH / 2, EXP_W, BH);
    expBg.fillStyle(WH, 0.12); expBg.fillRect(EXPB_X, CY - BH / 2, EXP_W, 2);
    // Lv section tinted bg
    expBg.fillStyle(WM, 0.5); expBg.fillRect(EXPB_X, CY - BH / 2, LV_W, BH);
    // Separator
    expBg.lineStyle(1, 0x3a6a8a, 0.4);
    expBg.lineBetween(EXPB_X + LV_W, CY - BH / 2 + 2, EXPB_X + LV_W, CY + BH / 2 - 2);

    // Lv text (reactive, inside Lv section)
    const lvLabel = this.add.text(EXPB_X + LV_W / 2, CY, '', {
      fontSize: '11px', color: '#5cc8a0', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);

    // Progress bar (reactive)
    const expBarGfx = this.add.graphics();
    const expValText = this.add.text(0, 0, '', { fontSize: '1px' }); // unused, kept for drawExpBar ref

    // ── Gold badge ────────────────────────────────────────
    const goldBg = this.add.graphics();
    goldBg.fillStyle(WD, 0.95); goldBg.fillRect(GOLD_X, CY - BH / 2, GOLD_W, BH);
    goldBg.lineStyle(1, WL, 0.3); goldBg.strokeRect(GOLD_X, CY - BH / 2, GOLD_W, BH);
    goldBg.fillStyle(WH, 0.15);  goldBg.fillRect(GOLD_X, CY - BH / 2, GOLD_W, 2);
    this.add.image(GOLD_X + 13, CY, 'icon_coin').setDisplaySize(22, 22);
    this.goldText = this.add.text(GOLD_X + 26, CY, InventoryStore.getGold().toLocaleString(), {
      fontSize: '11px', color: '#e8c890', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);

    // ── Settings ──────────────────────────────────────────
    const sg = this.add.graphics();
    sg.fillStyle(WM, 1);       sg.fillRect(SET_X, CY - 14, SET_W, 28);
    sg.lineStyle(1.5, WL, 0.5); sg.strokeRect(SET_X, CY - 14, SET_W, 28);
    sg.fillStyle(WH, 0.25);    sg.fillRect(SET_X, CY - 14, SET_W, 3);
    this.add.text(SET_X + SET_W / 2, CY, '≡', {
      fontSize: '20px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5);

    // ── Reactive update ───────────────────────────────────
    const drawExpBar = () => {
      const cur  = PlayerStore.getExp();
      const need = PlayerStore.expToNext();
      const pct  = Phaser.Math.Clamp(cur / need, 0, 1);

      const barPad = 5;
      const barX = EXPB_X + LV_W + barPad;
      const barW = EXP_W - LV_W - barPad * 2;
      const barH = BH - 8;
      const barY = CY - barH / 2;

      expBarGfx.clear();
      expBarGfx.fillStyle(0x081420, 1);
      expBarGfx.fillRect(barX, barY, barW, barH);
      if (pct > 0) {
        expBarGfx.fillStyle(0x1a88cc, 1);
        expBarGfx.fillRect(barX, barY, Math.max(2, barW * pct), barH);
        expBarGfx.fillStyle(0x66ccff, 0.45);
        expBarGfx.fillRect(barX, barY, Math.max(2, barW * pct), 3);
      }
      expBarGfx.lineStyle(0.5, 0x3a6a8a, 0.5);
      expBarGfx.strokeRect(barX, barY, barW, barH);

      lvLabel.setText(`Lv.${PlayerStore.getLevel()}`);
      expValText.setText('');
    };
    drawExpBar();

    const onPlayerChange = () => {
      drawExpBar();
    };
    PlayerStore.onChange(onPlayerChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PlayerStore.offChange(onPlayerChange));
  }

  // ── Sidebars ────────────────────────────────────────────

  private drawSidebars(W: number, H: number): void {
    const midH  = H - TOP_H;
    const btnSz = 66;
    const gap   = 10;

    // Left: 任務 / 裝備 / 物品
    const leftDefs: { label: string; accent: number; badge: number; onClick?: () => void }[] = [
      { label: '任務', accent: GOLD,      badge: 0, onClick: () => this.showQuestPanel(W, H) },
      { label: '裝備', accent: 0xaa88cc,  badge: 0, onClick: () => this.showEquipmentPanel(W, H) },
      { label: '物品', accent: 0x70b858,  badge: 0, onClick: () => this.showItemPanel(W, H) },
    ];
    const leftTotalH = leftDefs.length * btnSz + (leftDefs.length - 1) * gap;
    const leftY0     = TOP_H + (midH - leftTotalH) / 2;
    leftDefs.forEach((b, i) => {
      const by = leftY0 + i * (btnSz + gap) + btnSz / 2;
      this.addSideBtn(SIDE_W / 2, by, btnSz, b.label, b.accent, b.badge, b.onClick);
    });

    // Right: 卡片 / 商店
    const rightDefs: { label: string; accent: number; badge: number; onClick?: () => void }[] = [
      { label: '卡片', accent: 0xcc6688, badge: 0, onClick: () => this.openCardWindow(W, H) },
      { label: '商店', accent: 0xd47820, badge: 0, onClick: () => this.showShopPanel(W, H) },
    ];
    const rightTotalH = rightDefs.length * btnSz + (rightDefs.length - 1) * gap;
    const rightY0     = TOP_H + (midH - rightTotalH) / 2;
    rightDefs.forEach((b, i) => {
      const by = rightY0 + i * (btnSz + gap) + btnSz / 2;
      this.addSideBtn(W - SIDE_W / 2, by, btnSz, b.label, b.accent, b.badge, b.onClick);
    });
  }

  private addSideBtn(x: number, y: number, sz: number, label: string, accent: number, badge = 0, onClick?: () => void): void {
    const gfx = this.add.graphics();

    // Wood body
    gfx.fillStyle(WM, 1);
    gfx.fillRect(x - sz / 2, y - sz / 2, sz, sz);

    // Grain lines
    for (let g = 1; g <= 3; g++) {
      const gy = y - sz / 2 + sz * g / 4;
      gfx.lineStyle(1, WD, 0.3);
      gfx.lineBetween(x - sz / 2 + 2, gy, x + sz / 2 - 2, gy);
    }

    // Carved border
    gfx.lineStyle(2, WL, 0.55);
    gfx.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
    gfx.lineStyle(1, WB, 0.5);
    gfx.strokeRect(x - sz / 2 + 2, y - sz / 2 + 2, sz - 4, sz - 4);

    // Color accent strip
    gfx.fillStyle(accent, 0.7);
    gfx.fillRect(x - sz / 2, y - sz / 2, sz, 4);

    // Inner shadow below strip
    gfx.fillStyle(WB, 0.35);
    gfx.fillRect(x - sz / 2 + 2, y - sz / 2 + 4, sz - 4, 3);

    this.add.text(x, y + 5, label, {
      fontSize: '13px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5);

    if (onClick) {
      const hit = this.add.rectangle(x, y, sz, sz).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onClick);
    }

    if (badge > 0) {
      const bg2 = this.add.graphics();
      bg2.fillStyle(0xcc2020, 1);
      bg2.fillRect(x + sz / 2 - 14, y - sz / 2 + 2, 14, 14);
      bg2.lineStyle(1, 0xff4444, 0.6);
      bg2.strokeRect(x + sz / 2 - 14, y - sz / 2 + 2, 14, 14);
      this.add.text(x + sz / 2 - 7, y - sz / 2 + 9, String(badge), {
        fontSize: '10px', color: '#ffffff', stroke: '#000', strokeThickness: 1,
      }).setOrigin(0.5);
    }
  }

  // ── Craft panel ─────────────────────────────────────────

  private openForgeWindow(_W: number, _H: number): void {
    // 製作系統已移除，裝備改由懸賞任務獲得
  }


  // ── Quest panel (wanted posters, horizontal scroll) ────

  private showQuestPanel(W: number, H: number): void {
    const PW = Math.min(W - 16, 500);
    const PH = Math.min(H - 20, 370);
    const D  = 500;

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
    bg.fillRect(panelX + 5, panelY + 5, PW, PH);

    // Outer gold border
    bg.fillStyle(0xa06810, 1);
    bg.fillRect(panelX - 3, panelY - 3, PW + 6, PH + 6);
    bg.fillStyle(0xffd060, 0.7);
    bg.fillRect(panelX - 3, panelY - 3, PW + 6, 2);
    bg.fillStyle(0xffd060, 0.3);
    bg.fillRect(panelX - 3, panelY - 1, 2, PH + 4);

    // Panel body
    bg.fillStyle(0x160e04, 1);
    bg.fillRect(panelX, panelY, PW, PH);

    // Subtle wood grain
    for (let i = 0; i < 14; i++) {
      const gy = panelY + 8 + i * (PH / 14);
      bg.fillStyle(0xffffff, i % 4 === 0 ? 0.025 : 0.01);
      bg.fillRect(panelX + 4, gy, PW - 8, 1);
    }

    // Header bar
    bg.fillStyle(0x241408, 1);
    bg.fillRect(panelX, panelY, PW, 44);
    bg.fillStyle(0x3a2010, 1);
    bg.fillRect(panelX, panelY, PW, 18);

    // Gold divider under header
    bg.fillStyle(0xc88020, 1);
    bg.fillRect(panelX, panelY + 44, PW, 2);
    bg.fillStyle(0xffe080, 0.35);
    bg.fillRect(panelX, panelY + 44, PW, 1);

    // Corner rivets
    ([
      [panelX - 3, panelY - 3], [panelX + PW - 7, panelY - 3],
      [panelX - 3, panelY + PH - 7], [panelX + PW - 7, panelY + PH - 7],
    ] as [number, number][]).forEach(([rx, ry]) => {
      bg.fillStyle(0xffe080, 1); bg.fillRect(rx, ry, 10, 10);
      bg.fillStyle(0x7a4a08, 1); bg.fillRect(rx + 2, ry + 2, 6, 6);
      bg.fillStyle(0xffe080, 0.5); bg.fillRect(rx + 3, ry + 3, 2, 2);
    });

    // Panel title
    objs.push(this.add.text(W / 2, panelY + 22, '✦  懸 賞 告 示  ✦', {
      fontSize: '16px', fontStyle: 'bold',
      color: '#ffe080', stroke: '#2a1000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(D + 2));

    const closeBtn = this.add.text(panelX + PW - 18, panelY + 22, '✕', {
      fontSize: '16px', color: '#ff6644', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D + 2);
    objs.push(closeBtn);
    closeBtn.on('pointerdown', closeAll);

    // Reroll stone count — 左側 header，不壓到右邊叉叉
    const ticketQty = InventoryStore.getItemQty('quest_reroll');
    const rerollY   = panelY + 22;
    const rerollX   = panelX + 12;
    if (this.textures.exists('icon_quest_reroll')) {
      objs.push(this.add.image(rerollX + 14, rerollY, 'icon_quest_reroll')
        .setDisplaySize(28, 28).setDepth(D + 2));
    }
    objs.push(this.add.text(rerollX + 30, rerollY, `×${ticketQty}`, {
      fontSize: '14px', color: ticketQty > 0 ? '#ffdd44' : '#665533',
      stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5).setDepth(D + 2));

    // ── 3 Bounty cards ───────────────────────────────────
    const quests    = QuestStore.getQuests();
    const GAP       = 12;
    const cardAreaX = panelX + 12;
    const cardAreaY = panelY + 52;
    const cardAreaW = PW - 24;
    const CARD_W    = Math.floor((cardAreaW - GAP * 2) / 3);
    const CARD_H    = PH - 64;

    const renderCard = (quest: Quest, idx: number) => {
      const cx     = cardAreaX + idx * (CARD_W + GAP);
      const def    = getMonsterDef(quest.bossId);
      const status = quest.status;
      const dimmed = status === 'claimed';
      const canDismiss = status !== 'completed';

      // Layout
      const BANNER_H   = 32;
      const CIRCLE_Y   = cardAreaY + BANNER_H + 50;
      const CIRCLE_R   = 38;
      const NAME_Y     = CIRCLE_Y + CIRCLE_R + 14;
      const DIV_Y      = NAME_Y + 17;
      const FLAVOR_TOP = DIV_Y + 7;
      const FLAVOR_H   = CARD_H - (FLAVOR_TOP - cardAreaY) - 76;
      const GOLD_Y     = cardAreaY + CARD_H - 52;
      const BTN_Y      = cardAreaY + CARD_H - 22;
      const BTN_H      = 24;

      const cg = this.add.graphics().setDepth(D + 2);
      objs.push(cg);

      // Card shadow
      cg.fillStyle(0x000000, 0.4);
      cg.fillRect(cx + 3, cardAreaY + 3, CARD_W, CARD_H);

      // Parchment body
      cg.fillStyle(dimmed ? 0xb0946a : 0xf0dcac, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, CARD_H);
      // Edge darkening
      cg.fillStyle(0x000000, 0.08);
      cg.fillRect(cx, cardAreaY, CARD_W, 4);
      cg.fillRect(cx, cardAreaY + CARD_H - 4, CARD_W, 4);
      cg.fillRect(cx, cardAreaY, 4, CARD_H);
      cg.fillRect(cx + CARD_W - 4, cardAreaY, 4, CARD_H);

      // Card outer border (double-line)
      cg.lineStyle(2.5, dimmed ? 0x664422 : 0x7a3200, 1);
      cg.strokeRect(cx + 1, cardAreaY + 1, CARD_W - 2, CARD_H - 2);
      cg.lineStyle(1, dimmed ? 0x997744 : 0xdd8844, 0.4);
      cg.strokeRect(cx + 4, cardAreaY + 4, CARD_W - 8, CARD_H - 8);

      // ── Red banner ──
      cg.fillStyle(dimmed ? 0x3a1212 : 0x780606, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, BANNER_H);
      cg.fillStyle(dimmed ? 0x552222 : 0xaa1010, 1);
      cg.fillRect(cx, cardAreaY, CARD_W, 5);
      cg.fillStyle(0x000000, 0.25);
      cg.fillRect(cx, cardAreaY + BANNER_H - 4, CARD_W, 4);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xffcc44, 0.65);
      cg.lineBetween(cx + 5, cardAreaY + 1.5, cx + CARD_W - 5, cardAreaY + 1.5);
      cg.lineBetween(cx + 5, cardAreaY + BANNER_H - 2, cx + CARD_W - 5, cardAreaY + BANNER_H - 2);

      objs.push(this.add.text(cx + CARD_W / 2, cardAreaY + 10, '懸  賞', {
        fontSize: '13px', fontStyle: 'bold',
        color: dimmed ? '#aa8866' : '#ffe090',
        stroke: dimmed ? '#1a0800' : '#3a0000', strokeThickness: 2,
        padding: { top: 2, bottom: 1 },
      }).setOrigin(0.5).setDepth(D + 3));

      // Star rating row
      const starStr = '★'.repeat(quest.star) + '☆'.repeat(5 - quest.star);
      const starColors: Record<number, string> = { 1: '#aabbcc', 2: '#88ccff', 3: '#88ff88', 4: '#ffdd44', 5: '#ff8844' };
      objs.push(this.add.text(cx + CARD_W / 2, cardAreaY + BANNER_H - 10, starStr, {
        fontSize: '11px',
        color: dimmed ? '#776655' : (starColors[quest.star] ?? '#ffffff'),
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 3));

      // ── Dismiss X (top-right of card) ──
      if (canDismiss) {
        const hasTicket = InventoryStore.getItemQty('quest_reroll') > 0;
        const xColor    = hasTicket ? '#ff6666' : '#554433';
        const xTxt = this.add.text(cx + CARD_W - 6, cardAreaY + 6, '✕', {
          fontSize: '13px', color: xColor, stroke: '#000000', strokeThickness: 2,
        }).setOrigin(1, 0).setDepth(D + 5);
        objs.push(xTxt);
        if (hasTicket) {
          xTxt.setInteractive({ useHandCursor: true });
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
      cg.fillCircle(cx + CARD_W / 2 + 2, CIRCLE_Y + 2, CIRCLE_R);
      cg.fillStyle(dimmed ? 0x8a6030 : 0xb87820, 1);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.fillStyle(dimmed ? 0xa07840 : 0xf0d898, 0.5);
      cg.fillCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - 4);
      cg.lineStyle(2.5, dimmed ? 0xb09060 : 0xffe080, 0.9);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xc89030, 0.4);
      cg.strokeCircle(cx + CARD_W / 2, CIRCLE_Y, CIRCLE_R - 5);

      // Boss sprite
      const spriteKey = def ? `${def.spriteKey}_idle` : 'slime_idle';
      const animKey   = `q_${quest.bossId}`;
      if (!this.anims.exists(animKey) && this.textures.exists(spriteKey)) {
        this.anims.create({
          key: animKey,
          frames: this.anims.generateFrameNumbers(spriteKey, { start: 0, end: 5 }),
          frameRate: 8, repeat: -1,
        });
      }
      if (this.textures.exists(spriteKey)) {
        const sp = this.add.sprite(cx + CARD_W / 2, CIRCLE_Y, spriteKey, 0)
          .setScale(3.0).setDepth(D + 3);
        if (def?.tint) def.fillTint ? sp.setTintFill(def.tint) : sp.setTint(def.tint);
        if (this.anims.exists(animKey)) sp.play(animKey);
        if (dimmed) sp.setAlpha(0.4);
        objs.push(sp);
      }

      // ── Boss name ──
      objs.push(this.add.text(cx + CARD_W / 2, NAME_Y, def?.name ?? '???', {
        fontSize: '13px', fontStyle: 'bold',
        color: dimmed ? '#7a5030' : '#1e0c00',
        stroke: dimmed ? '#00000000' : '#e8c070', strokeThickness: 1,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 3));

      // Name underline
      cg.lineStyle(1.5, dimmed ? 0xaa7744 : 0xcc7722, 0.7);
      cg.lineBetween(cx + 10, DIV_Y, cx + CARD_W - 10, DIV_Y);

      // ── Flavor text box ──
      const flavorClipX = cx + 7;
      const flavorClipW = CARD_W - 14;

      cg.fillStyle(0x000000, 0.06);
      cg.fillRect(flavorClipX + 1, FLAVOR_TOP + 1, flavorClipW, FLAVOR_H);
      cg.fillStyle(dimmed ? 0x7a5a28 : 0xcc9840, 0.22);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.fillStyle(0xffffff, 0.1);
      cg.fillRect(flavorClipX, FLAVOR_TOP, flavorClipW, 2);
      cg.lineStyle(1.5, dimmed ? 0x664422 : 0x7a3400, 0.85);
      cg.strokeRect(flavorClipX, FLAVOR_TOP, flavorClipW, FLAVOR_H);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xdd7722, 0.35);
      cg.strokeRect(flavorClipX + 2, FLAVOR_TOP + 2, flavorClipW - 4, FLAVOR_H - 4);

      const flavorTxt = this.add.text(
        cx + CARD_W / 2, FLAVOR_TOP + 5, quest.flavorText, {
        fontSize: '13px', lineSpacing: 3,
        color: dimmed ? '#6a5030' : '#3a1c04',
        wordWrap: { width: flavorClipW - 12, useAdvancedWrap: true }, align: 'center',
        padding: { top: 4, bottom: 4 },
      }).setOrigin(0.5, 0).setDepth(D + 3);
      objs.push(flavorTxt);

      const maskGfx = this.make.graphics({ add: false } as any);
      maskGfx.fillStyle(0xffffff);
      maskGfx.fillRect(flavorClipX + 1, FLAVOR_TOP - 3, flavorClipW - 2, FLAVOR_H + 3);
      flavorTxt.setMask(maskGfx.createGeometryMask());
      objs.push(maskGfx);

      if (flavorTxt.height > FLAVOR_H - 8) {
        const arrow = this.add.text(cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H - 8, '▼', {
          fontSize: '8px', color: '#aa6622',
        }).setOrigin(0.5).setDepth(D + 4);
        objs.push(arrow);
        const dz = this.add.zone(
          cx + CARD_W / 2, FLAVOR_TOP + FLAVOR_H / 2, flavorClipW, FLAVOR_H,
        ).setInteractive().setDepth(D + 5);
        objs.push(dz);
        const minY = FLAVOR_TOP + 5 - (flavorTxt.height - (FLAVOR_H - 10));
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
      cg.fillRect(cx + 6, GOLD_Y - 12, CARD_W - 12, 23);
      cg.lineStyle(1, dimmed ? 0x886644 : 0xcc8822, 0.6);
      cg.strokeRect(cx + 6, GOLD_Y - 12, CARD_W - 12, 23);

      if (quest.isEquipReward) {
        objs.push(this.add.text(cx + CARD_W / 2, GOLD_Y, '★ 裝備獎勵', {
          fontSize: '16px', fontStyle: 'bold',
          color: dimmed ? '#665544' : '#44ccff',
          strokeThickness: 0,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 3));
      } else {
        const coinImg = this.add.image(cx + CARD_W / 2 - 18, GOLD_Y, 'icon_coin')
          .setDisplaySize(18, 18).setDepth(D + 3);
        if (dimmed) coinImg.setAlpha(0.5);
        objs.push(coinImg);
        objs.push(this.add.text(cx + CARD_W / 2 - 7, GOLD_Y, `${quest.reward}`, {
          fontSize: '16px', fontStyle: 'bold',
          color: dimmed ? '#776644' : '#e8c060',
          stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(D + 3));
      }

      // ── Action button ──
      const btnW = CARD_W - 28;
      const btnX = cx + CARD_W / 2;

      if (status === 'accepted') {
        // 繼續出征 button (centred at BTN_Y)
        const resumeBtnH = 24;
        const bg2 = this.add.graphics().setDepth(D + 3);
        objs.push(bg2);
        bg2.fillStyle(0x000000, 0.35);
        bg2.fillRect(btnX - btnW / 2 + 2, BTN_Y - resumeBtnH / 2 + 2, btnW, resumeBtnH);
        bg2.fillStyle(0x0e1638, 1);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - resumeBtnH / 2, btnW, resumeBtnH);
        bg2.fillStyle(0xffffff, 0.12);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - resumeBtnH / 2, btnW, 3);
        bg2.lineStyle(1.5, 0x3355cc, 0.9);
        bg2.strokeRect(btnX - btnW / 2, BTN_Y - resumeBtnH / 2, btnW, resumeBtnH);
        objs.push(this.add.text(btnX, BTN_Y, '繼續出征', {
          fontSize: '12px', fontStyle: 'bold',
          color: '#6699ff', stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(D + 4));
        const resumeHit = this.add.rectangle(btnX, BTN_Y, btnW, resumeBtnH)
          .setInteractive({ useHandCursor: true }).setDepth(D + 5);
        objs.push(resumeHit);
        resumeHit.on('pointerdown', () => { closeAll(); this.scene.start('GameScene'); });
      } else {
        let bgC  = 0x1a3a0c, ltC  = 0x44cc22, txtC = '#88ee44', label = '接  受';
        if (status === 'completed') { bgC = 0x382000; ltC = 0xddaa00; txtC = '#ffdd44'; label = '領  取'; }
        if (status === 'claimed')   { bgC = 0x1c1810; ltC = 0x554433; txtC = '#665544'; label = '已領取'; }

        const bg2 = this.add.graphics().setDepth(D + 3);
        objs.push(bg2);
        bg2.fillStyle(0x000000, 0.35);
        bg2.fillRect(btnX - btnW / 2 + 2, BTN_Y - BTN_H / 2 + 2, btnW, BTN_H);
        bg2.fillStyle(bgC, 1);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);
        bg2.fillStyle(0xffffff, 0.12);
        bg2.fillRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, 3);
        bg2.lineStyle(1.5, ltC, 0.9);
        bg2.strokeRect(btnX - btnW / 2, BTN_Y - BTN_H / 2, btnW, BTN_H);

        objs.push(this.add.text(btnX, BTN_Y, label, {
          fontSize: '13px', fontStyle: 'bold',
          color: txtC, stroke: '#000000', strokeThickness: 2,
          padding: { top: 4, bottom: 2 },
        }).setOrigin(0.5).setDepth(D + 4));

        if (status === 'available' || status === 'completed') {
          const hit = this.add.rectangle(btnX, BTN_Y, btnW, BTN_H)
            .setInteractive({ useHandCursor: true }).setDepth(D + 5);
          objs.push(hit);
          hit.on('pointerdown', () => {
            if (status === 'available') showConfirm(quest);
            else if (quest.isEquipReward) showEquipRewardModal(quest, closeAll);
            else claimQuest(quest, closeAll);
          });
        }
      }
    };

    quests.forEach((q, i) => renderCard(q, i));

    // ── Confirm dialog ────────────────────────────────────
    const showConfirm = (quest: Quest) => {
      const cW = 240, cH = 96;
      const cX = W / 2 - cW / 2, cY = H / 2 - cH / 2;
      const co: Phaser.GameObjects.GameObject[] = [];
      const closeCo = () => co.forEach(o => o.destroy());

      const cbg = this.add.graphics().setDepth(D + 10);
      co.push(cbg);
      cbg.fillStyle(0x000000, 0.5);
      cbg.fillRect(cX + 4, cY + 4, cW, cH);
      cbg.fillStyle(0xa06810, 1);
      cbg.fillRect(cX - 3, cY - 3, cW + 6, cH + 6);
      cbg.fillStyle(0xffe080, 0.6);
      cbg.fillRect(cX - 3, cY - 3, cW + 6, 2);
      cbg.fillStyle(0x160e04, 1);
      cbg.fillRect(cX, cY, cW, cH);
      ([
        [cX - 3, cY - 3], [cX + cW - 7, cY - 3],
        [cX - 3, cY + cH - 7], [cX + cW - 7, cY + cH - 7],
      ] as [number, number][]).forEach(([rx, ry]) => {
        cbg.fillStyle(0xffe080, 1); cbg.fillRect(rx, ry, 10, 10);
        cbg.fillStyle(0x7a4a08, 1); cbg.fillRect(rx + 2, ry + 2, 6, 6);
      });

      co.push(this.add.text(W / 2, cY + 28, '確定接受這份懸賞？', {
        fontSize: '14px', fontStyle: 'bold',
        color: '#ffe080', stroke: '#2a1000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));

      const drawBtn = (
        gfx: Phaser.GameObjects.Graphics,
        bx: number, by: number, bw: number, bh: number,
        bgCol: number, ltCol: number,
      ) => {
        gfx.fillStyle(0x000000, 0.35); gfx.fillRect(bx + 2, by + 2, bw, bh);
        gfx.fillStyle(bgCol, 1);       gfx.fillRect(bx, by, bw, bh);
        gfx.fillStyle(0xffffff, 0.14); gfx.fillRect(bx, by, bw, 3);
        gfx.lineStyle(1.5, ltCol, 0.9); gfx.strokeRect(bx, by, bw, bh);
      };

      const yg = this.add.graphics().setDepth(D + 11);
      co.push(yg);
      drawBtn(yg, cX + 14, cY + 58, 96, 26, 0x1a3a0c, 0x44cc22);
      co.push(this.add.text(cX + 62, cY + 71, '出  發', {
        fontSize: '13px', fontStyle: 'bold',
        color: '#88ee44', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const yHit = this.add.rectangle(cX + 62, cY + 71, 96, 26)
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(yHit);
      yHit.on('pointerdown', () => {
        QuestStore.acceptQuest(quest.id);
        closeCo(); closeAll();
        this.scene.start('GameScene');
      });

      const ng = this.add.graphics().setDepth(D + 11);
      co.push(ng);
      drawBtn(ng, cX + 130, cY + 58, 96, 26, 0x3a0808, 0xcc2222);
      co.push(this.add.text(cX + 178, cY + 71, '取  消', {
        fontSize: '13px', fontStyle: 'bold',
        color: '#ff6644', stroke: '#000', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(D + 11));
      const nHit = this.add.rectangle(cX + 178, cY + 71, 96, 26)
        .setDepth(D + 12).setInteractive({ useHandCursor: true });
      co.push(nHit);
      nHit.on('pointerdown', closeCo);
    };

    // ── Equip reward modal ────────────────────────────────
    const showEquipRewardModal = (quest: Quest, afterClose: () => void) => {
      const SLOTS: EquipSlot[] = ['hat', 'outfit', 'shoes', 'ring1', 'ring2', 'sword'];
      const pickedSlots = [...SLOTS].sort(() => Math.random() - 0.5).slice(0, 3);
      const weights = STAR_EQUIP_QUALITY[quest.star] ?? {};
      const items: EquipmentItem[] = pickedSlots.map(s =>
        generateEquipment(s, randomQuality(weights as any))
      );

      const MW = Math.min(W - 24, 340);
      const ITEM_H = 80;
      const MH = ITEM_H * 3 + 56 + 16;
      const mx = W / 2 - MW / 2;
      const my = H / 2 - MH / 2;
      const MD = D + 10;
      const mo: Phaser.GameObjects.GameObject[] = [];
      const closeMo = () => mo.forEach(o => o.destroy());

      // Backdrop
      const mbk = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.7)
        .setDepth(MD).setInteractive();
      mo.push(mbk);

      // Panel
      const mg = this.add.graphics().setDepth(MD + 1);
      mo.push(mg);
      mg.fillStyle(WD, 1); mg.fillRect(mx, my, MW, MH);
      mg.lineStyle(2, GOLD, 0.9); mg.strokeRect(mx, my, MW, MH);
      mg.fillStyle(WB, 1); mg.fillRect(mx, my, MW, 36);
      mg.lineStyle(1, GOLD, 0.4); mg.lineBetween(mx, my + 36, mx + MW, my + 36);

      mo.push(this.add.text(W / 2, my + 18, '選擇獎勵裝備', {
        fontSize: '14px', fontStyle: 'bold',
        color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
        padding: { top: 4, bottom: 2 },
      }).setOrigin(0.5).setDepth(MD + 2));

      items.forEach((item, idx) => {
        const iy = my + 36 + idx * ITEM_H + 8;
        const qColor = QUALITY_COLORS[item.quality];
        const qHex   = '#' + qColor.toString(16).padStart(6, '0');

        // Row bg
        const rg = this.add.graphics().setDepth(MD + 2);
        mo.push(rg);
        rg.fillStyle(WM, 1); rg.fillRect(mx + 6, iy, MW - 12, ITEM_H - 8);
        rg.lineStyle(1.5, qColor, 0.7); rg.strokeRect(mx + 6, iy, MW - 12, ITEM_H - 8);
        rg.fillStyle(qColor, 0.15); rg.fillRect(mx + 6, iy, MW - 12, 3);

        // Image
        if (this.textures.exists(item.texture))
          mo.push(this.add.image(mx + 34, iy + (ITEM_H - 8) / 2, item.texture)
            .setDisplaySize(44, 44).setDepth(MD + 3));

        // Slot + quality
        mo.push(this.add.text(mx + 62, iy + 10,
          `${SLOT_NAMES[item.slot]}  [${QUALITY_NAMES[item.quality]}]`, {
            fontSize: '12px', fontStyle: 'bold',
            color: qHex, stroke: '#0a0600', strokeThickness: 2,
            padding: { top: 2, bottom: 1 },
          }).setOrigin(0, 0.5).setDepth(MD + 3));

        // Affixes
        const affixLines = item.affixes.map(a => {
          const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
          return `${STAT_NAMES[a.stat]} +${isPct ? (a.value*100).toFixed(1)+'%' : a.value}`;
        });
        if (item.behavior) affixLines.push(BEHAVIOR_NAMES[item.behavior]);
        mo.push(this.add.text(mx + 62, iy + 30, affixLines.join('   '), {
          fontSize: '10px', color: '#88cc88',
          stroke: '#0a0600', strokeThickness: 1,
          padding: { top: 2, bottom: 1 },
          wordWrap: { width: MW - 76 },
        }).setOrigin(0, 0.5).setDepth(MD + 3));

        // Hit zone
        const hit = this.add.rectangle(mx + MW / 2, iy + (ITEM_H - 8) / 2, MW - 12, ITEM_H - 8)
          .setInteractive({ useHandCursor: true }).setDepth(MD + 4);
        mo.push(hit);
        hit.on('pointerover',  () => { rg.clear(); rg.fillStyle(WL, 1); rg.fillRect(mx + 6, iy, MW - 12, ITEM_H - 8); rg.lineStyle(2, qColor, 1); rg.strokeRect(mx + 6, iy, MW - 12, ITEM_H - 8); });
        hit.on('pointerout',   () => { rg.clear(); rg.fillStyle(WM, 1); rg.fillRect(mx + 6, iy, MW - 12, ITEM_H - 8); rg.lineStyle(1.5, qColor, 0.7); rg.strokeRect(mx + 6, iy, MW - 12, ITEM_H - 8); rg.fillStyle(qColor, 0.15); rg.fillRect(mx + 6, iy, MW - 12, 3); });
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
    const PW = Math.min(W - 16, 640);
    const PH = Math.min(H - 16, 560);
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
    bg.fillStyle(IRON, 1); bg.fillRect(px - 3, py - 3, PW + 6, PH + 6);
    bg.fillStyle(WL,   1); bg.fillRect(px - 2, py - 2, PW + 4, PH + 4);
    bg.fillStyle(WD,   1); bg.fillRect(px, py, PW, PH);
    for (let row = 1; row < Math.ceil(PH / 24); row++) {
      const ry = py + row * 24;
      bg.lineStyle(1, WB, 0.5);  bg.lineBetween(px + 2, ry, px + PW - 2, ry);
      bg.lineStyle(1, WH, 0.08); bg.lineBetween(px + 2, ry + 1, px + PW - 2, ry + 1);
    }
    [[px, py], [px + PW - 8, py], [px, py + PH - 8], [px + PW - 8, py + PH - 8]]
      .forEach(([rx, ry]) => {
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, 8, 8);
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + 2, ry + 2, 4, 4);
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, 42);
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + 40, PW, 2);
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + 42, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 21, '裝  備', {
      fontSize: '17px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 22, py + 21, '✕', {
      fontSize: '16px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      PlayerStore.offChange(onStoreChange);
      container.destroy();
    });
    container.add(closeBtn);

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
    const slotSz  = 76;
    const slotGap = 8;
    const ECOLS   = 3;
    const EROWS   = 2;
    const eGridX  = px + 12;
    const eGridY  = py + 50;
    const eGridH  = EROWS * slotSz + (EROWS - 1) * slotGap;   // 160

    // ── 人物屬性區（裝備格下方，左欄同寬）───────────────
    const eGridW  = ECOLS * slotSz + (ECOLS - 1) * slotGap;   // 244
    const statsX  = eGridX;
    const statsY  = eGridY + eGridH + 10;
    const statsW  = eGridW;
    const statsH  = 140;

    // ── 右欄（清單區）────────────────────────────────────
    const rightColX = eGridX + eGridW + 26;   // left edge of right column
    const rightColW = px + PW - 10 - rightColX;  // remaining width
    const rightColTop = py + 50;              // top of right column (below title)

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
        fontSize: '15px', color: txtClr, stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5);
      det.add(t);
      const hit = this.add.rectangle(cx, cy, bw, bh).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', onClick);
      det.add(hit);
    };

    const showBehaviorModal = (behavior: import('../data/equipment-data').AttackBehavior) => {
      const info = BEHAVIOR_INFO[behavior];
      const { width: W, height: H } = this.scale;
      const mw = 280;

      const probe = this.add.text(-9999, -9999, info.desc, {
        fontSize: '12px', wordWrap: { width: mw - 32, useAdvancedWrap: true }, lineSpacing: 3,
      });
      const descH = probe.height;
      probe.destroy();

      const titleH    = 48;
      const sepGap    = 14;
      const formulaH  = 28 + info.formula.length * 20;
      const statsH    = 28 + Math.ceil(info.relatedStats.length / 2) * 22;
      const closeBtnH = 44;
      const mh = titleH + descH + sepGap + 14 + formulaH + 12 + statsH + closeBtnH;
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
      bg.lineStyle(2, 0xc49050, 0.8); bg.strokeRect(mx, my, mw, mh);
      bg.fillStyle(0xc49050, 0.35); bg.fillRect(mx, my, mw, 3);

      s(this.add.text(mx + mw / 2, my + 20, BEHAVIOR_NAMES[behavior], {
        fontSize: '17px', color: '#ffe066', stroke: '#1a0800', strokeThickness: 2, fontStyle: 'bold',
      }).setOrigin(0.5, 0).setDepth(D + 2));

      s(this.add.text(mx + 16, my + titleH, info.desc, {
        fontSize: '12px', color: '#ccbbaa', wordWrap: { width: mw - 32, useAdvancedWrap: true }, lineSpacing: 3,
      }).setOrigin(0, 0).setDepth(D + 2));

      const sepY = my + titleH + descH + sepGap;
      const sepG = s(this.add.graphics().setDepth(D + 2));
      sepG.fillStyle(0xc49050, 0.3); sepG.fillRect(mx + 12, sepY, mw - 24, 1);

      s(this.add.text(mx + 16, sepY + 8, '傷害公式', {
        fontSize: '11px', color: '#c49050', fontStyle: 'bold',
      }).setOrigin(0, 0).setDepth(D + 2));

      info.formula.forEach((line, i) => {
        s(this.add.text(mx + 16, sepY + 26 + i * 20, `• ${line}`, {
          fontSize: '12px', color: '#aaddaa',
        }).setOrigin(0, 0).setDepth(D + 2));
      });

      // ── 影響數值 ──────────────────────────────────────────
      const statsY = sepY + 26 + info.formula.length * 20 + 12;
      const statsG = s(this.add.graphics().setDepth(D + 2));
      statsG.fillStyle(0xc49050, 0.3); statsG.fillRect(mx + 12, statsY, mw - 24, 1);

      s(this.add.text(mx + 16, statsY + 8, '影響數值', {
        fontSize: '11px', color: '#c49050', fontStyle: 'bold',
      }).setOrigin(0, 0).setDepth(D + 2));

      const STAT_TAG_COLORS: Partial<Record<import('../data/equipment-data').StatKey, number>> = {
        atk: 0x6633aa, hp: 0xaa3333, def: 0x336688, crit: 0xcc8800,
        atkSpeed: 0x227744, speed: 0x225588, lifesteal: 0x883344, evasion: 0x557722,
      };
      info.relatedStats.forEach(({ stat, note }, i) => {
        const col  = i % 2;
        const row  = Math.floor(i / 2);
        const tx   = mx + 16 + col * ((mw - 32) / 2);
        const ty   = statsY + 26 + row * 22;
        const tagW = (mw - 40) / 2;
        const tagH = 18;
        const tagG = s(this.add.graphics().setDepth(D + 2));
        const c    = STAT_TAG_COLORS[stat] ?? 0x444444;
        tagG.fillStyle(c, 0.25); tagG.fillRoundedRect(tx, ty, tagW, tagH, 4);
        tagG.lineStyle(1, c, 0.6); tagG.strokeRoundedRect(tx, ty, tagW, tagH, 4);
        s(this.add.text(tx + tagW / 2, ty + tagH / 2, `${STAT_NAMES[stat]}  ${note}`, {
          fontSize: '10px', color: '#ddd8cc',
        }).setOrigin(0.5, 0.5).setDepth(D + 3));
      });

      const closeY = my + mh - 22;
      const closeG = s(this.add.graphics().setDepth(D + 2));
      closeG.fillStyle(0x3a2000, 1); closeG.fillRect(mx + mw / 2 - 40, closeY - 14, 80, 28);
      closeG.lineStyle(1.5, 0xc49050, 0.7); closeG.strokeRect(mx + mw / 2 - 40, closeY - 14, 80, 28);

      const closeT = s(this.add.text(mx + mw / 2, closeY, '關  閉', {
        fontSize: '13px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D + 3));
      closeT.on('pointerdown', () => closeModal());
    };

    const showEnhanceStub = () => {
      const note = this.add.text(rightColX + rightColW / 2, rightColTop + 20, '強化功能即將推出', {
        fontSize: '13px', color: '#ffcc44', stroke: '#000', strokeThickness: 2,
        backgroundColor: '#3a2000', padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setDepth(600);
      this.tweens.add({ targets: note, alpha: 0, delay: 1200, duration: 400, onComplete: () => note.destroy() });
    };

    let activeDetail: Phaser.GameObjects.Container | null = null;

    const showEquippedDetail = (item: import('../data/equipment-data').EquipmentItem, equipSlot: EquipSlot) => {
      if (activeDetail) return;
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH   = py + PH - areaTop - 6;
      const rcx     = rightColX + rightColW / 2;   // centre of right column

      // 全面板透明遮擋，阻止點擊穿透到下層
      det.add(this.add.rectangle(0, 0, PW, PH, 0x000000, 0).setInteractive());

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - 4, areaTop, rightColW + 8, areaH);
      det.add(detBg);

      const backBtn = this.add.text(rightColX + 8, areaTop + 16, '← 返回', {
        fontSize: '14px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeEquipped = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeEquipped());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + 32, areaTop + 60, item.texture).setDisplaySize(56, 56));

      det.add(this.add.text(rightColX + 72, areaTop + 38, item.name, {
        fontSize: '16px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY = areaTop + 58;
      if (item.behavior) {
        det.add(this.add.text(rightColX + 72, statOffsetY, `攻擊模式：${BEHAVIOR_NAMES[item.behavior]}`, {
          fontSize: '12px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0));
        const viewBtn = this.add.text(rightColX + rightColW - 8, statOffsetY, '查看', {
          fontSize: '11px', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
          backgroundColor: '#3a2000', padding: { x: 5, y: 2 },
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        viewBtn.on('pointerdown', () => showBehaviorModal(item.behavior!));
        det.add(viewBtn);
        statOffsetY += 18;
      }
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
        statParts.push(`${STAT_NAMES[a.stat]} +${isPct ? (a.value * 100).toFixed(1) + '%' : a.value}`);
      });
      det.add(this.add.text(rightColX + 72, statOffsetY, statParts.join('\n'), {
        fontSize: '12px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = (item.behavior ? 1 : 0) * 18 + statParts.length * 18 + 12;
      dg.fillStyle(WB, 1);   dg.fillRect(rightColX, areaTop + 50 + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + 51 + statBlockH, rightColW, 1);
      det.add(dg);

      // 脫下 | 強化
      const btnH = 38, btnW = 136, btnGap = 8;
      const btnY = areaTop + areaH - 28;
      drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY, btnW, btnH,
        '脫  下', 0x3a1a1a, 0xcc4444, '#ee8888',
        () => { PlayerStore.unequip(equipSlot); closeEquipped(); });
      drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY, btnW, btnH,
        '強  化', 0x3a2800, 0xf0c040, '#ffe066',
        () => showEnhanceStub());
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
        sg.fillStyle(item ? WMI : WM, 1); sg.fillRect(sx + 2, sy + 2, slotSz - 4, slotSz - 4);
        sg.lineStyle(1.5, item ? GOLD : WL, item ? 0.5 : 0.4);
        sg.strokeRect(sx, sy, slotSz, slotSz);
        sg.fillStyle(s.color, 0.55); sg.fillRect(sx, sy, slotSz, 3);
        topSlotsLayer.add(sg);

        if (item && this.textures.exists(item.texture)) {
          topSlotsLayer.add(
            this.add.image(sx + slotSz / 2, sy + slotSz / 2 - 8, item.texture)
              .setDisplaySize(48, 48),
          );
          sg.fillStyle(0x000000, 0.5); sg.fillRect(sx, sy + slotSz - 18, slotSz, 18);
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz - 10, item.name, {
            fontSize: '11px', color: '#ffe8a0', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));

          const tap = this.add.rectangle(sx + slotSz / 2, sy + slotSz / 2, slotSz, slotSz)
            .setInteractive({ useHandCursor: true });
          tap.on('pointerdown', () => showEquippedDetail(item, s.slotKey));
          topSlotsLayer.add(tap);
        } else {
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, sy + slotSz / 2 - 4, s.label, {
            fontSize: '14px', color: '#b08040', stroke: '#000000', strokeThickness: 2,
          }).setOrigin(0.5));
        }
      });
    };
    buildTopSlots();

    // ── buildStats：人物屬性（全寬 2列×3欄）──────────────────
    const buildStats = () => {
      statsLayer.removeAll(true);
      const s  = PlayerStore.getStats();
      const lv = PlayerStore.getLevel();

      const sg = this.add.graphics();
      sg.fillStyle(WD, 0.55); sg.fillRect(statsX, statsY, statsW, statsH);
      sg.lineStyle(1, WL, 0.25); sg.strokeRect(statsX, statsY, statsW, statsH);
      sg.fillStyle(WB, 0.6); sg.fillRect(statsX, statsY, statsW, 20);
      statsLayer.add(sg);

      statsLayer.add(this.add.text(statsX + statsW / 2, statsY + 10, '人 物 屬 性', {
        fontSize: '12px', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));

      const allRows = [
        [{ label: 'Lv',   value: `${lv}`,                             color: '#ffee88' }, { label: 'HP',    value: `${s.maxHp}`,                              color: '#88ee88' }],
        [{ label: '攻擊', value: `${s.atk}`,                          color: '#ff8855' }, { label: '防禦',  value: `${s.def}`,                               color: '#88aaff' }],
        [{ label: '速度', value: `${s.speed}`,                        color: '#ffff88' }, { label: '暴擊',  value: `${(s.crit * 100).toFixed(0)}%`,           color: '#ffaa44' }],
        [{ label: '攻速', value: `${(s.atkSpeed * 100).toFixed(0)}%`, color: '#ff88ff' }, { label: '閃避',  value: `${(s.evasion * 100).toFixed(1)}%`,        color: '#aaddff' }],
        [{ label: '爆傷', value: `${((1 + s.critDmg) * 100).toFixed(0)}%`, color: '#ffdd44' }, { label: '吸血', value: `${(s.lifesteal * 100).toFixed(1)}%`, color: '#ff6699' }],
        [{ label: 'HP恢復', value: `${s.hpRegen}/s`,                  color: '#44ffaa' }],
      ];
      const colW2 = statsW / 2;
      const rowH  = (statsH - 20) / 6;

      allRows.forEach((row, ri) => {
        row.forEach((cell, ci) => {
          const cx = statsX + ci * colW2;
          const ry = statsY + 20 + ri * rowH + rowH / 2;
          statsLayer.add(this.add.text(cx + 6, ry, cell.label, { fontSize: '11px', color: '#888888', stroke: '#000', strokeThickness: 1 }).setOrigin(0, 0.5));
          statsLayer.add(this.add.text(cx + colW2 - 6, ry, cell.value, { fontSize: '13px', fontStyle: 'bold', color: cell.color, stroke: '#000', strokeThickness: 1 }).setOrigin(1, 0.5));
        });
      });
    };
    buildStats();

    // ── 垂直分隔線 ────────────────────────────────────────
    const divGfx = this.add.graphics();
    const divX   = rightColX - 13;
    divGfx.fillStyle(WB, 1);   divGfx.fillRect(divX, py + 44, 2, PH - 52);
    divGfx.fillStyle(WH, 0.3); divGfx.fillRect(divX + 2, py + 44, 1, PH - 52);
    container.add(divGfx);

    // ── Tabs（右欄頂部）──────────────────────────────────
    const tabH    = 30;
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
    const gridY    = tabY + tabH + 6;
    const cellSz   = 68;
    const cellGap  = 7;
    const gridLeft = rightColX;
    const cols     = Math.floor((rightColW + cellGap) / (cellSz + cellGap));
    const gridH    = PH / 2 - 10 - gridY;   // visible height of grid area

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridWheelHandler: ((...args: any[]) => void) | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let gridMoveHandler:  ((...args: any[]) => void) | null = null;

    const gridLayer = this.add.container(0, 0);
    container.add(gridLayer);

    // ── Detail overlay ────────────────────────────────────
    const showItemDetail = (item: import('../data/equipment-data').EquipmentItem) => {
      if (activeDetail) return;
      const det = this.add.container(0, 0);
      activeDetail = det;
      container.add(det);

      const areaTop = rightColTop;
      const areaH   = py + PH - areaTop - 6;
      const rcx     = rightColX + rightColW / 2;

      // 全面板透明遮擋，阻止點擊穿透到下層
      det.add(this.add.rectangle(0, 0, PW, PH, 0x000000, 0).setInteractive());

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(rightColX - 4, areaTop, rightColW + 8, areaH);
      det.add(detBg);

      const backBtn = this.add.text(rightColX + 8, areaTop + 16, '← 返回', {
        fontSize: '14px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      const closeItem = () => { activeDetail = null; det.destroy(); };
      backBtn.on('pointerdown', () => closeItem());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(rightColX + 32, areaTop + 60, item.texture).setDisplaySize(56, 56));

      det.add(this.add.text(rightColX + 72, areaTop + 38, item.name, {
        fontSize: '16px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      let statOffsetY2 = areaTop + 58;
      if (item.behavior) {
        det.add(this.add.text(rightColX + 72, statOffsetY2, `攻擊模式：${BEHAVIOR_NAMES[item.behavior]}`, {
          fontSize: '12px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0));
        const viewBtn = this.add.text(rightColX + rightColW - 8, statOffsetY2, '查看', {
          fontSize: '11px', color: '#ffe066', stroke: '#1a0800', strokeThickness: 1,
          backgroundColor: '#3a2000', padding: { x: 5, y: 2 },
        }).setOrigin(1, 0).setInteractive({ useHandCursor: true });
        viewBtn.on('pointerdown', () => showBehaviorModal(item.behavior!));
        det.add(viewBtn);
        statOffsetY2 += 18;
      }
      const statParts: string[] = [];
      item.affixes.forEach(a => {
        const isPct = ['crit','atkSpeed','lifesteal','evasion'].includes(a.stat);
        statParts.push(`${STAT_NAMES[a.stat]} +${isPct ? (a.value * 100).toFixed(1) + '%' : a.value}`);
      });
      det.add(this.add.text(rightColX + 72, statOffsetY2, statParts.join('\n'), {
        fontSize: '12px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
        lineSpacing: 4,
      }).setOrigin(0, 0));

      const dg = this.add.graphics();
      const statBlockH = (item.behavior ? 1 : 0) * 18 + statParts.length * 18 + 12;
      dg.fillStyle(WB, 1);   dg.fillRect(rightColX, areaTop + 50 + statBlockH, rightColW, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(rightColX, areaTop + 51 + statBlockH, rightColW, 1);
      det.add(dg);

      const btnH = 38, btnW = 136, btnGap = 8;
      const btnY = areaTop + areaH - 28;

      if (item.slot === 'ring1') {
        // ── 飾品：槽位按鈕一排，強化單獨一排 ─────────────
        const hW  = (btnW - 4) / 2;
        const cx1 = rcx - btnW / 2 + hW / 2;
        const cx2 = rcx + btnW / 2 - hW / 2;
        const eq1 = PlayerStore.getEquipped()['ring1'];
        const eq2 = PlayerStore.getEquipped()['ring2'];

        const drawSlotBtn = (g: Phaser.GameObjects.Graphics, cx: number, occupied: boolean) => {
          g.fillStyle(0x5a3800, 1); g.fillRect(cx - hW / 2, btnY - btnH / 2, hW, btnH);
          g.fillStyle(GOLD, occupied ? 0.06 : 0.14); g.fillRect(cx - hW / 2, btnY - btnH / 2, hW, btnH);
          g.lineStyle(occupied ? 1.5 : 2, GOLD, occupied ? 0.5 : 0.85);
          g.strokeRect(cx - hW / 2, btnY - btnH / 2, hW, btnH);
          if (!occupied) { g.fillStyle(GOLD, 0.35); g.fillRect(cx - hW / 2, btnY - btnH / 2, hW, 2); }
        };
        const slotBtnGfx = this.add.graphics();
        drawSlotBtn(slotBtnGfx, cx1, !!eq1);
        drawSlotBtn(slotBtnGfx, cx2, !!eq2);
        det.add(slotBtnGfx);

        det.add(this.add.text(cx1, btnY - 7, '飾品 1', { fontSize: '13px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx1, btnY + 9, eq1 ? eq1.name.slice(0, 6) : '空', { fontSize: '10px', color: eq1 ? '#cc8888' : '#558855' }).setOrigin(0.5));
        det.add(this.add.text(cx2, btnY - 7, '飾品 2', { fontSize: '13px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2 }).setOrigin(0.5));
        det.add(this.add.text(cx2, btnY + 9, eq2 ? eq2.name.slice(0, 6) : '空', { fontSize: '10px', color: eq2 ? '#cc8888' : '#558855' }).setOrigin(0.5));

        const hit1 = this.add.rectangle(cx1, btnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit1.on('pointerdown', () => { PlayerStore.equipToSlot(item, 'ring1'); closeItem(); });
        det.add(hit1);
        const hit2 = this.add.rectangle(cx2, btnY, hW, btnH).setInteractive({ useHandCursor: true });
        hit2.on('pointerdown', () => { PlayerStore.equipToSlot(item, 'ring2'); closeItem(); });
        det.add(hit2);

        drawBtn(det, rcx, btnY + btnH + 8, btnW, btnH,
          '強  化', 0x3a2800, 0xf0c040, '#ffe066',
          () => showEnhanceStub());
      } else {
        // ── 一般裝備：裝備 | 強化 ──────────��───────────────
        drawBtn(det, rcx - btnW / 2 - btnGap / 2, btnY, btnW, btnH,
          '裝  備', 0x5a3800, GOLD, '#e8c070',
          () => { PlayerStore.equip(item); closeItem(); });
        drawBtn(det, rcx + btnW / 2 + btnGap / 2, btnY, btnW, btnH,
          '強  化', 0x3a2800, 0xf0c040, '#ffe066',
          () => showEnhanceStub());
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
          fontSize: '14px', color: '#5a3820', stroke: '#1a0800', strokeThickness: 1,
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
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + 2, cy2 + 2, cellSz - 4, cellSz - 4);
        gg.fillStyle(col2, 0.5); gg.fillRect(cx2, cy2, cellSz, 3);
        gg.lineStyle(1.5, WL, 0.35); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        if (this.textures.exists(item.texture))
          scrollCnt.add(
            this.add.image(cx2 + cellSz / 2, cy2 + cellSz / 2 - 8, item.texture).setDisplaySize(42, 42),
          );

        gg.fillStyle(0x000000, 0.5); gg.fillRect(cx2, cy2 + cellSz - 18, cellSz, 18);
        scrollCnt.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - 10, item.name, {
          fontSize: '11px', color: '#ffe8a0', stroke: '#000000', strokeThickness: 2,
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
        fontSize: '14px', color: i === 0 ? '#e8c070' : '#7a5830',
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
    const cleanupGrid = () => {
      PlayerStore.offChange(onStoreChange);
      if (gridWheelHandler) this.input.off('wheel', gridWheelHandler);
      if (gridMoveHandler)  this.input.off('pointermove', gridMoveHandler);
    };
    container.once('destroy', cleanupGrid);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanupGrid);
  }

  // ── Item panel ──────────────────────────────────────────

  private showItemPanel(W: number, H: number): void {
    const PW = Math.min(480, W - 20);
    const PH = Math.min(380, H - 40);
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
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, 8, 8);
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + 2, ry + 2, 4, 4);
      });
    bg.fillStyle(WB, 0.9);
    bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4);
    bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1);
    bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '物  品', {
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      InventoryStore.offChange(onItemChange);
      container.destroy();
    });
    container.add(closeBtn);

    // ── Item grid ─────────────────────────────────────────
    const gridY    = py + 44;
    const cellSz   = 80;
    const cellGap  = 8;
    const gridLeft = px + 10;
    const cols     = Math.floor((PW - 20 + cellGap) / (cellSz + cellGap));

    const gridContainer = this.add.container(0, 0);
    container.add(gridContainer);

    // ── Item detail overlay ───────────────────────────────
    const showItemDetail = (item: import('../data/inventory-store').InventoryItem) => {
      const det = this.add.container(0, 0);
      container.add(det);

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.97); detBg.fillRect(px + 4, py + 37, PW - 8, PH - 41);
      det.add(detBg);

      const backBtn = this.add.text(px + 16, py + 51, '← 返回', {
        fontSize: '11px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => det.destroy());
      det.add(backBtn);

      const iconKey = `icon_${item.id}`;
      if (this.textures.exists(iconKey)) {
        const iconBg = this.add.graphics();
        iconBg.fillStyle(WM, 1); iconBg.fillRect(-36, py + 76, 72, 72);
        iconBg.lineStyle(2, WL, 0.6); iconBg.strokeRect(-36, py + 76, 72, 72);
        det.add(iconBg);
        det.add(this.add.image(0, py + 112, iconKey).setDisplaySize(56, 56));
      }

      det.add(this.add.text(0, py + 160, item.name, {
        fontSize: '16px', fontStyle: 'bold', color: '#ffe090', stroke: '#1a0800', strokeThickness: 3,
      }).setOrigin(0.5));

      const qtyBg = this.add.graphics();
      qtyBg.fillStyle(WM, 1); qtyBg.fillRect(-40, py + 182, 80, 26);
      qtyBg.lineStyle(1, WL, 0.4); qtyBg.strokeRect(-40, py + 182, 80, 26);
      det.add(qtyBg);
      det.add(this.add.text(0, py + 195, `數量：${item.qty}`, {
        fontSize: '12px', color: '#e8e070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      const dg = this.add.graphics();
      dg.fillStyle(WB, 1);  dg.fillRect(px + 16, py + 218, PW - 32, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(px + 16, py + 219, PW - 32, 1);
      det.add(dg);

      det.add(this.add.text(0, py + 232, '消耗材料・可用於製作裝備', {
        fontSize: '10px', color: '#8aaa88', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));
    };

    const buildGrid = () => {
      gridContainer.removeAll(true);
      const allItems = InventoryStore.getAllItems();

      if (allItems.length === 0) {
        gridContainer.add(this.add.text(0, gridY + 40, '背包是空的', {
          fontSize: '13px', color: '#7a5830', stroke: '#1a0800', strokeThickness: 1,
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
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + 2, cy2 + 2, cellSz - 4, cellSz - 4);
        gg.fillStyle(0x70b858, 0.6); gg.fillRect(cx2, cy2, cellSz, 3);
        gg.lineStyle(1.5, WL, 0.4); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        const iconKey = `icon_${item.id}`;
        if (this.textures.exists(iconKey)) {
          gridContainer.add(
            this.add.image(cx2 + cellSz / 2, cy2 + 34, iconKey).setDisplaySize(44, 44),
          );
        }

        gridContainer.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - 4, item.name, {
          fontSize: '11px', color: '#ffe090', stroke: '#1a0800', strokeThickness: 2,
          wordWrap: { width: cellSz - 6 }, align: 'center',
        }).setOrigin(0.5, 1));

        gridContainer.add(this.add.text(cx2 + cellSz - 3, cy2 + 4, `×${item.qty}`, {
          fontSize: '12px', fontStyle: 'bold', color: '#ffe866', stroke: '#1a0800', strokeThickness: 2,
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
    const PW = Math.min(W - 16, 380);
    const PH = Math.min(H - 20, 520);
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
        bg.fillStyle(IRON, 1); bg.fillRect(rx, ry, 8, 8);
        bg.fillStyle(0x6a7580, 1); bg.fillRect(rx + 2, ry + 2, 4, 4);
      });
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '卡  片', {
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => { cleanup(); container.destroy(); });
    container.add(closeBtn);

    // Layout constants
    const CARD_W   = 64;
    const CARD_H   = 86;
    const SLOT_GAP = 4;
    const slotsTotW = CARD_SLOT_COUNT * CARD_W + (CARD_SLOT_COUNT - 1) * SLOT_GAP;
    const slotsX0   = -slotsTotW / 2;
    const slotsY    = py + 58;   // top of equipped row
    const INV_TOP   = slotsY + CARD_H + 24;
    const INV_H     = py + PH - INV_TOP - 8;
    const INV_COLS  = 3;
    const INV_GAP   = 10;
    const invTotW   = INV_COLS * CARD_W + (INV_COLS - 1) * INV_GAP;
    const invX0     = -invTotW / 2;

    // ── Equipped slots label ──────────────────────────────
    container.add(this.add.text(0, slotsY - 14, '裝備中', {
      fontSize: '13px', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
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
      g.fillRect(x + 2, y + 2, w, h);
      // 底色
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：銀灰色
      g.lineStyle(2.5, SILV, 0.9);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, SILV, 0.4);
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      // 四角裝飾點
      const cr = 3;
      g.fillStyle(SILV, 0.85);
      g.fillCircle(x + cr + 1,     y + cr + 1,     cr);
      g.fillCircle(x + w - cr - 1, y + cr + 1,     cr);
      g.fillCircle(x + cr + 1,     y + h - cr - 1, cr);
      g.fillCircle(x + w - cr - 1, y + h - cr - 1, cr);
      // 上下橫紋
      g.lineStyle(1.5, SILV, 0.45);
      g.lineBetween(x + 10, y + 8,     x + w - 10, y + 8);
      g.lineBetween(x + 10, y + h - 8, x + w - 10, y + h - 8);
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
      g.fillRect(x + 3, y + 3, w, h);
      // 底色（同小怪卡）
      g.fillStyle(WMI, 1);
      g.fillRect(x, y, w, h);
      // 外框：金色粗框
      g.lineStyle(2.5, GOLD, 0.95);
      g.strokeRect(x, y, w, h);
      // 內框
      g.lineStyle(1, GOLD, 0.45);
      g.strokeRect(x + 3, y + 3, w - 6, h - 6);
      // 四角裝飾點
      const cr = 3;
      g.fillStyle(GOLD, 0.9);
      g.fillCircle(x + cr + 1,     y + cr + 1,     cr);
      g.fillCircle(x + w - cr - 1, y + cr + 1,     cr);
      g.fillCircle(x + cr + 1,     y + h - cr - 1, cr);
      g.fillCircle(x + w - cr - 1, y + h - cr - 1, cr);
      // 上下橫紋
      g.lineStyle(1.5, GOLD, 0.55);
      g.lineBetween(x + 10, y + 8,     x + w - 10, y + 8);
      g.lineBetween(x + 10, y + h - 8, x + w - 10, y + h - 8);
    };

    // ── Card detail popup (card-styled) ───────────────────
    let detailPopup: Phaser.GameObjects.Container | null = null;
    const showCardDetail = (
      def: ReturnType<typeof getCardDef> & object,
      equippedSlot: number | null,   // null = from inventory
      cardId: string,
    ) => {
      detailPopup?.destroy();
      const PDW      = 200;
      const PDH      = 310;
      const BANNER_H = 52;
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
      const isBoss     = (monDefPre?.tier ?? 1) >= 5;
      const FRAME_CLR  = isBoss ? 0xf0c040 : 0x9aacb8;   // 金 or 銀
      const FRAME_CLR2 = isBoss ? 0xffee88 : 0xc8d8e0;
      const cg = this.add.graphics();

      // 陰影
      cg.fillStyle(0x000000, 0.5);
      cg.fillRect(-PDW / 2 + 4, -PDH / 2 + 4, PDW, PDH);

      // 底色（亮木色）
      cg.fillStyle(WMI, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 外框粗線
      cg.lineStyle(2.5, FRAME_CLR, 0.95);
      cg.strokeRect(-PDW / 2, -PDH / 2, PDW, PDH);

      // 內框細線
      cg.lineStyle(1, FRAME_CLR, 0.4);
      cg.strokeRect(-PDW / 2 + 4, -PDH / 2 + 4, PDW - 8, PDH - 8);

      // 四角裝飾點
      const PCR = 4;
      cg.fillStyle(FRAME_CLR, 0.9);
      cg.fillCircle(-PDW / 2 + PCR + 1, -PDH / 2 + PCR + 1, PCR);
      cg.fillCircle( PDW / 2 - PCR - 1, -PDH / 2 + PCR + 1, PCR);
      cg.fillCircle(-PDW / 2 + PCR + 1,  PDH / 2 - PCR - 1, PCR);
      cg.fillCircle( PDW / 2 - PCR - 1,  PDH / 2 - PCR - 1, PCR);

      // Banner（標題區）
      cg.fillStyle(WM, 1);
      cg.fillRect(-PDW / 2, -PDH / 2, PDW, BANNER_H);

      // Banner 上下橫紋
      cg.lineStyle(1.5, FRAME_CLR, 0.6);
      cg.lineBetween(-PDW / 2 + 14, -PDH / 2 + 6,        PDW / 2 - 14, -PDH / 2 + 6);
      cg.lineBetween(-PDW / 2 + 14, -PDH / 2 + BANNER_H - 6, PDW / 2 - 14, -PDH / 2 + BANNER_H - 6);

      // 底部橫紋
      cg.lineStyle(1.5, FRAME_CLR2, 0.4);
      cg.lineBetween(-PDW / 2 + 14, PDH / 2 - 10, PDW / 2 - 14, PDH / 2 - 10);
      pop.add(cg);

      // ── Banner: card name (vertically centered) ───────
      pop.add(this.add.text(0, -PDH / 2 + BANNER_H / 2, def.name, {
        fontSize: '14px', fontStyle: 'bold',
        color: '#f0d080',
        stroke: '#1a0800', strokeThickness: 2,
        wordWrap: { width: PDW - 20, useAdvancedWrap: true }, align: 'center',
        maxLines: 2,
      }).setOrigin(0.5, 0.5));

      // ── Monster sprite (no circle) ────────────────────
      const SPRITE_Y = -PDH / 2 + BANNER_H + 62;
      const monDef = getMonsterDef(def.monsterId);
      if (monDef) {
        const spriteKey  = `${monDef.spriteKey}_idle`;
        const spriteScale = monDef.tier >= 5 ? 3.0 : 1.5;
        try {
          const sp = this.add.sprite(0, SPRITE_Y, spriteKey, 0).setScale(spriteScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          pop.add(sp);
        } catch { /* texture not loaded */ }
      }

      // ── Divider ──────────────────────────────────────
      const DIVIDER_Y = SPRITE_Y + 56;
      const dg = this.add.graphics();
      dg.lineStyle(1, WH, 0.4);
      dg.lineBetween(-PDW / 2 + 16, DIVIDER_Y, PDW / 2 - 16, DIVIDER_Y);
      pop.add(dg);

      // ── Effect description ────────────────────────────
      pop.add(this.add.text(0, DIVIDER_Y + 10, def.desc, {
        fontSize: '12px', color: '#c8a060',
        stroke: '#1a0800', strokeThickness: 1,
        wordWrap: { width: PDW - 24, useAdvancedWrap: true }, align: 'center',
        maxLines: 3,
      }).setOrigin(0.5, 0));

      // ── Action button ─────────────────────────────────
      const isEquipped = equippedSlot !== null;
      const btnLabel   = isEquipped ? '取  下' : '配  置';
      const btnColor   = isEquipped ? 0x3a1010 : 0x0e2a0e;
      const btnBorder  = isEquipped ? 0xcc4444 : 0x44cc44;
      const btnTxtC    = isEquipped ? '#ff8888' : '#88ff88';

      const BW = PDW - 40, BH = 32;
      const btnY = PDH / 2 - 28;
      const btnBg = this.add.graphics();
      btnBg.fillStyle(btnColor, 1);
      btnBg.fillRect(-BW / 2, btnY - BH / 2, BW, BH);
      btnBg.lineStyle(1.5, btnBorder, 0.9);
      btnBg.strokeRect(-BW / 2, btnY - BH / 2, BW, BH);
      pop.add(btnBg);

      pop.add(this.add.text(0, btnY, btnLabel, {
        fontSize: '14px', fontStyle: 'bold',
        color: btnTxtC, stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0.5));

      const btnHit = this.add.rectangle(0, btnY, BW, BH).setInteractive({ useHandCursor: true });
      btnHit.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
        ptr.event.stopPropagation();
        if (isEquipped) {
          CardStore.unequip(equippedSlot!);
        } else {
          CardStore.equipAuto(cardId);
        }
        SaveStore.save();
        pop.destroy();
        detailPopup = null;
      });
      pop.add(btnHit);
    };

    // ── Helper: draw card face (name only) ─────────────────
    const drawCardFace = (
      target: Phaser.GameObjects.Container,
      def: ReturnType<typeof getCardDef> & object,
      cx: number, cy: number,
      _slotLabel: string,
      qty?: number,
    ) => {
      // 數量標籤（右上角）
      if (qty !== undefined && qty > 1) {
        target.add(this.add.text(cx + CARD_W / 2 - 2, cy - CARD_H / 2 + 3, `×${qty}`, {
          fontSize: '10px', fontStyle: 'bold', color: '#ffee88', stroke: '#000000', strokeThickness: 1,
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
          const baseScale = monDef.tier >= 5 ? 1.6 : 0.9;
          const sp = this.add.sprite(cx, cy, spriteKey, 0).setScale(baseScale);
          if (monDef.tint !== 0xffffff) sp.setTint(monDef.tint);
          if (this.anims.exists(animKey)) sp.play(animKey);
          target.add(sp);
        } catch { /* 紋理尚未載入 */ }
      }
    };

    // ── Rebuild function ───────────────────────────────────
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
            fontSize: '13px', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5));
        }
      }

      // Separator
      const sepGfx = this.add.graphics();
      sepGfx.fillStyle(WB, 1);   sepGfx.fillRect(px + 8, INV_TOP - 10, PW - 16, 1);
      sepGfx.fillStyle(WH, 0.2); sepGfx.fillRect(px + 8, INV_TOP - 9,  PW - 16, 1);
      contentCnt.add(sepGfx);
      contentCnt.add(this.add.text(0, INV_TOP - 5, '持有卡片', {
        fontSize: '13px', color: '#b07030', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5, 1));

      // ── Inventory scroll area ──────────────────────────
      if (invItems.length === 0) {
        contentCnt.add(this.add.text(0, INV_TOP + INV_H / 2, '尚未獲得任何卡片', {
          fontSize: '11px', color: '#5a3818', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      const ROWS      = Math.ceil(invItems.length / INV_COLS);
      const ROW_H     = CARD_H + INV_GAP;
      const contentH  = ROWS * ROW_H;
      let   scrollY   = 0;
      const maxScroll = Math.max(0, contentH - INV_H);

      const scrollCnt = this.add.container(0, INV_TOP);
      contentCnt.add(scrollCnt);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const maskShape = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      maskShape.fillStyle(0xffffff);
      maskShape.fillRect(W / 2 + px + 4, H / 2 + INV_TOP, PW - 8, INV_H);
      scrollCnt.setMask(maskShape.createGeometryMask());

      const applyScroll = (dy: number) => {
        scrollY = Phaser.Math.Clamp(scrollY + dy, 0, maxScroll);
        scrollCnt.y = INV_TOP - scrollY;
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

        const hit = this.add.rectangle(cx, cy, CARD_W, CARD_H).setInteractive({ useHandCursor: true });
        hit.on('pointerdown', () => showCardDetail(def, null, cardId));
        scrollCnt.add(hit);
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

  private showShopPanel(W: number, H: number): void {
    const PW = Math.min(320, W - 20);
    const PH = Math.min(400, H - 40);
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
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => container.destroy());
    container.add(closeBtn);

    // ── Shop items ──────────────────────────────────────────
    const SHOP_ITEMS: { id: string; name: string; price: number; desc: string; color: number }[] = [
      { id: 'stone_broken', name: '破損強化石', price:  50, desc: '強化裝備用（+1~+5）', color: 0x88aacc },
      { id: 'stone_intact', name: '完整強化石', price: 300, desc: '強化+4/+5必須使用',   color: 0x66ddaa },
      { id: 'quest_reroll', name: '任務重製石', price: 200, desc: '刷新全部任務列表',     color: 0xffcc44 },
      { id: 'enhance_charm', name: '裝備保護符', price: 500, desc: '強化失敗時保護詞墜',  color: 0xff88cc },
    ];

    const ROW_H   = 68;
    const ROW_PAD = 8;
    const startY  = py + 50;

    // Gold display
    let goldLabel: Phaser.GameObjects.Text;
    const refreshGold = () => {
      goldLabel?.setText(`擁有金幣：${InventoryStore.getGold().toLocaleString()}`);
    };

    goldLabel = this.add.text(0, py + 38, '', {
      fontSize: '11px', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0.5, 0);
    refreshGold();
    container.add(goldLabel);

    const onInvChange = () => refreshGold();
    InventoryStore.onChange(onInvChange);
    container.once(Phaser.GameObjects.Events.DESTROY, () => InventoryStore.offChange(onInvChange));

    SHOP_ITEMS.forEach((item, i) => {
      const ry = startY + i * (ROW_H + ROW_PAD);

      // Row background
      const rowGfx = this.add.graphics();
      rowGfx.fillStyle(WM, 0.6);
      rowGfx.fillRect(px + 8, ry, PW - 16, ROW_H);
      rowGfx.lineStyle(1, WL, 0.3);
      rowGfx.strokeRect(px + 8, ry, PW - 16, ROW_H);
      // Color accent left strip
      rowGfx.fillStyle(item.color, 0.8);
      rowGfx.fillRect(px + 8, ry, 4, ROW_H);
      container.add(rowGfx);

      // Item name
      container.add(this.add.text(px + 22, ry + 10, item.name, {
        fontSize: '13px', color: `#${item.color.toString(16).padStart(6, '0')}`,
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0));

      // Description
      container.add(this.add.text(px + 22, ry + 28, item.desc, {
        fontSize: '10px', color: '#a08060', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));

      // Price
      container.add(this.add.text(px + 22, ry + 46, `${item.price} 金幣`, {
        fontSize: '11px', color: '#d4a044', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0));

      // Buy button
      const BW = 60; const BH = 26;
      const bx  = px + PW - 16 - BW / 2;
      const by  = ry + ROW_H / 2;

      const btnGfx = this.add.graphics();
      const drawBtn = (hover: boolean) => {
        btnGfx.clear();
        btnGfx.fillStyle(hover ? 0x6a3810 : WM, 1);
        btnGfx.fillRect(bx - BW / 2, by - BH / 2, BW, BH);
        btnGfx.lineStyle(1, GOLD, 0.7);
        btnGfx.strokeRect(bx - BW / 2, by - BH / 2, BW, BH);
      };
      drawBtn(false);
      container.add(btnGfx);

      const btnTxt = this.add.text(bx, by, '購買', {
        fontSize: '12px', color: '#e8c870', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5);
      container.add(btnTxt);

      const hit = this.add.rectangle(bx, by, BW, BH).setInteractive({ useHandCursor: true });
      hit.on('pointerover',  () => drawBtn(true));
      hit.on('pointerout',   () => drawBtn(false));
      hit.on('pointerdown',  () => {
        if (!InventoryStore.spendGold(item.price)) return;

        if (item.id === 'quest_reroll') {
          QuestStore.rerollQuests();
        } else {
          const NAMES: Record<string, string> = {
            stone_broken:  '破損強化石',
            stone_intact:  '完整強化石',
            enhance_charm: '裝備保護符',
          };
          InventoryStore.addItem(item.id, NAMES[item.id] ?? item.name, 1);
        }
        SaveStore.save();
        refreshGold();
      });
      container.add(hit);
    });
  }

  private drawCenterHero(W: number, H: number): void {
    const cx    = W / 2;
    const midH  = H - TOP_H;
    const cy    = TOP_H + midH * 0.58;
    const scale = 3.3;

    // Warm wood platform glow
    const platformGfx = this.add.graphics();
    platformGfx.fillStyle(0x8b5010, 0.12);
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

  }
}
