import axios from 'axios';
import { settings } from '../../settings.js';
import { commandToString } from '../../utils/parsing_utils.js';

export const pythonDoc = {
    summary:
        'All python code with below syntax is directly interpreted and executed; reading from stdin or endless loops are prohibited.',
    syntax: ['```python', 'import os', "print('Hello, World!')", '```'].join('\n'),
};

export async function python(commandArgs: Record<string, string>): Promise<string> {
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
