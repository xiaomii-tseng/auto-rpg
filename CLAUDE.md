# auto-rpg — Codebase Reference

Angular 21 + Phaser 3.90 PWA action RPG (Hero Siege / Path of Exile style — top-down ARPG with minions, loot, skills). Multiplayer via Colyseus. Backend on Render.

---

## Stack & Config

| Item | Value |
|---|---|
| Angular | 21.2 |
| Phaser | 3.90 |
| Colyseus client | 0.16 |
| TypeScript | 5.9, strict, ES2022 |
| Output | `dist/auto-rpg/browser` |
| Assets | all files from `public/` |
| Styles | `src/styles.scss` |
| Service worker | `ngsw-config.json` (prod only) |
| Dev server | `ng serve` → localhost:4200 |
| Backend WS/API | `server/` on :3001 |

**Environments:**
- [environment.ts](src/environments/environment.ts) — `{ wsUrl: 'ws://localhost:3001', apiUrl: 'http://localhost:3001' }`
- [environment.uat.ts](src/environments/environment.uat.ts) — `{ wsUrl: 'wss://minirpg-q1zq.onrender.com', apiUrl: 'https://minirpg-q1zq.onrender.com' }`

**Build configs:** `production`, `development`, `uat` (in angular.json). `uat` uses environment.uat.ts.

---

## Directory Map

```
src/app/
├── app.ts                        # Root component; AfterViewInit → new Phaser.Game(); scene registry
├── app.config.ts                 # Angular providers (PWA, service worker, router)
├── auth/
│   ├── auth.component.ts         # Login/register UI (Angular component)
│   ├── auth.service.ts           # JWT session mgmt, AuthUser interface
│   └── save-sync.service.ts      # Dirty-flag server sync via POST /save
├── game/
│   ├── scenes/                   # All Phaser scenes (see §Scenes)
│   ├── objects/                  # Phaser game objects (Player, Boss + subclasses, projectiles)
│   ├── data/                     # Singleton store modules + static data tables (see §Stores)
│   ├── ui/
│   │   ├── joystick.ts           # VirtualJoystick (mobile touch controller)
│   │   └── item-cell.ts          # ItemCell (inventory cell renderer)
│   ├── network/
│   │   └── network.service.ts    # Colyseus client (NetworkService @Injectable root)
│   ├── market/
│   │   ├── market.component.ts   # Angular trading post overlay
│   │   ├── market.component.scss
│   │   ├── market.service.ts     # REST /market/* wrapper
│   │   └── market-visibility.service.ts  # Signal<boolean> open/close
│   ├── report/
│   │   ├── report.component.ts   # Battle report Angular overlay
│   │   └── report-visibility.service.ts  # Signal<boolean> open/close
│   └── version.ts                # Version string constant
├── environments/
│   ├── environment.ts
│   └── environment.uat.ts
└── main.ts                       # Angular bootstrap entry

shared/
└── types.ts                      # All client↔server interfaces and message types

server/
├── src/
│   ├── index.ts                  # Express app, all HTTP routes
│   ├── rooms/
│   │   ├── GameRoom.ts           # Colyseus game room (maxClients=3)
│   │   ├── GameRoomSchema.ts     # Colyseus @schema decorators
│   │   └── TownRoom.ts           # Town hub room (maxClients=30)
│   ├── codeRegistry.ts           # 4-letter room code ↔ roomId map
│   └── supabaseClient.ts         # Supabase admin client (service role)

scripts/
└── make-protected.js             # Re-applies hand-patched overrides after Angular codegen
```

---

## Scene Registry & Lifecycle

Registered in [app.ts](src/app/app.ts):
```ts
scene: [TownLoadingScene, PrepScene, BattleLoadScene, GameScene, TowerScene]
```

| Scene key | File | Role |
|---|---|---|
| `TownLoadingScene` | `scenes/town-loading-scene.ts` | Loading screen (MIN 600ms) → launches PrepScene |
| `PrepScene` | `scenes/prep-scene.ts` | Town hub — quests, inventory, skills, cards, party |
| `BattleLoadScene` | `scenes/battle-load-scene.ts` | Loading screen (MIN 600ms) → launches GameScene |
| `GameScene` | `scenes/game.scene.ts` | Quest/battle engine |
| `TowerScene` | `scenes/tower-scene.ts` | Endless tower (extends **GameScene**) |

**Flow:**
```
TownLoadingScene → PrepScene ↔ BattleLoadScene → GameScene → PrepScene
                       ↑                             ↓
                   TowerScene (loops floors) ────────┘
```

---

## Stores (`src/app/game/data/`)

All stores are **singleton modules** (no `@Injectable`) with pure functions. All state persisted via `SaveStore.save()`.

| Store | File | Purpose |
|---|---|---|
| `PlayerStore` | `player-store.ts` | Level, exp, equipment (equipped + owned), stats, favorites. `getStats()` returns `EffectiveStats`. `toggleFavorite(item)` / `isFavorite(item)` control sale/market protection. |
| `SaveStore` | `save-store.ts` | XOR+Base64 encrypt/decrypt → localStorage. `save()` snapshots all stores; `load()` restores them. |
| `CardStore` | `card-store.ts` | 3 card slots, stat bonuses, combo detection. |
| `InventoryStore` | `inventory-store.ts` | Gold and consumable items. |
| `QuestStore` | `quest-store.ts` | Status flow: `available → accepted → completed → claimed`. |
| `SkillTreeStore` | `skill-tree-store.ts` | Node unlock, `AttackModeId` selection. |
| `TowerStore` | `tower-store.ts` | Tower keys and best floor. |
| `DailyQuestStore` | `daily-quest-store.ts` | 3 quests/day (easy/normal/hard pools). `deal_damage` target = `level × 1000`. `addProgress(type, amount)` drives quest progress. |
| `SkinStore` | `skin-store.ts` | Active skin id; `loadSkinTextures(scene, skinId, keyPrefix)` loads 6 spritesheets. |
| `DismantlePrefsStore` | `dismantle-prefs-store.ts` | Auto-dismantle filter by quality/slot. |
| `PotionBarStore` | `potion-bar-store.ts` | 2-slot potion hotbar. |
| `TutorialStore` | `tutorial-store.ts` | Per-key viewed flags. |
| `AudioService` | `audio.service.ts` | BGM + throttled SFX playback. |

---

## Angular Services (`@Injectable providedIn: 'root'`)

| Service | File | Purpose |
|---|---|---|
| `AuthService` | `auth/auth.service.ts` | JWT login/register, session management |
| `SaveSyncService` | `auth/save-sync.service.ts` | Dirty-flag upload to server after `SaveStore.save()` |
| `NetworkService` | `game/network/network.service.ts` | Colyseus client — game room + town room |
| `MarketService` | `game/market/market.service.ts` | REST wrapper for `/market/*` |
| `MarketVisibilityService` | `game/market/market-visibility.service.ts` | `Signal<boolean>` overlay open/close |
| `ReportVisibilityService` | `game/report/report-visibility.service.ts` | `Signal<boolean>` overlay open/close |
| `AudioService` | `game/data/audio.service.ts` | BGM/SFX |

---

## Server (`server/src/`)

**Database:** Supabase PostgreSQL. Tables: `profiles`, `player_saves`, `tower_leaderboard`, `market_listings`

**HTTP Routes:**
```
GET  /health
GET  /room/:code                     → lookup 4-digit code → roomId
POST /auth/register
POST /auth/login                     → JWT + sessionId
POST /auth/change-password
POST /auth/refresh
GET  /save                           → retrieve encrypted save (requireAuth)
POST /save                           → upsert save (rate limited)
POST /report                         → bug report → Discord webhook
GET  /leaderboard/tower?limit=50
POST /leaderboard/tower
GET  /leaderboard/level?limit=50
GET  /market/listings
GET  /market/my-listings
POST /market/list
POST /market/buy/:id                 → atomic Supabase RPC: buy_listing
DELETE /market/list/:id
```

**Rate limits:** Auth: 10/15min · Save: 20/1min · Report: 3/10min · Market: 30/1min

**Rooms:** `GameRoom` (maxClients=3) — host authority over minions/boss. `TownRoom` (maxClients=30) — idle presence + party formation.

---

## Key Architectural Patterns

- **Store pattern** — All game state in singleton modules. `SaveStore.save()` snapshots everything → localStorage (XOR+Base64). Server sync via `SaveSyncService.markDirty()` after save.
- **Seeded RNG** — `SeededRNG` (Park-Miller LCG) in `GameScene` ensures deterministic drops in co-op; seed shared via `GameStartPayload`.
- **Co-op host authority** — Host owns minion positions (100ms sync) and boss HP/state. Guest receives and applies server state via `applyServerState()` / `applyServerHp()`.
- **Co-op scaling** — `GameScene` accepts `playerCount` 1–4; boss HP/stats scale. NetworkService supports 3+ players via `getPartnersState()`.
- **DPR scaling** — `(window as any).__gameDpr` stores device pixel ratio; Phaser canvas sized accordingly. `P(n)` utility function multiplies by DPR.
- **TowerScene extends GameScene** — Reuses all battle logic; overrides `create()`, `handleBossDefeated()`, floor transitions.
- **BossState machine** — `setBossState()` drives all boss behavior. Subclasses override `applyUniqueState()` for custom attacks.
- **Ally damage routing** — `hitInRadius()` / `hitGlobal()` helpers for AoE; `_allyMinions` roster capped at 3 in GameScene.
- **Phaser input priority** — Within a container, objects added **later** have **higher** input priority. When a small hit zone must win over a large tap zone, add the small hit zone last.
- **Protected scripts** — `scripts/make-protected.js` re-applies hand-patched changes that Angular codegen would overwrite.
- **PWA** — `ngsw-config.json` + `@angular/service-worker`; offline-capable with version checking.
- **Market atomicity** — Buy listing via Supabase RPC `buy_listing(p_listing_id, p_buyer_user_id)` for race-condition safety.
- **Town hub** — Separate `TownRoom` (max 30) for idle multiplayer presence, party formation, and invite flow. Independent of GameRoom lifecycle.
- **Favorites protection** — `item.favorite` flag on `EquipmentItem` persisted in save data. Checked in: single sell button, batch dismantle `getEligibleItems()`, market listing filter.

---

## 版本管理與遊戲內更新日誌

### 版本號 (`src/app/game/version.ts`)
```ts
export const VERSION = 'v1.x.x';
```
版本號顯示在更新日誌 popup 右上角。**每次發版時同步更新這裡。**

### 外部 CHANGELOG (`CHANGELOG.md`)
專案根目錄的 `CHANGELOG.md`，供開發者查閱。格式：
```
## v1.x.x (YYYY-MM-DD)
### 修復 / 新功能 / 調整
- 條目
```

### 遊戲內更新日誌 popup (`PrepScene.showChangelog()`)
- **觸發時機**：進入 PrepScene 時，若 `sessionStorage` 中沒有 `changelog_shown` key 則彈出；彈出後立刻寫入 key，同一 session 不再重複顯示。
- **位置**：`src/app/game/scenes/prep-scene.ts` → `private showChangelog()`
- **內容**：函式內的 `ENTRIES` 陣列，每個條目為 `{ text: string; header?: boolean }`；`header: true` 用金色大字顯示版本標題，普通條目用棕色小字。

**發版 SOP（三處必須同步）：**
1. `version.ts` — 更新版本字串（如 `v1.0.2`）
2. `CHANGELOG.md` — 在最上方新增版本區塊
3. `showChangelog()` 的 `ENTRIES` — 在最前面插入新版本的 header + 條目；舊版本保留在下方

`ENTRIES` 範例：
```ts
const ENTRIES: { text: string; header?: boolean }[] = [
  { text: 'v1.0.2', header: true },
  { text: '【修復】xxx' },
  { text: '【新功能】yyy' },
  { text: '' },                        // 空行分隔
  { text: 'v1.0.1', header: true },
  { text: '【修復】連線復活後有機率無法攻擊，已修正' },
  // ...
];
```
