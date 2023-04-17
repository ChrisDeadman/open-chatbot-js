import { TiktokenModel, encoding_for_model } from '@dqbd/tiktoken';

export function countStringTokens(text: string[], model: string): number {
    const enc = encoding_for_model(model as TiktokenModel);
    try {
        return text.map(t => enc.encode(t).length).reduce((a, b) => a + b, 0);
    } finally {
        enc.free();
    }
}
