import { ConversationData } from './converstation_data.js';

export interface BotModel {
    name: string;
    ask: (conversation: ConversationData) => Promise<string>;
}
