import { ConversationData } from './converstation_data.js';

export interface BotModel {
    name: string;
    ask: (initial_prompt: [string], conversation: ConversationData) => Promise<string>;
}
