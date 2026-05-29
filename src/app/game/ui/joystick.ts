import Phaser from 'phaser';

const DPR = (window as any).__gameDpr as number;

export interface JoystickOutput {
  x: number; // -1 to 1
  y: number; // -1 to 1
}

export class VirtualJoystick {
  private base!: Phaser.GameObjects.Arc;
  private thumb!: Phaser.GameObjects.Arc;
  private baseX = 0;
  private baseY = 0;
  private radius = Math.round(55 * DPR);
  private thumbRadius = Math.round(24 * DPR);
  private _pointerId = -1;
  private output: JoystickOutput = { x: 0, y: 0 };
  private _scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this._scene = scene;
    this.baseX = Math.round(100 * DPR);
    this.baseY = scene.scale.height - Math.round(120 * DPR);

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
    scene.input.on('pointerup',   this.onUp,   this);

    scene.scale.on('resize', () => {
      this.baseY = scene.scale.height - Math.round(120 * DPR);
      this.base.setPosition(this.baseX, this.baseY);
      this.thumb.setPosition(this.baseX, this.baseY);
    });
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (this._pointerId !== -1) return;
    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    if (dx * dx + dy * dy > (this.radius + Math.round(20 * DPR)) ** 2) return;
    this._pointerId = pointer.id;
    this.base.setAlpha(0.3);
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this._pointerId) return;
    const dx = pointer.x - this.baseX;
    const dy = pointer.y - this.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const clamped = Math.min(dist, this.radius);
    const angle = Math.atan2(dy, dx);

    this.thumb.setPosition(
      this.baseX + Math.cos(angle) * clamped,
      this.baseY + Math.sin(angle) * clamped,
    );

    const ratio = clamped / this.radius;
    this.output.x = Math.cos(angle) * ratio;
    this.output.y = Math.sin(angle) * ratio;
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this._pointerId) return;
    this._reset();
  }

  private _reset(): void {
    this._pointerId = -1;
    this.output.x = 0;
    this.output.y = 0;
    this.thumb.setPosition(this.baseX, this.baseY);
    this.base.setAlpha(0.15);
  }

  /** True while this joystick owns a pointer (finger/mouse button is down on it). */
  ownsPointer(pointerId: number): boolean {
    return this._pointerId !== -1 && this._pointerId === pointerId;
  }

  /** True if (x, y) falls within the joystick touch zone. */
  isInZone(x: number, y: number): boolean {
    const dx = x - this.baseX, dy = y - this.baseY;
    const limit = this.radius + Math.round(20 * DPR);
    return dx * dx + dy * dy <= limit * limit;
  }

  get value(): JoystickOutput {
    // Every frame: check if the captured pointer is still physically down.
    // If stopPropagation on a game object swallowed the pointerup event,
    // the manager still tracks the real pointer state and we catch it here.
    if (this._pointerId !== -1) {
      const ptr = this._scene.input.manager.pointers.find(p => p.id === this._pointerId);
      if (ptr && !ptr.isDown) this._reset();
    }
    return this.output;
  }

  hide(): void {
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    this._scene.input.off('pointerdown', this.onDown, this);
    this._scene.input.off('pointermove', this.onMove, this);
    this._scene.input.off('pointerup',   this.onUp,   this);
  }

  static isTouchDevice(): boolean {
    // pointer: coarse = 觸控/手指；pointer: fine = 滑鼠
    return window.matchMedia('(pointer: coarse)').matches;
  }
}
