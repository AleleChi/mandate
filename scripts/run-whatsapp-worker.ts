/**
 * STANDALONE WHATSAPP BACKGROUND WORKER FOR RENDER + NEON
 * 
 * Deployment Instructions for Render:
 * - Service Type: Background Worker
 * - Build Command: npm run build
 * - Start Command: node -r dotenv/config dist/server.cjs (or: npx tsx scripts/run-whatsapp-worker.ts)
 * - Required Env Variables:
 *   - DATABASE_URL (Neon PostgreSQL connection string)
 *   - WHATSAPP_PROVIDER (meta | twilio)
 *   - META_WHATSAPP_ACCESS_TOKEN / TWILIO_ACCOUNT_SID
 *   - META_WHATSAPP_PHONE_NUMBER_ID / TWILIO_AUTH_TOKEN
 *   - META_APP_SECRET / TWILIO_WHATSAPP_FROM
 */

import dotenv from 'dotenv';
dotenv.config();

import { getDb } from '../src/server/db';
import { processQueuedWhatsAppJobs } from '../src/server/services/whatsapp';

let isShuttingDown = false;
const POLL_INTERVAL_MS = 5000; // Poll every 5 seconds when idle

async function main() {
  console.log('====================================================');
  console.log('[WhatsApp Queue Worker] Initializing for Render + Neon...');
  console.log('====================================================');

  // Verify database connection
  getDb();
  console.log('[WhatsApp Queue Worker] Database connection established.');

  const shutdown = async (signal: string) => {
    console.log(`\n[WhatsApp Queue Worker] Received ${signal}. Gracefully stopping...`);
    isShuttingDown = true;
    setTimeout(() => {
      console.error('[WhatsApp Queue Worker] Force exiting after timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  console.log('[WhatsApp Queue Worker] Worker running. Listening for notification_jobs...');

  while (!isShuttingDown) {
    try {
      const stats = await processQueuedWhatsAppJobs({
        maxBatchSize: 20,
        rateLimitDelayMs: 60,
        staleLockTimeoutMs: 5 * 60 * 1000,
        maxAttempts: 3
      });

      if (stats.processed > 0) {
        console.log(
          `[WhatsApp Worker Batch] Processed: ${stats.processed}, ` +
          `Succeeded: ${stats.succeeded}, Failed: ${stats.failed}, Retried: ${stats.retried}`
        );
        // If we processed items, loop immediately to drain queue without sleeping
        continue;
      }
    } catch (err) {
      console.error('[WhatsApp Worker Loop Error]:', err);
    }

    // Wait before next polling cycle
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  console.log('[WhatsApp Queue Worker] Worker stopped gracefully.');
  process.exit(0);
}

main().catch(err => {
  console.error('[WhatsApp Queue Worker Fatal Error]:', err);
  process.exit(1);
});
