/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Flex } from "@components/Flex";
import { Heading } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { OptionType } from "@utils/types";
import { SearchableSelect, useMemo, useState } from "@webpack/common";

import { exeNameOf, getCatalog, getDetectableGame, getUnidentified } from "./detection";

interface Override {
    exeName: string;
    gameId: string;
}

export const settings = definePluginSettings({
    overridesList: {
        type: OptionType.COMPONENT,
        component: () => <OverridesSetting />,
    },
    overrides: {
        type: OptionType.CUSTOM,
        default: [] as Override[],
    },
});

// Reading an element of the overrides array (via settings.store or
// settings.use) yields a SettingsStore proxy, and Vencord persists settings
// over Electron IPC, whose structured clone rejects proxies ("An object could
// not be cloned"). Arrays written back must contain rebuilt plain objects,
// never previously-read elements.
function plainOverride(override: Override): Override {
    return { exeName: override.exeName, gameId: override.gameId };
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

function OverrideRow({ exeName, gameId, onRemove }: { exeName: string; gameId: string; onRemove(): void }) {
    const game = getDetectableGame(gameId);

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
                aria-label={`Remove mapping for ${exeName}`}
                onClick={onRemove}
            >
                <RemoveIcon />
            </Button>
        </Flex>
    );
}

interface Candidate {
    exeName: string;
    name: string;
    exePath: string;
}

function collectCandidates(): Candidate[] {
    const seen = new Set<string>();
    const candidates: Candidate[] = [];
    for (const game of getUnidentified()) {
        const exeName = exeNameOf(game.exePath);
        if (seen.has(exeName)) continue;
        seen.add(exeName);
        candidates.push({ exeName, name: game.name, exePath: game.exePath });
    }
    return candidates;
}

function OverridesSetting() {
    const { overrides } = settings.use(["overrides"]);
    const [candidates, setCandidates] = useState(collectCandidates);
    const options = useMemo(
        () => getCatalog().map(game => ({ label: game.name, value: game.id })),
        [],
    );

    function addOverride(exeName: string, gameId: string): void {
        if (overrides.some(override => override.exeName === exeName)) return;
        settings.store.overrides = [...overrides.map(plainOverride), { exeName, gameId }];
        setCandidates(current => current.filter(candidate => candidate.exeName !== exeName));
    }

    function removeOverride(exeName: string): void {
        settings.store.overrides = overrides.filter(override => override.exeName !== exeName).map(plainOverride);
    }

    return (
        <section>
            <Heading tag="h3">Game Mappings</Heading>
            <Paragraph style={{ marginBottom: "0.5em" }}>
                Did Discord miss one of your games? Find its executable below and pick the game it belongs to. Anything
                Discord can't identify stays hidden until you map it.
            </Paragraph>

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
                <Heading tag="h5" style={{ margin: 0 }}>
                    Unidentified running executables
                </Heading>
                <Button size="small" variant="secondary" onClick={() => setCandidates(collectCandidates())}>
                    Refresh
                </Button>
            </Flex>

            {candidates.length === 0 ? (
                <Paragraph style={{ opacity: 0.6 }}>Nothing unidentified is running right now.</Paragraph>
            ) : (
                <Flex flexDirection="column" style={{ gap: "0.5em" }}>
                    {candidates.map(candidate => (
                        <Flex key={candidate.exeName} justifyContent="space-between" alignItems="center" style={{ gap: "1em" }}>
                            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                                <Span weight="medium" size="md">
                                    {candidate.name}
                                </Span>
                                <Paragraph size="sm" style={{ opacity: 0.6 }}>
                                    {candidate.exePath}
                                </Paragraph>
                            </div>
                            <div style={{ minWidth: 220 }}>
                                <SearchableSelect
                                    placeholder="Pick a game…"
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
