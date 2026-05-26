export type TutorialKey =
  | 'battleDone'   // 整個戰鬥教學走完（回主城才開始主城教學）
  | 'move'         // 搖桿移動
  | 'attack'       // 攻擊按鈕
  | 'potion'       // 撿到藥水
  | 'equip'        // 撿到裝備
  | 'card'         // 撿到卡片
  | 'brokenStone'  // 撿到破損強化石
  | 'shop'         // 商店
  | 'market'       // 市場
  | 'ranking'      // 排行榜
  | 'altar'        // 祭祀台
  | 'wardrobe'     // 更換造型
  | 'quest'        // 出戰（星級/種族）
  | 'skill';       // 技能/攻擊模式

let _flags: Partial<Record<TutorialKey, boolean>> = {};

export const TutorialStore = {
  isDone(key: TutorialKey): boolean {
    return !!_flags[key];
  },

  markDone(key: TutorialKey): void {
    _flags[key] = true;
  },

  /** 新玩家 = 戰鬥教學還沒走過 */
  isNewPlayer(): boolean {
    return !_flags['battleDone'];
  },

  getSaveData(): Partial<Record<TutorialKey, boolean>> {
    return { ..._flags };
  },

  loadSaveData(data: Partial<Record<TutorialKey, boolean>>): void {
    _flags = { ...data };
  },
};
