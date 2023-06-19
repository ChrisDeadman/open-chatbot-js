import { EventEmitter } from 'events';
import { ConvMessage } from './conv_message.js';
import { Conversation, ConversationEvents } from './conversation.js';

type Handler = (conversation: Conversation) => Promise<void>;
type Handlers = { updated: Handler; fromPrev: Handler; toNext: Handler };

export enum ConversationChainEvents {
    Updated = 'updated',
    Chatting = 'chatting',
    ChatComplete = 'complete',
}

export class ConversationChain extends EventEmitter {
    handlers: Map<Conversation, Handlers> = new Map();
    chatting: Promise<Conversation> | undefined;

    get conversations(): Conversation[] {
        return Array.from(this.handlers.keys());
    }

    addConversation(conversation: Conversation): void {
        const conversations = this.conversations;
        const sourceConversation = conversations.at(-1);
        const targetConversation = conversations.at(0);

        console.debug(`ConversationChain: add [${conversation.botController.settings.name}]`);

        const handlers: Handlers = {
            updated: this.createUpdatedHandler(conversation),
            fromPrev: () => Promise.resolve(),
            toNext: () => Promise.resolve(),
        };
        this.handlers.set(conversation, handlers);
        conversation.on(ConversationEvents.Updated, handlers.updated);

        if (sourceConversation && targetConversation) {
            this.linkHandlers(sourceConversation, conversation);
            this.linkHandlers(conversation, targetConversation);
        }
    }

    removeConversation(conversation: Conversation): void {
        const handlers = this.handlers.get(conversation);
        if (!handlers) {
            return;
        }
        const conversations = this.conversations;
        const conversationIdx = conversations.indexOf(conversation);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const source = conversations.at(conversationIdx - 1)!;
        let target = conversations.at(conversationIdx + 1);
        if (!target) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            target = conversations.at(0)!;
        }

        console.debug(
            `ConversationChain: unlink [${source.botController.settings.name}] => [${conversation.botController.settings.name}]`
        );

        source.off(ConversationEvents.UpdatedDelayed, handlers.fromPrev);
        conversation.off(ConversationEvents.UpdatedDelayed, handlers.toNext);
        conversation.off(ConversationEvents.Updated, handlers.updated);

        if (source != target) {
            this.linkHandlers(source, target);
        }

        console.debug(`ConversationChain: remove [${conversation.botController.settings.name}]`);

        this.handlers.delete(conversation);
    }

    clear() {
        for (const conversation of this.handlers.keys()) {
            conversation.clear();
        }
    }

    async chat(conversation: Conversation) {
        // Another chat is ongoing -> we will be called again later
        if (this.chatting) {
            return;
        }

        // Chat with the bot
        this.emit(ConversationChainEvents.Chatting, conversation);
        this.chatting = conversation.botController.chat(conversation).then(() => conversation);
        const botname = conversation.botController.settings.name;
        console.debug(`ConversationChain: [${botname}]: chat`);
        await this.chatting.then(c => {
            this.chatting = undefined;
            this.emit(ConversationChainEvents.ChatComplete, c);
        });
    }

    async push(message: ConvMessage): Promise<Conversation> {
        const conversation = (await this.chatting) || this.handlers.keys().next().value;
        conversation.push(message);
        return conversation;
    }

    private createUpdatedHandler(conversation: Conversation): Handler {
        return async () => {
            this.emit(ConversationChainEvents.Updated, conversation);
        };
    }

    private createForwardHandler(source: Conversation, destination: Conversation): Handler {
        return async () => {
            const srcName = source.botController.settings.name;
            const dstName = destination.botController.settings.name;

            const sequence = destination.messages.at(-1)?.sequence;
            const newMessages = source
                .getMessagesAfter(sequence)
                .map(m => this.transformMessage(m));
            if (newMessages.length <= 0) {
                return;
            }

            console.debug(
                `ConversationChain: [${srcName}]: forwarding ${newMessages.length} messages => [${dstName}]`
            );
            destination.push(...newMessages);

            // only trigger the chat on user messages
            const shouldChat = newMessages.filter(m => m.role === 'user').length > 0;
            if (shouldChat) {
                await this.chat(destination).catch(error => {
                    console.error(error);
                });
            }
        };
    }

    private transformMessage(message: ConvMessage): ConvMessage {
        let role: string;
        switch (message.role) {
            case 'user':
            case 'assistant':
                role = 'user';
                break;
            default:
                role = message.role;
                break;
        }
        return new ConvMessage(role, message.sender, message.content, message.sequence);
    }

    private linkHandlers(source: Conversation, target: Conversation): void {
        console.debug(
            `ConversationChain: link [${source.botController.settings.name}] => [${target.botController.settings.name}]`
        );

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const sourceHandlers = this.handlers.get(source)!;
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const targetHandlers = this.handlers.get(target)!;

        // create new handler
        const handler = this.createForwardHandler(source, target);

        // unlink old handler
        source.off(ConversationEvents.UpdatedDelayed, sourceHandlers.toNext);

        // link new handler
        source.on(ConversationEvents.UpdatedDelayed, handler);

        // update handler mapping
        sourceHandlers.toNext = handler;
        targetHandlers.fromPrev = handler;
    }
}
