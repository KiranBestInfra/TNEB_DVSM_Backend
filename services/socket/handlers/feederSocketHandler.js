import logger from '../../../utils/logger.js';
import { fetchFeederGraphs } from '../../../controllers/main/feederController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class FeederSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        socket.on('subscribeFeeder', async (data) => {
            if (!data || !data.feeders || !Array.isArray(data.feeders)) {
                logger.error('Invalid feeder subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { feeders: string[] }',
                });
                return;
            }

            const { feeders } = data;

            if (socket.subscribeFeeder) {
                const existingIntervalId = socketService.getInterval(socket.id);
                if (existingIntervalId) {
                    clearInterval(existingIntervalId);
                    socketService.clearInterval(socket.id);
                }
            }

            logger.info(`Client subscribed to feeders: ${feeders.join(', ')}`);
            socket.subscribeFeeder = feeders;

            try {
                await this.sendFeederData(socket, feeders);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendFeederData(socket, feeders);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in feeder subscription:', error);
                socket.emit('error', {
                    message: 'Error processing feeder subscription',
                });
            }
        });
    }

    async sendFeederData(socket, feeders) {
        try {
            await fetchFeederGraphs(socket, feeders);
            // console.log('feederDemandData', feederDemandData);
            // feeders.forEach((feeder) => {
            //     if (feederDemandData[feeder]) {
            //         socket.emit('feederUpdate', {
            //             feeder,
            //             graphData: feederDemandData[feeder],
            //         });
            //     }
            // });
        } catch (error) {
            logger.error('Error sending feeder data:', error);
            socket.emit('error', { message: 'Error fetching feeder data' });
        }
    }
}

const feederSocketHandler = new FeederSocketHandler();
export { feederSocketHandler };
