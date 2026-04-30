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
  private game!: Phaser.Game;

  ngAfterViewInit(): void {
    (screen.orientation as any)?.lock?.('landscape')?.catch(() => {});

    this.applyRotation();
    window.addEventListener('resize', () => {
      this.applyRotation();
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

    // Use screen dimensions (physical, unaffected by URL bar / browser chrome)
    const SW = Math.min(screen.width, screen.height); // narrow side
    const SH = Math.max(screen.width, screen.height); // tall side
    const isPortrait = window.innerHeight > window.innerWidth;

    if (isPortrait) {
      // Container is SH×SW (landscape), rotated 90deg CW to fill portrait screen
      el.style.cssText = `
        position: fixed;
        width: ${SH}px;
        height: ${SW}px;
        top: ${(SH - SW) / 2}px;
        left: ${(SW - SH) / 2}px;
        transform: rotate(90deg);
        transform-origin: center center;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
    } else {
      el.style.cssText = `
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      `;
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
