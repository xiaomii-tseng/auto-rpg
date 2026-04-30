import Phaser from 'phaser';
import { InventoryStore } from '../data/inventory-store';
import { PlayerStore } from '../data/player-store';
import { EQUIPMENT_ITEMS } from '../data/equipment-data';
import { SaveStore } from '../data/save-store';


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
    const equipKeys = ['hat1','outfit1','shoes1','ring1','sword1'] as const;
    equipKeys.forEach(k => {
      const key = `equip_${k}`;
      if (!this.textures.exists(key))
        this.load.image(key, `equip/${k}.webp`);
    });
    // Boss idle sprites for quest panel
    const bossSprites: [string, string][] = [
      ['slime_idle',    'sprite/slime/PNG/Slime1/With_shadow/Slime1_Idle_with_shadow.png'],
      ['slime2_idle',   'sprite/slime/PNG/Slime2/With_shadow/Slime2_Idle_with_shadow.png'],
      ['plant1_idle',   'sprite/flower/PNG/Plant1/With_shadow/Plant1_Idle_with_shadow.png'],
      ['orc1_idle',     'sprite/orc/PNG/Orc1/With_shadow/orc1_idle_with_shadow.png'],
      ['vampire1_idle', 'sprite/vampire/PNG/Vampires1/With_shadow/Vampires1_Idle_with_shadow.png'],
    ];
    bossSprites.forEach(([key, path]) => {
      if (!this.textures.exists(key)) this.load.spritesheet(key, path, cfg);
    });
  }

  create(): void {
    const W = this.scale.width;
    const H = this.scale.height;

    SaveStore.load();

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
    // right-to-left placement
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

    // ── Name + Lv (left info area) ────────────────────────
    this.add.text(INFO_X, CY - 8, '玩家一號', {
      fontSize: '11px', color: '#e8c890', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0, 0.5);

    const lvLabel = this.add.text(INFO_X, CY + 8, `Lv.${PlayerStore.getLevel()}`, {
      fontSize: '10px', color: '#5cc8a0', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0, 0.5);

    // ── EXP badge ─────────────────────────────────────────
    const expBg = this.add.graphics();
    const drawExpBadge = (gfx: Phaser.GameObjects.Graphics) => {
      gfx.clear();
      gfx.fillStyle(WD, 0.95); gfx.fillRect(EXPB_X, CY - BH / 2, EXP_W, BH);
      gfx.lineStyle(1, 0x3a6a8a, 0.6); gfx.strokeRect(EXPB_X, CY - BH / 2, EXP_W, BH);
      gfx.fillStyle(WH, 0.12);  gfx.fillRect(EXPB_X, CY - BH / 2, EXP_W, 2);
      // EXP icon (small teal star shape)
      gfx.fillStyle(0x3a8aaa, 1); gfx.fillRect(EXPB_X + 5, CY - 7, 14, 14);
      gfx.fillStyle(0x5cc8e0, 1);
      gfx.fillRect(EXPB_X + 10, CY - 7, 4, 14);
      gfx.fillRect(EXPB_X + 5,  CY - 2, 14, 4);
      gfx.fillStyle(0xaaf0ff, 0.7); gfx.fillRect(EXPB_X + 8, CY - 5, 3, 3);
    };
    drawExpBadge(expBg);

    const expValText = this.add.text(EXPB_X + 24, CY, '', {
      fontSize: '10px', color: '#7adfc0', stroke: '#1a0800', strokeThickness: 1,
    }).setOrigin(0, 0.5);

    // ── Gold badge ────────────────────────────────────────
    const goldBg = this.add.graphics();
    goldBg.fillStyle(WD, 0.95); goldBg.fillRect(GOLD_X, CY - BH / 2, GOLD_W, BH);
    goldBg.lineStyle(1, WL, 0.3); goldBg.strokeRect(GOLD_X, CY - BH / 2, GOLD_W, BH);
    goldBg.fillStyle(WH, 0.15);  goldBg.fillRect(GOLD_X, CY - BH / 2, GOLD_W, 2);
    const ig = this.add.graphics();
    ig.fillStyle(GOLD, 1); ig.fillRect(GOLD_X + 5, CY - 7, 14, 14);
    ig.lineStyle(1, 0x000000, 0.3); ig.strokeRect(GOLD_X + 5, CY - 7, 14, 14);
    this.goldText = this.add.text(GOLD_X + 23, CY, InventoryStore.getGold().toLocaleString(), {
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
      expValText.setText(`${cur}/${need}`);
    };
    drawExpBar();

    const onPlayerChange = () => {
      lvLabel.setText(`Lv.${PlayerStore.getLevel()}`);
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

    // Right: 商店 / 拍賣 / 好友
    const rightDefs: { label: string; accent: number; badge: number; onClick?: () => void }[] = [
      { label: '製作', accent: 0x5cc8a0, badge: 0, onClick: () => this.openForgeWindow(W, H) },
      { label: '商店', accent: 0xd47820, badge: 0 },
      { label: '拍賣', accent: 0xcc6688, badge: 0 },
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

  private openForgeWindow(W: number, H: number): void {
    const PW = Math.min(540, W - 20);
    const PH = Math.min(330, H - 40);
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

    // Panel shell — dark wood planks
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
        bg.fillStyle(IRON, 1);
        bg.fillRect(rx, ry, 8, 8);
        bg.fillStyle(0x6a7580, 1);
        bg.fillRect(rx + 2, ry + 2, 4, 4);
      });

    bg.fillStyle(WB, 0.9);
    bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4);
    bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1);
    bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '製  作', {
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => container.destroy());
    container.add(closeBtn);

    // ── Equipment sets (scrollable) ───────────────────────
    const SETS = [
      {
        levelReq: 1,
        slots: [
          { id: 'hat_1',    tex: 'equip_hat1',    name: '草帽',   color: 0xddcc88 },
          { id: 'outfit_1', tex: 'equip_outfit1', name: '長袖外套', color: 0x88aadd },
          { id: 'shoes_1',  tex: 'equip_shoes1',  name: '皮靴',   color: 0xaa8866 },
          { id: 'sword_1',  tex: 'equip_sword1',  name: '木劍',   color: 0xdd8844 },
          { id: 'ring_1',   tex: 'equip_ring1',   name: '蟲餌',   color: 0xff88cc },
        ],
      },
      { levelReq: 5,  slots: null },
      { levelReq: 10, slots: null },
      { levelReq: 15, slots: null },
      { levelReq: 20, slots: null },
    ];

    const playerLv  = PlayerStore.getLevel();
    const slotSz    = 64;
    const slotGap   = 6;
    const rowGap    = 8;
    const slotsTotW = 5 * slotSz + 4 * slotGap;
    const slotsX0   = -slotsTotW / 2;
    const areaTop   = py + 44;
    const areaH     = PH - 44 - 8;
    const contentH  = SETS.length * slotSz + (SETS.length - 1) * rowGap;
    const maxScroll = Math.max(0, contentH - areaH);

    // ── Detail overlay ────────────────────────────────────
    const showDetail = (itemId: string) => {
      const eq = EQUIPMENT_ITEMS.find(e => e.id === itemId);
      if (!eq) return;

      const det = this.add.container(0, 0);
      container.add(det);

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98);
      detBg.fillRect(px + 4, areaTop, PW - 8, areaH);
      det.add(detBg);

      // Back button
      const backBtn = this.add.text(px + 16, areaTop + 14, '← 返回', {
        fontSize: '11px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => det.destroy());
      det.add(backBtn);

      // Item image + name
      if (this.textures.exists(eq.texture)) {
        det.add(this.add.image(0, areaTop + 44, eq.texture).setDisplaySize(56, 56));
      }
      det.add(this.add.text(0, areaTop + 80, eq.name, {
        fontSize: '14px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      // Stats
      const statParts: string[] = [];
      if (eq.stats.atk)   statParts.push(`攻擊 +${eq.stats.atk}`);
      if (eq.stats.hp)    statParts.push(`HP +${eq.stats.hp}`);
      if (eq.stats.speed) statParts.push(`速度 +${eq.stats.speed}`);
      if (eq.stats.def)   statParts.push(`防禦 +${eq.stats.def}`);
      if (eq.stats.crit)  statParts.push(`爆擊 +${(eq.stats.crit * 100).toFixed(0)}%`);
      det.add(this.add.text(0, areaTop + 98, statParts.join('   '), {
        fontSize: '10px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));

      // Divider
      const dg = this.add.graphics();
      dg.fillStyle(WB, 1); dg.fillRect(px + 12, areaTop + 112, PW - 24, 2);
      dg.fillStyle(WH, 0.3); dg.fillRect(px + 12, areaTop + 114, PW - 24, 1);
      det.add(dg);

      // Materials
      det.add(this.add.text(px + 16, areaTop + 126, '所需材料', {
        fontSize: '10px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));

      let matY = areaTop + 144;
      eq.materials.forEach(mat => {
        const have   = InventoryStore.getItemQty(mat.id);
        const enough = have >= mat.qty;
        det.add(this.add.text(px + 24, matY, `${mat.name}`, {
          fontSize: '10px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0, 0.5));
        det.add(this.add.text(px + PW - 28, matY, `${have} / ${mat.qty}`, {
          fontSize: '10px', color: enough ? '#88cc44' : '#cc4444', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(1, 0.5));
        matY += 18;
      });

      // Gold
      const goldHave  = InventoryStore.getGold();
      const goldOk    = goldHave >= eq.gold;
      det.add(this.add.text(px + 24, matY + 4, '金幣', {
        fontSize: '10px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));
      det.add(this.add.text(px + PW - 28, matY + 4, `${goldHave} / ${eq.gold}`, {
        fontSize: '10px', color: goldOk ? '#88cc44' : '#cc4444', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(1, 0.5));

      // Craft button
      const canCraft = goldOk && eq.materials.every(m => InventoryStore.getItemQty(m.id) >= m.qty);

      const btnW = 140;
      const btnH = 36;
      const btnY = areaTop + areaH - 28;

      const btnGfx = this.add.graphics();
      if (canCraft) {
        btnGfx.fillStyle(0x5a3800, 1);
        btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.fillStyle(GOLD, 0.15);
        btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.lineStyle(2, GOLD, 0.8);
        btnGfx.strokeRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.fillStyle(GOLD, 0.4);
        btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, 2);
      } else {
        btnGfx.fillStyle(WD, 1);
        btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.lineStyle(1.5, WM, 0.4);
        btnGfx.strokeRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
      }
      det.add(btnGfx);

      det.add(this.add.text(0, btnY, '製  作', {
        fontSize: '15px', color: canCraft ? '#e8c070' : '#4a3010',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      if (canCraft) {
        const hitArea = this.add.rectangle(0, btnY, btnW, btnH)
          .setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
          eq.materials.forEach(m => InventoryStore.spendItem(m.id, m.qty));
          InventoryStore.spendGold(eq.gold);
          PlayerStore.addOwned(eq);
          det.destroy();
        });
        det.add(hitArea);
      }
    };

    // Geometry mask — world coords
    const maskGfx = this.make.graphics({});
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(W / 2 + px + 4, H / 2 + areaTop, PW - 8, areaH);
    const scrollMask = maskGfx.createGeometryMask();

    // ── Vertical drag scroll (zone added BEFORE inner so inner is on top) ───
    let dragStartY   = 0;
    let dragStartOff = 0;
    let scrollOffset = 0;

    const zone = this.add.zone(0, areaTop + areaH / 2, PW, areaH).setInteractive();
    container.add(zone);
    zone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      dragStartY   = ptr.y;
      dragStartOff = scrollOffset;
    });
    zone.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return;
      const dy = ptr.y - dragStartY;
      scrollOffset = Phaser.Math.Clamp(dragStartOff - dy, 0, maxScroll);
      inner.y = -scrollOffset;
    });

    // Inner scrollable container (added after zone → rendered on top → tap works)
    const inner = this.add.container(0, 0);
    inner.setMask(scrollMask);
    container.add(inner);

    let rowY = areaTop;
    SETS.forEach(set => {
      const locked = set.levelReq > playerLv;

      inner.add(this.add.text(px + 12, rowY + slotSz / 2, `LV.${set.levelReq}`, {
        fontSize: '11px', color: locked ? '#5a3820' : '#5cc8a0',
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));

      for (let i = 0; i < 5; i++) {
        const sx     = slotsX0 + i * (slotSz + slotGap);
        const item   = set.slots?.[i];
        const eq     = item ? EQUIPMENT_ITEMS.find(e => e.id === item.id) : null;
        const isLock = locked || !eq;
        const col    = item?.color ?? [0xddcc88, 0x88aadd, 0xaa8866, 0xdd8844, 0xff88cc][i];

        const sg = this.add.graphics();
        sg.fillStyle(WB, 1); sg.fillRect(sx, rowY, slotSz, slotSz);
        sg.fillStyle(isLock ? WD : WM, 1); sg.fillRect(sx + 2, rowY + 2, slotSz - 4, slotSz - 4);
        sg.lineStyle(1.5, isLock ? WD : WL, isLock ? 0.3 : 0.4);
        sg.strokeRect(sx, rowY, slotSz, slotSz);
        if (!isLock) { sg.fillStyle(col, 0.55); sg.fillRect(sx, rowY, slotSz, 3); }
        inner.add(sg);

        if (!isLock && this.textures.exists(item!.tex)) {
          inner.add(
            this.add.image(sx + slotSz / 2, rowY + slotSz / 2 - 8, item!.tex).setDisplaySize(50, 50),
          );
        } else {
          inner.add(
            this.add.text(sx + slotSz / 2, rowY + slotSz / 2 - 8, '?', {
              fontSize: '22px', color: '#3a2010', stroke: '#1a0800', strokeThickness: 2,
            }).setOrigin(0.5),
          );
        }

        inner.add(
          this.add.text(sx + slotSz / 2, rowY + slotSz - 10, isLock ? '???' : item!.name, {
            fontSize: '9px', color: isLock ? '#5a3820' : '#e8c070',
            stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5),
        );

        if (!isLock) {
          const tap = this.add.rectangle(sx + slotSz / 2, rowY + slotSz / 2, slotSz, slotSz)
            .setInteractive({ useHandCursor: true });
          tap.on('pointerup', () => showDetail(item!.id));
          inner.add(tap);
        }
      }

      rowY += slotSz + rowGap;
    });

  }

  // ── Quest panel (wanted posters, horizontal scroll) ────

  private showQuestPanel(W: number, H: number): void {
    const PW = Math.min(W - 16, 560);
    const PH = Math.min(H - 40, 280);
    const D  = 500;

    const panelX = (W - PW) / 2;
    const panelY = (H - PH) / 2;

    const objs: Phaser.GameObjects.GameObject[] = [];
    const closeAll = () => objs.forEach(o => o.destroy());

    // Backdrop
    const backdrop = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.78)
      .setInteractive().setDepth(D);
    objs.push(backdrop);
    backdrop.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < panelX || ptr.x > panelX + PW ||
          ptr.y < panelY || ptr.y > panelY + PH) closeAll();
    });

    // Panel shell
    const bgGfx = this.add.graphics().setDepth(D);
    objs.push(bgGfx);
    bgGfx.fillStyle(IRON, 1);
    bgGfx.fillRect(panelX - 3, panelY - 3, PW + 6, PH + 6);
    bgGfx.fillStyle(WL, 1);
    bgGfx.fillRect(panelX - 2, panelY - 2, PW + 4, PH + 4);
    bgGfx.fillStyle(WD, 1);
    bgGfx.fillRect(panelX, panelY, PW, PH);
    for (let row = 1; row < Math.ceil(PH / 24); row++) {
      const ry = panelY + row * 24;
      bgGfx.lineStyle(1, WB, 0.5);
      bgGfx.lineBetween(panelX + 2, ry, panelX + PW - 2, ry);
      bgGfx.lineStyle(1, WH, 0.08);
      bgGfx.lineBetween(panelX + 2, ry + 1, panelX + PW - 2, ry + 1);
    }
    [[panelX, panelY], [panelX + PW - 8, panelY], [panelX, panelY + PH - 8], [panelX + PW - 8, panelY + PH - 8]]
      .forEach(([rx, ry]) => {
        bgGfx.fillStyle(IRON, 1); bgGfx.fillRect(rx, ry, 8, 8);
        bgGfx.fillStyle(0x6a7580, 1); bgGfx.fillRect(rx + 2, ry + 2, 4, 4);
      });
    bgGfx.fillStyle(WB, 0.9);
    bgGfx.fillRect(panelX, panelY, PW, 36);
    bgGfx.fillStyle(WH, 0.4);
    bgGfx.fillRect(panelX, panelY + 34, PW, 2);

    const titleTxt = this.add.text(W / 2, panelY + 18, '任  務', {
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(D);
    objs.push(titleTxt);

    const closeBtn = this.add.text(panelX + PW - 20, panelY + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(D);
    objs.push(closeBtn);
    closeBtn.on('pointerdown', closeAll);

    // ── Cards ─────────────────────────────────────────────
    const CARD_W   = 120;
    const CARD_H   = PH - 54;
    const CARD_GAP = 14;
    const cardAreaX = panelX + 12;
    const cardAreaY = panelY + 44;
    const cardAreaW = PW - 24;

    const PAPER    = 0xe8d09a;
    const PAPER_DK = 0xc4a458;
    const CARD_RED = 0xaa1a1a;

    const bossDefs = [
      { name: '綠史萊姆', unlocked: true,  tex: 'slime_idle',    animKey: 'q_slime1', reward: '碎塊・精華・金幣', bossKey: 'slime' },
      { name: '藍史萊姆', unlocked: false, tex: 'slime2_idle',   animKey: 'q_slime2', reward: '???',            bossKey: 'slime2' },
      { name: '食人花',   unlocked: false, tex: 'plant1_idle',   animKey: 'q_plant1', reward: '???',            bossKey: 'plant1' },
      { name: '綠獸人',   unlocked: false, tex: 'orc1_idle',     animKey: 'q_orc1',   reward: '???',            bossKey: 'orc1' },
      { name: '吸血鬼',   unlocked: false, tex: 'vampire1_idle', animKey: 'q_vamp1',  reward: '???',            bossKey: 'vampire1' },
    ];

    // Create idle animations for quest cards
    bossDefs.forEach(b => {
      if (!this.anims.exists(b.animKey) && this.textures.exists(b.tex)) {
        this.anims.create({
          key: b.animKey,
          frames: this.anims.generateFrameNumbers(b.tex, { start: 0, end: -1 }),
          frameRate: 8,
          repeat: -1,
        });
      }
    });

    const totalW = bossDefs.length * CARD_W + (bossDefs.length - 1) * CARD_GAP;

    // Geometry mask (world-space)
    const maskGfx = this.make.graphics({});
    maskGfx.fillStyle(0xffffff);
    maskGfx.fillRect(cardAreaX, cardAreaY, cardAreaW, CARD_H);
    const mask = maskGfx.createGeometryMask();
    objs.push(maskGfx);

    // Scrollable container
    const cardsContainer = this.add.container(cardAreaX, cardAreaY).setDepth(D + 1);
    cardsContainer.setMask(mask);
    objs.push(cardsContainer);

    bossDefs.forEach((boss, i) => {
      const cx = i * (CARD_W + CARD_GAP);
      const cg = this.add.graphics();

      // Parchment fill
      cg.fillStyle(PAPER, 1);
      cg.fillRect(cx, 0, CARD_W, CARD_H);
      // Aged texture bands
      cg.fillStyle(PAPER_DK, 0.25);
      cg.fillRect(cx + 4, 4, CARD_W - 8, 24);
      cg.fillRect(cx + 4, CARD_H - 48, CARD_W - 8, 44);
      // Red wanted border
      cg.lineStyle(3, CARD_RED, 1);
      cg.strokeRect(cx + 2, 2, CARD_W - 4, CARD_H - 4);
      cg.lineStyle(1, CARD_RED, 0.35);
      cg.strokeRect(cx + 6, 6, CARD_W - 12, CARD_H - 12);

      if (!boss.unlocked) {
        cg.fillStyle(0x000000, 0.52);
        cg.fillRect(cx + 3, 3, CARD_W - 6, CARD_H - 6);
      }
      cardsContainer.add(cg);

      // "懸賞" header
      cardsContainer.add(this.add.text(cx + CARD_W / 2, 16, '懸  賞', {
        fontSize: '11px', fontStyle: 'bold',
        color: boss.unlocked ? '#aa1a1a' : '#553333',
        stroke: boss.unlocked ? '#f0d080' : '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5));

      // Boss sprite or "？"
      const spriteY = CARD_H / 2 - 12;
      if (boss.unlocked && this.textures.exists(boss.tex)) {
        const sp = this.add.sprite(cx + CARD_W / 2, spriteY, boss.tex, 0).setScale(2);
        if (this.anims.exists(boss.animKey)) sp.play(boss.animKey);
        cardsContainer.add(sp);
      } else {
        cardsContainer.add(this.add.text(cx + CARD_W / 2, spriteY, '？', {
          fontSize: '40px', color: '#553333', stroke: '#1a0800', strokeThickness: 2,
        }).setOrigin(0.5));
      }

      // Boss name
      cardsContainer.add(this.add.text(cx + CARD_W / 2, CARD_H - 34, boss.unlocked ? boss.name : '???', {
        fontSize: '12px', fontStyle: 'bold',
        color: boss.unlocked ? '#4a2810' : '#443333',
        stroke: boss.unlocked ? '#e8c070' : '#000000', strokeThickness: 1,
      }).setOrigin(0.5));

      // Reward line
      cardsContainer.add(this.add.text(cx + CARD_W / 2, CARD_H - 16, boss.reward, {
        fontSize: '9px', color: boss.unlocked ? '#7a3808' : '#442222',
      }).setOrigin(0.5));
    });

    // ── Confirm challenge overlay ─────────────────────────
    const showConfirm = (boss: typeof bossDefs[0]) => {
      const cW = 240, cH = 110;
      const cX = W / 2 - cW / 2, cY = H / 2 - cH / 2;
      const confirmObjs: Phaser.GameObjects.GameObject[] = [];
      const closeConfirm = () => confirmObjs.forEach(o => o.destroy());

      const cbg = this.add.graphics().setDepth(D + 10);
      cbg.fillStyle(IRON, 1);    cbg.fillRect(cX - 3, cY - 3, cW + 6, cH + 6);
      cbg.fillStyle(WL, 1);     cbg.fillRect(cX - 2, cY - 2, cW + 4, cH + 4);
      cbg.fillStyle(WD, 1);     cbg.fillRect(cX, cY, cW, cH);
      cbg.fillStyle(WB, 0.9);   cbg.fillRect(cX, cY, cW, 32);
      cbg.fillStyle(GOLD, 0.5); cbg.fillRect(cX, cY, cW, 2);
      confirmObjs.push(cbg);

      confirmObjs.push(this.add.text(W / 2, cY + 16, '確認挑戰', {
        fontSize: '13px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(D + 10));

      confirmObjs.push(this.add.text(W / 2, cY + 52, `挑戰  ${boss.name}？`, {
        fontSize: '12px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 10));

      // Yes button
      const yesGfx = this.add.graphics().setDepth(D + 10);
      yesGfx.fillStyle(0x2a4a1a, 1); yesGfx.fillRect(cX + 20, cY + 72, 88, 28);
      yesGfx.lineStyle(2, 0x44aa22, 0.8); yesGfx.strokeRect(cX + 20, cY + 72, 88, 28);
      confirmObjs.push(yesGfx);
      const yesBtn = this.add.text(cX + 64, cY + 86, '出  發', {
        fontSize: '12px', color: '#88dd44', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 10).setInteractive({ useHandCursor: true });
      yesBtn.on('pointerdown', () => {
        closeConfirm();
        closeAll();
        this.scene.start('GameScene', { boss: boss.bossKey });
      });
      confirmObjs.push(yesBtn);

      // No button
      const noGfx = this.add.graphics().setDepth(D + 10);
      noGfx.fillStyle(0x4a1a1a, 1); noGfx.fillRect(cX + 132, cY + 72, 88, 28);
      noGfx.lineStyle(2, 0xaa2222, 0.8); noGfx.strokeRect(cX + 132, cY + 72, 88, 28);
      confirmObjs.push(noGfx);
      const noBtn = this.add.text(cX + 176, cY + 86, '取  消', {
        fontSize: '12px', color: '#dd4444', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5).setDepth(D + 10).setInteractive({ useHandCursor: true });
      noBtn.on('pointerdown', closeConfirm);
      confirmObjs.push(noBtn);
    };

    // ── Scroll drag + tap detection ───────────────────────
    const maxScroll = Math.max(0, totalW - cardAreaW);
    let dragStartX    = 0;
    let dragStartOffset = 0;
    let scrollOffset  = 0;
    let didDrag       = false;

    const inputZone = this.add.zone(
      cardAreaX + cardAreaW / 2, cardAreaY + CARD_H / 2,
      cardAreaW, CARD_H
    ).setInteractive().setDepth(D + 2);
    objs.push(inputZone);

    inputZone.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      dragStartX      = ptr.x;
      dragStartOffset = scrollOffset;
      didDrag         = false;
    });
    inputZone.on('pointermove', (ptr: Phaser.Input.Pointer) => {
      if (!ptr.isDown) return;
      const dx = ptr.x - dragStartX;
      if (Math.abs(dx) > 4) didDrag = true;
      scrollOffset = Phaser.Math.Clamp(dragStartOffset - dx, 0, maxScroll);
      cardsContainer.x = cardAreaX - scrollOffset;
    });
    inputZone.on('pointerup', (ptr: Phaser.Input.Pointer) => {
      if (didDrag) return;
      const localX = ptr.x - cardAreaX + scrollOffset;
      const idx    = Math.floor(localX / (CARD_W + CARD_GAP));
      if (idx < 0 || idx >= bossDefs.length) return;
      const slotRight = idx * (CARD_W + CARD_GAP) + CARD_W;
      if (localX > slotRight) return;
      const boss = bossDefs[idx];
      if (boss.unlocked) showConfirm(boss);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, closeAll);
  }

  // ── Equipment panel (wooden cabinet) ───────────────────

  private showEquipmentPanel(W: number, H: number): void {
    const PW = Math.min(540, W - 20);
    const PH = Math.min(330, H - 40);
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
    bg.fillStyle(WB, 0.9); bg.fillRect(px, py, PW, 36);
    bg.fillStyle(WH, 0.4); bg.fillRect(px, py + 34, PW, 2);
    bg.fillStyle(WB, 1);   bg.fillRect(px, py + 36, PW, 1);
    container.add(bg);

    container.add(this.add.text(0, py + 18, '裝  備', {
      fontSize: '15px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5));

    const closeBtn = this.add.text(px + PW - 20, py + 18, '✕', {
      fontSize: '15px', color: '#cc4444', stroke: '#1a0800', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      PlayerStore.offChange(onStoreChange);
      container.destroy();
    });
    container.add(closeBtn);

    // ── Slot definitions ──────────────────────────────────
    const slotDefs: { label: string; color: number; slotKey: import('../data/equipment-data').EquipSlot }[] = [
      { label: '頭盔', color: 0xddcc88, slotKey: 'hat'    },
      { label: '衣服', color: 0x88aadd, slotKey: 'outfit' },
      { label: '鞋子', color: 0xaa8866, slotKey: 'shoes'  },
      { label: '武器', color: 0xdd8844, slotKey: 'sword'  },
      { label: '飾品', color: 0xff88cc, slotKey: 'ring'   },
    ];

    const slotSz    = 52;
    const slotGap   = 6;
    const slotsRowY = py + 36 + 8;
    const slotsTotW = slotDefs.length * slotSz + (slotDefs.length - 1) * slotGap;
    const slotsX0   = -slotsTotW / 2;

    // ── Top equipped slots (reactive) ─────────────────────
    const topSlotsLayer = this.add.container(0, 0);
    container.add(topSlotsLayer);

    const buildTopSlots = () => {
      topSlotsLayer.removeAll(true);
      const eq = PlayerStore.getEquipped();
      slotDefs.forEach((s, i) => {
        const sx   = slotsX0 + i * (slotSz + slotGap);
        const item = eq[s.slotKey];

        const sg = this.add.graphics();
        sg.fillStyle(WB, 1); sg.fillRect(sx, slotsRowY, slotSz, slotSz);
        sg.fillStyle(WM, 1); sg.fillRect(sx + 2, slotsRowY + 2, slotSz - 4, slotSz - 4);
        sg.lineStyle(1.5, WL, 0.4); sg.strokeRect(sx, slotsRowY, slotSz, slotSz);
        sg.fillStyle(s.color, 0.55); sg.fillRect(sx, slotsRowY, slotSz, 3);
        topSlotsLayer.add(sg);

        if (item && this.textures.exists(item.texture)) {
          topSlotsLayer.add(
            this.add.image(sx + slotSz / 2, slotsRowY + slotSz / 2 - 6, item.texture)
              .setDisplaySize(38, 38),
          );
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, slotsRowY + slotSz - 9, item.name, {
            fontSize: '8px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5));
        } else {
          topSlotsLayer.add(this.add.text(sx + slotSz / 2, slotsRowY + slotSz / 2 - 4, s.label, {
            fontSize: '10px', color: '#5a4020', stroke: '#1a0800', strokeThickness: 1,
          }).setOrigin(0.5));
        }
      });
    };
    buildTopSlots();

    // ── Divider ───────────────────────────────────────────
    const dividerY = slotsRowY + slotSz + 8;
    const divGfx   = this.add.graphics();
    divGfx.fillStyle(WB, 1);  divGfx.fillRect(px + 8, dividerY, PW - 16, 2);
    divGfx.fillStyle(WH, 0.3); divGfx.fillRect(px + 8, dividerY + 2, PW - 16, 1);
    container.add(divGfx);

    // ── Tabs ─────────────────────────────────────────────
    const tabH    = 26;
    const tabY    = dividerY + 5;
    const tabW    = PW / slotDefs.length;
    let activeTab = 0;

    const tabGfx = this.add.graphics();
    const tabLabels: Phaser.GameObjects.Text[] = [];

    const redrawTabs = (active: number) => {
      tabGfx.clear();
      slotDefs.forEach((t, i) => {
        const tx = px + i * tabW;
        tabGfx.fillStyle(i === active ? WMI : WD, 1); tabGfx.fillRect(tx, tabY, tabW, tabH);
        tabGfx.lineStyle(1, WB, 0.25); tabGfx.lineBetween(tx + 2, tabY + tabH / 2, tx + tabW - 2, tabY + tabH / 2);
        tabGfx.lineStyle(1, i === active ? WH : WM, i === active ? 0.7 : 0.3);
        tabGfx.strokeRect(tx, tabY, tabW, tabH);
        if (i === active) { tabGfx.fillStyle(t.color, 0.65); tabGfx.fillRect(tx, tabY, tabW, 3); }
      });
    };
    redrawTabs(0);
    container.add(tabGfx);

    // ── Grid ─────────────────────────────────────────────
    const gridY    = tabY + tabH + 4;
    const cellSz   = 52;
    const cellGap  = 5;
    const gridLeft = px + 8;
    const cols     = Math.floor((PW - 16 + cellGap) / (cellSz + cellGap));

    const gridLayer = this.add.container(0, 0);
    container.add(gridLayer);

    // ── Detail overlay ────────────────────────────────────
    const showItemDetail = (item: import('../data/equipment-data').EquipmentItem) => {
      const det = this.add.container(0, 0);
      container.add(det);

      const areaTop = dividerY + 4;
      const areaH   = py + PH - areaTop - 4;

      const detBg = this.add.graphics();
      detBg.fillStyle(WD, 0.98); detBg.fillRect(px + 4, areaTop, PW - 8, areaH);
      det.add(detBg);

      const backBtn = this.add.text(px + 16, areaTop + 14, '← 返回', {
        fontSize: '11px', color: '#c49050', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5).setInteractive({ useHandCursor: true });
      backBtn.on('pointerdown', () => det.destroy());
      det.add(backBtn);

      if (this.textures.exists(item.texture))
        det.add(this.add.image(-80, areaTop + 46, item.texture).setDisplaySize(48, 48));

      det.add(this.add.text(-48, areaTop + 28, item.name, {
        fontSize: '13px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0, 0.5));

      const statParts: string[] = [];
      if (item.stats.atk)   statParts.push(`ATK +${item.stats.atk}`);
      if (item.stats.hp)    statParts.push(`HP +${item.stats.hp}`);
      if (item.stats.speed) statParts.push(`SPD +${item.stats.speed}`);
      if (item.stats.def)   statParts.push(`DEF +${item.stats.def}`);
      if (item.stats.crit)  statParts.push(`CRIT +${(item.stats.crit * 100).toFixed(0)}%`);
      det.add(this.add.text(-48, areaTop + 46, statParts.join('  '), {
        fontSize: '9px', color: '#88cc88', stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0, 0.5));

      const dg = this.add.graphics();
      dg.fillStyle(WB, 1); dg.fillRect(px + 12, areaTop + 62, PW - 24, 1);
      dg.fillStyle(WH, 0.3); dg.fillRect(px + 12, areaTop + 63, PW - 24, 1);
      det.add(dg);

      const isEquipped = PlayerStore.isEquipped(item.id) &&
        PlayerStore.getEquipped()[item.slot] === item;
      const btnW = 130; const btnH = 34;
      const btnY = areaTop + areaH - 24;

      const btnGfx = this.add.graphics();
      if (isEquipped) {
        btnGfx.fillStyle(0x1a3a28, 1); btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.lineStyle(1.5, 0x44aa66, 0.6); btnGfx.strokeRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
      } else {
        btnGfx.fillStyle(0x5a3800, 1); btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.fillStyle(GOLD, 0.12); btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.lineStyle(2, GOLD, 0.8); btnGfx.strokeRect(-btnW / 2, btnY - btnH / 2, btnW, btnH);
        btnGfx.fillStyle(GOLD, 0.35); btnGfx.fillRect(-btnW / 2, btnY - btnH / 2, btnW, 2);
      }
      det.add(btnGfx);

      det.add(this.add.text(0, btnY, isEquipped ? '已  裝  備' : '裝  備', {
        fontSize: '14px', color: isEquipped ? '#44cc88' : '#e8c070',
        stroke: '#1a0800', strokeThickness: 2,
      }).setOrigin(0.5));

      if (!isEquipped) {
        const hitArea = this.add.rectangle(0, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
        hitArea.on('pointerdown', () => {
          PlayerStore.equip(item);
          det.destroy();
        });
        det.add(hitArea);
      }
    };

    const buildGrid = () => {
      gridLayer.removeAll(true);
      const slotKey  = slotDefs[activeTab].slotKey;
      const items    = PlayerStore.getOwned().filter(it => it.slot === slotKey);
      const gg       = this.add.graphics();
      gridLayer.add(gg);

      if (items.length === 0) {
        gridLayer.add(this.add.text(0, gridY + 32, '尚無裝備', {
          fontSize: '12px', color: '#5a3820', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));
        return;
      }

      items.forEach((item, idx) => {
        const col  = idx % cols;
        const row  = Math.floor(idx / cols);
        const cx2  = gridLeft + col * (cellSz + cellGap);
        const cy2  = gridY    + row * (cellSz + cellGap);
        const col2 = slotDefs[activeTab].color;

        gg.fillStyle(WB, 1); gg.fillRect(cx2, cy2, cellSz, cellSz);
        gg.fillStyle(WM, 0.8); gg.fillRect(cx2 + 2, cy2 + 2, cellSz - 4, cellSz - 4);
        gg.fillStyle(col2, 0.5); gg.fillRect(cx2, cy2, cellSz, 3);
        gg.lineStyle(1.5, WL, 0.35); gg.strokeRect(cx2, cy2, cellSz, cellSz);

        if (this.textures.exists(item.texture))
          gridLayer.add(
            this.add.image(cx2 + cellSz / 2, cy2 + cellSz / 2 - 7, item.texture).setDisplaySize(36, 36),
          );

        gridLayer.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - 9, item.name, {
          fontSize: '8px', color: '#e8c070', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(0.5));

        const tap = this.add.rectangle(cx2 + cellSz / 2, cy2 + cellSz / 2, cellSz, cellSz)
          .setInteractive({ useHandCursor: true });
        tap.on('pointerup', () => showItemDetail(item));
        gridLayer.add(tap);
      });
    };
    buildGrid();

    // ── Tab bar ───────────────────────────────────────────
    slotDefs.forEach((t, i) => {
      const lbl = this.add.text(px + i * tabW + tabW / 2, tabY + tabH / 2, t.label, {
        fontSize: '11px', color: i === 0 ? '#e8c070' : '#7a5830',
        stroke: '#1a0800', strokeThickness: 1,
      }).setOrigin(0.5);
      tabLabels.push(lbl);
      container.add(lbl);

      const hit = this.add.rectangle(px + i * tabW + tabW / 2, tabY + tabH / 2, tabW, tabH)
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
      buildGrid();
    };
    PlayerStore.onChange(onStoreChange);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => PlayerStore.offChange(onStoreChange));
  }

  // ── Item panel ──────────────────────────────────────────

  private showItemPanel(W: number, H: number): void {
    const PW = Math.min(480, W - 20);
    const PH = Math.min(300, H - 40);
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
    const cellSz   = 56;
    const cellGap  = 6;
    const gridLeft = px + 12;
    const cols     = Math.floor((PW - 24 + cellGap) / (cellSz + cellGap));

    let gridContainer = this.add.container(0, 0);
    container.add(gridContainer);

    const buildGrid = () => {
      gridContainer.removeAll(true);
      const allItems = InventoryStore.getAllItems();

      if (allItems.length === 0) {
        gridContainer.add(this.add.text(0, gridY + 40, '背包是空的', {
          fontSize: '13px', color: '#5a3820', stroke: '#1a0800', strokeThickness: 1,
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

        // Cell background
        gg.fillStyle(WB, 1);
        gg.fillRect(cx2, cy2, cellSz, cellSz);
        gg.fillStyle(WM, 0.65);
        gg.fillRect(cx2 + 2, cy2 + 2, cellSz - 4, cellSz - 4);
        gg.fillStyle(0x70b858, 0.5);
        gg.fillRect(cx2, cy2, cellSz, 3);
        gg.lineStyle(1, WL, 0.3);
        gg.strokeRect(cx2, cy2, cellSz, cellSz);

        // Icon
        const iconKey = `icon_${item.id}`;
        if (this.textures.exists(iconKey)) {
          gridContainer.add(
            this.add.image(cx2 + cellSz / 2, cy2 + cellSz / 2 - 8, iconKey).setDisplaySize(32, 32),
          );
        }

        // Item name (bottom)
        gridContainer.add(this.add.text(cx2 + cellSz / 2, cy2 + cellSz - 11, item.name, {
          fontSize: '8px', color: '#d4a870', stroke: '#1a0800', strokeThickness: 1,
          wordWrap: { width: cellSz - 4 }, align: 'center',
        }).setOrigin(0.5, 1));

        // Qty badge (bottom-right)
        gridContainer.add(this.add.text(cx2 + cellSz - 3, cy2 + cellSz - 3, `×${item.qty}`, {
          fontSize: '9px', color: '#e8e870', stroke: '#1a0800', strokeThickness: 1,
        }).setOrigin(1, 1));
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
