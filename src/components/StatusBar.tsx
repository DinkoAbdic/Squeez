import { ImageItem, ProcessingSettings } from '../types';
import { formatFileSize, compressionPercentage } from '../utils';

interface StatusBarProps {
    images: ImageItem[];
    selectedId: string | null;
    settings: ProcessingSettings;
    isEstimatingSize: boolean;
    estimatedSizeValue: number | null;
}

export function StatusBar({
    images,
    selectedId,
    settings,
    isEstimatingSize,
    estimatedSizeValue,
}: StatusBarProps) {
    const totalOriginalSize = images.reduce((acc, img) => acc + img.original_size, 0);
    const doneImages = images.filter(i => i.status === 'Done');
    const totalOutputSize = doneImages.reduce((acc, img) => acc + (img.output_size || 0), 0);

    return (
        <div className="status-bar">
            <div className="stat">
                Images: <span className="stat-value">{images.length}</span>
            </div>
            <div className="stat">
                Total Size: <span className="stat-value">{formatFileSize(totalOriginalSize)}</span>
            </div>
            {doneImages.length > 0 && (
                <>
                    <div className="stat">
                        Optimized: <span className="stat-value">{formatFileSize(totalOutputSize)}</span>
                    </div>
                    <div className="stat">
                        Saved: <span className="stat-value" style={{ color: 'var(--accent-success)' }}>
                            {compressionPercentage(totalOriginalSize, totalOutputSize)}
                        </span>
                    </div>
                </>
            )}
            <div style={{ flex: 1 }} />
            <div className="stat" style={{ color: 'var(--text-tertiary)' }}>
                Format: <span className="stat-value">{settings.output_format}</span>
                {settings.output_format === 'Png'
                    ? <>{' · '}Compression: <span className="stat-value">{settings.png_compression}/9</span></>
                    : <>{' · '}Quality: <span className="stat-value">{settings.quality}%</span></>
                }
                {settings.crop_preset && (<> · Crop: <span className="stat-value">{settings.crop_preset.aspect_ratio}</span></>)}
                {isEstimatingSize ? (
                    <> · Est. Size: <span className="stat-value spinner"></span></>
                ) : estimatedSizeValue !== null && estimatedSizeValue > 0 ? (() => {
                    const activeImg = images.find(i => i.id === selectedId);
                    let estColor = 'var(--accent-primary)';
                    if (activeImg) {
                        const orig = activeImg.original_size;
                        const est = estimatedSizeValue;
                        if (est > orig) estColor = 'var(--accent-error)';
                        else if (est < 1024 * 1024 || est <= orig * 0.7) estColor = 'var(--accent-success)';
                        else if (est <= orig * 0.9) estColor = 'var(--accent-warning)';
                    }
                    return (
                        <> · Est. Size: <span className="stat-value fade-in-image" style={{ color: estColor, fontWeight: 600, transition: 'color 0.3s ease' }}>{formatFileSize(estimatedSizeValue)}</span></>
                    );
                })() : null}
            </div>
        </div>
    );
}
