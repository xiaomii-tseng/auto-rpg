import { Component, AfterViewInit } from '@angular/core';
import Phaser from 'phaser';
import { PrepScene } from './game/scenes/prep-scene';
import { GameScene } from './game/scenes/game.scene';

@Component({
  selector: 'app-root',
  imports: [],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {

  ngAfterViewInit(): void {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const isPortrait = H > W;
    const gameW = isPortrait ? H : W;
    const gameH = isPortrait ? W : H;

    const wrapper = document.getElementById('game-wrapper')!;
    if (isPortrait) {
      Object.assign(wrapper.style, {
        width:           `${gameW}px`,
        height:          `${gameH}px`,
        transformOrigin: 'top left',
        transform:       `rotate(90deg) translateY(-100%)`,
      });
    } else {
      Object.assign(wrapper.style, {
        width:  `${gameW}px`,
        height: `${gameH}px`,
      });
    }

    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#0d0d1a',
      width:  gameW,
      height: gameH,
      scene: [PrepScene, GameScene],
      scale: { mode: Phaser.Scale.NONE },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
    });

    game.events.once('ready', () => this.patchRotationInput(game, isPortrait));
  }

  private patchRotationInput(game: Phaser.Game, isPortrait: boolean): void {
    if (!isPortrait) return;
    const im = (game as any).input;
    if (!im?.transformPointer) return;
    const _orig = im.transformPointer.bind(im);
    im.transformPointer = function (pointer: any, pageX: number, pageY: number, wasMove: boolean) {
      const b = im.scaleManager.canvasBounds;
      const newX = b.left + (pageY - b.top)  * b.width  / b.height;
      const newY = b.top  + (1 - (pageX - b.left) / b.width) * b.height;
      return _orig(pointer, newX, newY, wasMove);
    };
  }
}
