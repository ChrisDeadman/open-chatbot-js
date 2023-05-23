import { CyclicBuffer } from '../../src/utils/cyclic_buffer.js';

describe('CyclicBuffer', () => {
    let cyclicBuffer: CyclicBuffer<number>;

    beforeEach(() => {
        cyclicBuffer = new CyclicBuffer<number>(3);
    });

    test('Empty buffer should be iterable and return no values', () => {
        const values = [];
        for (const value of cyclicBuffer) {
            values.push(value);
        }
        expect(values).toEqual([]);
    });

    test('Buffer should be iterable', () => {
        cyclicBuffer.push(1);
        cyclicBuffer.push(2);
        const values = [];
        for (const value of cyclicBuffer) {
            values.push(value);
        }
        expect(values).toEqual([1, 2]);
    });

    test('length should return 0 for an empty buffer', () => {
        expect(cyclicBuffer.length).toBe(0);
    });

    test('length should return the correct count for a non-empty buffer', () => {
        cyclicBuffer.push(1);
        expect(cyclicBuffer.length).toBe(1);
    });

    test('length should return the correct count for a full buffer', () => {
        cyclicBuffer.push(1);
        cyclicBuffer.push(2);
        cyclicBuffer.push(3);
        expect(cyclicBuffer.length).toBe(3);
    });

    test('Pushing a single item should be iterable', () => {
        cyclicBuffer.push(1);
        const values = [];
        for (const value of cyclicBuffer) {
            values.push(value);
        }
        expect(values).toEqual([1]);
        expect(cyclicBuffer.length).toBe(1);
    });

    test('Pushing a single item beyond capacity should still be iterable', () => {
        cyclicBuffer.push(1);
        cyclicBuffer.push(2);
        cyclicBuffer.push(3);
        cyclicBuffer.push(4);
        const values = [];
        for (const value of cyclicBuffer) {
            values.push(value);
        }
        expect(values).toEqual([2, 3, 4]);
        expect(cyclicBuffer.length).toBe(3);
    });

    test('Pushing multiple items beyond capacity should still be iterable', () => {
        cyclicBuffer.push(1);
        cyclicBuffer.push(2);
        cyclicBuffer.push(3);
        cyclicBuffer.push(4);
        cyclicBuffer.push(5);
        cyclicBuffer.push(6);
        cyclicBuffer.push(7);
        const values = [];
        for (const value of cyclicBuffer) {
            values.push(value);
        }
        expect(values).toEqual([5, 6, 7]);
    });

    test('clear() should empty the buffer', () => {
        cyclicBuffer.push(1);
        cyclicBuffer.push(2);
        cyclicBuffer.clear();
        expect(cyclicBuffer.length).toBe(0);
    });
});
