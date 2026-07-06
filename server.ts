import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import authRoutes from './src/server/routes/auth';
import parentRoutes from './src/server/routes/parent';
import mediaRoutes from './src/server/routes/media';
import { getDb } from './src/server/db';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize DB engine
  getDb();

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // API Routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/parent', parentRoutes);
  app.use('/api/media', mediaRoutes);

  // Dev seed endpoint (Development only or seed helper)
  app.post('/api/dev/seed', async (req, res) => {
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEV_SEED !== 'true') {
      return res.status(403).json({ error: 'Seed endpoint disabled in production' });
    }
    // Seed helper can be called if someone wants test accounts
    res.json({ success: true, message: 'Dev seed ready' });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
