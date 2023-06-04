import { EventEmitter } from 'events';
import { ConvMessage } from './conv_message.js';
import { Conversation, ConversationEvents } from './conversation.js';

type Handler = (conversation: Conversation) => Promise<void>;
type Handlers = { updated: Handler; fromPrev: Handler; toNext: Handler };

export enum ConversationChainEvents {
    Updated = 'updated',
    Chatting = 'chatting',
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

        console.debug(
            `ConversationChain: addConversation [${conversation.botController.settings.bot_name}]`
        );

        const handlers: Handlers = {
            updated: this.createUpdatedHandler(conversation),
            fromPrev: () => Promise.resolve(),
            toNext: () => Promise.resolve(),
        };

        if (sourceConversation && targetConversation) {
            const sourceHandlers = this.handlers.get(sourceConversation);
            if (sourceHandlers) {
                sourceConversation.off(ConversationEvents.UpdatedDelayed, sourceHandlers.toNext);
            }

            handlers.fromPrev = this.createForwardHandler(sourceConversation, conversation);
            handlers.toNext = this.createForwardHandler(conversation, targetConversation);
        }

        this.subscribeHandlers(sourceConversation, conversation, handlers);
        this.handlers.set(conversation, handlers);
    }

    removeConversation(conversation: Conversation): void {
        const handlers = this.handlers.get(conversation);
        if (handlers) {
            const conversations = this.conversations;
            const conversationIdx = conversations.indexOf(conversation);

            console.debug(
                `ConversationChain: removeConversation [${conversation.botController.settings.bot_name}]`
            );

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const source = conversations.at(conversationIdx - 1)!;
            let target = conversations.at(conversationIdx + 1);
            if (!target) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                target = conversations.at(0)!;
            }

            this.unsubscribeHandlers(source, conversation, handlers);

            if (source != target) {
                this.relinkHandlers(source, target);
            }

            this.handlers.delete(conversation);
        }
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
        const botname = conversation.botController.settings.bot_name;
        console.debug(`ConversationChain: [${botname}]: chat`);
        await this.chatting.then(() => (this.chatting = undefined));
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
            const srcName = source.botController.settings.bot_name;
            const dstName = destination.botController.settings.bot_name;

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

    private subscribeHandlers(
        source: Conversation | undefined,
        target: Conversation | undefined,
        handlers: Handlers
    ): void {
        console.debug(
            `ConversationChain: subscribeHandlers [${source?.botController.settings.bot_name}] => [${target?.botController.settings.bot_name}]`
        );
        source?.on(ConversationEvents.UpdatedDelayed, handlers.fromPrev);
        target?.on(ConversationEvents.UpdatedDelayed, handlers.toNext);
        target?.on(ConversationEvents.Updated, handlers.updated);
    }

    private unsubscribeHandlers(
        source: Conversation,
        target: Conversation,
        handlers: Handlers
    ): void {
        console.debug(
            `ConversationChain: unsubscribeHandlers [${source.botController.settings.bot_name}] => [${target.botController.settings.bot_name}]`
        );

        source.off(ConversationEvents.UpdatedDelayed, handlers.fromPrev);
        target.off(ConversationEvents.UpdatedDelayed, handlers.toNext);
        target.off(ConversationEvents.Updated, handlers.updated);
    }

    private relinkHandlers(source: Conversation, target: Conversation): void {
        console.debug(
            `ConversationChain: relinkHandlers [${source.botController.settings.bot_name}] => [${target.botController.settings.bot_name}]`
        );

        // create and link new handler
        const handler = this.createForwardHandler(source, target);
        source.on(ConversationEvents.UpdatedDelayed, handler);

        // update handler mapping
        this.handlers.set(source, {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...this.handlers.get(source)!,
            toNext: handler,
        });

        // update handler mapping
        this.handlers.set(target, {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...this.handlers.get(target)!,
            fromPrev: handler,
        });
    }
}
