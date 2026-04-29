import Phaser from 'phaser';
import { WeaponDef, BulletType, ElementTint, WEAPONS } from '../data/weapons';
import { Bullet } from '../objects/bullet';
import { PiercingBullet } from '../objects/piercing-bullet';
import { StrikeEffect } from '../objects/strike-effect';
import { Player } from '../objects/player';

const LINEAR_POOL_SIZE = 20;
const PIERCING_POOL_SIZE = 10;

type WithDamage = Phaser.Physics.Arcade.Sprite & { takeDamage: (n: number) => void };
type WithSlow   = { applySlow?: (d: number) => void };

export class WeaponSystem {
  readonly slots: [WeaponDef, WeaponDef];
  private _activeSlot: 0 | 1 = 0;
  private attackTimer?: Phaser.Time.TimerEvent;
  private lastFireTime = -Infinity;

  readonly linearBullets: Phaser.Physics.Arcade.Group;
  readonly piercingBullets: Phaser.Physics.Arcade.Group;
  private readonly strike: StrikeEffect;

  onWeaponChanged?: (weapon: WeaponDef, slot: 0 | 1) => void;
  /** Fired when Thunder Hammer strikes; scene can use this to hit entities not in enemies group */
  onStrikeFired?: (x: number, y: number, dmg: number) => void;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly player: Player,
    private readonly enemies: Phaser.Physics.Arcade.Group,
  ) {
    this.slots = [WEAPONS['FIRE_CROSSBOW'], WEAPONS['ICE_STAFF']];

    this.linearBullets = scene.physics.add.group({
      classType: Bullet,
      runChildUpdate: false,
      maxSize: LINEAR_POOL_SIZE,
    });

    this.piercingBullets = scene.physics.add.group({
      classType: PiercingBullet,
      runChildUpdate: false,
      maxSize: PIERCING_POOL_SIZE,
    });

    this.strike = new StrikeEffect(scene);

    this.setupCollisions();
    this.applyPlayerTint();
  }

  private setupCollisions(): void {
    this.scene.physics.add.overlap(this.linearBullets, this.enemies, (bObj, eObj) => {
      const b = bObj as Bullet;
      const e = eObj as WithDamage;
      if (!b.active || !e.active) return;
      b.deactivate();
      e.takeDamage(b.dmg);
    });

    this.scene.physics.add.overlap(this.piercingBullets, this.enemies, (bObj, eObj) => {
      const b = bObj as PiercingBullet;
      const e = eObj as WithDamage & WithSlow;
      if (!b.active || !e.active || b.hitEnemies.has(e)) return;
      b.hitEnemies.add(e);
      e.takeDamage(b.dmg);
      e.applySlow?.(2000);
    });
  }

  get activeWeapon(): WeaponDef { return this.slots[this._activeSlot]; }
  get activeSlot(): 0 | 1 { return this._activeSlot; }

  switch(): void {
    this._activeSlot = this._activeSlot === 0 ? 1 : 0;
    if (this.attackTimer) {
      this.stopAttacking();
      this.startAttacking();
    }
    this.applyPlayerTint();
    this.onWeaponChanged?.(this.activeWeapon, this._activeSlot);
  }

  startAttacking(): void {
    if (this.attackTimer) return;
    this.attackTimer = this.scene.time.addEvent({
      delay: this.activeWeapon.fireRate,
      loop: true,
      callback: () => this.tryAttack(),
    });
    this.tryAttack();
  }

  stopAttacking(): void {
    this.attackTimer?.destroy();
    this.attackTimer = undefined;
  }

  private tryAttack(): void {
    if (this.player.moving) return;
    if (this.scene.time.now - this.lastFireTime < this.activeWeapon.fireRate) return;

    const target = this.getNearestEnemy();
    if (!target) return;

    this.lastFireTime = this.scene.time.now;
    this.execute(target);
  }

  getNearestEnemy(): Phaser.Physics.Arcade.Sprite | null {
    const rangeSq = this.activeWeapon.range ** 2;
    let nearest: Phaser.Physics.Arcade.Sprite | null = null;
    let minDistSq = rangeSq;

    for (const e of this.enemies.getChildren()) {
      const enemy = e as Phaser.Physics.Arcade.Sprite;
      if (!enemy.active) continue;
      const dSq = Phaser.Math.Distance.BetweenPointsSquared(this.player, enemy);
      if (dSq < minDistSq) { minDistSq = dSq; nearest = enemy; }
    }
    return nearest;
  }

  private execute(target: Phaser.Physics.Arcade.Sprite): void {
    switch (this.activeWeapon.bulletType) {
      case BulletType.LINEAR:   this.fireLinear(target);   break;
      case BulletType.PIERCING: this.firePiercing(target); break;
      case BulletType.STRIKE:   this.fireStrike(target);   break;
    }
  }

  private fireLinear(target: Phaser.Physics.Arcade.Sprite): void {
    const w = this.activeWeapon;
    let b = this.linearBullets.getFirstDead(false) as Bullet | null;
    if (!b) {
      if (this.linearBullets.getLength() < LINEAR_POOL_SIZE) {
        b = new Bullet(this.scene, this.player.x, this.player.y);
        this.linearBullets.add(b, true);
      } else return;
    }
    b.configure(w.damage, ElementTint[w.element]);
    b.fire(this.player.x, this.player.y, target.x, target.y);
  }

  private firePiercing(target: Phaser.Physics.Arcade.Sprite): void {
    const w = this.activeWeapon;
    let b = this.piercingBullets.getFirstDead(false) as PiercingBullet | null;
    if (!b) {
      if (this.piercingBullets.getLength() < PIERCING_POOL_SIZE) {
        b = new PiercingBullet(this.scene, this.player.x, this.player.y);
        this.piercingBullets.add(b, true);
      } else return;
    }
    b.configure(w.damage, ElementTint[w.element]);
    b.fire(this.player.x, this.player.y, target.x, target.y);
  }

  private fireStrike(target: Phaser.Physics.Arcade.Sprite): void {
    const w = this.activeWeapon;
    const alive = this.enemies.getChildren().filter(
      e => (e as { active: boolean }).active,
    ) as Phaser.Physics.Arcade.Sprite[];
    this.strike.play(target.x, target.y, alive, e => {
      (e as WithDamage).takeDamage(w.damage);
    });
    this.onStrikeFired?.(target.x, target.y, w.damage);
  }

  applyPlayerTint(): void {
    this.player.setTint(ElementTint[this.activeWeapon.element]);
  }
}
