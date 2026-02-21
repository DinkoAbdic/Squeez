import { Icons } from './Icons';

export type UpdateStatus = 'idle' | 'available' | 'downloading' | 'ready';

interface UpdateBannerProps {
  updateVersion: string;
  status: UpdateStatus;
  downloadProgress: number;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateBanner({
  updateVersion,
  status,
  downloadProgress,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  if (status === 'idle') return null;

  return (
    <div className="update-banner">
      <div className="update-banner-content">
        {status === 'available' && (
          <>
            <span className="update-banner-text">
              Squeez <strong>v{updateVersion}</strong> is available
            </span>
            <button className="update-banner-action" onClick={onInstall}>
              Update now
            </button>
          </>
        )}

        {status === 'downloading' && (
          <>
            <span className="update-banner-text">
              Downloading update...
            </span>
            <div className="update-banner-progress-track">
              <div
                className="update-banner-progress-fill"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span className="update-banner-percent">{downloadProgress}%</span>
          </>
        )}

        {status === 'ready' && (
          <>
            <span className="update-banner-text">
              Update installed — restart to finish
            </span>
            <button className="update-banner-action" onClick={onInstall}>
              Restart now
            </button>
          </>
        )}
      </div>

      {status !== 'downloading' && (
        <button className="update-banner-close" onClick={onDismiss} title="Dismiss">
          <Icons.Close />
        </button>
      )}
    </div>
  );
}
