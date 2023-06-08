import axios from 'axios';
import { commandToString } from '../../utils/parsing_utils.js';
import { CommandContext } from '../command_api.js';

export const pythonDoc = {
    summary:
        'Executes non-blocking python code. Do not execute blocking functions like reading from stdin or endless loops.',
    syntax: [
        '```python',
        'import os # Remember to include necessary imports',
        "print('Hello, World!') # Your Python code here",
        '```',
    ].join('\n'),
};

export async function python(
    commandArgs: Record<string, string>,
    _commandContext: CommandContext,
    settings: any
): Promise<string> {
    let response = '';
    const commandContent = commandToString(commandArgs, true).trim();

    if (commandContent.length > 0) {
        const url = `http://${settings.python_executor_host}:${settings.python_executor_port}/execute`;
        const config = {
            headers: {
                'Content-Type': 'text/plain',
            },
            timeout: settings.browser_timeout,
        };
        const completion = await axios.post(url, commandContent, config);
        response = String(completion.data);
    }
    return response;
}
