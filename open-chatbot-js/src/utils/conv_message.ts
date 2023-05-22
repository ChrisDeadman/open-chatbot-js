export class ConvMessage {
    role: string;
    sender: string;
    content: string;

    constructor(role: string, sender: string, content: string) {
        this.role = role;
        this.sender = sender;
        this.content = content;
    }

    toString(): string {
        return this.role === 'system' ? this.content : `${this.sender}: ${this.content}`;
    }
}
