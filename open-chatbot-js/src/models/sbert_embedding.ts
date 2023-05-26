import { exec } from 'child_process';
import { EmbeddingModel } from './embedding_model.js';
import { TokenModel } from './token_model.js';
import { ConvMessage, buildPrompt } from '../utils/conv_message.js';
import { TiktokenModel, encoding_for_model } from '@dqbd/tiktoken';

export class SbertEmbedding extends TokenModel implements EmbeddingModel {
    dimension = 768;
    maxTokens: number;
    private model: string;

    constructor(model: string, maxTokens: number) {
        super();
        this.model = model;
        this.maxTokens = maxTokens;
    }

    async tokenize(messages: ConvMessage[]): Promise<number[]> {
        if (messages.length <= 0) {
            return [];
        }

        const content = await buildPrompt(messages);

        // TODO proper tokenizing
        const enc = encoding_for_model('text-embedding-ada-002' as TiktokenModel);
        try {
            return [...enc.encode(content)];
        } finally {
            enc.free();
        }
    }

    async createEmbedding(messages: ConvMessage[]): Promise<number[]> {
        if (messages.length <= 0) {
            return [];
        }

        console.debug(`SbertEmbedding: createEmbedding with ${messages.length} messages...`);
        const startTime = Date.now();

        const prompt = await buildPrompt(messages);
        const output = await this.runPythonScript('utils/sbert-embedding.py', [
            '--model',
            `"${this.model}"`,
            `'${prompt.replace(/'/g, `'"'"'`)}'`,
        ]);
        const embeddings = JSON.parse(output);

        const endTime = Date.now();
        const elapsedMs = endTime - startTime;
        console.debug(`SbertEmbedding: finished after ${elapsedMs}ms`);

        return embeddings.flat();
    }

    private runPythonScript(scriptPath: string, args: string[]): Promise<string> {
        return new Promise((resolve, reject) => {
            const command = `python3 ${scriptPath} ${args.join(' ')}`;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            exec(command, (error, stdout, _stderr) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        });
    }
}
