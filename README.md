# WineGameDetection

Reports Wine/Proton games to Discord's **native** game detection on Linux, so
playtime, streaks, and quests credit them the same way they do on Windows.

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
- `index.ts` (renderer): matches each Wine `.exe` against the database using
  arRPC-style trailing-path-suffix comparison, then makes the game visible to
  Discord's presence and session logic.

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
