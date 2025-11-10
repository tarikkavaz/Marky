import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Tauri expects a relative base path
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Split TipTap core and React integration
          if (id.includes('@tiptap/react') || id.includes('@tiptap/core') || id.includes('@tiptap/pm')) {
            return 'tiptap-core';
          }
          
          // Split TipTap starter kit
          if (id.includes('@tiptap/starter-kit')) {
            return 'tiptap-starter';
          }
          
          // Split TipTap extensions
          if (id.includes('@tiptap/extension-')) {
            return 'tiptap-extensions';
          }
          
          // Split Radix UI components
          if (id.includes('@radix-ui/')) {
            return 'radix-ui';
          }
          
          // Split Tauri APIs
          if (id.includes('@tauri-apps/')) {
            return 'tauri';
          }
          
          // Split markdown processing libraries
          if (id.includes('turndown') || id.includes('markdown-it') || id.includes('remark') || id.includes('unified')) {
            return 'markdown';
          }
          
          // Split syntax highlighting
          if (id.includes('lowlight')) {
            return 'lowlight';
          }
          
          // Split React and React DOM into vendor chunk
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
})
