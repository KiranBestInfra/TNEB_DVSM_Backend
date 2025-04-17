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
        socket.on('subscribe', async (data) => {
            if (!data) {
                logger.error('Invalid subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { regions: string[] }',
                });
                return;
            }

            const {
                regions,
                searchTerm,
                regionID,
                user,
                locationAccess = { values: [] },
            } = data;

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
                if (regions) {
                    await this.sendRegionData(socket, regions);
                }
                await this.sendDashboardWidgets(socket);
                await this.sendRegionStats(socket);

                if (searchTerm) {
                    await this.sendConsumerSearch(socket, {
                        term: searchTerm,
                        locationAccess,
                    });
                }

                if (regionID) {
                    await this.sendRegionDemandGraph(socket, {
                        regionID,
                        user,
                        locationAccess,
                    });
                }

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendRegionData(socket, regions);
                        await this.sendDashboardWidgets(socket);
                        await this.sendRegionStats(socket);

                        if (regionID) {
                            await this.sendRegionDemandGraph(socket, {
                                regionID,
                                user,
                                locationAccess,
                            });
                        }
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

        // socket.on('getDashboardWidgets', async () => {
        //     try {
        //         await this.sendDashboardWidgets(socket);
        //     } catch (error) {
        //         logger.error('Error fetching dashboard widgets:', error);
        //         socket.emit('error', {
        //             message: 'Error fetching dashboard widgets data',
        //         });
        //     }
        // });

        // socket.on('getRegionStats', async () => {
        //     try {
        //         await this.sendRegionStats(socket);
        //     } catch (error) {
        //         logger.error('Error fetching region stats:', error);
        //         socket.emit('error', {
        //             message: 'Error fetching region stats data',
        //         });
        //     }
        // });

        // socket.on('searchConsumers', async (data) => {
        //     try {
        //         await this.sendConsumerSearch(socket, data);
        //     } catch (error) {
        //         logger.error('Error searching consumers:', error);
        //         socket.emit('error', {
        //             message: 'Error searching consumers',
        //         });
        //     }
        // });

        // socket.on('getRegionDemandGraph', async (data) => {
        //     try {
        //         await this.sendRegionDemandGraph(socket, data);
        //     } catch (error) {
        //         logger.error('Error fetching region demand graph:', error);
        //         socket.emit('error', {
        //             message: 'Error fetching region demand graph data',
        //         });
        //     }
        // });
    }

    async sendRegionData(socket, regions) {
        try {
            await fetchRegionGraphs(socket, regions);
        } catch (error) {
            logger.error('Error sending region data:', error);
            socket.emit('error', { message: 'Error fetching region data' });
        }
    }

    async sendDashboardWidgets(socket) {
        try {
            const mockReq = { socket };
            const mockRes = {
                status: (code) => ({
                    json: (responseData) => {
                        if (code === 200) {
                            socket.emit('dashboardWidgetsData', responseData);
                        } else {
                            socket.emit('error', responseData);
                        }
                    },
                }),
            };
            await getDashboardWidgets(mockReq, mockRes);
        } catch (error) {
            logger.error('Error sending dashboard widgets:', error);
            socket.emit('error', {
                message: 'Error fetching dashboard widgets data',
            });
        }
    }

    async sendRegionStats(socket) {
        try {
            const mockReq = { socket };
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
            logger.error('Error sending region stats:', error);
            socket.emit('error', {
                message: 'Error fetching region stats data',
            });
        }
    }

    async sendConsumerSearch(socket, data) {
        try {
            const mockReq = {
                socket,
                locationAccess: data.locationAccess || { values: [] },
                query: { term: data.term || '' },
            };
            const mockRes = {
                status: (code) => ({
                    json: (responseData) => {
                        if (code === 200) {
                            socket.emit('searchConsumersResults', responseData);
                        } else {
                            socket.emit('error', responseData);
                        }
                    },
                }),
            };
            await searchConsumers(mockReq, mockRes);
        } catch (error) {
            logger.error('Error sending consumer search results:', error);
            socket.emit('error', { message: 'Error searching consumers' });
        }
    }

    async sendRegionDemandGraph(socket, data) {
        try {
            const mockReq = {
                socket,
                user: data.user || null,
                locationAccess: data.locationAccess || { values: [] },
                params: { regionID: data.regionID || null },
            };
            const mockRes = {
                status: (code) => ({
                    json: (responseData) => {
                        if (code === 200) {
                            socket.emit('regionDemandGraphData', responseData);
                        } else {
                            socket.emit('error', responseData);
                        }
                    },
                }),
            };
            await demandGraph(mockReq, mockRes);
        } catch (error) {
            logger.error('Error sending region demand graph:', error);
            socket.emit('error', {
                message: 'Error fetching region demand graph data',
            });
        }
    }
}

const regionSocketHandler = new RegionSocketHandler();
export { regionSocketHandler };
