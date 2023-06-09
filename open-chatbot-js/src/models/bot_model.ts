import { Conversation } from '../utils/conversation.js';

export interface BotModel {
    chat: (conversation: Conversation) => Promise<string>;
    countTokens: (prompt: string) => Promise<number>;
}
