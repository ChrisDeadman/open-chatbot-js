import { Command, CommandApi } from '../bot_api/command_api.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { commandToString, parseCommandBlock, parseJsonCommands } from '../utils/parsing_utils.js';

export abstract class BotClient {
    botModel: BotModel;
    tokenModel: TokenModel;
    protected botApiHandler: CommandApi;
    private chatting = false;

    constructor(botModel: BotModel, tokenModel: TokenModel, botApiHandler: CommandApi) {
        this.botModel = botModel;
        this.tokenModel = tokenModel;
        this.botApiHandler = botApiHandler;
    }

    abstract startup(): Promise<void>;

    abstract shutdown(): Promise<void>;

    async chat(conversation: Conversation): Promise<ConvMessage> {
        // Ignore if already chatting
        if (this.chatting) {
            return new ConvMessage('system', 'system', '');
        }
        this.chatting = true;
        try {
            // Chat with bot
            const response = await this.botModel.chat(conversation);

            // Parse bot response
            const responseData = this.parseResponse(response, conversation.settings.bot_name);

            // Execute commands
            if (conversation.settings.allow_commands === true && responseData.commands.length > 0) {
                responseData.commands.forEach((cmd: Record<string, string>) => {
                    console.debug(`CMD: ${JSON.stringify(cmd)}`);
                    switch (cmd.command) {
                        case Command.Exit:
                            // Exit: Respond with empty message
                            responseData.message = '';
                            break;
                        default:
                            break;
                    }
                    this.botApiHandler
                        .handleRequest(
                            cmd,
                            conversation.memoryContext,
                            conversation.settings.language
                        )
                        .then(result => {
                            if (result.length > 0) {
                                // Add API response to system messages
                                conversation.push(
                                    new ConvMessage(
                                        'system',
                                        'system',
                                        result.slice(0, this.tokenModel.maxTokens) // limit text
                                    )
                                );
                            }
                        });
                });
            }

            // Build response message
            const message = new ConvMessage(
                'assistant',
                conversation.settings.bot_name,
                responseData.message
            );

            // Push the bot response
            if (message.content.length > 0) {
                conversation.push(message);
            }

            return message;
        } catch (error) {
            // Push the error response
            const message = new ConvMessage('system', 'system', String(error));
            conversation.push(message);
            return message;
        } finally {
            this.chatting = false;
        }
    }

    protected parseResponse(response: string, botName: string): any {
        // Strip the bot name
        response = response.replaceAll(new RegExp(`^\\s*${botName}:\\s*`, 'gm'), '');

        // Strip excess newlines
        response = response
            .replaceAll('\r', '\n')
            .replaceAll(/(\s*\n){2,}/g, '\n')
            .trimStart();

        const commands: Record<string, string>[] = [];

        // Check each code segment for commands
        for (const match of [...response.matchAll(/[`]+([^`]+)[`]*/g)]) {
            const new_cmds: Record<string, string>[] = [];
            const command = parseCommandBlock(match[1]);
            if (command) {
                new_cmds.push(command);
            } else {
                new_cmds.push(...parseJsonCommands(match[1]));
            }
            if (new_cmds.length > 0) {
                // Add to the parsed command list
                commands.push(...new_cmds);
                // Replace commands with parsed commands in the response
                // This aids the model in keeping consistent formatting
                const useJson = false;
                if (useJson) {
                    response = response.replace(
                        match[0],
                        new_cmds.map(cmd => `\`${JSON.stringify(cmd)}\``).join('\n')
                    );
                } else {
                    response = response.replace(
                        match[0],
                        new_cmds.map(cmd => commandToString(cmd)).join('\n')
                    );
                }
            }
        }

        return { message: response, commands: [...new Set(commands)] };
    }
}
