import { commandToString } from '../../utils/parsing_utils.js';

export const exitDoc = {
    summary: 'Ends the current conversation completely.',
    syntax: '```exit <valediction message>```',
};

export async function exit(commandArgs: Record<string, string>): Promise<string> {
    const commandContent = commandToString(commandArgs, true).trim();
    console.info(`exit(reson=${commandContent})`);
    return '';
}
