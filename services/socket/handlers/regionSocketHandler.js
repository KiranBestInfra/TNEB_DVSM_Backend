import logger from '../../../utils/logger.js';
import {
    fetchRegionGraphs,
    getDashboardWidgets,
    getRegionStats,
    searchConsumers,
    demandGraph,
} from '../../../controllers/main/regionsController.js';
import socketService from '../socketService.js';

class RegionSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        socket.on('subscribe', async (data) => {
            if (!data) {
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
            await fetchRegionGraphs(socket, regions);
        } catch (error) {
            logger.error('Error sending region data:', error);
            socket.emit('error', { message: 'Error fetching region data' });
        }
    }
}

const regionSocketHandler = new RegionSocketHandler();
export { regionSocketHandler };
