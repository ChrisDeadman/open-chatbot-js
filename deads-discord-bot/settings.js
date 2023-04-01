import { promises as fs } from "node:fs";

export let settings = {};

export async function loadSettings(settingsFile) {
    try {
        const data = await fs.readFile(settingsFile, "utf-8");
        settings = JSON.parse(data);
    } catch (err) {
        console.error(`Error reading settings file (${settingsFile}):`, err);
    }
}
