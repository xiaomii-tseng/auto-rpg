import Phaser from 'phaser';

export class Dummy extends Phaser.Physics.Arcade.Sprite {
  private hp = 100;
  private maxHp = 100;
  private hpBar!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'dummy');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setImmovable(true);
    this.setDepth(10);

    this.hpBar = scene.add.graphics().setDepth(20);
    this.label = scene.add
      .text(x, y - 40, 'Dummy', { fontSize: '11px', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
      .setOrigin(0.5)
      .setDepth(21);

    this.drawHpBar();
  }

  takeDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - amount);
    this.drawHpBar();

    // Flash red
    this.scene.tweens.add({
      targets: this,
      alpha: 0.3,
      duration: 60,
      yoyo: true,
    });

    if (this.hp <= 0) {
      this.die();
    }
  }

  private drawHpBar(): void {
    this.hpBar.clear();
    const bw = 36;
    const bh = 5;
    const bx = this.x - bw / 2;
    const by = this.y - 28;

    this.hpBar.fillStyle(0x330000);
    this.hpBar.fillRect(bx, by, bw, bh);

    const pct = this.hp / this.maxHp;
    this.hpBar.fillStyle(pct > 0.5 ? 0x00cc44 : pct > 0.25 ? 0xffaa00 : 0xff2222);
    this.hpBar.fillRect(bx, by, bw * pct, bh);
  }

  private die(): void {
    this.setActive(false).setVisible(false);
    (this.body as Phaser.Physics.Arcade.Body).enable = false;
    this.hpBar.setVisible(false);
    this.label.setVisible(false);

    // Respawn after 3 seconds
    this.scene.time.delayedCall(3000, () => {
      this.hp = this.maxHp;
      this.setActive(true).setVisible(true);
      (this.body as Phaser.Physics.Arcade.Body).enable = true;
      this.hpBar.setVisible(true);
      this.label.setVisible(true);
      this.drawHpBar();
    });
  }
}
