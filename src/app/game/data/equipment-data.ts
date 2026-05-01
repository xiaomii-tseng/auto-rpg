export type EquipSlot = 'hat' | 'outfit' | 'shoes' | 'ring1' | 'ring2' | 'sword';

export type Element = 'none' | 'water' | 'fire' | 'grass';

export const ELEMENT_NAMES: Record<Element, string> = {
  none:  '無',
  water: '水',
  fire:  '火',
  grass: '草',
};

export const ELEMENT_COLORS: Record<Element, number> = {
  none:  0x888888,
  water: 0x44aaff,
  fire:  0xff5522,
  grass: 0x44cc44,
};

/** 攻擊屬性 vs 防禦屬性 → 傷害倍率。水剋火、火剋草、草剋水 */
export function getElementMultiplier(atk: Element, def: Element): number {
  if (atk === 'none' || def === 'none') return 1;
  if ((atk === 'water' && def === 'fire')  ||
      (atk === 'fire'  && def === 'grass') ||
      (atk === 'grass' && def === 'water')) return 1.35;
  if ((atk === 'fire'  && def === 'water') ||
      (atk === 'grass' && def === 'fire')  ||
      (atk === 'water' && def === 'grass')) return 0.75;
  return 1;
}

export interface StatBonus {
  atk?:       number;  // 攻擊力加成
  hp?:        number;  // 最大HP加成
  speed?:     number;  // 移動速度加成
  def?:       number;  // 防禦力（每次受傷減少傷害）
  crit?:      number;  // 爆擊率 0~1
  attackArc?: number;  // 攻擊角度加成（度數）
}

export interface Material {
  id:   string;
  name: string;
  qty:  number;
}

export interface EquipmentItem {
  id:        string;
  name:      string;
  slot:      EquipSlot;
  tier:      number;
  texture:   string;   // Phaser texture key
  stats:     StatBonus;
  materials: Material[];
  gold:      number;   // 製作所需金幣
  desc:      string;
  levelReq:  number;   // 解鎖製作所需等級
  element?:  Element;  // 武器屬性（非武器槽可忽略）
}

// ── Set 1 ─────────────────────────────────────────────────────────────────────

export const EQUIPMENT_ITEMS: EquipmentItem[] = [
  {
    id: 'hat_1', name: '草帽', slot: 'hat', tier: 1, texture: 'equip_hat1',
    stats: { def: 5 },
    desc: '防禦力 +5  每次受傷減少 5 點傷害',
    gold: 100, levelReq: 1,
    materials: [
      { id: 'slime_chunk',   name: '綠史萊姆碎塊', qty: 3 },
      { id: 'slime_essence', name: '綠史萊姆精華', qty: 1 },
    ],
  },
  {
    id: 'outfit_1', name: '長袖外套', slot: 'outfit', tier: 1, texture: 'equip_outfit1',
    stats: { hp: 50 },
    desc: '最大 HP +50',
    gold: 150, levelReq: 1,
    materials: [
      { id: 'slime_chunk',   name: '綠史萊姆碎塊', qty: 5 },
      { id: 'slime_essence', name: '綠史萊姆精華', qty: 1 },
    ],
  },
  {
    id: 'shoes_1', name: '皮靴', slot: 'shoes', tier: 1, texture: 'equip_shoes1',
    stats: { speed: 30 },
    desc: '移動速度 +30',
    gold: 120, levelReq: 2,
    materials: [
      { id: 'slime_chunk',   name: '綠史萊姆碎塊', qty: 4 },
      { id: 'slime_essence', name: '綠史萊姆精華', qty: 1 },
    ],
  },
  {
    id: 'ring_1', name: '蟲餌', slot: 'ring1', tier: 1, texture: 'equip_ring1',
    stats: { crit: 0.05 },
    desc: '爆擊率 +5%  爆擊傷害 ×2',
    gold: 200, levelReq: 3,
    materials: [
      { id: 'slime_chunk',   name: '綠史萊姆碎塊', qty: 2 },
      { id: 'slime_essence', name: '綠史萊姆精華', qty: 1 },
    ],
  },
  {
    id: 'sword_1', name: '木劍', slot: 'sword',  tier: 1, texture: 'equip_sword1',
    stats: { atk: 15 },
    desc: '攻擊力 +15',
    gold: 180, levelReq: 2,
    element: 'none',
    materials: [
      { id: 'slime_chunk',   name: '綠史萊姆碎塊', qty: 6 },
      { id: 'slime_essence', name: '綠史萊姆精華', qty: 2 },
    ],
  },
];
