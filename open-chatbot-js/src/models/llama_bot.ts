import type { Generate } from '@llama-node/llama-cpp';
import { LLM } from 'llama-node';
import { LLamaCpp, type LoadConfig } from 'llama-node/dist/llm/llama-cpp.js';
import { ConvMessage, buildPrompt } from '../utils/conv_message.js';
import { buildStoppingStrings, filterResponse } from '../utils/llama_utils.js';
import { BotModel } from './bot_model.js';

export class LlamaBot implements BotModel {
    name: string;
    llm: LLM;

    private config: LoadConfig;

    constructor(name: string, model: string, maxTokens: number) {
        this.name = name;
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

    async chat(messages: ConvMessage[]): Promise<string> {
        console.debug(`Llama: chat with ${messages.length} messages...`);
        const startTime = Date.now();
        try {
            const stoppingStrings = buildStoppingStrings(messages);
            const prompt = await buildPrompt(messages);
            const stopSequence = '### '; //`${messages.filter(m => m.role === 'user').at(-1)?.sender}:`;
            const params = this.buildParams(prompt, stopSequence);

            const completion = await this.llm.createCompletion(params, () => {
                // wait until finished
            });
            const response = String(completion.tokens.join(''));

            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`Llama: finished after ${elapsedMs}ms`);

            return filterResponse(response, stoppingStrings);
        } catch (error) {
            console.error(`Llama: ${error}`);
        }
        return '';
    }

    private buildParams(prompt: string, stopSequence: string): Generate {
        return {
            prompt,
            stopSequence,
            temp: 0.7,
            topP: 0.9,
            topK: 4,
            typicalP: 1.0,
            repeatPenalty: 1.18,
            nTokPredict: 512,
            nThreads: 16,
        };
    }
}
