import axios from 'axios';
import { settings } from '../settings.js';
import { ConvMessage, buildPrompt } from '../utils/conv_message.js';
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
        const prompt = await buildPrompt(messages);
        const stoppingStrings = buildStoppingStrings(messages);

        console.debug(`WebUI: chat with ${messages.length} messages...`);
        const startTime = Date.now();
        try {
            const completion = await axios.post(
                `${this.endpoint}/generate`,
                {
                    prompt,
                    stopping_strings: stoppingStrings,
                    use_authors_note: false,
                    use_memory: false,
                    use_story: false,
                    use_world_info: false,
                    add_bos_token: true,
                    skip_special_tokens: true,
                    ban_eos_token: false,
                    do_sample: true,
                    temperature: 0.63,
                    top_p: 0.98,
                    top_k: 1,
                    typical_p: 1.0,
                    repetition_penalty: 1.18,
                    max_new_tokens: 512,
                    truncation_length: this.maxTokens,
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
