import { createLogger, transports, format } from 'winston';

const logger = createLogger({
    format: format.combine(format.timestamp(), format.json()),
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'app.log' }),
    ],
});

export default logger;
