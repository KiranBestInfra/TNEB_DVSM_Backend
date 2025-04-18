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
            if (!data || !data.regionId || !data.date) {
                logger.error('Invalid demand subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid demand subscription data. Expected { regionId: string, date: string }',
                });
                return;
            }

            const { regionId, date } = data;

            if (socket.demandIntervalId) {
                clearInterval(socket.demandIntervalId);
            }

            logger.info(
                `Client subscribed to demand updates for region: ${regionId} and date: ${date}`
            );
            socket.subscribedDemandRegion = regionId;
            socket.subscribedDemandDate = date;

            try {
                await this.sendDemandData(socket, regionId, date);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendDemandData(socket, regionId, date);
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

    async sendDemandData(socket, regionId, date) {
        try {
            const mockReq = {
                params: {},
                query: { regionId, date },
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
