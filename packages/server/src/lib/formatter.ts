/**
 * Format a byte value into a human-readable size.
 *
 * @param bytes - Number of bytes.
 * @param decimals - Maximum number of decimal places.
 * @returns Human-readable byte size.
 *
 * @example
 * formatBytes(1024)        // "1 KB"
 * formatBytes(1536)        // "1.5 KB"
 * formatBytes(1048576)     // "1 MB"
 */
export function formatBytes(bytes: number, decimals = 2): string {
    if (!Number.isFinite(bytes)) {
        throw new Error("Bytes must be a finite number");
    }

    if (bytes < 0) {
        throw new Error("Bytes must be positive");
    }

    if (bytes === 0) {
        return "0 Bytes";
    }

    const k = 1024;
    const sizes = [
        "Bytes",
        "KB",
        "MB",
        "GB",
        "TB",
        "PB",
        "EB",
        "ZB",
        "YB",
    ];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const index = Math.min(i, sizes.length - 1);

    const value = bytes / Math.pow(k, index);

    return `${Number(value.toFixed(decimals))} ${sizes[index]}`;
}


/**
 * Format milliseconds into a human-readable duration.
 *
 * @param ms - Duration in milliseconds.
 * @returns Human-readable duration.
 *
 * @example
 * formatTime(25)       // "25ms"
 * formatTime(1500)     // "1.5s"
 * formatTime(90000)    // "1.5m"
 * formatTime(7200000)  // "2h"
 */
export function formatTime(ms: number): string {
    if (!Number.isFinite(ms)) {
        throw new Error("Time must be a finite number");
    }
    if (ms < 0) {
        throw new Error("Time must be positive");
    }
    if (ms < 1000) {
        return `${Number(ms.toFixed(2))}ms`;
    }

    const seconds = ms / 1000;
    if (seconds < 60) {
        return `${Number(seconds.toFixed(2))}s`;
    }

    const minutes = seconds / 60;
    if (minutes < 60) {
        return `${Number(minutes.toFixed(2))}m`;
    }

    const hours = minutes / 60;
    if (hours < 24) {
        return `${Number(hours.toFixed(2))}h`;
    }

    const days = hours / 24;
    if (days < 365) {
        return `${Number(days.toFixed(2))}d`;
    }

    const years = days / 365;
    return `${Number(years.toFixed(2))}y`;
}

/**
 * Format a Date object into a timestamp.
 *
 * @param data - The Date object to format.
 * @returns The formatted timestamp.
 *
 * @example
 * timestamp(new Date()) // "2022-01-01T00:00:00.000Z"
 */
export function timestamp(data: Date): string {
    if (!(data instanceof Date)) {
        throw new Error("Data must be a Date object");
    }
    return data.toISOString();
}