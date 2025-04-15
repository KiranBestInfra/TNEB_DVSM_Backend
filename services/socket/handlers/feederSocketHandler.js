import logger from '../../../utils/logger.js';
import {
    fetchFeederGraphs,
    getFeedersDataByRegion,
    getFeedersNamesByEdcNameHandler,
    getFeedersWidgets,
    getFeedersBySubstationName,
    demandGraph,
} from '../../../controllers/main/feederController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class FeederSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        // Subscribe to feeder graphs
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

        // Get feeders data by region
        socket.on('getFeedersDataByRegion', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    params: { region: data.region || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'feedersDataByRegion',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getFeedersDataByRegion(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching feeders data by region:', error);
                socket.emit('error', {
                    message: 'Error fetching feeders data by region',
                });
            }
        });

        // Get feeders names by EDC name
        socket.on('getFeedersNamesByEdcName', async (data) => {
            try {
                const mockReq = {
                    params: { edc: data.edc || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'feedersNamesByEdcName',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getFeedersNamesByEdcNameHandler(mockReq, mockRes);
            } catch (error) {
                logger.error(
                    'Error fetching feeders names by EDC name:',
                    error
                );
                socket.emit('error', {
                    message: 'Error fetching feeders names by EDC name',
                });
            }
        });

        // Get feeders widgets
        socket.on('getFeedersWidgets', async (data) => {
            try {
                const mockReq = {};

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit('feedersWidgetsData', responseData);
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getFeedersWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching feeders widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching feeders widgets data',
                });
            }
        });

        // Get feeders by substation name
        socket.on('getFeedersBySubstationName', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    params: { substationId: data.substationId || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'feedersBySubstationName',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getFeedersBySubstationName(mockReq, mockRes);
            } catch (error) {
                logger.error(
                    'Error fetching feeders by substation name:',
                    error
                );
                socket.emit('error', {
                    message: 'Error fetching feeders by substation name',
                });
            }
        });

        // Get demand graph
        socket.on('getDemandGraph', async (data) => {
            try {
                const mockReq = {
                    params: data.params || {},
                    query: data.query || {},
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit('demandGraphData', responseData);
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await demandGraph(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching demand graph:', error);
                socket.emit('error', {
                    message: 'Error fetching demand graph data',
                });
            }
        });
    }

    async sendFeederData(socket, feeders) {
        try {
            await fetchFeederGraphs(socket, feeders);
        } catch (error) {
            logger.error('Error sending feeder data:', error);
            socket.emit('error', { message: 'Error fetching feeder data' });
        }
    }
}

const feederSocketHandler = new FeederSocketHandler();
export { feederSocketHandler };
