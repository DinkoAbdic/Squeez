import { useState, useRef, useEffect, useMemo } from 'react';
import { CropPreset, ProcessingSettings } from '../types';
import { Icons } from './Icons';
import { NumberInput } from './NumberInput';

const FILENAME_VARIABLES = [
    { token: '{name}', label: 'name', desc: 'Original filename' },
    { token: '{width}', label: 'width', desc: 'Output width' },
    { token: '{height}', label: 'height', desc: 'Output height' },
    { token: '{quality}', label: 'quality', desc: 'Quality value' },
    { token: '{format}', label: 'format', desc: 'Output format extension' },
] as const;

/** Parse a filename pattern into positioned segments of plain text and variable tokens */
function parsePatternSegments(pattern: string) {
    const segments: Array<{ type: 'text' | 'var'; value: string; start: number; end: number }> = [];
    const regex = /\{(name|width|height|quality|format)\}/g;
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(pattern)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: 'text', value: pattern.slice(lastIndex, match.index), start: lastIndex, end: match.index });
        }
        segments.push({ type: 'var', value: match[0], start: match.index, end: regex.lastIndex });
        lastIndex = regex.lastIndex;
    }
    if (lastIndex < pattern.length) {
        segments.push({ type: 'text', value: pattern.slice(lastIndex), start: lastIndex, end: pattern.length });
    }
    return segments;
}

interface SettingsPanelProps {
    settings: ProcessingSettings;
    onUpdateSetting: <K extends keyof ProcessingSettings>(key: K, value: ProcessingSettings[K]) => void;
    presets: CropPreset[];
    customPresets: CropPreset[];
    defaultPresetName: string | null;

    onSelectPreset: (preset: CropPreset | null) => void;
    onToggleDefault: (presetName: string) => void;
    onAddCustomPreset: (name: string, width: number, height: number) => void;
    onRemoveCustomPreset: (name: string) => void;
}

export function SettingsPanel({
    settings,
    onUpdateSetting,
    presets,
    customPresets,
    defaultPresetName,

    onSelectPreset,
    onToggleDefault,
    onAddCustomPreset,
    onRemoveCustomPreset,
}: SettingsPanelProps) {
    const [cropDropdownOpen, setCropDropdownOpen] = useState(false);
    const [formatDropdownOpen, setFormatDropdownOpen] = useState(false);
    const [showAddPreset, setShowAddPreset] = useState(false);
    const [newPresetName, setNewPresetName] = useState('');
    const [newPresetWidth, setNewPresetWidth] = useState('');
    const [newPresetHeight, setNewPresetHeight] = useState('');
    const cropDropdownRef = useRef<HTMLDivElement>(null);
    const formatDropdownRef = useRef<HTMLDivElement>(null);
    const patternInputRef = useRef<HTMLInputElement>(null);
    const [hoveredBadge, setHoveredBadge] = useState<number | null>(null);
    const [patternFocused, setPatternFocused] = useState(false);

    // Close dropdowns on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as Node;
            if (cropDropdownRef.current && !cropDropdownRef.current.contains(target)) {
                setCropDropdownOpen(false);
            }
            if (formatDropdownRef.current && !formatDropdownRef.current.contains(target)) {
                setFormatDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Group presets by platform (including custom)
    const allPresets = [...presets, ...customPresets];
    const presetsByPlatform = allPresets.reduce((acc, p) => {
        if (!acc[p.platform]) acc[p.platform] = [];
        acc[p.platform].push(p);
        return acc;
    }, {} as Record<string, CropPreset[]>);

    const handleSelectPreset = (preset: CropPreset | null) => {
        onSelectPreset(preset);
        setCropDropdownOpen(false);
    };

    const filenamePreview = useMemo(() => {
        const ext = settings.output_format === 'Jpeg' ? 'jpg'
            : settings.output_format === 'Png' ? 'png'
            : settings.output_format === 'WebP' ? 'webp'
            : settings.output_format === 'Avif' ? 'avif'
            : 'jpg';
        const resolved = settings.filename_pattern
            .replace(/\{name\}/g, 'photo')
            .replace(/\{width\}/g, '1920')
            .replace(/\{height\}/g, '1080')
            .replace(/\{quality\}/g, String(settings.quality))
            .replace(/\{format\}/g, ext);
        return `${resolved || 'photo'}.${ext}`;
    }, [settings.filename_pattern, settings.output_format, settings.quality]);

    const patternSegments = useMemo(
        () => parsePatternSegments(settings.filename_pattern),
        [settings.filename_pattern]
    );

    const insertVariable = (token: string) => {
        onUpdateSetting('filename_pattern', settings.filename_pattern + token);
        requestAnimationFrame(() => patternInputRef.current?.focus());
    };

    const removePatternSegment = (start: number, end: number) => {
        const p = settings.filename_pattern;
        onUpdateSetting('filename_pattern', p.slice(0, start) + p.slice(end));
    };

    const handlePatternInput = () => {
        const input = patternInputRef.current;
        if (!input) return;
        const typed = input.value;
        if (typed) {
            onUpdateSetting('filename_pattern', settings.filename_pattern + typed);
            input.value = '';
        }
    };

    const handlePatternKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && patternInputRef.current?.value === '') {
            e.preventDefault();
            const p = settings.filename_pattern;
            if (!p) return;
            // If pattern ends with a variable token, remove the whole token
            const varMatch = p.match(/\{(name|width|height|quality|format)\}$/);
            if (varMatch) {
                onUpdateSetting('filename_pattern', p.slice(0, p.length - varMatch[0].length));
            } else {
                onUpdateSetting('filename_pattern', p.slice(0, -1));
            }
        }
    };

    const handleAddCustomPreset = () => {
        const w = parseInt(newPresetWidth);
        const h = parseInt(newPresetHeight);
        if (!newPresetName.trim() || isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;
        onAddCustomPreset(newPresetName.trim(), w, h);
        setNewPresetName('');
        setNewPresetWidth('');
        setNewPresetHeight('');
        setShowAddPreset(false);
    };

    return (
        <div className="panel-right">
            {/* Format */}
            <div className="settings-section">
                <div className="settings-section-title">
                    Output Format
                    <div className="info-tooltip">
                        <Icons.Info />
                        <div className="tooltip-content">
                            <strong>WebP:</strong> Best balance of quality and smallest size for web usage.<br />
                            <strong>AVIF:</strong> Best possible compression, but much slower to encode.
                        </div>
                    </div>
                </div>
                <div className="crop-dropdown-container" ref={formatDropdownRef}>
                    <button
                        className="crop-dropdown-trigger"
                        onClick={() => setFormatDropdownOpen(!formatDropdownOpen)}
                    >
                        <span className="crop-dropdown-label">
                            {settings.output_format === 'WebP' ? 'WebP (Recommended)' :
                                settings.output_format === 'Avif' ? 'AVIF (Best Compression)' :
                                    settings.output_format === 'Jpeg' ? 'JPEG' :
                                        settings.output_format === 'Png' ? 'PNG' :
                                            'Keep Original Format'}
                        </span>
                        <Icons.ChevronDown />
                    </button>

                    {formatDropdownOpen && (
                        <div className="crop-dropdown-menu">
                            {['WebP', 'Avif', 'Jpeg', 'Png', 'Original'].map(format => {
                                const label = format === 'WebP' ? 'WebP (Recommended)' :
                                    format === 'Avif' ? 'AVIF (Best Compression)' :
                                        format === 'Jpeg' ? 'JPEG' :
                                            format === 'Png' ? 'PNG' :
                                                'Keep Original Format';

                                return (
                                    <div
                                        key={format}
                                        className={`crop-dropdown-item ${settings.output_format === format ? 'active' : ''}`}
                                        onClick={() => {
                                            onUpdateSetting('output_format', format as any);
                                            setFormatDropdownOpen(false);
                                        }}
                                    >
                                        <span>{label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Quality / Compression */}
            <div className="settings-section">
                {settings.output_format === 'Png' ? (
                    <>
                        <div className="settings-section-title">
                            Compression
                            <div className="info-tooltip">
                                <Icons.Info />
                                <div className="tooltip-content">
                                    PNG is always lossless — image quality is identical at every level.<br />
                                    Higher compression = smaller file but slower to encode.<br />
                                    <strong>9 (Maximum) is recommended unless export speed matters.</strong>
                                </div>
                            </div>
                        </div>
                        <div className="setting-row">
                            <span className="setting-label">Compression Level</span>
                            <span className="setting-value">{settings.png_compression} ({settings.png_compression <= 3 ? 'Fast' : settings.png_compression <= 6 ? 'Balanced' : 'Maximum'})</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="9"
                            value={settings.png_compression}
                            onChange={e => onUpdateSetting('png_compression', parseInt(e.target.value))}
                        />
                    </>
                ) : (
                    <>
                        <div className="settings-section-title">
                            Quality
                            <div className="info-tooltip">
                                <Icons.Info />
                                <div className="tooltip-content">
                                    Lower quality = smaller file size but more visual artifacts.<br />
                                    <strong>80% is the recommended sweet spot.</strong>
                                </div>
                            </div>
                        </div>
                        <div className="setting-row">
                            <span className="setting-label">Quality</span>
                            <span className="setting-value">{settings.quality}%</span>
                        </div>
                        <input
                            type="range"
                            min="1"
                            max="100"
                            value={settings.quality}
                            onChange={e => onUpdateSetting('quality', parseInt(e.target.value))}
                        />

                        {settings.output_format === 'Avif' && (
                            <>
                                <div className="setting-row" style={{ marginTop: '12px' }}>
                                    <span className="setting-label">AVIF Speed</span>
                                    <span className="setting-value">{settings.avif_speed} ({settings.avif_speed <= 3 ? 'Slow/Best' : settings.avif_speed <= 7 ? 'Balanced' : 'Fast'})</span>
                                </div>
                                <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={settings.avif_speed}
                                    onChange={e => onUpdateSetting('avif_speed', parseInt(e.target.value))}
                                />
                            </>
                        )}
                    </>
                )}
            </div>

            {/* Resize */}
            <div className="settings-section">
                <div className="settings-section-title">
                    Resize
                    <div className="info-tooltip">
                        <Icons.Info />
                        <div className="tooltip-content">
                            Scale down large images to fit within specific dimensions.<br />
                            Leave blank ("Auto") to maintain original resolution.
                        </div>
                    </div>
                </div>
                <div className="setting-row">
                    <span className="setting-label">Max Width (px)</span>
                    <NumberInput
                        value={settings.resize_width || ''}
                        onChange={val => onUpdateSetting('resize_width', val)}
                        placeholder="Auto"
                        step={100}
                    />
                </div>
                <div className="setting-row">
                    <span className="setting-label">Max Height (px)</span>
                    <NumberInput
                        value={settings.resize_height || ''}
                        onChange={val => onUpdateSetting('resize_height', val)}
                        placeholder="Auto"
                        step={100}
                    />
                </div>
                <div className="setting-row">
                    <span className="setting-label">Keep Aspect Ratio</span>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.maintain_aspect_ratio}
                            onChange={e => onUpdateSetting('maintain_aspect_ratio', e.target.checked)}
                        />
                        <div className="toggle-track" />
                        <div className="toggle-thumb" />
                    </label>
                </div>
            </div>

            {/* Crop Preset Dropdown */}
            <div className="settings-section">
                <div className="settings-section-title">
                    Crop Preset
                    <div className="info-tooltip">
                        <Icons.Info />
                        <div className="tooltip-content">
                            Force the image to a specific aspect ratio or size.<br />
                            Great for social media constraints (Instagram, LinkedIn).
                        </div>
                    </div>
                </div>
                <div className="crop-dropdown-container" ref={cropDropdownRef}>
                    <button
                        className="crop-dropdown-trigger"
                        onClick={() => setCropDropdownOpen(!cropDropdownOpen)}
                    >
                        <span className="crop-dropdown-label">
                            {settings.crop_preset
                                ? `${settings.crop_preset.name} (${settings.crop_preset.aspect_ratio})`
                                : 'No Crop'}
                        </span>
                        <Icons.ChevronDown />
                    </button>

                    {cropDropdownOpen && (
                        <div className="crop-dropdown-menu">
                            <div
                                className={`crop-dropdown-item ${!settings.crop_preset ? 'active' : ''}`}
                                onClick={() => handleSelectPreset(null)}
                            >
                                <span>No Crop</span>
                            </div>
                            <div className="crop-dropdown-divider" />

                            {Object.entries(presetsByPlatform).map(([platform, platformPresets]) => (
                                <div key={platform}>
                                    <div className="crop-dropdown-section">{platform}</div>
                                    {platformPresets.map(preset => (
                                        <div
                                            key={preset.name}
                                            className={`crop-dropdown-item ${settings.crop_preset?.name === preset.name ? 'active' : ''}`}
                                            onClick={() => handleSelectPreset(preset)}
                                        >
                                            <span>{preset.name.replace(`${platform} `, '')}</span>
                                            <span className="crop-dropdown-dims">
                                                {preset.width}×{preset.height}
                                            </span>
                                            <div className="preset-actions">
                                                <button
                                                    className={`star-btn ${defaultPresetName === preset.name ? 'starred' : ''}`}
                                                    onClick={(e) => { e.stopPropagation(); onToggleDefault(preset.name); }}
                                                    title={defaultPresetName === preset.name ? 'Remove as default' : 'Set as default'}
                                                >
                                                    <Icons.Star filled={defaultPresetName === preset.name} />
                                                </button>
                                                {platform === 'Custom' && (
                                                    <button
                                                        className="preset-delete-btn"
                                                        onClick={(e) => { e.stopPropagation(); onRemoveCustomPreset(preset.name); }}
                                                        title="Delete preset"
                                                    >
                                                        <Icons.Trash />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Add Custom Preset */}
                {!showAddPreset ? (
                    <button
                        className="btn add-preset-btn"
                        onClick={() => setShowAddPreset(true)}
                        style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
                    >
                        <Icons.Plus /> Add Custom Preset
                    </button>
                ) : (
                    <div className="custom-preset-form">
                        <input
                            type="text"
                            placeholder="Preset name"
                            value={newPresetName}
                            onChange={e => setNewPresetName(e.target.value)}
                        />
                        <div className="preset-dims-row">
                            <NumberInput
                                value={typeof newPresetWidth === 'string' && newPresetWidth !== '' ? parseInt(newPresetWidth) : ''}
                                onChange={val => setNewPresetWidth(val !== null ? val.toString() : '')}
                                placeholder="Width"
                                step={100}
                                style={{ width: '80px' }}
                            />
                            <span className="dims-separator">×</span>
                            <NumberInput
                                value={typeof newPresetHeight === 'string' && newPresetHeight !== '' ? parseInt(newPresetHeight) : ''}
                                onChange={val => setNewPresetHeight(val !== null ? val.toString() : '')}
                                placeholder="Height"
                                step={100}
                                style={{ width: '80px' }}
                            />
                        </div>
                        <div className="preset-form-actions">
                            <button className="btn btn-primary" onClick={handleAddCustomPreset}>Save</button>
                            <button className="btn" onClick={() => setShowAddPreset(false)}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

            {/* Options */}
            <div className="settings-section">
                <div className="settings-section-title">
                    Options
                    <div className="info-tooltip">
                        <Icons.Info />
                        <div className="tooltip-content">
                            <strong>Strip Metadata:</strong> Removes EXIF data (camera info, GPS, etc.) to save extra space and protect privacy. Recommended for web delivery.
                        </div>
                    </div>
                </div>
                <div className="setting-row">
                    <span className="setting-label">Strip Metadata</span>
                    <label className="toggle">
                        <input
                            type="checkbox"
                            checked={settings.strip_metadata}
                            onChange={e => onUpdateSetting('strip_metadata', e.target.checked)}
                        />
                        <div className="toggle-track" />
                        <div className="toggle-thumb" />
                    </label>
                </div>
            </div>

            {/* Filename Pattern */}
            <div className="settings-section">
                <div className="settings-section-title">
                    Filename Pattern
                    <div className="info-tooltip">
                        <Icons.Info />
                        <div className="tooltip-content">
                            Customize how exported files are named using variables:<br />
                            <strong>{'{name}'}</strong> — original filename<br />
                            <strong>{'{width}'}</strong> — output width in px<br />
                            <strong>{'{height}'}</strong> — output height in px<br />
                            <strong>{'{quality}'}</strong> — quality setting<br />
                            <strong>{'{format}'}</strong> — output format extension<br /><br />
                            Leave empty to keep original filenames.<br /><br />
                            If multiple images produce the same filename, a suffix (_1, _2, ...) is added automatically.
                        </div>
                    </div>
                </div>

                {/* Chip-input pattern editor */}
                <div
                    onClick={() => patternInputRef.current?.focus()}
                    style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '7px 8px',
                        minHeight: '36px',
                        backgroundColor: 'var(--bg-input)',
                        border: `1px solid ${patternFocused ? 'var(--brand-primary)' : 'rgba(255,255,255,0.15)'}`,
                        borderRadius: '6px',
                        cursor: 'text',
                        transition: 'border-color 0.15s ease',
                    }}
                >
                    {patternSegments.map((seg, i) => (
                        seg.type === 'var' ? (
                            <span
                                key={`${i}-${seg.start}`}
                                onMouseEnter={() => setHoveredBadge(i)}
                                onMouseLeave={() => setHoveredBadge(null)}
                                style={{
                                    position: 'relative',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    padding: '1px 8px',
                                    backgroundColor: 'rgba(241, 93, 34, 0.12)',
                                    border: '1px solid rgba(241, 93, 34, 0.3)',
                                    borderRadius: '4px',
                                    fontFamily: 'monospace',
                                    fontSize: '12px',
                                    color: 'var(--brand-primary)',
                                    whiteSpace: 'nowrap',
                                    userSelect: 'none',
                                    lineHeight: '20px',
                                }}
                            >
                                {seg.value}
                                <button
                                    onClick={(e) => { e.stopPropagation(); removePatternSegment(seg.start, seg.end); }}
                                    style={{
                                        position: 'absolute',
                                        top: '-7px',
                                        right: '-7px',
                                        width: '16px',
                                        height: '16px',
                                        borderRadius: '50%',
                                        backgroundColor: 'var(--bg-elevated)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text-secondary)',
                                        fontSize: '10px',
                                        lineHeight: '1',
                                        display: hoveredBadge === i ? 'flex' : 'none',
                                        cursor: 'pointer',
                                        padding: 0,
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                    title="Remove"
                                >
                                    ×
                                </button>
                            </span>
                        ) : (
                            <span
                                key={`${i}-${seg.start}`}
                                style={{
                                    fontFamily: 'monospace',
                                    fontSize: '13px',
                                    color: 'var(--text-primary)',
                                    whiteSpace: 'pre',
                                }}
                            >
                                {seg.value}
                            </span>
                        )
                    ))}
                    <input
                        ref={patternInputRef}
                        type="text"
                        onFocus={() => setPatternFocused(true)}
                        onBlur={() => setPatternFocused(false)}
                        onInput={handlePatternInput}
                        onKeyDown={handlePatternKeyDown}
                        placeholder={patternSegments.length === 0 ? 'Empty = original filename' : ''}
                        spellCheck={false}
                        style={{
                            flex: 1,
                            minWidth: '40px',
                            border: 'none',
                            outline: 'none',
                            background: 'transparent',
                            fontFamily: 'monospace',
                            fontSize: '13px',
                            color: 'var(--text-primary)',
                            padding: 0,
                        }}
                    />
                </div>

                <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '4px',
                    marginTop: '8px',
                }}>
                    {FILENAME_VARIABLES.map(v => (
                        <button
                            key={v.token}
                            className="btn"
                            title={v.desc}
                            onClick={() => insertVariable(v.token)}
                            style={{
                                fontSize: '11px',
                                padding: '3px 8px',
                                fontFamily: 'monospace',
                                borderRadius: '4px',
                                cursor: 'pointer',
                            }}
                        >
                            + {v.token}
                        </button>
                    ))}
                </div>

                <div style={{
                    marginTop: '8px',
                    fontSize: '11px',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'monospace',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                }}>
                    Preview: {filenamePreview}
                </div>
                <div style={{
                    marginTop: '2px',
                    fontSize: '10px',
                    color: 'var(--text-tertiary)',
                }}>
                    Duplicates are suffixed automatically (_1, _2, ...)
                </div>
            </div>
        </div>
    );
}
