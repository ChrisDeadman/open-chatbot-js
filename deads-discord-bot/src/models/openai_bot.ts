import axios from 'axios';
import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { Configuration, OpenAIApi } from 'openai';
import { settings } from '../settings.js';
import { BotModel } from './bot_model.js';
import { ConversationData } from './converstation_data.js';
type JobData = { messages: any[]; language: string };
type JobResult = string;

export class OpenAIBot implements BotModel {
    name: string;
    private openai: OpenAIApi;
    private model: string;
    private chatQueue = new Queue<JobData, JobResult>('processChatJob');
    private chatQueueEvents: QueueEvents;
    private worker: Worker;

    constructor(name: string, openai_api_key: string, model = settings.openai_model) {
        this.name = name;
        this.openai = new OpenAIApi(new Configuration({ apiKey: openai_api_key }));
        this.model = model;
        this.chatQueueEvents = new QueueEvents(this.chatQueue.name);
        this.chatQueue.obliterate({ force: true }); // remove old jobs
        this.worker = this.createWorker();
    }

    private createWorker(): Worker {
        return new Worker(this.chatQueue.name, this.processChatJob.bind(this), {
            limiter: {
                max: 1,
                duration: 2000,
            },
        });
    }

    async ask(initial_prompt: [string], conversation: ConversationData): Promise<string> {
        const job = await this.chatQueue.add('ask', {
            messages: this.getMessages(initial_prompt, conversation),
            language: conversation.language,
        });
        const response = await job.waitUntilFinished(this.chatQueueEvents);
        // Strip the botname in case it responds with it
        const prefix = `${this.name}: `;
        if (response.startsWith(prefix)) {
            return response.substring(prefix.length);
        }
        return response;
    }

    private async processChatJob(job: Job<JobData>): Promise<string> {
        try {
            console.debug(`OpenAI: sending ${job.data.messages.length} messages...`);
            const startTime = Date.now();
            const completion = await this.openai.createChatCompletion(
                {
                    model: this.model,
                    messages: job.data.messages,
                },
                {
                    timeout: settings.www_timeout,
                }
            );
            const endTime = Date.now();
            const elapsedMs = endTime - startTime;
            console.debug(`OpenAI: response received after ${elapsedMs}ms`);
            const message = completion.data.choices[0].message;
            return message ? message.content : '[EMPTY]';
        } catch (error) {
            console.error(`OpenAI: ${error}`);
            if (axios.isAxiosError(error)) {
                // Obey OpenAI rate limit or retry on timeout
                const status = error.response?.status;
                if (status === undefined || status == 429) {
                    await this.worker.rateLimit(2000);
                    throw Worker.RateLimitError();
                }
            }
            return String(error);
        }
    }

    private getMessages(initial_prompt: [string], conversation: ConversationData): any {
        const now = new Date().toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            timeZoneName: 'short',
        });
        return [
            {
                role: 'system',
                content: initial_prompt
                    .join('\n')
                    .replaceAll('$BOT_NAME', this.name)
                    .replaceAll('$NOW', now)
                    .replaceAll('$LANGUAGE', conversation.language),
            },
        ].concat(conversation.getMessages());
    }
}
