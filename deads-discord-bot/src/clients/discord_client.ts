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
import { BotModel } from '../models/bot_model.js';
import { ConversationData } from '../models/converstation_data.js';
import { BotClient } from './bot_client.js';

export class DiscordClient implements BotClient {
    private client: Client;
    private botModel: BotModel;
    private commands = new Collection<string, any>();
    private commandArray = new Array<any>();
    private conversation: { [key: Snowflake]: ConversationData } = {};

    constructor(botModel: BotModel) {
        this.botModel = botModel;
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
        this.client.login(settings.discord_bot_token);

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
            this.conversation[channelId] = new ConversationData(
                settings.default_language,
                settings.message_history_size
            );
        }
        return this.conversation[channelId];
    }

    private initEventListeners() {
        this.client.on(Events.ClientReady, async () => {
            console.log(`Logged in as ${this.client.user?.tag}!`);

            console.log('Refreshing commands...');
            await this.refreshCommands();

            console.log('Generating status message...');
            const conversation = new ConversationData(settings.default_language, 1);
            conversation.addMessage({
                role: 'system',
                content: settings.status_prompt,
            });
            const statusMessage = await this.botModel.ask(conversation);
            console.log(`Status message: ${statusMessage}`);

            console.log('Setting bot status...');
            this.client.user?.setPresence({ status: 'online' });
            this.client.user?.setActivity(statusMessage, { type: 3 });

            console.log('Bot startup complete.');
        });

        this.client.on(Events.Error, error => {
            console.error('Discord client error:', error);
        });

        this.client.on(Events.MessageCreate, async message => {
            // Ignore messages from other bots
            if (message.author.bot) {
                return;
            }

            // Add to channel messages
            const conversation = this.getConversation(message.channel.id);
            conversation.addMessage({
                role: 'user',
                content: `${message.author.username}: ${message.content}`,
            });
            console.log(`[${message.channelId}] ${message.author.username}: ${message.content}`);

            // Handle attachments
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
                            conversation.addMessage({
                                role: 'user',
                                content: `${message.author.username}: file <${attachment.name}>:\n${textContent}`,
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
    }

    private async scheduleProcessChannel(channel: any) {
        // Reschedule if we are already processing
        if (channel.isProcessing == true) {
            setTimeout(async () => {
                await this.scheduleProcessChannel(channel);
            }, settings.process_interval_ms);
            return;
        }

        // Clear processChannel schedule
        if (channel.processTimeout != null) {
            clearTimeout(channel.processTimeout);
        }

        // Schedule processChannel
        channel.processTimeout = setTimeout(async () => {
            channel.isProcessing = true;
            try {
                await this.processChannel(channel);
            } finally {
                channel.processTimeout = null;
                channel.isProcessing = false;
            }
        }, settings.process_interval_ms);
    }

    private async processChannel(channel: any) {
        const chunkSize = 1000;
        const conversation = this.getConversation(channel.id);

        // No messages, nothing to do
        if (conversation.isEmpty()) {
            return;
        }

        channel.sendTyping();

        const response = await this.botModel.ask(conversation);
        console.log(`${this.botModel.name}: ${response}`);

        if (response.length > 0) {
            conversation.addMessage({ role: 'assistant', content: response });
            const numChunks = Math.ceil(response.length / chunkSize);

            for (let chunk = 0, idx = 0; chunk < numChunks; ++chunk, idx += chunkSize) {
                await channel.send(response.substring(idx, idx + chunkSize));
            }
        }
    }
}
