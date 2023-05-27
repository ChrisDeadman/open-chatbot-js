export abstract class MemoryProvider {
    abstract add(context: string, data: string): Promise<void>;
    abstract del(context: string, data: string): Promise<void>;
    abstract get(context: string, numRelevant: number): Promise<string[]>;
    abstract getStats(): Promise<string>;
    abstract clear(): Promise<void>;
}
