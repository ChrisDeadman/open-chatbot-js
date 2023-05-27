export class CyclicBuffer<T> implements Iterable<T> {
    private items: T[];
    private capacity: number;
    private firstItemIndex = -1;
    private curItemIndex = -1;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.items = new Array<T>(capacity);
    }

    get length(): number {
        return this.firstItemIndex < 0
            ? 0
            : this.firstItemIndex > this.curItemIndex
            ? this.capacity
            : this.curItemIndex - this.firstItemIndex + 1;
    }

    [Symbol.iterator](): Iterator<T> {
        return this.generator();
    }

    clear(): void {
        this.firstItemIndex = -1;
        this.curItemIndex = -1;
    }

    push(...items: T[]): void {
        for (const item of items) {
            this.curItemIndex = (this.curItemIndex + 1) % this.capacity;
            this.items[this.curItemIndex] = item;
            if (this.firstItemIndex < 0) {
                this.firstItemIndex = 0;
            } else if (this.curItemIndex <= this.firstItemIndex) {
                this.firstItemIndex = (this.firstItemIndex + 1) % this.capacity;
            }
        }
    }

    private *generator(): Iterator<T> {
        if (this.firstItemIndex < 0) {
            return;
        }

        let currentIndex = this.firstItemIndex;
        while (true) {
            yield this.items[currentIndex];
            if (currentIndex === this.curItemIndex) {
                break;
            }
            currentIndex = (currentIndex + 1) % this.capacity;
        }
    }
}
