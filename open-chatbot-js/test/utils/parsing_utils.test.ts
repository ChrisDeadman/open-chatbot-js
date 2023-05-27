import { commandToString, extractURLs, parseCommandBlock } from '../../src/utils/parsing_utils.js';

describe('TestParsingUtils', () => {
    test('can parse pure URL', () => {
        const url = 'http://www.example.com';
        expect(extractURLs(url)).toEqual([url]);
    });

    test('can parse simple URL with no params inside parenthesis', () => {
        const url = 'http://www.example.com';
        const str = `(${url})`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('parses URL with subdomains', () => {
        const url = 'http://subdomain.example.com';
        const str = `Visit ${url} for more information.`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('parses URL from text with special characters', () => {
        const url = 'http://example.com';
        const str = `Visit ${url} for more information, even if it's exciting!`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('parses URL with port number', () => {
        const url = 'http://someserver:3000';
        const str = `Server is running at ${url}`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('ignores URL-like string within word boundaries', () => {
        const url = 'http://example.com';
        const str = `Visit${url} for more information.`;
        expect(extractURLs(str)).toEqual([]);
    });

    test('ignores URL without scheme', () => {
        const url = 'www.example.com';
        const str = `Visit ${url} for more information.`;
        expect(extractURLs(str)).toEqual([]);
    });

    test('can parse URL with username and password', () => {
        const url = 'http://user:pass@example.com';
        const str = `Try ${url} for more details.`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('can parse multiple URLs', () => {
        const url1 = 'http://example.com';
        const url2 = 'https://www.github.com';
        const str = `Visit ${url1} and ${url2} for more information.`;
        expect(extractURLs(str)).toEqual([url1, url2]);
    });

    test('ignores trailing punctuation', () => {
        const url = 'http://example.com';
        const str = `Try ${url}.`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('ignores URL-like string without TLD', () => {
        const url = 'example';
        const str = `Try ${url}.`;
        expect(extractURLs(str)).toEqual([]);
    });

    test('parses secure URL with query and fragment', () => {
        const url = 'https://example.com/path?query=term#fragment';
        const str = `Visit ${url} for more information.`;
        expect(extractURLs(str)).toEqual([url]);
    });

    test('can parse command with no args', () => {
        const command = 'exit';
        expect(parseCommandBlock(command)).toEqual({ command: 'exit', data: '' });
    });

    test('can parse command with unnamed arg', () => {
        const command = ['storeMemory', 'Some data', 'I wanted to store.'].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'storeMemory',
            data: 'Some data\nI wanted to store.',
        });
    });

    test('can ignore named arg following unnamed arg, ', () => {
        const command = [
            'storeMemory',
            'This is some data',
            'arg2: This is',
            ' still the data',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'storeMemory',
            data: 'This is some data\narg2: This is\n still the data',
        });
    });

    test('can parse command with multiple args', () => {
        const command = [
            'browseWebsite',
            'url: https://www.google.com/search?q=weather&oq=weather&aqs=chrome.0.69i59l2j69i60l3.955j0j4&sourceid=chrome&ie=UTF-8',
            'question: how are the current weather conditions?',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'browseWebsite',
            url: 'https://www.google.com/search?q=weather&oq=weather&aqs=chrome.0.69i59l2j69i60l3.955j0j4&sourceid=chrome&ie=UTF-8',
            question: 'how are the current weather conditions?',
        });
    });

    test('can parse command with multiple multi-line args', () => {
        const command = [
            'deleteMemory',
            'arg1: This is a multinie',
            'arg.',
            'arg2: This is another',
            ' multiline arg',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'deleteMemory',
            arg1: 'This is a multinie\narg.',
            arg2: 'This is another\n multiline arg',
        });
    });

    test('can convert unnamed command to string', () => {
        const command = { data: 'just some text' };
        expect(commandToString(command)).toEqual('```\njust some text\n```');
    });

    test('can convert python command to string', () => {
        const command = {
            command: 'python',
            data: ['import os', 'os.print("Hello, World!)'].join('\n'),
        };
        expect(commandToString(command)).toEqual(
            '```python\nimport os\nos.print("Hello, World!)\n```'
        );
    });

    test('can convert named args to string', () => {
        const command = {
            command: 'deleteMemory',
            arg1: 'This is a multinie\narg.',
            arg2: 'This is another\n multiline arg',
        };
        expect(commandToString(command)).toEqual(
            '```deleteMemory\narg1: This is a multinie\narg.\narg2: This is another\n multiline arg\n```'
        );
    });
});
