# WineGameDetection

Reports Wine/Proton games to Discord's **native** game detection on Linux, so
playtime, streaks, and quests credit them the same way they do on Windows.

> [!NOTE]
> Observed July 2026: Discord's Linux client appears to be experimenting with
> native Wine game detection. It identified a running Wine executable on its
> own, but only after several minutes, and it initially reported the session as
> pressure-vessel's `srt-bwrap` wrapper. This plugin remains useful: it matches
> games within seconds of launch, and it keeps such unidentified infrastructure
> entries from taking the visible-game slot.

## Why

Discord's Linux client only matches `os: "linux"` executables in its detectable
applications database, so it never sees games running under Wine/Proton. Tools
like arRPC/Vesktop fill the gap with the **RPC** path (`SET_ACTIVITY`), which
shows a "Playing" status but never creates a game *session* — so streaks,
playtime history, and PLAY_ON_DESKTOP quests stay empty.

This plugin restores the native path: it scans `/proc` for Wine `*.exe`
processes, matches them against Discord's live detectable database, and injects
them into `RunningGameStore` with their official application IDs.

## How it works

- `native.ts` (Node main process): fetches the detectable database from
  `https://discord.com/api/v9/applications/detectable` and reads `/proc/*/cmdline`.
- `detectable.ts` (renderer): indexes the database and matches each Wine `.exe`
  against it using arRPC-style trailing-path-suffix comparison.
- `index.ts` (renderer): scans for matches and makes them visible to Discord's
  presence and session logic.
- `settings.tsx` (renderer): the whitelist/blacklist settings UI and the filter
  the scan applies.

Injecting into `RunningGameStore` requires more than dispatching
`RUNNING_GAMES_CHANGE`: Discord builds the local activity and reports game
sessions from a family of selectors (`getRunningGames`, `getVisibleGame`,
`getVisibleRunningGames`, `getRunningDiscordApplicationIds`,
`getRunningVerifiedApplicationIds`, `getGameForPID`). The plugin wraps all of
them so every consumer sees the Wine game, then dispatches the change to trigger
a recompute.

## Installation

> [!IMPORTANT]
> This is a native plugin, so it only works on the **official Discord desktop client** — not Vesktop or the web build, neither of which can report game sessions to Discord.

Clone it into your Vencord `src/userplugins` folder and build:

```bash
cd Vencord/src/userplugins
git clone https://github.com/wsquarepa/WineGameDetection wineGameDetection
pnpm build
```

Then reinject Vencord into Discord. If you're not sure how, see the [Vencord docs for installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

## Configuration

By default every matched Wine game is reported. Open the plugin's settings in
Vencord to narrow that down:

- **Whitelist mode** (toggle): when on, only games on the list are reported; when
  off, every matched game is reported *except* those on the list (blacklist).
- Use the searchable dropdown to add any detectable game to the active list. Each
  entry shows the game name and the executable pattern it matches, plus a button
  to remove it.

Changes take effect on the next scan, within a few seconds.
