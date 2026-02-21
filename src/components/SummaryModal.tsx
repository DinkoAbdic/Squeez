import { invoke } from '@tauri-apps/api/core';
import { BatchSummary } from '../types';
import { formatFileSize } from '../utils';
import { Icons } from './Icons';

interface SummaryModalProps {
    summary: BatchSummary;
    outputDir: string;
    onClose: () => void;
}

export function SummaryModal({ summary, outputDir, onClose }: SummaryModalProps) {
    return (
        <div className="summary-overlay" onClick={onClose}>
            <div className="summary-card" onClick={e => e.stopPropagation()}>
                <div className="summary-icon">
                    <Icons.Check />
                </div>
                <div className="summary-title">Optimization Complete!</div>
                <div className="summary-stats">
                    <div className="summary-stat">
                        <div className="summary-stat-value">{summary.successful}</div>
                        <div className="summary-stat-label">Images Processed</div>
                    </div>
                    <div className="summary-stat">
                        <div className="summary-stat-value">{summary.failed}</div>
                        <div className="summary-stat-label">Failed</div>
                    </div>
                    <div className="summary-stat">
                        <div className="summary-stat-value">{formatFileSize(summary.space_saved)}</div>
                        <div className="summary-stat-label">Space Saved</div>
                    </div>
                    <div className="summary-stat">
                        <div className="summary-stat-value">{summary.average_compression.toFixed(1)}%</div>
                        <div className="summary-stat-label">Avg. Compression</div>
                    </div>
                </div>
                <div className="summary-actions">
                    <button className="btn" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" onClick={() => {
                        if (outputDir) {
                            invoke('open_folder', { path: outputDir }).catch(console.error);
                        }
                        onClose();
                    }}>
                        <Icons.Folder /> Open Folder
                    </button>
                </div>
            </div>
        </div>
    );
}
