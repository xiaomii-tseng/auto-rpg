import Phaser from 'phaser';

const DPR = (window as any).__gameDpr as number;
const P = (n: number) => Math.round(n * DPR);
const F = (n: number) => `${Math.round(n * DPR)}px`;

// Wood-dark palette (matches prep-scene)
export const UI_WB  = 0x140a02;
export const UI_WM  = 0x4a2814;
export const UI_WMI = 0x5c3418;
export const UI_WL  = 0x8b5e3c;

export interface ItemCellOpts {
  qualityColor?: number; // equipment quality border; omit for plain cell
  iconKey?: string;      // texture key for center icon
  label?: string;        // bottom name strip
  badge?: string;        // top-right badge (e.g. ×3)
}

export function drawItemCell(
  scene: Phaser.Scene,
  target: Phaser.GameObjects.Container,
  x: number, y: number, sz: number,
  opts: ItemCellOpts,
): void {
  const g = scene.add.graphics();

  // Dark outer fill
  g.fillStyle(UI_WB, 1);
  g.fillRect(x, y, sz, sz);

  // Inner fill — lighter tint if has quality border
  g.fillStyle(opts.qualityColor ? UI_WMI : UI_WM, 1);
  g.fillRect(x + P(2), y + P(2), sz - P(4), sz - P(4));

  if (opts.qualityColor) {
    g.lineStyle(P(2), opts.qualityColor, 0.85); g.strokeRect(x, y, sz, sz);
    g.lineStyle(P(1), opts.qualityColor, 0.35); g.strokeRect(x + P(2), y + P(2), sz - P(4), sz - P(4));
    g.fillStyle(opts.qualityColor, 0.5); g.fillRect(x, y, sz, P(3)); // top accent bar
  } else {
    g.lineStyle(1.5, UI_WL, 0.4); g.strokeRect(x, y, sz, sz);
  }
  target.add(g);

  // Center icon (shift up slightly when label strip is present)
  if (opts.iconKey && scene.textures.exists(opts.iconKey)) {
    const iconSz = sz * 0.60;
    const iconY = opts.label ? y + (sz - P(15)) / 2 : y + sz / 2;
    target.add(
      scene.add.image(x + sz / 2, iconY, opts.iconKey)
        .setDisplaySize(iconSz, iconSz),
    );
  }

  // Bottom name strip
  if (opts.label) {
    const stripH = P(15);
    const lg = scene.add.graphics();
    lg.fillStyle(0x000000, 0.62);
    lg.fillRect(x, y + sz - stripH, sz, stripH);
    target.add(lg);
    target.add(
      scene.add.text(x + sz / 2, y + sz - stripH / 2, opts.label, {
        fontSize: F(10), fontStyle: 'bold',
        color: '#ffe8a0', stroke: '#000000', strokeThickness: 1,
      }).setOrigin(0.5),
    );
  }

  // Top-right badge
  if (opts.badge) {
    target.add(
      scene.add.text(x + sz - P(2), y + P(2), opts.badge, {
        fontSize: F(10), color: '#ffffff', stroke: '#000000', strokeThickness: 1,
      }).setOrigin(1, 0),
    );
  }
}
