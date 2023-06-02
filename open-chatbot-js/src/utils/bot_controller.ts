import fs from 'fs';
import { Command, CommandApi } from '../bot_api/command_api.js';
import { BotModel } from '../models/bot_model.js';
import { OpenAIBot } from '../models/openai_bot.js';
import { TokenModel } from '../models/token_model.js';
import { WebUIBot } from '../models/webui_bot.js';
import { ConvMessage } from './conv_message.js';
import { Conversation } from './conversation.js';
import { commandToString, parseCommandBlock, parseJsonCommands } from './parsing_utils.js';

import { BotBrowser } from '../bot_api/bot_browser.js';
import { SpeechApi } from '../bot_api/speech_api.js';
import { startBrowser } from '../bot_api/start_browser.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { RedisMemory } from '../memory/redis_memory_provider.js';
import { EmbeddingModel } from '../models/embedding_model.js';
import { LlamaBot } from '../models/llama_bot.js';
import { LlamaEmbedding } from '../models/llama_embedding.js';
import { SbertEmbedding } from '../models/sbert_embedding.js';

export class BotController {
    settings: any;
    botModel!: BotModel;
    tokenModel!: TokenModel;
    embeddingModel!: EmbeddingModel;
    memory: MemoryProvider | undefined;
    botApiHandler!: CommandApi;
    botBrowser!: BotBrowser;
    speech!: SpeechApi;

    constructor(settings: any) {
        this.settings = settings;
    }

    async init(clone: BotController | undefined = undefined) {
        if (clone) {
            this.botModel = clone.botModel;
            this.tokenModel = clone.tokenModel;
            this.embeddingModel = clone.embeddingModel;
            this.memory = clone.memory;
            this.botApiHandler = clone.botApiHandler;
            this.botBrowser = clone.botBrowser;
            this.speech = clone.speech;
            return;
        }

        // Create the models
        switch (this.settings.bot_backend.name) {
            case 'openai': {
                const openAiBot = new OpenAIBot(
                    this.settings.bot_backend.api_key,
                    this.settings.bot_backend.model,
                    this.settings.embedding_backend.model,
                    this.settings.bot_backend.token_limit,
                    this.settings.bot_backend.rate_limit_ms
                );
                this.botModel = openAiBot;
                this.tokenModel = openAiBot;
                this.embeddingModel = openAiBot;
                break;
            }
            case 'webui':
                this.botModel = new WebUIBot(
                    this.settings.bot_backend.model,
                    this.settings.bot_backend.token_limit
                );
                break;
            default: {
                if (!fs.existsSync(this.settings.bot_backend.model)) {
                    throw new Error(
                        `${this.settings.bot_backend.model} does not exist, please check this.settings.json.`
                    );
                }
                const llamaBot = new LlamaBot(
                    this.settings.bot_backend.model,
                    this.settings.bot_backend.token_limit
                );
                await llamaBot.init();
                this.botModel = llamaBot;
                break;
            }
        }
        switch (this.settings.embedding_backend.name) {
            case 'openai': {
                this.tokenModel = this.botModel as OpenAIBot;
                this.embeddingModel = this.botModel as OpenAIBot;
                break;
            }
            case 'llama': {
                if (!fs.existsSync(this.settings.embedding_backend.model)) {
                    throw new Error(
                        `${this.settings.embedding_backend.model} does not exist, please check this.settings.json.`
                    );
                }
                const llamaEmbedding = new LlamaEmbedding(
                    this.settings.embedding_backend.model,
                    this.settings.bot_backend.token_limit
                );
                await llamaEmbedding.init();
                this.tokenModel = llamaEmbedding;
                this.embeddingModel = llamaEmbedding;
                break;
            }
            default: {
                const sbert = new SbertEmbedding(
                    this.settings.embedding_backend.model,
                    this.settings.bot_backend.token_limit
                );
                this.tokenModel = sbert;
                this.embeddingModel = sbert;
                break;
            }
        }

        // Create the memory model
        if (this.settings.memory_backend.name === 'redis') {
            const redisMemory = new RedisMemory(
                this.settings.memory_backend.redis_host,
                this.settings.memory_backend.redis_port,
                this.embeddingModel,
                `idx:${this.settings.bot_name}:memory`
            );
            await redisMemory.init();
            await redisMemory.clear(); // TODO: Clear always for now
            this.memory = redisMemory;
        }

        // Create the browser
        const browser = await startBrowser(true);

        // Create the speech API
        this.speech = new SpeechApi(browser);

        // Create the bot browser
        this.botBrowser = new BotBrowser(this, browser);

        // Create the Bot API Handler
        this.botApiHandler = new CommandApi(this.botModel, this.memory, this.botBrowser);
    }

    async chat(conversation: Conversation): Promise<ConvMessage> {
        try {
            // Chat with bot
            const response = await this.botModel.chat(conversation);

            // Parse bot response
            const responseData = this.parseResponse(
                response,
                conversation.botController.settings.bot_name
            );

            // Execute commands
            if (responseData.commands.length > 0) {
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
                            conversation.botController.settings.language
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
                conversation.botController.settings.bot_name,
                responseData.message
            );

            // Push the bot response
            if (message.content.length > 0) {
                conversation.push(message);
            } else {
                console.info(`BotController: ${message.sender} doesn't want to respond.`);
            }

            return message;
        } catch (error) {
            // Push the error response
            const message = new ConvMessage('system', 'system', String(error));
            conversation.push(message);
            return message;
        }
    }

    parseResponse(response: string, botName: string): any {
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
