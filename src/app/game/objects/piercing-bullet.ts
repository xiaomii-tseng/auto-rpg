import Phaser from 'phaser';
import { Bullet } from './bullet';

export class PiercingBullet extends Bullet {
  readonly hitEnemies = new Set<Phaser.Physics.Arcade.Sprite>();

  override fire(fromX: number, fromY: number, targetX: number, targetY: number): void {
    this.hitEnemies.clear();
    super.fire(fromX, fromY, targetX, targetY);
  }
}
