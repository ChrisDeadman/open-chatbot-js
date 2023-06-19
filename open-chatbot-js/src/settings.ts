import { PathLike } from 'fs';
import { promises as fs } from 'node:fs';
import path from 'path';

export let settings: any;

export async function loadSettings(dataDir: string) {
    settings = await readSettings(getSettingsFile(dataDir));
    settings.dataDir = dataDir;
}

export async function readSettings(file: PathLike | fs.FileHandle): Promise<any> {
    try {
        const data = await fs.readFile(file, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error(`Error reading settings file (${file}):`, err);
    }
}

export async function readCombineSettings(...files: (PathLike | fs.FileHandle)[]): Promise<any> {
    try {
        let combinedSettings = {};

        for (const file of files) {
            const settings = await readSettings(file);
            combinedSettings = {
                ...combinedSettings,
                ...settings,
            };
        }

        return combinedSettings;
    } catch (err) {
        console.error('Error reading settings:', err);
    }
}

export function getSettingsFile(dataPath: string): string {
    return path.join(dataPath, 'settings.json');
}

export function getBackendDir(dataPath: string): string {
    return path.join(dataPath, 'backends');
}

export function getTurnTemplateDir(dataPath: string): string {
    return path.join(dataPath, 'turn_templates');
}

export function getCharacterDir(dataPath: string): string {
    return path.join(dataPath, 'characters');
}
