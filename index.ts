/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin, { PluginNative } from "@utils/types";
import { findStoreLazy } from "@webpack";
import { FluxDispatcher } from "@webpack/common";

import { DetectableGame, ensureCatalogLoaded, matchProcessPath, normalizePath } from "./detectable";
import { isReportable, settings } from "./settings";

interface RunningGame {
    cmdLine: string;
    exeName: string;
    exePath: string;
    hidden: boolean;
    isLauncher: boolean;
    id: string;
    name: string;
    pid: number;
    pidPath: number[];
    processName: string;
    start: number;
}

interface RunningGamesChange {
    games: RunningGame[];
}

const SCAN_INTERVAL_MS = 5000;

const Native = VencordNative.pluginHelpers.WineGameDetection as PluginNative<typeof import("./native")>;
const RunningGameStore = findStoreLazy("RunningGameStore");

type AnyFn = (...args: unknown[]) => unknown;

const wineGames = new Map<string, RunningGame>();
const originalGetters = new Map<string, AnyFn>();
let scanTimer: number | undefined;
let selfDispatch = false;

function buildRunningGame(game: DetectableGame, pid: number, argv0: string, args: string[]): RunningGame {
    const path = normalizePath(argv0);
    return {
        cmdLine: [argv0, ...args].join(" "),
        exeName: path.split("/").at(-1) ?? path,
        exePath: path,
        hidden: false,
        isLauncher: false,
        id: game.id,
        name: game.name,
        pid,
        pidPath: [pid],
        processName: game.name,
        start: Date.now(),
    };
}

function mergeGames(base: RunningGame[] | undefined): RunningGame[] {
    const native = (base ?? []).filter(game => !wineGames.has(game.id));
    return [...native, ...wineGames.values()];
}

function mergeIds(base: unknown): unknown {
    const wineIds = [...wineGames.keys()];
    if (base instanceof Set) {
        const merged = new Set(base);
        for (const id of wineIds) merged.add(id);
        return merged;
    }
    if (Array.isArray(base)) return [...new Set([...base as string[], ...wineIds])];
    return base;
}

function currentGamesList(): RunningGame[] {
    const orig = originalGetters.get("getRunningGames");
    return mergeGames(orig ? (orig() as RunningGame[]) : []);
}

// Discord builds the local presence activity and reports game sessions (which
// drive streaks) from several RunningGameStore selectors, not just
// getRunningGames. A bare RUNNING_GAMES_CHANGE dispatch leaves those reading the
// store's own Linux-native-only view, so a Wine game never becomes an activity.
// Wrapping the whole selector family makes every consumer see it.
function overrideGetter(name: string, build: (orig: AnyFn) => AnyFn): void {
    const current = (RunningGameStore as Record<string, unknown>)[name];
    if (typeof current !== "function") return;
    const orig = (current as AnyFn).bind(RunningGameStore);
    originalGetters.set(name, orig);
    (RunningGameStore as Record<string, unknown>)[name] = build(orig);
}

function installStoreOverrides(): void {
    if (originalGetters.size > 0) return;

    overrideGetter("getRunningGames", orig => () => mergeGames(orig() as RunningGame[]));
    overrideGetter("getVisibleRunningGames", orig => () => mergeGames(orig() as RunningGame[]));
    overrideGetter("getVisibleGame", orig => () => (orig() as RunningGame | undefined) ?? [...wineGames.values()][0]);
    overrideGetter("getRunningDiscordApplicationIds", orig => () => mergeIds(orig()));
    overrideGetter("getRunningVerifiedApplicationIds", orig => () => mergeIds(orig()));
    overrideGetter("getGameForPID", orig => (...args: unknown[]) => {
        const pid = args[0] as number;
        for (const game of wineGames.values()) if (game.pid === pid) return game;
        return orig(pid);
    });
}

function removeStoreOverrides(): void {
    for (const [name, orig] of originalGetters) {
        (RunningGameStore as Record<string, unknown>)[name] = orig;
    }
    originalGetters.clear();
}

function dispatchChange(added: RunningGame[], removed: RunningGame[]): void {
    selfDispatch = true;
    try {
        FluxDispatcher.dispatch({
            type: "RUNNING_GAMES_CHANGE",
            added,
            removed,
            games: currentGamesList(),
        } as never);
    } finally {
        selfDispatch = false;
    }
}

async function scan(): Promise<void> {
    const processes = await Native.getProcesses();
    const seenIds = new Set<string>();
    const added: RunningGame[] = [];

    for (const [pid, argv0, args] of processes) {
        const path = normalizePath(argv0);
        // Only bridge Wine/Proton processes; the client's own scanner owns
        // Linux-native detection.
        if (!path.endsWith(".exe")) continue;

        const game = matchProcessPath(path);
        // A game filtered out by the whitelist/blacklist is never added to
        // seenIds, so if it was previously tracked the removal pass below drops
        // it on this same scan.
        if (!game || !isReportable(game.id)) continue;

        seenIds.add(game.id);
        if (wineGames.has(game.id)) continue;

        const runningGame = buildRunningGame(game, pid, argv0, args);
        wineGames.set(game.id, runningGame);
        added.push(runningGame);
    }

    const removed: RunningGame[] = [];
    for (const [id, game] of wineGames) {
        if (!seenIds.has(id)) {
            removed.push(game);
            wineGames.delete(id);
        }
    }

    if (added.length > 0 || removed.length > 0) dispatchChange(added, removed);
}

// The client's native scanner periodically dispatches its own
// RUNNING_GAMES_CHANGE whose games list excludes our Wine entries. Re-assert any
// still-running Wine games once such a dispatch settles.
function onRunningGamesChange(payload: RunningGamesChange): void {
    if (selfDispatch || wineGames.size === 0) return;
    const presentIds = new Set(payload.games.map(game => game.id));
    const missing = [...wineGames.values()].filter(game => !presentIds.has(game.id));
    if (missing.length === 0) return;
    window.setTimeout(() => dispatchChange(missing, []), 0);
}

export default definePlugin({
    name: "WineGameDetection",
    description: "Reports Wine/Proton games to Discord's native game detection (RunningGameStore), so playtime, streaks, and quests credit them as on Windows.",
    authors: [{ name: "wsquarepa", id: 509874745567870987n }],

    settings,

    async start() {
        await ensureCatalogLoaded();
        installStoreOverrides();
        FluxDispatcher.subscribe("RUNNING_GAMES_CHANGE", onRunningGamesChange);
        scanTimer = window.setInterval(() => { void scan(); }, SCAN_INTERVAL_MS);
        void scan();
    },

    stop() {
        if (scanTimer !== undefined) window.clearInterval(scanTimer);
        scanTimer = undefined;
        FluxDispatcher.unsubscribe("RUNNING_GAMES_CHANGE", onRunningGamesChange);
        const removed = [...wineGames.values()];
        wineGames.clear();
        if (removed.length > 0) dispatchChange([], removed);
        removeStoreOverrides();
    },
});
