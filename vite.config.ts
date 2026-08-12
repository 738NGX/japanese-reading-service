import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { createApiResponse } from './server/convert';

function convertApi(): Plugin {
  return {
    name: 'convert-api',
    configureServer(server) {
      server.middlewares.use('/api/convert', (request, response, next) => {
        if (request.method !== 'GET') return next();
        const apiResponse = createApiResponse(request.url ?? '/api/convert');
        response.statusCode = apiResponse.status;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.setHeader('Cache-Control', apiResponse.cacheControl);
        response.end(JSON.stringify(apiResponse.body));
      });
    },
  };
}

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), convertApi()],
  resolve: { alias: { '@': root } },
  build: { target: 'node20' },
});
