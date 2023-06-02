export class ConvMessage {
    sequence: number;
    role: string;
    sender: string;
    content: string;

    constructor(role: string, sender: string, content: string, sequence?: number) {
        this.sequence = sequence != null ? sequence : Date.now();
        this.role = role;
        this.sender = sender;
        this.content = content;
    }

    equals(other: ConvMessage): boolean {
        return (
            this.role === other.role &&
            this.sender === other.sender &&
            this.content === other.content
        );
    }
}
