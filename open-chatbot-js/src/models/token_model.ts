import { ConvMessage } from '../utils/conv_message.js';

export abstract class TokenModel {
    abstract maxTokens: number;

    abstract tokenize(messages: ConvMessage[]): Promise<number[]>;

    async truncateMessages(messages: ConvMessage[], tokenLimit?: number): Promise<ConvMessage[]> {
        const limit =
            tokenLimit != null
                ? tokenLimit >= 0
                    ? Math.min(tokenLimit, this.maxTokens)
                    : this.maxTokens + tokenLimit
                : this.maxTokens;
        if (limit <= 0) {
            return [];
        }

        const truncated = [...messages];
        while (truncated.length > 0) {
            // as long as there are enough tokens remaining for the response
            const tokens = await this.tokenize(truncated);
            if (tokens.length < limit) {
                break;
            }
            // if not, remove the oldest message and try again
            truncated.shift();
        }
        return truncated;
    }
}
