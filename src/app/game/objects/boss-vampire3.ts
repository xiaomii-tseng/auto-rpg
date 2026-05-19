import Phaser from 'phaser';
import { Boss } from './boss';
import type { Element } from '../data/equipment-data';

export class BossVampire3 extends Boss {
  protected override walkAnimSuffix = 'run';

  constructor(scene: Phaser.Scene, x: number, y: number, totalHp: number, element: Element, spriteKey: string, tint: number) {
    super(scene, x, y, totalHp, element, spriteKey, tint);
  }
}
