import axios from 'axios';
import { Command } from '../bot_api/command_api.js';
import { settings } from '../settings.js';
import { countStringTokens } from '../utils/token_utils.js';
import { BotModel } from './bot_model.js';
import { ConvMessage } from './conv_message.js';

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
        const commands = Object.values(Command).map(c => c.toString());
        const senders = Array.from(
            new Set(
                messages
                    .filter(message => message.role != 'assistant')
                    .map(message => message.sender)
                    .concat(commands)
                    .concat(['U', 'User'])
            )
        );
        const stopping_strings = [
            '<START>',
            '<END>',
            '</END>',
            '<ANSWER>',
            '\nUser:',
            '\nSystem:',
        ].concat(senders.map(s => `\n${s}:`));
        const prompt =
            messages.map(this.convMessageToString.bind(this)).join('\n') + `\n${this.name}:`;

        try {
            console.debug(`WebUI: chat with ${messages.length} messages...`);
            const startTime = Date.now();

            const completion = await axios.post(
                `${this.endpoint}/generate`,
                {
                    prompt: prompt,
                    use_authors_note: false,
                    use_memory: false,
                    use_story: false,
                    use_world_info: false,
                    temperature: 0.63,
                    top_p: 0.98,
                    typical_p: 1,
                    top_k: 0,
                    max_new_tokens: 768,
                    truncation_length: settings.bot_model_token_limit,
                    stopping_strings: stopping_strings,
                },
                {
                    timeout: settings.browser_timeout,
                }
            );

            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`WebUI: response received after ${elapsedMs}ms`);

            const regex1 = new RegExp(
                `(${stopping_strings
                    .map(s => s.substring(0, s.length - 1).replaceAll('|', '[|]'))
                    .join('|')}|${senders.join(':|')}:).*`,
                'gi'
            );
            const regex2 = new RegExp(`(<|>|${senders.join('|')})+[:]*\\s*$`, 'gi');
            return String(completion.data.results[0].text)
                .replaceAll(`${this.name}:`, '')
                .replaceAll('\\\\_', '_')
                .replaceAll('\\_', '_')
                .replace(regex1, '')
                .replace(regex2, '')
                .trim();
        } catch (error) {
            console.error(`WebUI: ${error}`);
        }
        return '';
    }

    private convMessageToString(message: ConvMessage): string {
        return message.role === 'system'
            ? message.content
            : `${message.sender}: ${message.content}`;
    }
}
