export interface SkinDef {
  label:  string;
  folder: string;
  prefix: string;
  /** Override individual file names (relative to folder/). Omitted keys fall back to the default naming convention. */
  fileMap?: {
    idle?:      string;
    run?:       string;
    attack?:    string;
    runAttack?: string;
    hurt?:      string;
    death?:     string;
  };
}

export const SKINS: readonly SkinDef[] = [
  { label: '劍士 I',   folder: 'sprite/hero/PNG/Swordsman_lvl1/With_shadow', prefix: 'Swordsman_lvl1' },
  { label: '劍士 II',  folder: 'sprite/hero/PNG/Swordsman_lvl2/With_shadow', prefix: 'Swordsman_lvl2' },
  { label: '劍士 III', folder: 'sprite/hero/PNG/Swordsman_lvl3/With_shadow', prefix: 'Swordsman_lvl3' },
  { label: '劍客',     folder: 'sprite/player/PNG/Sword/With_shadow',        prefix: 'Sword'          },
] as const;

let _skinId = 0;

export const SkinStore = {
  get(): number { return _skinId; },
  set(id: number): void { _skinId = Math.min(SKINS.length - 1, Math.max(0, id)); },
};

const CFG = { frameWidth: 64, frameHeight: 64 };

/** Returns the full path for a specific animation file within a skin. */
export function getSkinFile(s: SkinDef, type: 'idle' | 'run' | 'attack' | 'runAttack' | 'hurt' | 'death'): string {
  const f = `${s.folder}/`;
  if (s.fileMap?.[type]) return `${f}${s.fileMap[type]}`;
  const p = s.prefix;
  const defaults: Record<typeof type, string> = {
    idle:      `${p}_Idle_with_shadow.png`,
    run:       `${p}_Run_with_shadow.png`,
    attack:    `${p}_attack_with_shadow.png`,
    runAttack: `${p}_Run_Attack_with_shadow.png`,
    hurt:      `${p}_Hurt_with_shadow.png`,
    death:     `${p}_Death_with_shadow.png`,
  };
  return `${f}${defaults[type]}`;
}

/**
 * Load a skin's spritesheets into Phaser's texture manager.
 * keyPrefix = 'player' → loads player_idle_shadow, player_run_shadow, …
 * keyPrefix = 'partner' → loads partner_idle_shadow, partner_run_shadow, …
 */
export function loadSkinTextures(scene: Phaser.Scene, skinId: number, keyPrefix: string): void {
  const s = SKINS[skinId];
  const k = keyPrefix;
  if (!scene.textures.exists(`${k}_idle_shadow`))
    scene.load.spritesheet(`${k}_idle_shadow`,       getSkinFile(s, 'idle'),      CFG);
  if (!scene.textures.exists(`${k}_run_shadow`))
    scene.load.spritesheet(`${k}_run_shadow`,        getSkinFile(s, 'run'),       CFG);
  if (!scene.textures.exists(`${k}_attack_shadow`))
    scene.load.spritesheet(`${k}_attack_shadow`,     getSkinFile(s, 'attack'),    CFG);
  if (!scene.textures.exists(`${k}_run_attack_shadow`))
    scene.load.spritesheet(`${k}_run_attack_shadow`, getSkinFile(s, 'runAttack'), CFG);
  if (!scene.textures.exists(`${k}_hurt`))
    scene.load.spritesheet(`${k}_hurt`,              getSkinFile(s, 'hurt'),      CFG);
  if (!scene.textures.exists(`${k}_death_shadow`))
    scene.load.spritesheet(`${k}_death_shadow`,      getSkinFile(s, 'death'),     CFG);
}
