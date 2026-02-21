import React from 'react';

interface NumberInputProps {
    value: number | '';
    onChange: (val: number | null) => void;
    placeholder?: string;
    min?: number;
    max?: number;
    step?: number;
    style?: React.CSSProperties;
}

export function NumberInput({
    value,
    onChange,
    placeholder,
    min = 0,
    max = 99999,
    step = 10,
    style,
}: NumberInputProps) {
    const handleInc = () => {
        const current = typeof value === 'number' ? value : 0;
        const next = Math.min(max, current + step);
        onChange(next);
    };

    const handleDec = () => {
        const current = typeof value === 'number' ? value : 0;
        const next = Math.max(min, current - step);
        onChange(typeof value === 'number' ? next : 0);
    };

    return (
        <div className="number-input-wrapper" style={style}>
            <input
                type="number"
                value={value}
                onChange={e => onChange(e.target.value ? parseInt(e.target.value) : null)}
                placeholder={placeholder}
            />
            <div className="number-spin-buttons">
                <button className="number-spin-btn" onClick={handleInc} tabIndex={-1}>
                    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                        <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
                <button className="number-spin-btn" onClick={handleDec} tabIndex={-1}>
                    <svg viewBox="0 0 16 16" width="10" height="10" fill="currentColor">
                        <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            </div>
        </div>
    );
}
