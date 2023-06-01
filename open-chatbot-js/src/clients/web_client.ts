import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'node:path';

import { Server, Socket } from 'socket.io';
import { readSettings } from '../settings.js';
import { BotController } from '../utils/bot_controller.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { ConversationChain } from '../utils/conversation_chain.js';
import { BotClient } from './bot_client.js';

export class WebClient implements BotClient {
    private app: express.Express;
    private server: http.Server;
    private io: Server;

    private mainController: BotController;
    private conversation: Conversation;
    private conversationChain: ConversationChain;
    private conversationMarks: Map<Conversation, ConvMessage | undefined> = new Map();

    private bots: Record<string, { conversation: Conversation; controller: BotController }> = {};

    private username;

    constructor(settings: any, username = 'User') {
        this.username = username;
        this.mainController = new BotController(settings);
        this.conversation = new Conversation(this.mainController);
        this.conversationChain = new ConversationChain(this.conversation);
        this.bots[settings.bot_name] = {
            conversation: this.conversation,
            controller: this.mainController,
        };

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
                settings: this.conversation.botController.settings,
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
            this.conversation.botController.settings.web_server_port,
            this.conversation.botController.settings.web_server_host,
            () => {
                console.log(
                    `web-client listening on http://${this.conversation.botController.settings.web_server_host}:${this.conversation.botController.settings.web_server_port}`
                );
            }
        );

        this.conversation.on(ConversationEvents.Updated, this.onConversationUpdated.bind(this));
        await this.mainController.init();
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
        for (const message of this.conversation.messages) {
            socket.emit('chat message', message.sender, message.content);
        }
    }

    private onChatMessage(sender: string, content: string) {
        try {
            content = content.trimStart();
            if (content.length > 0) {
                const userMessage = new ConvMessage('user', sender, content);
                this.io.emit('chat message', sender, content);
                this.conversationChain.push(userMessage);
            }
        } catch (error) {
            console.error(error);
        }
    }

    private onReset() {
        console.info('Client: Conversation reset()');
        this.conversationChain.clear();
        this.conversationMarks.clear();
        this.io.emit('reset');
    }

    private onUpdateSettings(settings: any) {
        for (const [key, value] of Object.entries(settings)) {
            this.conversation.botController.settings[key] = value;
            if (key === 'username') {
                this.username = String(value);
            }
        }
    }

    private async onConversationUpdated(conversation: Conversation) {
        const mark = this.conversationMarks.get(conversation);
        const messages = conversation.getMessagesFromMark(mark) || conversation.messages;
        this.conversationMarks.set(conversation, conversation.mark());
        let shouldChat = false;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    shouldChat = message.sender == this.username;
                    if (!shouldChat) {
                        // User message handled in onChatMessage
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
                case 'system':
                    this.io.emit('chat message', message.sender, message.content);
                    break;
            }
        }
        if (shouldChat) {
            this.io.emit('typing', `${conversation.botController.settings.bot_name} is typing...`);
            await this.conversationChain.chat(conversation).catch(error => console.error(error));
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

    private async onDeleteBot(botName: string) {
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
