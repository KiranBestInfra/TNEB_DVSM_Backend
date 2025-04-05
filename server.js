import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { jwtDecode } from 'jwt-decode';
import { createServer } from 'node:http';

import config from './config/config.js';
import logger from './utils/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import v1Routes from './routes/v1/index.js';
import pool from './config/db.js';
import dashboardModel from './models/main/regions.model.js';
import socketService from './services/socket/socketService.js';

// import bcrypt from 'bcrypt';

// import dashboardModel from './models/dashboard.model.js';
import {
    calculateTotalAmount,
    generateInvoiceNumber,
    getDateInMDYFormat,
    isLoadImbalance,
    isLowPowerFactor,
    isLowVoltage,
    isNegative,
    isZero,
} from './utils/dashboardUtils.js';
import { getPowerDetails } from './controllers/consumer/dashboardController.js';
import { sendZeroValueAlert } from './utils/emailService.js';
import notificationsModel from './models/main/notifications.model.js';

const QUERY_TIMEOUT = 30000;
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
    const accessToken = req.cookies.accessToken;
    console.log('accessToken', req.cookies);

    if (!accessToken) {
        return next();
    }

    try {
        const decoded = jwtDecode(accessToken);
        req.user = decoded;
        if (decoded.locationHierarchy) {
            const access = await dashboardModel.getLocationAccessCondition(
                pool,
                decoded
            );
            req.locationAccess = access;
        } else if (!decoded.locationHierarchy && decoded.user == 'User') {
            req.user = decoded;
        }
    } catch (error) {
        logger.error('Token/Location access error:', error);
    }

    next();
};

app.use(extractTokenData);

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

// Start the server
server.listen(config.SOCKET_PORT, () => {
    console.log('Server running on port:', config.PORT);
});

app.listen(config.PORT, () => {
    console.log('Running on port: ', config.SOCKET_PORT);
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
