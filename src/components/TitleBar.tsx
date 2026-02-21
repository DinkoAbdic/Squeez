import { getCurrentWindow } from '@tauri-apps/api/window';
import { Icons } from './Icons';

export function TitleBar() {
    const handleMinimize = () => getCurrentWindow().minimize();
    const handleMaximize = () => getCurrentWindow().toggleMaximize();
    const handleClose = () => getCurrentWindow().close();

    return (
        <div className="titlebar">
            <div className="titlebar-drag-region" data-tauri-drag-region>
                <div className="titlebar-logo">
                    <Icons.AppIcon />
                </div>
                <span>Squeez</span>
            </div>
            <div className="titlebar-actions">
                <button className="titlebar-button" onClick={handleMinimize} title="Minimize">
                    <Icons.Minimize />
                </button>
                <button className="titlebar-button" onClick={handleMaximize} title="Maximize">
                    <Icons.Maximize />
                </button>
                <button className="titlebar-button close" onClick={handleClose} title="Close">
                    <Icons.Close />
                </button>
            </div>
        </div>
    );
}
