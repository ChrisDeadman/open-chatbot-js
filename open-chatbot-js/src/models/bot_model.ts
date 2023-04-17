import { ConvMessage } from './conversation_data.js';

export interface BotModel {
    name: string;
    fits: (messages: ConvMessage[], tokenLimit?: number) => boolean;
    chat: (messages: ConvMessage[]) => Promise<string>;
    createEmbedding: (messages: ConvMessage[]) => Promise<number[]>;
}
