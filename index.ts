/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { RunningGame } from "@vencord/discord-types";
import { RunningGameStore } from "@webpack/common";

import { exeNameOf, getDetectableGame, partitionDetected, setUnidentified } from "./detection";
import { settings } from "./settings";

function isUserAdded(game: RunningGame): boolean {
    return (RunningGameStore.getOverrideForGame(game) as { add?: boolean; } | null)?.add === true;
}

function resolveMapping(game: RunningGame): { id: string; name: string; } | undefined {
    const exeName = exeNameOf(game.exePath);
    const gameId = settings.store.overrides.find(override => override.exeName === exeName)?.gameId;
    if (!gameId) return undefined;
    const detectable = getDetectableGame(gameId);
    return detectable ? { id: detectable.id, name: detectable.name } : undefined;
}

export default definePlugin({
    name: "WineGameDetection",
    description: "Cleans up Discord's native game detection on Linux! Only games Discord can identify are reported, and you can map the Wine games it misses yourself.",
    authors: [{ name: "wsquarepa", id: 509874745567870987n }],

    settings,

    patches: [
        {
            // The native scanner's observed-games callback, at the point where
            // the entries that survived Discord's non-game, observed-app and
            // blocklist checks become the store's running-games list. Every
            // consumer (visible game, activity sessions, Registered Games)
            // derives from that list, so filtering here keeps unidentified
            // entries out of all of them.
            find: '"Running Non-Games Changed"',
            replacement: {
                match: /(totalFromNative:\i,entries:\i\},\i=)(\i);/,
                replace: "$1$self.filterDetected($2);",
            },
        },
    ],

    filterDetected(games: RunningGame[]): RunningGame[] {
        const { kept, unidentified } = partitionDetected(games, resolveMapping, isUserAdded);
        setUnidentified(unidentified);
        return kept;
    },
});
