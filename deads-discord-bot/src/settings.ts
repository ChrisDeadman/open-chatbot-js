import { PathLike } from 'fs';
import { promises as fs } from 'node:fs';

export let settings : any;

export async function loadSettings(settingsFile: PathLike | fs.FileHandle) {
    try {
        const data = await fs.readFile(settingsFile, 'utf-8');
        settings = JSON.parse(data);
    } catch (err) {
        console.error(`Error reading settings file (${settingsFile}):`, err);
    }
}
