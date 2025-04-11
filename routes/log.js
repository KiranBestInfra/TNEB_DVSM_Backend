import express from 'express';
import logger from '../utils/logger.js';

const errorRoutes = express.Router();

errorRoutes.post('/error', (req, res) => {
    const { message, stack, time } = req.body;

    if (!message || !time) {
        return res
            .status(400)
            .json({ success: false, message: 'Invalid error payload' });
    }

    logger.error({ message, stack });

    res.status(200).json({
        success: true,
        message: 'Error logged successfully',
    });
});

export default errorRoutes;
