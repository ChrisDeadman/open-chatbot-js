import { ConvMessage } from '../utils/conv_message.js';

export interface EmbeddingModel {
    dimension: number;
    createEmbedding: (messages: ConvMessage[]) => Promise<number[]>;
}
