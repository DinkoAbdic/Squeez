import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { Icons } from './Icons';
import { checkForUpdates, UpdateInfo } from '../updater';

const APP_VERSION = '0.2.0';

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

    // Windows Integration state
    const isWindows = navigator.platform === 'Win32' || navigator.platform.startsWith('Win');
    const [ctxRegistered, setCtxRegistered] = useState<boolean | null>(null);
    const [ctxWorking, setCtxWorking] = useState(false);
    const [ctxMsg, setCtxMsg] = useState<string | null>(null);

    useEffect(() => {
        if (!isWindows) return;
        invoke<boolean>('is_context_menu_registered')
            .then(r => setCtxRegistered(r))
            .catch(() => setCtxRegistered(false));
    }, [isWindows]);

    const handleToggleContextMenu = async () => {
        setCtxWorking(true);
        setCtxMsg(null);
        try {
            if (ctxRegistered) {
                await invoke('unregister_context_menu');
                setCtxRegistered(false);
                setCtxMsg('Removed from right-click menu.');
            } else {
                await invoke('register_context_menu');
                setCtxRegistered(true);
                setCtxMsg('Added! Right-click any image file to try it.');
            }
        } catch (err) {
            setCtxMsg(`Error: ${err}`);
        } finally {
            setCtxWorking(false);
        }
    };

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

                    {isWindows && (
                        <div className="help-section">
                            <div className="help-section-title">Windows Integration</div>
                            <p className="help-text" style={{ marginBottom: '12px' }}>
                                Add a <strong>"Squeez this image"</strong> option to the right-click
                                context menu. Instantly compresses any image to WebP using your
                                default settings — no need to open the app.
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <button
                                    className="help-update-btn"
                                    onClick={handleToggleContextMenu}
                                    disabled={ctxWorking || ctxRegistered === null}
                                >
                                    {ctxWorking
                                        ? 'Working…'
                                        : ctxRegistered
                                            ? 'Remove from right-click menu'
                                            : 'Add to right-click menu'}
                                </button>
                                {ctxRegistered !== null && !ctxWorking && !ctxMsg && (
                                    <span style={{ fontSize: '11px', color: ctxRegistered ? 'var(--accent-success)' : 'var(--text-tertiary)' }}>
                                        {ctxRegistered ? '● Active' : '○ Not installed'}
                                    </span>
                                )}
                            </div>
                            {ctxMsg && (
                                <span className="help-update-status latest" style={{ display: 'block', marginTop: '8px' }}>
                                    {ctxMsg}
                                </span>
                            )}
                        </div>
                    )}

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

                    <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                        Developed by{' '}
                        <a
                            href="#"
                            onClick={e => { e.preventDefault(); openUrl('https://www.indigo.ba'); }}
                            style={{ color: 'var(--text-tertiary)', textDecoration: 'underline', cursor: 'pointer' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
                        >
                            Indigo
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
}
