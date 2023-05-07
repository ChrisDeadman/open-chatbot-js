import { exec } from 'child_process';
import { settings } from '../settings.js';
import { countStringTokens } from '../utils/token_utils.js';
import { ConvMessage } from './conv_message.js';
import { EmbeddingModel } from './embedding_model.js';

export class SbertEmbedding implements EmbeddingModel {
    embedding_dimension = 768;
    private embedding_model: string;

    constructor(embedding_model: string) {
        this.embedding_model = embedding_model;
    }

    async createEmbedding(messages: ConvMessage[]): Promise<number[]> {
        let memContext: string[] = [];
        for (let i = -9; i <= 0; i += 1) {
            memContext = messages
                .filter(msg => msg.role != 'system')
                .slice(i)
                .map(this.convMessageToString.bind(this));
            const numTokens = countStringTokens(memContext, 'text-embedding-ada-002'); // TODO use closer model
            if (numTokens <= settings.bot_model_token_limit) {
                break;
            }
        }

        if (memContext.length > 0) {
            const output = await this.runPythonScript('utils/sbert-embeddings.py', [
                '--model',
                `"${this.embedding_model}"`,
                `"${memContext.join(' ').replaceAll('"', "'")}"`,
            ]);
            const embeddings = JSON.parse(output);
            return embeddings.flat();
        }
        return [];
    }

    private convMessageToString(message: ConvMessage): string {
        return message.role === 'system'
            ? message.content
            : `${message.sender}: ${message.content}`;
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
