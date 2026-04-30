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
  ngOnInit(): void {
    (screen.orientation as any)?.lock?.('landscape')?.catch(() => {});

    const game = new Phaser.Game({
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

    game.events.once('ready', () => this.patchRotationInput(game));
  }

  private patchRotationInput(game: Phaser.Game): void {
    const im = (game as any).input;
    if (!im?.transformPointer) return;
    const _orig = im.transformPointer.bind(im);
    im.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
      if (window.matchMedia('(orientation: portrait)').matches) {
        const b = im.scaleManager.canvasBounds;
        // CSS rotate(90deg) translateY(-100%) with transform-origin: top left
        // screen (px,py) → canvas coords: canvas_x = py, canvas_y = vw - px
        const newX = b.left + (pageY - b.top)  * b.width  / b.height;
        const newY = b.top  + (1 - (pageX - b.left) / b.width) * b.height;
        return _orig(pointer, newX, newY, wasMove);
      }
      return _orig(pointer, pageX, pageY, wasMove);
    };
  }
}
