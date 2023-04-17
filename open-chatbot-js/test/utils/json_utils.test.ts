import { fixAndParseJson } from '../../src/utils/json_utils';

describe('TestJsonUtils', () => {
    test('test_valid_json', () => {
        const jsonStr = '{"name": "Hons", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
    });

    test('test_valid_quotes_in_text', () => {
        const jsonStr = '{"name": "Ho\'ns", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: "Ho'ns", age: 40, gender: 'AI' });
    });

    test('test_invalid_json_just_text', () => {
        const jsonStr = 'This is just text.';
        expect(fixAndParseJson(jsonStr)).toEqual(jsonStr);
    });

    test('test_invalid_json_text_with_colons', () => {
        const jsonStr = 'Some Name: Some Text.';
        expect(fixAndParseJson(jsonStr)).toEqual(jsonStr);
    });

    test('test_text_around_valid_json', () => {
        const jsonStr = 'This is {"name": "Hons", "age": 40, "gender": "AI"}, lorem ipsum';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
    });

    test('test_invalid_escape_sequence', () => {
        const jsonStr = '{"name": "\\Hons", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: '\\Hons', age: 40, gender: 'AI' });
    });

    test('test_invalid_missing_quotes', () => {
        const jsonStr = '{name: "Hons", "age": 40, gender: "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
    });

    test('test_invalid_single_quotes', () => {
        const jsonStr = "{'name': 'Hons', 'command': {'name': 'nop', 'args': {}}}";
        expect(fixAndParseJson(jsonStr)).toEqual({
            name: 'Hons',
            command: { name: 'nop', args: {} },
        });
    });

    test('test_invalid_missing_end_brace', () => {
        const jsonStr = '{"name": "Hons", "info": {"age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', info: { age: 40, gender: 'AI' } });
    });

    test('test_invalid_extra_commas', () => {
        const jsonStr = '{"name": "Hons", "info": {"age": 40, "gender": "AI",}, }';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', info: { age: 40, gender: 'AI' } });
    });

    test('test_invalid_quotes_in_text', () => {
        const jsonStr = '{"name": "Ho"n"s", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Ho"n"s', age: 40, gender: 'AI' });
    });

    test('test_invalid_multiple_json_objects', () => {
        const jsonStr = [
            'some text before{"name": "Hons", "info": {"age": 40, "gender": "AI"}}\n',
            'Some text in between\n',
            '{"name": "Eve", "info": {"age": 35, "gender": "AI"}}some text after',
        ].join('\n');
        expect(fixAndParseJson(jsonStr)).toEqual([
            { name: 'Hons', info: { age: 40, gender: 'AI' } },
            { name: 'Eve', info: { age: 35, gender: 'AI' } },
        ]);
    });
});
