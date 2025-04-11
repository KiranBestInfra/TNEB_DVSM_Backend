import express from 'express';
import logger from '../utils/logger.js';

const errorRoutes = express.Router();

errorRoutes.post('/error', (req, res) => {
    const { message, stack, time, level = 'error', url, userAgent } = req.body;

    if (!message || !time) {
        return res.status(400).json({
            success: false,
            message: 'Invalid error payload',
        });
    }

    const logData = {
        message,
        stack,
        time,
        url: url || req.headers.referer || 'Unknown',
        userAgent: userAgent || req.headers['user-agent'],
        ip: req.ip,
    };

    if (level === 'warn') {
        logger.warn(logData);
    } else {
        logger.error(logData);
    }

    res.status(200).json({
        success: true,
        message: 'Log received successfully',
    });
});

export default errorRoutes;
