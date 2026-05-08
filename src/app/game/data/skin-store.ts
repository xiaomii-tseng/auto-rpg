export interface SkinDef {
  label:  string;
  folder: string;
  prefix: string;
}

export const SKINS: readonly SkinDef[] = [
  { label: '劍士 I',   folder: 'sprite/hero/PNG/Swordsman_lvl1/With_shadow', prefix: 'Swordsman_lvl1' },
  { label: '劍士 II',  folder: 'sprite/hero/PNG/Swordsman_lvl2/With_shadow', prefix: 'Swordsman_lvl2' },
  { label: '劍士 III', folder: 'sprite/hero/PNG/Swordsman_lvl3/With_shadow', prefix: 'Swordsman_lvl3' },
  { label: '劍客',     folder: 'sprite/player/PNG/Sword/With_shadow',        prefix: 'Sword'          },
] as const;

const KEY = 'auto_rpg_skin';

export const SkinStore = {
  get(): number { return Math.min(SKINS.length - 1, Math.max(0, Number(localStorage.getItem(KEY) ?? '0'))); },
  set(id: number): void { localStorage.setItem(KEY, String(id)); },
};

const CFG = { frameWidth: 64, frameHeight: 64 };

/**
 * Load a skin's spritesheets into Phaser's texture manager.
 * keyPrefix = 'player' → loads player_idle_shadow, player_run_shadow, …
 * keyPrefix = 'partner' → loads partner_idle_shadow, partner_run_shadow, …
 */
export function loadSkinTextures(scene: Phaser.Scene, skinId: number, keyPrefix: string): void {
  const s = SKINS[skinId];
  const f = `${s.folder}/`;
  const p = s.prefix;
  const k = keyPrefix;
  if (!scene.textures.exists(`${k}_idle_shadow`))
    scene.load.spritesheet(`${k}_idle_shadow`,       `${f}${p}_Idle_with_shadow.png`,       CFG);
  if (!scene.textures.exists(`${k}_run_shadow`))
    scene.load.spritesheet(`${k}_run_shadow`,        `${f}${p}_Run_with_shadow.png`,        CFG);
  if (!scene.textures.exists(`${k}_attack_shadow`))
    scene.load.spritesheet(`${k}_attack_shadow`,     `${f}${p}_attack_with_shadow.png`,     CFG);
  if (!scene.textures.exists(`${k}_run_attack_shadow`))
    scene.load.spritesheet(`${k}_run_attack_shadow`, `${f}${p}_Run_Attack_with_shadow.png`, CFG);
  if (!scene.textures.exists(`${k}_hurt`))
    scene.load.spritesheet(`${k}_hurt`,              `${f}${p}_Hurt_with_shadow.png`,       CFG);
  if (!scene.textures.exists(`${k}_death_shadow`))
    scene.load.spritesheet(`${k}_death_shadow`,      `${f}${p}_Death_with_shadow.png`,      CFG);
}
