/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RunningGame } from "@vencord/discord-types";
import { findStoreLazy } from "@webpack";

export interface DetectableGame {
    id: string;
    name: string;
}

interface GameStore {
    readonly games: DetectableGame[];
    getDetectableGame(id: string): DetectableGame | undefined;
}

const GameStore: GameStore = findStoreLazy("GameStore");

let unidentified: RunningGame[] = [];

/** Lowercased bare filename of a native exePath, which may use either separator. */
export function exeNameOf(exePath: string): string {
    return (exePath.split(/[/\\]/).at(-1) ?? exePath).toLowerCase();
}

export function getDetectableGame(id: string): DetectableGame | undefined {
    return GameStore.getDetectableGame(id);
}

/** Every detectable game, sorted by name. */
export function getCatalog(): DetectableGame[] {
    return [...GameStore.games].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Splits native scanner entries into those reported to Discord and the
 * unidentified rest.
 *
 * An entry is kept when it carries an application id, when `resolveMapping`
 * maps it to a game (the entry is copied with that game's id and name), or when
 * `isUserAdded` reports the user added it through Discord's own "Add it!" flow.
 * Everything else is an id-less heuristic detection (launchers, updaters,
 * Proton infrastructure) and goes to `unidentified`.
 */
export function partitionDetected(
    games: RunningGame[],
    resolveMapping: (game: RunningGame) => { id: string; name: string; } | undefined,
    isUserAdded: (game: RunningGame) => boolean,
): { kept: RunningGame[]; unidentified: RunningGame[]; } {
    const kept: RunningGame[] = [];
    const rest: RunningGame[] = [];

    for (const game of games) {
        if (game.id != null) {
            kept.push(game);
            continue;
        }
        const mapping = resolveMapping(game);
        if (mapping) kept.push({ ...game, ...mapping });
        else if (isUserAdded(game)) kept.push(game);
        else rest.push(game);
    }

    return { kept, unidentified: rest };
}

/** Unidentified entries from the native scanner's most recent report. */
export function getUnidentified(): RunningGame[] {
    return unidentified;
}

export function setUnidentified(games: RunningGame[]): void {
    unidentified = games;
}
