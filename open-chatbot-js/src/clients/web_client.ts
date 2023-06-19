import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'node:path';

import { Server, Socket } from 'socket.io';
import {
    getBackendDir,
    getCharacterDir,
    getTurnTemplateDir,
    readCombineSettings,
    settings,
} from '../settings.js';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { ConversationChain, ConversationChainEvents } from '../utils/conversation_chain.js';
import { exceptionToString } from '../utils/conversion_utils.js';
import { BotClient } from './bot_client.js';

export class WebClient implements BotClient {
    private app: express.Express;
    private server: http.Server;
    private io: Server;

    private conversationChain: ConversationChain;
    private conversationSequence: number | undefined;

    private bots: Record<string, { conversation: Conversation; controller: BotController }> = {};

    private username;

    constructor(username = 'User') {
        this.username = username;
        this.conversationChain = new ConversationChain();
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
    }

    async startup() {
        const webDataPath = path.join('data', 'web_client');
        this.app.use(express.static(webDataPath)); // contains frontend HTML, JS, CSS files

        this.app.set('view engine', 'ejs');
        this.app.set('views', webDataPath);

        this.app.get('/', (_req, res) => {
            res.render('index', {
                username: this.username,
                settings: settings,
            });
        });

        this.io.on('connection', socket => {
            socket.on('ready', () => this.onReady(socket));
            socket.on('reset', this.onReset.bind(this));
            socket.on('chat message', this.onChatMessage.bind(this));
            socket.on('update username', this.onUpdateUsername.bind(this));
            socket.on('new bot', () => this.onNewBot(socket));
            socket.on('add bot', this.onAddBot.bind(this));
            socket.on('edit bot', name => this.onEditBot(socket, name));
            socket.on('update bot', this.onUpdateBot.bind(this));
            socket.on('delete bot', this.onDeleteBot.bind(this));
        });

        this.server.listen(settings.web_server_port, settings.web_server_host, () => {
            console.log(
                `web-client listening on http://${settings.web_server_host}:${settings.web_server_port}`
            );
        });

        this.conversationChain.on(
            ConversationChainEvents.Updated,
            this.onConversationUpdated.bind(this)
        );
        this.conversationChain.on(ConversationChainEvents.Chatting, this.onChatting.bind(this));
        this.conversationChain.on(ConversationChainEvents.ChatComplete, () =>
            this.io.emit('stop typing')
        );

        console.log('Client startup complete.');
    }

    async shutdown() {
        this.server.close();
        console.log('Client shutdown complete.');
    }

    private onReady(socket: Socket) {
        // Load the bots
        for (const botName of Object.keys(this.bots)) {
            socket.emit('add bot', botName);
        }
        // Load the conversation
        const conversations = this.conversationChain.conversations;
        for (const message of conversations.at(0)?.messages ?? []) {
            socket.emit('chat message', message.sender, message.content);
        }
    }

    private onReset() {
        console.info('Client: Conversation reset()');
        this.conversationSequence = undefined;
        this.conversationChain.clear();
        this.io.emit('reset');
    }

    private onChatMessage(sender: string, content: string) {
        if (Object.keys(this.bots).length <= 0) {
            return;
        }
        try {
            content = content.trimStart();
            if (content.length > 0) {
                const message = new ConvMessage('user', sender, content);
                this.io.emit('chat message', message.sender, message.content);

                // push to conversation chain
                this.conversationChain.push(message).then(async conversation => {
                    // trigger chat if nobody is chatting
                    if (!this.conversationChain.chatting) {
                        await this.conversationChain
                            .chat(conversation)
                            .catch(error => console.error(error));
                    }
                });
            }
        } catch (error) {
            console.error(error);
        }
    }

    private onChatting(conversation: Conversation) {
        this.io.emit('typing', `${conversation.botController.settings.name} is typing`);
    }

    private onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesAfter(this.conversationSequence);
        if (messages.length > 0) {
            this.conversationSequence = messages.at(-1)?.sequence;
        }
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        this.io.emit('chat message', message.sender, message.content);
                    }
                    break;
                }
                case 'assistant':
                    this.io.emit('chat message', message.sender, message.content);
                    break;
                default:
                    this.io.emit('chat message', message.sender, message.content);
                    break;
            }
        }
    }

    private onUpdateUsername(username: string) {
        this.username = username;
    }

    private onNewBot(socket: Socket) {
        const backendDir = getBackendDir(settings.dataDir);
        const turnTemplateDir = getTurnTemplateDir(settings.dataDir);
        const characterDir = getCharacterDir(settings.dataDir);

        const getFiles = (dir: string) =>
            fs
                .readdirSync(dir)
                .filter(f => fs.statSync(path.join(dir, f)).isFile())
                .map(f => path.relative(dir, path.join(dir, f)));

        socket.emit('new bot', {
            backends: getFiles(backendDir),
            turnTemplates: getFiles(turnTemplateDir),
            characters: getFiles(characterDir),
        });
    }

    private async onAddBot(config: any) {
        try {
            const controllerSettings = await readCombineSettings(
                path.join(getBackendDir(settings.dataDir), config.backend),
                path.join(getTurnTemplateDir(settings.dataDir), config.turnTemplate),
                path.join(getCharacterDir(settings.dataDir), config.character)
            );

            // Do not add the same bot twice
            if (Object.keys(this.bots).includes(controllerSettings.name)) {
                return;
            }

            const controller = new BotController(controllerSettings);
            const conversation = new Conversation(controller);

            // reuse existing controller models if possible
            let compatibleController: BotController | undefined;
            for (const bot of Object.values(this.bots)) {
                if (
                    bot.controller.settings.bot_backend.name ===
                        controllerSettings.bot_backend.name &&
                    bot.controller.settings.bot_backend.model ===
                        controllerSettings.bot_backend.model
                ) {
                    compatibleController = bot.controller;
                    break;
                }
            }
            await controller.init(compatibleController);

            this.conversationChain.addConversation(conversation);
            this.bots[controllerSettings.name] = { conversation, controller };
            this.io.emit('add bot', controllerSettings.name);
        } catch (ex) {
            this.io.emit('chat message', 'system', exceptionToString(ex));
        }
    }

    private onEditBot(socket: Socket, name: string) {
        const bot = this.bots[name];
        if (bot === undefined) {
            return;
        }
        socket.emit('edit bot', bot.controller.settings);
    }

    private onUpdateBot(controllerSettings: any) {
        const bot = this.bots[controllerSettings.name];
        if (bot === undefined) {
            return;
        }
        const setProperties = (src: any, target: any) => {
            for (const [key, value] of Object.entries(src)) {
                if (key in target) {
                    if (typeof value === 'object' && !Array.isArray(value)) {
                        setProperties(value, target[key]);
                    } else {
                        target[key] = value;
                    }
                }
            }
        };
        setProperties(controllerSettings, bot.controller.settings);
    }

    private onDeleteBot(botName: string) {
        try {
            const bot = this.bots[botName];
            if (bot === undefined) {
                return;
            }
            this.conversationChain.removeConversation(bot.conversation);
            delete this.bots[botName];
            this.io.emit('delete bot', botName);
        } catch (ex) {
            this.io.emit('chat message', 'system', exceptionToString(ex));
        }
    }
}
