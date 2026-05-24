import Phaser from 'phaser';

/**
 * 音訊分類管理：BGM（背景音樂）與 SFX（音效）各自獨立音量。
 * bgmVolume / sfxVolume 為 0~1 的乘數，供 UI 滑桿控制。
 */
export class AudioService {
  static bgmVolume = 0.5;
  static sfxVolume = 1.0;

  private static _bgm: Phaser.Sound.BaseSound | null = null;

  // ── BGM ──────────────────────────────────────────────────

  static playBgm(scene: Phaser.Scene, key: string, baseVol = 0.5): void {
    this.stopBgm();
    if (!scene.cache.audio.exists(key)) return;
    this._bgm = scene.sound.add(key, { loop: true, volume: baseVol * this.bgmVolume });
    (this._bgm as Phaser.Sound.WebAudioSound).play();
  }

  static stopBgm(): void {
    if (!this._bgm) return;
    try { this._bgm.stop(); } catch { /* already stopped */ }
    this._bgm = null;
  }

  static setBgmVolume(v: number): void {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this._bgm) (this._bgm as Phaser.Sound.WebAudioSound).setVolume(this.bgmVolume);
  }

  // ── SFX ──────────────────────────────────────────────────

  // 需要全局節流的 key → 下次可播的時間戳（ms）
  private static _sfxGlobalCooldown: Map<string, number> = new Map();

  /** factor: 相對音量乘數（預設 1.0）。throttleMs: 全局同 key 冷卻時間（0 = 不限）。
   *  播放非點擊音效時自動抑制 sfx_ui_click，避免兩個聲音疊加。 */
  static playSfx(scene: Phaser.Scene, key: string, factor = 1.0, throttleMs = 0): void {
    if (!scene.cache.audio.exists(key)) return;
    const now = performance.now();
    if (throttleMs > 0) {
      if (now < (this._sfxGlobalCooldown.get(key) ?? 0)) return;
      this._sfxGlobalCooldown.set(key, now + throttleMs);
    }
    if (key !== 'sfx_ui_click') {
      this._sfxGlobalCooldown.set('sfx_ui_click', now + 300);
    }
    scene.sound.play(key, { volume: this.sfxVolume * factor });
  }

  static setSfxVolume(v: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, v));
  }

  /** 預先抑制下一次 sfx_ui_click（供有自己音效的按鈕在 pointerdown 呼叫）。 */
  static suppressClickSfx(ms = 500): void {
    this._sfxGlobalCooldown.set('sfx_ui_click', performance.now() + ms);
  }
}
