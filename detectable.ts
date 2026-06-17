/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { PluginNative } from "@utils/types";

interface DetectableExecutable {
    is_launcher: boolean;
    name: string;
    os: string;
    arguments?: string;
}

interface DetectableApplication {
    id: string;
    name: string;
    executables?: DetectableExecutable[];
}

export interface DetectableGame {
    id: string;
    name: string;
    executables: string[];
}

const Native = VencordNative.pluginHelpers.WineGameDetection as PluginNative<typeof import("./native")>;

const gamesByExecutable = new Map<string, DetectableGame>();
const gamesById = new Map<string, DetectableGame>();
let catalog: DetectableGame[] = [];
let loaded = false;

function executableKey(name: string): string {
    return name.startsWith(">") ? name.substring(1) : name;
}

// Mirrors arRPC: compare every trailing path-suffix of the process path (plus
// 64-bit-suffix-stripped variants) against a detectable entry's executable name,
// which may itself span several path segments.
function pathVariants(path: string): string[] {
    const segments = path.split("/");
    const variants: string[] = [];
    for (let i = 1; i < segments.length; i++) {
        variants.push(segments.slice(-i).join("/"));
    }
    for (const variant of variants.slice()) {
        variants.push(variant.replace("64", ""));
        variants.push(variant.replace(".x64", ""));
        variants.push(variant.replace("x64", ""));
        variants.push(variant.replace("_64", ""));
    }
    return variants;
}

// Only win32 non-launcher executables are indexed: these are the Windows
// binaries Wine actually runs, and so the only entries this plugin can ever
// match. A game with no such executable is left out of the catalog because it
// can never be detected through Wine.
function indexCatalog(apps: DetectableApplication[]): void {
    gamesByExecutable.clear();
    gamesById.clear();
    const games: DetectableGame[] = [];

    for (const app of apps) {
        if (!app.executables) continue;

        const executables: string[] = [];
        for (const executable of app.executables) {
            if (executable.is_launcher || executable.os !== "win32") continue;
            executables.push(executableKey(executable.name));
        }
        if (executables.length === 0) continue;

        const game: DetectableGame = { id: app.id, name: app.name, executables };
        games.push(game);
        gamesById.set(game.id, game);
        for (const key of executables) {
            if (!gamesByExecutable.has(key)) gamesByExecutable.set(key, game);
        }
    }

    games.sort((a, b) => a.name.localeCompare(b.name));
    catalog = games;
}

export async function ensureCatalogLoaded(): Promise<void> {
    if (loaded) return;
    const body = await Native.fetchDetectableDb();
    indexCatalog(JSON.parse(body) as DetectableApplication[]);
    loaded = true;
}

export function getCatalog(): DetectableGame[] {
    return catalog;
}

export function getGameById(id: string): DetectableGame | undefined {
    return gamesById.get(id);
}

export function matchProcessPath(normalizedPath: string): DetectableGame | undefined {
    for (const variant of pathVariants(normalizedPath)) {
        const game = gamesByExecutable.get(variant);
        if (game) return game;
    }
    return undefined;
}
