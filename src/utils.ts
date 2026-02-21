export function formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDimensions(w: number, h: number): string {
    return `${w} × ${h}`;
}

export function compressionPercentage(original: number, optimized: number): string {
    if (original === 0) return '0%';
    const saved = ((original - optimized) / original) * 100;
    return `${saved.toFixed(1)}%`;
}
