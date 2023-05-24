import express from 'express';
import http from 'http';
import path from 'node:path';
import { Server } from 'socket.io';
import { CommandApi } from '../bot_api/command_api.js';
import { MemoryProvider } from '../memory/memory_provider.js';
import { BotModel } from '../models/bot_model.js';
import { TokenModel } from '../models/token_model.js';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { CyclicBuffer } from '../utils/cyclic_buffer.js';
import { BotClient } from './bot_client.js';

export class WebClient extends BotClient {
    private app: express.Express;
    private server: http.Server;
    private io: Server;
    protected conversation: CyclicBuffer<ConvMessage>;
    private username;
    private language;
    private chatting = false;

    constructor(
        botModel: BotModel,
        tokenModel: TokenModel,
        memory: MemoryProvider,
        botApiHandler: CommandApi,
        username = 'User'
    ) {
        super(botModel, tokenModel, memory, botApiHandler);
        this.username = username;
        this.language = settings.language;
        this.conversation = new CyclicBuffer(settings.message_history_size);

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
                botname: this.botModel.name,
                language: this.language,
                prompt_templates: settings.prompt_templates,
            });
        });

        this.io.on('connection', socket => {
            socket.on('chat message', async msg => {
                this.chatting = true;
                try {
                    msg = msg.trimStart();
                    if (msg.length > 0) {
                        // Add new message to conversation
                        this.conversation.push(new ConvMessage('user', this.username, `${msg}`));

                        // Chat with bot
                        await this.chat(this.conversation, this.language);
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    this.chatting = false;
                }
            });
            socket.on('update settings', async settings => {
                this.username = settings.username;
                this.botModel.name = settings.botname;
                this.language = settings.language;
            });
            socket.on('update prompt', async prompt_templates => {
                settings.prompt_templates = prompt_templates;
            });
        });

        this.server.listen(settings.web_server_port, settings.web_server_host, () => {
            console.log(
                `web-client listening on http://${settings.web_server_host}:${settings.web_server_port}`
            );
        });

        console.log('Bot startup complete.');
    }

    async shutdown() {
        this.server.close();
        console.log('Bot has been shut down.');
    }

    async handleResponse(_context: any, response: string): Promise<void> {
        if (this.chatting) {
            response = `${this.botModel.name}: ${response.trim()}`;
        } else {
            response = response.trim();
        }

        this.io.emit('chat message', response);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startTyping(_context: any): void {
        this.io.emit('typing', `${this.botModel.name} is typing...`);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    stopTyping(_context: any): void {
        this.io.emit('stop typing', `${this.botModel.name} stopped typing.`);
    }
}
