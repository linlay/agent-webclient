import { defineConfig } from 'vite';

const target = process.env.AGENT_API_TARGET || 'http://127.0.0.1:11949';
const port = Number(process.env.PORT || 11948);

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port,
    proxy: {
      '/api/ap': {
        target,
        changeOrigin: true
      }
    }
  },
  preview: {
    host: '0.0.0.0',
    port: Number(process.env.PREVIEW_PORT || 4173)
  }
});
