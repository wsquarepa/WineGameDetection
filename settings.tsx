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
import { Margins } from "@utils/margins";
import { OptionType } from "@utils/types";
import { Forms, SearchableSelect, useEffect, useMemo, useState } from "@webpack/common";

import { ensureCatalogLoaded, getCatalog, getGameById } from "./detectable";

type ListKey = "whitelist" | "blacklist";

export const settings = definePluginSettings({
    whitelistMode: {
        type: OptionType.BOOLEAN,
        description: "Whitelist mode: report only the games on the list below. When off, every matched game is reported except those on the list (blacklist).",
        default: false,
    },
    gameList: {
        type: OptionType.COMPONENT,
        component: () => <GameListSetting />,
    },
    whitelist: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
    blacklist: {
        type: OptionType.CUSTOM,
        default: [] as string[],
    },
});

export function isReportable(id: string): boolean {
    if (settings.store.whitelistMode) return settings.store.whitelist.includes(id);
    return !settings.store.blacklist.includes(id);
}

function useCatalog(): { ready: boolean; error: string | null; } {
    const [ready, setReady] = useState(getCatalog().length > 0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (ready) return;
        let active = true;
        ensureCatalogLoaded()
            .then(() => { if (active) setReady(true); })
            .catch(reason => { if (active) setError(String(reason)); });
        return () => { active = false; };
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

function GameRow({ id, onRemove }: { id: string; onRemove(): void; }) {
    const game = getGameById(id);

    return (
        <Flex justifyContent="space-between" alignItems="center" style={{ gap: "1em" }}>
            <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                <Span weight="medium" size="md">{game?.name ?? id}</Span>
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

function GameListSetting() {
    const { whitelistMode, whitelist, blacklist } = settings.use(["whitelistMode", "whitelist", "blacklist"]);
    const { ready, error } = useCatalog();

    const activeKey: ListKey = whitelistMode ? "whitelist" : "blacklist";
    const activeList = whitelistMode ? whitelist : blacklist;

    const options = useMemo(
        () => getCatalog().map(game => ({ label: game.name, value: game.id })),
        [ready]
    );
    const availableOptions = useMemo(
        () => options.filter(option => !activeList.includes(option.value)),
        [options, activeList]
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
            <Forms.FormTitle tag="h3">{whitelistMode ? "Whitelist" : "Blacklist"}</Forms.FormTitle>
            <Forms.FormText className={Margins.bottom8}>
                {whitelistMode
                    ? "Only these games are reported to Discord's native game detection."
                    : "Every matched game is reported except these."}
            </Forms.FormText>

            {error
                ? <Forms.FormText style={{ color: "var(--text-feedback-critical)" }}>
                    Failed to load detectable games: {error}
                </Forms.FormText>
                : !ready
                    ? <Forms.FormText>Loading detectable games…</Forms.FormText>
                    : <SearchableSelect
                        placeholder="Add a game…"
                        options={availableOptions}
                        value={undefined}
                        onChange={id => addGame(id as string)}
                        maxVisibleItems={10}
                        closeOnSelect
                    />}

            <Flex flexDirection="column" style={{ gap: "0.5em", marginTop: "0.5em" }}>
                {activeList.map(id => (
                    <GameRow key={id} id={id} onRemove={() => removeGame(id)} />
                ))}
            </Flex>
        </section>
    );
}
