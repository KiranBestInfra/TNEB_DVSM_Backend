import logger from '../../../utils/logger.js';
import {
    fetchSubstationGraphs,
    getSubstationWidgets,
    getEdcSubstationWidgets,
    getSubstationDemandGraphDetails,
    getFeedersDataBySubstation,
} from '../../../controllers/main/substationController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class SubstationSocketHandler {
    constructor() {
        this.updateInterval = 60000;
    }

    initialize(socket) {
        // Subscribe to substation graphs
        socket.on('subscribeSubstation', async (data) => {
            if (
                !data ||
                !data.substations ||
                !Array.isArray(data.substations)
            ) {
                logger.error('Invalid substation subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { substations: string[] }',
                });
                return;
            }

            const { substations } = data;
            if (socket.subscribedSubstations) {
                const existingIntervalId = socketService.getInterval(socket.id);
                if (existingIntervalId) {
                    clearInterval(existingIntervalId);
                    socketService.clearInterval(socket.id);
                }
            }

            logger.info(
                `Client subscribed to substations: ${substations.join(', ')}`
            );
            socket.subscribedSubstations = substations;

            try {
                await this.sendSubstationData(socket, substations);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendSubstationData(socket, substations);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in substation subscription:', error);
                socket.emit('error', {
                    message: 'Error processing substation subscription',
                });
            }
        });

        // Get substation widgets
        socket.on('getSubstationWidgets', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    params: {
                        region: data.region || '',
                        edcs: data.edcs || '',
                    },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'substationWidgetsData',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getSubstationWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching substation widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching substation widgets data',
                });
            }
        });

        // Get EDC substation widgets
        socket.on('getEdcSubstationWidgets', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    params: { edcs: data.edcID || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'edcSubstationWidgetsData',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getEdcSubstationWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching EDC substation widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching EDC substation widgets data',
                });
            }
        });

        // Get substation demand graph details
        socket.on('getSubstationDemandGraphDetails', async (data) => {
            try {
                const mockReq = {
                    locationAccess: data.locationAccess || { values: [] },
                    params: { substationID: data.substationID || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'substationDemandGraphDetails',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getSubstationDemandGraphDetails(mockReq, mockRes);
            } catch (error) {
                logger.error(
                    'Error fetching substation demand graph details:',
                    error
                );
                socket.emit('error', {
                    message: 'Error fetching substation demand graph details',
                });
            }
        });

        // Get feeders data by substation
        socket.on('getFeedersDataBySubstation', async (data) => {
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
                                    'feedersDataBySubstation',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getFeedersDataBySubstation(mockReq, mockRes);
            } catch (error) {
                logger.error(
                    'Error fetching feeders data by substation:',
                    error
                );
                socket.emit('error', {
                    message: 'Error fetching feeders data by substation',
                });
            }
        });
    }

    async sendSubstationData(socket, substations) {
        try {
            await fetchSubstationGraphs(socket, substations);
        } catch (error) {
            logger.error('Error sending substation data:', error);
            socket.emit('error', { message: 'Error fetching substation data' });
        }
    }
}

const substationSocketHandler = new SubstationSocketHandler();
export { substationSocketHandler };
