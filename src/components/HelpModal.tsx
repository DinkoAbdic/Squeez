import { useState } from 'react';
import { Icons } from './Icons';
import { checkForUpdates, UpdateInfo } from '../updater';

const APP_VERSION = '0.1.0';

interface HelpModalProps {
    onClose: () => void;
    onUpdateAvailable: (info: UpdateInfo) => void;
}

const shortcuts: { key: string; description: string }[] = [
    { key: 'C', description: 'Toggle before/after comparison' },
    { key: 'F', description: 'Fit image to viewport' },
    { key: 'H', description: 'Toggle HD preview' },
    { key: 'Ctrl+T', description: 'Toggle crop editing mode' },
    { key: 'Space + Drag', description: 'Pan the viewport' },
    { key: 'Scroll', description: 'Zoom in / out' },
    { key: 'Arrow Up / Down', description: 'Navigate between images' },
    { key: 'Delete', description: 'Remove selected image' },
];

export function HelpModal({ onClose, onUpdateAvailable }: HelpModalProps) {
    const [checking, setChecking] = useState(false);
    const [checkResult, setCheckResult] = useState<'latest' | 'error' | null>(null);

    const handleCheckForUpdates = async () => {
        setChecking(true);
        setCheckResult(null);
        try {
            const info = await checkForUpdates();
            if (info) {
                onUpdateAvailable(info);
            } else {
                setCheckResult('latest');
            }
        } catch {
            setCheckResult('error');
        } finally {
            setChecking(false);
        }
    };

    return (
        <div className="progress-overlay" onClick={onClose}>
            <div
                className="help-modal"
                onClick={e => e.stopPropagation()}
            >
                <div className="help-modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Icons.AppIcon />
                        <span className="help-modal-title">Squeez</span>
                        <span className="help-version">v{APP_VERSION}</span>
                    </div>
                    <button className="help-modal-close" onClick={onClose}>
                        <Icons.Close />
                    </button>
                </div>

                <div className="help-modal-body">
                    <p className="help-modal-description">
                        Squeez is a fast, offline image optimizer. Import images or folders, adjust
                        format, quality, resize, and crop settings, then export — all processed
                        locally on your machine.
                    </p>

                    <div className="help-section">
                        <div className="help-section-title">How it works</div>
                        <ol className="help-steps">
                            <li>Add images via the toolbar buttons, or drag &amp; drop files onto the window.</li>
                            <li>Select an image from the sidebar to preview it.</li>
                            <li>Adjust output format, quality, resize, and crop settings in the right panel.</li>
                            <li>Use Compare mode to see before/after side-by-side.</li>
                            <li>Export selected images or the entire batch to a folder.</li>
                        </ol>
                    </div>

                    <div className="help-section">
                        <div className="help-section-title">Keyboard Shortcuts</div>
                        <div className="help-shortcuts">
                            {shortcuts.map(s => (
                                <div key={s.key} className="help-shortcut-row">
                                    <kbd className="help-kbd">{s.key}</kbd>
                                    <span>{s.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="help-section">
                        <div className="help-section-title">Supported Formats</div>
                        <p className="help-text">
                            <strong>Input:</strong> JPEG, PNG, WebP, AVIF, GIF, BMP, TIFF<br />
                            <strong>Output:</strong> JPEG, PNG, WebP, AVIF, or keep original format
                        </p>
                    </div>

                    <div className="help-update-section">
                        <button
                            className="help-update-btn"
                            onClick={handleCheckForUpdates}
                            disabled={checking}
                        >
                            {checking ? 'Checking...' : 'Check for Updates'}
                        </button>
                        {checkResult === 'latest' && (
                            <span className="help-update-status latest">You're on the latest version</span>
                        )}
                        {checkResult === 'error' && (
                            <span className="help-update-status">Could not check for updates</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
