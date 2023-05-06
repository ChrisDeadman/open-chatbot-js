import axios from 'axios';
import { settings } from '../settings.js';
import { countStringTokens } from '../utils/token_utils.js';
import { BotModel, ConvMessage } from './bot_model.js';

export class WebUIBot implements BotModel {
    name: string;
    private endpoint: string;

    constructor(name: string, endpoint: string) {
        this.name = name;
        this.endpoint = endpoint;
    }

    fits(messages: ConvMessage[], tokenLimit?: number): boolean {
        const limit =
            tokenLimit != null
                ? tokenLimit >= 0
                    ? Math.min(tokenLimit, settings.bot_model_token_limit)
                    : settings.bot_model_token_limit + tokenLimit
                : settings.bot_model_token_limit;

        const numTokens = countStringTokens(
            messages.map(this.convMessageToString.bind(this)),
            'gpt-3.5-turbo' // TODO
        );

        return numTokens <= limit;
    }

    async chat(messages: ConvMessage[]): Promise<string> {
        try {
            const completion = await axios.post(
                `${this.endpoint}/generate`,
                {
                    prompt:
                        messages.map(this.convMessageToString.bind(this)).join('\n') +
                        `\n${this.name}:`,
                    seed: -1,
                    use_story: false,
                    use_memory: false,
                    use_authors_note: false,
                    use_world_info: false,
                    //early_stopping: false,
                    //add_bos_token: true,
                    //ban_eos_token: false,
                    //skip_special_tokens: true,
                    max_context_length: settings.bot_model_token_limit,
                    max_new_tokens: 250,
                    //max_length: 100,
                    rep_pen: 1.1,
                    rep_pen_range: 1024,
                    rep_pen_slope: 0.9,
                    temperature: 0.65,
                    tfs: 0.9,
                    top_a: 0,
                    top_k: 0,
                    top_p: 0.9,
                    typical: 1,
                    sampler_order: [6, 0, 1, 2, 3, 4, 5],
                    stopping_strings: ['\n<START>', '\nYou:', `\n${this.name}:`],
                },
                {
                    timeout: settings.browser_timeout,
                }
            );

            const senders = Array.from(new Set(messages.map(message => message.sender))).join(':|');
            const regex = new RegExp(`(<START|You:|${senders}:).*`, 'gi');
            const endRegex = new RegExp(`(<|>|You|${this.name})+[:]*\\s*$`, 'gi');
            return String(completion.data.results[0].text)
                .replace(`${this.name}:}`, '')
                .replace(regex, '')
                .trim()
                .replace(endRegex, '')
                .trim();
        } catch (error) {
            console.error(`WebUI: ${error}`);
        }
        return '';
    }

    async createEmbedding(_messages: ConvMessage[]): Promise<number[]> {
        // TODO: support embeddings
        return [];
    }

    private convMessageToString(message: ConvMessage): string {
        return message.role === 'system'
            ? message.content
            : `${message.sender}: ${message.content}`;
    }
}
