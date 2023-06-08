import { commandToString } from '../../utils/parsing_utils.js';
import { CommandContext } from '../command_api.js';

export const deleteMemoryDoc = {
    summary: 'Keep memory banks clean and organized with this command.',
    syntax: '```deleteMemory <Summary of the note to be deleted>```',
};

export async function deleteMemory(
    commandArgs: Record<string, string>,
    commandContext: CommandContext,
    _settings: any,
    memContext: string
): Promise<string> {
    const commandContent = commandToString(commandArgs, true).trim();
    if (commandContext.memory && commandContent.length > 0 && memContext.length > 0) {
        await commandContext.memory.del(memContext, commandContent);
    }
    return '';
}
