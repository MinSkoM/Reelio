import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { handlePreproductionRequest } from './api/preproduction.js';

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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  Object.assign(process.env, env);

  return {
    plugins: [react(), tailwindcss(), preproductionDevApi()],
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
