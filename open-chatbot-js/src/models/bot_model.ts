export type ConvMessage = { role: string; sender: string; content: string };

export interface BotModel {
    name: string;
    fits: (messages: ConvMessage[], tokenLimit?: number) => boolean;
    chat: (messages: ConvMessage[]) => Promise<string>;
    createEmbedding: (messages: ConvMessage[]) => Promise<number[]>;
}
