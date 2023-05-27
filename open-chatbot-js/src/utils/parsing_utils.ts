import { Command } from '../bot_api/command_api.js';
import { fixAndParseJson } from './json_utils.js';

export function extractURLs(text: string): string[] {
    const urlRegex = /\b(https?:\/\/\S+)(?<![.,)])/gi;
    let match: RegExpExecArray | null;
    const urls: string[] = [];

    while ((match = urlRegex.exec(text)) !== null) {
        urls.push(match[0]);
    }

    return urls;
}

export function parseJsonCommands(response: string): Record<string, string>[] {
    const commands: Record<string, string>[] = [];

    try {
        // Fix and parse json
        let responseData = fixAndParseJson(response);

        // Not a command response
        if (typeof responseData === 'string') {
            return commands;
        }

        // Combine multiple responses
        if (!Array.isArray(responseData)) {
            responseData = [responseData];
        }
        responseData.forEach((r: Record<string, string>) => {
            if ('command' in r) {
                commands.push(r);
            }
        });
    } catch (error) {
        // ignore
    }

    return commands;
}

export function parseCommandBlock(response: string): Record<string, string> | null {
    const cmdMatchRegex = new RegExp(`^\\s*(${Object.values(Command).join('|')})\\s*([\\s\\S]*)`);
    const cmdMatch = response.trimStart().match(cmdMatchRegex);
    if (!cmdMatch || cmdMatch[1] === undefined) {
        return null;
    }

    const result: Record<string, string> = { command: cmdMatch[1] };
    if (cmdMatch[2] === undefined) {
        cmdMatch[2] = '';
    }

    const argMatches = cmdMatch[2].matchAll(
        /(?:^|\n)(\w+\s*:){0,1}\s*([\s\S]*?)(?=\n\s*\w+\s*:|$)/g
    );

    for (const argMatch of argMatches) {
        if (argMatch[1] === undefined || argMatch[1].startsWith('http')) {
            result['data'] = cmdMatch[2].slice(argMatch.index != null ? argMatch.index : 0);
            break;
        } else {
            result[argMatch[1].slice(0, argMatch[1].length - 1)] = argMatch[2];
        }
    }

    return result;
}

export function commandToString(cmd: Record<string, string>, contentOnly = false): string {
    const content = [];
    const entries = Object.entries(cmd).filter(e => e[0] != 'command');
    for (const [key, value] of entries) {
        if (value.trim().length <= 0) {
            continue;
        }
        if (entries.length > 1) {
            content.push(`${key}: ${value}`);
        } else {
            content.push(value);
        }
    }

    if (!contentOnly) {
        if ('command' in cmd) {
            content.unshift(`\`\`\`${cmd.command}`);
        } else {
            content.unshift('```');
        }
        content.push('```\n');
    }
    return content.join('\n');
}
