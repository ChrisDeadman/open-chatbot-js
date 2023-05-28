import { LLM } from 'llama-node';
import { LLamaCpp, type LoadConfig } from 'llama-node/dist/llm/llama-cpp.js';
import { Conversation } from '../utils/conversation.js';
import { buildStoppingStrings, filterResponse } from '../utils/llama_utils.js';
import { BotModel } from './bot_model.js';

export class LlamaBot implements BotModel {
    llm: LLM;

    private config: LoadConfig;

    constructor(model: string, maxTokens: number) {
        this.llm = new LLM(LLamaCpp);
        this.config = {
            modelPath: model,
            enableLogging: true,
            nCtx: maxTokens,
            seed: Math.round(Math.random() * 1e9),
            f16Kv: false,
            logitsAll: false,
            vocabOnly: false,
            useMlock: false,
            embedding: false,
            useMmap: true,
            nGpuLayers: 32,
        };
    }

    async init(llm?: LLM) {
        if (llm) {
            this.llm = llm;
        } else {
            console.info(`LlamaBot: loading model ${this.config.modelPath}...`);
            await this.llm.load(this.config);
        }
    }

    async chat(conversation: Conversation): Promise<string> {
        const messages = await conversation.getPrompt();
        console.debug(`Llama: chat with ${messages.length} messages...`);
        const startTime = Date.now();
        try {
            const stoppingStrings = buildStoppingStrings(messages);
            const prompt = await conversation.getPromptString(messages);
            const stopSequence = '</s>';
            const params = {
                prompt,
                stopSequence,
                temp: conversation.settings.bot_backend.temperature,
                topP: conversation.settings.bot_backend.top_p,
                topK: conversation.settings.bot_backend.top_k,
                typicalP: conversation.settings.bot_backend.typical_p,
                repeatPenalty: conversation.settings.bot_backend.repetition_penalty,
                nTokPredict: conversation.settings.bot_backend.max_new_tokens,
                nThreads: 16,
            };

            const completion = await this.llm.createCompletion(params, () => {
                // wait until finished
            });
            const response = String(completion.tokens.join(''));

            //console.debug(`Llama DEBUG:\n${prompt}${response}`);

            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`Llama: finished after ${elapsedMs}ms`);

            return filterResponse(response, stoppingStrings);
        } catch (error) {
            console.error(`Llama: ${error}`);
        }
        return '';
    }
}
