import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiResponse } from './convert';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const staticDirectory = path.resolve(currentDirectory, '../dist');
const mimeTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
};
const port = Number.parseInt(process.env.PORT ?? '4317', 10);
const host = process.env.HOST ?? '0.0.0.0';
const basePath = '/japanese-reading-service';

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  // Support both Nginx proxy_pass forms: one that removes the location prefix
  // and one that forwards it unchanged.
  const pathname = url.pathname === basePath || url.pathname.startsWith(`${basePath}/`)
    ? url.pathname.slice(basePath.length) || '/'
    : url.pathname;
  const requestPath = `${pathname}${url.search}`;

  if (request.method === 'GET' && pathname === '/api/convert') {
    const apiResponse = createApiResponse(requestPath);
    response.writeHead(apiResponse.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': apiResponse.cacheControl });
    response.end(JSON.stringify(apiResponse.body));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const requestedFile = path.resolve(staticDirectory, relativePath);
  const isStaticFile = requestedFile === staticDirectory || requestedFile.startsWith(`${staticDirectory}${path.sep}`);
  const filePath = isStaticFile ? requestedFile : path.join(staticDirectory, 'index.html');
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] ?? 'application/octet-stream' });
    if (request.method === 'GET') response.end(content); else response.end();
  } catch {
    const fallback = await readFile(path.join(staticDirectory, 'index.html'));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    if (request.method === 'GET') response.end(fallback); else response.end();
  }
});

server.listen(port, host, () => console.log(`Japanese reading service listening on http://${host}:${port}`));
