import Phaser from 'phaser';
import { SkinStore, SKINS, getSkinFile, loadSkinTextures } from './skin-store';

type S = Phaser.Scene;
const cfg64 = { frameWidth: 64, frameHeight: 64 };

// ── Town (PrepScene) assets ────────────────────────────────────────────────────

export function queueTownAssets(sc: S): void {
  const skin = SKINS[SkinStore.get()];

  // Always reload player skin (skin may change between sessions)
  ['player_idle_shadow', 'player_run_shadow'].forEach(k => {
    if (sc.textures.exists(k)) sc.textures.remove(k);
  });
  ['player_idle_shadow', '_lobby_idle',
   'player_idle_down', 'player_idle_left', 'player_idle_right', 'player_idle_up',
   'player_run_down',  'player_run_left',  'player_run_right',  'player_run_up',
  ].forEach(k => { if (sc.anims.exists(k)) sc.anims.remove(k); });
  sc.load.spritesheet('player_idle_shadow', getSkinFile(skin, 'idle'), cfg64);
  sc.load.spritesheet('player_run_shadow',  getSkinFile(skin, 'run'),  cfg64);

  // Wardrobe skin previews
  SKINS.forEach((s, i) => {
    if (!sc.textures.exists(`skin_preview_${i}`))
      sc.load.spritesheet(`skin_preview_${i}`,     getSkinFile(s, 'idle'), cfg64);
    if (!sc.textures.exists(`skin_run_preview_${i}`))
      sc.load.spritesheet(`skin_run_preview_${i}`, getSkinFile(s, 'run'),  cfg64);
  });

  // Town tiles
  if (!sc.textures.exists('tile_grass'))
    sc.load.image('tile_grass', 'tilesets/1 Tiles/FieldsTile_38.png');
  if (!sc.textures.exists('tileset_fields'))
    sc.load.spritesheet('tileset_fields', 'tilesets/1 Tiles/FieldsTileset.png', { frameWidth: 32, frameHeight: 32 });

  // Grass decorations
  for (let n = 1; n <= 6; n++)
    if (!sc.textures.exists(`deco_grass${n}`))
      sc.load.image(`deco_grass${n}`, `tilesets/2 Objects/5 Grass/${n}.png`);

  // Buildings & props
  if (!sc.textures.exists('tree_oak'))           sc.load.image('tree_oak',           'tilesets/2 Objects/7 Decor/Tree1.png');
  if (!sc.textures.exists('building_shop'))       sc.load.image('building_shop',       'tilesets2/2 Objects/7 House/1.png');
  if (!sc.textures.exists('deco_tent'))           sc.load.image('deco_tent',           'tilesets2/2 Objects/6 Tent/3.png');
  if (!sc.textures.exists('deco_tent_shadow'))    sc.load.image('deco_tent_shadow',    'tilesets2/2 Objects/1 Shadow/5.png');
  if (!sc.textures.exists('building_forge'))      sc.load.image('building_forge',      'tilesets2/2 Objects/7 House/4.png');
  if (!sc.textures.exists('building_battle'))     sc.load.image('building_battle',     'tilesets2/2 Objects/7 House/3.png');
  if (!sc.textures.exists('building_warehouse'))  sc.load.image('building_warehouse',  'tilesets2/2 Objects/6 Tent/4.png');
  if (!sc.textures.exists('campfire'))
    sc.load.spritesheet('campfire', 'tilesets/3 Animated Objects/2 Campfire/2.png', { frameWidth: 32, frameHeight: 32 });
  if (!sc.textures.exists('tx_props'))            sc.load.image('tx_props',            'texture/TX Props.png');
  if (!sc.textures.exists('tx_shadow'))           sc.load.image('tx_shadow',           'texture/TX Shadow.png');
  if (!sc.textures.exists('deco_warehouse_box'))  sc.load.image('deco_warehouse_box',  'tilesets2/2 Objects/4 Box/3.png');
  if (!sc.textures.exists('deco_shadow5'))        sc.load.image('deco_shadow5',        'tilesets/2 Objects/1 Shadow/5.png');
  if (!sc.textures.exists('deco_stump'))          sc.load.image('deco_stump',          'tilesets/2 Objects/7 Decor/Tree2.png');
  if (!sc.textures.exists('deco_stump_shadow'))   sc.load.image('deco_stump_shadow',   'tilesets/2 Objects/1 Shadow/4.png');
  if (!sc.textures.exists('tree_shadow'))         sc.load.image('tree_shadow',         'tilesets/2 Objects/1 Shadow/6.png');

  for (let n = 1; n <= 6; n++)
    if (!sc.textures.exists(`deco_stone${n}`))
      sc.load.image(`deco_stone${n}`, `tilesets/2 Objects/4 Stone/${n}.png`);
  for (let n = 1; n <= 12; n++)
    if (!sc.textures.exists(`deco_flower${n}`))
      sc.load.image(`deco_flower${n}`, `tilesets/2 Objects/6 Flower/${n}.png`);

  if (!sc.textures.exists('bg_prep'))   sc.load.image('bg_prep',   'other/bg1.png');
  if (!sc.textures.exists('icon_fight')) sc.load.image('icon_fight', 'other/fight.webp');
  if (!sc.textures.exists('icon_coin'))  sc.load.image('icon_coin',  'other/coin.webp');

  // Equipment icons
  ['hat', 'outfit', 'shoes', 'ring'].forEach(cat => {
    for (let i = 1; i <= 5; i++) {
      const key = `equip_${cat}${i}`;
      if (!sc.textures.exists(key)) sc.load.image(key, `equip/${cat}${i}.webp`);
    }
  });
  for (let i = 1; i <= 40; i++) {
    const key = `equip_sword${i}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/Iicon_32_${String(i).padStart(2, '0')}.png`);
  }
  for (let i = 1; i <= 30; i++) {
    const key = `equip_sword${i + 40}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/icon_32_2_${String(i).padStart(2, '0')}.png`);
  }
  for (let i = 1; i <= 4; i++) {
    const key = `equip_legendary_sw${i}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/red/sw${i}.png`);
  }

  // Boss idle sprites for quest panel
  const bossSprites: [string, string][] = [
    ['slime_idle',    'sprite/slime/PNG/Slime1/With_shadow/Slime1_Idle_with_shadow.png'],
    ['slime2_idle',   'sprite/slime/PNG/Slime2/With_shadow/Slime2_Idle_with_shadow.png'],
    ['slime3_idle',   'sprite/slime/PNG/Slime3/With_shadow/Slime3_Idle_with_shadow.png'],
    ['plant1_idle',   'sprite/flower/PNG/Plant1/With_shadow/Plant1_Idle_with_shadow.png'],
    ['plant2_idle',   'sprite/flower/PNG/Plant2/With_shadow/Plant2_Idle_with_shadow.png'],
    ['plant3_idle',   'sprite/flower/PNG/Plant3/With_shadow/Plant3_Idle_with_shadow.png'],
    ['orc1_idle',     'sprite/orc/PNG/Orc1/With_shadow/orc1_idle_with_shadow.png'],
    ['orc2_idle',     'sprite/orc/PNG/Orc2/With_shadow/orc2_idle_with_shadow.png'],
    ['orc3_idle',     'sprite/orc/PNG/Orc3/With_shadow/orc3_idle_with_shadow.png'],
    ['vampire1_idle', 'sprite/vampire/PNG/Vampires1/With_shadow/Vampires1_Idle_with_shadow.png'],
    ['vampire2_idle', 'sprite/vampire/PNG/Vampires2/With_shadow/Vampires2_Idle_with_shadow.png'],
    ['vampire3_idle', 'sprite/vampire/PNG/Vampires3/With_shadow/Vampires3_Idle_with_shadow.png'],
  ];
  bossSprites.forEach(([key, path]) => {
    if (!sc.textures.exists(key)) sc.load.spritesheet(key, path, cfg64);
  });

  // Icons
  if (!sc.textures.exists('icon_stone_broken'))    sc.load.image('icon_stone_broken',    'other/ore2.webp');
  if (!sc.textures.exists('icon_stone_intact'))    sc.load.image('icon_stone_intact',    'other/ore1.webp');
  if (!sc.textures.exists('icon_stone_guard'))     sc.load.image('icon_stone_guard',     'other/ore3.webp');
  if (!sc.textures.exists('icon_quest_reroll'))    sc.load.image('icon_quest_reroll',    'other/ore4.webp');
  if (!sc.textures.exists('icon_ticket_slime'))    sc.load.image('icon_ticket_slime',    'icon1/PNG/Transperent/Icon21.png');
  if (!sc.textures.exists('icon_ticket_flower'))   sc.load.image('icon_ticket_flower',   'icon1/PNG/Transperent/Icon37.png');
  if (!sc.textures.exists('icon_ticket_orc'))      sc.load.image('icon_ticket_orc',      'icon1/PNG/Transperent/Icon44.png');
  if (!sc.textures.exists('icon_ticket_vampire'))  sc.load.image('icon_ticket_vampire',  'icon1/PNG/Transperent/Icon42.png');
  if (!sc.textures.exists('potions_sheet'))
    sc.load.spritesheet('potions_sheet', 'items/potions.png', { frameWidth: 16, frameHeight: 16 });
  if (!sc.textures.exists('icon_gold'))       sc.load.image('icon_gold',       'other/coin.webp');
  if (!sc.textures.exists('icon_blank_card')) sc.load.image('icon_blank_card', 'other/card.webp');
  if (!sc.textures.exists('icon_equip_drop')) sc.load.image('icon_equip_drop', 'equip/weapons/Icons/Iicon_32_01.png');

  // Town animals
  const animalCfg = { frameWidth: 32, frameHeight: 32 };
  const animals: [string, string, string][] = [
    ['Fox',          'Fox_Idle_with_shadow.png',          'Fox_walk_with_shadow.png'],
    ['Deer',         'Deer_Idle_with_shadow.png',         'Deer_Walk_with_shadow.png'],
    ['Hare',         'Hare_Idle_with_shadow.png',         'Hare_Walk_with_shadow.png'],
    ['Boar',         'Boar_Idle_with_shadow.png',         'Boar_Walk_with_shadow.png'],
    ['Black_grouse', 'Black_grouse_Idle_with_shadow.png', 'Black_grouse_Walk_with_shadow.png'],
  ];
  for (const [name, idleF, walkF] of animals) {
    const base = `animal/PNG/With_Shadow/${name}`;
    if (!sc.textures.exists(`animal_${name}_idle`))
      sc.load.spritesheet(`animal_${name}_idle`, `${base}/${idleF}`, animalCfg);
    if (!sc.textures.exists(`animal_${name}_walk`))
      sc.load.spritesheet(`animal_${name}_walk`, `${base}/${walkF}`, animalCfg);
  }

  // Audio
  if (!sc.cache.audio.exists('sfx_town_bgm'))     sc.load.audio('sfx_town_bgm',     'sound/map2.mp3');
  if (!sc.cache.audio.exists('sfx_ui_click'))     sc.load.audio('sfx_ui_click',     'sound/plus.mp3');
  if (!sc.cache.audio.exists('sfx_enhance_ok'))   sc.load.audio('sfx_enhance_ok',   'sound/test-success.mp3');
  if (!sc.cache.audio.exists('sfx_daily_claim'))  sc.load.audio('sfx_daily_claim',  'sound/skill-2.mp3');
  if (!sc.cache.audio.exists('sfx_enhance_ng'))   sc.load.audio('sfx_enhance_ng',   'sound/test-fail.mp3');
  if (!sc.cache.audio.exists('sfx_purchase'))     sc.load.audio('sfx_purchase',     'sound/openChest.mp3');
  if (!sc.cache.audio.exists('sfx_battle_start')) sc.load.audio('sfx_battle_start', 'sound/openMap.mp3');
  if (!sc.cache.audio.exists('sfx_shop_open'))    sc.load.audio('sfx_shop_open',    'sound/opendoor.mp3');
}

// ── Battle (GameScene) assets ──────────────────────────────────────────────────

export function clearBattleSkins(sc: S): void {
  ['player', 'partner'].forEach(prefix => {
    ['idle_shadow', 'run_shadow', 'attack_shadow', 'run_attack_shadow', 'hurt', 'death_shadow'].forEach(suffix => {
      const k = `${prefix}_${suffix}`;
      if (sc.textures.exists(k)) sc.textures.remove(k);
    });
    ['idle_down', 'idle_up', 'idle_left', 'idle_right',
     'run_down',  'run_up',  'run_left',  'run_right',
     'attack_down', 'attack_up', 'attack_left', 'attack_right',
     'run_attack_down', 'run_attack_up', 'run_attack_left', 'run_attack_right',
     'multihit_down', 'multihit_up', 'multihit_left', 'multihit_right',
     'hurt', 'whirlwind',
    ].forEach(suffix => {
      const k = `${prefix}_${suffix}`;
      if (sc.anims.exists(k)) sc.anims.remove(k);
    });
  });
}

export function queueBattleAssets(sc: S, ownSkinId: number, partnerSkinId: number): void {
  const cfg = { frameWidth: 64, frameHeight: 64 };

  loadSkinTextures(sc, ownSkinId,     'player');
  loadSkinTextures(sc, partnerSkinId, 'partner');

  // Slimes
  const s1 = 'sprite/slime/PNG/Slime1/With_shadow/';
  if (!sc.textures.exists('slime_idle'))   sc.load.spritesheet('slime_idle',   s1 + 'Slime1_Idle_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime_walk'))   sc.load.spritesheet('slime_walk',   s1 + 'Slime1_Walk_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime_run'))    sc.load.spritesheet('slime_run',    s1 + 'Slime1_Run_with_shadow.png',    cfg);
  if (!sc.textures.exists('slime_attack')) sc.load.spritesheet('slime_attack', s1 + 'Slime1_Attack_with_shadow.png', cfg);
  if (!sc.textures.exists('slime_hurt'))   sc.load.spritesheet('slime_hurt',   s1 + 'Slime1_Hurt_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime_death'))  sc.load.spritesheet('slime_death',  s1 + 'Slime1_Death_with_shadow.png',  cfg);
  const s2 = 'sprite/slime/PNG/Slime2/With_shadow/';
  if (!sc.textures.exists('slime2_idle'))   sc.load.spritesheet('slime2_idle',   s2 + 'Slime2_Idle_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime2_walk'))   sc.load.spritesheet('slime2_walk',   s2 + 'Slime2_Walk_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime2_run'))    sc.load.spritesheet('slime2_run',    s2 + 'Slime2_Run_with_shadow.png',    cfg);
  if (!sc.textures.exists('slime2_attack')) sc.load.spritesheet('slime2_attack', s2 + 'Slime2_Attack_with_shadow.png', cfg);
  if (!sc.textures.exists('slime2_hurt'))   sc.load.spritesheet('slime2_hurt',   s2 + 'Slime2_Hurt_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime2_death'))  sc.load.spritesheet('slime2_death',  s2 + 'Slime2_Death_with_shadow.png',  cfg);
  const s3 = 'sprite/slime/PNG/Slime3/With_shadow/';
  if (!sc.textures.exists('slime3_idle'))   sc.load.spritesheet('slime3_idle',   s3 + 'Slime3_Idle_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime3_walk'))   sc.load.spritesheet('slime3_walk',   s3 + 'Slime3_Walk_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime3_run'))    sc.load.spritesheet('slime3_run',    s3 + 'Slime3_Run_with_shadow.png',    cfg);
  if (!sc.textures.exists('slime3_attack')) sc.load.spritesheet('slime3_attack', s3 + 'Slime3_Attack_with_shadow.png', cfg);
  if (!sc.textures.exists('slime3_hurt'))   sc.load.spritesheet('slime3_hurt',   s3 + 'Slime3_Hurt_with_shadow.png',   cfg);
  if (!sc.textures.exists('slime3_death'))  sc.load.spritesheet('slime3_death',  s3 + 'Slime3_Death_with_shadow.png',  cfg);

  // Plants
  for (const n of [1, 2, 3]) {
    const pb = `sprite/flower/PNG/Plant${n}/With_shadow/Plant${n}`;
    const pk = `plant${n}`;
    if (!sc.textures.exists(`${pk}_idle`))   sc.load.spritesheet(`${pk}_idle`,   `${pb}_Idle_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${pk}_attack`)) sc.load.spritesheet(`${pk}_attack`, `${pb}_Attack_with_shadow.png`, cfg);
    if (!sc.textures.exists(`${pk}_hurt`))   sc.load.spritesheet(`${pk}_hurt`,   `${pb}_Hurt_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${pk}_death`))  sc.load.spritesheet(`${pk}_death`,  `${pb}_Death_with_shadow.png`,  cfg);
  }

  // Orcs
  for (const n of [1, 2, 3]) {
    const ob = `sprite/orc/PNG/Orc${n}/With_shadow/orc${n}`;
    const ok = `orc${n}`;
    if (!sc.textures.exists(`${ok}_idle`))   sc.load.spritesheet(`${ok}_idle`,   `${ob}_idle_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${ok}_walk`))   sc.load.spritesheet(`${ok}_walk`,   `${ob}_walk_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${ok}_run`))    sc.load.spritesheet(`${ok}_run`,    `${ob}_run_with_shadow.png`,    cfg);
    if (!sc.textures.exists(`${ok}_attack`)) sc.load.spritesheet(`${ok}_attack`, `${ob}_attack_with_shadow.png`, cfg);
    if (!sc.textures.exists(`${ok}_hurt`))   sc.load.spritesheet(`${ok}_hurt`,   `${ob}_hurt_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${ok}_death`))  sc.load.spritesheet(`${ok}_death`,  `${ob}_death_with_shadow.png`,  cfg);
  }

  // Vampires
  for (const n of [1, 2, 3]) {
    const vb = `sprite/vampire/PNG/Vampires${n}/With_shadow/Vampires${n}`;
    const vk = `vampire${n}`;
    if (!sc.textures.exists(`${vk}_idle`))   sc.load.spritesheet(`${vk}_idle`,   `${vb}_Idle_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${vk}_run`))    sc.load.spritesheet(`${vk}_run`,    `${vb}_Run_with_shadow.png`,    cfg);
    if (!sc.textures.exists(`${vk}_attack`)) sc.load.spritesheet(`${vk}_attack`, `${vb}_Attack_with_shadow.png`, cfg);
    if (!sc.textures.exists(`${vk}_hurt`))   sc.load.spritesheet(`${vk}_hurt`,   `${vb}_Hurt_with_shadow.png`,   cfg);
    if (!sc.textures.exists(`${vk}_death`))  sc.load.spritesheet(`${vk}_death`,  `${vb}_Death_with_shadow.png`,  cfg);
  }

  // Icons & items
  if (!sc.textures.exists('icon_stone_broken'))   sc.load.image('icon_stone_broken',   'other/ore2.webp');
  if (!sc.textures.exists('icon_stone_intact'))   sc.load.image('icon_stone_intact',   'other/ore1.webp');
  if (!sc.textures.exists('icon_stone_guard'))    sc.load.image('icon_stone_guard',    'other/ore3.webp');
  if (!sc.textures.exists('icon_quest_reroll'))   sc.load.image('icon_quest_reroll',   'other/ore4.webp');
  if (!sc.textures.exists('icon_equip_drop'))     sc.load.image('icon_equip_drop',     'equip/weapons/Icons/Iicon_32_01.png');
  if (!sc.textures.exists('icon_ticket_slime'))   sc.load.image('icon_ticket_slime',   'icon1/PNG/Transperent/Icon21.png');
  if (!sc.textures.exists('icon_ticket_flower'))  sc.load.image('icon_ticket_flower',  'icon1/PNG/Transperent/Icon37.png');
  if (!sc.textures.exists('icon_ticket_orc'))     sc.load.image('icon_ticket_orc',     'icon1/PNG/Transperent/Icon44.png');
  if (!sc.textures.exists('icon_ticket_vampire')) sc.load.image('icon_ticket_vampire', 'icon1/PNG/Transperent/Icon42.png');
  for (let i = 1; i <= 40; i++) {
    const key = `equip_sword${i}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/Iicon_32_${String(i).padStart(2, '0')}.png`);
  }
  for (let i = 1; i <= 30; i++) {
    const key = `equip_sword${i + 40}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/icon_32_2_${String(i).padStart(2, '0')}.png`);
  }
  for (let i = 1; i <= 4; i++) {
    const key = `equip_legendary_sw${i}`;
    if (!sc.textures.exists(key))
      sc.load.image(key, `equip/weapons/Icons/red/sw${i}.png`);
  }
  if (!sc.textures.exists('icon_gold'))     sc.load.image('icon_gold',     'other/coin.webp');
  if (!sc.textures.exists('potions_sheet'))
    sc.load.spritesheet('potions_sheet', 'items/potions.png', { frameWidth: 16, frameHeight: 16 });
  if (!sc.textures.exists('chests'))
    sc.load.spritesheet('chests', 'items/RPG Chests.png', { frameWidth: 32, frameHeight: 32 });

  // Audio
  if (!sc.cache.audio.exists('sfx_hit'))          sc.load.audio('sfx_hit',          'sound/hit2.mp3');
  if (!sc.cache.audio.exists('sfx_open_chest'))   sc.load.audio('sfx_open_chest',   'sound/test-openChest.mp3');
  if (!sc.cache.audio.exists('sfx_pickup'))       sc.load.audio('sfx_pickup',       'sound/test-toggle.mp3');
  if (!sc.cache.audio.exists('sfx_map3'))         sc.load.audio('sfx_map3',         'sound/map3.mp3');
  if (!sc.cache.audio.exists('sfx_map4'))         sc.load.audio('sfx_map4',         'sound/map4.mp3');
  if (!sc.cache.audio.exists('sfx_boss_bgm'))     sc.load.audio('sfx_boss_bgm',     'sound/boss-bgm.mp3');
  if (!sc.cache.audio.exists('sfx_boss_roar'))    sc.load.audio('sfx_boss_roar',    'sound/Boss-start.mp3');
  if (!sc.cache.audio.exists('sfx_level_up'))     sc.load.audio('sfx_level_up',     'sound/success.mp3');
  if (!sc.cache.audio.exists('sfx_player_hurt'))  sc.load.audio('sfx_player_hurt',  'sound/test-close.mp3');
  if (!sc.cache.audio.exists('sfx_boss_death'))   sc.load.audio('sfx_boss_death',   'sound/boss-death.mp3');
  if (!sc.cache.audio.exists('sfx_player_dead'))  sc.load.audio('sfx_player_dead',  'sound/test-fail.mp3');
  if (!sc.cache.audio.exists('sfx_potion'))       sc.load.audio('sfx_potion',       'sound/plus.mp3');
  if (!sc.cache.audio.exists('sfx_swing1'))       sc.load.audio('sfx_swing1',       'sound/swing-1.mp3');
  if (!sc.cache.audio.exists('sfx_swing2'))       sc.load.audio('sfx_swing2',       'sound/swing-2.mp3');
  if (!sc.cache.audio.exists('sfx_swing3'))       sc.load.audio('sfx_swing3',       'sound/swing-3.mp3');
  if (!sc.cache.audio.exists('sfx_swing4'))       sc.load.audio('sfx_swing4',       'sound/swing-4.mp3');
  if (!sc.cache.audio.exists('sfx_swing5'))       sc.load.audio('sfx_swing5',       'sound/skill-2.mp3');
}
