import axios from 'axios';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { ChatCompletionRequestMessageRoleEnum, Configuration, OpenAIApi } from 'openai';
import { settings } from '../settings.js';
import { countStringTokens } from '../utils/token_utils.js';
import { BotModel, ConvMessage } from './bot_model.js';

enum JobType {
    chat = 'chat',
    createEmbedding = 'createEmbedding',
}

type JobData = { messages: ConvMessage[] };

export class OpenAIBot implements BotModel {
    name: string;
    private openai: OpenAIApi;
    private model: string;
    private chatQueue: Queue<JobData, any>;
    private chatQueueEvents: QueueEvents;
    private worker: Worker;

    constructor(name: string, openai_api_key: string, model: string) {
        this.name = name;
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
                duration: settings.openai_rate_limit_ms,
            },
        });
    }

    fits(messages: ConvMessage[], tokenLimit?: number): boolean {
        const limit =
            tokenLimit != null
                ? tokenLimit >= 0
                    ? Math.min(tokenLimit, settings.openai_token_limit)
                    : settings.openai_token_limit - tokenLimit
                : settings.openai_token_limit;

        const numTokens = countStringTokens(
            messages
                .map(this.convMessageToOpenAIMessage.bind(this))
                .map(message => message.content),
            this.model
        );

        return numTokens <= limit;
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
        let memContext: ConvMessage[] = [];
        for (let i = -9; i <= 0; i += 1) {
            memContext = messages.filter(msg => msg.role != 'system').slice(i);
            const numTokens = countStringTokens(
                messages
                    .map(this.convMessageToOpenAIMessage.bind(this))
                    .map(message => message.content),
                settings.openai_embedding_model
            );
            if (numTokens <= settings.openai_token_limit) {
                break;
            }
        }

        if (memContext.length > 0) {
            const job = await this.chatQueue.add(JobType.createEmbedding.toString(), {
                messages: memContext,
            });
            const result = await job.waitUntilFinished(this.chatQueueEvents);
            if (result != null) {
                return result;
            }
        }
        return [];
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
            console.debug(`OpenAI: response received after ${elapsedMs}ms`);
            this.worker.rateLimit(settings.openai_rate_limit_ms);
        } catch (error) {
            console.error(`OpenAI: ${error}`);
            if (axios.isAxiosError(error)) {
                // Obey OpenAI rate limit or retry on timeout
                const status = error.response?.status;
                if (status === undefined || status == 429) {
                    this.worker.rateLimit(settings.openai_rate_limit_ms);
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
        const input = messages.map(msg => msg.content).join('\n');
        const result = await this.openai.createEmbedding({
            input: input,
            model: settings.openai_embedding_model,
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
