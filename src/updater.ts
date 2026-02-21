import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateInfo {
  available: boolean;
  version: string;
  body: string;
}

let pendingUpdate: Update | null = null;

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const update = await check();
    if (update) {
      pendingUpdate = update;
      return {
        available: true,
        version: update.version,
        body: update.body ?? '',
      };
    }
    return null;
  } catch (e) {
    console.error('Update check failed:', e);
    return null;
  }
}

export async function downloadAndInstall(
  onProgress: (percent: number) => void,
): Promise<void> {
  if (!pendingUpdate) throw new Error('No pending update');

  let totalLength = 0;
  let downloaded = 0;

  await pendingUpdate.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      totalLength = event.data.contentLength ?? 0;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
      if (totalLength > 0) {
        onProgress(Math.round((downloaded / totalLength) * 100));
      }
    } else if (event.event === 'Finished') {
      onProgress(100);
    }
  });

  await relaunch();
}
