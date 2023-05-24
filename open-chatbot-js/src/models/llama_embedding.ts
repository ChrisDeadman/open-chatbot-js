import type { Generate } from '@llama-node/llama-cpp';
import { LLM } from 'llama-node';
import { LLamaCpp, type LoadConfig } from 'llama-node/dist/llm/llama-cpp.js';
import { ConvMessage, buildPrompt } from '../utils/conv_message.js';
import { EmbeddingModel } from './embedding_model.js';
import { TokenModel } from './token_model.js';

export class LlamaEmbedding extends TokenModel implements EmbeddingModel {
    dimension: number;
    maxTokens: number;

    private llm: LLM;
    private config: LoadConfig;

    constructor(model: string, maxTokens: number) {
        super();
        this.maxTokens = maxTokens;
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
            embedding: true,
            useMmap: true,
            nGpuLayers: 32,
        };

        this.dimension = 0;
    }

    async init() {
        console.info(`LlamaEmbedding: loading model ${this.config.modelPath}...`);
        await this.llm.load(this.config);
        console.info('LlamaEmbedding: getting embedding dimension...');
        const params = this.buildParams('to get the dimension');
        this.dimension = (await this.llm.getEmbedding(params)).length;
        console.info(`LlamaEmbedding: embedding dimension is ${this.dimension}.`);
    }

    async tokenize(messages: ConvMessage[]): Promise<number[]> {
        if (messages.length <= 0) {
            return [];
        }

        const content = await buildPrompt(messages);
        return this.llm.tokenize(content);
    }

    async createEmbedding(messages: ConvMessage[]): Promise<number[]> {
        if (messages.length <= 0) {
            return [];
        }

        console.debug(`LlamaEmbedding: createEmbedding with ${messages.length} messages...`);
        const startTime = Date.now();

        const prompt = await buildPrompt(messages);
        const params = this.buildParams(prompt);

        const embedding = await this.llm.getEmbedding(params);

        const endTime = Date.now();
        const elapsedMs = endTime - startTime;
        console.debug(`LlamaEmbedding: finished after ${elapsedMs}ms`);

        return embedding;
    }

    private buildParams(prompt: string): Generate {
        return {
            prompt,
            temp: 0.7,
            topP: 0.1,
            topK: 40,
            typicalP: 1.0,
            repeatPenalty: 1.18,
            nTokPredict: 512,
            nThreads: 16,
        };
    }
}
