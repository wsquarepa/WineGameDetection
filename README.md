# WineGameDetection

Cleans up Discord's native game detection on Linux! Only games Discord can identify are reported, and Wine executables it misses can be mapped to their games. This way, your game status doesn't show some random executables :)

## Why

Although Discord's Linux client identifies Wine/Proton games on its own, its detection heuristic also reports any process it suspects is a game but cannot identify. This includes random stuff like launchers, updaters, embedded webviews, anti-cheat installers, and Proton's own infrastructure (`srt-bwrap`, `wine`, `wineserver`). These pile up in Registered Games and can take your "Playing" status away from the real game (which is really annoying D:).

Discord also misses games installed in a folder layout its database does not expect, usually caused by weird installations (due to the interesting things we have to do on Linux to get certain Windows-native games working).

## How it works

The plugin hooks the point where Discord's native process scanner hands its results to `RunningGameStore`. From that list, the plugin:

- keeps every entry Discord identified with an application ID
- rewrites entries matching one of your overrides to carry the mapped game's ID so Discord treats them as that game everywhere
- keeps games you added yourself with Discord's own "Add it!"
- ...and drops everything else before any part of Discord sees it

## Installation

> [!IMPORTANT]
> This plugin only works on the **official Discord desktop client**. The web build (and hence Vesktop) have no game scanner to filter.

Clone it into your Vencord `src/userplugins` folder and build:

```bash
cd Vencord/src/userplugins
git clone https://github.com/wsquarepa/WineGameDetection wineGameDetection
pnpm build
```

Then reinject Vencord into Discord. If you're not sure how, see the [Vencord docs for installing custom plugins](https://docs.vencord.dev/installing/custom-plugins/).

## Configuration

Open the plugin's settings in Vencord. **Unidentified running executables** lists what Discord detected but could not identify (and the plugin is hiding).

Assign a game to one to map it. The mapping is keyed on the executable's file name and should be applied within seconds. Existing mappings are listed above, each with a button to remove it.

Restart Discord after enabling the plugin for the first time.
