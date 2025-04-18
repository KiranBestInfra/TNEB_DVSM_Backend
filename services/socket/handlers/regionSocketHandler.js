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
        this.updateInterval = 900000;
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

        socket.on('subscribeDemand', async (data) => {
            if (!data || !data.regionId) {
                logger.error('Invalid demand subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid demand subscription data. Expected { regionId: string }',
                });
                return;
            }

            const { regionId } = data;

            if (socket.demandIntervalId) {
                clearInterval(socket.demandIntervalId);
            }

            logger.info(
                `Client subscribed to demand updates for region: ${regionId}`
            );
            socket.subscribedDemandRegion = regionId;

            try {
                await this.sendDemandData(socket, regionId);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendDemandData(socket, regionId);
                    }
                }, this.updateInterval);

                socket.demandIntervalId = intervalId;
            } catch (error) {
                logger.error('Error in demand subscription:', error);
                socket.emit('error', {
                    message: 'Error processing demand subscription',
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

    async sendDemandData(socket, regionId) {
        try {
            const mockReq = {
                params: {},
                user: null,
                locationAccess: { values: [] },
            };
            const mockRes = {
                status: () => mockRes,
                json: (data) => {
                    if (data.status === 'success') {
                        socket.emit('demandUpdate', data.data);
                    } else {
                        socket.emit('error', { message: data.message });
                    }
                },
            };

            await demandGraph(mockReq, mockRes);
        } catch (error) {
            logger.error('Error sending demand data:', error);
            socket.emit('error', { message: 'Error fetching demand data' });
        }
    }
}

const regionSocketHandler = new RegionSocketHandler();
export { regionSocketHandler };
