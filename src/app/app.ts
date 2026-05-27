import { Component, AfterViewInit, NgZone, inject, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, interval } from 'rxjs';
import Phaser from 'phaser';
import { PrepScene } from './game/scenes/prep-scene';
import { BattleLoadScene } from './game/scenes/battle-load-scene';
import { TownLoadingScene } from './game/scenes/town-loading-scene';
import { GameScene } from './game/scenes/game.scene';
import { TowerScene } from './game/scenes/tower-scene';
import { InventoryStore } from './game/data/inventory-store';
import { AuthComponent }    from './auth/auth.component';
import { AuthService }      from './auth/auth.service';
import { SaveSyncService }  from './auth/save-sync.service';
import { SaveStore }        from './game/data/save-store';
import { VERSION }          from './game/version';
import { environment }      from '../environments/environment';
import { MarketComponent }          from './game/market/market.component';
import { MarketVisibilityService }  from './game/market/market-visibility.service';
import { ReportComponent }          from './game/report/report.component';
import { ReportVisibilityService }  from './game/report/report-visibility.service';
import { PushService }              from './game/push/push.service';

@Component({
  selector: 'app-root',
  imports: [AuthComponent, MarketComponent, ReportComponent],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements AfterViewInit {

  private readonly ngZone    = inject(NgZone);
  private readonly swUpdate  = inject(SwUpdate);
  private readonly authSvc   = inject(AuthService);
  private readonly saveSync  = inject(SaveSyncService);
  private readonly marketVis = inject(MarketVisibilityService);
  private readonly reportVis = inject(ReportVisibilityService);
  readonly pushSvc           = inject(PushService);

  showAuth       = true;
  showUpdate     = signal(false);
  showPushPrompt = signal(false);
  showMarket     = this.marketVis.visible;
  private _phaserInited = false;

  ngAfterViewInit(): void {
    // 啟動時先 ping server，喚醒 Render 避免登入卡頓
    fetch(`${environment.apiUrl}/health`).catch(() => {});

    if (this.authSvc.init()) {
      // Defer to next tick to avoid NG0100 (ngAfterViewInit runs after first CD check)
      Promise.resolve().then(() => {
        this.showAuth = false;
        this._startGame();
      });
      return;
    }
  }

  applyUpdate(): void {
    this.swUpdate.activateUpdate().then(() => location.reload());
  }

  async onLoggedIn(): Promise<void> {
    this.showAuth = false;
    if (!this._phaserInited) await this._startGame();
    this._maybeShowPushPrompt();
  }

  async onPushSubscribe(): Promise<void> {
    this.showPushPrompt.set(false);
    await this.pushSvc.subscribe();
  }

  onPushDismiss(): void {
    this.pushSvc.dismiss();
    this.showPushPrompt.set(false);
  }

  private _maybeShowPushPrompt(): void {
    if (!this.pushSvc.isSupported) return;
    if (this.pushSvc.isSubscribed) return;
    if (this.pushSvc.isDismissed) return;
    if (Notification.permission === 'denied') return;
    this.showPushPrompt.set(true);
  }

  private async _startGame(): Promise<void> {
    await this.authSvc.syncSave();
    this._setupSaveSync();
    this._initPhaser();
  }

  private _setupSaveSync(): void {
    if (!this.authSvc.getToken()) return;
    this.saveSync.init();

    // SaveStore 每次本地存檔後通知 sync service
    SaveStore.setOnSaveHook(() => this.saveSync.markDirty());

    // 玩家切走 app / 鎖螢幕 → 立刻強制上傳（beforeunload 已在 init() 裡掛）
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveSync.forceUpload();
    });
    window.addEventListener('pagehide', () => this.saveSync.forceUpload());
  }


  private _initPhaser(): void {
    this._phaserInited = true;
    if (this.swUpdate.isEnabled) {
      // 新版就緒 → 立刻激活並重新載入
      this.swUpdate.versionUpdates.pipe(
        filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'),
      ).subscribe(() => {
        this.swUpdate.activateUpdate().then(() => location.reload());
      });

      // SW 快取損壞無法恢復 → 強制重新載入從網路抓新資源
      this.swUpdate.unrecoverable.subscribe(() => location.reload());

      // 啟動時主動查
      this.swUpdate.checkForUpdate();

      // 切回前景時查（PWA 最常見的使用情境）
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.swUpdate.checkForUpdate();
      });

      // 每小時補查，確保長時間掛著的玩家也能更新
      interval(60 * 60 * 1000).subscribe(() => this.swUpdate.checkForUpdate());
    }
    const wrapper = document.getElementById('game-wrapper')!;

    // Read safe-area-aware dimensions from the wrapper (CSS already applied env() insets)
    const rect = wrapper.getBoundingClientRect();
    const W = rect.width  || window.innerWidth;
    const H = rect.height || window.innerHeight;
    const isPortrait = window.innerHeight > window.innerWidth;

    // In portrait mode the canvas is rotated 90°: gameW=H, gameH=W
    const gameW = isPortrait ? H : W;
    const gameH = isPortrait ? W : H;

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

    (window as any).__apiUrl      = environment.apiUrl;
    (window as any).__gameVersion = VERSION;
    (window as any).__openMarket  = () => this.ngZone.run(() => this.marketVis.open());
    (window as any).__openReport  = () => this.ngZone.run(() => this.reportVis.open());
    (window as any).__setGameInputEnabled = (enabled: boolean) => {
      game.scene.getScenes(true).forEach(s => { s.input.enabled = enabled; });
    };
    const dpr = (window as any).__gameDpr as number;
    const isMobile = 'ontouchstart' in window;
    (window as any).__gameMobile = isMobile;
    const game = this.ngZone.runOutsideAngular(() => new Phaser.Game({
      type: Phaser.AUTO,
      parent: 'game-container',
      backgroundColor: '#0d0d1a',
      width:  Math.round(gameW * dpr),
      height: Math.round(gameH * dpr),
      scene: [TownLoadingScene, PrepScene, BattleLoadScene, GameScene, TowerScene],
      scale: { mode: Phaser.Scale.NONE },
      render: {
        roundPixels: true,
        antialias: !isMobile,
        powerPreference: isMobile ? 'low-power' : 'default',
      },
      dom: { createContainer: true },
      fps: { target: 45, forceSetTimeOut: false },
      physics: {
        default: 'arcade',
        arcade: { gravity: { x: 0, y: 0 }, debug: false },
      },
    }));

    game.events.once('ready', () => {
      game.canvas.style.width  = `${gameW}px`;
      game.canvas.style.height = `${gameH}px`;
      // Force Phaser to recompute canvasBounds and displayScale after CSS override,
      // otherwise pointer coordinates won't be DPR-scaled and hit testing fails.
      game.scale.refresh();
      this.patchRotationInput(game, isPortrait);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).addRerollStone = (n = 1) => {
      InventoryStore.addItem('quest_reroll', '任務重製石', n);
      console.log(`已新增 ${n} 顆任務重製石，目前共 ${InventoryStore.getItemQty('quest_reroll')} 顆`);
    };

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
