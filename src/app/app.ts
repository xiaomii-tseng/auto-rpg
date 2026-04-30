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

    new Phaser.Game({
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
  }
}
