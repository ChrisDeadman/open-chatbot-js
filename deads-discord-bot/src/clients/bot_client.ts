import { BotApiHandler } from '../bot_api/bot_api_handler.js';
import { BotModel } from '../models/bot_model.js';
import { ConversationData } from '../models/converstation_data.js';
import { settings } from '../settings.js';

export interface BotClient {
    startup: () => Promise<void>;
    shutdown: () => Promise<void>;
}

export async function handleBot(
    botModel: BotModel,
    botApiHandler: BotApiHandler,
    conversation: ConversationData,
    handleResponse: (response: string) => Promise<void>,
    startTyping: () => void,
    stopTyping: () => void
) {
    let response = '';

    startTyping();
    try {
        // Ask bot
        response = await botModel.ask(settings.initial_prompt, conversation);
        if (response.length <= 0) {
            return;
        }
        // Display message to the client
        await handleResponse(response);
    } finally {
        stopTyping();
    }

    // Compress history
    if (conversation.isFull()) {
        const conv_compress = new ConversationData(
            settings.default_language,
            conversation.history_size
        );
        const messages = conversation.getMessages();

        // Build chat history
        for (let i = 0; i < messages.length; i += 1) {
            if (i == 0) {
                // Initialize summary
                let summary = 'Summary: NONE';
                if (messages[i].role == 'system') {
                    summary = messages[i].content;
                }
                conv_compress.addMessage({ role: 'system', content: summary });
            } else if (messages[i].role == 'user') {
                // Add user messages
                conv_compress.addMessage(messages[i]);
            } else if (messages[i].role == 'assistant') {
                // Add bot messages as user messages
                conv_compress.addMessage({
                    role: 'user',
                    content: `${botModel.name}: ${messages[i].content}`,
                });
            }
        }

        // Ask the bot to compress the history
        const resp_compress = await botModel.ask(settings.compress_history_prompt, conv_compress);
        conversation.clear();
        conversation.addMessage({ role: 'system', content: resp_compress });
    }

    // Add the bot response
    conversation.addMessage({ role: 'assistant', content: response });

    // Let the bot use the API if it wants
    botApiHandler.handleAPIRequest(response).then(async req_response => {
        if (req_response.length > 0) {
            // Add API response to system messages
            conversation.addMessage({ role: 'system', content: req_response });

            startTyping();
            try {
                // Reply to bot again with API answer
                response = await botModel.ask(settings.initial_prompt, conversation);
                if (response.length <= 0) {
                    return;
                }
                // Display message to the client
                await handleResponse(response);
            } finally {
                stopTyping();
            }
        }
    });
}
