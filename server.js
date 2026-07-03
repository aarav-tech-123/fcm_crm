require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { getPool, closePool } = require('./config/db');
const { initializeFirebase } = require('./config/firebase');
const { startAllJobs, stopAllJobs } = require('./jobs/notificationCron');
const notificationRoutes = require('./routes/notificationRoutes');
const { logger } = require('./utils/notificationHelper');

const app = express();
const PORT = process.env.PORT;

app.set("trust proxy", 1);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.ALLOWED_ORIGINS?.split(',') || '*' }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting — 100 req/15min per IP
app.use(
  '/api/notifications',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests, please try again later.' },
  })
);

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/notifications', notificationRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString(), service: 'CRM Notification Service' });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

// ─── Boot Sequence ────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await getPool();          // Connect MS SQL
    initializeFirebase();     // Init Firebase Admin
    startAllJobs();           // Start cron jobs

    const server = app.listen(PORT, () => {
      logger.info(`🚀 CRM Notification Service running on port ${PORT}`);
    });

    // ─── Graceful Shutdown ───────────────────────────────────────────────────
    const shutdown = async (signal) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      stopAllJobs();
      server.close(async () => {
        await closePool();
        logger.info('Server closed. Exiting.');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error(`Unhandled Rejection: ${reason}`);
    });

    process.on('uncaughtException', (err) => {
      logger.error(`Uncaught Exception: ${err.message}`);
      process.exit(1);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
};

startServer();
