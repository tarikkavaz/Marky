import { convertFileSrc } from '@tauri-apps/api/core';

export async function saveImageForMarkdown(
  imagePath: string,
  _markdownPath: string | null
): Promise<string> {
  // Return the absolute path to be stored in markdown
  // It will be converted to base64 when loaded into the editor
  return imagePath;
}

// Convert data URLs or Tauri URLs back to file paths for markdown
// Note: For base64 data URLs, we can't recover the original path,
// so this will return the data URL as-is (not ideal, but safe)
export function imageUrlToMarkdownPath(url: string, _markdownDir: string): string {
  // If it's a base64 data URL, we can't recover the original file path
  // This shouldn't happen in normal flow since we store absolute paths in markdown
  if (url.startsWith('data:')) {
    console.warn('Cannot convert base64 data URL back to file path');
    return url;
  }
  
  // If it's a Tauri asset URL, extract the absolute file path
  if (url.includes('asset://') || url.includes('tauri://') || url.includes('http://asset.localhost')) {
    // Extract the actual file path from the Tauri URL
    // Format: asset://localhost/encoded-path or http://asset.localhost/encoded-path
    // Remove the protocol and localhost
    let decodedPath = url.replace(/^(asset|tauri|http):\/\/(asset\.)?localhost\//, '');
    // Decode URL encoding
    decodedPath = decodeURIComponent(decodedPath);
    
    // Return absolute path
    return decodedPath;
  }
  
  // If it's already a path, return as is
  return url;
}

// Convert absolute file paths to Tauri asset URLs
export async function markdownPathToImageUrl(imagePath: string, _markdownPath: string): Promise<string> {
  // If it's already a Tauri URL or data URL, return as is
  if (imagePath.includes('asset://') || imagePath.includes('tauri://') || imagePath.includes('http://asset.localhost') || imagePath.startsWith('data:')) {
    return imagePath;
  }

  // If it's an absolute path, convert to Tauri URL
  if (imagePath.startsWith('/')) {
    return convertFileSrc(imagePath);
  }

  // Otherwise return as is
  return imagePath;
}
