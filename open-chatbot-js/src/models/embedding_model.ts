export interface EmbeddingModel {
    dimension: number;
    createEmbedding: (content: string) => Promise<number[]>;
}
