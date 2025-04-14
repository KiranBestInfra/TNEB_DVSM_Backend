import logger from '../../../utils/logger.js';
import fetchLogs from '../../../controllers/main/logsController.js';
import db from '../../../config/db.js';
import socketService from '../socketService.js';

class LogSocketHandler {
    constructor() {
        this.updateInterval = 60000; // 60 seconds
    }

    initialize(socket) {
        // Handle error logging from client
        socket.on('logError', async (data) => {
            const {
                message,
                stack,
                time,
                level = 'error',
                url,
                userAgent,
            } = data;

            if (!message || !time || !url) {
                socket.emit('error', {
                    success: false,
                    message: 'Invalid error payload',
                });
                return;
            }

            const logData = {
                message,
                stack,
                time,
                url,
                userAgent:
                    userAgent ||
                    socket.handshake.headers['user-agent'] ||
                    'Unknown',
                ip: socket.handshake.address || 'Unknown',
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

                socket.emit('logConfirmation', {
                    success: true,
                    message: 'Log stored or updated in database',
                });
            } catch (err) {
                logger.error('DB Error:', err.message);
                socket.emit('error', {
                    success: false,
                    message: 'Failed to insert log into database',
                    error: err.message,
                });
            }
        });

        // Handle subscription to logs
        socket.on('subscribeLogs', async (data) => {
            logger.info('Client subscribed to logs');

            try {
                // Send initial data
                await this.sendLogs(socket, data);

                // Set up interval for real-time updates
                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendLogs(socket, data);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in logs subscription:', error);
                socket.emit('error', {
                    message: 'Error processing logs subscription',
                });
            }
        });
    }

    async sendLogs(socket, filters = {}) {
        try {
            const logsData = await fetchLogs({ query: filters });
            socket.emit('logsUpdate', logsData);
        } catch (error) {
            logger.error('Error sending logs data:', error);
            socket.emit('error', { message: 'Error fetching logs data' });
        }
    }
}

const logSocketHandler = new LogSocketHandler();
export { logSocketHandler };
