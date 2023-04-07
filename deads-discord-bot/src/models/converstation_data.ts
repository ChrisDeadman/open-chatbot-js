export class ConversationData {
    history = new Array<any>();
    pinnedHistory = new Array<any>();
    language: string;
    history_size: number;
    lastMessageIndex = 0;
    nextMessageIndex = 0;

    constructor(language: string, history_size: number) {
        this.language = language;
        this.history_size = history_size;
    }

    clear() {
        this.pinnedHistory.length = 0;
        this.history.length = 0;
        this.nextMessageIndex = 0;
        this.lastMessageIndex = 0;
    }

    isEmpty() {
        return this.history.length <= 0 && this.pinnedHistory.length <= 0;
    }

    getMessages() {
        const convHistory =
            this.nextMessageIndex === this.lastMessageIndex
                ? this.history
                : this.history
                      .slice(this.nextMessageIndex)
                      .concat(this.history.slice(0, this.nextMessageIndex));

        return this.pinnedHistory.concat(convHistory);
    }

    addMessage(message: any, pinned = false) {
        if (pinned) {
            this.pinnedHistory.push(message);
        } else {
            this.history[this.nextMessageIndex] = message;
            this.nextMessageIndex = (this.nextMessageIndex + 1) % this.history_size;
            if (this.nextMessageIndex == this.lastMessageIndex) {
                this.lastMessageIndex = (this.lastMessageIndex + 1) % this.history_size;
            }
        }
    }
}
