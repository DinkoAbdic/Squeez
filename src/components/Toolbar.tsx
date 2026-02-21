import { Icons } from './Icons';

interface ToolbarProps {
    imageCount: number;
    selectedId: string | null;
    isProcessing: boolean;
    onAddImages: () => void;
    onAddFolder: () => void;
    onClear: () => void;
    onExportSelected: () => void;
    onExportAll: () => void;
    onHelp: () => void;
}

export function Toolbar({
    imageCount,
    selectedId,
    isProcessing,
    onAddImages,
    onAddFolder,
    onClear,
    onExportSelected,
    onExportAll,
    onHelp,
}: ToolbarProps) {
    return (
        <div className="toolbar">
            <div className="app-title">
                <Icons.Logo />
            </div>
            <div className="toolbar-group">
                <button className="btn" onClick={onAddImages}>
                    <Icons.Plus /> Add Images
                </button>
                <button className="btn" onClick={onAddFolder}>
                    <Icons.Folder /> Add Folder
                </button>
            </div>
            <div className="toolbar-separator" />
            <div className="toolbar-group">
                <button className="btn" onClick={onClear} disabled={imageCount === 0}>
                    <Icons.Clear /> Clear All
                </button>
            </div>
            <div className="toolbar-separator" />
            <div className="toolbar-group">
                <button className="btn btn-icon" onClick={onHelp} title="Help & Shortcuts">
                    <Icons.Help />
                </button>
            </div>
            <div className="toolbar-spacer" />
            <div className="toolbar-group">
                <button
                    className="btn btn-primary"
                    onClick={onExportSelected}
                    disabled={!selectedId || isProcessing}
                >
                    <Icons.Export /> Export Selected
                </button>
                <button
                    className="btn btn-primary"
                    onClick={onExportAll}
                    disabled={imageCount === 0 || isProcessing}
                >
                    <Icons.Export /> Export All {imageCount > 0 && `(${imageCount})`}
                </button>
            </div>
        </div>
    );
}
