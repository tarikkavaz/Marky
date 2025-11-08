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
    chunkSizeWarningLimit: 1000,
    // Temporarily removed manualChunks to test if it's causing production issues
    // rollupOptions: {
    //   output: {
    //     manualChunks: {
    //       'tiptap': [
    //         '@tiptap/react',
    //         '@tiptap/starter-kit',
    //         '@tiptap/core',
    //       ],
    //       'tiptap-extensions': [
    //         '@tiptap/extension-code-block-lowlight',
    //         '@tiptap/extension-image',
    //         '@tiptap/extension-link',
    //         '@tiptap/extension-placeholder',
    //         '@tiptap/extension-table',
    //         '@tiptap/extension-table-cell',
    //         '@tiptap/extension-table-header',
    //         '@tiptap/extension-table-row',
    //         '@tiptap/extension-typography',
    //         '@tiptap/extension-underline',
    //       ],
    //     },
    //   },
    // },
  },
})
