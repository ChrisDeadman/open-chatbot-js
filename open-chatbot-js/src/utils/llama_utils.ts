import { ConvMessage } from './conv_message.js';

export function buildStoppingStrings(messages: ConvMessage[]): string[] {
    const senders = Array.from(
        new Set(
            messages.filter(message => message.role != 'assistant').map(message => message.sender)
        )
    );
    return [
        '<START>',
        '</s>',
        '<END>',
        '</END>',
        '<USER>',
        '\nU:',
        '\nUser:',
        '\nSystem:',
        '\n### Instruction:',
    ].concat(senders.map(s => `\n${s}:`));
}

export function filterResponse(response: string, stoppingStrings: string[]): string {
    const removeAfterStop = new RegExp(
        `(?<=[\\s\\.,!?])(###)*\\s*(${stoppingStrings
            .map(s => s.replaceAll('\n', ''))
            .map(s => s.replaceAll('|', '[|]'))
            .join('|')})[\\s\\S]*`,
        'gi'
    );
    const removeTrailingStop = new RegExp(
        `(###)*\\s*(<|>|${stoppingStrings
            .map(s => s.replaceAll('\n', ''))
            .map(s => s.substring(0, s.length - 1))
            .join('|')})+[:]*\\s*$`,
        'gi'
    );
    return response
        .replaceAll('\\\\_', '_')
        .replaceAll('\\_', '_')
        .replaceAll('�', '')
        .replace(removeAfterStop, '')
        .replace(removeTrailingStop, '')
        .trim();
}
