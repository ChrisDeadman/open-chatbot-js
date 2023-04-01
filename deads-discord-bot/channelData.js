import { settings } from "./settings.js";

export class ChannelData {
    constructor(channel) {
        this.channel = channel
        this.systemMessages = [];
        this.conversationHistory = [];
        this.nextMessageIndex = 0;
        this.lastMessageIndex = 0;
        this.processTimeout = null;
        this.isProcessing = false;
        this.language = settings.default_language;
    }

    resetConversationHistory() {
        this.systemMessages.length = 0;
        this.conversationHistory.length = 0;
        this.nextMessageIndex = 0;
        this.lastMessageIndex = 0;
    }

    getConversationHistory() {
        const convHistory = (this.nextMessageIndex === this.lastMessageIndex)
            ? this.conversationHistory
            : this.conversationHistory.slice(this.nextMessageIndex).concat(this.conversationHistory.slice(0, this.nextMessageIndex));

        return this.systemMessages.concat(convHistory);
    }

    addSystemMessage(message) {
        this.systemMessages.push(message);
    }

    addUserMessage(message) {
        this.conversationHistory[this.nextMessageIndex] = message;
        this.nextMessageIndex = (this.nextMessageIndex + 1) % settings.message_history_size;
        if (this.nextMessageIndex == this.lastMessageIndex) {
            this.lastMessageIndex = (this.lastMessageIndex + 1) % settings.message_history_size;
        }
    }
}

export function getChannelData(channel) {
    if (channel.deadmansChannelData === undefined) {
        channel.deadmansChannelData = {};
    }
    if (!(channel.id in channel.deadmansChannelData)) {
        channel.deadmansChannelData[channel.id] = new ChannelData(channel);
    }
    return channel.deadmansChannelData[channel.id];
}

export function hasChannelData(channel) {
    if (channel.deadmansChannelData === undefined) {
        return false;
    }
    return channel.id in channel.deadmansChannelData;
}
