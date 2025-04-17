import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { jwtDecode } from 'jwt-decode';
import { createServer } from 'node:http';
import fs from 'node:fs';

import config from './config/config.js';
import logger from './utils/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import v1Routes from './routes/v1/index.js';
import pool from './config/db.js';
import socketService from './services/socket/socketService.js';
import { generateDeviceFingerprint } from './utils/deviceFingerprint.js';

import User from './models/main/user.model.js';

const app = express();
const server = createServer(app);
socketService.initialize(server);

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        dnsPrefetchControl: true,
        frameguard: { action: 'deny' },
        hidePoweredBy: true,
        hsts: true,
        ieNoOpen: true,
        noSniff: true,
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xssFilter: true,
    })
);

const corsOptions = {
    origin: [
        'http://localhost:5173',
        'https://lk-ea.co.in',
        'http://lk-ea.co.in',
    ],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
    maxAge: 86400,
    exposedHeaders: ['X-Total-Count', 'X-RateLimit-Remaining'],
};
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(xss());
app.use(hpp());
app.use(compression());

const extractTokenData = async (req, res, next) => {
    if (req.path.includes('/auth')) {
        return next();
    }

    try {
        const accessToken = req.cookies.refreshToken;
        if (!accessToken) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        const decoded = jwtDecode(accessToken, config.JWT_SECRET);
        const userId = decoded.userId;

        const clientIP =
            req.ip ||
            req.connection.remoteAddress ||
            req.socket.remoteAddress ||
            req.headers['x-forwarded-for']?.split(',')[0];

        const deviceFingerprint = generateDeviceFingerprint(req);

        if (decoded.dfp && deviceFingerprint.substring(0, 16) !== decoded.dfp) {
            console.log(
                'Device fingerprint mismatch',
                decoded.dfp,
                deviceFingerprint.substring(0, 16)
            );
            return res.status(401).json({
                message:
                    'Session invalid. Access from different device detected.',
            });
        }

        if (
            decoded.ip &&
            decoded.ip !== clientIP &&
            (!decoded.dfp || decoded.dfp !== deviceFingerprint.substring(0, 16))
        ) {
            return res.status(401).json({
                message:
                    'Session invalid. Access from different location detected.',
            });
        }

        const isValidToken = await User.verifyRefreshToken(
            pool,
            userId,
            accessToken,
            clientIP,
            deviceFingerprint
        );

        if (!isValidToken) {
            return res
                .status(401)
                .json({ message: 'Invalid session. Please login again.' });
        }

        if (decoded.role && decoded.role.toLowerCase().includes('admin')) {
            return next();
        } else {
            req.user = decoded;
        }
    } catch (error) {
        if (
            error.code === 'ECONNRESET' ||
            error.code === 'PROTOCOL_CONNECTION_LOST'
        ) {
            logger.error(
                'Database connection error during token verification:',
                error
            );
            return res.status(503).json({
                message:
                    'Service temporarily unavailable. Please try again later.',
                error: 'DB_CONNECTION_ERROR',
            });
        }

        logger.error('Token/Location access error:', error);
        return res.status(401).json({ message: 'Unauthorized' });
    }

    next();
};

const apiKeyAuth = (req, res, next) => {
    if (req.path.includes('/auth') || req.path === '/health') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];

    if (!apiKey) {
        return res.status(401).json({
            status: 'error',
            message: 'API key is missing',
        });
    }

    if (apiKey !== config.API_KEY) {
        logger.warn('Invalid API key attempt', {
            ip: req.ip,
            apiKey: apiKey,
            timestamp: new Date().toISOString(),
        });

        return res.status(401).json({
            status: 'error',
            message: 'Invalid API key',
        });
    }

    next();
};

app.use(extractTokenData);
app.use(apiKeyAuth);

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
        timestamp: new Date().toISOString(),
    });
    next();
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version,
    });
});

app.use(`/api/${config.API_VERSION}`, v1Routes);

app.get('/static/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = `${process.cwd()}/static/uploads/${filename}`;

    logger.info('File access request:', {
        filename,
        filePath,
        currentDir: process.cwd(),
        fullPath: `${process.cwd()}/${filePath}`,
    });

    if (!fs.existsSync(filePath)) {
        logger.error('File not found:', {
            filePath,
            currentDir: process.cwd(),
            fullPath: `${process.cwd()}/${filePath}`,
        });
        return res.status(404).json({
            status: 'error',
            message: 'File not found',
            path: filePath,
            details:
                'The requested file does not exist in the uploads directory',
        });
    }

    res.sendFile(filePath, (err) => {
        if (err) {
            logger.error('File access error:', {
                error: err,
                filePath,
                currentDir: process.cwd(),
                fullPath: `${process.cwd()}/${filePath}`,
            });
            res.status(404).json({
                status: 'error',
                message: 'File not found',
                path: filePath,
                details: err.message,
            });
        }
    });
});

app.use(errorHandler);

app.use((req, res) => {
    res.status(404).json({
        status: 'error',
        message: 'Route not found',
        path: req.originalUrl,
    });
});

server.listen(config.SOCKET_PORT, () => {
    logger.info(`Socket server is running on port ${config.SOCKET_PORT}`);
    console.log(`Socket server is running on port ${config.SOCKET_PORT}`);
});

app.listen(config.PORT, () => {
    logger.info(`Server is running on port ${config.PORT}`);
    console.log(`Server is running on port ${config.PORT}`);
});

// const passworGenerator = async () => {
//     const excludeIDs = [2, 3, 304, 305, 306];
//      try {
//          const [users] = await pool.query(
//              `
//            SELECT name
//              FROM users
//              WHERE id NOT IN (?)
//          `,
//              [excludeIDs]
//          );
//          for (let user of users) {
//              let ou = user.name;
//              let u = user.name + '@bi';
//             const salt = await bcrypt.genSalt(12);
//            const passwordHash = await bcrypt.hash(u, salt);
//              console.log(u, passwordHash);
//              await pool.query(
//                  `
//                  UPDATE users
//                  SET password = ?
//                  WHERE name = ?
//              `,
//                  [passwordHash, ou]
//              );
//          }
//      } catch (e) {
//          console.log(e);
//      }
//  };
