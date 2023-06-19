import fs from 'fs';

export function dateTimeToStr(date: Date, locale: string): string {
    return date.toLocaleString(locale, {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        timeZoneName: 'short',
    });
}

export function toFloat32Buffer(arr: Iterable<number>) {
    return Buffer.from(new Float32Array(arr).buffer);
}

export function fileToBase64(filePath: string, mimeType: string): string {
    const data = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${data.toString('base64')}`;
}
export function exceptionToString(ex: any): string {
    if (ex instanceof AggregateError) {
        return `${ex.errors
            .map(
                (innerError: any, index: number) =>
                    `Error ${index + 1}: ${innerError.name}: ${innerError.message}`
            )
            .join('\n')}`;
    } else {
        return `${ex.name}: ${ex.message}`;
    }
}
