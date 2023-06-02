import { EventEmitter } from 'events';
import { ConvMessage } from './conv_message.js';
import { Conversation, ConversationEvents } from './conversation.js';

type Handler = (conversation: Conversation) => Promise<void>;
type Handlers = { fromPrev: Handler; toNext: Handler };

export enum ConversationChainEvents {
    Chatting = 'chatting',
}

export class ConversationChain extends EventEmitter {
    rootConversation: Conversation;
    handlers: Map<Conversation, Handlers> = new Map();
    chatting: Promise<Conversation> | undefined;

    constructor(rootConversation: Conversation) {
        super();
        this.rootConversation = rootConversation;
    }

    addConversation(targetConversation: Conversation): void {
        const sourceConversation = Array.from(this.handlers.keys()).at(-1) || this.rootConversation;

        const sourceHandlers = this.handlers.get(sourceConversation);
        if (sourceHandlers) {
            sourceConversation?.off(ConversationEvents.UpdatedDelayed, sourceHandlers.toNext);
        }

        const fromPrev = this.createHandler(sourceConversation, targetConversation);
        const toNext = this.createHandler(targetConversation, this.rootConversation);
        const handlers = { fromPrev, toNext };

        console.debug(
            `ConversationChain: addConversation [${sourceConversation.botController.settings.bot_name}] => [${targetConversation.botController.settings.bot_name}]`
        );

        this.subscribeHandlers(sourceConversation, targetConversation, handlers);

        this.handlers.set(targetConversation, {
            fromPrev: fromPrev,
            toNext: toNext,
        });
    }

    removeConversation(targetConversation: Conversation): void {
        if (this.handlers.has(targetConversation)) {
            const sourceConversation = this.getPreviousConversation(targetConversation);
            const nextConversation = this.getNextConversation(targetConversation);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const targetHandlers = this.handlers.get(targetConversation)!;

            this.unsubscribeHandlers(sourceConversation, targetConversation, targetHandlers);
            this.relinkHandlers(sourceConversation, nextConversation);

            this.handlers.delete(targetConversation);
        }
    }

    clear() {
        this.rootConversation.clear();
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
        const conversation = (await this.chatting) || this.rootConversation;
        conversation.push(message);
        return conversation;
    }

    private getPreviousConversation(targetConversation: Conversation): Conversation | undefined {
        const conversations = Array.from(this.handlers.keys());
        const targetIndex = conversations.indexOf(targetConversation);
        return targetIndex > 0 ? conversations[targetIndex - 1] : undefined;
    }

    private getNextConversation(targetConversation: Conversation): Conversation | undefined {
        const conversations = Array.from(this.handlers.keys());
        const targetIndex = conversations.indexOf(targetConversation);
        return targetIndex >= 0 && targetIndex < conversations.length - 1
            ? conversations[targetIndex + 1]
            : undefined;
    }

    private createHandler(source: Conversation, destination: Conversation): Handler {
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

            // only trigger the chat if the sender is the previous source
            const shouldChat =
                newMessages.filter(m => m.role === 'user' /*&& m.sender === srcName*/).length > 0;
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
        sourceConversation: Conversation,
        targetConversation: Conversation,
        handlers: Handlers
    ): void {
        console.debug(
            `ConversationChain: subscribeHandlers [${sourceConversation.botController.settings.bot_name}] => [${targetConversation.botController.settings.bot_name}]`
        );
        sourceConversation.on(ConversationEvents.UpdatedDelayed, handlers.fromPrev);
        targetConversation.on(ConversationEvents.UpdatedDelayed, handlers.toNext);
    }

    private unsubscribeHandlers(
        sourceConversation: Conversation | undefined,
        targetConversation: Conversation,
        handlers: Handlers
    ): void {
        // if conversation is undefined, it represents the initialConversation
        const actualSourceConversation = sourceConversation || this.rootConversation;

        console.debug(
            `ConversationChain: unsubscribeHandlers [${actualSourceConversation.botController.settings.bot_name}] => [${targetConversation.botController.settings.bot_name}]`
        );

        actualSourceConversation.off(ConversationEvents.UpdatedDelayed, handlers.fromPrev);
        targetConversation.off(ConversationEvents.UpdatedDelayed, handlers.toNext);
    }

    private relinkHandlers(
        sourceConversation: Conversation | undefined,
        targetConversation: Conversation | undefined
    ): void {
        if (!sourceConversation && !targetConversation) {
            return;
        }

        // if conversation is undefined, it represents the initialConversation
        const actualSourceConversation = sourceConversation || this.rootConversation;
        const actualTargetConversation = targetConversation || this.rootConversation;

        console.debug(
            `ConversationChain: relinkHandlers [${actualSourceConversation.botController.settings.bot_name}] => [${actualTargetConversation.botController.settings.bot_name}]`
        );

        // create and link new handler
        const handler = this.createHandler(actualSourceConversation, actualTargetConversation);
        actualSourceConversation.on(ConversationEvents.UpdatedDelayed, handler);

        // update handler mapping
        if (sourceConversation) {
            this.handlers.set(sourceConversation, {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                ...this.handlers.get(sourceConversation)!,
                toNext: handler,
            });
        }

        // update handler mapping
        if (targetConversation) {
            this.handlers.set(targetConversation, {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                ...this.handlers.get(targetConversation)!,
                fromPrev: handler,
            });
        }
    }
}
