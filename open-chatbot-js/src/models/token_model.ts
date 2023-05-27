export interface TokenModel {
    maxTokens: number;
    tokenize: (content: string) => Promise<number[]>;
}
