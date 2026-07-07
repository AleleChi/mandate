import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import authRoutes from './src/server/routes/auth';
import parentRoutes from './src/server/routes/parent';
import mediaRoutes from './src/server/routes/media';
import adminRoutes from './src/server/routes/admin';
import jobsRoutes from './src/server/routes/jobs';
import notificationsRoutes from './src/server/routes/notifications';
import webhooksRoutes from './src/server/routes/webhooks';
import volunteerRoutes from './src/server/routes/volunteer';
import { getDb } from './src/server/db';
import { processPendingNotifications } from './src/server/services/notifications';
import { authMiddleware, AuthenticatedRequest } from './src/server/auth';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Initialize DB engine
  getDb();

  app.use(express.json({ limit: '20mb' }));
  app.use(express.urlencoded({ extended: true, limit: '20mb' }));

  // CORS middleware supporting CORS_ORIGIN and APP_BASE_URL
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    const allowedOrigin = process.env.CORS_ORIGIN || process.env.APP_BASE_URL;
    if (allowedOrigin) {
      if (allowedOrigin === '*' || origin === allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
      } else {
        // Fallback: if not matched but in development, allow it
        if (process.env.NODE_ENV !== 'production') {
          res.setHeader('Access-Control-Allow-Origin', origin || '*');
        } else {
          res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
        }
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // API Routes FIRST
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);

  app.get('/api/me/access', authMiddleware, async (req: AuthenticatedRequest, res) => {
    try {
      const isProfileComplete = (p: any): boolean => {
        if (!p) return false;
        if (!p.full_name || !p.full_name.trim()) return false;
        if (!p.email || !p.email.trim()) return false;
        if (!p.phone_number || !p.phone_number.trim()) return false;
        if (!p.whatsapp_number || !p.whatsapp_number.trim()) return false;
        if (!p.home_address || !p.home_address.trim()) return false;
        if (!p.country || !p.country.trim()) return false;
        if (!p.state_region || !p.state_region.trim()) return false;
        if (!p.city || !p.city.trim()) return false;
        if (!p.preferred_contact || !p.preferred_contact.trim()) return false;
        if (!p.photo_file_id || !p.photo_file_id.trim()) return false;
        if (p.is_koinonia_worker && (!p.department || !p.department.trim())) return false;
        return true;
      };

      res.json({
        user: req.user,
        access: {
          parent: {
            exists: !!req.parentProfile,
            status: req.parentProfile ? "active" : null,
            profileComplete: isProfileComplete(req.parentProfile)
          },
          volunteer: {
            exists: !!req.volunteerProfile,
            status: req.volunteerProfile ? req.volunteerProfile.status : null,
            preferredTeam: req.volunteerProfile ? req.volunteerProfile.preferred_team : null
          }
        }
      });
    } catch (err) {
      console.error('Error in /api/me/access:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use('/api/parent', parentRoutes);
  app.use('/api/media', mediaRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/jobs', jobsRoutes);
  app.use('/api/notifications', notificationsRoutes);
  app.use('/api/webhooks', webhooksRoutes);
  app.use('/api/volunteer', volunteerRoutes);

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

    // Periodically process scheduled parent notification rules (emails, in-app notifications, and WhatsApp mockups)
    setInterval(async () => {
      try {
        await processPendingNotifications('event-ga-2026');
      } catch (err) {
        console.error('[Background Scheduler] Error processing notifications:', err);
      }
    }, 60000); // run every 60 seconds
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
});
