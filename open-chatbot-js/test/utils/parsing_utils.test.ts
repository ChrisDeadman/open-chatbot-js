import { commandToString, parseCommandBlock } from '../../src/utils/parsing_utils.js';

describe('TestParsingUtils', () => {
    test('can parse command with no args', () => {
        const command = 'nop';
        expect(parseCommandBlock(command)).toEqual({ command: 'nop', data: '' });
    });

    test('can parse garbage commands', () => {
        const command = [
            'nop',
            'browse_website "https://www.nasa.gov/image/epic/latest/full/Earth-from-Space-20210414-0123-GMT-20210414_1280.jpg"',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'nop',
            data: 'browse_website "https://www.nasa.gov/image/epic/latest/full/Earth-from-Space-20210414-0123-GMT-20210414_1280.jpg"',
        });
    });

    test('can parse command with unnamed arg', () => {
        const command = ['store_memory', 'Some data', 'I wanted to store.'].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'store_memory',
            data: 'Some data\nI wanted to store.',
        });
    });

    test('can ignore named arg following unnamed arg, ', () => {
        const command = [
            'store_memory',
            'This is some data',
            'arg2: This is',
            ' still the data',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'store_memory',
            data: 'This is some data\narg2: This is\n still the data',
        });
    });

    test('can parse command with multiple args', () => {
        const command = [
            'browse_website',
            'url: https://www.google.com/search?q=weather&oq=weather&aqs=chrome.0.69i59l2j69i60l3.955j0j4&sourceid=chrome&ie=UTF-8',
            'question: how are the current weather conditions?',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'browse_website',
            url: 'https://www.google.com/search?q=weather&oq=weather&aqs=chrome.0.69i59l2j69i60l3.955j0j4&sourceid=chrome&ie=UTF-8',
            question: 'how are the current weather conditions?',
        });
    });

    test('can parse command with multiple multi-line args', () => {
        const command = [
            'delete_memory',
            'arg1: This is a multinie',
            'arg.',
            'arg2: This is another',
            ' multiline arg',
        ].join('\n');
        expect(parseCommandBlock(command)).toEqual({
            command: 'delete_memory',
            arg1: 'This is a multinie\narg.',
            arg2: 'This is another\n multiline arg',
        });
    });

    test('can convert unnamed command to string', () => {
        const command = { data: 'just some text' };
        expect(commandToString(command)).toEqual('```\njust some text\n```\n');
    });

    test('can convert python command to string', () => {
        const command = {
            command: 'python',
            data: ['import os', 'os.print("Hello, World!)'].join('\n'),
        };
        expect(commandToString(command)).toEqual(
            '```python\nimport os\nos.print("Hello, World!)\n```\n'
        );
    });

    test('can convert named args to string', () => {
        const command = {
            command: 'delete_memory',
            arg1: 'This is a multinie\narg.',
            arg2: 'This is another\n multiline arg',
        };
        expect(commandToString(command)).toEqual(
            '```delete_memory\narg1: This is a multinie\narg.\narg2: This is another\n multiline arg\n```\n'
        );
    });
});
