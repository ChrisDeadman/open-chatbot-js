import express from 'express';
import http from 'http';
import path from 'node:path';
import { Server } from 'socket.io';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation, ConversationEvents } from '../utils/conversation.js';
import { BotClient } from './bot_client.js';

export class WebClient extends BotClient {
    private app: express.Express;
    private server: http.Server;
    private io: Server;
    protected conversation: Conversation;
    private username;

    constructor(
        settings: any,
        botModel: BotModel,
        tokenModel: TokenModel,
        botApiHandler: CommandApi,
        memory: MemoryProvider | undefined = undefined,
        username = 'User'
    ) {
        super(botModel, tokenModel, botApiHandler);
        this.username = username;
        this.conversation = new Conversation(settings, tokenModel, memory);

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
            this.conversation.clear();
            res.render('index', {
                username: this.username,
                settings: this.conversation.settings,
            });
        });

        this.io.on('connection', socket => {
            socket.on('chat message', async (sender, messsage) => {
                try {
                    messsage = messsage.trimStart();
                    if (messsage.length > 0) {
                        // Add new message to conversation
                        this.conversation.push(new ConvMessage('user', sender, messsage));
                    }
                } catch (error) {
                    console.error(error);
                }
            });
            socket.on('update settings', async settings => {
                this.username = settings.username;
                for (const [key, value] of Object.entries(settings)) {
                    this.conversation.settings[key] = value;
                }
            });
            socket.on('update prompt', async prompt_templates => {
                for (const [key, value] of Object.entries(prompt_templates)) {
                    this.conversation.settings.prompt_templates[key] = value;
                }
            });
        });

        this.server.listen(
            this.conversation.settings.web_server_port,
            this.conversation.settings.web_server_host,
            () => {
                console.log(
                    `web-client listening on http://${this.conversation.settings.web_server_host}:${this.conversation.settings.web_server_port}`
                );
            }
        );

        this.conversation.on(ConversationEvents.Updated, this.onConversationUpdated.bind(this));
        console.log('Bot startup complete.');
    }

    async shutdown() {
        this.server.close();
        console.log('Bot has been shut down.');
    }

    async onConversationUpdated(conversation: Conversation) {
        const messages = conversation.getMessagesFromMark();
        conversation.mark();
        let chat = false;
        for (const message of messages) {
            switch (message.role) {
                case 'user': {
                    if (message.sender != this.username) {
                        this.io.emit('chat message', message.sender, message.content);
                    }
                    chat = true;
                    break;
                }
                case 'assistant':
                    this.io.emit(
                        'stop typing',
                        `${conversation.settings.bot_name} stopped typing.`
                    );
                    this.io.emit('chat message', message.sender, message.content);
                    break;
                case 'system':
                    this.io.emit('chat message', message.sender, message.content);
                    break;
            }
        }
        if (chat) {
            try {
                this.io.emit('typing', `${conversation.settings.bot_name} is typing...`);
                await this.chat(conversation);
            } catch (error) {
                console.error(error);
            }
        }
    }
}
