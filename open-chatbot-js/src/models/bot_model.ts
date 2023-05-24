import { ConvMessage } from '../utils/conv_message.js';

export interface BotModel {
    name: string;
    chat: (messages: ConvMessage[]) => Promise<string>;
}
