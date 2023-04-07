import { Job, Queue, QueueEvents, Worker } from 'bullmq';
import { Configuration, OpenAIApi } from 'openai';
import { BotModel } from './bot_model.js';
import { ConversationData } from './converstation_data.js';

type JobData = { messages: any[]; language: string };
type JobResult = string;

export class OpenAIBot implements BotModel {
    name: string;
    private initial_prompt: string[];
    private openai: OpenAIApi;
    private chatQueue = new Queue<JobData, JobResult>('processChatJob');
    private chatQueueEvents: QueueEvents;

    constructor(name: string, initial_prompt: string[], openai_api_key: string) {
        this.name = name;
        this.initial_prompt = initial_prompt;
        this.openai = new OpenAIApi(new Configuration({ apiKey: openai_api_key }));
        this.chatQueueEvents = new QueueEvents(this.chatQueue.name);
        new Worker(this.chatQueue.name, this.processChatJob.bind(this), {
            limiter: {
                max: 1,
                duration: 1000,
            },
        });
    }

    async ask(conversation: ConversationData): Promise<string> {
        const job = await this.chatQueue.add('ask', {
            messages: this.getMessages(conversation),
            language: conversation.language,
        });
        const result = await job.waitUntilFinished(this.chatQueueEvents);
        // Strip the botname in case it responds with it
        const prefix = `${this.name}: `;
        if (result.startsWith(prefix)) {
            return result.substring(prefix.length);
        }
        return result;
    }

    private async processChatJob(job: Job<JobData>): Promise<string> {
        try {
            const completion = await this.openai.createChatCompletion({
                model: 'gpt-3.5-turbo',
                messages: job.data.messages,
            });
            const message = completion.data.choices[0].message;
            return message ? message.content : '<EMPTY>';
        } catch (error) {
            return String(error);
        }
    }

    private getMessages(conversation: ConversationData): any {
        return [
            {
                role: 'system',
                content: this.initial_prompt
                    .join('\n')
                    .replaceAll('$BOT_NAME', this.name)
                    .replaceAll('$LANGUAGE', conversation.language),
            },
        ].concat(conversation.getMessages());
    }
}
