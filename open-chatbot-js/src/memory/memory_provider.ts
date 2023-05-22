import { ConvMessage } from "../utils/conv_message.js";

export abstract class MemoryProvider {
    abstract add(context: ConvMessage[], data: string): Promise<void>;
    abstract del(context: ConvMessage[], data: string): Promise<void>;
    abstract get(context: ConvMessage[], numRelevant: number): Promise<string[]>;
    abstract getStats(): Promise<string>;
    abstract clear(): Promise<void>;
}
