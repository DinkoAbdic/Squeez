import { useRef, useEffect, useState } from 'react';
import { FixedSizeList as List } from 'react-window';
import { ImageItem } from '../types';
import { formatFileSize, formatDimensions, compressionPercentage } from '../utils';
import { Icons } from './Icons';

interface ImageListProps {
    images: ImageItem[];
    selectedId: string | null;
    onSelect: (id: string) => void;
    onRemove: (id: string) => void;
}

const ITEM_HEIGHT = 56;

export function ImageList({ images, selectedId, onSelect, onRemove }: ImageListProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [listHeight, setListHeight] = useState(600);

    // Track container height for the virtualized list
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const updateHeight = () => {
            const style = getComputedStyle(container);
            const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            setListHeight(container.clientHeight - paddingY);
        };
        updateHeight();

        const observer = new ResizeObserver(updateHeight);
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div className="panel-left">
            <div className="panel-header">
                Images
                {images.length > 0 && <span className="count">{images.length}</span>}
            </div>
            <div className="image-list" ref={containerRef}>
                {images.length > 0 && (
                    <List
                        height={listHeight}
                        itemCount={images.length}
                        itemSize={ITEM_HEIGHT}
                        width="100%"
                        overscanCount={5}
                    >
                        {({ index, style }) => {
                            const img = images[index];
                            return (
                                <div
                                    style={style}
                                    className={`image-item ${selectedId === img.id ? 'selected' : ''}`}
                                    onClick={() => onSelect(img.id)}
                                >
                                    {img.thumbnailUrl ? (
                                        <img src={img.thumbnailUrl} alt="" className="image-thumb" />
                                    ) : (
                                        <div className="image-thumb" />
                                    )}
                                    <div className="image-info">
                                        <div className="image-name" title={img.filename}>{img.filename}</div>
                                        <div className="image-meta">
                                            {formatDimensions(img.width, img.height)} · {formatFileSize(img.original_size)}
                                            {img.output_size !== null && (
                                                <> → {formatFileSize(img.output_size)} ({compressionPercentage(img.original_size, img.output_size)} saved)</>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        className="image-remove"
                                        onClick={(e) => { e.stopPropagation(); onRemove(img.id); }}
                                        title="Remove image"
                                    >
                                        <Icons.Clear />
                                    </button>
                                </div>
                            );
                        }}
                    </List>
                )}
            </div>
        </div>
    );
}
