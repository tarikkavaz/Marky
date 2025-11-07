import { getCurrentWindow } from '@tauri-apps/api/window';

export function WindowControls() {
  const appWindow = getCurrentWindow();

  const handleMinimize = async () => {
    await appWindow.minimize();
  };

  const handleMaximize = async () => {
    await appWindow.toggleMaximize();
  };

  const handleClose = async () => {
    await appWindow.close();
  };

  return (
    <div className="flex items-center gap-1 px-2 py-1" data-tauri-drag-region>
      <button
        onClick={handleMinimize}
        className="w-3 h-3 rounded-full bg-yellow-500 hover:bg-yellow-400 transition-colors"
        aria-label="Minimize"
      />
      <button
        onClick={handleMaximize}
        className="w-3 h-3 rounded-full bg-green-500 hover:bg-green-400 transition-colors"
        aria-label="Maximize"
      />
      <button
        onClick={handleClose}
        className="w-3 h-3 rounded-full bg-red-500 hover:bg-red-400 transition-colors"
        aria-label="Close"
      />
    </div>
  );
}
