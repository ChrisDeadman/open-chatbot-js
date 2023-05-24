import { Command } from '../bot_api/command_api.js';
import { fixAndParseJson } from './json_utils.js';

export function parseCommandBlock(response: string): Record<string, string> | null {
    const cmdMatch = response
        .trimStart()
        .match(new RegExp(`^(${Object.values(Command).join('|')})\\s*([\\s\\S]*)`, 'i'));
    if (!cmdMatch) {
        return null;
    }

    const result: Record<string, string> = { command: cmdMatch[1] };
    const argMatches = cmdMatch[2].matchAll(
        /(?:^|\n)(\w+\s*:){0,1}\s*([\s\S]*?)(?=\n\s*\w+\s*:|$)/g
    );

    for (const argMatch of argMatches) {
        if (argMatch[1] === undefined) {
            const data = cmdMatch[2].slice(argMatch.index != null ? argMatch.index : 0);
            if (data.trim().length <= 0) {
                return null;
            }
            result['data'] = data;
            break;
        } else {
            result[argMatch[1].slice(0, argMatch[1].length - 1)] = argMatch[2];
        }
    }

    return result;
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

export function commandToString(cmd: Record<string, string>): string {
    const replacement = [];
    if ('command' in cmd) {
        replacement.push(`\`\`\`${cmd.command}`);
    } else {
        replacement.push('```');
    }
    for (const [key, value] of Object.entries(cmd)) {
        switch (key) {
            case 'command':
                break;
            case 'data':
                replacement.push(value);
                break;
            default:
                replacement.push(`${key}: ${value}`);
                break;
        }
    }
    replacement.push('```\n');
    return replacement.join('\n');
}
