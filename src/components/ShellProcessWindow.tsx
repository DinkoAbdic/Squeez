import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icons } from './Icons';
import { formatFileSize } from '../utils';

interface ShellResult {
    success: boolean;
    input_filename: string;
    output_path: string | null;
    output_filename: string | null;
    original_size: number;
    output_size: number | null;
    savings_percent: number | null;
    error: string | null;
}

interface Props {
    path: string;
}

const CLOSE_DELAY = 4; // seconds before auto-close

export function ShellProcessWindow({ path }: Props) {
    const [result, setResult] = useState<ShellResult | null>(null);
    const [countdown, setCountdown] = useState(CLOSE_DELAY);

    // Resize to compact dimensions, then kick off processing
    useEffect(() => {
        invoke('resize_for_shell_mode').catch(() => {});
        invoke<ShellResult>('process_shell_image', { path })
            .then(r => setResult(r))
            .catch(err =>
                setResult({
                    success: false,
                    input_filename: path.split(/[\\/]/).pop() ?? path,
                    output_path: null,
                    output_filename: null,
                    original_size: 0,
                    output_size: null,
                    savings_percent: null,
                    error: String(err),
                })
            );
    }, [path]);

    // Countdown auto-close once result is in
    useEffect(() => {
        if (!result) return;
        const id = setInterval(() => {
            setCountdown(n => {
                if (n <= 1) {
                    clearInterval(id);
                    getCurrentWindow().close();
                    return 0;
                }
                return n - 1;
            });
        }, 1000);
        return () => clearInterval(id);
    }, [result]);

    const handleOpenFolder = () => {
        if (!result?.output_path) return;
        const dir = result.output_path.replace(/[\\/][^\\/]+$/, '');
        invoke('open_folder', { path: dir }).catch(() => {});
        // Reset countdown so the window doesn't disappear immediately after clicking
        setCountdown(CLOSE_DELAY);
    };

    const filename = path.split(/[\\/]/).pop() ?? path;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100vh',
            backgroundColor: 'var(--bg-primary)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '10px',
            overflow: 'hidden',
            userSelect: 'none',
        }}>
            {/* ── Compact title bar ── */}
            <div
                data-tauri-drag-region
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    height: '36px',
                    padding: '0 6px 0 12px',
                    borderBottom: '1px solid var(--border-subtle)',
                    flexShrink: 0,
                }}
            >
                <div
                    data-tauri-drag-region
                    style={{ display: 'flex', alignItems: 'center', gap: '7px', pointerEvents: 'none' }}
                >
                    <Icons.AppIcon />
                    <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        Squeez
                    </span>
                </div>
                <button
                    className="titlebar-button close"
                    onClick={() => getCurrentWindow().close()}
                    title="Close"
                >
                    <Icons.Close />
                </button>
            </div>

            {/* ── Content ── */}
            <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                padding: '0 16px',
                gap: '14px',
                minWidth: 0,
            }}>
                {!result ? (
                    /* Processing */
                    <>
                        <div className="shell-spinner" />
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                Compressing…
                            </div>
                            <div style={{
                                fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {filename}
                            </div>
                        </div>
                    </>
                ) : result.success ? (
                    /* Success */
                    <>
                        <div style={{ color: 'var(--accent-success)', flexShrink: 0, display: 'flex' }}>
                            <Icons.Check />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {result.output_filename}
                            </div>
                            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                {result.savings_percent != null && result.savings_percent > 0
                                    ? `${Math.round(result.savings_percent)}% smaller · ${formatFileSize(result.original_size)} → ${formatFileSize(result.output_size!)}`
                                    : `Saved · ${formatFileSize(result.output_size ?? 0)}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                            <button className="btn" onClick={handleOpenFolder}
                                style={{ fontSize: '11px', padding: '4px 10px' }}>
                                Open folder
                            </button>
                            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', minWidth: '18px' }}>
                                {countdown}s
                            </span>
                        </div>
                    </>
                ) : (
                    /* Error */
                    <>
                        <div style={{ color: 'var(--accent-error)', flexShrink: 0, display: 'flex' }}>
                            <Icons.Info />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>
                                Compression failed
                            </div>
                            <div style={{
                                fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>
                                {result.error ?? 'Unknown error'}
                            </div>
                        </div>
                        <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', flexShrink: 0 }}>
                            {countdown}s
                        </span>
                    </>
                )}
            </div>
        </div>
    );
}
