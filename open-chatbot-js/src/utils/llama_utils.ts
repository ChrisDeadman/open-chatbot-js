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
        .replace(/^\s*[`]+\s*$/, '')
        .replaceAll('\\\\_', '_')
        .replaceAll('\\_', '_')
        .replaceAll('\\*', '*')
        .replaceAll('​', ' ')
        .replaceAll(/(?<=\p{Extended_Pictographic})\p{Extended_Pictographic}{3,}/gu, '') // Prevent emoji flood
        .replaceAll(new RegExp(`(.)\\1{${5},}`, 'g'), (_match, char) => char.repeat(5)) // Don't repeat any character more than 5 times
        .replace(removeAfterStop, '')
        .replace(removeTrailingStop, '')
        .trim();
    return filtered;
}
