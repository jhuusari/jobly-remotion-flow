import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {resolve} from 'path';

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3300',
      '/assets': 'http://localhost:3300'
    },
    fs: {
      allow: [resolve(__dirname, '..')]
    }
  },
  resolve: {
    alias: {
      '@root': resolve(__dirname, '..')
    }
  }
});
