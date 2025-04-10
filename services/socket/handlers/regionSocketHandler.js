import logger from '../../../utils/logger.js';
import { fetchRegionGraphs } from '../../../controllers/main/regionsController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class RegionSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        socket.on('subscribe', async (data) => {
            if (!data || !data.regions || !Array.isArray(data.regions)) {
                logger.error('Invalid subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { regions: string[] }',
                });
                return;
            }

            const { regions } = data;

            if (socket.subscribedRegions) {
                const existingIntervalId = socketService.getInterval(socket.id);
                if (existingIntervalId) {
                    clearInterval(existingIntervalId);
                    socketService.clearInterval(socket.id);
                }
            }

            logger.info(`Client subscribed to regions: ${regions.join(', ')}`);
            socket.subscribedRegions = regions;

            try {
                await this.sendRegionData(socket, regions);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendRegionData(socket, regions);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in region subscription:', error);
                socket.emit('error', {
                    message: 'Error processing region subscription',
                });
            }
        });
    }

    async sendRegionData(socket, regions) {
        try {
            const regionDemandData = await fetchRegionGraphs(socket, regions);
            // regions.forEach((region) => {
            //     if (regionDemandData[region]) {
            //         socket.emit('regionUpdate', {
            //             region,
            //             graphData: regionDemandData[region],
            //         });
            //     }
            // });
        } catch (error) {
            logger.error('Error sending region data:', error);
            socket.emit('error', { message: 'Error fetching region data' });
        }
    }
}

const regionSocketHandler = new RegionSocketHandler();
export { regionSocketHandler };
