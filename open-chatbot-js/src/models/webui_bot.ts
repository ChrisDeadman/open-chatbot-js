import axios from 'axios';
import { settings } from '../settings.js';
import { ConvMessage } from '../utils/conv_message.js';
import { buildStoppingStrings, filterResponse } from '../utils/llama_utils.js';
import { BotModel } from './bot_model.js';

export class WebUIBot implements BotModel {
    name: string;
    maxTokens: number;
    private endpoint: string;

    constructor(name: string, endpoint: string, maxTokens: number) {
        this.name = name;
        this.maxTokens = maxTokens;
        this.endpoint = endpoint;
    }

    async chat(messages: ConvMessage[]): Promise<string> {
        const prompt = messages.map(m => m.toString()).join('\n') + `\n${this.name}:`;
        const stoppingStrings = buildStoppingStrings(messages);

        console.debug(`WebUI: chat with ${messages.length} messages...`);
        const startTime = Date.now();
        try {
            const completion = await axios.post(
                `${this.endpoint}/generate`,
                {
                    prompt,
                    use_authors_note: false,
                    use_memory: false,
                    use_story: false,
                    use_world_info: false,
                    temperature: 0.63,
                    top_p: 0.98,
                    top_k: 0,
                    typical_p: 1,
                    max_new_tokens: 512,
                    truncation_length: this.maxTokens,
                    stopping_strings: stoppingStrings,
                },
                {
                    timeout: settings.browser_timeout,
                }
            );
            const response = String(completion.data.results[0].text);

            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`WebUI: response took ${elapsedMs}ms`);

            return filterResponse(response, stoppingStrings);
        } catch (error) {
            console.error(`WebUI: ${error}`);
        }
        return '';
    }
}
