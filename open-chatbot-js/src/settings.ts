import { PathLike } from 'fs';
import { promises as fs } from 'node:fs';

export let settings: any;

export async function loadSettings(settingsFile: PathLike | fs.FileHandle) {
    settings = await readSettings(settingsFile);
}

export async function readSettings(settingsFile: PathLike | fs.FileHandle): Promise<any> {
    try {
        const data = await fs.readFile(settingsFile, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading settings file (${settingsFile}):`, err);
    }
}
