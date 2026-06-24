const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs   = require('fs');

const logDir = path.resolve('logs');

// Ensure the log directory exists before Winston tries to open files.
// On Azure App Service the working directory may not have a 'logs' folder yet.
try {
    fs.mkdirSync(logDir, { recursive: true });
} catch (e) {
    // If the filesystem is read-only (some cloud environments), fall back to
    // console-only logging — handled below.
}

const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// File transports — only added when the log directory is writable.
const fileTransports = [];
try {
    fileTransports.push(
        new winston.transports.DailyRotateFile({
            filename:    path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            level:       'error',
            maxFiles:    '14d',
        }),
        new winston.transports.DailyRotateFile({
            filename:    path.join(logDir, 'combined-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxFiles:    '14d',
        })
    );
} catch (e) {
    console.warn('[Logger] Could not create file transports — falling back to console only:', e.message);
}

const logger = winston.createLogger({
    level:       process.env.LOG_LEVEL || 'info',
    format:      logFormat,
    defaultMeta: { service: 'crafted-climate-api' },
    transports:  fileTransports,
});

// If we're not in production then also log to the console with colour + simple format.
if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
        ),
    }));
}

// Always log errors to console in production so they appear in Azure App Service logs.
if (process.env.NODE_ENV === 'production') {
    logger.add(new winston.transports.Console({
        level:  'error',
        format: winston.format.simple(),
    }));
}

module.exports = logger;
