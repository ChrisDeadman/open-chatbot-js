import { commandToString } from '../../utils/parsing_utils.js';
import { CommandContext } from '../command_api.js';

export const storeMemoryDoc = {
    summary: [
        'Used regularly to increase ability to remember important details and events in memory banks. Effect: Conversation history is augmented with stored memories, selected depending on current context.',
    ].join('\n'),
    syntax: [
        '```storeMemory <Detailed note containing all information',
        'necessary to form a coherent memory>```',
    ].join('\n'),
};

export async function storeMemory(
    commandArgs: Record<string, string>,
    commandContext: CommandContext,
    _botSettings: any,
    memContext: string
): Promise<string> {
    const commandContent = commandToString(commandArgs, true).trim();
    if (commandContext.memory && commandContent.length > 0 && memContext.length > 0) {
        await commandContext.memory.add(memContext, commandContent);
    }
    return '';
}
