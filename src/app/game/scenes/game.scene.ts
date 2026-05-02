import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss } from '../objects/boss';
import { MinionSlime } from '../objects/minion-slime';
import { SlashEffect } from '../objects/slash-effect';
import { VirtualJoystick } from '../ui/joystick';
import { PlayerStore } from '../data/player-store';
import { InventoryStore } from '../data/inventory-store';
import { SaveStore } from '../data/save-store';
import { CardStore } from '../data/card-store';
import { getMonsterDef } from '../data/monster-data';
import { getElementMultiplier, ELEMENT_NAMES, ELEMENT_COLORS } from '../data/equipment-data';

const MELEE_RANGE = 60;

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
  private gameOver    = false;
  private teleporting = false;
  private worldW = 0;
  private worldH = 0;

  private allMinions: MinionSlime[] = [];
  private wallGroup!: Phaser.Physics.Arcade.StaticGroup;
  private waypoints: Phaser.Math.Vector2[] = [];
  private corridorSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  private cornerPts: { x: number; y: number }[] = [];
  private readonly BOSS_ARENA_RADIUS = 400;
  private bossArenaCenter  = new Phaser.Math.Vector2(0, 0);
  private bossArenaShape   = 0;   // 0=圓, 1=八角, 2=菱形, 3=圓角矩形
  private bossActive = false;
  private playerStartX = 0;
  private playerStartY = 0;
  private readonly CORR_HW = 100;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload(): void {
    const pBase = 'sprite/hero/PNG/Swordsman_lvl1/Without_shadow/';
    const sBase = 'sprite/slime/PNG/Slime1/With_shadow/';
    const cfg = { frameWidth: 64, frameHeight: 64 };
    const ws = 'sprite/hero/PNG/Swordsman_lvl1/With_shadow/';
    if (!this.textures.exists('player_idle_shadow')) this.load.spritesheet('player_idle_shadow', ws + 'Swordsman_lvl1_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('player_run_shadow')) this.load.spritesheet('player_run_shadow', ws + 'Swordsman_lvl1_Run_with_shadow.png', cfg);
    if (!this.textures.exists('player_attack_shadow')) this.load.spritesheet('player_attack_shadow', ws + 'Swordsman_lvl1_attack_with_shadow.png', cfg);
    if (!this.textures.exists('player_run_attack_shadow')) this.load.spritesheet('player_run_attack_shadow', ws + 'Swordsman_lvl1_Run_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('player_hurt')) this.load.spritesheet('player_hurt', pBase + 'Swordsman_lvl1_Hurt_without_shadow.png', cfg);
    if (!this.textures.exists('slime_idle')) this.load.spritesheet('slime_idle', sBase + 'Slime1_Idle_with_shadow.png', cfg);
    if (!this.textures.exists('slime_walk')) this.load.spritesheet('slime_walk', sBase + 'Slime1_Walk_with_shadow.png', cfg);
    if (!this.textures.exists('slime_run')) this.load.spritesheet('slime_run', sBase + 'Slime1_Run_with_shadow.png', cfg);
    if (!this.textures.exists('slime_attack')) this.load.spritesheet('slime_attack', sBase + 'Slime1_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime_hurt')) this.load.spritesheet('slime_hurt', sBase + 'Slime1_Hurt_with_shadow.png', cfg);
    if (!this.textures.exists('slime_death')) this.load.spritesheet('slime_death', sBase + 'Slime1_Death_with_shadow.png', cfg);
    this.generateTextures();
  }

  create(): void {
    const W = this.scale.width;
    this.gameOver = false;
    this.bossActive = false;
    this.allMinions = [];

    this.generateWaypoints();   // sets this.worldW / worldH / waypoints

    this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    this.createPlayerAnims();
    this.createSlimeAnims();
    this.wallGroup = this.physics.add.staticGroup();
    this.generateAndDrawMap();

    const startPt = this.waypoints[0];
    this.playerStartX = startPt.x;
    this.playerStartY = startPt.y;
    this.player = new Player(this, this.playerStartX, this.playerStartY);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.player.onDead = () => this.handlePlayerDead();

    this.slashEffect = new SlashEffect(this);

    const bossWp = this.waypoints[this.waypoints.length - 1];
    this.boss = new Boss(this, this.bossArenaCenter.x, this.bossArenaCenter.y);
    this.boss.setVisible(false);
    this.boss.getTargetPos = () => [this.player.x, this.player.y];
    this.boss.onHpChanged = () => this.refreshBossBar();
    this.boss.onDead = () => this.handleBossDefeated();
    this.boss.onAoeExplode = (x, y) => {
      if (!this.bossActive) return;
      const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
      if (dSq <= Boss.AOE_RADIUS ** 2) this.player.takeDamage(30);
    };

    const bossGroup = this.physics.add.group();
    bossGroup.add(this.boss, false);
    this.player.setCollideWorldBounds(true);
    (this.boss.body as Phaser.Physics.Arcade.Body).setCollideWorldBounds(true);

    this.physics.add.overlap(bossGroup, this.player, () => {
      if (!this.bossActive) return;
      if (this.boss.currentState === 'DASHING') this.player.takeDamage(25);
    });

    this.physics.add.collider(this.player, this.wallGroup);
    this.physics.add.collider(this.boss, this.wallGroup);

    this.bossHpGfx = this.add.graphics().setScrollFactor(0).setDepth(5).setVisible(false);
    this.bossHpLabel = this.add.text(W / 2, 6, '', {
      fontSize: '11px', color: '#ffcccc', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(6).setVisible(false);

    const kb = this.input.keyboard!;
    this.keys = {
      ...kb.createCursorKeys(),
      w: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      space: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
    };

    const onResize = () => this.physics.world.setBounds(0, 0, this.worldW, this.worldH);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => this.scale.off('resize', onResize));

    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(this);
    this.addHUD();
    this.spawnAllMonsters();
    this.setupPortal(bossWp.x, bossWp.y);
  }

  private getAttackTarget(): { x: number; y: number } {
    let nearest: { x: number; y: number } | null = null;
    let minDist = Infinity;
    for (const m of this.allMinions) {
      if (m.isDead) continue;
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
      if (d < minDist) { minDist = d; nearest = { x: m.x, y: m.y }; }
    }
    if (this.bossActive && this.boss.active) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      if (d < minDist) { nearest = { x: this.boss.x, y: this.boss.y }; }
    }
    return nearest ?? { x: this.player.x, y: this.player.y - 1 };
  }

  override update(): void {
    if (this.gameOver || this.teleporting) return;

    if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
      const { x: tx, y: ty } = this.getAttackTarget();
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

    // Y-sort: use foot position so objects sort at ground level
    this.player.setDepth(this.player.y + 30);
    if (this.bossActive) this.boss.setDepth(this.boss.y + 20);
    for (const m of this.allMinions) {
      if (!m.isDead) m.setDepth(m.y + 16);
    }
  }

  private meleeAttack(tx: number, ty: number): void {
    // 在攻擊發動當下就算好方向，避免被後續每幀的 move() 覆蓋 lastDir
    const dx = tx - this.player.x;
    const dy = ty - this.player.y;
    const attackDir: 'down' | 'left' | 'right' | 'up' =
      Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');

    this.player.playAttack(tx, ty, () => {
      const dir = attackDir;
      const stats = CardStore.getTotalStats();

      const dirAngle: Record<typeof dir, number> = {
        right: 0,
        down: 90,
        left: 180,
        up: 270,
      };
      const facing = dirAngle[dir];
      const halfArc = stats.attackArc / 2;
      const inArc = (ex: number, ey: number) => {
        const toEnemy = Phaser.Math.RadToDeg(Math.atan2(ey - this.player.y, ex - this.player.x));
        return Math.abs(Phaser.Math.Angle.ShortestBetween(facing, toEnemy)) <= halfArc;
      };

      for (const m of this.allMinions) {
        if (m.isDead) continue;
        const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y);
        if (dist > MELEE_RANGE) continue;
        if (!inArc(m.x, m.y)) continue;
        const isCrit = Math.random() < stats.crit;
        const variance = Phaser.Math.FloatBetween(0.85, 1.15);
        const dmg = Math.round(stats.atk * variance * (isCrit ? 2 : 1));
        m.takeDamage(dmg);
        m.knockback(this.player.x, this.player.y);
        this.spawnDamageNumber(m.x, m.y, dmg, isCrit, 1);
        this.slashEffect.play(m.x, m.y, dir);
      }

      if (!this.bossActive || !this.boss.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      if (dist > MELEE_RANGE) return;
      if (!inArc(this.boss.x, this.boss.y)) return;
      const isCrit = Math.random() < stats.crit;
      const elemMult = getElementMultiplier(PlayerStore.getWeaponElement(), this.boss.element);
      const variance = Phaser.Math.FloatBetween(0.85, 1.15);
      const dmg = Math.round(stats.atk * variance * (isCrit ? 2 : 1) * elemMult);
      this.boss.takeDamage(dmg);
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, isCrit, elemMult);
      this.slashEffect.play(this.boss.x, this.boss.y, dir);
      this.boss.knockback(this.player.x, this.player.y);
    });
  }

  // ── Map / Monster Setup ───────────────────────────────

  private tryCardDrop(monsterId: string): void {
    const def = getMonsterDef(monsterId);
    if (!def) return;
    if (Math.random() < def.cardDropRate) CardStore.addCard(def.cardId);
  }

  private generateWaypoints(): void {
    const PAD = 500;
    let cx = 0, cy = 0;
    let dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const raw: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(cx, cy)];
    for (let i = 0; i < Phaser.Math.Between(4, 6); i++) {
      dir += Phaser.Math.FloatBetween(-Math.PI * 0.5, Math.PI * 0.5);
      const dist = Phaser.Math.Between(700, 1000);
      cx += Math.cos(dir) * dist;
      cy += Math.sin(dir) * dist;
      raw.push(new Phaser.Math.Vector2(cx, cy));
    }
    const xs = raw.map(p => p.x), ys = raw.map(p => p.y);
    const offX = Math.min(...xs) - PAD, offY = Math.min(...ys) - PAD;
    this.waypoints = raw.map(p => new Phaser.Math.Vector2(p.x - offX, p.y - offY));
    this.worldW = Math.round(Math.max(...xs) - Math.min(...xs) + PAD * 2);
    this.worldH = Math.round(Math.max(...ys) - Math.min(...ys) + PAD * 2);
    const ar = this.BOSS_ARENA_RADIUS;
    const baseH = this.worldH;
    this.worldW += ar * 2 + 700;
    this.worldH = Math.max(baseH, ar * 2 + 600);
    this.bossArenaCenter.set(this.worldW - ar - 200, this.worldH / 2);
    this.bossArenaShape = Phaser.Math.Between(0, 3);
  }

  private generateAndDrawMap(): void {
    this.cameras.main.setBackgroundColor(0x000000);
    this.add.rectangle(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 0x000000)
      .setDepth(-1);

    this.buildCorridorSegs();

    const hw = this.CORR_HW;
    const rw = hw * 2.2; // room half-size at waypoints/corners

    // Helper: fill all walkable rects onto a graphics object
    const fillAll = (g: Phaser.GameObjects.Graphics) => {
      for (const s of this.corridorSegs) {
        if (Math.abs(s.y1 - s.y2) < 1) { // horizontal
          g.fillRect(Math.min(s.x1, s.x2) - hw, s.y1 - hw, Math.abs(s.x2 - s.x1) + hw * 2, hw * 2);
        } else {                           // vertical
          g.fillRect(s.x1 - hw, Math.min(s.y1, s.y2) - hw, hw * 2, Math.abs(s.y2 - s.y1) + hw * 2);
        }
      }
      for (const c of this.cornerPts)
        g.fillRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
      for (const wp of this.waypoints)
        g.fillRect(wp.x - rw, wp.y - rw, rw * 2, rw * 2);
    };

    // Helper: stroke all walkable rects
    const strokeAll = (g: Phaser.GameObjects.Graphics) => {
      for (const s of this.corridorSegs) {
        if (Math.abs(s.y1 - s.y2) < 1) {
          g.strokeRect(Math.min(s.x1, s.x2) - hw, s.y1 - hw, Math.abs(s.x2 - s.x1) + hw * 2, hw * 2);
        } else {
          g.strokeRect(s.x1 - hw, Math.min(s.y1, s.y2) - hw, hw * 2, Math.abs(s.y2 - s.y1) + hw * 2);
        }
      }
      for (const c of this.cornerPts)
        g.strokeRect(c.x - rw, c.y - rw, rw * 2, rw * 2);
      for (const wp of this.waypoints)
        g.strokeRect(wp.x - rw, wp.y - rw, rw * 2, rw * 2);
    };

    // ── Build shared mask ────────────────────────────────
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    fillAll(maskGfx);
    const sharedMask = maskGfx.createGeometryMask();

    // ── Layer -1: dark cliff wall face (below grass) ─────
    // strokeAll draws inner lines too, but they're hidden by the grass layer on top.
    // Only the part outside the mask (corridor boundary outward) stays visible.
    const wallFace = this.add.graphics().setDepth(-0.5);
    wallFace.lineStyle(28, 0x060e02, 1.0); strokeAll(wallFace);
    wallFace.lineStyle(14, 0x0f2205, 0.90); strokeAll(wallFace);
    wallFace.lineStyle(6, 0x1a3a08, 0.70); strokeAll(wallFace);

    // ── Layer 0: base grass (masked to corridor) ─────────
    this.add.tileSprite(this.worldW / 2, this.worldH / 2, this.worldW, this.worldH, 'grass')
      .setDepth(0).setMask(sharedMask);

    // ── Layer 0.3: subtle inner-edge AO (fill, not stroke) ─
    // Fill the walkable area dark at low alpha → then the grass on top is already drawn.
    // We want ONLY the border ring dark, so we fill the whole area dark first, then
    // fill a slightly inset version with slightly lighter grass tint to cancel center.
    // Simpler: just fill border areas of each segment individually.
    const aoGfx = this.add.graphics().setDepth(0.3).setMask(sharedMask);
    // 走廊條帶兩端各裁切 rw，避免延伸進房間造成深色線
    const aoTrim = hw * 2.2;
    aoGfx.fillStyle(0x000000, 0.22);
    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1) {               // 水平走廊
        const x0  = Math.min(s.x1, s.x2) + aoTrim;
        const x1b = Math.max(s.x1, s.x2) - aoTrim;
        if (x1b <= x0) continue;
        const ry = s.y1 - hw;
        aoGfx.fillRect(x0, ry, x1b - x0, 48);
        aoGfx.fillRect(x0, ry + hw * 2 - 48, x1b - x0, 48);
      } else {                                          // 垂直走廊
        const y0  = Math.min(s.y1, s.y2) + aoTrim;
        const y1b = Math.max(s.y1, s.y2) - aoTrim;
        if (y1b <= y0) continue;
        const rx = s.x1 - hw;
        aoGfx.fillRect(rx, y0, 48, y1b - y0);
        aoGfx.fillRect(rx + hw * 2 - 48, y0, 48, y1b - y0);
      }
    }
    // 房間角落 AO（只畫房間邊框，不穿入走廊）
    aoGfx.fillStyle(0x000000, 0.16);
    for (const c of [...this.cornerPts, ...this.waypoints]) {
      const rw2 = this.CORR_HW * 2.2;
      aoGfx.fillRect(c.x - rw2, c.y - rw2, rw2 * 2, 40);
      aoGfx.fillRect(c.x - rw2, c.y + rw2 - 40, rw2 * 2, 40);
      aoGfx.fillRect(c.x - rw2, c.y - rw2, 40, rw2 * 2);
      aoGfx.fillRect(c.x + rw2 - 40, c.y - rw2, 40, rw2 * 2);
    }

    this.placeWalls();
    this.placeInteriorDeco();
    this.drawBossArena();
  }

  private buildCorridorSegs(): void {
    this.corridorSegs = [];
    this.cornerPts = [];
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const p1 = this.waypoints[i];
      const p2 = this.waypoints[i + 1];
      // Randomly choose horizontal-first or vertical-first L-shape
      const hFirst = Phaser.Math.Between(0, 1) === 0;
      const cx = hFirst ? p2.x : p1.x;
      const cy = hFirst ? p1.y : p2.y;
      this.cornerPts.push({ x: cx, y: cy });
      this.corridorSegs.push({ x1: p1.x, y1: p1.y, x2: cx, y2: cy });
      this.corridorSegs.push({ x1: cx, y1: cy, x2: p2.x, y2: p2.y });
    }
  }

  private isInOpenArea(px: number, py: number): boolean {
    const hw = this.CORR_HW;
    const rw = hw * 2.2;
    for (const s of this.corridorSegs) {
      if (Math.abs(s.y1 - s.y2) < 1) {
        if (Math.abs(py - s.y1) <= hw && px >= Math.min(s.x1, s.x2) - hw && px <= Math.max(s.x1, s.x2) + hw) return true;
      } else {
        if (Math.abs(px - s.x1) <= hw && py >= Math.min(s.y1, s.y2) - hw && py <= Math.max(s.y1, s.y2) + hw) return true;
      }
    }
    for (const c of this.cornerPts)
      if (Math.abs(px - c.x) <= rw && Math.abs(py - c.y) <= rw) return true;
    for (const wp of this.waypoints)
      if (Math.abs(px - wp.x) <= rw && Math.abs(py - wp.y) <= rw) return true;
    if (this.isInBossArena(px, py)) return true;
    return false;
  }

  private placeWalls(): void {
    const STEP = 38;
    for (let gx = 0; gx < this.worldW; gx += STEP) {
      for (let gy = 0; gy < this.worldH; gy += STEP) {
        if (this.isInOpenArea(gx, gy)) continue;
        const wall = this.wallGroup.create(gx, gy, '__DEFAULT') as Phaser.Physics.Arcade.Sprite;
        wall.setVisible(false).setActive(true);
        (wall.body as Phaser.Physics.Arcade.StaticBody).setSize(STEP, STEP).setOffset(0, 0);
        wall.refreshBody();
      }
    }
  }

  private placeInteriorDeco(): void {
    const STEP = 180;
    for (let gx = 0; gx < this.worldW; gx += STEP) {
      for (let gy = 0; gy < this.worldH; gy += STEP) {
        if (Phaser.Math.Between(0, 9) < 4) continue;
        const jx = gx + Phaser.Math.Between(-60, 60);
        const jy = gy + Phaser.Math.Between(-60, 60);
        if (!this.isInOpenArea(jx, jy)) continue;

        // Keep clear around waypoints so combat space is unobstructed
        const tooClose = this.waypoints.some(
          wp => Phaser.Math.Distance.Between(jx, jy, wp.x, wp.y) < 120,
        );
        if (tooClose) continue;

        const roll = Phaser.Math.Between(0, 9);
        if (roll < 6) {
          // Small rock — player can walk behind it
          const sc = Phaser.Math.FloatBetween(0.55, 0.85);
          this.add.image(jx, jy, 'rock')
            .setScale(sc)
            .setDepth(jy + 12)
            .setTint(0xbbbbaa);
        } else if (roll < 9) {
          // Grass tuft cluster
          for (let k = 0; k < Phaser.Math.Between(2, 4); k++) {
            const ox = Phaser.Math.Between(-14, 14);
            const oy = Phaser.Math.Between(-8, 8);
            this.add.graphics()
              .setDepth(jy + oy + 4)
              .fillStyle(0x3a7a1a, 0.7)
              .fillEllipse(jx + ox, jy + oy, Phaser.Math.Between(10, 18), Phaser.Math.Between(6, 10));
          }
        } else {
          // Tiny dark pebble group
          for (let k = 0; k < 3; k++) {
            const ox = Phaser.Math.Between(-10, 10);
            const oy = Phaser.Math.Between(-6, 6);
            this.add.graphics()
              .setDepth(jy + oy + 2)
              .fillStyle(0x555544, 0.6)
              .fillCircle(jx + ox, jy + oy, Phaser.Math.Between(2, 4));
          }
        }
      }
    }
  }

  private spawnAllMonsters(): void {
    for (let i = 1; i < this.waypoints.length - 1; i++) {
      const wp = this.waypoints[i];
      const count = 6;
      for (let j = 0; j < count; j++) {
        const a = Phaser.Math.FloatBetween(0, Math.PI * 2);
        const r = Phaser.Math.FloatBetween(20, 70);
        const m = new MinionSlime(this, wp.x + Math.cos(a) * r, wp.y + Math.sin(a) * r, 150);
        m.setPatrolCenter(wp.x, wp.y);
        m.getTargetPos = () => [this.player.x, this.player.y];
        m.onDead = () => this.tryCardDrop('slime_grass');
        this.allMinions.push(m);
        this.physics.add.collider(m, this.wallGroup);
        this.physics.add.overlap(m, this.player, () => {
          if (!m.isDead && m.isDashing) this.player.takeDamage(15);
        });
      }
    }
    this.time.delayedCall(400, () => { for (const m of this.allMinions) m.start(); });
  }

  private setupPortal(px: number, py: number): void {
    // 地面陰影壓暗感
    const shadowGfx = this.add.graphics().setDepth(5);
    shadowGfx.fillStyle(0x000000, 0.35); shadowGfx.fillEllipse(px, py + 5, 116, 28);

    // 外發光橢圓
    const outerGfx = this.add.graphics().setDepth(6);
    outerGfx.fillStyle(0x6600cc, 0.14); outerGfx.fillEllipse(px, py, 120, 48);
    outerGfx.fillStyle(0x8800ff, 0.22); outerGfx.fillEllipse(px, py, 96, 38);
    // 傳送門內腔
    outerGfx.fillStyle(0x1a0033, 0.85); outerGfx.fillEllipse(px, py, 76, 28);
    outerGfx.fillStyle(0xcc99ff, 0.15); outerGfx.fillEllipse(px - 10, py - 4, 28, 10);

    // 邊緣光環（呼吸 tween）
    const ringGfx = this.add.graphics().setDepth(7);
    ringGfx.lineStyle(4, 0xcc44ff, 1.0); ringGfx.strokeEllipse(px, py, 76, 28);
    ringGfx.lineStyle(2, 0xffffff, 0.55); ringGfx.strokeEllipse(px, py, 76, 28);
    this.tweens.add({ targets: ringGfx, alpha: { from: 0.45, to: 1.0 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 浮動標籤
    const label = this.add.text(px, py - 30, '⚡ BOSS ⚡', {
      fontSize: '11px', color: '#dd88ff', stroke: '#220033', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(8);
    this.tweens.add({ targets: label, y: py - 36, alpha: { from: 0.7, to: 1.0 }, duration: 1000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    // 觸發區（對齊內圈橢圓 76×28）
    const zone = this.add.zone(px, py, 58, 20);
    this.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
    this.physics.add.overlap(this.player, zone, () => {
      if (this.bossActive) return;
      this.bossActive  = true;
      this.teleporting = true;
      this.player.move(0, 0);
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      zone.destroy();
      this.teleportToBossArena();
    });
  }

  private teleportToBossArena(): void {
    const destX = this.bossArenaCenter.x;
    const destY = this.bossArenaCenter.y + this.BOSS_ARENA_RADIUS * 0.72;
    const origScale = this.player.scaleX;

    this.cameras.main.fadeOut(360, 0, 0, 0);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.player.setPosition(destX, destY).setVisible(false);
      this.cameras.main.fadeIn(460, 0, 0, 0);
      this.cameras.main.once('camerafadeincomplete', () => {
        this.playTeleportIn(destX, destY, origScale, () => { this.teleporting = false; });
        this.boss.setVisible(true).setAlpha(1);
        (this.boss.body as Phaser.Physics.Arcade.Body).enable = true;
        this.bossHpGfx.setVisible(true);
        this.bossHpLabel.setVisible(true);
        this.refreshBossBar();
        this.time.delayedCall(300, () => this.boss.start());
      });
    });
  }

  // 入場：能量環由外往內聚合，玩家從光中現身（縮小 50%）
  private playTeleportIn(cx: number, cy: number, origScale: number, onComplete?: () => void): void {
    const D = 62;

    // 玩家從縮小狀態長回來
    this.player.setVisible(true).setScale(0).setAlpha(0);
    this.tweens.add({
      targets: this.player,
      scaleX: origScale, scaleY: origScale, alpha: 1,
      delay: 310, duration: 480,
      ease: 'Back.Out',
    });

    // 主動畫 (0→1, 940ms)
    const gfx = this.add.graphics().setDepth(D);
    const c = { t: 0 };
    this.tweens.add({
      targets: c, t: 1, duration: 940, ease: 'Linear',
      onUpdate: () => {
        const t = c.t;
        gfx.clear();

        // 開場白光閃
        if (t < 0.20) {
          const ft = 1 - t / 0.20;
          gfx.fillStyle(0xffffff, ft * 0.96);
          gfx.fillCircle(cx, cy, ft * 15);
          gfx.fillStyle(0xdd88ff, ft * 0.72);
          gfx.fillCircle(cx, cy, ft * 10);
        }

        // 三層光圈由外往內收縮（0→0.74）
        const convEnd = 0.74;
        if (t <= convEnd) {
          const ct     = t / convEnd;
          const rAlpha = ct < 0.82 ? 1 : 1 - (ct - 0.82) / 0.18;
          const rings = [
            { maxR: 50, lw: 2.5, color: 0xffffff },
            { maxR: 36, lw: 1.8, color: 0xdd77ff },
            { maxR: 62, lw: 1.2, color: 0x9933ff },
          ];
          for (const ring of rings) {
            const r = ring.maxR * (1 - ct) + 4;
            gfx.lineStyle(ring.lw, ring.color, rAlpha);
            gfx.strokeCircle(cx, cy, r);
          }
          // 地面暈光
          gfx.fillStyle(0x6600ff, (1 - ct) * 0.20);
          gfx.fillCircle(cx, cy, 42 * (1 - ct) + 6);
          gfx.fillStyle(0xaa55ff, (1 - ct) * 0.28);
          gfx.fillCircle(cx, cy, 25 * (1 - ct) + 5);
        }

        // 旋入光點（0.06→0.82）
        const sT = Math.max(t - 0.06, 0) / 0.76;
        const sA = sT < 1 ? sT * (1 - sT * sT) : 0;
        if (sA > 0.04) {
          const rot = -t * Math.PI * 3.8;
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + rot;
            const r = (1 - sT) * 28 + 4;
            gfx.fillStyle(i % 2 === 0 ? 0xffffff : 0xdd88ff, sA * 0.92);
            gfx.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 2);
          }
          for (let i = 0; i < 4; i++) {
            const a = (i / 4) * Math.PI * 2 - rot * 0.55;
            const r = (1 - sT) * 39 + 3;
            gfx.fillStyle(0xcc44ff, sA * 0.55);
            gfx.fillCircle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.5);
          }
        }

        // 落地後的餘韻光圈（0.70→1.0）
        if (t > 0.70) {
          const st = (t - 0.70) / 0.30;
          const ga = (1 - st) * 0.32;
          gfx.fillStyle(0x8833ff, ga * 0.22);
          gfx.fillCircle(cx, cy, 15 + st * 8);
          gfx.lineStyle(1.5, 0xdd88ff, ga);
          gfx.strokeCircle(cx, cy, 11 + st * 5);
        }
      },
      onComplete: () => { gfx.destroy(); onComplete?.(); },
    });

    // 到達時的外散粒子
    for (let i = 0; i < 24; i++) {
      const angle = (i / 24) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.08, 0.08);
      const dist  = Phaser.Math.Between(10, 28);
      const col   = ([0xffffff, 0xdd77ff, 0x9933ff, 0xcc44ff] as number[])[i % 4];
      const p = this.add.graphics().setDepth(D + 1).setPosition(cx, cy);
      p.fillStyle(col, 1); p.fillCircle(0, 0, Phaser.Math.Between(1, 2));
      this.tweens.add({
        targets: p,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        alpha: 0, scaleX: 0.1, scaleY: 0.1,
        delay: Phaser.Math.Between(0, 90),
        duration: Phaser.Math.Between(320, 600),
        ease: 'Cubic.easeOut',
        onComplete: () => p.destroy(),
      });
    }
  }

  private isInBossArena(px: number, py: number): boolean {
    const dx = px - this.bossArenaCenter.x;
    const dy = py - this.bossArenaCenter.y;
    const R  = this.BOSS_ARENA_RADIUS;
    switch (this.bossArenaShape) {
      case 0: return dx * dx + dy * dy <= R * R;
      case 1: { const hs = R * 0.875; return Math.abs(dx) <= hs && Math.abs(dy) <= hs && Math.abs(dx) + Math.abs(dy) <= hs * 1.5; }
      case 2: return Math.abs(dx) + Math.abs(dy) <= R;
      case 3: { const hw = 380, hh = 300, cr = 100; const ex = Math.max(Math.abs(dx) - (hw - cr), 0); const ey = Math.max(Math.abs(dy) - (hh - cr), 0); return ex * ex + ey * ey <= cr * cr; }
      default: return dx * dx + dy * dy <= R * R;
    }
  }

  // 多邊形輪廓點（shape 1-3 使用；0 用 circle API）
  private buildArenaBoundary(): { x: number; y: number }[] {
    const cx = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    const R  = this.BOSS_ARENA_RADIUS;
    if (this.bossArenaShape === 1) {          // 八角形
      const hs = R * 0.875;
      return [
        { x: cx + hs,        y: cy + hs * 0.5 },
        { x: cx + hs * 0.5,  y: cy + hs       },
        { x: cx - hs * 0.5,  y: cy + hs       },
        { x: cx - hs,        y: cy + hs * 0.5 },
        { x: cx - hs,        y: cy - hs * 0.5 },
        { x: cx - hs * 0.5,  y: cy - hs       },
        { x: cx + hs * 0.5,  y: cy - hs       },
        { x: cx + hs,        y: cy - hs * 0.5 },
      ];
    }
    if (this.bossArenaShape === 2) {          // 菱形
      return [
        { x: cx + R, y: cy     },
        { x: cx,     y: cy + R },
        { x: cx - R, y: cy     },
        { x: cx,     y: cy - R },
      ];
    }
    if (this.bossArenaShape === 3) {          // 圓角矩形
      const hw = 380, hh = 300, cr = 100, segs = 10;
      const pts: { x: number; y: number }[] = [];
      for (const [ox, oy, a0] of [
        [cx + hw - cr, cy + hh - cr, 0            ],
        [cx - hw + cr, cy + hh - cr, Math.PI / 2  ],
        [cx - hw + cr, cy - hh + cr, Math.PI       ],
        [cx + hw - cr, cy - hh + cr, Math.PI * 1.5],
      ] as [number, number, number][]) {
        for (let i = 0; i <= segs; i++) {
          const a = a0 + (i / segs) * Math.PI / 2;
          pts.push({ x: ox + Math.cos(a) * cr, y: oy + Math.sin(a) * cr });
        }
      }
      return pts;
    }
    return [];
  }

  private drawBossArena(): void {
    const cx  = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    const R   = this.BOSS_ARENA_RADIUS;
    const pts = this.buildArenaBoundary();
    const isCircle = this.bossArenaShape === 0;

    const fillShape   = (g: Phaser.GameObjects.Graphics) => isCircle ? g.fillCircle(cx, cy, R)   : g.fillPoints(pts, true);
    const strokeShape = (g: Phaser.GameObjects.Graphics) => isCircle ? g.strokeCircle(cx, cy, R) : g.strokePoints(pts, true);

    // 崖壁邊緣（地板之下）
    const wallFace = this.add.graphics().setDepth(-0.5);
    wallFace.lineStyle(32, 0x080010, 1.0); strokeShape(wallFace);
    wallFace.lineStyle(16, 0x1a0030, 0.9); strokeShape(wallFace);
    wallFace.lineStyle(7,  0x380055, 0.7); strokeShape(wallFace);

    // 石板地板 + 遮罩
    const maskGfx = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
    maskGfx.fillStyle(0xffffff);
    fillShape(maskGfx);
    const arenaMask = maskGfx.createGeometryMask();
    this.add.tileSprite(cx, cy, R * 2.2, R * 2.2, 'stone').setDepth(0.1).setMask(arenaMask);

    // AO 邊緣暗化
    const aoGfx = this.add.graphics().setDepth(0.4).setMask(arenaMask);
    if (isCircle) {
      aoGfx.lineStyle(70, 0x000000, 0.30); aoGfx.strokeCircle(cx, cy, R - 35);
    } else {
      aoGfx.lineStyle(90, 0x000000, 0.28); strokeShape(aoGfx);
    }

    // 裝飾魔法陣
    const decoGfx = this.add.graphics().setDepth(1.0);

    // 外圈輪廓（依形狀）
    decoGfx.lineStyle(2, 0x880099, 0.35);
    if (isCircle) {
      decoGfx.strokeCircle(cx, cy, R * 0.80);
    } else {
      // 縮小 75% 的輪廓
      const innerPts = pts.map(p => ({ x: cx + (p.x - cx) * 0.75, y: cy + (p.y - cy) * 0.75 }));
      decoGfx.strokePoints(innerPts, true);
    }
    decoGfx.lineStyle(1, 0x660077, 0.22);
    decoGfx.strokeCircle(cx, cy, Math.min(R * 0.55, 240));

    // 中央儀式圈
    decoGfx.fillStyle(0x1a0025, 0.55); decoGfx.fillCircle(cx, cy, 85);
    decoGfx.lineStyle(3, 0xcc0077, 0.65); decoGfx.strokeCircle(cx, cy, 85);
    decoGfx.lineStyle(1, 0xcc0077, 0.30); decoGfx.strokeCircle(cx, cy, 58);

    // 射線（對稱軸數量配合形狀）
    const rayCount = [8, 8, 4, 8][this.bossArenaShape];
    decoGfx.lineStyle(1, 0x880066, 0.22);
    for (let i = 0; i < rayCount; i++) {
      const a = (i / rayCount) * Math.PI * 2;
      decoGfx.lineBetween(cx, cy, cx + Math.cos(a) * 85, cy + Math.sin(a) * 85);
    }

    // 符文點（沿內輪廓擺放）
    decoGfx.fillStyle(0xdd44ff, 0.55);
    const dotCount  = [4, 8, 4, 4][this.bossArenaShape];
    const dotOffset = [Math.PI / 4, 0, 0, Math.PI / 4][this.bossArenaShape];
    const dotR      = Math.min(R * 0.62, 260);
    for (let i = 0; i < dotCount; i++) {
      const a = (i / dotCount) * Math.PI * 2 + dotOffset;
      decoGfx.fillCircle(cx + Math.cos(a) * dotR, cy + Math.sin(a) * dotR, 7);
    }
  }

  private refreshBossBar(): void {
    const W = this.scale.width;
    const bw = W * 0.60;
    const bx = (W - bw) / 2;
    const by = 20;
    const bh = 6;

    this.bossHpGfx.clear();
    // 底板（名稱 + 血條同一排）
    this.bossHpGfx.fillStyle(0x220000, 0.80);
    this.bossHpGfx.fillRect(bx - 4, by - 2, bw + 8, bh + 4);

    const pct = this.boss.currentHp / this.boss.maxHpValue;
    const color = pct > 0.5 ? 0xcc2200 : pct > 0.25 ? 0xff4400 : 0xff0000;
    this.bossHpGfx.fillStyle(color);
    this.bossHpGfx.fillRect(bx, by, bw * pct, bh);
    this.bossHpGfx.lineStyle(1.5, 0xff4400, 0.7);
    this.bossHpGfx.strokeRect(bx, by, bw, bh);

    const elemName = ELEMENT_NAMES[this.boss.element];
    const elemColor = ELEMENT_COLORS[this.boss.element];
    const elemTag = this.boss.element !== 'none' ? ` 【${elemName}】` : '';
    if (this.boss.element !== 'none') {
      this.bossHpGfx.fillStyle(elemColor, 0.9);
      this.bossHpGfx.fillRect(bx - 4, by - 2, 4, bh + 4);
    }
    this.bossHpLabel.setText(`綠史萊姆${elemTag}  ${this.boss.currentHp}/${this.boss.maxHpValue}`);
    this.bossHpLabel.setPosition(W / 2, by - 14);
  }

  private spawnDamageNumber(x: number, y: number, dmg: number, isCrit: boolean, elemMult: number): void {
    const ox = Phaser.Math.Between(-14, 14);
    const fontSize = isCrit ? '20px' : '14px';
    const color = isCrit ? '#ff8800' : (elemMult > 1 ? '#ff4444' : '#ffffff');
    const stroke = isCrit ? '#4a1800' : '#000000';

    const label = this.add.text(x + ox, y - 24, `${dmg}`, {
      fontSize, fontStyle: isCrit ? 'bold' : 'normal',
      color, stroke, strokeThickness: isCrit ? 4 : 3,
    }).setOrigin(0.5, 1).setDepth(300);

    if (isCrit) {
      const crit = this.add.text(x + ox + 2, y - 38, '暴擊！', {
        fontSize: '9px', color: '#ffcc44', stroke: '#4a1800', strokeThickness: 2,
      }).setOrigin(0.5, 1).setDepth(300);
      this.tweens.add({
        targets: crit,
        y: crit.y - 28, alpha: 0,
        duration: 700, ease: 'Cubic.easeOut',
        onComplete: () => crit.destroy(),
      });
    }

    this.tweens.add({
      targets: label,
      y: label.y - (isCrit ? 52 : 38),
      alpha: 0,
      duration: isCrit ? 900 : 700,
      ease: 'Cubic.easeOut',
      onComplete: () => label.destroy(),
    });
  }


  // ── Game-end handlers ─────────────────────────────────

  private handleBossDefeated(): void {
    this.gameOver = true;
    this.player.move(0, 0);
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.player.setDepth(1);

    const chunks = Phaser.Math.Between(1, 3);
    const essence = Phaser.Math.Between(0, 1);
    const coins = Phaser.Math.Between(20, 200);
    const expGain = Phaser.Math.Between(25, 50);

    InventoryStore.addItem('slime_chunk', '綠史萊姆碎塊', chunks);
    if (essence > 0)
      InventoryStore.addItem('slime_essence', '綠史萊姆精華', essence);
    InventoryStore.addGold(coins);
    PlayerStore.addExp(expGain);
    SaveStore.save();

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
    lineGfx.lineBetween(W / 2 + 72, titleY, W / 2 + 160, titleY);
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
    const rowH = 34;
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
    renderRow(panelY + 40 + drops.length * rowH, 'icon_gold', '金幣', `+ ${coins}`, '#ffcc44');
    renderRow(panelY + 40 + (drops.length + 1) * rowH, 'icon_exp', '經驗值', `+ ${exp}`, '#88ccff');

    // ── Return button ─────────────────────────────────────
    const btnW = 96;
    const btnH = 23;
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
    hitArea.on('pointerout', () => btnLabel.setStyle({ color: '#e8c070' }));
    hitArea.on('pointerdown', () => this.scene.start('PrepScene'));
  }

  private showEndScreen(victory: boolean): void {
    const W = this.scale.width;
    const H = this.scale.height;

    if (victory) this.launchFireworks(W, H);

    const overlay = this.add.graphics().setScrollFactor(0).setDepth(248);
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(0, 0, W, H);

    const titleText = victory ? '挑戰成功！' : '挑戰失敗';
    const titleColor = victory ? '#ffdd00' : '#ff4444';
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
      btn.on('pointerout', () => btn.setStyle({ color: '#ffffff' }));
      btn.on('pointerdown', () => this.scene.start('PrepScene'));
    } else {
      const retryBtn = this.add.text(W / 2 - 100, H / 2 + 24, '再次挑戰', {
        fontSize: '20px', color: '#ffffff',
        backgroundColor: '#332222',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setInteractive({ useHandCursor: true });
      retryBtn.on('pointerover', () => retryBtn.setStyle({ color: '#ff8888' }));
      retryBtn.on('pointerout', () => retryBtn.setStyle({ color: '#ffffff' }));
      retryBtn.on('pointerdown', () => this.scene.restart());

      const lobbyBtn = this.add.text(W / 2 + 100, H / 2 + 24, '返回大廳', {
        fontSize: '20px', color: '#ffffff',
        backgroundColor: '#223322',
        padding: { x: 22, y: 14 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(250).setInteractive({ useHandCursor: true });
      lobbyBtn.on('pointerover', () => lobbyBtn.setStyle({ color: '#ffdd00' }));
      lobbyBtn.on('pointerout', () => lobbyBtn.setStyle({ color: '#ffffff' }));
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
          const dist = Phaser.Math.Between(80, 170);
          const sz = Phaser.Math.Between(3, 7);
          const c = i % 5 === 0 ? 0xffffff : color;

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
          const dist = Phaser.Math.Between(20, 55);
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
      [W / 2, H / 2],
      [W * 0.28, H * 0.30],
      [W * 0.72, H * 0.30],
      [W * 0.20, H * 0.65],
      [W * 0.80, H * 0.65],
      [W / 2, H * 0.18],
      [W / 2, H * 0.78],
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
      x: this.scale.width - 100,
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
      gfx.fillRect(ox + 6, cy + 5 + oy, 3, 4);

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
      const { x: tx, y: ty } = this.getAttackTarget();
      this.meleeAttack(tx, ty);
    };

    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (!activeIds.has(ptr.id)) return;
      activeIds.delete(ptr.id);
      if (activeIds.size === 0) drawBtn(false);
    };

    this.input.on('pointerdown', onDown);
    this.input.on('pointerup', onUp);

    const onResize = () => drawBtn(false);
    this.scale.on('resize', onResize);
    this.events.once('shutdown', () => {
      this.input.off('pointerdown', onDown);
      this.input.off('pointerup', onUp);
      this.scale.off('resize', onResize);
    });
  }

  private createPlayerAnims(): void {
    if (!this.anims.exists('player_idle_down'))
      this.anims.create({ key: 'player_idle_down', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_left'))
      this.anims.create({ key: 'player_idle_left', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_right'))
      this.anims.create({ key: 'player_idle_right', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 24, end: 27 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_idle_up'))
      this.anims.create({ key: 'player_idle_up', frames: this.anims.generateFrameNumbers('player_idle_shadow', { start: 36, end: 39 }), frameRate: 8, repeat: -1 });
    if (!this.anims.exists('player_run_down'))
      this.anims.create({ key: 'player_run_down', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 0, end: 7 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_left'))
      this.anims.create({ key: 'player_run_left', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 8, end: 15 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_right'))
      this.anims.create({ key: 'player_run_right', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 16, end: 23 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_run_up'))
      this.anims.create({ key: 'player_run_up', frames: this.anims.generateFrameNumbers('player_run_shadow', { start: 24, end: 31 }), frameRate: 10, repeat: -1 });
    if (!this.anims.exists('player_attack_down'))
      this.anims.create({ key: 'player_attack_down', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 0, end: 7 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_left'))
      this.anims.create({ key: 'player_attack_left', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 8, end: 15 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_right'))
      this.anims.create({ key: 'player_attack_right', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 16, end: 23 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_attack_up'))
      this.anims.create({ key: 'player_attack_up', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 24, end: 31 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_down'))
      this.anims.create({ key: 'player_run_attack_down', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 0, end: 7 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_left'))
      this.anims.create({ key: 'player_run_attack_left', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 8, end: 15 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_right'))
      this.anims.create({ key: 'player_run_attack_right', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 16, end: 23 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_run_attack_up'))
      this.anims.create({ key: 'player_run_attack_up', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 24, end: 31 }), frameRate: 14, repeat: 0 });
    if (!this.anims.exists('player_hurt'))
      this.anims.create({ key: 'player_hurt', frames: this.anims.generateFrameNumbers('player_hurt', { start: 0, end: 4 }), frameRate: 14, repeat: 0 });
  }

  private createSlimeAnims(): void {
    if (this.anims.exists('slime_idle_down')) return;
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    // cols × rows: idle=6×4, walk=8×4, run=8×4, attack=10×4, hurt=5×4, death=10×4
    const defs = [
      { base: 'slime_idle', tex: 'slime_idle', cols: 6, fps: 8, repeat: -1 },
      { base: 'slime_walk', tex: 'slime_walk', cols: 8, fps: 10, repeat: -1 },
      { base: 'slime_run', tex: 'slime_run', cols: 8, fps: 14, repeat: -1 },
      { base: 'slime_attack', tex: 'slime_attack', cols: 10, fps: 10, repeat: -1 },
      { base: 'slime_hurt', tex: 'slime_hurt', cols: 5, fps: 14, repeat: 0 },
      { base: 'slime_death', tex: 'slime_death', cols: 10, fps: 8, repeat: 0 },
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



  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private generateTextures(): void {
    if (!this.textures.exists('grass')) {
      const gg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      // Base – mid-green
      gg.fillStyle(0x4e9430, 1); gg.fillRect(0, 0, 64, 64);
      // Large dark patches – give variation across the tile
      gg.fillStyle(0x3a7220, 0.45);
      gg.fillRect(0, 0, 28, 28); gg.fillRect(36, 36, 28, 28);
      gg.fillStyle(0x5caa38, 0.30);
      gg.fillRect(28, 0, 36, 32); gg.fillRect(0, 32, 32, 32);
      // Subtle warm-earth hint (gives a slight 3-D "ground" feel)
      gg.fillStyle(0x7a5c28, 0.08);
      gg.fillRect(10, 48, 44, 16);
      // Mid-tone blade clusters
      gg.fillStyle(0x68b840, 0.55);
      for (const [dx, dy, w, h] of [
        [4, 8, 3, 8], [14, 2, 2, 10], [24, 14, 3, 7], [38, 4, 2, 9], [50, 10, 3, 8],
        [6, 36, 2, 9], [18, 44, 3, 7], [30, 38, 2, 10], [44, 50, 3, 8], [58, 42, 2, 9],
        [10, 24, 3, 7], [46, 28, 2, 8], [56, 56, 3, 6], [2, 54, 2, 8], [32, 56, 3, 7],
      ] as number[][]) { gg.fillRect(dx, dy, w, h); }
      // Bright highlight blades
      gg.fillStyle(0x90d855, 0.45);
      for (const [dx, dy] of [[6, 4], [22, 16], [40, 2], [52, 18], [12, 46], [28, 52], [50, 44], [60, 30], [4, 30], [36, 22]]) {
        gg.fillRect(dx, dy, 2, 5);
      }
      // Dark shadow dots (ambient occlusion under blades)
      gg.fillStyle(0x28580e, 0.60);
      for (const [dx, dy] of [[5, 15], [15, 9], [25, 20], [39, 11], [51, 17], [7, 43], [19, 50], [31, 45], [45, 57], [57, 49], [11, 31], [47, 35], [57, 63], [3, 61], [33, 63]]) {
        gg.fillRect(dx, dy, 2, 2);
      }
      // Tiny pebbles / soil flecks
      gg.fillStyle(0x8a7050, 0.35);
      for (const [dx, dy] of [[20, 36], [44, 14], [8, 58], [56, 6], [30, 26], [60, 52]]) {
        gg.fillRect(dx, dy, 3, 2);
      }
      gg.generateTexture('grass', 64, 64);
      gg.destroy();
    }
    if (!this.textures.exists('stone')) {
      const sg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      sg.fillStyle(0x28203a, 1); sg.fillRect(0, 0, 64, 64);
      sg.fillStyle(0x1e1828, 0.55); sg.fillRect(0, 0, 30, 30); sg.fillRect(34, 34, 30, 30);
      sg.fillStyle(0x332848, 0.45); sg.fillRect(30, 0, 34, 30); sg.fillRect(0, 34, 30, 30);
      sg.lineStyle(1, 0x0c0a14, 0.85);
      sg.lineBetween(10, 4, 18, 26); sg.lineBetween(18, 26, 13, 42);
      sg.lineBetween(40, 8, 54, 28); sg.lineBetween(54, 28, 48, 52);
      sg.lineBetween(4, 46, 22, 60); sg.lineBetween(44, 44, 60, 58);
      sg.fillStyle(0x504466, 0.40);
      for (const [dx, dy] of [[8, 10], [30, 4], [54, 18], [14, 52], [44, 46], [58, 6]] as number[][])
        sg.fillRect(dx, dy, 4, 2);
      sg.generateTexture('stone', 64, 64);
      sg.destroy();
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
    if (!this.textures.exists('tree')) {
      const tg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      tg.fillStyle(0x000000, 0.22);
      tg.fillEllipse(20, 45, 24, 7);
      tg.fillStyle(0x5c3317, 1);
      tg.fillRect(16, 29, 8, 16);
      tg.fillStyle(0x7a4a2a, 1);
      tg.fillRect(17, 29, 4, 16);
      tg.fillStyle(0x2d6e1e, 1);
      tg.fillCircle(20, 23, 14);
      tg.fillStyle(0x3d8a28, 1);
      tg.fillCircle(20, 18, 11);
      tg.fillStyle(0x4da030, 1);
      tg.fillCircle(20, 13, 8);
      tg.fillStyle(0x88dd44, 0.35);
      tg.fillCircle(16, 10, 5);
      tg.generateTexture('tree', 40, 48);
      tg.destroy();
    }
    if (!this.textures.exists('rock')) {
      const rg = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      rg.fillStyle(0x000000, 0.2);
      rg.fillEllipse(14, 26, 22, 7);
      rg.fillStyle(0x6e6e6e, 1);
      rg.fillRect(4, 12, 20, 12);
      rg.fillRect(7, 8, 14, 5);
      rg.fillRect(2, 16, 4, 6);
      rg.fillRect(22, 15, 4, 7);
      rg.fillStyle(0x888888, 1);
      rg.fillRect(5, 12, 18, 10);
      rg.fillRect(8, 8, 12, 5);
      rg.fillStyle(0xaaaaaa, 0.5);
      rg.fillRect(7, 10, 6, 4);
      rg.generateTexture('rock', 28, 28);
      rg.destroy();
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