import express from 'express';
import { createServer as createViteServer } from 'vite';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRouter from './server/api';
import { getEdcIndex } from './server/edcIndex';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // API router
  app.use('/api', apiRouter);

  // Serve frontend.
  // Default: serve the built app from ./dist (fast, no file watching, no auto-reloads).
  // Development: `npm run dev` starts Vite with hot reload (and never watches ./data).
  const distPath = path.resolve(__dirname, 'dist');
  const wantsDev = process.argv.includes('--dev') || process.env.NODE_ENV === 'development';
  const hasBuild = fs.existsSync(path.join(distPath, 'index.html'));
  const serveBuilt = !wantsDev && (process.env.NODE_ENV === 'production' || hasBuild);

  if (!wantsDev && !hasBuild) {
    console.log('[Pace IT] No build found in ./dist - starting in development mode. Run "npm run build" for the fast production mode.');
  }

  if (serveBuilt) {
    console.log('[Pace IT] Serving the built app from ./dist (run "npm run build" after code changes).');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // The database lives in ./data and changes on every save - it must not trigger reloads.
        watch: { ignored: ['**/data/**', '**/*.sqlite*', '**/dist/**'] },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Pace IT] Running locally at http://localhost:${PORT}`);
    console.log(`[Pace IT] Office Network URL: http://0.0.0.0:${PORT}`);
    // Load the EDC workbook now so the first Form Maker lookup is instant.
    setTimeout(() => { try { getEdcIndex(); } catch (e) { console.error(e); } }, 50);
  });
}

startServer().catch((err) => {
  console.error('[Pace IT] Failed to start server:', err);
  process.exit(1);
});
