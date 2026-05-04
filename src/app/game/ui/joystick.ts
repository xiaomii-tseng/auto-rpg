import Phaser from 'phaser';

export interface JoystickOutput {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

export class VirtualJoystick {
  private base!: Phaser.GameObjects.Arc;
  private thumb!: Phaser.GameObjects.Arc;
  private baseX = 0;
  private baseY = 0;
  private radius = 55;
  private thumbRadius = 24;
  private active = false;
  private pointerId = -1;
  private output: JoystickOutput = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    this.baseX = 100;
    this.baseY = scene.scale.height - 120;

    this.base = scene.add
      .circle(this.baseX, this.baseY, this.radius, 0xffffff, 0.15)
      .setStrokeStyle(2, 0xffffff, 0.4)
      .setScrollFactor(0)
      .setDepth(100);

    this.thumb = scene.add
      .circle(this.baseX, this.baseY, this.thumbRadius, 0xffffff, 0.45)
      .setScrollFactor(0)
      .setDepth(101);

    scene.input.on('pointerdown', this.onDown, this);
    scene.input.on('pointermove', this.onMove, this);
    scene.input.on('pointerup', this.onUp, this);

    scene.scale.on('resize', () => {
      this.baseY = scene.scale.height - 120;
      this.base.setPosition(this.baseX, this.baseY);
      this.thumb.setPosition(this.baseX, this.baseY);
    });
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this.active) return;
    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    if (dx * dx + dy * dy > (this.radius + 20) * (this.radius + 20)) return;
    this.active = true;
    this.pointerId = pointer.id;
    this.base.setAlpha(0.3);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active || pointer.id !== this.pointerId) return;
    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.radius);
    const angle = Math.atan2(dy, dx);

    this.thumb.setPosition(
      this.baseX + Math.cos(angle) * clamped,
      this.baseY + Math.sin(angle) * clamped
    );

    const ratio = clamped / this.radius;
    this.output.x = Math.cos(angle) * ratio;
    this.output.y = Math.sin(angle) * ratio;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.active = false;
    this.pointerId = -1;
    this.output.x = 0;
    this.output.y = 0;
    this.thumb.setPosition(this.baseX, this.baseY);
    this.base.setAlpha(0.15);
  }

  get value(): JoystickOutput {
    return this.output;
  }
}
