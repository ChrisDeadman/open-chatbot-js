export function dateTimeToStr(date: Date): string {
    return date.toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: "numeric",
        hour: 'numeric',
        minute: 'numeric',
        timeZoneName: 'short',
    });
}

export function toFloat32Buffer(arr: Iterable<number>) {
    return Buffer.from(new Float32Array(arr).buffer);
}
