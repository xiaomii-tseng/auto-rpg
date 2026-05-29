import Phaser from 'phaser';
import { Player } from '../objects/player';
import { MinionSlime } from '../objects/minion-slime';
import { VirtualJoystick } from '../ui/joystick';
import { InventoryStore } from '../data/inventory-store';
import { SaveStore } from '../data/save-store';
import { TowerStore } from '../data/tower-store';
import { NetworkService } from '../network/network.service';
import { STAR_STAT_MULT } from '../data/quest-store';
import { getMonsterDef } from '../data/monster-data';
import {
  ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L,
  ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED,
} from '../data/monster-data';
import { GameScene } from './game.scene';
import { t as tr } from '../i18n/i18n';

const DPR = (window as any).__gameDpr as number;
const P   = (n: number): number => Math.round(n * DPR);
const F   = (n: number): string => `${Math.round(n * DPR)}px`;


// ── Per-floor state ──────────────────────────────────────────
interface FloorSlot {
  entryX:     number;
  entryY:     number;
  portalX:    number;
  portalY:    number;
  enemyAlive: number;
  portalGfx:  Phaser.GameObjects.Graphics | null;
  portalZone: Phaser.GameObjects.Zone | null;
}

// ── Data passed between floors ───────────────────────────────
export interface TowerInitData {
  globalFloor:      number;   // 1, 2, 3, …  boss every 5th
  runStartTime:     number;   // Date.now() when run began
  partnerNickname?: string;
  playerCount?:     number;
  ownSkinId?:       number;
  partnerSkinId?:   number;
}

// ─────────────────────────────────────────────────────────────
export class TowerScene extends GameScene {

  // ── Floor state ──────────────────────────────────────────
  private _globalFloor = 1;
  private _runStart    = 0;
  private _isBoss      = false;
  private _slot!:      FloorSlot;

  // ── Dimensions ──────────────────────────────────────────
  private _CW  = 0;   // arm corridor width  (left/right arms)
  private _BCH = 0;   // bottom corridor height
  private _MX  = 0;   // horizontal margin (canvas edge → arm outer edge)
  private _MY  = 0;   // vertical margin (canvas edge → arm top)

  // ── Tower HUD ────────────────────────────────────────────
  private _timerText?:     Phaser.GameObjects.Text;
  private _floorLabel?:    Phaser.GameObjects.Text;
  private _enemyCountTxt?: Phaser.GameObjects.Text;

  constructor() { super('TowerScene'); }

  // ════════════════════════════════════════════════════════════
  // LIFECYCLE
  // ════════════════════════════════════════════════════════════

  override preload(): void {
    super.preload();
  }

  override init(raw: TowerInitData): void {
    this._globalFloor        = raw.globalFloor     ?? 1;
    this._runStart           = raw.runStartTime    ?? Date.now();
    this._isBoss             = this._globalFloor % 5 === 0;
    this._partnerNickname    = raw.partnerNickname ?? '';
    this._playerCount        = raw.playerCount     ?? (this._partnerNickname ? 2 : 1);
    this._ownSkinId          = raw.ownSkinId       ?? 0;
    this._partnerSkinId      = raw.partnerSkinId   ?? 0;

    // Reset inherited GameScene state
    this.gameOver            = false;
    this.bossActive          = false;
    this.teleporting         = false;
    this._hostReconnecting   = false;
    this._reviveDialogActive = false;
    this._leechPool          = 0;
    this._lastBuffHudRefresh = 0;
    this.hitBatches          = new Map();
    this.plantZones          = [];
    this.homingProjs         = [];
    this.allMinions          = [];
    this._allyMinions        = [];
    this.lootDrops           = [];
    this._sessionQty         = new Map();
    this._buffExpiry         = new Map();

    this.questStar = 5;
  }

  override create(): void {
    this._initPotionTextures();          // 確保 dungeon_floor 等程序紋理已生成
    this.cameras.main.setBackgroundColor(0x0d0d1a);

    const W = this.scale.width;
    const H = this.scale.height;

    this._CW  = P(200);   // arm corridor width（對齊 game-scene 走廊寬 400px）
    this._BCH = P(200);   // bottom corridor height

    // Canvas is 2.5× the screen；走廊加寬後需要更大世界避免 islandW 為負
    this.worldW = Math.round(W * 2.5);
    this.worldH = Math.round(H * 2.5);

    // Margins: space between canvas edge and the U-shape boundary
    this._MX = Math.round(this.worldW * 0.12);
    this._MY = Math.round(this.worldH * 0.08);

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this._allyGroup      = this.physics.add.group();
    this.minionProjGroup = this.physics.add.group();
    this._towerWalls     = this.physics.add.staticGroup();

    if (this._isBoss) {
      this._buildBossFloor();
    } else {
      this._buildUFloor();
    }

    // ── Player ───────────────────────────────────────────────
    this.playerStartX = this._slot.entryX;
    this.playerStartY = this._slot.entryY;

    this.createPlayerAnims();
    if (NetworkService.connected) this.createPartnerAnims();
    this.createSlimeAnims();

    this.player = new Player(this, this.playerStartX, this.playerStartY);
    this.player.onDead  = () => this.handlePlayerDead();
    this.player.onEvade = (x, y) => this.spawnEvadeText(x, y);
    this.player.setCollideWorldBounds(true);
    this.physics.add.collider(this.player, this._towerWalls);

    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);

    this._sessionQty.clear();
    for (const id of [ITEM_POTION_HEALTH_S, ITEM_POTION_HEALTH_M, ITEM_POTION_HEALTH_L,
                      ITEM_POTION_REVIVE, ITEM_POTION_ATK, ITEM_POTION_DEF, ITEM_POTION_SPEED]) {
      this._sessionQty.set(id, InventoryStore.getItemQty(id));
    }

    // ── Projectile overlaps ──────────────────────────────────
    this.physics.add.overlap(this.minionProjGroup, this.player, (_p, proj) => {
      const p = proj as Phaser.Physics.Arcade.Image;
      if (!p.active) return;
      if ((p as any).isAllyProj) return;
      const batchId = (p as any).batchId as number | undefined;
      if (batchId !== undefined) {
        if (this.hitBatches.has(batchId)) { p.destroy(); return; }
        this.hitBatches.set(batchId, this.time.now);
      }
      this.player.takeDamage((p as any).dmg as number);
      p.destroy();
    });
    this.physics.add.overlap(this.minionProjGroup, this._allyGroup, (proj, _ally) => {
      const p    = proj as Phaser.Physics.Arcade.Image;
      const ally = _ally as MinionSlime;
      if (!p.active || ally.isDead) return;
      if ((p as any).isAllyProj) return;
      ally.takeDamage((p as any).dmg as number);
      p.destroy();
    });

    // ── Network co-op setup ──────────────────────────────────
    if (NetworkService.connected) {
      NetworkService.clearLobbyCallbacks();
      if (!NetworkService.isHost) {
        NetworkService.onMinionAttack(data => {
          this.spawnMinionAttack(data.type, data.mx, data.my, data.tx, data.ty, data.atk, data.isElite);
        });
      }
      if (NetworkService.isHost) {
        this.time.addEvent({
          delay: 100, loop: true,
          callback: () => {
            const alive = this.allMinions.filter(m => !m.isDead);
            if (!alive.length) return;
            NetworkService.sendMinionSync(alive.map(m => ({
              id: m.minionId, x: m.x / DPR, y: m.y / DPR,
              hp: m.currentHp, maxHp: m.maxHpValue, isDead: false, isDashing: m.isDashing,
            })));
          },
        });
      } else {
        NetworkService.onMinionSync(({ minions }) => {
          for (const data of minions) {
            this._minionTargets.set(data.id, { x: data.x * DPR, y: data.y * DPR, isDashing: data.isDashing ?? false });
          }
        });
      }
      this.time.addEvent({
        delay: 50, loop: true,
        callback: () => NetworkService.sendMove(
          this.player.x / DPR, this.player.y / DPR,
          this.player.lastDir, this.player.currentHp, this.player.maxHpValue,
        ),
      });
    }

    // ── Input ────────────────────────────────────────────────
    this.input.addPointer(3);
    const kb = this.input.keyboard!;
    this.keys = kb.createCursorKeys();
    this.joystick = new VirtualJoystick(this);

    // ── HUD ──────────────────────────────────────────────────
    this.addHUD();
    this.createExitButton();
    this._buildTowerHUD();

    // ── Spawn enemies ────────────────────────────────────────
    if (this._isBoss) {
      this._spawnBossFloor();
    } else {
      this._spawnUFloorEnemies();
    }

    // ── 螢幕邊緣暗化漸層（外圍背景效果）────────────────────
    this._buildScreenVignette();
  }

  override update(): void {
    if (this.gameOver || this.teleporting || this._hostReconnecting) return;

    if (this._leechPool > 0 && this.player?.active) {
      const delta   = this.game.loop.delta;
      const maxRate = this.player.maxHpValue * 0.06 * (delta / 1000);
      const heal    = Math.min(this._leechPool, maxRate);
      this._leechPool -= heal;
      this.player.heal(Math.round(heal));
    }

    if (this._buffExpiry.size > 0 && this.time.now - this._lastBuffHudRefresh > 500) {
      this._lastBuffHudRefresh = this.time.now;
      this.refreshBuffHud();
    }

    if (NetworkService.connected && !NetworkService.isHost) {
      for (const m of this.allMinions) {
        if (m.isDead) continue;
        const t = this._minionTargets.get(m.minionId);
        if (!t) continue;
        m.setPosition(m.x + (t.x - m.x) * 0.2, m.y + (t.y - m.y) * 0.2);
      }
    }

    this.checkLootPickup();

    const joy = this.joystick.value;
    let vx = joy.x, vy = joy.y;
    if (this.keys.left.isDown)  vx = -1;
    else if (this.keys.right.isDown) vx =  1;
    if (this.keys.up.isDown)  vy = -1;
    else if (this.keys.down.isDown) vy =  1;
    this.player.move(vx, vy);

    const SHOW_DIST_SQ = P(500) * P(500);
    for (const m of this.allMinions) {
      if (m.started && !m.visible && !m.isDead) {
        const sdx = this.player.x - m.x, sdy = this.player.y - m.y;
        if (sdx*sdx + sdy*sdy >= SHOW_DIST_SQ) continue;
        m.setVisible(true);
      }
    }

    if (this.bossActive && this.boss) this.refreshBossBar();

    // Y-sort：與 game.scene 對齊，確保 depth 依 Y 座標排列
    this.player.setDepth(this.player.y + 30);
    if (this.bossActive && this.boss?.active) this.boss.setDepth(this.boss.y + 20);
    for (const m of this.allMinions) {
      if (!m.isDead) m.setDepth(m.y + 16);
    }

    this._updateTimer();
    this._updateFloorLabel();
  }

  // ════════════════════════════════════════════════════════════
  // WORLD BUILDING
  // ════════════════════════════════════════════════════════════

  /** U-shaped corridor centred inside the 2× canvas */
  private _buildUFloor(): void {
    const W   = this.worldW;
    const H   = this.worldH;
    const CW  = this._CW;
    const BCH = this._BCH;
    const MX  = this._MX;

    // Arm height derived from reference margin; MY then centers U vertically (equal top+bottom)
    const REF_MY     = Math.round(H * 0.08);
    const FULL_ARM_H = H - REF_MY * 2 - BCH;
    const ARM_H      = Math.round(FULL_ARM_H * 0.8);
    const MY         = Math.round((H - ARM_H - BCH) / 2);

    // Bottom corridor 30% shorter: slide each arm inward 15% of the original full width
    const FULL_BOT_W = W - 2 * MX;
    const BOT_SHRINK = Math.round(FULL_BOT_W * 0.15);
    const LEFT_X     = MX + BOT_SHRINK;
    const RIGHT_X    = W - MX - CW - BOT_SHRINK;
    const BOTTOM_Y   = MY + ARM_H;
    const BOT_W      = RIGHT_X + CW - LEFT_X;   // = FULL_BOT_W * 0.7

    // Entry top of left arm; portal top of right arm
    const entryX  = LEFT_X  + Math.round(CW / 2);
    const entryY  = MY + P(40);
    const portalX = RIGHT_X + Math.round(CW / 2);
    const portalY = MY + P(40);

    this._slot = { entryX, entryY, portalX, portalY, enemyAlive: 0, portalGfx: null, portalZone: null };

    // ── Background: entire canvas = dark stone ───────────────
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x0a0a10, 1);
    bg.fillRect(0, 0, W, H);

    const islandW = RIGHT_X - LEFT_X - CW;

    // ── Dungeon floor tiles ───────────────────────────────────
    this.add.tileSprite(LEFT_X,  MY,       CW,    ARM_H, 'dungeon_floor').setOrigin(0, 0).setDepth(-1);
    this.add.tileSprite(RIGHT_X, MY,       CW,    ARM_H, 'dungeon_floor').setOrigin(0, 0).setDepth(-1);
    this.add.tileSprite(LEFT_X,  BOTTOM_Y, BOT_W, BCH,   'dungeon_floor').setOrigin(0, 0).setDepth(-1);

    // ── 石牆條（與 _buildTowerCorridor 相同的 hWall/vWall 模式）──
    const WW = P(24);
    const wg = this.add.graphics().setDepth(1);

    // 頂部接點橫條（y = MY）：左臂缺口 + 內島頂蓋 + 右臂缺口
    this._drawWallRect(wg, 0,            MY - WW, LEFT_X,           WW * 2);
    this._drawWallRect(wg, LEFT_X + CW,  MY - WW, islandW,          WW * 2);
    this._drawWallRect(wg, RIGHT_X + CW, MY - WW, W - RIGHT_X - CW, WW * 2);

    // 外側縱向條（貫穿臂高 + 底部走廊高，接點之間）
    this._drawWallRect(wg, 0,            MY + WW, LEFT_X,           ARM_H + BCH - WW * 2);
    this._drawWallRect(wg, RIGHT_X + CW, MY + WW, W - RIGHT_X - CW, ARM_H + BCH - WW * 2);

    // 內島本體（兩接點中間）
    this._drawWallRect(wg, LEFT_X + CW, MY + WW, islandW, ARM_H - WW * 2);

    // 內島底部接點橫條（y = BOTTOM_Y）
    this._drawWallRect(wg, LEFT_X + CW, BOTTOM_Y - WW, islandW, WW * 2);

    // 底部終端橫條（y = BOTTOM_Y + BCH），全寬無缺口
    this._drawWallRect(wg, 0, BOTTOM_Y + BCH - WW, W, WW * 2);

    // ── 走廊內壁陰影（depth 2，模擬 game-scene 牆邊陰影）──────
    const SW = P(20);
    const sh = this.add.graphics().setDepth(2);
    // 左臂：外牆右側陰影（暗左→透右）
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    sh.fillRect(LEFT_X, MY, SW, ARM_H);
    // 左臂：內島左側陰影（透左→暗右）
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    sh.fillRect(LEFT_X + CW - SW, MY, SW, ARM_H);
    // 右臂：內島右側陰影（暗左→透右）
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    sh.fillRect(RIGHT_X, MY, SW, ARM_H);
    // 右臂：外牆左側陰影（透左→暗右）
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    sh.fillRect(RIGHT_X + CW - SW, MY, SW, ARM_H);
    // 底部走廊：左側陰影
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    sh.fillRect(LEFT_X, BOTTOM_Y, SW, BCH);
    // 底部走廊：右側陰影
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    sh.fillRect(LEFT_X + BOT_W - SW, BOTTOM_Y, SW, BCH);
    // 底部走廊：頂部陰影（暗上→透下）
    sh.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0.45, 0, 0);
    sh.fillRect(LEFT_X, BOTTOM_Y, BOT_W, SW);

    // ── Physics walls ─────────────────────────────────────────
    this._addWall(0,           0,      W,              MY);
    this._addWall(0,      H - MY,      W,              MY);
    this._addWall(0,          MY,    LEFT_X,      H - MY * 2);
    this._addWall(RIGHT_X + CW, MY, W - (RIGHT_X + CW), H - MY * 2);
    this._addWall(LEFT_X + CW, MY, islandW, ARM_H);
    const belowH = H - MY - (BOTTOM_Y + BCH);
    if (belowH > 0) this._addWall(LEFT_X, BOTTOM_Y + BCH, BOT_W, belowH);

    // ── Locked portal placeholder ─────────────────────────────
    const pg = this.add.graphics().setDepth(4);
    this._slot.portalGfx = pg;
    this._drawLockedPortal(pg, portalX, portalY);
  }

  /** Boss room centred inside the 2× canvas */
  private _buildBossFloor(): void {
    const W   = this.worldW;
    const H   = this.worldH;
    const MX  = this._MX;
    const MY  = this._MY;
    const PW  = P(88);   // portal gap width
    const WALL = P(24);

    // Room occupies the same footprint as the U-shape (margin to margin)
    const RX = MX,  RY = MY;
    const RW = W - MX * 2,  RH = H - MY * 2;

    const entryX  = Math.round(W / 2);
    const entryY  = RY + RH - P(100);
    const portalX = Math.round(W / 2);
    const portalY = RY + WALL / 2;

    this._slot = { entryX, entryY, portalX, portalY, enemyAlive: 0, portalGfx: null, portalZone: null };

    // Background + grid
    const bg = this.add.graphics().setDepth(-2);
    bg.fillStyle(0x0a0a10, 1);
    bg.fillRect(0, 0, W, H);
    bg.lineStyle(1, 0x141420, 0.5);
    for (let x = RX; x <= RX + RW; x += P(36)) bg.lineBetween(x, RY, x, RY + RH);
    for (let y = RY; y <= RY + RH; y += P(36)) bg.lineBetween(RX, y, RX + RW, y);

    // Floor tiles inside room
    this.add.tileSprite(RX + WALL, RY + WALL, RW - WALL * 2, RH - WALL * 2, 'dungeon_floor')
      .setOrigin(0, 0).setDepth(-1);

    // Dungeon wall border around room
    const wg = this.add.graphics().setDepth(2);
    const gapL = Math.round((W - PW) / 2);

    this._drawWallRect(wg, RX,          RY, WALL, RH);          // left
    this._drawWallRect(wg, RX + RW - WALL, RY, WALL, RH);       // right
    this._drawWallRect(wg, RX, RY + RH - WALL, RW, WALL);       // bottom
    this._drawWallRect(wg, 0,  RY, gapL,          WALL);         // top-left
    this._drawWallRect(wg, gapL + PW, RY, W - gapL - PW, WALL); // top-right
    // Outer margins (canvas area outside the room)
    this._drawWallRect(wg, 0, 0, W, MY);            // top margin
    this._drawWallRect(wg, 0, RY + RH, W, MY);      // bottom margin
    this._drawWallRect(wg, 0, MY, MX, RH);          // left margin
    this._drawWallRect(wg, RX + RW, MY, MX, RH);    // right margin

    wg.lineStyle(P(2), 0x3a3a5e, 0.55);
    wg.strokeRect(RX + WALL, RY + WALL, RW - WALL * 2, RH - WALL * 2);
    wg.lineStyle(P(1), 0x5a5a8e, 0.25);
    wg.strokeRect(RX + WALL + P(4), RY + WALL + P(4), RW - WALL * 2 - P(8), RH - WALL * 2 - P(8));

    // Physics walls
    this._addWall(0,  0,  W,  MY);                           // top margin
    this._addWall(0,  RY + RH, W, MY);                        // bottom margin
    this._addWall(0,  MY, MX, RH);                            // left margin
    this._addWall(RX + RW, MY, MX, RH);                       // right margin
    this._addWall(RX,          RY, WALL, RH);                 // room left wall
    this._addWall(RX + RW - WALL, RY, WALL, RH);              // room right wall
    this._addWall(RX, RY + RH - WALL, RW, WALL);              // room bottom wall
    this._addWall(0,  RY, gapL,          WALL);                // room top-left
    this._addWall(gapL + PW, RY, W - gapL - PW, WALL);        // room top-right

    // ── Boss room 內壁陰影 ────────────────────────────────────
    const SW2 = P(20);
    const sh2 = this.add.graphics().setDepth(3);
    sh2.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0, 0.45, 0);
    sh2.fillRect(RX + WALL, RY + WALL, SW2, RH - WALL * 2);          // 左牆右側
    sh2.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.45, 0, 0.45);
    sh2.fillRect(RX + RW - WALL - SW2, RY + WALL, SW2, RH - WALL * 2); // 右牆左側
    sh2.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.45, 0.45, 0, 0);
    sh2.fillRect(RX + WALL, RY + WALL, RW - WALL * 2, SW2);             // 頂牆下側
    sh2.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.45, 0.45);
    sh2.fillRect(RX + WALL, RY + RH - WALL - SW2, RW - WALL * 2, SW2); // 底牆上側

    // Locked portal
    const pg = this.add.graphics().setDepth(4);
    this._slot.portalGfx = pg;
    this._drawLockedPortal(pg, portalX, portalY);
  }

  // 4-layer dungeon stone wall rect
  private _drawWallRect(g: Phaser.GameObjects.Graphics, rx: number, ry: number, rw: number, rh: number): void {
    if (rw < 1 || rh < 1) return;
    g.fillStyle(0x0a0a10, 1); g.fillRect(rx, ry, rw, rh);
    if (rw > P(6) && rh > P(6)) {
      g.fillStyle(0x141420, 1); g.fillRect(rx + P(3), ry + P(3), rw - P(6), rh - P(6));
    }
    if (rw > P(12) && rh > P(12)) {
      g.fillStyle(0x1e1e2e, 0.6); g.fillRect(rx + P(6), ry + P(6), rw - P(12), rh - P(12));
    }
    g.lineStyle(P(1), 0x3a3a5e, 0.55); g.strokeRect(rx, ry, rw, rh);
    if (rw > P(6) && rh > P(6)) {
      g.lineStyle(P(1), 0x5a5a8e, 0.20); g.strokeRect(rx + P(3), ry + P(3), rw - P(6), rh - P(6));
    }
  }

  private _addWall(x: number, y: number, w: number, h: number): void {
    if (w < 1 || h < 1) return;
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    this._towerWalls!.add(r);
  }

  /** 螢幕四邊暗化漸層（setScrollFactor(0)，模擬 game-scene 外圍背景感） */
  private _buildScreenVignette(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const E = P(72);   // 邊緣寬度
    const v = this.add.graphics().setScrollFactor(0).setDepth(4990);
    // 頂
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0.65, 0, 0);
    v.fillRect(0, 0, W, E);
    // 底
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.65, 0.65);
    v.fillRect(0, H - E, W, E);
    // 左
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.65, 0, 0.65, 0);
    v.fillRect(0, 0, E, H);
    // 右
    v.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.65, 0, 0.65);
    v.fillRect(W - E, 0, E, H);
  }

  // ════════════════════════════════════════════════════════════
  // HUD
  // ════════════════════════════════════════════════════════════

  private _buildTowerHUD(): void {
    const W = this.scale.width;

    this._initBossBar();   // must run before any _spawnTowerBossFloor call

    this._timerText = this.add.text(Math.round(W / 2), P(10), '00:00', {
      fontSize: F(13), fontStyle: 'bold', color: '#e8e8ff',
      stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(9800);

    this._floorLabel = this.add.text(P(8), P(10), '', {
      fontSize: F(11), color: '#aa88ff', stroke: '#000', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(9800);

    this._enemyCountTxt = this.add.text(W - P(8), P(10), '', {
      fontSize: F(11), color: '#ffcc88', stroke: '#000', strokeThickness: 2,
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(9800);
  }

  private _updateTimer(): void {
    const elapsed = Math.floor((Date.now() - this._runStart) / 1000);
    const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const ss = String(elapsed % 60).padStart(2, '0');
    this._timerText?.setText(`${mm}:${ss}`);
  }

  private _updateFloorLabel(): void {
    const label = this._isBoss ? `${tr('game.tower.floor', { floor: this._globalFloor })}  BOSS` : tr('game.tower.floor', { floor: this._globalFloor });
    this._floorLabel?.setText(label);
    const alive = this._slot?.enemyAlive ?? 0;
    this._enemyCountTxt?.setText(alive > 0 ? tr('game.tower.remaining', { n: alive }) : '');
  }

  // ════════════════════════════════════════════════════════════
  // ENEMY SPAWNING
  // ════════════════════════════════════════════════════════════

  private _spawnUFloorEnemies(): void {
    const f       = this._globalFloor;
    const hpMult  = 16 + (f - 1) * (16 / 49);
    const atkMult = STAR_STAT_MULT[5] * (1.0 + (f - 1) * (0.6 / 49));
    const pool    = this._towerMinionPool(f);
    const target  = Phaser.Math.Between(50, 70);

    const CW  = this._CW;
    const BCH = this._BCH;
    const INS = P(12);
    const MX  = this._MX;
    const W   = this.worldW;
    const H   = this.worldH;

    const REF_MY     = Math.round(H * 0.08);
    const FULL_ARM_H = H - REF_MY * 2 - BCH;
    const ARM_H      = Math.round(FULL_ARM_H * 0.8);
    const MY         = Math.round((H - ARM_H - BCH) / 2);

    const FULL_BOT_W = W - 2 * MX;
    const BOT_SHRINK = Math.round(FULL_BOT_W * 0.15);
    const LEFT_X     = MX + BOT_SHRINK;
    const RIGHT_X    = W - MX - CW - BOT_SHRINK;
    const BOT_W      = RIGHT_X + CW - LEFT_X;
    const BOTTOM_Y   = MY + ARM_H;

    const zones = [
      { x: LEFT_X  + INS, y: MY + INS,       w: CW - INS * 2,    h: ARM_H - INS * 2 }, // left arm
      { x: RIGHT_X + INS, y: MY + INS,       w: CW - INS * 2,    h: ARM_H - INS * 2 }, // right arm
      { x: LEFT_X  + INS, y: BOTTOM_Y + INS, w: BOT_W - INS * 2, h: BCH - INS * 2 },   // bottom
    ];
    const weights = [40, 40, 20];
    const total   = weights.reduce((a, b) => a + b, 0);

    let spawned = 0;
    for (let z = 0; z < zones.length; z++) {
      const zone  = zones[z];
      const count = Math.round(target * weights[z] / total);
      for (let i = 0; i < count && spawned < target; i++) {
        const ex = zone.x + Math.random() * zone.w;
        const ey = zone.y + Math.random() * zone.h;
        const isElite = spawned < Math.round(target * 0.1);
        const defId   = isElite ? this._towerElitePick(pool) : this._towerPick(pool);
        const def     = getMonsterDef(defId);
        if (!def) continue;
        this._spawnTowerMinion(defId, ex, ey,
          Math.round(def.hp * hpMult), Math.round(def.atk * atkMult));
        spawned++;
      }
    }
    this._slot.enemyAlive = spawned;
  }

  private _spawnBossFloor(): void {
    const f       = this._globalFloor;
    const hpMult  = 16 + (f - 1) * (16 / 49);
    const atkMult = STAR_STAT_MULT[5] * (1.0 + (f - 1) * (0.6 / 49));
    this._spawnTowerBossFloor(f, hpMult, atkMult);
  }

  private _spawnTowerMinion(defId: string, x: number, y: number, hp: number, atk: number): void {
    const before = this.allMinions.length;
    this.spawnMinionAt(defId, x, y, defId.startsWith('elite_'), hp, atk);
    if (this.allMinions.length > before) {
      const m = this.allMinions[this.allMinions.length - 1];
      m.noLeash = true;
      const origDead = m.onDead;
      m.onDead = () => {
        if (origDead) origDead();
        this._onMinionDead();
      };
    }
  }

  private _onMinionDead(): void {
    if (this.bossActive) return;
    this._slot.enemyAlive = Math.max(0, this._slot.enemyAlive - 1);
    if (this._slot.enemyAlive <= 0) this._onFloorCleared();
  }

  // ════════════════════════════════════════════════════════════
  // FLOOR CLEARED / PORTAL
  // ════════════════════════════════════════════════════════════

  private _onFloorCleared(): void {
    if (this.gameOver) return;
    TowerStore.recordFloor(this._globalFloor);
    SaveStore.save();
    this._activateFloorPortal();
  }

  private _activateFloorPortal(): void {
    this._slot.portalGfx?.destroy();
    this._slot.portalGfx = null;

    const px = this._slot.portalX;
    const py = this._slot.portalY;
    const pw = P(60), ph = P(22);

    const pg = this.add.graphics().setDepth(4);
    pg.fillStyle(0x6600cc, 0.18); pg.fillEllipse(px, py, pw * 1.35, ph * 1.6);
    pg.fillStyle(0x9900ff, 0.30); pg.fillEllipse(px, py, pw, ph);
    pg.fillStyle(0x1a0033, 0.80); pg.fillEllipse(px, py, pw * 0.65, ph * 0.65);
    const ring = this.add.graphics().setDepth(5);
    ring.lineStyle(P(3), 0xcc44ff, 1); ring.strokeEllipse(px, py, pw, ph);
    this.tweens.add({ targets: ring, alpha: { from: 0.4, to: 1 }, duration: 700, yoyo: true, repeat: -1 });
    this._slot.portalGfx = pg;

    const zone = this.add.zone(px, py, pw, ph).setDepth(6);
    this.physics.world.enable(zone);
    this._slot.portalZone = zone;

    this.physics.add.overlap(this.player, zone, () => {
      if (this.teleporting) return;
      this._advanceFloor();
    });

    this.add.text(px, py - P(24), tr('game.nextFloor'), {
      fontSize: F(9), color: '#dd99ff', stroke: '#000', strokeThickness: 1,
    }).setOrigin(0.5).setDepth(7);
  }

  private _advanceFloor(): void {
    this.teleporting = true;
    this.cameras.main.fadeOut(300, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.start('TowerScene', {
        globalFloor:     this._globalFloor + 1,
        runStartTime:    this._runStart,
        partnerNickname: this._partnerNickname,
        playerCount:     this._playerCount,
        ownSkinId:       this._ownSkinId,
        partnerSkinId:   this._partnerSkinId,
      } as TowerInitData);
    });
  }

  // ════════════════════════════════════════════════════════════
  // BOSS DEFEATED
  // ════════════════════════════════════════════════════════════

  protected override handleBossDefeated(): void {
    if (this.gameOver) return;
    const boss1Dead = !this.boss?.active;
    const boss2Dead = !this._towerBoss2 || !this._towerBoss2.active;
    if (!boss1Dead || !boss2Dead) return;
    this.bossActive  = false;
    this._towerBoss2 = undefined;
    TowerStore.recordFloor(this._globalFloor);
    SaveStore.save();
    this._activateFloorPortal();
  }

  // ════════════════════════════════════════════════════════════
  // PORTAL VISUAL (locked state)
  // ════════════════════════════════════════════════════════════

  private _drawLockedPortal(g: Phaser.GameObjects.Graphics, px: number, py: number): void {
    const pw = P(60), ph = P(22);
    g.fillStyle(0x220044, 0.35); g.fillEllipse(px, py, pw, ph);
    g.lineStyle(P(2), 0x551188, 0.6); g.strokeEllipse(px, py, pw, ph);
    g.fillStyle(0x440066, 0.25); g.fillEllipse(px, py, pw * 0.6, ph * 0.6);
    this.add.text(px, py - P(20), '🔒', {
      fontSize: F(8), color: '#884488',
    }).setOrigin(0.5).setDepth(5);
  }

  // ════════════════════════════════════════════════════════════
  // EXIT
  // ════════════════════════════════════════════════════════════

  protected override handlePlayerDead(): void {
    super.handlePlayerDead();
  }

  protected override exitToLobby(): void {
    TowerStore.recordFloor(Math.max(1, this._globalFloor - 1));
    SaveStore.save();
    super.exitToLobby();
  }
}
