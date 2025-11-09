import { getCurrentWindow } from '@tauri-apps/api/window';
import { useState } from 'react';

export function WindowControls() {
  const appWindow = getCurrentWindow();
  const [isHovered, setIsHovered] = useState(false);

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
    <div 
      className="flex items-center gap-2 px-3 py-2" 
      data-tauri-drag-region
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        onClick={handleClose}
        className="w-3 h-3 rounded-full bg-[#ff5f57] hover:bg-[#ff5f57]/80 transition-colors flex items-center justify-center group relative"
        aria-label="Close"
      >
        {isHovered && (
          <svg 
            className="w-2 h-2 text-[#4d0000] absolute" 
            viewBox="0 0 12 12" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
          >
            <path d="M3 3L9 9M9 3L3 9" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <button
        onClick={handleMinimize}
        className="w-3 h-3 rounded-full bg-[#febc2e] hover:bg-[#febc2e]/80 transition-colors flex items-center justify-center group relative"
        aria-label="Minimize"
      >
        {isHovered && (
          <svg 
            className="w-2 h-2 text-[#995700] absolute" 
            viewBox="0 0 12 12" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
          >
            <path d="M3 6H9" strokeLinecap="round" />
          </svg>
        )}
      </button>
      <button
        onClick={handleMaximize}
        className="w-3 h-3 rounded-full bg-[#28c840] hover:bg-[#28c840]/80 transition-colors flex items-center justify-center group relative"
        aria-label="Maximize"
      >
        {isHovered && (
          <svg 
            className="w-2 h-2 text-[#006500] absolute rotate-45" 
            viewBox="0 0 12 12" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="1.5"
          >
            <path d="M3 6L6 3L9 6M9 6L6 9L3 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
    </div>
  );
}
