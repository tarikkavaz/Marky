import { invoke } from '@tauri-apps/api/core';
import { listen, type Event } from '@tauri-apps/api/event';

/**
 * Start watching a file for external changes
 */
export async function startWatching(filePath: string): Promise<void> {
  try {
    await invoke('watch_file', { filePath });
  } catch (error) {
    console.error('Failed to start watching file:', error);
    throw error;
  }
}

/**
 * Stop watching a file
 */
export async function stopWatching(filePath: string): Promise<void> {
  try {
    await invoke('unwatch_file', { filePath });
  } catch (error) {
    console.error('Failed to stop watching file:', error);
    throw error;
  }
}

/**
 * Listen for file change events
 * @param callback Function to call when file is changed externally
 * @returns Unlisten function to stop listening
 */
export async function onFileChanged(
  callback: (filePath: string) => void
): Promise<() => void> {
  const unlisten = await listen<string>('file-changed', (event: Event<string>) => {
    callback(event.payload);
  });
  return unlisten;
}

/**
 * Listen for file deletion events
 * @param callback Function to call when file is deleted externally
 * @returns Unlisten function to stop listening
 */
export async function onFileDeleted(
  callback: (filePath: string) => void
): Promise<() => void> {
  const unlisten = await listen<string>('file-deleted', (event: Event<string>) => {
    callback(event.payload);
  });
  return unlisten;
}
