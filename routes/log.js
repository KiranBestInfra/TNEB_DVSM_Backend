import express from 'express';
import logger from '../utils/logger.js';
import db from '../config/db.js'; // Using your existing pool
import fetchLogs from '../controllers/main/logsController.js';

const errorRoutes = express.Router();

// POST /log/error - Store error/warning in DB and file
errorRoutes.post('/error', async (req, res) => {
    const { message, stack, time, level = 'error', url, userAgent } = req.body;

    if (!message || !time || !url) {
        return res.status(400).json({
            success: false,
            message: 'Invalid error payload',
        });
    }

    const logData = {
        message,
        stack,
        time,
        url,
        userAgent: userAgent || req.headers['user-agent'] || 'Unknown',
        ip: req.ip || req.connection.remoteAddress || 'Unknown',
    };

    // 1. Log to file
    if (level === 'warn') {
        logger.warn(logData);
    } else {
        logger.error(logData);
    }

    // 2. Insert or update in DB
    try {
        const query = `
            INSERT INTO logs (type, message, path, user_agent, ip_address, time)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE time = CURRENT_TIMESTAMP
        `;

        await db.execute(query, [
            level,
            message,
            logData.url,
            logData.userAgent,
            logData.ip,
            new Date(time),
        ]);

        res.status(200).json({
            success: true,
            message: 'Log stored or updated in database',
        });
    } catch (err) {
        console.error('DB Error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Failed to insert log into database',
            error: err.message,
        });
    }
});
errorRoutes.get('/logs', fetchLogs);

export default errorRoutes;
