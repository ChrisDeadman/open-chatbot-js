export abstract class MemoryProvider {
    abstract add(vector: number[], data: string): Promise<void>;
    abstract get(vector: number[], numRelevant: number): Promise<string[]>;
    abstract getStats(): Promise<string>;
    abstract clear(): Promise<void>;
}
