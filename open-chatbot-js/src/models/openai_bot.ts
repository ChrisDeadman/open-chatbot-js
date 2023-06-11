import { TiktokenModel, encoding_for_model } from '@dqbd/tiktoken';
import axios from 'axios';
import { ChatCompletionRequestMessageRoleEnum, Configuration, OpenAIApi } from 'openai';
import { ConvMessage } from '../utils/conv_message.js';
import { Conversation } from '../utils/conversation.js';
import { BotModel } from './bot_model.js';
import { EmbeddingModel } from './embedding_model.js';
import { TokenModel } from './token_model.js';

export class OpenAIBot implements BotModel, TokenModel, EmbeddingModel {
    apiTimeout = 60000;
    dimension = 1536;
    maxTokens: number;
    private model: string;
    private embeddingModel: string;
    private ratelimitMs: number;
    private openai: OpenAIApi;

    constructor(
        apiKey: string,
        model: string,
        embeddingModel: string,
        maxTokens: number,
        ratelimitMs: number
    ) {
        this.model = model;
        this.embeddingModel = embeddingModel;
        this.maxTokens = maxTokens;
        this.ratelimitMs = ratelimitMs;
        this.openai = new OpenAIApi(new Configuration({ apiKey }));
    }

    async chat(conversation: Conversation): Promise<string> {
        const messages = await conversation.getPrompt();
        const job = async () => {
            console.debug(`OpenAI: chat with ${messages.length} messages...`);
            const completion = await this.openai.createChatCompletion(
                {
                    model: this.model,
                    messages: messages.map(this.convMessageToOpenAIMessage.bind(this)),
                },
                {
                    timeout: this.apiTimeout,
                }
            );
            const message = completion.data.choices[0].message;
            return message ? message.content : '';
        };
        const result = this.processJob(job);
        if (result != null) {
            return result;
        }
        return '';
    }

    async countTokens(prompt: string): Promise<number> {
        const tokens = await this.tokenize(prompt);
        return tokens.length;
    }

    async createEmbedding(content: string): Promise<number[]> {
        if (content.length <= 0) {
            return [];
        }
        const job = async () => {
            console.debug(`OpenAI: createEmbedding for ${content.length} chars...`);
            const result = await this.openai.createEmbedding(
                {
                    input: content,
                    model: this.embeddingModel,
                },
                {
                    timeout: this.apiTimeout,
                }
            );
            return result.data.data[0].embedding;
        };
        const result = this.processJob(job);
        if (result != null) {
            return result;
        }
        return [];
    }

    async tokenize(content: string): Promise<number[]> {
        const enc = encoding_for_model(this.model as TiktokenModel);
        try {
            return [...enc.encode(content)];
        } finally {
            enc.free();
        }
    }

    private async processJob(job: () => Promise<any>): Promise<any> {
        let result: any = null;
        while (result === null) {
            try {
                const startTime = Date.now();
                result = await job();
                const endTime = Date.now();
                const elapsedMs = endTime - startTime;
                console.debug(`OpenAI: response took ${elapsedMs}ms`);
            } catch (error) {
                console.error(`OpenAI: ${error}`);
                if (axios.isAxiosError(error)) {
                    const status = error.response?.status;
                    if (status === undefined || status === 429) {
                        // Obey OpenAI rate limit or retry on timeout
                        await new Promise(resolve => setTimeout(resolve, this.ratelimitMs));
                        continue;
                    }
                }
                break;
            }
        }
        return result;
    }

    private convMessageToOpenAIMessage(message: ConvMessage): {
        role: ChatCompletionRequestMessageRoleEnum;
        content: string;
    } {
        const role = message.role as ChatCompletionRequestMessageRoleEnum;
        return {
            role: role,
            content:
                role === ChatCompletionRequestMessageRoleEnum.User
                    ? `${message.sender}: ${message.content}`
                    : message.content,
        };
    }
}
