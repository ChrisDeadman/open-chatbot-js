import { fixAndParseJson } from '../../src/utils/json_utils';

describe('TestJsonUtils', () => {
    test('test_valid_json', () => {
        const jsonStr = '{"name": "Hons", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
    });

    test('test_text_around_valid_json', () => {
        const jsonStr = 'This is {"name": "Hons", "age": 40, "gender": "AI"}, lorem ipsum';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
    });

    test('test_invalid_escape_sequence', () => {
        const jsonStr = '{"name": "\\Hons", "age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', age: 40, gender: 'AI' });
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
        const jsonStr = '{"name": "\\Hons", "info": {"age": 40, "gender": "AI"}';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', info: { age: 40, gender: 'AI' } });
    });

    test('test_invalid_extra_commas', () => {
        const jsonStr = '{"name": "\\Hons", "info": {"age": 40, "gender": "AI",}, }';
        expect(fixAndParseJson(jsonStr)).toEqual({ name: 'Hons', info: { age: 40, gender: 'AI' } });
    });
});
