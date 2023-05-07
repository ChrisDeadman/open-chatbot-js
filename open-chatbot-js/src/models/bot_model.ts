import { ConvMessage } from './conv_message.js';

export interface BotModel {
    name: string;
    fits: (messages: ConvMessage[], tokenLimit?: number) => boolean;
    chat: (messages: ConvMessage[]) => Promise<string>;
}
