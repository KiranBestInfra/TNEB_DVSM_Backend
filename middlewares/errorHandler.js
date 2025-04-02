import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) =>  {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
    });
    res.status(500).json({
        status: 'error',
        message: 'Internal server error',
    });
};

export default errorHandler;
    