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
            const { regions } = data;
            logger.info(`Client subscribed to regions: ${regions.join(', ')}`);

            socket.subscribedRegions = regions;

            try {
                await this.sendRegionData(socket, regions);

                const intervalId = setInterval(async () => {
                    await this.sendRegionData(socket, regions);
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in region subscription:', error);
            }
        });
    }

    async sendRegionData(socket, regions) {
        try {
            const regionDemandData = await fetchRegionGraphs(regions);
            console.log('Hello');
            regions.forEach((region) => {
                if (regionDemandData[region]) {
                    socket.emit('regionUpdate', {
                        region,
                        graphData: regionDemandData[region],
                    });
                }
            });
        } catch (error) {
            logger.error('Error sending region data:', error);
        }
    }
}

const regionSocketHandler = new RegionSocketHandler();
export { regionSocketHandler };
