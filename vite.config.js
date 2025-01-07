import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    emptyOutDir: false,
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        offline: resolve(__dirname, 'offline.html'),
        sender: resolve(__dirname, 'sender.html'),
        'preview/index': resolve(__dirname, 'preview/index.html'),
      },
    },
  },
});
