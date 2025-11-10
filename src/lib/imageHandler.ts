import { convertFileSrc } from '@tauri-apps/api/core';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { dirname, join, basename } from '@tauri-apps/api/path';
import { appDataDir } from '@tauri-apps/api/path';

export interface ImageSaveResult {
  path: string; // Relative path for markdown (e.g., ./images/image.png)
  isTemporary: boolean; // True if stored temporarily (file not saved yet)
  tempPath?: string; // Absolute path to temporary file if isTemporary is true
}

export async function saveImageForMarkdown(
  imagePath: string,
  markdownPath: string | null
): Promise<ImageSaveResult> {
  // Read the source image
  const imageData = await readFile(imagePath);
  const imageName = await basename(imagePath);
  
  if (!markdownPath) {
    // File is not saved yet - store temporarily
    const tempDir = await appDataDir();
    const tempImagesDir = await join(tempDir, 'temp_images');
    
    // Create temp directory if it doesn't exist
    if (!(await exists(tempImagesDir))) {
      await mkdir(tempImagesDir, { recursive: true });
    }
    
    // Generate unique filename if needed
    let tempImagePath = await join(tempImagesDir, imageName);
    let counter = 1;
    while (await exists(tempImagePath)) {
      const ext = imageName.split('.').pop();
      const nameWithoutExt = imageName.substring(0, imageName.lastIndexOf('.'));
      tempImagePath = await join(tempImagesDir, `${nameWithoutExt}-${counter}.${ext}`);
      counter++;
    }
    
    // Write to temp location
    await writeFile(tempImagePath, imageData);
    
    return {
      path: tempImagePath, // Use absolute path temporarily
      isTemporary: true,
      tempPath: tempImagePath,
    };
  }
  
  // File is saved - store in ./images/ relative to markdown file
  const markdownDir = await dirname(markdownPath);
  const imagesDir = await join(markdownDir, 'images');
  
  // Create images directory if it doesn't exist
  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
  }
  
  // Generate unique filename if needed
  let targetImagePath = await join(imagesDir, imageName);
  let counter = 1;
  while (await exists(targetImagePath)) {
    const ext = imageName.split('.').pop();
    const nameWithoutExt = imageName.substring(0, imageName.lastIndexOf('.'));
    targetImagePath = await join(imagesDir, `${nameWithoutExt}-${counter}.${ext}`);
    counter++;
  }
  
  // Write image to target location
  await writeFile(targetImagePath, imageData);
  
  // Return relative path for markdown
  const relativePath = `./images/${await basename(targetImagePath)}`;
  
  return {
    path: relativePath,
    isTemporary: false,
  };
}

// Move temporary images to the markdown file's images directory
export async function moveTempImagesToMarkdownDir(
  html: string,
  markdownPath: string
): Promise<string> {
  const markdownDir = await dirname(markdownPath);
  const imagesDir = await join(markdownDir, 'images');
  
  // Create images directory if it doesn't exist
  if (!(await exists(imagesDir))) {
    await mkdir(imagesDir, { recursive: true });
  }
  
  // Find all img tags - check both src and data-original-src for temp paths
  const imgRegex = /<img([^>]*?)>/g;
  const matches = [...html.matchAll(imgRegex)];
  
  let result = html;
  for (const match of matches) {
    const [fullMatch] = match;
    
    // Extract src and data-original-src attributes
    const srcMatch = fullMatch.match(/src="([^"]+)"/);
    const dataOriginalMatch = fullMatch.match(/data-original-src="([^"]+)"/);
    
    const src = srcMatch ? srcMatch[1] : '';
    const originalSrc = dataOriginalMatch ? dataOriginalMatch[1] : src;
    
    // Check if this is a temporary path (contains temp_images)
    // Also check if it's an absolute path that's not already a relative path
    const isTempPath = originalSrc.includes('temp_images');
    const isAbsolutePathNotRelative = originalSrc.startsWith('/') && !originalSrc.startsWith('./') && !originalSrc.startsWith('../');
    
    if (isTempPath || (isAbsolutePathNotRelative && !originalSrc.includes('/images/'))) {
      try {
        // Read the temp image
        const imageData = await readFile(originalSrc);
        const imageName = await basename(originalSrc);
        
        // Generate unique filename
        let targetImagePath = await join(imagesDir, imageName);
        let counter = 1;
        while (await exists(targetImagePath)) {
          const ext = imageName.split('.').pop();
          const nameWithoutExt = imageName.substring(0, imageName.lastIndexOf('.'));
          targetImagePath = await join(imagesDir, `${nameWithoutExt}-${counter}.${ext}`);
          counter++;
        }
        
        // Copy image to target location
        await writeFile(targetImagePath, imageData);
        
        // Update the data-original-src to relative path
        const relativePath = `./images/${await basename(targetImagePath)}`;
        
        // Reconstruct img tag with updated data-original-src
        let updatedTag = fullMatch;
        if (dataOriginalMatch) {
          // Replace existing data-original-src
          updatedTag = updatedTag.replace(/data-original-src="[^"]*"/, `data-original-src="${relativePath}"`);
        } else {
          // Add data-original-src before closing >
          updatedTag = updatedTag.replace(/>$/, ` data-original-src="${relativePath}">`);
        }
        
        result = result.replace(fullMatch, updatedTag);
      } catch (error) {
        console.error(`Failed to move temp image ${originalSrc}:`, error);
      }
    }
  }
  
  return result;
}

// Convert data URLs or Tauri URLs back to file paths for markdown
// Returns relative paths when possible, absolute paths otherwise
export function imageUrlToMarkdownPath(url: string, markdownDir: string): string {
  // If it's a base64 data URL, we can't recover the original file path
  if (url.startsWith('data:')) {
    console.warn('Cannot convert base64 data URL back to file path');
    return url;
  }
  
  // If it's already a relative path, return as is
  if (url.startsWith('./') || url.startsWith('../')) {
    return url;
  }
  
  // If it's a Tauri asset URL, extract the absolute file path
  if (url.includes('asset://') || url.includes('tauri://') || url.includes('http://asset.localhost')) {
    // Extract the actual file path from the Tauri URL
    let decodedPath = url.replace(/^(asset|tauri|http):\/\/(asset\.)?localhost\//, '');
    decodedPath = decodeURIComponent(decodedPath);
    
    // Try to convert to relative path if markdownDir is provided
    if (markdownDir && decodedPath.startsWith('/')) {
      // For now, return absolute path - relative conversion would require path manipulation
      // This will be handled when saving
      return decodedPath;
    }
    
    return decodedPath;
  }
  
  // If it's an absolute path and we have markdownDir, try to make it relative
  if (url.startsWith('/') && markdownDir) {
    // This is complex - for now return absolute, will be converted during save
    return url;
  }
  
  // If it's already a path, return as is
  return url;
}

// Convert absolute file paths to relative paths
export async function convertAbsoluteToRelativePath(
  absolutePath: string,
  markdownPath: string
): Promise<string> {
  if (!markdownPath) {
    return absolutePath; // Can't convert if no markdown path
  }
  
  const markdownDir = await dirname(markdownPath);
  
  // Check if the absolute path is within the markdown directory
  if (absolutePath.startsWith(markdownDir)) {
    // Calculate relative path
    const relativePath = absolutePath.substring(markdownDir.length);
    // Normalize path separators and ensure it starts with ./
    const normalized = relativePath.replace(/\\/g, '/').replace(/^\//, './');
    return normalized.startsWith('./') ? normalized : `./${normalized}`;
  }
  
  // If it's in the images directory, return relative path
  if (absolutePath.includes('/images/')) {
    const imagesIndex = absolutePath.indexOf('/images/');
    const imageName = absolutePath.substring(imagesIndex + '/images/'.length);
    return `./images/${imageName}`;
  }
  
  // Can't convert, return absolute path
  return absolutePath;
}

// Convert markdown image paths (relative or absolute) to Tauri asset URLs or data URLs
export async function markdownPathToImageUrl(imagePath: string, markdownPath: string | null): Promise<string> {
  // If it's already a Tauri URL or data URL, return as is
  if (imagePath.includes('asset://') || imagePath.includes('tauri://') || imagePath.includes('http://asset.localhost') || imagePath.startsWith('data:')) {
    return imagePath;
  }

  // If it's a relative path, resolve it to absolute
  if (imagePath.startsWith('./') || imagePath.startsWith('../')) {
    if (!markdownPath) {
      // Can't resolve relative path without markdown path
      return imagePath;
    }
    
    const markdownDir = await dirname(markdownPath);
    const absolutePath = await join(markdownDir, imagePath.replace(/^\.\//, ''));
    
    // Convert to Tauri URL
    return convertFileSrc(absolutePath);
  }

  // If it's an absolute path, convert to Tauri URL
  if (imagePath.startsWith('/')) {
    return convertFileSrc(imagePath);
  }

  // Otherwise return as is
  return imagePath;
}
