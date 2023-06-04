import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'node:path';

import { Server, Socket } from 'socket.io';
import { readSettings } from '../settings.js';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { ConversationChain, ConversationChainEvents } from '../utils/conversation_chain.js';
import { BotClient } from './bot_client.js';

export class WebClient implements BotClient {
    private app: express.Express;
    private server: http.Server;
    private io: Server;

    private mainController: BotController;
    private conversationChain: ConversationChain;
    private conversationSequence: number | undefined;

    private bots: Record<string, { conversation: Conversation; controller: BotController }> = {};

    private username;

    constructor(settings: any, username = 'User') {
        this.username = username;
        this.mainController = new BotController(settings);
        const conversation = new Conversation(this.mainController);
        this.conversationChain = new ConversationChain();
        this.conversationChain.addConversation(conversation);
        this.bots[settings.bot_name] = {
            conversation: conversation,
            controller: this.mainController,
        };

        this.app = express();
        this.server = http.createServer(this.app);
        this.io = new Server(this.server);
    }

    async startup() {
        await this.mainController.init();

        const webDataPath = path.join('data', 'web_client');
        this.app.use(express.static(webDataPath)); // contains frontend HTML, JS, CSS files

        this.app.set('view engine', 'ejs');
        this.app.set('views', webDataPath);

        this.app.get('/', (_req, res) => {
            res.render('index', {
                username: this.username,
                settings: this.mainController.settings,
            });
        });

        this.io.on('connection', socket => {
            socket.on('ready', () => this.onReady(socket));
            socket.on('chat message', this.onChatMessage.bind(this));
            socket.on('reset', this.onReset.bind(this));
            socket.on('update settings', this.onUpdateSettings.bind(this));
            socket.on('create bot', this.onCreateBot.bind(this));
            socket.on('delete bot', this.onDeleteBot.bind(this));
            socket.on('list files', () => {
                socket.emit('files', this.listFiles());
            });
        });

        this.server.listen(
            this.mainController.settings.web_server_port,
            this.mainController.settings.web_server_host,
            () => {
                console.log(
                    `web-client listening on http://${this.mainController.settings.web_server_host}:${this.mainController.settings.web_server_port}`
                );
            }
        );

        this.conversationChain.on(
            ConversationChainEvents.Updated,
            this.onConversationUpdated.bind(this)
        );
        this.conversationChain.on(ConversationChainEvents.Chatting, this.onChatting.bind(this));

        console.log('Client startup complete.');
    }

    async shutdown() {
        this.server.close();
        console.log('Client shutdown complete.');
    }

    private onReady(socket: Socket) {
        // Load the bots
        for (const botName of Object.keys(this.bots)) {
            socket.emit('new bot', botName);
        }
        // Load the conversation
        for (const message of this.conversationChain.conversations[0].messages) {
            socket.emit('chat message', message.sender, message.content);
        }
    }

    private onChatMessage(sender: string, content: string) {
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

    private onReset() {
        console.info('Client: Conversation reset()');
        this.conversationSequence = undefined;
        this.conversationChain.clear();
        this.io.emit('reset');
    }

    private onUpdateSettings(settings: any) {
        for (const [key, value] of Object.entries(settings)) {
            this.mainController.settings[key] = value;
            if (key === 'username') {
                this.username = String(value);
            }
        }
    }

    private onChatting(conversation: Conversation) {
        this.io.emit('typing', `${conversation.botController.settings.bot_name} is typing`);
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
                    this.io.emit(
                        'stop typing',
                        `${conversation.botController.settings.bot_name} stopped typing.`
                    );
                    this.io.emit('chat message', message.sender, message.content);
                    break;
                default:
                    this.io.emit('chat message', message.sender, message.content);
                    break;
            }
        }
    }

    private async onCreateBot(settingsFile: string) {
        try {
            const settings = await readSettings(`data/persistent/${settingsFile}`);

            // Do not add the same bot twice
            if (Object.keys(this.bots).includes(settings.bot_name)) {
                return;
            }

            const controller = new BotController(settings);
            const conversation = new Conversation(controller);

            // reuse existing controller models if possible
            let compatibleController: BotController | undefined;
            for (const bot of Object.values(this.bots)) {
                if (
                    bot.controller.settings.bot_backend.name === settings.bot_backend.name &&
                    bot.controller.settings.bot_backend.model === settings.bot_backend.model
                ) {
                    compatibleController = bot.controller;
                    break;
                }
            }
            await controller.init(compatibleController);

            this.conversationChain.addConversation(conversation);
            this.bots[settings.bot_name] = { conversation, controller };
            this.io.emit('new bot', settings.bot_name);
        } catch (ex) {
            this.io.emit('chat message', 'system', ex);
        }
    }

    private onDeleteBot(botName: string) {
        try {
            const bot = this.bots[botName];
            this.conversationChain.removeConversation(bot.conversation);
            delete this.bots[botName];
            this.io.emit('delete bot', botName);
        } catch (ex) {
            this.io.emit('chat message', 'system', ex);
        }
    }

    private listFiles(dir = 'data/persistent/', filelist: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
            if (fs.statSync(path.join(dir, file)).isDirectory()) {
                filelist = this.listFiles(path.join(dir, file), filelist);
            } else {
                filelist.push(path.relative(dir, path.join(dir, file)));
            }
        });
        return filelist;
    }
}
