# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A **Vencord userplugin** that reports Wine/Proton games to Discord's *native* game
detection on Linux, so playtime, streaks, and quests credit them as on Windows.
It is not a standalone app — it has no `package.json` and is built by Vencord.

The native client only detects `os: "linux"` executables, so Wine `.exe`
processes are invisible to it. RPC-based tools (arRPC/Vesktop) only set a
"Playing" status via `SET_ACTIVITY` and never create a game *session*, so
streaks/playtime/quests stay empty. This plugin restores the native session path
by injecting matched Wine games into `RunningGameStore`.

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
This plugin cannot work on Vesktop or web — only the native client can report
game sessions, and only the native (Node) process can read `/proc`.

## Architecture

Two execution contexts split across the Electron boundary:

- **`native.ts`** runs in Vencord's Node main process. It owns everything that
  needs OS access: fetching Discord's detectable-applications DB
  (`https://discord.com/api/v9/applications/detectable`) and reading
  `/proc/*/cmdline`. Exported functions become an IPC bridge.
- **`index.ts`** runs in the Discord renderer. It calls the native functions via
  `VencordNative.pluginHelpers.WineGameDetection` (typed as
  `PluginNative<typeof import("./native")>`), runs the scan loop, and manipulates
  `RunningGameStore`.
- **`detectable.ts`** (renderer) owns the detectable-app catalog: it fetches the
  DB through `native.ts`, indexes win32 non-launcher executables, and exposes
  `matchProcessPath` (used by `index.ts`) plus `getCatalog` / `getGameById` (used
  by the settings UI). It is a standalone module so `index.ts` and `settings.tsx`
  can share it without an import cycle.
- **`settings.tsx`** (renderer) defines `definePluginSettings` and the
  whitelist/blacklist UI, and exports `isReportable`, the filter `scan()` applies.

### The core problem this plugin solves

Making a Wine game visible to Discord requires more than dispatching
`RUNNING_GAMES_CHANGE`. Discord computes local presence and game sessions from a
*family* of `RunningGameStore` selectors. `index.ts` monkey-patches all of them
(`installStoreOverrides` / `overrideGetter`) so every consumer sees the Wine
game, keeping the originals in `originalGetters` to restore on `stop()`:

- `getRunningGames`, `getVisibleRunningGames` → merged game list
- `getVisibleGame` → falls back to a Wine game
- `getRunningDiscordApplicationIds`, `getRunningVerifiedApplicationIds` → merged IDs
- `getGameForPID` → resolves Wine PIDs

If you add or change behavior that depends on the store, account for *all* these
selectors — patching only `getRunningGames` will silently fail to create sessions.

### Matching logic

In `detectable.ts`, `pathVariants` / `matchProcessPath` mirror arRPC: compare
every trailing path-suffix of the process path (plus 64-bit-suffix-stripped
variants) against detectable entries' executable names. `indexCatalog` only
indexes `os === "win32"` non-launcher executables (the Windows binaries Wine
runs); a game with no such executable can never match through Wine and is left
out of the catalog entirely.

### Settings / filtering

`settings.tsx` exposes a `whitelistMode` toggle (rendered as the native
`FormSwitch`) plus two `OptionType.CUSTOM` string-id arrays, `whitelist` and
`blacklist`. A single `OptionType.COMPONENT` renders the searchable add-dropdown
(populated from `getCatalog()`) and the active list's rows (game name +
detection string + remove button), editing whichever list the mode selects.
`scan()` gates every match through the exported `isReportable(id)`: in whitelist
mode only listed ids pass, otherwise all matches pass except blacklisted ids. A
game that stops being reportable is simply never re-added to `seenIds`, so the
existing removal pass tears down its session on the next scan (≤ `SCAN_INTERVAL_MS`).

### Scan + re-assert loop

`scan()` runs every `SCAN_INTERVAL_MS` (5s): diff `/proc` Wine `.exe` processes
against the tracked `wineGames` map, then dispatch added/removed. The client's
own native scanner periodically dispatches its own `RUNNING_GAMES_CHANGE` that
*excludes* our entries; `onRunningGamesChange` detects that and re-asserts
missing Wine games. The `selfDispatch` flag guards against reacting to our own
dispatch (infinite loop).

## Conventions specific to this repo

- Native (`native.ts`) exported functions take a leading `_: unknown` placeholder
  argument — this is Vencord's `PluginNative` IPC calling convention; keep it.
  `PluginNative` strips that leading param (it stands in for the IPC event), so
  renderer call sites pass **no** argument for it: `Native.fetchDetectableDb()`,
  not `Native.fetchDetectableDb(undefined)`.
- Only `.exe` paths are bridged here; Linux-native detection is left to the
  client's own scanner. Don't broaden this without reason.
