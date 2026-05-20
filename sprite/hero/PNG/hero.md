# Pixel Art RPG Sprite Sheet Overpaint Production Rules

# 核心目標

本規則用於製作「正式遊戲可用」的 Pixel Art RPG Sprite Sheet。

AI 的工作是：

「在原始 sprite 上換裝（Overpaint）」

不是：

「重新生成一個新角色」

---

# Production Pipeline 原則

所有素材必須：

- 可直接導入遊戲引擎
- 可直接切 frame
- 可直接播放動畫
- 不需人工修正 frame
- 不需重新對位
- 不需重新排版

適用：

- Phaser.js
- Unity
- Godot
- RPG Maker
- Unreal 2D
- 自製引擎

---

# 第一級規則（最高優先權）

# 1. 必須以原始 Sprite Sheet 為底

AI 不可：

- 重畫整張圖
- 重建 sprite sheet
- 自動重新排版
- 自行增加畫布

AI 必須：

- 使用原始 sprite sheet
- 直接在原圖角色上 overpaint
- 保留所有原始結構

---

# 2. 絕對禁止改變圖片尺寸

原始 sprite sheet：

- 寬度不可改
- 高度不可改

輸出圖尺寸必須：

- 與原圖 100% 完全一致

例如：

原圖：

- 768 x 256

輸出：

- 必須也是 768 x 256

禁止：

- 放大
- 縮小
- 裁切
- 加邊界
- AI 自動擴畫布

---

# 3. 絕對禁止改變 Frame 格數

AI 必須先分析：

- row 數量
- column 數量
- frame 總數

並完全保留。

例如：

Idle：

- 4 rows
- 12 columns
- 共 48 frames

輸出也必須：

- 4 rows
- 12 columns
- 共 48 frames

禁止：

- 改成 8 frames
- 改成 6 frames
- 增加 rows
- 刪除 rows
- 任意重排

---

# 4. Frame 順序必須完全一致

AI 必須保留：

- frame index
- frame sequence
- animation timing

禁止：

- 自行重排 frame
- 改動畫順序
- 調換 pose

---

# 5. 每格座標必須固定

每個 sprite frame：

- X 座標不可變
- Y 座標不可變
- padding 不可變
- 對齊方式不可變

---

# 6. 角色中心點必須固定

角色：

- 腳底位置
- 身體中心
- 頭部高度

必須完全一致。

禁止：

- 上下漂移
- 左右漂移
- frame 抖動
- 身高改變

---

# 7. Shadow 必須完全保留

原圖 shadow：

- 不可重畫
- 不可刪除
- 不可位移
- 不可縮放
- 不可改透明度

shadow 必須直接沿用原圖。

---

# 第二級規則（透明背景）

# 8. 背景必須透明

輸出：

- Transparent PNG

禁止：

- 黑底
- 白底
- 灰底
- 漸層背景
- vignette
- 發光背景
- AI 自動補背景

---

# 9. 不可產生新畫布背景

AI 不可：

- 生成新的背景圖層
- 自動畫環境
- 自動畫光影背景

Sprite sheet 必須只有：

- 角色
- 原始 shadow
- transparent background

---

# 第三級規則（Overpaint）

# 10. 必須逐格 Overpaint

AI 必須：

- 使用原始 frame
- 保持原始 pose
- 保持原始角度
- 保持原始動作

只允許修改：

- 裝備
- 髮型
- 面罩
- 武器
- 衣服
- 顏色

---

# 11. 禁止重新生成動作

不可：

- 重做動畫
- 自創 pose
- 改變揮刀方向
- 改變跑步節奏
- AI 自由發揮動作

---

# 12. 動畫 timing 必須固定

以下動畫：

- Idle
- Run
- Attack
- Run Attack
- Hurt
- Death
- Skill
- Dash

都必須：

- 保持原 timing
- 保持原節奏
- 保持原 transition

---

# 第四級規則（方向）

# 13. 面向順序固定

Sprite sheet row 順序：

1. Down（下）
2. Left（左）
3. Right（右）
4. Up（上）

AI 必須完全遵守。

禁止：

- 左右鏡像錯誤
- 把左當右
- 自行交換方向

---

# 14. 所有方向必須是同一角色

不同方向：

- 必須是同一套裝備
- 必須是同一髮型
- 必須是同一武器
- 必須是同一角色

禁止：

- 每個方向長不一樣
- AI 自行換設計

---

# 第五級規則（Pixel Art）

# 15. 保持原始 Pixel Density

不可：

- 模糊化
- AI 油畫化
- 半寫實化
- 自動抗鋸齒
- 平滑化

必須：

- crisp pixel
- 低解析度一致
- 保持原始像素感

---

# 16. 不可改變角色比例

角色：

- 頭身比
- 武器比例
- 身高
- 手腳長度

都必須維持原圖比例。

禁止：

- AI 自動大頭化
- AI 自動拉長腿
- AI 自動增加細節尺寸

---

# 第六級規則（角色設計）

# 17. 本專案角色設定

角色類型：

- Female Assassin（女刺客）

風格：

- 黑色輕甲
- 暗色皮革
- 金屬護甲點綴
- 敏捷感
- 匕首 / 短刀
- 可有面罩
- 可有披風
- 暗色系

---

# 18. 武器規則

武器：

- 必須保持原武器方向
- 不可改變武器動作
- 不可新增巨大特效

---

# 19. 特效規則

允許：

- 小型 slash effect
- 符合原圖的 attack effect

禁止：

- 大範圍魔法光效
- 粒子爆炸
- AI 特效背景

---

# 第七級規則（輸出）

# 20. 輸出格式

輸出必須：

- PNG
- Transparent
- Sprite Sheet
- 原尺寸
- 原 frame 配置

---

# 21. 可直接導入遊戲

輸出後：

- 可直接 import
- 不需人工修 frame
- 不需重新切圖
- 不需重新定位

---

# 最終禁止事項

# 22. 以下行為完全禁止

禁止：

- 黑底
- 新背景
- frame 跑位
- 改變圖片尺寸
- 改變 frame 數量
- 改變 row/column
- 改變動畫順序
- 改變角色比例
- 重做 pose
- AI 自由生成新角色
- 模糊化
- 半寫實化
- 油畫化
- 自動抗鋸齒
- 任意鏡像

---

# AI 執行原則（最重要）

AI 的工作：

「在原始 sprite 上換裝」

不是：

「重新生成一整套新的 sprite」
