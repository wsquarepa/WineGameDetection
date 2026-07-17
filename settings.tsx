/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { OptionType, PluginNative } from "@utils/types";
import { Forms, SearchableSelect, useEffect, useMemo, useState } from "@webpack/common";

import { ensureCatalogLoaded, getCatalog, getGameById, matchProcessPath, normalizePath } from "./detectable";

const Native = VencordNative.pluginHelpers.WineGameDetection as PluginNative<typeof import("./native")>;

type ListKey = "sharedList" | "whitelist" | "blacklist";

interface Override {
    exeName: string;
    gameId: string;
}

export const settings = definePluginSettings({
    whitelistMode: {
        type: OptionType.BOOLEAN,
        description: "Should we instead report only the games on the list below?",
        default: false,
    },
    shareLists: {
        type: OptionType.BOOLEAN,
        description: "Should whitelist and blacklist modes share one list?",
        default: true,
    },
    gameList: {
        type: OptionType.COMPONENT,
        component: () => <GameListSetting />,
    },
    overridesList: {
        type: OptionType.COMPONENT,
        component: () => <OverridesSetting />,
    },
    sharedList: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    whitelist: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    blacklist: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    overrides: {
        type: OptionType.CUSTOM,
        default: [] as Override[],
    },
});

function activeListKey(): ListKey {
    if (settings.store.shareLists) return "sharedList";
    return settings.store.whitelistMode ? "whitelist" : "blacklist";
}

export function isReportable(id: string): boolean {
    const list = settings.store[activeListKey()];
    return settings.store.whitelistMode ? list.includes(id) : !list.includes(id);
}

export function matchOverride(exeName: string): string | undefined {
    return settings.store.overrides.find(override => override.exeName === exeName)?.gameId;
}

interface Candidate {
    exeName: string;
    path: string;
}

async function collectCandidates(overrides: Override[]): Promise<Candidate[]> {
    const processes = await Native.getProcesses();
    const seen = new Set<string>();
    const candidates: Candidate[] = [];

    for (const [, argv0] of processes) {
        const path = normalizePath(argv0);
        if (!path.endsWith(".exe")) continue;
        // Wine infrastructure (services.exe, winedevice.exe, explorer.exe, ...)
        // lives under c:/windows; games install to user drives. Heuristic
        // filter, not a guarantee: a game installed inside c:/windows would be
        // hidden here. Upgrade path: make the excluded-prefix list configurable.
        if (path.startsWith("c:/windows/")) continue;

        const exeName = path.split("/").at(-1);
        if (!exeName || seen.has(exeName)) continue;
        if (matchProcessPath(path)) continue;
        if (overrides.some(override => override.exeName === exeName)) continue;

        seen.add(exeName);
        candidates.push({ exeName, path });
    }

    return candidates;
}

function useCatalog(): { ready: boolean; error: string | null } {
    const [ready, setReady] = useState(getCatalog().length > 0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ready) return;
        let active = true;
        ensureCatalogLoaded()
            .then(() => {
                if (active) setReady(true);
            })
            .catch(reason => {
                if (active) setError(String(reason));
            });
        return () => {
            active = false;
        };
    }, [ready]);

    return { ready, error };
}

function RemoveIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
                fill="currentColor"
                d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
            />
        </svg>
    );
}

function GameRow({ id, onRemove }: { id: string; onRemove(): void }) {
    const game = getGameById(id);

    return (
        <Flex justifyContent="space-between" alignItems="center" style={{ gap: "1em" }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Span weight="medium" size="md">
                    {game?.name ?? id}
                </Span>
                <Paragraph size="sm" style={{ opacity: 0.6 }}>
                    {game ? game.executables.join(", ") : "Unknown / no longer detectable"}
                </Paragraph>
            </div>
            <Button
                variant="dangerPrimary"
                size="iconOnly"
                aria-label={`Remove ${game?.name ?? id}`}
                onClick={onRemove}
            >
                <RemoveIcon />
            </Button>
        </Flex>
    );
}

function OverrideRow({ exeName, gameId, onRemove }: { exeName: string; gameId: string; onRemove(): void }) {
    const game = getGameById(gameId);

    return (
        <Flex justifyContent="space-between" alignItems="center" style={{ gap: "1em" }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Span weight="medium" size="md">
                    {game?.name ?? gameId}
                </Span>
                <Paragraph size="sm" style={{ opacity: 0.6 }}>
                    {exeName}
                </Paragraph>
            </div>
            <Button
                variant="dangerPrimary"
                size="iconOnly"
                aria-label={`Remove override for ${exeName}`}
                onClick={onRemove}
            >
                <RemoveIcon />
            </Button>
        </Flex>
    );
}

function GameListSetting() {
    const { whitelistMode, shareLists, sharedList, whitelist, blacklist } = settings.use([
        "whitelistMode",
        "shareLists",
        "sharedList",
        "whitelist",
        "blacklist",
    ]);
    const { ready, error } = useCatalog();

    const activeKey: ListKey = shareLists ? "sharedList" : whitelistMode ? "whitelist" : "blacklist";
    const activeList = shareLists ? sharedList : whitelistMode ? whitelist : blacklist;

    const options = useMemo(
        () => getCatalog().map(game => ({ label: game.name, value: game.id })),
        [ready],
    );
    const availableOptions = useMemo(
        () => options.filter(option => !activeList.includes(option.value)),
        [options, activeList],
    );

    function addGame(id: string): void {
        if (activeList.includes(id)) return;
        settings.store[activeKey] = [...activeList, id];
    }

    function removeGame(id: string): void {
        settings.store[activeKey] = activeList.filter(gameId => gameId !== id);
    }

    return (
        <section>
            <Forms.FormTitle tag="h3">Games List</Forms.FormTitle>

            {error ? (
                <Forms.FormText style={{ color: "var(--text-feedback-critical)" }}>
                    Failed to load detectable games: {error}
                </Forms.FormText>
            ) : !ready ? (
                <Forms.FormText>Loading detectable games…</Forms.FormText>
            ) : (
                <SearchableSelect
                    placeholder="Add a game…"
                    options={availableOptions}
                    value={undefined}
                    onChange={id => addGame(id as string)}
                    maxVisibleItems={10}
                    closeOnSelect
                />
            )}

            <Flex flexDirection="column" style={{ gap: "0.5em", marginTop: "0.5em" }}>
                {activeList.map(id => (
                    <GameRow key={id} id={id} onRemove={() => removeGame(id)} />
                ))}
            </Flex>
        </section>
    );
}

function OverridesSetting() {
    const { overrides } = settings.use(["overrides"]);
    const { ready, error } = useCatalog();
    const [candidates, setCandidates] = useState<Candidate[]>([]);
    const [loading, setLoading] = useState(false);
    const [nonce, setNonce] = useState(0);

    const options = useMemo(
        () => getCatalog().map(game => ({ label: game.name, value: game.id })),
        [ready],
    );

    useEffect(() => {
        let active = true;
        setLoading(true);
        collectCandidates(overrides)
            .then(found => {
                if (active) setCandidates(found);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [overrides, nonce]);

    function addOverride(exeName: string, gameId: string): void {
        if (overrides.some(override => override.exeName === exeName)) return;
        settings.store.overrides = [...overrides, { exeName, gameId }];
    }

    function removeOverride(exeName: string): void {
        settings.store.overrides = overrides.filter(override => override.exeName !== exeName);
    }

    return (
        <section style={{ marginTop: "1em" }}>
            <Forms.FormTitle tag="h3">Executable Overrides</Forms.FormTitle>
            <Forms.FormText style={{ marginBottom: "0.5em" }}>
                Map a running Wine executable to a game when Discord's database does not detect it.
            </Forms.FormText>

            <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                {overrides.map(override => (
                    <OverrideRow
                        key={override.exeName}
                        exeName={override.exeName}
                        gameId={override.gameId}
                        onRemove={() => removeOverride(override.exeName)}
                    />
                ))}
            </Flex>

            <Flex justifyContent="space-between" alignItems="center" style={{ marginTop: "1em", marginBottom: "0.5em" }}>
                <Forms.FormTitle tag="h5" style={{ margin: 0 }}>
                    Unmatched running games
                </Forms.FormTitle>
                <Button size="small" variant="secondary" onClick={() => setNonce(value => value + 1)} disabled={loading}>
                    {loading ? "Refreshing…" : "Refresh"}
                </Button>
            </Flex>

            {error ? (
                <Forms.FormText style={{ color: "var(--text-feedback-critical)" }}>
                    Failed to load detectable games: {error}
                </Forms.FormText>
            ) : !ready ? (
                <Forms.FormText>Loading detectable games…</Forms.FormText>
            ) : candidates.length === 0 ? (
                <Forms.FormText style={{ opacity: 0.6 }}>No unmatched Wine executables running.</Forms.FormText>
            ) : (
                <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                    {candidates.map(candidate => (
                        <Flex key={candidate.exeName} justifyContent="space-between" alignItems="center" style={{ gap: "1em" }}>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <Span weight="medium" size="md">
                                    {candidate.exeName}
                                </Span>
                                <Paragraph size="sm" style={{ opacity: 0.6 }}>
                                    {candidate.path}
                                </Paragraph>
                            </div>
                            <div style={{ minWidth: 220 }}>
                                <SearchableSelect
                                    placeholder="Assign game…"
                                    options={options}
                                    value={undefined}
                                    onChange={id => addOverride(candidate.exeName, id as string)}
                                    maxVisibleItems={10}
                                    closeOnSelect
                                />
                            </div>
                        </Flex>
                    ))}
                </Flex>
            )}
        </section>
    );
}
