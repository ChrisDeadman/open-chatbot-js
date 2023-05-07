import { ConvMessage } from './conv_message.js';

export interface EmbeddingModel {
    embedding_dimension: number;
    createEmbedding: (messages: ConvMessage[]) => Promise<number[]>;
}
