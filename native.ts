/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 wsquarepa
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { readdir, readFile } from "fs/promises";

export type ProcessEntry = [pid: number, argv0: string, args: string[]];

const DETECTABLE_DB_URL = "https://discord.com/api/v9/applications/detectable";

export async function fetchDetectableDb(_: unknown): Promise<string> {
    const response = await fetch(DETECTABLE_DB_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch detectable applications DB: ${response.status} ${response.statusText}`);
    }
    return response.text();
}

export async function getProcesses(_: unknown): Promise<ProcessEntry[]> {
    const entries = await readdir("/proc");
    const results: ProcessEntry[] = [];

    await Promise.all(entries.map(async entry => {
        const pid = Number(entry);
        if (!Number.isInteger(pid) || pid <= 0) return;

        let cmdline: string;
        try {
            cmdline = await readFile(`/proc/${entry}/cmdline`, "utf8");
        } catch {
            // The process exited between readdir and readFile; nothing to report.
            return;
        }

        const argv = cmdline.split("\0").filter(part => part.length > 0);
        if (argv.length === 0) return;

        results.push([pid, argv[0], argv.slice(1)]);
    }));

    return results;
}
