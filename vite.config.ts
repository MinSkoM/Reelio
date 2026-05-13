import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { handlePreproductionRequest } from './api/preproduction.js';
import { handleConvertVideoRequest } from './api/convert-video.js';

async function readBinaryBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function preproductionDevApi() {
  return {
    name: 'preproduction-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/preproduction', async (req, res) => {
        if (!req.url) return;

        try {
          const url = new URL(req.url, 'http://localhost');
          const body = req.method === 'POST' ? await readJsonBody(req) : {};
          const query = Object.fromEntries(url.searchParams.entries());
          const result = await handlePreproductionRequest({
            method: req.method || 'GET',
            body,
            query,
          });

          res.statusCode = result.status;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(result.body));
        } catch (error) {
          console.error('Local /api/preproduction error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unexpected local API error.',
          }));
        }
      });
    },
  };
}


function convertVideoDevApi() {
  return {
    name: 'convert-video-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/convert-video', async (req, res) => {
        if (!req.url) return;

        try {
          const url = new URL(req.url, 'http://localhost');
          const bodyBuffer = req.method === 'POST' ? await readBinaryBody(req) : Buffer.alloc(0);
          const query = Object.fromEntries(url.searchParams.entries());
          const result = await handleConvertVideoRequest({
            method: req.method || 'POST',
            bodyBuffer,
            query,
          });

          res.statusCode = result.status;
          Object.entries(result.headers || {}).forEach(([key, value]) => {
            res.setHeader(key, value);
          });
          res.end(result.body);
        } catch (error) {
          console.error('Local /api/convert-video error:', error);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unexpected local conversion error.',
          }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), tailwindcss(), preproductionDevApi(), convertVideoDevApi()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
