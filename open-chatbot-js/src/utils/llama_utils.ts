import { ConvMessage } from './conv_message.js';

export function buildStoppingStrings(messages: ConvMessage[]): string[] {
    const senders = Array.from(
        new Set(
            messages.filter(message => message.role != 'assistant').map(message => message.sender)
        )
    );
    return [
        ...new Set(
            ['<START>', '</START>', '<END>', '</END>', '<USER>', '</USER>', '\n### '].concat(
                senders.map(s => `\n${s}:`)
            )
        ),
    ];
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
        `(###)*\\s*(</s>|${stoppingStrings
            .map(s => s.replaceAll('\n', ''))
            .map(s => s.slice(0, s.length - 1))
            .join('|')})+[:]*\\s*$`,
        'gi'
    );
    const filtered = response
        .replaceAll(/\u200B/g, ' ') // zero width space
        .replaceAll(/\u00A0/g, ' ') // non-breaking space
        .replaceAll(/(?<=\p{Extended_Pictographic})\p{Extended_Pictographic}{5,}/gu, '') // prevent emoji flood
        .replace(removeAfterStop, '')
        .replace(removeTrailingStop, '')
        .trim();
    return filtered;
}
