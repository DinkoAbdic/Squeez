import { ProgressEvent } from '../types';

interface ProgressModalProps {
    progress: ProgressEvent;
    onCancel: () => void;
}

export function ProgressModal({ progress, onCancel }: ProgressModalProps) {
    return (
        <div className="progress-overlay">
            <div className="progress-card">
                <div className="progress-title">Optimizing Images...</div>
                <div className="progress-subtitle">
                    Processing {progress.current} of {progress.total}
                </div>
                <div className="progress-bar-container">
                    <div
                        className="progress-bar-fill"
                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                </div>
                <div className="progress-stats">
                    <span>{progress.current_file.split('\\').pop()}</span>
                    <span>{Math.round((progress.current / progress.total) * 100)}%</span>
                </div>
                <button className="btn" onClick={onCancel} style={{ marginTop: '16px', width: '100%', justifyContent: 'center' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
