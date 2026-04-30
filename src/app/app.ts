import { Component, OnInit } from '@angular/core';
import Phaser from 'phaser';
import { PrepScene } from './game/scenes/prep-scene';
import { GameScene } from './game/scenes/game.scene';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private game!: Phaser.Game;

  ngOnInit(): void {
    (screen.orientation as any)?.lock?.('landscape')?.catch(() => {});

    this.applyRotation();
    window.addEventListener('resize', () => {
      this.applyRotation();
      // Let the DOM settle before Phaser re-reads container dimensions
      setTimeout(() => this.game?.scale.refresh(), 50);
    });

    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#0d0d1a',
      scene: [PrepScene, GameScene],
      scale: {
        mode: Phaser.Scale.RESIZE,
        width: '100%',
        height: '100%',
      },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
    });

    this.game.events.once('ready', () => this.patchRotationInput(this.game));
  }

  private applyRotation(): void {
    const el = document.getElementById('game-container');
    if (!el) return;
    const W = window.innerWidth;
    const H = window.innerHeight;

    if (H > W) {
      // Portrait: rotate container 90deg CW so content appears landscape
      el.style.position       = 'fixed';
      el.style.width          = `${H}px`;
      el.style.height         = `${W}px`;
      el.style.top            = `${(H - W) / 2}px`;
      el.style.left           = `${(W - H) / 2}px`;
      el.style.right          = 'auto';
      el.style.bottom         = 'auto';
      el.style.transform      = 'rotate(90deg)';
      el.style.transformOrigin = 'center center';
    } else {
      el.style.position       = 'fixed';
      el.style.inset          = '0';
      el.style.width          = '';
      el.style.height         = '';
      el.style.top            = '';
      el.style.left           = '';
      el.style.right          = '';
      el.style.bottom         = '';
      el.style.transform      = '';
      el.style.transformOrigin = '';
    }
  }

  private patchRotationInput(game: Phaser.Game): void {
    const im = (game as any).input;
    if (!im?.transformPointer) return;
    const _orig = im.transformPointer.bind(im);
    im.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
      if (window.matchMedia('(orientation: portrait)').matches) {
        const b = im.scaleManager.canvasBounds;
        // CSS rotate(90deg) CW: screen (px,py) → landscape game coords
        // game_x = (pageY - b.top)  / b.height * gameW
        // game_y = (1 - (pageX - b.left) / b.width) * gameH
        // Convert back to "fake" page coords that the original transform expects
        const newX = b.left + b.width  * (pageY - b.top)  / b.height;
        const newY = b.top  + b.height * (1 - (pageX - b.left) / b.width);
        return _orig(pointer, newX, newY, wasMove);
      }
      return _orig(pointer, pageX, pageY, wasMove);
    };
  }
}
