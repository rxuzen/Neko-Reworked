# Neko — Minimalist Components V2 Anime Discord Bot

**Neko** is a high-performance, anime-themed Discord bot built on **Bun** and **TypeScript 7 (`tsgo`)**, powered by **Discord.js v14.28** and the **Sapphire Framework**.

Every user-facing interaction strictly uses **Discord Components V2 (`MessageFlags.IsComponentsV2`)** with a colorless, high-contrast `KEY` / `Value` card layout, top navigation tabs, and dynamic context footers—zero legacy embeds or slash subcommand trees.

---

## Key Features

### 1. Standalone Anime, Manga & Character Discovery (Global Autocomplete)
* **`/anime <query>`**: Instant Redis-cached autocomplete across AniList with fallback to Jikan (MyAnimeList). Switch seamlessly between `OVERVIEW`, `CHARACTERS`, `RELATIONS`, `THEMES` (OP/ED songs, artists, and WebM links via **AnimeThemes.moe**), and `STATS`, with live `[ AIRING ]` countdowns and one-click watchlist alerts.
* **`/manga <query>`**: Inspect manga and light novels across `OVERVIEW`, `CHARACTERS`, and `ADAPTATIONS` tabs with spoiler-safe synopses.
* **`/character <query>`**: Explore anime/manga characters across `OVERVIEW`, `VOICE ACTORS` (Japanese & English Seiyuu links), and `APPEARANCES`, complete with live `/gacha` card ownership and star ascension badges (`[ OWNED ★★★☆☆ ]`).
* **`/schedule [day]`**: Timezone-aware broadcast schedules across `TODAY`, `UPCOMING`, and `MY WATCHLIST`.
* **`/sauce [image] [url]`**: Reverse image and anime screenshot attribution powered by **SauceNAO** with automatic quota tracking and **Trace.moe** fallback.
* **`/social <action> [user]`**: Expressive anime reaction GIFs (`hug`, `pat`, `poke`, `bonk`, `blush`, `wave`, `highfive`, `smile`, `cuddle`, `slap`) with instant re-rolls and a right-click **`Quick Social Action`** user context menu.

### 2. Merged Components V2 Hubs
* **`/profile [user]` (`OVERVIEW` | `COMPANION` | `CAREER` | `CUSTOMIZE`)**:
  * **Neko Companion System**: Equip your Neko familiar or any pulled `/gacha` character as an active partner. Give headpats, feed Matsuri treats, level up Bond (Lv. 1–25) for passive XP/Coin multipliers, and dispatch your partner on timed **Neko Expeditions** for Gacha Shards.
  * **Careers & Bio Customization**: Work 5 specialized anime industry careers (up to Lv. 50), equip `[ NEKO ]` titles, edit your bio via a Zod-validated modal, or right-click any member via **`View Neko Profile`**.
* **`/settings` (`GENERAL` | `NOTIFICATIONS` | `PRIVACY`)**:
  * Configure `ROMAJI` vs `ENGLISH` title preferences, personal timezone, DM notification toggles, and `publicWallet` privacy.
* **`/economy` (`WALLET` | `SHOP` | `QUESTS` | `TRANSFER`)**:
  * Full financial ledger with an **Anti-Rob Vault**, permanent multiplier upgrades, Matsuri snacks, daily/weekly shrine commissions, and Level 5+ gated P2P transfers, 48-hour micro-loans, and heists.
* **`/gacha` (`ANILIST BANNER` | `POKEDEX BANNER` | `COLLECTION` | `TRADE`)**:
  * Summon across popularity-ranked AniList characters and BST-ranked National Dex Pokémon. Features soft/hard pity (`65 / 80`), a **3-Slot Rate-Up Wishlist** (`[ WISHLISTED ]`), **5-Star Ascension (`★☆☆☆☆` to `★★★★★`)** unlocking alternate art and Shiny Pokémon sprites (`[ ASCENDED ]`), and dual-locked P2P trading.
* **`/matsuri` (`SHRINE` | `BOOTHS` | `TRIVIA` | `LEADERBOARD`)**:
  * Unified Japanese festival hub featuring daily **Ema** check-in streaks, **Omikuji** sacred fortunes (`DAI-KICHI` `[ BLESSED ]` down to `KYOU` `[ CURSED ]` with pine-tree curse cleansing), festival minigame booths (*Goldfish Scooping*, *Lantern Toss*, *Taiko Drum*), and timed anime trivia.
* **`/staff` (`MOD` | `ADMIN` | `OWNER`)**:
  * Role-gated control panel for moderation warnings, **Server-Wide Anime Airing Notification Channel** binding, guild economy overrides, L1 cache flushing, and live **External API Circuit Breaker** diagnostics.
* **`/neko` (`GUIDE` | `ABOUT` | `CHANGELOG`)**:
  * Interactive command guide, runtime telemetry, and release changelog.

---

## Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Runtime** | [Bun](https://bun.sh) | Fast TypeScript execution, native SHA-256 hashing, and test runner (`bun test`). |
| **Compiler** | TypeScript 7 (`tsgo`) | Native Go-based type checking (`bunx tsgo --noEmit`). |
| **Discord Engine** | Discord.js `14.28.x` | Gateway client with Components V2 (`MessageFlags.IsComponentsV2`) support. |
| **Framework** | Sapphire Framework | Modular piece architecture (`commands`, `listeners`, `preconditions`, `interaction-handlers`, `utilities`). |
| **Database & ORM** | PostgreSQL + Drizzle ORM | 10 relational schema tables with atomic SQL arithmetic transactions. |
| **Cache & Locks** | Redis (`ioredis`) | L2 cache, atomic Lua cooldowns, single/dual action locks, and API circuit breakers. |
| **Validation & Logs** | Zod + Pino + Chalk | Startup environment validation, modal checks, and structured logging. |
| **Linter & Formatter** | Biome | Single binary formatting and linting (`bunx biome check --write .`). |

---

## Command Reference

| Command | Type | Tabs / Controls | Description |
| :--- | :--- | :--- | :--- |
| `/anime <query>` | Standalone (Autocomplete) | `OVERVIEW` \| `CHARACTERS` \| `RELATIONS` \| `THEMES` \| `STATS` | Anime details, live airing countdowns, OP/ED themes, watchlist toggle. |
| `/manga <query>` | Standalone (Autocomplete) | `OVERVIEW` \| `CHARACTERS` \| `ADAPTATIONS` | Manga & light novel details, chapters, volumes, and adaptations. |
| `/character <query>` | Standalone (Autocomplete) | `OVERVIEW` \| `VOICE ACTORS` \| `APPEARANCES` | Character bio, JP/EN Seiyuu links, and live `/gacha` collection status. |
| `/schedule [day]` | Standalone (Autocomplete) | `TODAY` \| `UPCOMING` \| `MY WATCHLIST` | Timezone-adjusted airing anime broadcast schedule. |
| `/sauce [image] [url]` | Standalone | Match Pagination (`◀ Prev` / `Next ▶`) | Reverse image & screenshot lookup via SauceNAO & Trace.moe. |
| `/social <action> [user]` | Standalone (Autocomplete) | `Re-roll GIF` + Action Switcher | Anime reaction GIFs via NekosBest & OtakuGIFs. |
| `/profile [user]` | Merged CV2 Hub | `OVERVIEW` \| `COMPANION` \| `CAREER` \| `CUSTOMIZE` | User profile, Neko Companion bond/expeditions, career shifts, bio/titles. |
| `/settings` | Merged CV2 Hub | `GENERAL` \| `NOTIFICATIONS` \| `PRIVACY` | Title language (`ROMAJI`/`ENGLISH`), timezone, DM alerts, wallet privacy. |
| `/economy` | Merged CV2 Hub | `WALLET` \| `SHOP` \| `QUESTS` \| `TRANSFER` | Coins, Anti-Rob Vault, shop upgrades, quests, transfers, loans, heists. |
| `/gacha` | Merged CV2 Hub | `ANILIST BANNER` \| `POKEDEX BANNER` \| `COLLECTION` \| `TRADE` | Summons, 65/80 pity, 3-slot wishlist, 5-star ascension, P2P trading. |
| `/matsuri` | Merged CV2 Hub | `SHRINE` \| `BOOTHS` \| `TRIVIA` \| `LEADERBOARD` | Shrine Ema check-in, Omikuji fortunes, festival booths, anime trivia. |
| `/staff` | Merged CV2 Hub (Role-Gated) | `MOD` \| `ADMIN` \| `OWNER` | Case logs, server airing notification channel config, circuit breakers. |
| `/neko` | Merged CV2 Hub | `GUIDE` \| `ABOUT` \| `CHANGELOG` | Interactive category guide, runtime telemetry, and release notes. |

---

## Quickstart & Development

### 1. Prerequisites
* **[Bun](https://bun.sh)** `v1.4+`
* **PostgreSQL** `15+`
* **Redis** `7+`

### 2. Installation
```bash
bun install
```

### 3. Environment Configuration
Copy `.env.example` to `.env` and fill in your credentials:
```bash
cp .env.example .env
```

| Variable | Required | Description |
| :--- | :---: | :--- |
| `DISCORD_TOKEN` | Yes | Discord Bot Token from the Discord Developer Portal. |
| `DATABASE_URL` | Yes | PostgreSQL connection string (`postgresql://user:pass@localhost:5432/neko`). |
| `REDIS_URL` | Yes | Redis connection string (`redis://localhost:6379`). |
| `SAUCENAO_API_KEY` | Optional | SauceNAO API key for `/sauce` (falls back to Trace.moe when omitted). |
| `OWNER_IDS` | Optional | Comma-separated Discord User Snowflakes for `/staff` `OWNER` clearance. |
| `CRITICAL_ALERT_WEBHOOK_URL` | Optional | Discord Webhook URL for `[ CRITICAL ]` CV2 runtime exception alerts. |

### 4. Common Scripts
```bash
# Start in development watch mode
bun run dev

# Start in production mode
bun run start

# Run TypeScript 7 (tsgo) type-checking
bun run typecheck

# Run Biome linter & formatter
bun run check

# Run the full unit & end-to-end QA test suite
bun test
```
