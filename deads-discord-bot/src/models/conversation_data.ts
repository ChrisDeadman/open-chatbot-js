export type ConvMessage = { role: string; sender: string; content: string };

export class ConversationData {
    history = new Array<ConvMessage>();
    language: string;
    history_size: number;
    lastMessageIndex = 0;
    nextMessageIndex = 0;

    constructor(language: string, history_size: number) {
        this.language = language;
        this.history_size = history_size;
    }

    clear() {
        this.history.length = 0;
        this.nextMessageIndex = 0;
        this.lastMessageIndex = 0;
    }

    isEmpty(): boolean {
        return this.history.length <= 0;
    }

    isFull(): boolean {
        return this.history.length >= this.history_size;
    }

    getMessages(): ConvMessage[] {
        return this.nextMessageIndex === this.lastMessageIndex
            ? this.history
            : this.history
                  .slice(this.nextMessageIndex)
                  .concat(this.history.slice(0, this.nextMessageIndex));
    }
    addMessage(message: ConvMessage) {
        this.history[this.nextMessageIndex] = message;
        this.nextMessageIndex = (this.nextMessageIndex + 1) % this.history_size;
        if (this.nextMessageIndex == this.lastMessageIndex) {
            this.lastMessageIndex = (this.lastMessageIndex + 1) % this.history_size;
        }
    }
}
