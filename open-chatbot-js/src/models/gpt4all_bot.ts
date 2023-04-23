import axios from 'axios';
import { settings } from '../settings.js';
import { countStringTokens } from '../utils/token_utils.js';
import { BotModel, ConvMessage } from './bot_model.js';

export class GPT4AllBot implements BotModel {
    name: string;
    private model: string;

    constructor(name: string, model: string) {
        this.name = name;
        this.model = model;
    }

    fits(messages: ConvMessage[], tokenLimit?: number): boolean {
        const limit =
            tokenLimit != null
                ? tokenLimit >= 0
                    ? Math.min(tokenLimit, settings.bot_model_token_limit)
                    : settings.bot_model_token_limit + tokenLimit
                : settings.bot_model_token_limit;

        const numTokens = countStringTokens(
            messages
                .map(this.convMessageToGPT4AllMessage.bind(this))
                .map(message => message.content),
            'gpt-3.5-turbo' // TODO
        );

        return numTokens <= limit;
    }

    async chat(messages: ConvMessage[]): Promise<string> {
        try {
            const completion = await axios.post(
                'http://127.0.0.1:5000/chat',
                {
                    model: this.model,
                    messages: messages.map(this.convMessageToGPT4AllMessage.bind(this)),
                },
                {
                    timeout: settings.browser_timeout,
                }
            );
            return String(completion.data);
        } catch (error) {
            console.error(`GPT4All: ${error}`);
        }
        return '';
    }

    async createEmbedding(_messages: ConvMessage[]): Promise<number[]> {
        // TODO: support embeddings
        return [];
    }

    private convMessageToGPT4AllMessage(message: ConvMessage): {
        role: string;
        content: string;
    } {
        const role = message.role;
        return {
            role: role,
            content:
                role.toLowerCase() === 'user'
                    ? `${message.sender}: ${message.content}`
                    : message.content,
        };
    }
}
