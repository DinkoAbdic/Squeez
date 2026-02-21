interface ImportModalProps {
    count: number;
    onCancel: () => void;
}

export function ImportModal({ count, onCancel }: ImportModalProps) {
    return (
        <div className="progress-overlay">
            <div className="progress-card">
                <div className="progress-title">Importing Images...</div>
                <div className="progress-subtitle">
                    Found {count} image{count !== 1 ? 's' : ''} so far
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '16px' }}>
                    <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Scanning files...</span>
                </div>
                <button className="btn" onClick={onCancel} style={{ width: '100%', justifyContent: 'center' }}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
