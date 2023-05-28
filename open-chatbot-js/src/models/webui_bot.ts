import axios from 'axios';
import { Conversation } from '../utils/conversation.js';
import { buildStoppingStrings, filterResponse } from '../utils/llama_utils.js';
import { BotModel } from './bot_model.js';

export class WebUIBot implements BotModel {
    maxTokens: number;
    private endpoint: string;

    constructor(endpoint: string, maxTokens: number) {
        this.maxTokens = maxTokens;
        this.endpoint = endpoint;
    }

    async chat(conversation: Conversation): Promise<string> {
        const messages = await conversation.getPrompt();
        console.debug(`WebUI: chat with ${messages.length} messages...`);
        const startTime = Date.now();
        try {
            const stoppingStrings = buildStoppingStrings(messages);
            const prompt = await conversation.getPromptString(messages);

            const completion = await axios.post(
                `${this.endpoint}/generate`,
                {
                    prompt,
                    stopping_strings: stoppingStrings,
                    seed: Math.round(Math.random() * 1e9),
                    use_authors_note: false,
                    use_memory: false,
                    use_story: false,
                    use_world_info: false,
                    add_bos_token: true,
                    skip_special_tokens: true,
                    ban_eos_token: false,
                    do_sample: true,
                    temperature: conversation.settings.bot_backend.temperature,
                    top_p: conversation.settings.bot_backend.top_p,
                    top_k: conversation.settings.bot_backend.top_k,
                    typical_p: conversation.settings.bot_backend.typical_p,
                    repetition_penalty: conversation.settings.bot_backend.repetition_penalty,
                    max_new_tokens: conversation.settings.bot_backend.max_new_tokens,
                    truncation_length: this.maxTokens,
                },
                {
                    timeout: conversation.settings.browser_timeout,
                }
            );
            const response = String(completion.data.results[0].text);

            // console.debug(`WebUI DEBUG:\n${prompt}${response}`);

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
