import { createLogger, transports, format } from 'winston';
import path from 'path';

const logger = createLogger({
    format: format.combine(format.timestamp(), format.json()),
    transports: [
        new transports.Console(),
        new transports.File({
            filename: 'app.log',
        }),
        new transports.File({
            filename: path.join('logs', 'error.log'),
            level: 'warn',
        }),
    ],
});

export default logger;
