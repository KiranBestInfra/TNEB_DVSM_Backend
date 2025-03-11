import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import xss from 'xss-clean';
import hpp from 'hpp';
import compression from 'compression';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import cookieParser from 'cookie-parser';
import { jwtDecode } from 'jwt-decode';
import cron from 'node-cron';
import fs from 'fs';

import config from './config/config.js';
import logger from './utils/logger.js';
import errorHandler from './middlewares/errorHandler.js';
import v1Routes from './routes/v1/index.js';
import { generateBills, generateOverDueBills } from './cron_jobs/index.js';
import pool from './config/db.js';
import dashboardModel from './models/main/regions.model.js';

// import bcrypt from 'bcrypt';

// import dashboardModel from './models/dashboard.model.js';
import {
    calculateTotalAmount,
    generateInvoiceNumber,
    getDateInMDYFormat,
    isZero,
} from './utils/dashboardUtils.js';
import { getPowerDetails } from './controllers/consumer/dashboardController.js';
import { sendZeroValueAlert } from './utils/emailService.js';

const QUERY_TIMEOUT = 30000;
const app = express();

// Rate limiter configuration
// const rateLimiter = new RateLimiterMemory({
//     points: 100,
//     duration: 60,
//     blockDuration: 60 * 15,
// });

// Rate limiter middleware
// const rateLimiterMiddleware = async (req, res, next) => {
//     // if (req.path.startsWith('/api/auth/')) {
//     //     return next();
//     // }

//     try {
//         await rateLimiter.consume(req.ip);
//         next();
//     } catch (error) {
//         logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
//         res.status(429).send('Too Many Requests');
//     }
// };

// Body parsers
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
// app.use(rateLimiterMiddleware);

const extractTokenData = async (req, res, next) => {
    const accessToken = req.cookies.accessToken;
    console.log( 'accessToken', req.cookies);

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

// File access route
app.get('/static/uploads/:filename', (req, res) => {
    const { filename } = req.params;
    const filePath = `${process.cwd()}/static/uploads/${filename}`;
    
    // Log the request details
    logger.info('File access request:', {
        filename,
        filePath,
        currentDir: process.cwd(),
        fullPath: `${process.cwd()}/${filePath}`
    });

    // Check if file exists before trying to send it
   // const fs = require('fs');
    if (!fs.existsSync(filePath)) {
        logger.error('File not found:', {
            filePath,
            currentDir: process.cwd(),
            fullPath: `${process.cwd()}/${filePath}`
        });
        return res.status(404).json({
            status: 'error',
            message: 'File not found',
            path: filePath,
            details: 'The requested file does not exist in the uploads directory'
        });
    }

    res.sendFile(filePath,(err) => {
        if (err) {
            logger.error('File access error:', {
                error: err,
                filePath,
                currentDir: process.cwd(),
                fullPath: `${process.cwd()}/${filePath}`
            });
            res.status(404).json({
                status: 'error',
                message: 'File not found',
                path: filePath,
                details: err.message
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

const setupCronJobs = () => {
    cron.schedule(
        '0 1 1 * *',
        async () => {
            try {
                await generateBills(pool);
                logger.info('Monthly bills generation completed');
            } catch (error) {
                logger.error('Bills generation failed:', error);
            }
        },
        {
            timezone: 'Asia/Kolkata',
            scheduled: true,
        }
    );

    cron.schedule(
        '0 1 9 * *',
        async () => {
            try {
                await generateOverDueBills(pool);
                logger.info('Overdue bills generation completed');
            } catch (error) {
                logger.error('Overdue bills generation failed:', error);
            }
        },
        {
            timezone: 'Asia/Kolkata',
            scheduled: true,
        }
    );

    cron.schedule('*/5 * * * *', async () => {
        try {
            const [consumers] = await pool.query(
                `
            SELECT meter_serial
            FROM consumers_lkea
            WHERE block_name = 'Block-D'
            AND meter_serial != '32500115'
        `
            );
            for (const consumer of consumers) {
                const [power] = await pool.query(
                    `
                    SELECT
                        RPH_LINE_CURRENT as current,
                        YPH_LINE_CURRENT as cYPh,
                        BPH_LINE_CURRENT as cBPh,
                        RPH_VOLTAGE as voltage,
                        YPH_VOLTAGE as vYPh,
                        BPH_VOLTAGE as vBPh,
                        RPH_POWER_FACTOR as powerFactor,
                        FREQUENCY as frequency
                    FROM ntpl.d2
                    WHERE METER_SERIAL_NO = ?
                    ORDER BY METER_TIME_STAMP DESC
                    LIMIT 1
            `,
                    [consumer.meter_serial]
                );
                const [[{ last_comm_date }]] = await pool.query(
                    `
                        SELECT D3_TIME_STAMP as last_comm_date
                        FROM d3_b3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1
                    `,
                    [consumer.meter_serial]
                );
                if (power && power.length > 0) {
                    const powerData = power[0];

                    powerData.vRPh = powerData.voltage;
                    powerData.cRPh = powerData.current;

                    const zeroValues = {
                        powerFactor: isZero(powerData.powerFactor),
                        'Voltage- R': isZero(powerData.vRPh),
                        'Voltage- Y': isZero(powerData.vYPh),
                        'Voltage- B': isZero(powerData.vBPh),
                        'Current- R': isZero(powerData.cRPh),
                        'Current- Y': isZero(powerData.cYPh),
                        'Current- B': isZero(powerData.cBPh),
                    };
                    const hasZeroValues = Object.values(zeroValues).some(
                        (isZero) => isZero
                    );
                    function convertToIST(dateString) {
                        const date = new Date(dateString);

                        const year = date.getFullYear();
                        const month = String(date.getMonth() + 1).padStart(
                            2,
                            '0'
                        );
                        const day = String(date.getDate()).padStart(2, '0');
                        const hours = String(date.getHours()).padStart(2, '0');
                        const minutes = String(date.getMinutes()).padStart(
                            2,
                            '0'
                        );
                        const seconds = String(date.getSeconds()).padStart(
                            2,
                            '0'
                        );

                        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
                    }

                    if (hasZeroValues) {
                        await sendZeroValueAlert(
                            consumer.meter_serial,
                            zeroValues,
                            powerData,
                            convertToIST(last_comm_date)
                        );
                    }
                }
            }
        } catch (e) {
            console.log(e);
        }
    });
};

app.listen(config.PORT, () => {
    logger.info(`Server is running on port ${config.PORT}`);
    console.log(`Server is running on port ${config.PORT}`);

    setupCronJobs();
});

// ````````````````````````````````````````````````````````

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
