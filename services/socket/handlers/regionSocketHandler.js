import logger from '../../../utils/logger.js';
import {
    fetchRegionGraphs,
    getDashboardWidgets,
    getRegionStats,
    searchConsumers,
    demandGraph,
} from '../../../controllers/main/regionsController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class RegionSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        // Subscribe to region graphs
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

        // Get dashboard widgets
        socket.on('getDashboardWidgets', async () => {
            try {
                const mockReq = {};

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'dashboardWidgetsData',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getDashboardWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching dashboard widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching dashboard widgets data',
                });
            }
        });

        // Get region stats
        socket.on('getRegionStats', async () => {
            try {
                const mockReq = {};

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit('regionStatsData', responseData);
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getRegionStats(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching region stats:', error);
                socket.emit('error', {
                    message: 'Error fetching region stats data',
                });
            }
        });

        // Search consumers
        socket.on('searchConsumers', async (data) => {
            try {
                const mockReq = {
                    locationAccess: data.locationAccess || { values: [] },
                    query: { term: data.term || '' },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'searchConsumersResults',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await searchConsumers(mockReq, mockRes);
            } catch (error) {
                logger.error('Error searching consumers:', error);
                socket.emit('error', {
                    message: 'Error searching consumers',
                });
            }
        });

        // Get demand graph
        socket.on('getRegionDemandGraph', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    locationAccess: data.locationAccess || { values: [] },
                    params: { regionID: data.regionID || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'regionDemandGraphData',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await demandGraph(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching region demand graph:', error);
                socket.emit('error', {
                    message: 'Error fetching region demand graph data',
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
