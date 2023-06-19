import mime from 'mime-types';
import fetch from 'node-fetch';

import { Channel, Client, Events, GatewayIntentBits, Partials, Snowflake } from 'discord.js';

import { Collection } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { PromptTemplate } from 'langchain/prompts';
import { settings } from '../settings.js';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { dateTimeToStr } from '../utils/conversion_utils.js';
import { BotClient } from './bot_client.js';

export class DiscordClient implements BotClient {
    botController: BotController;

    private client: Client;
    private commands = new Collection<string, any>();
    private commandArray = new Array<any>();
    private conversation: { [key: Snowflake]: Conversation } = {};
    private conversationSequences: Map<Conversation, number | undefined> = new Map();
    private typingTimeout: NodeJS.Timeout | undefined;

    constructor(botController: BotController) {
        this.botController = botController;
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                //GatewayIntentBits.GuildMessageReactions,
                GatewayIntentBits.GuildMessageTyping,
                //
                GatewayIntentBits.DirectMessages,
                //GatewayIntentBits.DirectMessageReactions,
                GatewayIntentBits.DirectMessageTyping,
                GatewayIntentBits.MessageContent,
            ],
            partials: [Partials.Channel, Partials.Message, Partials.Reaction],
        });
    }

    private async loadCommands(commandFolder: string) {
        const currentModulePath = fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentModulePath);
        const commandsPath = path.join(currentDir, commandFolder);

        const commandFiles = await fs.readdir(commandsPath);
        const commandFilesJS = commandFiles.filter(file => file.endsWith('.js'));

        for (const file of commandFilesJS) {
            const filePath = path.join(commandsPath, file);
            try {
                // import the command
                const command = await import(filePath);

                // Set a new item in the Collection with the key as the command name and the value as the exported module
                if ('data' in command && 'execute' in command) {
                    this.commands.set(command.data.name, command);
                    this.commandArray.push(command.data.toJSON());
                } else {
                    console.warn(
                        `The command at ${filePath} is missing a required "data" or "execute" property.`
                    );
                }
            } catch (error) {
                console.error(`Error loading command from ${filePath}:`, error);
            }
        }
    }

    private async refreshCommands() {
        const rest = new REST({
            version: '9',
        }).setToken(settings.discord_bot_token);

        const application = this.client.application;
        if (!application) {
            return;
        }
        (async () => {
            try {
                await rest.put(Routes.applicationCommands(application.id), {
                    body: this.commandArray,
                });
            } catch (error) {
                console.error(error);
            }
        })();
    }

    async startup() {
        console.log('Loading commands...');
        await this.loadCommands('./discord_commands');

        this.initEventListeners();

        console.log('Initializing bot...');
        await this.botController.init();

        console.log('Logging in...');
        await this.client.login(settings.discord_bot_token);
    }

    async shutdown() {
        // Set bot presence to invisible before shutting down
        this.client.user?.setPresence({ status: 'invisible' });
        this.client.user?.setActivity('OFFLINE', { type: 3 });
        // Wait a bit before destroying the discord instance
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.client.destroy();
        console.log('Client shutdown complete.');
    }

    getConversation(channel: Channel): Conversation {
        if (!(channel.id in this.conversation)) {
            this.conversation[channel.id] = new Conversation(this.botController, channel);
            this.conversation[channel.id].on(
                ConversationEvents.UpdatedDelayed,
                this.onConversationUpdated.bind(this)
            );
        }
        return this.conversation[channel.id];
    }

    private initEventListeners() {
        //
        // CLIENT READY
        //
        this.client.on(Events.ClientReady, async () => {
            console.log(`Logged in as ${this.client.user?.tag}!`);

            console.log('Refreshing commands...');
            await this.refreshCommands();

            console.log('Generating status message...');

            // format status prompt
            const statusPromptTemplate = new PromptTemplate({
                inputVariables: [...Object.keys(this.botController.settings), 'now'],
                template: settings.prompt_templates.status,
            });
            const statusPrompt = await statusPromptTemplate.format({
                ...this.botController.settings,
                now: dateTimeToStr(new Date(), settings.locale),
            });

            const conversation = new Conversation(this.botController);
            conversation.push(new ConvMessage('system', 'system', statusPrompt));
            const response = await this.botController.botModel.chat(conversation);
            const responseData = this.botController.parseResponse(
                response,
                conversation.botController.settings.name
            );
            responseData.message = responseData.message.split('.')[0];
            console.log(`Status message: ${responseData.message}`);

            console.log('Setting bot status...');
            this.client.user?.setPresence({ status: 'online' });
            this.client.user?.setActivity(responseData.message, { type: 3 });

            console.log('Client startup complete.');
        });
        //
        // ERROR
        //
        this.client.on(Events.Error, error => {
            console.error(error);
        });
        //
        // MESSAGE
        //
        this.client.on(Events.MessageCreate, async message => {
            // Ignore messages from other bots
            // TODO: Disabled for testing
            /*if (message.author.bot) {
                return;
            }*/

            // Do not respond to self
            if (message.author.id === this.client.user?.id) {
                return;
            }

            // Get conversation for this channel
            const conversation = this.getConversation(message.channel);

            // Add message to the channel
            conversation.push(new ConvMessage('user', message.author.username, message.content));
            console.log(`[${message.channelId}] ${message.author.username}: ${message.content}`);

            // Add attachment text to the channel messages
            if (message.attachments.size > 0) {
                for (const attachment of message.attachments.values()) {
                    // Only process text files
                    const contentType = mime.contentType(attachment.name);
                    const isText =
                        typeof contentType === 'string' && contentType.startsWith('text/');
                    if (isText) {
                        try {
                            // Fetch the attachment text
                            const response = await fetch(attachment.url);
                            const textContent = await response.text();
                            // Add the attachment text to the channel messages
                            conversation.push(
                                new ConvMessage(
                                    'user',
                                    message.author.username,
                                    `file <${attachment.name}>:\n${textContent}`
                                )
                            );
                            console.log(
                                `[${message.channelId}] ${message.author.username}: file <${attachment.name}>`
                            );
                        } catch (error) {
                            console.error(`Error reading attachment ${attachment.name}:`, error);
                        }
                    }
                }
            }
        });
        //
        // COMMAND
        //
        this.client.on(Events.InteractionCreate, async interaction => {
            if (interaction.isChatInputCommand()) {
                const command = this.commands.get(interaction.commandName);
                if (typeof command === 'undefined') {
                    console.error(`No command matching ${interaction.commandName} was found.`);
                    return;
                }
                try {
                    console.log(
                        `[${interaction.channelId}] ${interaction.user.username}: ${interaction.commandName}()`
                    );
                    await command.execute(this, interaction);
                } catch (error) {
                    console.error(error);
                    const message = {
                        content: 'There was an error while executing this command!',
                        ephemeral: true,
                    };
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp(message);
                    } else {
                        await interaction.reply(message);
                    }
                }
            }
        });
        //
        // TYPING
        //
        this.client.on(Events.TypingStart, async typing => {
            // Ignore self
            if (typing.user.id === this.client.user?.id) {
                return;
            }

            // TODO
            // const channel = typing.channel as any;
        });
    }

    private async onConversationUpdated(conversation: Conversation) {
        const channel = conversation.context;
        const sequence = this.conversationSequences.get(conversation);
        const messages = conversation.getMessagesAfter(sequence);
        if (messages.length > 0) {
            this.conversationSequences.set(conversation, messages.at(-1)?.sequence);
        }
        let chat = false;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    chat = true;
                    break;
                }
                case 'assistant':
                case 'system':
                    this.stopTyping(conversation);
                    await this.sendToDiscord(channel, message);
                    break;
            }
        }
        if (chat) {
            this.startTyping(conversation);
            await this.botController.chat(conversation).catch(error => console.error(error));
        }
    }

    private startTyping(conversation: Conversation, timeoutMs = 5000) {
        if (!this.typingTimeout) {
            // Send typing every few seconds as long as bot is working
            conversation.context.sendTyping();
            this.typingTimeout = setTimeout(() => {
                this.typingTimeout = undefined;
                this.startTyping(conversation);
            }, timeoutMs);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private stopTyping(_conversation: Conversation) {
        if (this.typingTimeout) {
            clearTimeout(this.typingTimeout);
            this.typingTimeout = undefined;
        }
    }

    private async sendToDiscord(channel: any, response: ConvMessage, chunkSize = 1000) {
        const numChunks = Math.ceil(response.content.length / chunkSize);

        console.log(`[${channel.id}] ${response.sender}: ${response.content}`);

        for (let chunk = 0, idx = 0; chunk < numChunks; ++chunk, idx += chunkSize) {
            await channel.send(response.content.slice(idx, idx + chunkSize));
        }
    }
}
