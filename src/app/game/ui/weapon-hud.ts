import Phaser from 'phaser';
import { WeaponDef, ElementTint } from '../data/weapons';

const SLOT_W = 52;
const SLOT_H = 52;
const SLOT_GAP = 8;
const SLOT_R = 6;

export class WeaponHUD {
  private readonly slotGfx: [Phaser.GameObjects.Graphics, Phaser.GameObjects.Graphics];
  private readonly slotCharTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly namePopup: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    const d = scene.scale;

    this.slotGfx = [
      scene.add.graphics().setScrollFactor(0).setDepth(200),
      scene.add.graphics().setScrollFactor(0).setDepth(200),
    ];

    const positions = this.positions();

    this.slotCharTexts = [
      scene.add.text(positions[0].x + SLOT_W / 2, positions[0].y + SLOT_H / 2 - 5, '', {
        fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201),

      scene.add.text(positions[1].x + SLOT_W / 2, positions[1].y + SLOT_H / 2 - 5, '', {
        fontSize: '16px', color: '#ffffff', stroke: '#000', strokeThickness: 3,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201),
    ];

    // Slot key labels
    (['A', 'B'] as const).forEach((key, i) => {
      scene.add.text(positions[i].x + SLOT_W / 2, positions[i].y + SLOT_H - 10, key, {
        fontSize: '9px', color: '#888888',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(201);
    });

    this.namePopup = scene.add.text(d.width / 2, d.height - 88, '', {
      fontSize: '18px', color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0).setScrollFactor(0).setDepth(202);
  }

  private positions(): [{ x: number; y: number }, { x: number; y: number }] {
    const sw = this.scene.scale.width;
    const sh = this.scene.scale.height;
    const startX = sw - (SLOT_W * 2 + SLOT_GAP) - 16;
    return [
      { x: startX,              y: sh - SLOT_H - 16 },
      { x: startX + SLOT_W + SLOT_GAP, y: sh - SLOT_H - 16 },
    ];
  }

  refresh(slots: [WeaponDef, WeaponDef], activeSlot: 0 | 1): void {
    const pos = this.positions();

    for (let i = 0; i < 2; i++) {
      const w = slots[i];
      const isActive = i === activeSlot;
      const tint = ElementTint[w.element];
      const gfx = this.slotGfx[i];
      const p = pos[i];

      gfx.clear();
      gfx.fillStyle(0x000000, 0.6);
      gfx.fillRoundedRect(p.x, p.y, SLOT_W, SLOT_H, SLOT_R);

      if (isActive) {
        gfx.fillStyle(tint, 0.22);
        gfx.fillRoundedRect(p.x, p.y, SLOT_W, SLOT_H, SLOT_R);
      }

      gfx.lineStyle(isActive ? 2 : 1, isActive ? tint : 0x666666, isActive ? 1 : 0.5);
      gfx.strokeRoundedRect(p.x, p.y, SLOT_W, SLOT_H, SLOT_R);

      this.slotCharTexts[i]
        .setText(w.name[0])
        .setPosition(p.x + SLOT_W / 2, p.y + SLOT_H / 2 - 5);
    }
  }

  flashName(weapon: WeaponDef): void {
    const tint = ElementTint[weapon.element];
    const hex = '#' + tint.toString(16).padStart(6, '0');
    this.namePopup.setText(weapon.name).setStyle({ color: hex }).setAlpha(1);
    this.scene.tweens.killTweensOf(this.namePopup);
    this.scene.tweens.add({
      targets: this.namePopup,
      alpha: 0,
      duration: 900,
      delay: 700,
    });
  }

  /** Returns which slot index was tapped, or null if neither was hit. */
  hitTestSlot(x: number, y: number): 0 | 1 | null {
    const pos = this.positions();
    for (let i = 0; i < pos.length; i++) {
      const p = pos[i];
      if (x >= p.x && x <= p.x + SLOT_W && y >= p.y && y <= p.y + SLOT_H) {
        return i as 0 | 1;
      }
    }
    return null;
  }
}
