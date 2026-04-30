export enum BulletType {
  LINEAR = 'LINEAR',
  PIERCING = 'PIERCING',
  STRIKE = 'STRIKE',
}

export enum Element {
  FIRE = 'FIRE',
  ICE = 'ICE',
  THUNDER = 'THUNDER',
}

export const ElementTint: Record<Element, number> = {
  [Element.FIRE]: 0xff4422,
  [Element.ICE]: 0x44aaff,
  [Element.THUNDER]: 0xffdd00,
};

export interface WeaponDef {
  id: string;
  name: string;
  /** Minimum ms between shots (prevents double-fire on a single tap) */
  fireRate: number;
  bulletType: BulletType;
  element: Element;
  range: number;
  damage: number;
  maxAmmo: number;
  /** ms to recharge one bullet */
  reloadTime: number;
}

export const WEAPONS: Record<string, WeaponDef> = {
  FIRE_CROSSBOW: {
    id: 'FIRE_CROSSBOW',
    name: '火之弩',
    fireRate: 150,
    bulletType: BulletType.LINEAR,
    element: Element.FIRE,
    range: 300,
    damage: 15,
    maxAmmo: 5,
    reloadTime: 1000,
  },
  ICE_STAFF: {
    id: 'ICE_STAFF',
    name: '冰法杖',
    fireRate: 200,
    bulletType: BulletType.PIERCING,
    element: Element.ICE,
    range: 250,
    damage: 12,
    maxAmmo: 3,
    reloadTime: 1800,
  },
  THUNDER_HAMMER: {
    id: 'THUNDER_HAMMER',
    name: '雷之錘',
    fireRate: 300,
    bulletType: BulletType.STRIKE,
    element: Element.THUNDER,
    range: 200,
    damage: 25,
    maxAmmo: 2,
    reloadTime: 3000,
  },
};
