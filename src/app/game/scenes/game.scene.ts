import Phaser from 'phaser';
import { Player } from '../objects/player';
import { Boss } from '../objects/boss';
import { BossGreenSlime }  from '../objects/boss-green-slime';
import { BossRedSlime }    from '../objects/boss-red-slime';
import { BossBlueSlime }   from '../objects/boss-blue-slime';
import { BossWhiteSlime }  from '../objects/boss-white-slime';
import { BossZombieSlime } from '../objects/boss-zombie-slime';
import { BossLavaSlime }  from '../objects/boss-lava-slime';
import { MinionSlime } from '../objects/minion-slime';
import { VirtualJoystick } from '../ui/joystick';
import { PlayerStore } from '../data/player-store';
import { InventoryStore } from '../data/inventory-store';
import { SaveStore } from '../data/save-store';
import { CardStore } from '../data/card-store';
import { getMonsterDef, getCardDef, DropEntry, MonsterDef } from '../data/monster-data';
import { getElementMultiplier, ELEMENT_NAMES, ELEMENT_COLORS } from '../data/equipment-data';
import { QuestStore, STAR_HP_MULT, STAR_DROP_MULT } from '../data/quest-store';
import { ELITE_HP_MULT, ELITE_SCALE_MOD } from '../data/monster-data';

const MELEE_RANGE = 60;

interface LootDrop {
  obj: Phaser.GameObjects.Image | Phaser.GameObjects.Container;
  itemId:   string;
  itemName: string;
  qty:      number;
  cardId?:  string;   // set for card drops; pickup calls CardStore.addCard() instead
}

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private boss!: Boss;
  private joystick!: VirtualJoystick;
  private keys!: Phaser.Types.Input.Keyboard.CursorKeys & {
    w: Phaser.Input.Keyboard.Key;
    a: Phaser.Input.Keyboard.Key;
    s: Phaser.Input.Keyboard.Key;
    d: Phaser.Input.Keyboard.Key;
    space: Phaser.Input.Keyboard.Key;
  };
  private bossHpGfx!:      Phaser.GameObjects.Graphics;
  private bossHpLabel!:    Phaser.GameObjects.Text;
  private bossDebuffGfx!:  Phaser.GameObjects.Graphics;
  private bossDebuffTexts: Map<string, Phaser.GameObjects.Text> = new Map();
  private gameOver    = false;
  private teleporting = false;

  // 瞬步斬瞄準模式
  private dashAimActive = false;
  private dashAimAngle  = 0;
  private dashAimGfx?:  Phaser.GameObjects.Graphics;
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
  private bossMonsterId    = 'boss_slime_white';
  private questStar        = 1;
  private bossActive       = false;
  private lootDrops:       LootDrop[] = [];
  private exitBtnGfx!:     Phaser.GameObjects.Graphics;
  private exitBtnTxt!:     Phaser.GameObjects.Text;
  private exitBlinkTween?: Phaser.Tweens.Tween;
  private levelText!:      Phaser.GameObjects.Text;
  private expBarGfx!:      Phaser.GameObjects.Graphics;
  private pickupLog:       Phaser.GameObjects.Text[] = [];
  private playerStartX = 0;
  private playerStartY = 0;
  private readonly CORR_HW = 100;
  private auraTimer?: Phaser.Time.TimerEvent;
  private auraRing?: Phaser.GameObjects.Graphics;
  private activeFires: { x: number; y: number; r: number; expiresAt: number }[] = [];

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
    if (!this.textures.exists('slime_idle'))   this.load.spritesheet('slime_idle',   sBase + 'Slime1_Idle_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_walk'))   this.load.spritesheet('slime_walk',   sBase + 'Slime1_Walk_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_run'))    this.load.spritesheet('slime_run',    sBase + 'Slime1_Run_with_shadow.png',    cfg);
    if (!this.textures.exists('slime_attack')) this.load.spritesheet('slime_attack', sBase + 'Slime1_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime_hurt'))   this.load.spritesheet('slime_hurt',   sBase + 'Slime1_Hurt_with_shadow.png',   cfg);
    if (!this.textures.exists('slime_death'))  this.load.spritesheet('slime_death',  sBase + 'Slime1_Death_with_shadow.png',  cfg);
    const s2 = 'sprite/slime/PNG/Slime2/With_shadow/';
    if (!this.textures.exists('slime2_idle'))   this.load.spritesheet('slime2_idle',   s2 + 'Slime2_Idle_with_shadow.png',   cfg);
    if (!this.textures.exists('slime2_walk'))   this.load.spritesheet('slime2_walk',   s2 + 'Slime2_Walk_with_shadow.png',   cfg);
    if (!this.textures.exists('slime2_run'))    this.load.spritesheet('slime2_run',    s2 + 'Slime2_Run_with_shadow.png',    cfg);
    if (!this.textures.exists('slime2_attack')) this.load.spritesheet('slime2_attack', s2 + 'Slime2_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime2_hurt'))   this.load.spritesheet('slime2_hurt',   s2 + 'Slime2_Hurt_with_shadow.png',   cfg);
    if (!this.textures.exists('slime2_death'))  this.load.spritesheet('slime2_death',  s2 + 'Slime2_Death_with_shadow.png',  cfg);
    const s3 = 'sprite/slime/PNG/Slime3/With_shadow/';
    if (!this.textures.exists('slime3_idle'))   this.load.spritesheet('slime3_idle',   s3 + 'Slime3_Idle_with_shadow.png',   cfg);
    if (!this.textures.exists('slime3_walk'))   this.load.spritesheet('slime3_walk',   s3 + 'Slime3_Walk_with_shadow.png',   cfg);
    if (!this.textures.exists('slime3_run'))    this.load.spritesheet('slime3_run',    s3 + 'Slime3_Run_with_shadow.png',    cfg);
    if (!this.textures.exists('slime3_attack')) this.load.spritesheet('slime3_attack', s3 + 'Slime3_Attack_with_shadow.png', cfg);
    if (!this.textures.exists('slime3_hurt'))   this.load.spritesheet('slime3_hurt',   s3 + 'Slime3_Hurt_with_shadow.png',   cfg);
    if (!this.textures.exists('slime3_death'))  this.load.spritesheet('slime3_death',  s3 + 'Slime3_Death_with_shadow.png',  cfg);
    if (!this.textures.exists('icon_stone_broken'))  this.load.image('icon_stone_broken',  'other/ore2.webp');
    if (!this.textures.exists('icon_stone_intact'))  this.load.image('icon_stone_intact',  'other/ore1.webp');
    if (!this.textures.exists('icon_quest_reroll'))  this.load.image('icon_quest_reroll',  'other/ore4.webp');
    if (!this.textures.exists('icon_gold'))          this.load.image('icon_gold',          'other/coin.webp');
    this.generateTextures();
  }

  create(): void {
    const W = this.scale.width;
    this.gameOver = false;
    this.bossActive = false;
    this.allMinions = [];
    this.lootDrops  = [];

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


    const bossWp = this.waypoints[this.waypoints.length - 1];
    const bossDef = getMonsterDef(this.bossMonsterId)!;
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    this.boss = this.createBoss(bossDef, Math.round(bossDef.hp * hpMult));
    this.boss.arenaRadius = this.BOSS_ARENA_RADIUS;
    this.boss.arenaShape  = this.bossArenaShape;
    bossDef.fillTint ? this.boss.setTintFill(bossDef.tint) : this.boss.setTint(bossDef.tint);
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
    this.bossDebuffGfx = this.add.graphics().setScrollFactor(0).setDepth(7).setVisible(false);
    // Pre-create debuff stack labels (lazy creation inside physics callbacks causes canvas null errors)
    this.bossDebuffTexts.set('burn', this.add.text(0, 0, '', {
      fontSize: '8px', color: '#ffffff', stroke: '#000000', strokeThickness: 2, fontStyle: 'bold',
    }).setScrollFactor(0).setDepth(8).setOrigin(0.5, 0.5).setVisible(false));

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
    this.createExitButton();
    this.spawnAllMonsters();
    this.setupPortal(bossWp.x, bossWp.y);

    // 燃燒狀態 tick（400ms，處理疊層與傷害）
    this.time.addEvent({ delay: 400, repeat: -1, callback: this.tickBurns, callbackScope: this });

    // 血環被動計時器（攻速越高 tick 越快，基礎 250ms 最快 150ms）
    const scheduleAuraTick = () => {
      const spd   = 1 + CardStore.getTotalStats().atkSpeed;
      const delay = Math.max(150, Math.round(250 / spd));
      this.auraTimer = this.time.delayedCall(delay, () => { this.tickAura(); scheduleAuraTick(); });
    };
    scheduleAuraTick();

    // HP恢復計時器（每秒恢復）
    this.time.addEvent({
      delay: 1000, repeat: -1,
      callback: () => {
        const regen = CardStore.getTotalStats().hpRegen;
        if (regen > 0 && this.player.active) this.player.heal(regen);
      },
    });

    // 血環持續視覺圈圈（只有裝備血環時才顯示）
    this.auraRing = this.add.graphics().setDepth(this.player.depth - 1);
    this.tweens.add({
      targets: this.auraRing, alpha: { from: 0.25, to: 0.55 },
      duration: 900, yoyo: true, repeat: -1, ease: 'Sine.InOut',
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.auraTimer?.destroy(); this.auraRing?.destroy(); });
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
    this.checkLootPickup();

    const joy = this.joystick.value;
    let vx = joy.x;
    let vy = joy.y;

    if (this.keys.left.isDown || this.keys.a.isDown) vx = -1;
    else if (this.keys.right.isDown || this.keys.d.isDown) vx = 1;
    if (this.keys.up.isDown || this.keys.w.isDown) vy = -1;
    else if (this.keys.down.isDown || this.keys.s.isDown) vy = 1;

    const isDashBehavior = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'dashPierce';

    if (isDashBehavior) {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        this.attackDashPierce(0, 0);
      }
      if (this.dashAimActive) {
        if (Math.sqrt(vx * vx + vy * vy) > 0.15) {
          this.dashAimAngle = Math.atan2(vy, vx);
        }
        this.updateDashAimIndicator();
        if (Phaser.Input.Keyboard.JustUp(this.keys.space)) {
          this.dashAimActive = false;
          this.dashAimGfx?.destroy();
          this.dashAimGfx = undefined;
          this.executeDashPierce(this.dashAimAngle);
        }
      }
    } else {
      if (Phaser.Input.Keyboard.JustDown(this.keys.space)) {
        const { x: tx, y: ty } = this.getAttackTarget();
        this.meleeAttack(tx, ty);
      }
    }

    this.player.move(vx, vy);

    // 血環火焰圈跟著玩家
    if (this.auraRing) {
      const isAura = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'aura';
      this.auraRing.setVisible(isAura && !this.gameOver);
      if (isAura) {
        const g = this.auraRing;
        const R = this.AURA_RANGE;
        const t = this.time.now / 1000;

        // 整體繞玩家旋轉
        g.setPosition(this.player.x, this.player.y + 10);
        g.setRotation(t * 0.4);
        g.clear();

        // ── 地板效果（以 0,0 為中心繪製）──────────────────────

        // 多層同心填充
        g.fillStyle(0xdd0000, 0.28); g.fillCircle(0, 0, R);
        g.fillStyle(0xff2200, 0.22); g.fillCircle(0, 0, R * 0.7);
        g.fillStyle(0xff4400, 0.16); g.fillCircle(0, 0, R * 0.4);

        // 6 條血脈
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          g.lineStyle(2.5, 0xff3300, 0.65);
          g.beginPath();
          g.moveTo(Math.cos(a) * R * 0.08, Math.sin(a) * R * 0.08);
          g.lineTo(Math.cos(a) * R * 0.88, Math.sin(a) * R * 0.88);
          g.strokePath();
          const mid = R * 0.5, ba = a + 0.45;
          g.lineStyle(1.5, 0xff6600, 0.45);
          g.beginPath();
          g.moveTo(Math.cos(a) * mid, Math.sin(a) * mid);
          g.lineTo(Math.cos(ba) * (mid + 10), Math.sin(ba) * (mid + 10));
          g.strokePath();
        }

        // 內六邊形（反向自轉）
        const hex2 = -t * 0.95;
        const hexPts: {x:number;y:number}[] = [];
        for (let i = 0; i <= 6; i++) {
          const a = (i / 6) * Math.PI * 2 + hex2;
          hexPts.push({ x: Math.cos(a) * R * 0.48, y: Math.sin(a) * R * 0.48 });
        }
        g.lineStyle(2, 0xff6600, 0.70);
        g.strokePoints(hexPts, true);

        // 脈動內圈
        const pulse = R * 0.28 + Math.sin(t * 4) * 4;
        g.lineStyle(2, 0xff8800, 0.75 + Math.sin(t * 4) * 0.15);
        g.strokeCircle(0, 0, pulse);

        // 中心光核
        const coreA = 0.60 + Math.sin(t * 5) * 0.15;
        g.fillStyle(0xff2200, coreA);       g.fillCircle(0, 0, R * 0.14);
        g.fillStyle(0xff9955, coreA * 0.7); g.fillCircle(0, 0, R * 0.06);

        // 底圈範圍線
        g.lineStyle(2.5, 0xff4400, 0.90);
        g.strokeCircle(0, 0, R);

        // 外層大火舌（18 根）
        const N1 = 18;
        for (let i = 0; i < N1; i++) {
          const a     = (i / N1) * Math.PI * 2;
          const phase = (i / N1) * Math.PI * 4;
          const h     = 9 + Math.sin(t * 5 + phase) * 4 + Math.sin(t * 9 + phase * 1.3) * 2;
          const b1x = Math.cos(a - 0.13) * R, b1y = Math.sin(a - 0.13) * R;
          const b2x = Math.cos(a + 0.13) * R, b2y = Math.sin(a + 0.13) * R;
          const tipX = Math.cos(a) * (R + h), tipY = Math.sin(a) * (R + h);
          g.fillStyle(0xff4400, 0.55 + Math.sin(t * 7 + phase) * 0.2);
          g.fillTriangle(b1x, b1y, b2x, b2y, tipX, tipY);
        }

        // 內層小火舌（24 根）
        const N2 = 24;
        for (let i = 0; i < N2; i++) {
          const a     = ((i + 0.5) / N2) * Math.PI * 2;
          const phase = (i / N2) * Math.PI * 6;
          const h     = 4 + Math.sin(t * 8 - phase) * 2.5;
          const b1x = Math.cos(a - 0.08) * (R - 1), b1y = Math.sin(a - 0.08) * (R - 1);
          const b2x = Math.cos(a + 0.08) * (R - 1), b2y = Math.sin(a + 0.08) * (R - 1);
          const tipX = Math.cos(a) * (R + h), tipY = Math.sin(a) * (R + h);
          g.fillStyle(0xffaa00, 0.4 + Math.sin(t * 10 + phase) * 0.2);
          g.fillTriangle(b1x, b1y, b2x, b2y, tipX, tipY);
        }
      }
    }

    // Y-sort: use foot position so objects sort at ground level
    this.player.setDepth(this.player.y + 30);
    if (this.bossActive) this.boss.setDepth(this.boss.y + 20);
    for (const m of this.allMinions) {
      if (!m.isDead) m.setDepth(m.y + 16);
    }
  }

  // ── Attack dispatcher ────────────────────────────────────

  private meleeAttack(tx: number, ty: number): void {
    const behavior = PlayerStore.getEquipped().sword?.behavior ?? 'slash180';
    if (behavior === 'aura') return;
    switch (behavior) {
      case 'whirlwind':   this.attackWhirlwind(tx, ty);  break;
      case 'dashPierce':  this.attackDashPierce(tx, ty); break;
      case 'projectile':  this.attackProjectile(tx, ty); break;
      case 'multiHit':    this.attackMultiHit(tx, ty);   break;
      case 'chargeSlam':  this.attackChargeSlam(tx, ty); break;
      case 'boomerang':   this.attackBoomerang(tx, ty);  break;
      case 'magicFire':   this.attackMagicFire(tx, ty);  break;
      default:            this.attackSlash180(tx, ty);
    }
  }

  // ── Unified damage helpers ────────────────────────────────

  private getHittableTargets(): Array<MinionSlime | Boss> {
    const out: Array<MinionSlime | Boss> = this.allMinions.filter(m => !m.isDead) as Array<MinionSlime | Boss>;
    if (this.bossActive && this.boss.active) out.push(this.boss);
    return out;
  }

  private dealDamage(
    target:      MinionSlime | Boss,
    dmgMult:     number,
    srcX:        number, srcY: number,
    dir:         'down' | 'left' | 'right' | 'up',
    attackElem:  import('../data/equipment-data').Element = 'none',
  ): void {
    const stats    = CardStore.getTotalStats();
    const isCrit   = Math.random() < stats.crit;
    const elemMult = (target === this.boss) ? getElementMultiplier(attackElem, this.boss.element) : 1;
    const dmg      = Math.round(stats.atk * Phaser.Math.FloatBetween(0.85, 1.15) * dmgMult * (isCrit ? (1 + stats.critDmg) : 1) * elemMult);
    target.takeDamage(dmg);
    target.knockback(srcX, srcY);
    if (stats.lifesteal > 0) this.player.heal(Math.round(dmg * stats.lifesteal));
    this.spawnDamageNumber(target.x, target.y, dmg, isCrit, elemMult);
  }

  private hitInArea(
    ox: number, oy: number,
    range: number,
    dmgMult: number,
    arcDeg: number,           // 360 = 全向
    facingDeg: number,
    dir: 'down' | 'left' | 'right' | 'up',
  ): void {
    const halfArc = arcDeg / 2;
    const inArc   = (ex: number, ey: number) => {
      if (arcDeg >= 360) return true;
      const a = Phaser.Math.RadToDeg(Math.atan2(ey - oy, ex - ox));
      return Math.abs(Phaser.Math.Angle.ShortestBetween(facingDeg, a)) <= halfArc;
    };
    for (const t of this.getHittableTargets()) {
      if (Phaser.Math.Distance.Between(ox, oy, t.x, t.y) > range) continue;
      if (!inArc(t.x, t.y)) continue;
      this.dealDamage(t, dmgMult, ox, oy, dir);
    }
  }

  private resolveAttackDir(range: number): { dir: 'down'|'left'|'right'|'up'; deg: number; rad: number; tx: number; ty: number } {
    const radMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    const degMap: Record<string, number> = { right: 0, down: 90, left: 180, up: 270 };
    const candidates = [
      ...this.allMinions.filter(m => !m.isDead),
      ...(this.bossActive && this.boss.active ? [this.boss] : []),
    ].filter(m => Phaser.Math.Distance.Between(this.player.x, this.player.y, m.x, m.y) <= range)
     .sort((a, b) =>
       Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y) -
       Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y));

    if (candidates.length > 0) {
      const { dir, deg, rad } = this.attackDir(candidates[0].x, candidates[0].y);
      return { dir, deg, rad, tx: candidates[0].x, ty: candidates[0].y };
    }
    const dir = this.player.lastDir;
    return { dir, deg: degMap[dir], rad: radMap[dir], tx: this.player.x + Math.cos(radMap[dir]), ty: this.player.y + Math.sin(radMap[dir]) };
  }

  private attackDir(tx: number, ty: number): { dir: 'down'|'left'|'right'|'up'; deg: number; rad: number } {
    const dx = tx - this.player.x, dy = ty - this.player.y;
    const dir: 'down'|'left'|'right'|'up' =
      Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
    const degMap = { right: 0, down: 90, left: 180, up: 270 };
    return { dir, deg: degMap[dir], rad: Math.atan2(dy, dx) };
  }

  // ── 基本攻擊 slash180 ─────────────────────────────────────

  private attackSlash180(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const cd = Math.round(650 / (1 + stats.atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    const { dir, deg, tx, ty } = this.resolveAttackDir(MELEE_RANGE * 3);
    const arc = stats.attackArc;
    this.player.playAttack(tx, ty, () => {
      const px  = this.player.x, py = this.player.y;
      const D   = this.player.depth;
      const sa  = Phaser.Math.DegToRad(deg - arc / 2);
      const ea  = Phaser.Math.DegToRad(deg + arc / 2);
      const R   = MELEE_RANGE;
      const R2  = R * 0.62;   // 內弧半徑（月牙厚度）

      // 月牙多邊形頂點（外弧 + 內弧）
      const buildCrescent = (outerR: number, innerR: number, steps = 28) => {
        const pts: { x: number; y: number }[] = [];
        for (let i = 0; i <= steps; i++) {
          const a = sa + (ea - sa) * (i / steps);
          pts.push({ x: px + Math.cos(a) * outerR, y: py + Math.sin(a) * outerR });
        }
        for (let i = steps; i >= 0; i--) {
          const a = sa + (ea - sa) * (i / steps);
          pts.push({ x: px + Math.cos(a) * innerR, y: py + Math.sin(a) * innerR });
        }
        return pts;
      };

      // 傷害判定：跟動畫同步，掃到哪打到哪
      const hitTargets = new Set<object>();
      const checkSweepHit = (curEa: number) => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          const dx = t.x - px, dy = t.y - py;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > R) continue;
          // 判斷角度是否已被掃到
          let tAngle = Math.atan2(dy, dx);
          // 把 tAngle 正規化到 sa~ea 範圍內比較
          while (tAngle < sa - 0.01) tAngle += Math.PI * 2;
          if (tAngle > curEa + 0.01) continue;
          hitTargets.add(t);
          this.dealDamage(t, 1.0, px, py, dir);
        }
      };

      // 1. 刀氣主體（月牙形，掃入動畫）
      const slashState = { prog: 0 };
      const slashG = this.add.graphics().setDepth(D + 2);
      this.tweens.add({
        targets: slashState, prog: 1, duration: 80, ease: 'Quad.Out',
        onUpdate: () => {
          const curEa = sa + (ea - sa) * slashState.prog;
          checkSweepHit(curEa);
          slashG.clear();
          const steps  = Math.max(4, Math.round(28 * slashState.prog));
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i <= steps; i++) {
            const a = sa + (curEa - sa) * (i / steps);
            pts.push({ x: px + Math.cos(a) * R, y: py + Math.sin(a) * R });
          }
          for (let i = steps; i >= 0; i--) {
            const a = sa + (curEa - sa) * (i / steps);
            pts.push({ x: px + Math.cos(a) * R2, y: py + Math.sin(a) * R2 });
          }
          // 外暈
          slashG.fillStyle(0x5599ff, 0.18);
          slashG.fillPoints(pts.map(p => ({ x: p.x + 3, y: p.y + 3 })), true);
          // 主體藍白月牙
          slashG.fillStyle(0xaaddff, 0.55);
          slashG.fillPoints(pts, true);
          // 亮邊（外弧描線）
          slashG.lineStyle(2.5, 0xffffff, 0.9);
          slashG.beginPath();
          for (let i = 0; i <= steps; i++) {
            const a = sa + (curEa - sa) * (i / steps);
            const x = px + Math.cos(a) * R, y = py + Math.sin(a) * R;
            i === 0 ? slashG.moveTo(x, y) : slashG.lineTo(x, y);
          }
          slashG.strokePath();
          // 次亮邊（內弧）
          slashG.lineStyle(1.2, 0xddeeff, 0.55);
          slashG.beginPath();
          for (let i = 0; i <= steps; i++) {
            const a = sa + (curEa - sa) * (i / steps);
            const x = px + Math.cos(a) * R2, y = py + Math.sin(a) * R2;
            i === 0 ? slashG.moveTo(x, y) : slashG.lineTo(x, y);
          }
          slashG.strokePath();
        },
        onComplete: () => {
          // 刀氣淡出
          this.tweens.add({ targets: slashG, alpha: 0, duration: 140, ease: 'Quad.In', onComplete: () => slashG.destroy() });
        },
      });

      // 2. 殘影（月牙完整形，稍大稍偏，延遲出現後快速消散）
      const afterPts = buildCrescent(R * 1.06, R2 * 0.92);
      const afterG   = this.add.graphics().setDepth(D + 1).setAlpha(0);
      afterG.fillStyle(0x3366cc, 0.30); afterG.fillPoints(afterPts, true);
      afterG.lineStyle(1.5, 0x88bbff, 0.50);
      afterG.beginPath();
      for (let i = 0; i <= 28; i++) {
        const a = sa + (ea - sa) * (i / 28);
        const x = px + Math.cos(a) * R * 1.06, y = py + Math.sin(a) * R * 1.06;
        i === 0 ? afterG.moveTo(x, y) : afterG.lineTo(x, y);
      }
      afterG.strokePath();
      this.tweens.add({ targets: afterG, alpha: 1, duration: 60, delay: 80,
        onComplete: () => this.tweens.add({ targets: afterG, alpha: 0, duration: 200, onComplete: () => afterG.destroy() }) });

      // 3. 外弧邊緣光粒子（沿外弧均勻散開）
      const sparkG = this.add.graphics().setDepth(D + 3);
      const SPARKS = 10;
      const sparks = Array.from({ length: SPARKS }, (_, i) => {
        const a  = sa + (ea - sa) * (i / (SPARKS - 1));
        const dr = Phaser.Math.FloatBetween(8, 20);
        return { x: px + Math.cos(a) * R, y: py + Math.sin(a) * R,
                 vx: Math.cos(a) * dr, vy: Math.sin(a) * dr, a: 0.9 };
      });
      const sparkState = { t: 0 };
      this.tweens.add({
        targets: sparkState, t: 1, duration: 300,
        onUpdate: () => {
          sparkG.clear();
          sparks.forEach(s => {
            s.x += s.vx * 0.08; s.y += s.vy * 0.08; s.a *= 0.90;
            sparkG.fillStyle(0xffffff, s.a * 0.9); sparkG.fillCircle(s.x, s.y, 2.2);
            sparkG.fillStyle(0x88ccff, s.a * 0.5); sparkG.fillCircle(s.x, s.y, 4);
          });
        },
        onComplete: () => sparkG.destroy(),
      });

      // 4. 起揮中心閃光
      const flashG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
      flashG.fillStyle(0xffffff, 0.55); flashG.fillCircle(0, 0, 10);
      flashG.fillStyle(0x88ccff, 0.30); flashG.fillCircle(0, 0, 20);
      this.tweens.add({ targets: flashG, alpha: 0, duration: 180, onComplete: () => flashG.destroy() });
    });
  }

  // ── 旋風斬 whirlwind ──────────────────────────────────────

  private attackWhirlwind(_tx: number, _ty: number): void {
    const cd = Math.round(650 / (1 + CardStore.getTotalStats().atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    const RANGE = Math.round(MELEE_RANGE * 1.1);
    const px = this.player.x, py = this.player.y;
    const D  = this.player.depth;
    this.player.playWhirlwind(() => {
      this.hitInArea(px, py, RANGE, 0.8, 360, 0, 'down');

      // ── 旋風視覺效果 ────────────────────────────────────

      // 1. 三層錯開衝擊環
      for (let i = 0; i < 3; i++) {
        const rs = { r: RANGE * (0.15 + i * 0.12), a: 1.0 - i * 0.2 };
        const rG = this.add.graphics().setDepth(D + 1).setPosition(px, py);
        this.tweens.add({
          targets: rs, r: RANGE * (1.05 + i * 0.18), a: 0,
          duration: 420 + i * 70, delay: i * 55, ease: 'Quad.Out',
          onUpdate: () => {
            rG.clear();
            rG.lineStyle(3.5 - i, i === 0 ? 0xffffff : 0x66aaff, rs.a);
            rG.strokeCircle(0, 0, rs.r);
            if (i === 0) {
              rG.lineStyle(8, 0x2255cc, rs.a * 0.18);
              rG.strokeCircle(0, 0, rs.r);
            }
          },
          onComplete: () => rG.destroy(),
        });
      }

      // 2. 四條螺旋臂向外展開
      const spiralG = this.add.graphics().setDepth(D + 2).setPosition(px, py);
      const sp = { prog: 0 };
      this.tweens.add({
        targets: sp, prog: 1, duration: 220, ease: 'Cubic.Out',
        onUpdate: () => {
          spiralG.clear();
          const ARMS = 4, STEPS = 22;
          for (let arm = 0; arm < ARMS; arm++) {
            const base = (arm / ARMS) * Math.PI * 2;
            const color = arm % 2 === 0 ? 0x88ccff : 0xcceeff;
            spiralG.lineStyle(2.2, color, 0.85 * (1 - sp.prog * 0.45));
            spiralG.beginPath();
            for (let s = 0; s <= STEPS; s++) {
              const t  = (s / STEPS) * sp.prog;
              const a  = base + t * Math.PI * 1.6;
              const r  = t * RANGE * 0.95;
              if (s === 0) spiralG.moveTo(Math.cos(a) * r, Math.sin(a) * r);
              else         spiralG.lineTo(Math.cos(a) * r, Math.sin(a) * r);
            }
            spiralG.strokePath();
          }
        },
        onComplete: () => {
          this.tweens.add({ targets: spiralG, alpha: 0, duration: 180, onComplete: () => spiralG.destroy() });
        },
      });

      // 3. 中心強光閃現
      const flashG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
      flashG.fillStyle(0xffffff, 0.7);  flashG.fillCircle(0, 0, 14);
      flashG.fillStyle(0x88ddff, 0.45); flashG.fillCircle(0, 0, 30);
      flashG.fillStyle(0x2255cc, 0.20); flashG.fillCircle(0, 0, RANGE * 0.6);
      this.tweens.add({ targets: flashG, alpha: 0, duration: 260, ease: 'Quad.In', onComplete: () => flashG.destroy() });
    });
  }

  // ── 瞬步斬 dashPierce ─────────────────────────────────────

  private calcDashEndpoint(sx: number, sy: number, rad: number): { x: number; y: number } {
    const DASH = 78, PAD = 32, STEP = 4, PW = 10, PH = 8;
    let endX = Phaser.Math.Clamp(sx + Math.cos(rad) * DASH, PAD, this.worldW - PAD);
    let endY = Phaser.Math.Clamp(sy + Math.sin(rad) * DASH, PAD, this.worldH - PAD);
    const steps = Math.ceil(Phaser.Math.Distance.Between(sx, sy, endX, endY) / STEP);
    const dx = (endX - sx) / steps, dy = (endY - sy) / steps;
    let safeX = sx, safeY = sy;
    const walls = this.wallGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (let i = 1; i <= steps; i++) {
      const tx = sx + dx * i, ty = sy + dy * i;
      if (walls.some(w => {
        const b = w.body as Phaser.Physics.Arcade.StaticBody;
        return tx + PW >= b.x && tx - PW <= b.x + b.width &&
               ty + PH >= b.y && ty - PH <= b.y + b.height;
      })) break;
      safeX = tx; safeY = ty;
    }
    return { x: safeX, y: safeY };
  }

  private updateDashAimIndicator(): void {
    const g = this.dashAimGfx;
    if (!g) return;
    g.clear();
    const sx = this.player.x, sy = this.player.y;
    const rad = this.dashAimAngle;
    const { x: endX, y: endY } = this.calcDashEndpoint(sx, sy, rad);
    const totalDist = Phaser.Math.Distance.Between(sx, sy, endX, endY);

    // 虛線箭桿
    const SEG = 7, GAP = 4;
    let d = 12;
    while (d < totalDist - 10) {
      const t1 = d / totalDist, t2 = Math.min((d + SEG) / totalDist, 1);
      g.lineStyle(2, 0x66aaff, 0.75);
      g.lineBetween(sx + (endX - sx) * t1, sy + (endY - sy) * t1,
                    sx + (endX - sx) * t2, sy + (endY - sy) * t2);
      d += SEG + GAP;
    }

    // 箭頭
    const perp = rad + Math.PI / 2;
    const AL = 11, AW = 6;
    g.fillStyle(0x88ccff, 0.95);
    g.fillTriangle(
      endX, endY,
      endX - Math.cos(rad) * AL + Math.cos(perp) * AW, endY - Math.sin(rad) * AL + Math.sin(perp) * AW,
      endX - Math.cos(rad) * AL - Math.cos(perp) * AW, endY - Math.sin(rad) * AL - Math.sin(perp) * AW,
    );

    // 落點圓圈
    g.fillStyle(0xaaddff, 0.28);
    g.fillCircle(endX, endY, 11);
    g.lineStyle(1.5, 0x88ccff, 0.85);
    g.strokeCircle(endX, endY, 11);
  }

  private attackDashPierce(_tx: number, _ty: number): void {
    const cd = Math.round(650 / (1 + CardStore.getTotalStats().atkSpeed));
    if (!this.player.lockCooldown(cd)) return;
    const dirMap: Record<string, number> = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
    this.dashAimAngle  = dirMap[this.player.lastDir];
    this.dashAimActive = true;
    if (!this.dashAimGfx) this.dashAimGfx = this.add.graphics().setDepth(this.player.depth + 2);
  }

  private executeDashPierce(rad: number): void {
    const dir = this.player.lastDir;
    this.player.startAttackAnim(`player_attack_${dir}`);
    const sx = this.player.x, sy = this.player.y;
    const { x: endX, y: endY } = this.calcDashEndpoint(sx, sy, rad);
    const hitTargets = new Set<object>();
    const D = this.player.depth;

    // ── 動態光波尾跡（亮頭掃過路徑）────────────────────
    const perpRad = rad + Math.PI / 2;
    const trailG  = this.add.graphics().setDepth(D);
    const sweep   = { t: 0 };
    this.tweens.add({
      targets: sweep, t: 1, duration: 160, ease: 'Quad.Out',
      onUpdate: () => {
        trailG.clear();
        const hx = sx + (endX - sx) * sweep.t;
        const hy = sy + (endY - sy) * sweep.t;
        // 尾跡：沿路徑畫漸層光點（近頭部越亮越大）
        const STEPS = 14;
        for (let i = 0; i <= STEPS; i++) {
          const f  = i / STEPS;
          const tx = sx + (hx - sx) * f, ty = sy + (hy - sy) * f;
          trailG.fillStyle(0x2255cc, f * 0.22); trailG.fillCircle(tx, ty, 10 + f * 5);
          trailG.fillStyle(0x66aaff, f * 0.45); trailG.fillCircle(tx, ty,  5 + f * 3);
        }
        // 中心細線
        trailG.lineStyle(1.5, 0xddeeff, 0.75);
        trailG.lineBetween(sx, sy, hx, hy);
        // 頭部亮核
        trailG.fillStyle(0xffffff, 0.95); trailG.fillCircle(hx, hy, 3.5);
        trailG.fillStyle(0x99ddff, 0.55); trailG.fillCircle(hx, hy, 9);
        // 頭部垂直波紋（2 條，間距不同）
        [10, 16].forEach((len, idx) => {
          trailG.lineStyle(1.5 - idx * 0.5, 0xaaddff, 0.75 - idx * 0.3);
          trailG.lineBetween(
            hx + Math.cos(perpRad) * len, hy + Math.sin(perpRad) * len,
            hx - Math.cos(perpRad) * len, hy - Math.sin(perpRad) * len,
          );
        });
      },
      onComplete: () => {
        this.tweens.add({ targets: trailG, alpha: 0, duration: 240, onComplete: () => trailG.destroy() });
      },
    });

    // ── 衝擊環（以終點為原點展開）───────────────────────
    this.time.delayedCall(130, () => {
      const ringG = this.add.graphics().setDepth(D + 1).setPosition(endX, endY);
      const state = { r: 6, a: 0.85 };
      this.tweens.add({
        targets: state, r: 40, a: 0, duration: 320, ease: 'Quad.Out',
        onUpdate: () => {
          ringG.clear();
          ringG.lineStyle(3, 0x88ccff, state.a);
          ringG.strokeCircle(0, 0, state.r);
          ringG.lineStyle(1.2, 0xffffff, state.a * 0.5);
          ringG.strokeCircle(0, 0, state.r + 4);
        },
        onComplete: () => ringG.destroy(),
      });
    });

    // ── 衝刺 + 傷害判定 ──────────────────────────────────
    this.tweens.add({
      targets: this.player, x: endX, y: endY, duration: 160, ease: 'Quad.Out',
      onUpdate: () => {
        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          if (Phaser.Math.Distance.Between(this.player.x, this.player.y, t.x, t.y) > 28) continue;
          hitTargets.add(t);
          this.dealDamage(t, 0.91, this.player.x, this.player.y, dir);
        }
      },
    });
  }

  // ── 刀風 projectile ───────────────────────────────────────

  private attackProjectile(_tx: number, _ty: number): void {
    const SPEED = 380, MAX_DIST = 155;
    const { dir, rad } = this.resolveAttackDir(240);

    const stats0 = CardStore.getTotalStats();
    const cd = Math.round(650 / (1 + stats0.atkSpeed));
    if (!this.player.lockCooldown(cd)) return;

    const hitTargets = new Set<object>();
    this.player.startAttackAnim(`player_attack_${dir}`);
    const HIT_R = 18;

    const buildCrescent = (outerR: number, innerR: number, ox: number): { x: number; y: number }[] => {
      const steps = 32;
      const sa = -115 * Math.PI / 180, ea = 115 * Math.PI / 180;
      const outer: { x: number; y: number }[] = [];
      const inner: { x: number; y: number }[] = [];
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * i / steps;
        outer.push({ x: Math.cos(a) * outerR, y: Math.sin(a) * outerR });
      }
      for (let i = steps; i >= 0; i--) {
        const a = sa + (ea - sa) * i / steps;
        inner.push({ x: ox + Math.cos(a) * innerR, y: Math.sin(a) * innerR });
      }
      return [...outer, ...inner];
    };

    const proj  = this.add.graphics().setDepth(this.player.depth + 1);
    const trail = this.add.graphics().setDepth(this.player.depth);
    proj.setPosition(this.player.x, this.player.y);
    proj.setRotation(rad);
    trail.setRotation(rad);

    const trailHistory: { x: number; y: number }[] = [];

    // 出手閃光
    const launchFlash = this.add.graphics().setDepth(this.player.depth + 2);
    launchFlash.fillStyle(0xffdd44, 0.55);
    launchFlash.fillCircle(this.player.x, this.player.y, 20);
    this.tweens.add({ targets: launchFlash, alpha: 0, duration: 160, onComplete: () => launchFlash.destroy() });

    const drawProj = (t: number) => {
      if (!proj.active) return;
      proj.clear();

      // 外層擴散光暈
      proj.fillStyle(0xffee44, 0.07);
      proj.fillCircle(0, 0, 28);
      proj.fillStyle(0xffcc00, 0.13);
      proj.fillCircle(0, 0, 21);

      // 半月主體（由外到內三層）
      proj.fillStyle(0xff9900, 0.20);
      proj.fillPoints(buildCrescent(20, 0, 0), true);       // 最外暈
      proj.fillStyle(0xffaa00, 0.95);
      proj.fillPoints(buildCrescent(18, 11, 8), true);      // 主體深金
      proj.fillStyle(0xffdd55, 0.65);
      proj.fillPoints(buildCrescent(18, 11, 8), true);      // 亮金疊加
      proj.fillStyle(0xffffff, 0.35);
      proj.fillPoints(buildCrescent(17, 13, 9), true);      // 白色薄邊高光

      // 前緣亮線
      const steps = 32, sa = -115 * Math.PI / 180, ea = 115 * Math.PI / 180;
      proj.lineStyle(2, 0xffffff, 0.95);
      proj.beginPath();
      for (let i = 0; i <= steps; i++) {
        const a = sa + (ea - sa) * i / steps;
        i === 0 ? proj.moveTo(Math.cos(a) * 18, Math.sin(a) * 18)
                : proj.lineTo(Math.cos(a) * 18, Math.sin(a) * 18);
      }
      proj.strokePath();

      // 能量光點（沿弧面閃爍）
      for (let i = 0; i < 4; i++) {
        const a  = sa + (ea - sa) * (i / 3);
        const sp = 0.55 + Math.sin(t * 0.018 + i * 1.3) * 0.35;
        proj.fillStyle(0xffffff, sp);
        proj.fillCircle(Math.cos(a) * 18, Math.sin(a) * 18, 2);
      }
    };

    const updateTrail = () => {
      if (!trail.active) return;
      // 轉換到 trail 的本地坐標（trail 跟 proj 同 rotation，位置用 world）
      trailHistory.push({ x: proj.x, y: proj.y });
      if (trailHistory.length > 10) trailHistory.shift();
      trail.clear();
      trailHistory.forEach((p, i) => {
        const frac  = i / trailHistory.length;
        const alpha = frac * 0.45;
        const r     = frac * 10 + 3;
        trail.fillStyle(0xffaa00, alpha);
        trail.fillCircle(p.x, p.y, r);
        trail.fillStyle(0xffee88, alpha * 0.5);
        trail.fillCircle(p.x, p.y, r * 0.5);
      });
    };

    let elapsed = 0;
    let traveled = 0;
    const tickMs  = 16;
    const stepPx  = SPEED * tickMs / 1000;

    const cleanup = () => {
      trail.destroy();
      if (proj.active) proj.destroy();
    };

    this.time.addEvent({
      delay: tickMs,
      repeat: Math.ceil(MAX_DIST / stepPx),
      callback: () => {
        if (!proj.active) return;
        elapsed  += tickMs;
        traveled += stepPx;
        proj.x += Math.cos(rad) * stepPx;
        proj.y += Math.sin(rad) * stepPx;

        drawProj(elapsed);
        updateTrail();

        for (const t of this.getHittableTargets()) {
          if (hitTargets.has(t)) continue;
          if (Phaser.Math.Distance.Between(proj.x, proj.y, t.x, t.y) > HIT_R) continue;
          hitTargets.add(t);
          this.dealDamage(t, 0.55, proj.x, proj.y, dir);
        }
        if (traveled >= MAX_DIST) cleanup();
      },
    });
  }

  // ── 多段連擊 multiHit ─────────────────────────────────────

  private attackMultiHit(_tx: number, _ty: number): void {
    const stats = CardStore.getTotalStats();
    const spd   = 1 + stats.atkSpeed;
    const cd    = Math.round(650 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir, deg } = this.resolveAttackDir(MELEE_RANGE * 3);
    const arc    = stats.attackArc;
    const rootMs = Math.round(450 / spd);
    this.player.setRooted(rootMs);
    this.player.startAttackAnim(`player_multihit_${dir}`);

    // 五連斬：弧形刀光，從弧中心向兩端掃出，帶隨機擾動
    const rad0   = Phaser.Math.DegToRad(deg);
    const DELAYS = [55, 115, 175, 235, 310];
    const baseCfgs = [
      { tilt: -0.38, arcSpan: 1.0, rMult: 0.78, color: 0x66aaee, glowW:  8 },
      { tilt:  0.38, arcSpan: 1.0, rMult: 0.78, color: 0x66aaee, glowW:  8 },
      { tilt: -0.18, arcSpan: 1.2, rMult: 0.88, color: 0x99ccff, glowW: 11 },
      { tilt:  0.18, arcSpan: 1.2, rMult: 0.88, color: 0x99ccff, glowW: 11 },
      { tilt:  0,    arcSpan: 1.6, rMult: 0.97, color: 0xffffff,  glowW: 16 },
    ];

    DELAYS.map(d => Math.round(d / spd)).forEach((delay, hitIdx) => {
      this.time.delayedCall(delay, () => {
        const px = this.player.x, py = this.player.y;
        const D  = this.player.depth;
        this.hitInArea(px, py, MELEE_RANGE, 0.29, arc, deg, dir);

        const b        = baseCfgs[hitIdx];
        const tilt     = b.tilt    + Phaser.Math.FloatBetween(-0.12, 0.12);
        const span     = b.arcSpan + Phaser.Math.FloatBetween(-0.12, 0.12);
        const r        = MELEE_RANGE * (b.rMult + Phaser.Math.FloatBetween(-0.06, 0.06));
        const midAngle = rad0 + tilt;
        const halfSpan = span / 2 + Phaser.Math.FloatBetween(-0.06, 0.06);
        const slashRot = Phaser.Math.FloatBetween(-Math.PI / 6, Math.PI / 6); // ±30° 傾斜
        const STEPS    = 20;

        const drawArcSegment = (g: Phaser.GameObjects.Graphics, prog: number, alpha: number) => {
          const sa   = midAngle - halfSpan * prog;
          const ea   = midAngle + halfSpan * prog;
          const rOut = r;
          const rIn  = r * 0.38;

          // 弧心（用來當旋轉基點）
          const arcCx = px + Math.cos(midAngle) * (rOut + rIn) / 2;
          const arcCy = py + Math.sin(midAngle) * (rOut + rIn) / 2;
          const cosR  = Math.cos(slashRot), sinR = Math.sin(slashRot);
          const rot2d = (x: number, y: number) => {
            const dx = x - arcCx, dy = y - arcCy;
            return new Phaser.Math.Vector2(arcCx + dx * cosR - dy * sinR, arcCy + dx * sinR + dy * cosR);
          };

          // 建立楔形多邊形（外弧 + 內弧反向，點先旋轉）
          const outerPts: Phaser.Math.Vector2[] = [];
          const innerPts: Phaser.Math.Vector2[] = [];
          for (let i = 0; i <= STEPS; i++) {
            const angle = sa + (ea - sa) * (i / STEPS);
            outerPts.push(rot2d(px + Math.cos(angle) * rOut, py + Math.sin(angle) * rOut));
            innerPts.push(rot2d(px + Math.cos(angle) * rIn,  py + Math.sin(angle) * rIn));
          }
          const wedgePts = [...outerPts, ...[...innerPts].reverse()];

          // 楔形填色（帶角度感的刀光體）
          g.fillStyle(b.color, 0.13 * alpha);
          g.fillPoints(wedgePts, true);

          // 外弧輝光描邊（多層）
          const strokeArc = (pts: Phaser.Math.Vector2[], w: number, col: number, a: number) => {
            g.lineStyle(w, col, a * alpha);
            g.beginPath();
            pts.forEach((p, i) => i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y));
            g.strokePath();
          };
          strokeArc(outerPts, b.glowW + 12, b.color,   0.08);
          strokeArc(outerPts, b.glowW,      b.color,   0.32);
          strokeArc(outerPts, b.glowW * 0.45, 0xddeeff, 0.72);
          strokeArc(outerPts, 2.2,           0xffffff,  1.0);

          // 內弧亮邊（強調刀根）
          strokeArc(innerPts, 1.5, 0xffffff, 0.45);

          // 掃出前端亮點（兩端 outer）
          g.fillStyle(0xffffff, 0.9 * alpha);
          g.fillCircle(outerPts[0].x, outerPts[0].y, 3);
          g.fillCircle(outerPts[STEPS].x, outerPts[STEPS].y, 3);
        };

        const slG  = this.add.graphics().setDepth(D + 3);
        const sw   = { prog: 0 };
        const hold = 450 - DELAYS[hitIdx] - 35;  // 持續到僵直結束

        // 掃出階段（35ms）
        this.tweens.add({
          targets: sw, prog: 1, duration: 35, ease: 'Cubic.Out',
          onUpdate: () => { slG.clear(); drawArcSegment(slG, sw.prog, 1); },
          onComplete: () => {
            // 持續→淡出
            const fa = { a: 1.0 };
            this.tweens.add({
              targets: fa, a: 0, duration: hold, ease: 'Quad.In',
              onUpdate: () => { slG.clear(); drawArcSegment(slG, 1, fa.a); },
              onComplete: () => slG.destroy(),
            });
          },
        });

        // 起揮閃光（玩家中心）
        const fG = this.add.graphics().setDepth(D + 4).setPosition(px, py);
        fG.fillStyle(0xffffff, 0.55 + hitIdx * 0.08); fG.fillCircle(0, 0, 5 + hitIdx);
        fG.fillStyle(b.color,  0.30);                  fG.fillCircle(0, 0, 11 + hitIdx * 2);
        this.tweens.add({ targets: fG, alpha: 0, duration: 120, onComplete: () => fG.destroy() });

        // 第五刀：額外衝擊環
        if (hitIdx === 4) {
          const ringState = { r: 8, a: 0.9 };
          const ringG = this.add.graphics().setDepth(D + 2).setPosition(
            px + Math.cos(rad0) * MELEE_RANGE * 0.7,
            py + Math.sin(rad0) * MELEE_RANGE * 0.7,
          );
          this.tweens.add({
            targets: ringState, r: 38, a: 0, duration: 280, ease: 'Quad.Out',
            onUpdate: () => {
              ringG.clear();
              ringG.lineStyle(3, 0xffffff, ringState.a);
              ringG.strokeCircle(0, 0, ringState.r);
              ringG.lineStyle(7, 0x88ccff, ringState.a * 0.25);
              ringG.strokeCircle(0, 0, ringState.r);
            },
            onComplete: () => ringG.destroy(),
          });
        }
      });
    });
  }

  // ── 迴旋飛刃 boomerang ────────────────────────────────────

  private attackBoomerang(_tx: number, _ty: number): void {
    const spd = 1 + CardStore.getTotalStats().atkSpeed;
    const cd  = Math.round(1500 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir, rad } = this.resolveAttackDir(240);
    this.player.startAttackAnim(`player_attack_${dir}`);

    const HIT_R    = 14;
    const SPIN_R   = 26;   // 旋轉傷害範圍（原 HIT_R+8=22，+20%）
    const MAX_DIST = 160;
    const SPIN_MS  = Math.round(800 / spd);
    const destX    = this.player.x + Math.cos(rad) * MAX_DIST;
    const destY    = this.player.y + Math.sin(rad) * MAX_DIST;

    const blade = this.add.graphics().setDepth(this.player.depth + 1);
    blade.setPosition(this.player.x, this.player.y);
    const trail = this.add.graphics().setDepth(this.player.depth);
    const trailPts: { x: number; y: number; alpha: number }[] = [];

    let rot = 0;

    const drawBlade = () => {
      if (!blade.active) return;
      blade.clear();
      // outer diffuse glow — capped at HIT_R boundary
      blade.fillStyle(0x1144cc, 0.10);
      blade.fillCircle(0, 0, HIT_R + 2);
      blade.fillStyle(0x3377ff, 0.20);
      blade.fillCircle(0, 0, HIT_R - 2);
      // pulsing energy ring exactly at HIT_R
      const pulse = 0.45 + Math.sin(rot * 5) * 0.2;
      blade.lineStyle(1.5, 0x99ddff, pulse);
      blade.strokeCircle(0, 0, HIT_R);
      // 3-wing blade body — tips reach exactly HIT_R
      for (let w = 0; w < 3; w++) {
        const ba  = rot + (w / 3) * Math.PI * 2;
        const tipX = Math.cos(ba) * HIT_R;
        const tipY = Math.sin(ba) * HIT_R;
        const lX  = Math.cos(ba + 0.52) * HIT_R * 0.43;
        const lY  = Math.sin(ba + 0.52) * HIT_R * 0.43;
        const rX  = Math.cos(ba - 0.52) * HIT_R * 0.43;
        const rY  = Math.sin(ba - 0.52) * HIT_R * 0.43;
        const cX  = Math.cos(ba + Math.PI) * HIT_R * 0.15;
        const cY  = Math.sin(ba + Math.PI) * HIT_R * 0.15;
        // blade shadow (depth)
        blade.fillStyle(0x112244, 0.6);
        blade.fillTriangle(tipX * 0.9, tipY * 0.9, lX, lY, cX, cY);
        blade.fillTriangle(tipX * 0.9, tipY * 0.9, rX, rY, cX, cY);
        // blade body (steel blue)
        blade.fillStyle(0x88ccff, 0.95);
        blade.fillTriangle(tipX, tipY, lX, lY, cX, cY);
        blade.fillTriangle(tipX, tipY, rX, rY, cX, cY);
        // bright edge highlight
        blade.fillStyle(0xeef8ff, 0.85);
        blade.fillTriangle(
          tipX, tipY,
          (tipX + lX) * 0.55, (tipY + lY) * 0.55,
          (tipX + cX) * 0.55, (tipY + cY) * 0.55,
        );
      }
      // center gem
      blade.fillStyle(0x3366cc, 1);
      blade.fillCircle(0, 0, 5);
      blade.fillStyle(0xaaddff, 1);
      blade.fillCircle(0, 0, 3);
      blade.fillStyle(0xffffff, 1);
      blade.fillCircle(0, 0, 1.5);
    };

    const updateTrail = () => {
      if (!trail.active) return;
      trailPts.push({ x: blade.x, y: blade.y, alpha: 0.55 });
      if (trailPts.length > 14) trailPts.shift();
      trail.clear();
      trailPts.forEach((p, i) => {
        p.alpha *= 0.80;
        const sz = (i / trailPts.length) * 7 + 1;
        trail.fillStyle(0x55aaff, p.alpha);
        trail.fillCircle(p.x, p.y, sz);
      });
    };

    const spinTicker = this.time.addEvent({
      delay: 16, repeat: -1,
      callback: () => { rot += 0.22; drawBlade(); updateTrail(); },
    });
    drawBlade();

    // 出手閃光
    const launchFlash = this.add.graphics().setDepth(this.player.depth + 2);
    launchFlash.fillStyle(0x99ddff, 0.65);
    launchFlash.fillCircle(this.player.x, this.player.y, 22);
    this.tweens.add({ targets: launchFlash, alpha: 0, duration: 200, onComplete: () => launchFlash.destroy() });

    const hitOut  = new Set<object>();
    const hitBack = new Set<object>();

    const checkHit = (hitSet: Set<object>, dmgMult: number, onFirstHit?: () => void) => {
      const bx = blade.x, by = blade.y;
      let hit = false;
      for (const t of this.getHittableTargets()) {
        if (hitSet.has(t)) continue;
        if (Phaser.Math.Distance.Between(bx, by, t.x, t.y) > HIT_R) continue;
        hitSet.add(t);
        hit = true;
        this.dealDamage(t, dmgMult, bx, by, dir);
      }
      if (hit) onFirstHit?.();
    };

    // 旋轉並折返（命中停止飛行後、或飛到終點後都會呼叫）
    let spinStarted = false;
    const startSpin = () => {
      if (spinStarted) return;
      spinStarted = true;
      const sx = blade.x, sy = blade.y;

      const spinOrb = this.add.graphics().setDepth(this.player.depth);
      let orbRot = 0;
      const orbTicker = this.time.addEvent({
        delay: 16, repeat: -1,
        callback: () => {
          if (!spinOrb.active) return;
          spinOrb.clear();
          orbRot += 0.10;
          for (let i = 0; i < 4; i++) {
            const a  = orbRot + (i / 4) * Math.PI * 2;
            const ox = sx + Math.cos(a) * (SPIN_R);
            const oy = sy + Math.sin(a) * (SPIN_R);
            const brightness = 0.4 + Math.sin(orbRot * 3 + i) * 0.3;
            spinOrb.fillStyle(0x66bbff, brightness);
            spinOrb.fillCircle(ox, oy, 3.5);
          }
          const rp = 0.3 + Math.sin(orbRot * 6) * 0.15;
          spinOrb.lineStyle(1.5, 0x99eeff, rp);
          spinOrb.strokeCircle(sx, sy, SPIN_R);
        },
      });

      const spinDmg = this.time.addEvent({
        delay: Math.round(SPIN_MS / 4), repeat: 3,
        callback: () => { if (blade.active) this.hitInArea(blade.x, blade.y, SPIN_R, 0.30, 360, 0, dir); },
      });

      this.time.delayedCall(SPIN_MS, () => {
        spinDmg.destroy();
        orbTicker.destroy();
        spinOrb.destroy();
        trailPts.length = 0;

        // 折返閃光
        const retFlash = this.add.graphics().setDepth(this.player.depth + 2);
        retFlash.fillStyle(0xffffff, 0.45);
        retFlash.fillCircle(sx, sy, SPIN_R);
        this.tweens.add({ targets: retFlash, alpha: 0, duration: 140, onComplete: () => retFlash.destroy() });

        // 飛回
        this.tweens.add({
          targets: blade, x: this.player.x, y: this.player.y, duration: 260, ease: 'Quad.In',
          onUpdate: () => { if (blade.active) checkHit(hitBack, 0.60); },
          onComplete: () => {
            spinTicker.destroy();
            trail.destroy();
            if (blade.active) blade.destroy();
            // 接住閃光
            const catchFlash = this.add.graphics().setDepth(this.player.depth + 2);
            catchFlash.fillStyle(0x99ddff, 0.75);
            catchFlash.fillCircle(this.player.x, this.player.y, 20);
            this.tweens.add({ targets: catchFlash, alpha: 0, duration: 200, onComplete: () => catchFlash.destroy() });
          },
        });
      });
    };

    // 飛出：命中時立即停止並旋轉
    const outTween = this.tweens.add({
      targets: blade, x: destX, y: destY, duration: 320, ease: 'Linear',
      onUpdate: () => checkHit(hitOut, 0.60, () => { outTween.stop(); startSpin(); }),
      onComplete: () => startSpin(),
    });
  }

  // ── 魔法火 magicFire ─────────────────────────────────────

  private attackMagicFire(_tx: number, _ty: number): void {
    const spd = 1 + CardStore.getTotalStats().atkSpeed;
    const cd  = Math.round(1100 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir, rad } = this.resolveAttackDir(240);
    this.player.startAttackAnim(`player_attack_${dir}`);

    const SPEED    = 300;
    const MAX_DIST = 180;
    const ORB_R    = 14;
    const FIRE_R   = 25;
    const FIRE_DUR = 3000;

    const orb = this.add.graphics().setDepth(this.player.depth + 1);
    orb.setPosition(this.player.x, this.player.y);
    let orbT = 0;

    const drawOrb = () => {
      if (!orb.active) return;
      orb.clear();
      const p = Math.sin(orbT / 80) * 2;
      const r = ORB_R * 0.5;
      orb.fillStyle(0xff4400, 0.30); orb.fillCircle(0, 0, r + 3 + p * 0.5);
      orb.fillStyle(0xff6600, 0.90); orb.fillCircle(0, 0, r);
      orb.fillStyle(0xffaa00, 0.85); orb.fillCircle(0, 0, r * 0.65);
      orb.fillStyle(0xffee66, 0.90); orb.fillCircle(-1, -1, r * 0.32);
    };
    const orbAnim = this.time.addEvent({ delay: 16, repeat: -1, callback: () => { orbT += 16; drawOrb(); } });
    drawOrb();

    const spawnFire = (fx: number, fy: number) => {
      orbAnim.destroy();
      if (orb.active) orb.destroy();

      // 落地衝擊閃光
      const flash = this.add.graphics().setDepth(15);
      flash.fillStyle(0xff8800, 0.55); flash.fillCircle(fx, fy, FIRE_R);
      flash.fillStyle(0xffcc44, 0.45); flash.fillCircle(fx, fy, FIRE_R * 0.6);
      this.tweens.add({ targets: flash, alpha: 0, duration: 280, onComplete: () => flash.destroy() });

      // 預計算焦痕裂紋（靜態，不閃爍）
      const cracks: { a1: number; r1: number; a2: number; r2: number }[] = [];
      for (let i = 0; i < 9; i++) {
        cracks.push({
          a1: (i / 9) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2),
          r1: FIRE_R * Phaser.Math.FloatBetween(0.05, 0.2),
          a2: (i / 9) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4),
          r2: FIRE_R * Phaser.Math.FloatBetween(0.55, 0.95),
        });
      }

      const fire = this.add.graphics().setDepth(3);
      let fireT = 0;

      const drawWavy = (r: number, amp: number, freq: number, phase: number, color: number, alpha: number) => {
        const pts: { x: number; y: number }[] = [];
        const steps = 22;
        for (let i = 0; i <= steps; i++) {
          const a    = (i / steps) * Math.PI * 2;
          const wave = r * (1 + Math.sin(a * freq + phase) * amp);
          pts.push({ x: fx + Math.cos(a) * wave, y: fy + Math.sin(a) * wave });
        }
        fire.fillStyle(color, alpha);
        fire.fillPoints(pts, true);
      };

      const fireAnim = this.time.addEvent({
        delay: 16, repeat: -1,
        callback: () => {
          if (!fire.active) return;
          fireT += 16;
          fire.clear();

          // 焦黑地面
          fire.fillStyle(0x0d0200, 0.85);
          fire.fillCircle(fx, fy, FIRE_R + 3);

          // 焦痕裂紋
          for (const c of cracks) {
            fire.lineStyle(1, 0x3a0800, 0.5);
            fire.beginPath();
            fire.moveTo(fx + Math.cos(c.a1) * c.r1, fy + Math.sin(c.a1) * c.r1);
            fire.lineTo(fx + Math.cos(c.a2) * c.r2, fy + Math.sin(c.a2) * c.r2);
            fire.strokePath();
          }

          // 波浪火焰層（由外到內）
          const t = fireT * 0.001;
          drawWavy(FIRE_R,        0.10, 4, t * 4.5,  0x881000, 0.75);
          drawWavy(FIRE_R * 0.80, 0.12, 5, t * 5.5 + 1, 0xcc2200, 0.70);
          drawWavy(FIRE_R * 0.60, 0.13, 4, t * 7.0 + 2, 0xff4400, 0.75);
          drawWavy(FIRE_R * 0.42, 0.11, 3, t * 9.0 + 0.5, 0xff7700, 0.80);
          drawWavy(FIRE_R * 0.25, 0.09, 3, t * 11  + 1.5, 0xffaa00, 0.85);

          // 中心亮核
          const pulse = Math.sin(fireT / 90) * 0.08;
          fire.fillStyle(0xffdd44, 0.9);
          fire.fillCircle(fx, fy, FIRE_R * (0.12 + pulse));
          fire.fillStyle(0xffffff, 0.6);
          fire.fillCircle(fx, fy, FIRE_R * 0.05);

          // 環繞火星（6顆，各自不同速度與相位）
          for (let i = 0; i < 6; i++) {
            const ea = (i / 6) * Math.PI * 2 + t * (i % 2 === 0 ? 3 : -4);
            const er = FIRE_R * (0.28 + Math.sin(fireT / 140 + i * 1.1) * 0.12);
            const ea2 = 0.55 + Math.sin(fireT / 80 + i * 0.8) * 0.3;
            fire.fillStyle(0xffee66, ea2);
            fire.fillCircle(fx + Math.cos(ea) * er, fy + Math.sin(ea) * er, 2.5);
          }
        },
      });

      // 註冊火焰區域，tickBurns 會用來判斷疊層
      const fireEntry = { x: fx, y: fy, r: FIRE_R, expiresAt: this.time.now + FIRE_DUR };
      this.activeFires.push(fireEntry);

      // 出現瞬間立即疊 1 層
      const now = this.time.now;
      for (const m of this.allMinions) {
        if (!m.isDead && Phaser.Math.Distance.Between(fx, fy, m.x, m.y) <= FIRE_R)
          m.applyBurn(now);
      }
      if (this.bossActive && this.boss.active &&
          Phaser.Math.Distance.Between(fx, fy, this.boss.x, this.boss.y) <= FIRE_R)
        this.boss.applyBurn(now);

      this.time.delayedCall(FIRE_DUR - 400, () => {
        this.tweens.add({
          targets: fire, alpha: 0, duration: 400,
          onComplete: () => { fireAnim.destroy(); fire.destroy(); },
        });
      });
    };

    let traveled = 0;
    const tickMs = 16;
    const stepPx = SPEED * tickMs / 1000;
    let hit = false;

    this.time.addEvent({
      delay: tickMs,
      repeat: Math.ceil(MAX_DIST / stepPx) + 1,
      callback: () => {
        if (!orb.active || hit) return;
        traveled += stepPx;
        orb.x += Math.cos(rad) * stepPx;
        orb.y += Math.sin(rad) * stepPx;
        for (const t of this.getHittableTargets()) {
          if (hit) break;
          if (Phaser.Math.Distance.Between(orb.x, orb.y, t.x, t.y) > ORB_R) continue;
          hit = true;
          this.dealDamage(t, 0.50, orb.x, orb.y, dir, 'fire');
          spawnFire(orb.x, orb.y);
          return;
        }
        if (traveled >= MAX_DIST && !hit) { hit = true; spawnFire(orb.x, orb.y); }
      },
    });
  }

  // ── 血環 aura（被動，每 0.25 秒） ────────────────────────────

  private readonly AURA_RANGE = 56;

  private tickBurns(): void {
    if (this.gameOver) return;
    const now   = this.time.now;
    const stats = CardStore.getTotalStats();

    // 清除過期火焰
    this.activeFires = this.activeFires.filter(f => now < f.expiresAt);

    // 對踩在任意火焰內的敵人疊 1 層（不重複疊加）
    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(m.x, m.y, f.x, f.y) <= f.r))
        m.applyBurn(now);
    }
    if (this.bossActive && this.boss.active) {
      if (this.activeFires.some(f => Phaser.Math.Distance.Between(this.boss.x, this.boss.y, f.x, f.y) <= f.r))
        this.boss.applyBurn(now);
    }

    // 造成燃燒傷害
    for (const m of this.allMinions) {
      if (m.isDead || m.burnStacks <= 0) continue;
      if (now >= m.burnExpiresAt) { m.burnStacks = 0; continue; }
      const isCrit = Math.random() < stats.crit;
      const dmg = Math.round(stats.atk * 0.032 *m.burnStacks * (isCrit ? (1 + stats.critDmg) : 1));
      m.takeDamage(dmg);
      this.spawnDamageNumber(m.x, m.y, dmg, isCrit, 1);
    }
    if (this.bossActive && this.boss.active && this.boss.burnStacks > 0) {
      if (now >= this.boss.burnExpiresAt) { this.boss.burnStacks = 0; this.refreshBossBar(); return; }
      const isCrit   = Math.random() < stats.crit;
      const elemMult = getElementMultiplier('fire', this.boss.element);
      const dmg = Math.round(stats.atk * 0.032 *this.boss.burnStacks * (isCrit ? (1 + stats.critDmg) : 1) * elemMult);
      this.boss.takeDamage(dmg);
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, isCrit, elemMult);
      this.refreshBossBar();
    }
  }

  private tickAura(): void {
    if (this.gameOver) return;
    if ((PlayerStore.getEquipped().sword?.behavior ?? 'slash180') !== 'aura') return;

    const RANGE   = this.AURA_RANGE;
    const stats   = CardStore.getTotalStats();
    const baseDmg = this.player.maxHpValue * 0.075;
    const px = this.player.x, py = this.player.y;

    for (const m of this.allMinions) {
      if (m.isDead) continue;
      if (Phaser.Math.Distance.Between(px, py, m.x, m.y) > RANGE) continue;
      const isCrit = Math.random() < stats.crit;
      const dmg    = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1));
      m.takeDamage(dmg);
      this.spawnDamageNumber(m.x, m.y, dmg, isCrit, 1);
    }
    if (this.bossActive && this.boss.active &&
        Phaser.Math.Distance.Between(px, py, this.boss.x, this.boss.y) <= RANGE) {
      const isCrit   = Math.random() < stats.crit;
      const elemMult = getElementMultiplier('none', this.boss.element);
      const dmg      = Math.round(baseDmg * Phaser.Math.FloatBetween(0.9, 1.1) * (isCrit ? (1 + stats.critDmg) : 1) * elemMult);
      this.boss.takeDamage(dmg);
      this.spawnDamageNumber(this.boss.x, this.boss.y, dmg, isCrit, elemMult);
    }
  }

  // ── 蓄力重擊 chargeSlam ───────────────────────────────────

  private attackChargeSlam(_tx: number, _ty: number): void {
    const spd  = 1 + CardStore.getTotalStats().atkSpeed;
    const cd   = Math.round(650 / spd);
    if (!this.player.lockCooldown(cd)) return;

    const { dir } = this.resolveAttackDir(MELEE_RANGE * 3);
    const SLAM_RANGE = MELEE_RANGE * 1.152;
    this.player.speedMult   = 0.4;
    this.player.noInterrupt = true;

    // ── 蓄力視覺 ──────────────────────────────────────────────
    const chargeGfx = this.add.graphics().setDepth(this.player.depth + 1);
    let chargeT = 0;
    const updateCharge = () => {
      if (!chargeGfx.active) return;
      chargeT += 16;
      const prog = Math.min(chargeT / cd, 1);
      chargeGfx.clear();
      // 外層暈（隨蓄力擴大）
      const outerR = 8 + prog * 28;
      chargeGfx.lineStyle(3, 0xffaa00, 0.25 + prog * 0.35);
      chargeGfx.strokeCircle(this.player.x, this.player.y, outerR);
      // 中層（微脈動）
      const pulse = Math.sin(chargeT / 80) * 3;
      chargeGfx.lineStyle(2, 0xffdd44, 0.5 + prog * 0.4);
      chargeGfx.strokeCircle(this.player.x, this.player.y, 10 + pulse + prog * 12);
      // 內核小點
      chargeGfx.fillStyle(0xffffff, 0.6 + prog * 0.4);
      chargeGfx.fillCircle(this.player.x, this.player.y, 3 + prog * 3);
    };
    const chargeTicker = this.time.addEvent({ delay: 16, repeat: Math.ceil(cd / 16), callback: updateCharge });

    this.time.delayedCall(cd, () => {
      this.player.speedMult   = 1;
      this.player.noInterrupt = false;
      chargeTicker.destroy();
      chargeGfx.destroy();

      this.player.startAttackAnim(`player_attack_${dir}`);
      this.time.delayedCall(150, () => {
        const px = this.player.x, py = this.player.y;

        // ── 衝擊波視覺 ────────────────────────────────────────
        const R = SLAM_RANGE;

        // 地面殘影（最底層）
        const ground = this.add.graphics().setDepth(this.player.depth);
        ground.fillStyle(0xffcc00, 0.12);
        ground.fillCircle(px, py, R);
        this.tweens.add({ targets: ground, alpha: 0, duration: 500, onComplete: () => ground.destroy() });

        // 放射裂縫線（8條，長度到 R）
        const cracks = this.add.graphics().setDepth(this.player.depth + 1);
        for (let i = 0; i < 8; i++) {
          const a  = (i / 8) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
          const r1 = R * 0.25;
          const r2 = R * Phaser.Math.FloatBetween(0.75, 1.0);
          cracks.lineStyle(2, 0xffee88, 0.9);
          cracks.beginPath();
          cracks.moveTo(px + Math.cos(a) * r1, py + Math.sin(a) * r1);
          cracks.lineTo(px + Math.cos(a) * r2, py + Math.sin(a) * r2);
          cracks.strokePath();
          // 支線
          const midA = a + Phaser.Math.FloatBetween(-0.4, 0.4);
          const midR = r1 + (r2 - r1) * 0.5;
          cracks.lineStyle(1, 0xffee88, 0.5);
          cracks.beginPath();
          cracks.moveTo(px + Math.cos(a) * midR, py + Math.sin(a) * midR);
          cracks.lineTo(px + Math.cos(midA) * (midR + 12), py + Math.sin(midA) * (midR + 12));
          cracks.strokePath();
        }
        this.tweens.add({ targets: cracks, alpha: 0, duration: 400, delay: 80, onComplete: () => cracks.destroy() });

        // 金色厚主環（半徑 0 → R，線寬固定 5px）
        const ring1 = this.add.graphics().setDepth(this.player.depth + 2);
        this.tweens.addCounter({
          from: 0, to: R, duration: 320, ease: 'Expo.Out',
          onUpdate: t => {
            const r = t.getValue() ?? 0, a = 1 - r / R;
            ring1.clear();
            ring1.lineStyle(5, 0xffaa00, a);
            ring1.strokeCircle(px, py, r);
          },
          onComplete: () => ring1.destroy(),
        });

        // 白色細快環（半徑 0 → R*0.9）
        const ring2 = this.add.graphics().setDepth(this.player.depth + 3);
        this.tweens.addCounter({
          from: 0, to: R * 0.9, duration: 180, ease: 'Expo.Out',
          onUpdate: t => {
            const r = t.getValue() ?? 0, a = 1 - r / (R * 0.9);
            ring2.clear();
            ring2.lineStyle(2, 0xffffff, a);
            ring2.strokeCircle(px, py, r);
          },
          onComplete: () => ring2.destroy(),
        });

        // 中心爆閃（固定大小，不超出 R）
        const flashR = Math.min(16, R * 0.2);
        const flash = this.add.graphics().setDepth(this.player.depth + 4);
        this.tweens.addCounter({
          from: 0, to: flashR, duration: 200, ease: 'Quad.Out',
          onUpdate: t => {
            const r = t.getValue() ?? 0, a = 1 - r / flashR;
            flash.clear();
            flash.fillStyle(0xffffff, a);
            flash.fillCircle(px, py, r);
          },
          onComplete: () => flash.destroy(),
        });

        this.hitInArea(px, py, SLAM_RANGE, 1.235, 360, 0, dir);

        // debug: 命中範圍
        const dbg = this.add.graphics().setDepth(this.player.depth + 3);
        dbg.lineStyle(2, 0xff4444, 0.9);
        dbg.strokeCircle(px, py, SLAM_RANGE);
        this.tweens.add({ targets: dbg, alpha: 0, duration: 350, onComplete: () => dbg.destroy() });
      });
    });
  }

  // ── Map / Monster Setup ───────────────────────────────

  private handleMinionDrop(monsterId: string, x: number, y: number): void {
    const def = getMonsterDef(monsterId);
    if (!def) return;
    this.spawnLoot(x, y, def.drops);
    if (Math.random() < def.cardDropRate) this.spawnCardDrop(x, y, def.cardId);
    const gained = PlayerStore.addExp(def.exp);
    if (gained > 0) this.showLevelUp(PlayerStore.getLevel());
  }

  private generateWaypoints(): void {
    const PAD = 500;
    let cx = 0, cy = 0;
    let dir = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const raw: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(cx, cy)];
    for (let i = 0; i < Phaser.Math.Between(3, 5); i++) {
      dir += Phaser.Math.FloatBetween(-Math.PI * 0.5, Math.PI * 0.5);
      const dist = Phaser.Math.Between(600, 800);
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
    // Use accepted quest boss; fall back to random
    const questBossId = QuestStore.getAcceptedQuest()?.bossId;
    const BOSS_POOL = [
      'boss_slime_green', 'boss_slime_red', 'boss_slime_blue', 'boss_slime_white',
      'boss_zombie_slime', 'boss_lava_slime',
    ];
    this.bossMonsterId = questBossId ?? BOSS_POOL[Phaser.Math.Between(0, BOSS_POOL.length - 1)];
    this.questStar     = QuestStore.getAcceptedQuest()?.star ?? 1;
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

  private createBoss(bossDef: MonsterDef, totalHp: number): Boss {
    const cx = this.bossArenaCenter.x, cy = this.bossArenaCenter.y;
    if (bossDef.id === 'boss_slime_green') {
      const b = new BossGreenSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSummonElite = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_green', x, y, true);
      };
      b.onPoisonTick = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= r * r) this.player.takeDamage(dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_red') {
      const b = new BossRedSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onJumpHit = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= r * r) this.player.takeDamage(dmg);
      };
      b.onFanHit = (bx, by, angle, half, range, dmg) => {
        if (!this.bossActive) return;
        const dx  = this.player.x - bx;
        const dy  = this.player.y - by;
        const dst = Math.sqrt(dx * dx + dy * dy);
        if (dst > range) return;
        const playerAngle = Math.atan2(dy, dx);
        const diff = Phaser.Math.Angle.Wrap(playerAngle - angle);
        if (Math.abs(diff) <= half) this.player.takeDamage(dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_blue') {
      const b = new BossBlueSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSpikeHit = (x, y, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= 18 * 18) this.player.takeDamage(dmg);
      };
      b.onMineExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq > r * r) return;
        this.player.takeDamage(dmg);
        this.player.speedMult = 0.4;
        this.player.setTint(0x88ccff);
        this.time.delayedCall(2000, () => {
          this.player.speedMult = 1;
          this.player.clearTint();
        });
      };
      return b;
    }
    if (bossDef.id === 'boss_slime_white') {
      const b = new BossWhiteSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onCrossHit = (dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
      };
      b.onOrbExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= r * r) this.player.takeDamage(dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_zombie_slime') {
      const b = new BossZombieSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onSummonZombie = (x, y) => {
        if (!this.bossActive) return;
        this.spawnMinionAt('elite_slime_zombie', x, y, true);
      };
      b.onPoisonFanHit = (dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
      };
      return b;
    }
    if (bossDef.id === 'boss_lava_slime') {
      const b = new BossLavaSlime(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
      b.onBarrageHit = (dmg) => {
        if (!this.bossActive) return;
        this.player.takeDamage(dmg);
      };
      b.onPillarExplode = (x, y, r, dmg) => {
        if (!this.bossActive) return;
        const dSq = Phaser.Math.Distance.BetweenPointsSquared({ x, y }, this.player);
        if (dSq <= r * r) this.player.takeDamage(dmg);
      };
      return b;
    }
    return new Boss(this, cx, cy, totalHp, bossDef.element, bossDef.spriteKey, bossDef.tint);
  }

  private spawnMinionAt(defId: string, wx: number, wy: number, isElite: boolean): void {
    const def = getMonsterDef(defId);
    if (!def) return;
    const hpMult = STAR_HP_MULT[this.questStar] ?? 1;
    const hp  = Math.round(def.hp * hpMult * (isElite ? ELITE_HP_MULT : 1));
    const atk = Math.round(def.atk * hpMult * (isElite ? 1.5 : 1));
    const a   = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const r   = Phaser.Math.FloatBetween(20, 60);
    const m   = new MinionSlime(this, wx + Math.cos(a) * r, wy + Math.sin(a) * r, hp, def.spriteKey, def.tint);
    m.atk = atk;
    if (isElite) {
      m.isElite = true;
      m.setScale(m.scaleX * ELITE_SCALE_MOD, m.scaleY * ELITE_SCALE_MOD);
      m.setTintFill(def.tint);
    }
    m.setPatrolCenter(wx, wy);
    m.getTargetPos = () => [this.player.x, this.player.y];
    m.onDead = () => this.handleMinionDrop(defId, m.x, m.y);
    this.allMinions.push(m);
    this.physics.add.collider(m, this.wallGroup);
    this.physics.add.overlap(m, this.player, () => {
      if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk);
    });
    m.start();
  }

  private spawnAllMonsters(): void {
    const BOSS_TO_MINION: Record<string, string> = {
      boss_slime_green:  'slime_green_s',
      boss_slime_red:    'slime_red_s',
      boss_slime_blue:   'slime_blue_s',
      boss_slime_white:  'slime_white_s',
      boss_zombie_slime: 'slime_zombie_s',
      boss_lava_slime:   'slime_lava_s',
    };
    const MINION_TO_ELITE: Record<string, string> = {
      slime_green_s:  'elite_slime_green',
      slime_red_s:    'elite_slime_red',
      slime_blue_s:   'elite_slime_blue',
      slime_white_s:  'elite_slime_white',
      slime_zombie_s: 'elite_slime_zombie',
      slime_lava_s:   'elite_slime_lava',
    };
    const GENERAL_POOL = ['slime_green_s', 'slime_red_s', 'slime_blue_s', 'slime_white_s'];

    const mainMinionId = BOSS_TO_MINION[this.bossMonsterId];
    const otherPool    = GENERAL_POOL.filter(id => id !== mainMinionId);
    const hpMult       = STAR_HP_MULT[this.questStar] ?? 1;

    // 每星級數量 × 1.3^(star-1)
    const countMult = Math.pow(1.15, this.questStar - 1);

    const spawnMinion = (defId: string, wx: number, wy: number, isElite: boolean) => {
      const def = getMonsterDef(defId);
      if (!def) return;
      const hp  = Math.round(def.hp * hpMult * (isElite ? ELITE_HP_MULT : 1));
      const atk = Math.round(def.atk * hpMult * (isElite ? 1.5 : 1));
      const a   = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const r   = Phaser.Math.FloatBetween(60, 160);
      const m   = new MinionSlime(this, wx + Math.cos(a) * r, wy + Math.sin(a) * r, hp, def.spriteKey, def.tint);
      m.atk = atk;
      if (isElite) {
        m.isElite = true;
        m.setScale(m.scaleX * ELITE_SCALE_MOD, m.scaleY * ELITE_SCALE_MOD);
        m.setTintFill(def.tint);   // 填色讓菁英外觀更突出
      }
      m.setPatrolCenter(wx, wy);
      m.getTargetPos = () => [this.player.x, this.player.y];
      m.onDead = () => this.handleMinionDrop(defId, m.x, m.y);
      this.allMinions.push(m);
      this.physics.add.collider(m, this.wallGroup);
      this.physics.add.overlap(m, this.player, () => {
        if (!m.isDead && m.isDashing) this.player.takeDamage(m.atk);
      });
    };

    const spawnAt = (wx: number, wy: number) => {
      const baseCount = Phaser.Math.Between(8, 15);
      const count     = Math.round(baseCount * countMult);
      for (let j = 0; j < count; j++) {
        const minionId = (mainMinionId && Math.random() < 0.7)
          ? mainMinionId
          : otherPool[Phaser.Math.Between(0, otherPool.length - 1)];
        const eliteId  = mainMinionId ? MINION_TO_ELITE[minionId] : undefined;
        const goElite  = !!eliteId && Math.random() < 0.12;
        spawnMinion(goElite ? eliteId! : minionId, wx, wy, goElite);
      }
    };

    // waypoints：跳過第一個（出生點）和最後一個（Boss 傳送門）
    for (let i = 1; i < this.waypoints.length - 1; i++) {
      spawnAt(this.waypoints[i].x, this.waypoints[i].y);
    }

    // 轉角點：40% 機率生怪，製造偶爾的重疊感，跳過首尾
    for (let i = 1; i < this.cornerPts.length - 1; i++) {
      if (Math.random() < 0.4) {
        const c = this.cornerPts[i];
        spawnAt(c.x, c.y);
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
        this.bossDebuffGfx.setVisible(true);
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
    this.bossHpLabel.setText(`${getMonsterDef(this.bossMonsterId)?.name ?? '???'}${elemTag}  ${this.boss.currentHp}/${this.boss.maxHpValue}`);
    this.bossHpLabel.setPosition(W / 2, by - 14);

    this.drawBossDebuffIcons(by + bh + 10);
  }

  private drawBossDebuffIcons(iconY: number): void {
    this.bossDebuffGfx.clear();
    const { width: W } = this.scale;
    const now  = this.time.now;
    let   slot = 0;

    if (this.boss.burnStacks > 0 && now < this.boss.burnExpiresAt) {
      const cx = W / 2 - 100 + slot * 20;
      this.drawBossDebuffIcon(cx, iconY, 'burn', 0xff4400, 0x220800);
      this.updateBossDebuffText('burn', cx, iconY, `${this.boss.burnStacks}`);
      slot++;
    } else {
      this.hideBossDebuffText('burn');
    }
  }

  private drawBossDebuffIcon(cx: number, cy: number, key: string, rimColor: number, bgColor: number): void {
    const r = 8;
    this.bossDebuffGfx.fillStyle(rimColor, 0.3);
    this.bossDebuffGfx.fillCircle(cx, cy, r + 2);
    this.bossDebuffGfx.fillStyle(bgColor, 0.92);
    this.bossDebuffGfx.fillCircle(cx, cy, r);
    this.bossDebuffGfx.lineStyle(1.5, rimColor, 0.9);
    this.bossDebuffGfx.strokeCircle(cx, cy, r);
    if (key === 'burn') {
      const s = r * 0.55;
      const t = this.time.now / 220;
      const w = Math.sin(t) * 0.5;
      this.bossDebuffGfx.fillStyle(0xff6600, 1);
      this.bossDebuffGfx.fillTriangle(cx - s + w, cy + s, cx + s + w, cy + s, cx, cy - s * 1.3);
      this.bossDebuffGfx.fillStyle(0xffdd00, 1);
      this.bossDebuffGfx.fillTriangle(cx - s * 0.45, cy + s * 0.4, cx + s * 0.45, cy + s * 0.4, cx, cy - s * 1.1);
    }
  }

  private updateBossDebuffText(key: string, cx: number, cy: number, label: string): void {
    const txt = this.bossDebuffTexts.get(key);
    if (!txt) return;
    txt.setPosition(cx, cy + 6).setText(label).setVisible(true);
  }

  private hideBossDebuffText(key: string): void {
    this.bossDebuffTexts.get(key)?.setVisible(false);
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
    // Quest completion
    const questCompleted = QuestStore.completeQuestByBoss(this.bossMonsterId);

    // Loot drops on the ground
    const bossDef = getMonsterDef(this.bossMonsterId);
    if (bossDef) {
      const dropMult = STAR_DROP_MULT[this.questStar] ?? 1;
      const scaledDrops = bossDef.drops.map(d => ({ ...d, rate: Math.min(1, d.rate * dropMult) }));
      this.spawnLoot(this.boss.x, this.boss.y, scaledDrops);
      if (Math.random() < bossDef.cardDropRate) this.spawnCardDrop(this.boss.x, this.boss.y, bossDef.cardId);
    }

    // Exp (no gold — gold comes from quest claim)
    const expGain = Phaser.Math.Between(25, 50);
    const bossLevelsGained = PlayerStore.addExp(expGain);
    if (bossLevelsGained > 0) this.showLevelUp(PlayerStore.getLevel());
    SaveStore.save();

    // Floating victory message
    const W = this.scale.width;
    const line1 = questCompleted ? '任務完成！返回大廳領取賞金' : 'Boss 討伐成功！';
    const msg = this.add.text(W / 2, 54, line1, {
      fontSize: '14px', color: '#ffe066', stroke: '#000000', strokeThickness: 3,
    }).setScrollFactor(0).setDepth(300).setOrigin(0.5);
    this.tweens.add({
      targets: msg, alpha: 0, delay: 3000, duration: 800,
      onComplete: () => msg.destroy(),
    });

    // Exit button blinks to guide player out
    this.startExitBlink();
  }

  private handlePlayerDead(): void {
    this.gameOver = true;
    this.player.setActive(false).setVisible(false);
    this.showEndScreen(false);
  }

  // ── Exit button ───────────────────────────────────────

  private createExitButton(): void {
    const W  = this.scale.width;
    const bw = 72, bh = 28, pad = 8;
    const bx = W - pad - bw;
    const by = pad;
    const cx = bx + bw / 2;
    const cy = by + bh / 2;

    const g = this.add.graphics().setScrollFactor(0).setDepth(200);
    g.fillStyle(0x3a1010, 0.92);
    g.fillRoundedRect(bx, by, bw, bh, 6);
    g.lineStyle(2, 0xaa2222, 1);
    g.strokeRoundedRect(bx, by, bw, bh, 6);
    this.exitBtnGfx = g;

    this.exitBtnTxt = this.add.text(cx, cy, '✕ 退出', {
      fontSize: '11px', color: '#ee4444', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(201);

    const hit = this.add.rectangle(cx, cy, bw, bh)
      .setScrollFactor(0).setDepth(202).setInteractive({ useHandCursor: true });
    hit.on('pointerdown', () => this.exitToLobby());
  }

  private startExitBlink(): void {
    if (this.exitBlinkTween) return;
    this.exitBlinkTween = this.tweens.add({
      targets: [this.exitBtnGfx, this.exitBtnTxt],
      alpha: { from: 0.35, to: 1.0 },
      duration: 380,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  private exitToLobby(): void {
    SaveStore.save();
    this.scene.start('PrepScene');
  }

  // ── Loot drop system ──────────────────────────────────

  private spawnCardDrop(cx: number, cy: number, cardId: string): void {
    const ox = Phaser.Math.Between(-18, 18);
    const oy = Phaser.Math.Between(-8, 8);
    const tx = cx + ox;
    const ty = cy + oy + 18;

    const cardDef = getCardDef(cardId);
    const monDef  = cardDef ? getMonsterDef(cardDef.monsterId) : null;
    const isBoss  = (monDef?.tier ?? 0) >= 5;
    const CW = 16, CH = 20;

    const cnt = this.add.container(tx, cy - 24).setDepth(ty + 4);

    // Card frame
    const g = this.add.graphics();
    const bColor = isBoss ? 0xf0c040 : 0x9aacb8;
    const fx = -CW / 2, fy = -CH / 2;
    g.fillStyle(0x000000, 0.4);  g.fillRect(fx + 2, fy + 2, CW, CH);
    g.fillStyle(0x2a1a0a, 1);    g.fillRect(fx, fy, CW, CH);
    g.lineStyle(2, bColor, 0.9); g.strokeRect(fx, fy, CW, CH);
    g.lineStyle(1, bColor, 0.4); g.strokeRect(fx + 2, fy + 2, CW - 4, CH - 4);
    cnt.add(g);

    // Drop + breathing animation
    this.tweens.add({
      targets: cnt, y: ty, duration: 420, ease: 'Bounce.Out',
      onComplete: () => {
        this.tweens.add({
          targets: cnt, scaleX: 1.15, scaleY: 1.15,
          duration: 750, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        });
      },
    });

    const cardName = cardDef?.name ?? '卡片';
    this.lootDrops.push({ obj: cnt, itemId: '__card__', itemName: cardName, qty: 1, cardId });
  }

  private spawnLoot(cx: number, cy: number, drops: DropEntry[]): void {
    for (const drop of drops) {
      if (Math.random() >= drop.rate) continue;
      const qty = Phaser.Math.Between(drop.qtyMin, drop.qtyMax);
      const ox  = Phaser.Math.Between(-22, 22);
      const oy  = Phaser.Math.Between(-10, 10);
      const tx  = cx + ox;
      const ty  = cy + oy + 18;
      const iconKey = `icon_${drop.itemId}`;
      const img = this.add.image(tx, cy - 24, iconKey)
        .setDisplaySize(28, 28).setDepth(ty + 4);
      this.tweens.add({
        targets: img, y: ty,
        duration: 420, ease: 'Bounce.Out',
        onComplete: () => {
          this.tweens.add({
            targets: img, y: ty - 4,
            duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
          });
        },
      });
      this.lootDrops.push({ obj: img, itemId: drop.itemId, itemName: drop.itemName, qty });
    }
  }

  private checkLootPickup(): void {
    if (this.lootDrops.length === 0) return;
    this.lootDrops = this.lootDrops.filter(loot => {
      if (!loot.obj.active) return false;
      const d = Phaser.Math.Distance.Between(
        this.player.x, this.player.y, loot.obj.x, loot.obj.y,
      );
      if (d > 48) return true;
      if (loot.cardId) {
        CardStore.addCard(loot.cardId);
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, 1);
      } else {
        InventoryStore.addItem(loot.itemId, loot.itemName, loot.qty);
        this.showPickupText(loot.obj.x, loot.obj.y, loot.itemName, loot.qty);
      }
      loot.obj.destroy();
      return false;
    });
  }

  private showPickupText(_x: number, _y: number, name: string, qty: number): void {
    const W      = this.scale.width;
    const H      = this.scale.height;
    const LINE_H = 22;
    const MAX    = 5;
    const BASE_Y = H * 0.82;

    // targetY: newest entry sits at BASE_Y, older entries above it
    const targetY = (idx: number, total: number) => BASE_Y - (total - 1 - idx) * LINE_H;

    const reposition = () => {
      const n = this.pickupLog.length;
      this.pickupLog.forEach((t, i) => {
        this.tweens.killTweensOf(t);   // cancel any in-flight position tween
        this.tweens.add({ targets: t, y: targetY(i, n), duration: 100, ease: 'Sine.Out' });
      });
    };

    // Remove oldest if at limit
    if (this.pickupLog.length >= MAX) {
      const old = this.pickupLog.shift()!;
      this.tweens.killTweensOf(old);
      this.tweens.add({ targets: old, alpha: 0, duration: 150, onComplete: () => old.destroy() });
    }

    // Add new entry just below current bottom (will snap to BASE_Y via reposition)
    const startY = this.pickupLog.length > 0
      ? targetY(this.pickupLog.length, this.pickupLog.length + 1)
      : BASE_Y;
    const txt = this.add.text(W / 2, startY, `+${qty} ${name}`, {
      fontSize: '13px', color: '#ffffff',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(240);
    this.pickupLog.push(txt);

    reposition();

    // Fade out after 3s
    this.time.delayedCall(3000, () => {
      const i = this.pickupLog.indexOf(txt);
      if (i === -1) return;
      this.pickupLog.splice(i, 1);
      reposition();
      this.tweens.killTweensOf(txt);
      this.tweens.add({ targets: txt, alpha: 0, duration: 300, onComplete: () => txt.destroy() });
    });
  }

  private showLevelUp(newLevel: number): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const bg = this.add.graphics().setScrollFactor(0).setDepth(290);
    bg.fillStyle(0x000000, 0.55);
    bg.fillRoundedRect(W / 2 - 120, H / 2 - 38, 240, 76, 10);
    bg.lineStyle(2, 0xf0c040, 0.9);
    bg.strokeRoundedRect(W / 2 - 120, H / 2 - 38, 240, 76, 10);

    const line1 = this.add.text(W / 2, H / 2 - 14, '⬆  等級提升！', {
      fontSize: '20px', color: '#f0c040', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(291);

    const line2 = this.add.text(W / 2, H / 2 + 16, `Lv. ${newLevel}   ATK +1   HP +10`, {
      fontSize: '13px', color: '#ffffff', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(291);

    this.tweens.add({
      targets: [bg, line1, line2], alpha: 0, delay: 1800, duration: 500,
      onComplete: () => { bg.destroy(); line1.destroy(); line2.destroy(); },
    });
  }

  private showEndScreen(_victory: boolean): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const D = 10000;

    // ── 全螢幕暗色遮罩 ──────────────────────────────────
    const overlay = this.add.graphics().setScrollFactor(0).setDepth(D);
    overlay.fillStyle(0x000000, 0.80);
    overlay.fillRect(0, 0, W, H);

    // ── 面板 ────────────────────────────────────────────
    const PW = 300, PH = 200;
    const px = W / 2 - PW / 2, py = H / 2 - PH / 2;

    const panel = this.add.graphics().setScrollFactor(0).setDepth(D + 1);
    panel.fillStyle(0x000000, 0.5);
    panel.fillRoundedRect(px + 4, py + 4, PW, PH, 10);
    panel.fillStyle(0x1a0a0a, 1);
    panel.fillRoundedRect(px, py, PW, PH, 10);
    panel.fillStyle(0x2a1010, 1);
    panel.fillRoundedRect(px + 2, py + 2, PW - 4, PH - 4, 9);
    panel.fillStyle(0x660000, 0.8);
    panel.fillRoundedRect(px + 2, py + 2, PW - 4, 44, { tl: 9, tr: 9, bl: 0, br: 0 });
    panel.lineStyle(2, 0xaa2222, 0.9);
    panel.strokeRoundedRect(px, py, PW, PH, 10);
    panel.lineStyle(1, 0xff4444, 0.2);
    panel.strokeRoundedRect(px + 4, py + 4, PW - 8, PH - 8, 8);

    // ── 標題 ────────────────────────────────────────────
    this.add.text(W / 2, py + 32, '冒險者倒下了', {
      fontSize: '24px', color: '#ff4444',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 2);

    // 分隔線
    const sep = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    sep.fillStyle(0xaa2222, 0.4);
    sep.fillRect(px + 20, py + 58, PW - 40, 1);

    // ── 返回村莊按鈕 ────────────────────────────────────
    const BW = 140, BH = 42;
    const cx = W / 2, cy = py + PH - 48;
    const g = this.add.graphics().setScrollFactor(0).setDepth(D + 2);
    g.fillStyle(0x1a0808, 1);
    g.fillRoundedRect(cx - BW / 2, cy - BH / 2, BW, BH, 7);
    g.fillStyle(0xffffff, 0.05);
    g.fillRoundedRect(cx - BW / 2, cy - BH / 2, BW, BH / 2, { tl: 7, tr: 7, bl: 0, br: 0 });
    g.lineStyle(2, 0xaa2222, 0.9);
    g.strokeRoundedRect(cx - BW / 2, cy - BH / 2, BW, BH, 7);
    g.fillStyle(0xaa2222, 0.35);
    g.fillRoundedRect(cx - BW / 2, cy - BH / 2, BW, 2, { tl: 7, tr: 7, bl: 0, br: 0 });

    const txt = this.add.text(cx, cy, '返回村莊', {
      fontSize: '16px', color: '#ff8888', stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3);

    const hit = this.add.rectangle(cx, cy, BW, BH)
      .setScrollFactor(0).setDepth(D + 4).setInteractive({ useHandCursor: true });
    hit.on('pointerover',  () => { g.setAlpha(0.8);  txt.setStyle({ color: '#ffffff' }); });
    hit.on('pointerout',   () => { g.setAlpha(1.0);  txt.setStyle({ color: '#ff8888' }); });
    hit.on('pointerdown',  () => this.scene.start('PrepScene'));
  }


  // ── Scene helpers ─────────────────────────────────────

  private addHUD(): void {
    this.addAttackButton();
    this.addLevelHUD();
  }

  private addLevelHUD(): void {
    const STRIP_H = 22, EXP_H = 4;

    this.levelText = this.add.text(10, 0, '', {
      fontSize: '12px', color: '#e8d090', stroke: '#1a0800', strokeThickness: 2,
    }).setScrollFactor(0).setDepth(102).setOrigin(0, 0.5);

    this.expBarGfx = this.add.graphics().setScrollFactor(0).setDepth(101);

    const draw = () => {
      const W   = this.scale.width;
      const H   = this.scale.height;
      const top = H - STRIP_H - EXP_H;

      const lv  = PlayerStore.getLevel();
      const exp = PlayerStore.getExp();
      const max = PlayerStore.expToNext();
      const pct = Math.min(exp / max, 1);

      // Lv text (left), vertically centred in strip
      const midY = top + STRIP_H / 2;
      this.levelText.setPosition(10, midY);
      this.levelText.setText(`Lv.${lv}`);

      // Exp bar (full width, sits below the strip)
      this.expBarGfx.clear();
      this.expBarGfx.fillStyle(0x1a1008, 1);
      this.expBarGfx.fillRect(0, top + STRIP_H, W, EXP_H);
      if (pct > 0) {
        this.expBarGfx.fillStyle(0x44aaff, 1);
        this.expBarGfx.fillRect(0, top + STRIP_H, Math.max(4, W * pct), EXP_H);
        // Bright leading edge
        this.expBarGfx.fillStyle(0xaaddff, 0.7);
        this.expBarGfx.fillRect(Math.max(0, W * pct - 3), top + STRIP_H, 3, EXP_H);
      }
    };

    draw();
    PlayerStore.onChange(draw);
    this.scale.on('resize', draw, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      PlayerStore.offChange(draw);
      this.scale.off('resize', draw, this);
    });
  }

  private addAttackButton(): void {
    if ((PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'aura') return;
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
      const isDash = (PlayerStore.getEquipped().sword?.behavior ?? 'slash180') === 'dashPierce';
      if (isDash) {
        this.attackDashPierce(0, 0);
      } else {
        const { x: tx, y: ty } = this.getAttackTarget();
        this.meleeAttack(tx, ty);
      }
    };

    const onUp = (ptr: Phaser.Input.Pointer) => {
      if (!activeIds.has(ptr.id)) return;
      activeIds.delete(ptr.id);
      if (activeIds.size === 0) {
        drawBtn(false);
        if (this.dashAimActive) {
          this.dashAimActive = false;
          this.dashAimGfx?.destroy();
          this.dashAimGfx = undefined;
          this.executeDashPierce(this.dashAimAngle);
        }
      }
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
      this.anims.create({ key: 'player_attack_down', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 1, end: 7 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_left'))
      this.anims.create({ key: 'player_attack_left', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 9, end: 15 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_right'))
      this.anims.create({ key: 'player_attack_right', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 17, end: 23 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_attack_up'))
      this.anims.create({ key: 'player_attack_up', frames: this.anims.generateFrameNumbers('player_attack_shadow', { start: 25, end: 31 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_down'))
      this.anims.create({ key: 'player_run_attack_down', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 1, end: 7 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_left'))
      this.anims.create({ key: 'player_run_attack_left', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 9, end: 15 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_right'))
      this.anims.create({ key: 'player_run_attack_right', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 17, end: 23 }), frameRate: 20, repeat: 0 });
    if (!this.anims.exists('player_run_attack_up'))
      this.anims.create({ key: 'player_run_attack_up', frames: this.anims.generateFrameNumbers('player_run_attack_shadow', { start: 25, end: 31 }), frameRate: 20, repeat: 0 });
    // 多段連擊：三刀獨立節奏（快→快→重）
    // 每刀：起揮(前半段) + 收刀(反向) → 重複三次，第三刀走完整影格且較慢
    const mkMultihit = (key: string, s: number, e: number) => {
      if (this.anims.exists(key)) return;
      const all  = Array.from({ length: e - s + 1 }, (_, i) => s + i); // 7 frames
      const mid  = Math.floor(all.length / 2);
      const hit1 = [...all.slice(0, mid + 1), ...all.slice(0, mid + 1).reverse()];        // 快：前半揮+收
      const hit2 = [...all.slice(0, mid + 2), ...all.slice(0, mid + 2).reverse()];        // 快：前半+1揮+收
      const hit3 = [...all, all[all.length - 1], all[all.length - 1], ...all.reverse()];  // 重：完整揮+停頓+收
      const seq  = [...hit1, ...hit2, ...hit3];
      const frames = seq.map(f =>
        this.anims.generateFrameNumbers('player_attack_shadow', { frames: [f] })[0]
      );
      this.anims.create({ key, frames, frameRate: 55, repeat: 0 });
    };
    mkMultihit('player_multihit_down',  1,  7);
    mkMultihit('player_multihit_left',  9, 15);
    mkMultihit('player_multihit_right', 17, 23);
    mkMultihit('player_multihit_up',    25, 31);

    if (!this.anims.exists('player_hurt'))
      this.anims.create({ key: 'player_hurt', frames: this.anims.generateFrameNumbers('player_hurt', { start: 0, end: 4 }), frameRate: 14, repeat: 0 });
    // 旋風斬：用三個方向各一幀（下2、右18、上26）組合出旋轉感
    if (!this.anims.exists('player_whirlwind')) {
      const wf = [
        ...this.anims.generateFrameNumbers('player_attack_shadow', { frames: [28, 3, 20] }),
      ];
      this.anims.create({ key: 'player_whirlwind', frames: wf, frameRate: 17, repeat: 1 });
    }
  }

  private createSlimeAnims(): void {
    const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
    // cols × rows: idle=6×4, walk=8×4, run=8×4, attack=10×4, hurt=5×4, death=10×4
    const buildAnims = (prefix: string) => {
      if (this.anims.exists(`${prefix}_idle_down`)) return;
      const defs = [
        { action: 'idle',   cols: 6,  fps: 8,  repeat: -1 },
        { action: 'walk',   cols: 8,  fps: 10, repeat: -1 },
        { action: 'run',    cols: 8,  fps: 14, repeat: -1 },
        { action: 'attack', cols: 10, fps: 10, repeat: -1 },
        { action: 'hurt',   cols: 5,  fps: 14, repeat: 0  },
        { action: 'death',  cols: 10, fps: 8,  repeat: 0  },
      ];
      dirs.forEach((dir, row) => {
        defs.forEach(d => {
          const start = row * d.cols;
          this.anims.create({
            key: `${prefix}_${d.action}_${dir}`,
            frames: this.anims.generateFrameNumbers(`${prefix}_${d.action}`, { start, end: start + d.cols - 1 }),
            frameRate: d.fps,
            repeat: d.repeat,
          });
        });
      });
    };
    buildAnims('slime');
    buildAnims('slime2');
    buildAnims('slime3');
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
    // icon_stone_broken / icon_stone_intact 已在 preload 以真實圖片載入
    if (!this.textures.exists('icon_card')) {
      const g = (this.make.graphics as any)({ x: 0, y: 0, add: false }) as Phaser.GameObjects.Graphics;
      g.fillStyle(0xf0d898, 1); g.fillRect(5, 3, 22, 28);
      g.lineStyle(1.5, 0x7a3200, 1); g.strokeRect(5, 3, 22, 28);
      g.fillStyle(0xcc2222, 1); g.fillRect(5, 3, 22, 8);
      g.fillStyle(0x7a3200, 0.3); g.fillCircle(16, 18, 8);
      g.fillStyle(0xffee88, 0.6); g.fillCircle(16, 18, 5);
      g.generateTexture('icon_card', 32, 32);
      g.destroy();
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
    // icon_gold 已在 preload 以真實圖片載入
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