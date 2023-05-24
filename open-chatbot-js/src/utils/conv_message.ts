import { PromptTemplate } from 'langchain/prompts';
import { settings } from '../settings.js';
import { dateTimeToStr } from './conversion_utils.js';

export class ConvMessage {
    role: string;
    sender: string;
    content: string;

    constructor(role: string, sender: string, content: string) {
        this.role = role;
        this.sender = sender;
        this.content = content;
    }
}

export async function buildPrompt(messages: ConvMessage[]): Promise<string> {
    const prompt: string[] = [];

    const prefixTemplate = new PromptTemplate({
        inputVariables: ['content'],
        template: '{content}',
    });
    const systemTemplate = new PromptTemplate({
        inputVariables: ['role', 'sender', 'content'],
        template: settings.prompt_templates.system_message,
    });
    const userTemplate = new PromptTemplate({
        inputVariables: ['role', 'sender', 'content'],
        template: settings.prompt_templates.user_message,
    });
    const assistantTemplate = new PromptTemplate({
        inputVariables: ['role', 'sender', 'content'],
        template: settings.prompt_templates.assistant_message,
    });
    const suffixTemplate = new PromptTemplate({
        inputVariables: [...Object.keys(settings), 'now'],
        template: settings.prompt_templates.suffix,
    });

    // Initial prompt is already provided
    prompt.push(await prefixTemplate.format(messages[0]));

    // Messages
    for (const m of messages.slice(1)) {
        switch (m.role) {
            case 'user':
                prompt.push(await userTemplate.format(m));
                break;
            case 'assistant':
                prompt.push(await assistantTemplate.format(m));
                break;
            default:
                prompt.push(await systemTemplate.format(m));
                break;
        }
    }

    // Suffix
    const suffix = await suffixTemplate.format({
        ...settings,
        now: dateTimeToStr(new Date(), settings.locale),
    });
    if (suffix.length > 0) {
        prompt.push(suffix);
    }

    return prompt.join('\n');
}
