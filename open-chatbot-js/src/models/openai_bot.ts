import { TiktokenModel, encoding_for_model } from '@dqbd/tiktoken';
import axios from 'axios';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { ChatCompletionRequestMessageRoleEnum, Configuration, OpenAIApi } from 'openai';
import { settings } from '../settings.js';
import { ConvMessage, buildPrompt } from '../utils/conv_message.js';
import { BotModel } from './bot_model.js';
import { EmbeddingModel } from './embedding_model.js';
import { TokenModel } from './token_model.js';

enum JobType {
    chat = 'chat',
    createEmbedding = 'createEmbedding',
}

type JobData = { messages: ConvMessage[] };

export class OpenAIBot extends TokenModel implements BotModel, EmbeddingModel {
    name: string;
    dimension = 1536;
    maxTokens: number;
    private openai: OpenAIApi;
    private model: string;
    private chatQueue: Queue<JobData, any>;
    private chatQueueEvents: QueueEvents;
    private worker: Worker;

    constructor(name: string, openai_api_key: string, model: string, maxTokens: number) {
        super();

        this.name = name;
        this.maxTokens = maxTokens;
        this.openai = new OpenAIApi(new Configuration({ apiKey: openai_api_key }));
        this.model = model;

        this.chatQueue = new Queue<JobData, any>(`queue:${name}:jobs`, {
            connection: {
                host: settings.redis_host,
                port: settings.redis_port,
            },
        });
        this.chatQueue.obliterate({ force: true }); // remove old jobs
        this.chatQueueEvents = new QueueEvents(this.chatQueue.name, {
            connection: {
                host: settings.redis_host,
                port: settings.redis_port,
            },
        });
        this.worker = new Worker(this.chatQueue.name, this.processChatJob.bind(this), {
            connection: {
                host: settings.redis_host,
                port: settings.redis_port,
            },
            limiter: {
                max: 1,
                duration: settings.bot_model_rate_limit_ms,
            },
        });
    }

    async chat(messages: ConvMessage[]): Promise<string> {
        const job = await this.chatQueue.add(JobType.chat.toString(), {
            messages: messages,
        });
        const result = await job.waitUntilFinished(this.chatQueueEvents);
        if (result != null) {
            return result;
        }
        return '';
    }

    async createEmbedding(messages: ConvMessage[]): Promise<number[]> {
        if (messages.length <= 0) {
            return [];
        }
        const job = await this.chatQueue.add(JobType.createEmbedding.toString(), {
            messages,
        });
        const result = await job.waitUntilFinished(this.chatQueueEvents);
        if (result === null) {
            return [];
        }
        return result;
    }

    async tokenize(messages: ConvMessage[]): Promise<number[]> {
        const content = await buildPrompt(messages);
        const enc = encoding_for_model(this.model as TiktokenModel);
        try {
            return [...enc.encode(content)];
        } finally {
            enc.free();
        }
    }

    private async processChatJob(job: Job<JobData>): Promise<any | null> {
        let result: any;
        try {
            console.debug(`OpenAI: ${job.name} with ${job.data.messages.length} messages...`);
            const startTime = Date.now();

            switch (JobType[job.name as keyof typeof JobType]) {
                case JobType.chat: {
                    result = await this.createChatCompletion(job.data.messages);
                    break;
                }
                case JobType.createEmbedding: {
                    result = await this._createEmbedding(job.data.messages);
                    break;
                }
                default: {
                    throw new Error('Job Type not implemented.');
                }
            }

            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`OpenAI: response took ${elapsedMs}ms`);
            this.worker.rateLimit(settings.bot_model_rate_limit_ms);
        } catch (error) {
            console.error(`OpenAI: ${error}`);
            if (axios.isAxiosError(error)) {
                // Obey OpenAI rate limit or retry on timeout
                const status = error.response?.status;
                if (status === undefined || status == 429) {
                    this.worker.rateLimit(settings.bot_model_rate_limit_ms);
                    throw Worker.RateLimitError();
                }
            }
        }
        return result;
    }

    private async createChatCompletion(messages: ConvMessage[]): Promise<string> {
        const completion = await this.openai.createChatCompletion(
            {
                model: this.model,
                messages: messages.map(this.convMessageToOpenAIMessage.bind(this)),
            },
            {
                timeout: settings.browser_timeout,
            }
        );
        const message = completion.data.choices[0].message;
        return message ? message.content : '';
    }

    private async _createEmbedding(messages: ConvMessage[]): Promise<number[]> {
        const input = await buildPrompt(messages);
        const result = await this.openai.createEmbedding({
            input: input,
            model: settings.embedding_model,
        });
        return result.data.data[0].embedding;
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
