export interface BotClient {
    startup(): Promise<void>;
    shutdown(): Promise<void>;
}
