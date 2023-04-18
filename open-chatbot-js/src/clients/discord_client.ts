import mime from 'mime-types';
import fetch from 'node-fetch';

import { Client, Events, GatewayIntentBits, Partials, Snowflake } from 'discord.js';

import { settings } from '../settings.js';

import { Collection } from 'discord.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel, ConvMessage } from '../models/bot_model.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { BotClient } from './bot_client.js';

export class DiscordClient extends BotClient {
    private client: Client;
    private commands = new Collection<string, any>();
    private commandArray = new Array<any>();
    private conversation: {
        [key: Snowflake]: { messages: CyclicBuffer<ConvMessage>; language: string };
    } = {};

    constructor(botModel: BotModel, memory: MemoryProvider, botApiHandler: CommandApi) {
        super(botModel, memory, botApiHandler);
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

        console.log('Logging in...');
        await this.client.login(settings.discord_bot_token);

        console.log('Bot startup complete.');
    }

    async shutdown() {
        // Set bot presence to invisible before shutting down
        this.client.user?.setPresence({ status: 'invisible' });
        this.client.user?.setActivity('OFFLINE', { type: 3 });
        // Wait a bit before destroying the discord instance
        await new Promise(resolve => setTimeout(resolve, 1000));
        this.client.destroy();
        console.log('Bot has been shut down.');
    }

    getConversation(channelId: Snowflake) {
        if (!(channelId in this.conversation)) {
            this.conversation[channelId] = {
                messages: new CyclicBuffer<ConvMessage>(settings.message_history_size),
                language: settings.default_language,
            };
        }
        return this.conversation[channelId];
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
            const convContext = [
                {
                    role: 'system',
                    sender: 'system',
                    content: settings.status_prompt.replaceAll(
                        '$LANGUAGE',
                        settings.default_language
                    ),
                },
            ];
            const messages = await this.getMessages(convContext, settings.default_language);
            const response = await this.botModel.chat(messages);
            const responseData = this.parseResponse(response);
            console.log(`Status message: ${responseData.message}`);

            console.log('Setting bot status...');
            this.client.user?.setPresence({ status: 'online' });
            this.client.user?.setActivity(responseData.message, { type: 3 });

            console.log('Bot startup complete.');
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
            if (message.author.id == this.client.user?.id) {
                return;
            }

            // Get conversation for this channel
            const conversation = this.getConversation(message.channel.id);

            // Add message to the channel
            conversation.messages.push({
                role: 'user',
                sender: message.author.username,
                content: message.content,
            });
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
                            conversation.messages.push({
                                role: 'user',
                                sender: message.author.username,
                                content: `file <${attachment.name}>:\n${textContent}`,
                            });
                            console.log(
                                `[${message.channelId}] ${message.author.username}: file <${attachment.name}>`
                            );
                        } catch (error) {
                            console.error(`Error reading attachment ${attachment.name}:`, error);
                        }
                    }
                }
            }

            // Schedule channel processing
            await this.scheduleProcessChannel(message.channel);
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
            if (typing.user.id == this.client.user?.id) {
                return;
            }

            // Reschedule response if someone is typing
            const channel = typing.channel as any;
            if (channel.processTimeout != null && channel.isProcessing == false) {
                await this.scheduleProcessChannel(channel);
            }
        });
    }

    private async scheduleProcessChannel(channel: any) {
        // Drop request if we are already processing
        if (channel.isProcessing == true) {
            return;
        }

        // Clear processChannel schedule
        if (channel.processTimeout != null) {
            clearTimeout(channel.processTimeout);
            channel.processTimeout = null;
        }

        // Schedule processChannel
        const timingVariance = Math.floor(Math.random() * settings.chat_process_delay_ms);
        channel.processTimeout = setTimeout(async () => {
            if (channel.isProcessing == true) {
                return;
            }
            channel.isProcessing = true;
            try {
                await this.processChannel(channel);
            } finally {
                channel.isProcessing = false;
                channel.processTimeout = null;
            }
        }, settings.chat_process_delay_ms + timingVariance);
    }

    private async sendToChannel(channel: any, message: string, chunkSize = 1000) {
        const numChunks = Math.ceil(message.length / chunkSize);

        console.log(`[${channel.id}] ${this.botModel.name}: ${message}`);

        for (let chunk = 0, idx = 0; chunk < numChunks; ++chunk, idx += chunkSize) {
            await channel.send(message.slice(idx, idx + chunkSize));
        }
    }

    private async processChannel(channel: any) {
        const typingTimeoutMs = 5000;
        const conversation = this.getConversation(channel.id);

        // Send typing every few seconds as long as bot is working
        let typingTimeout: NodeJS.Timeout | undefined;
        function sendTyping() {
            channel.sendTyping();
            typingTimeout = setTimeout(sendTyping, typingTimeoutMs);
        }

        // Hand over control to bot handler - he knows best
        await this.chat(
            conversation.messages,
            conversation.language,
            async response => {
                await this.sendToChannel(channel, response);
            },
            () => sendTyping(),
            () => clearTimeout(typingTimeout)
        );
    }
}
