# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Vencord userplugin** that cleans up Discord's *native* game detection on
Linux. It is not a standalone app: it has no `package.json` and is built by
Vencord.

The native Linux client identifies Wine/Proton games against the detectable
database itself, but its heuristic also reports every unidentified process it
suspects is a game (launchers, updaters, webviews, pressure-vessel's
`srt-bwrap`, `wine`, `wineserver`) as id-less games. Those clutter Registered
Games and can take the "Playing" slot. Separately, an install whose folder
layout breaks the database's path suffix (e.g. Honkai: Star Rail expects
`games/starrail.exe`) is only ever reported as unidentified. This plugin drops
id-less detections and lets the user map such executables to their games.

## Build / develop

There is no build inside this repo. The plugin must live inside a Vencord
checkout and be built from there. Clone it into `Vencord/src/userplugins` under
the name `wineGameDetection`:

```bash
cd Vencord/src/userplugins
git clone <repo> wineGameDetection
pnpm build                            # run from the Vencord root
```

Type-checking, linting, and bundling all rely on the surrounding Vencord
toolchain; the `@utils/*`, `@webpack/*`, `@components/*`, and `@api/*` imports
resolve only within that checkout. Cloned directly into `src/userplugins`, the
plugin is covered by Vencord's root `tsconfig.json` and needs no config of its
own.

After building, reinject Vencord into the **official Discord desktop client**.
The plugin patches the native process scanner's callback, which exists only
there, so it does nothing on Vesktop or web.

## Architecture

Renderer only; there is no `native.ts`.

- **`index.ts`** holds the single webpack patch. In `RunningGameStore`'s
  `setObservedGamesCallback` handler, the entries that survive Discord's own
  non-game, observed-app (OBS, Spotify) and blocklist checks are assigned to the
  store's running-games list (`e=o;` in the minified source, anchored on
  `totalFromNative:...,entries:...}`). The patch routes that list through
  `filterDetected`. Every consumer (`getVisibleGame`, `ActivityTrackingStore`
  sessions, `gamesSeen` / Registered Games) derives from that internal list, so
  filtering there is the only place that reaches all of them. Store getters and
  the `RUNNING_GAMES_CHANGE` payload are too late: the store records
  `gamesSeen` from its internal list, not the payload.
- **`detection.ts`** owns `partitionDetected` (pure): keep entries with an
  application `id`; copy entries matching a user override with that game's
  `id`/`name`; keep id-less entries the user added through Discord's own "Add
  it!" (`RunningGameStore.getOverrideForGame(game)?.add`); everything else is
  unidentified. It also wraps Discord's `GameStore` (the detectable DB) and
  holds the latest unidentified snapshot for the settings UI.
- **`settings.tsx`** renders the override list and a picker over the
  unidentified snapshot. Overrides are keyed on the lowercased bare exe name.

Mapping works because `GameStore.findGame` resolves an entry by `id` before
any name or executable matching, so an id written onto a native entry makes
Discord treat it as that game everywhere. A mapping only applies to processes
the native scanner reports at all; anything it never reports cannot be mapped.

Override and mapping changes apply on the scanner's next report (seconds). The
patch itself needs a Discord restart after enabling the plugin.

## Conventions specific to this repo

- Never filter or rewrite native detections anywhere other than the patched
  callback; partial filtering desynchronizes the store's derived views.
- Keep the patch match anchored on stable property names
  (`totalFromNative`, `entries`) and `\i` for minified identifiers.
