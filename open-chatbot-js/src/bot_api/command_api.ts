import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { BotBrowser } from './bot_browser.js';
import { browseWebsite, browseWebsiteDoc } from './commands/browse_website.js';
import { deleteMemory, deleteMemoryDoc } from './commands/delete_memory.js';
import { exit, exitDoc } from './commands/exit.js';
import { python, pythonDoc } from './commands/python.js';
import { storeMemory, storeMemoryDoc } from './commands/store_memory.js';

export enum Command {
    StoreMemory = 'storeMemory',
    DeleteMemory = 'deleteMemory',
    BrowseWebsite = 'browseWebsite',
    Python = 'python',
    Exit = 'exit',
}

export type CommandContext = {
    botModel: BotModel;
    memory?: MemoryProvider;
    botBrowser?: BotBrowser;
};

export class CommandApi {
    private context: CommandContext;

    private commandMap: Record<
        string,
        (
            commandArgs: Record<string, string>,
            commandContext: CommandContext,
            settings: any,
            memContext: string
        ) => Promise<string>
    > = {
        [Command.StoreMemory]: storeMemory,
        [Command.DeleteMemory]: deleteMemory,
        [Command.BrowseWebsite]: browseWebsite,
        [Command.Python]: python,
        [Command.Exit]: exit,
    };

    constructor(botModel: BotModel, memory?: MemoryProvider, botBrowser?: BotBrowser) {
        this.context = { botModel, memory, botBrowser };
    }

    static get commandDoc(): string {
        const docs = {
            'Store Memory': storeMemoryDoc,
            'Delete Memory': deleteMemoryDoc,
            'Browse Website': browseWebsiteDoc,
            'Python Code Execution': pythonDoc,
            'Exit Conversation': exitDoc,
        };
        return Object.entries(docs)
            .map(([k, v]) =>
                [`**${k}**`, `${v.summary}`, `Syntax: ${v.syntax}`].join('\n')
            )
            .join('\n\n');
    }

    async handleRequest(
        commandArgs: Record<string, string>,
        memContext: string,
        settings: any
    ): Promise<string> {
        let response = '';

        try {
            const commandHandler = this.commandMap[commandArgs.command];
            if (commandHandler != null) {
                response = await commandHandler(commandArgs, this.context, settings, memContext);
            } else {
                response = 'Invalid command.';
            }
        } catch (error) {
            response = `"${error}.`;
        }

        if (response.length > 0) {
            response = `\`${commandArgs.command}\`: ${response}`;
        }

        return response;
    }
}
