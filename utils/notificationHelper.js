const winston = require('winston');
const fs = require('fs');

// Ensure logs directory exists
if (!fs.existsSync('logs')) fs.mkdirSync('logs');

// ─── Logger ────────────────────────────────────────────────────────────────────

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ timestamp, level, message, stack }) =>
      stack
        ? `[${timestamp}] ${level.toUpperCase()}: ${message}\n${stack}`
        : `[${timestamp}] ${level.toUpperCase()}: ${message}`
    )
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// ─── FCM Payload Builders ─────────────────────────────────────────────────────

const buildFCMPayload = (token, title, body, data = {}) => ({
  token,
  notification: { title, body },
  data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  android: {
    priority: 'high',
    notification: { sound: 'default', clickAction: 'FLUTTER_NOTIFICATION_CLICK' },
  },
  apns: {
    payload: { aps: { sound: 'default', badge: 1 } },
  },
});

const buildFCMMulticastPayload = (tokens, title, body, data = {}) => ({
  tokens,
  notification: { title, body },
  data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
  android: { priority: 'high' },
});

// ─── Formatting ───────────────────────────────────────────────────────────────

/**
 * Format a Date/ISO string → "12 Jan 2025, 03:30 PM"
 */
const formatDateTime = (input) => {
  if (!input) return 'N/A';
  const d = new Date(input);
  if (isNaN(d)) return String(input);
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
};

/**
 * Format a Date/ISO string → "12 Jan 2025"
 */
const formatDate = (input) => {
  if (!input) return 'N/A';
  const d = new Date(input);
  if (isNaN(d)) return String(input);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Format number as currency — defaults to CAD (HST hint in schema)
 */
const formatCurrency = (amount, currency = 'CAD') => {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency }).format(amount);
};

// ─── Utilities ────────────────────────────────────────────────────────────────

const apiResponse = (success, message, data = null, statusCode = 200) => ({
  success,
  statusCode,
  message,
  data,
  timestamp: new Date().toISOString(),
});

const chunkArray = (arr, size = 500) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
};

module.exports = {
  logger,
  buildFCMPayload,
  buildFCMMulticastPayload,
  formatDateTime,
  formatDate,
  formatCurrency,
  apiResponse,
  chunkArray,
};
