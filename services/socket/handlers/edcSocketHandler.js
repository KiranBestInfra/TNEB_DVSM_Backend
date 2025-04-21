import logger from '../../../utils/logger.js';
import {
    fetchEdcGraphs,
    getEDCWidgets,
    getSubstationTotalWidgets,
    getEdcDemandGraphDetails,
} from '../../../controllers/main/edcsController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class EdcSocketHandler {
    constructor() {
        this.updateInterval = 30000;
    }

    initialize(socket) {
        socket.on('subscribeEdc', async (data) => {
            if (!data || !data.edcs || !Array.isArray(data.edcs)) {
                logger.error('Invalid EDC subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { edcs: string[] }',
                });
                return;
            }

            const { edcs } = data;

            if (socket.subscribedEdcs) {
                const existingIntervalId = socketService.getInterval(socket.id);
                if (existingIntervalId) {
                    clearInterval(existingIntervalId);
                    socketService.clearInterval(socket.id);
                }
            }

            logger.info(`Client subscribed to EDCs: ${edcs.join(', ')}`);
            socket.subscribedEdcs = edcs;

            try {
                await this.sendEdcData(socket, edcs);

                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendEdcData(socket, edcs);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in EDC subscription:', error);
                socket.emit('error', {
                    message: 'Error processing EDC subscription',
                });
            }
        });

        socket.on('getEdcWidgets', async (data) => {
            try {
                const mockReq = {
                    user: data.user || null,
                    params: { region: data.region || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit('edcWidgetsData', responseData);
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getEDCWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching EDC widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching EDC widgets data',
                });
            }
        });

        socket.on('getSubstationTotalWidgets', async (data) => {
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
                                    'substationTotalWidgetsData',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getSubstationTotalWidgets(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching substation total widgets:', error);
                socket.emit('error', {
                    message: 'Error fetching substation total widgets data',
                });
            }
        });

        socket.on('getEdcDemandGraphDetails', async (data) => {
            try {
                const mockReq = {
                    locationAccess: data.locationAccess || { values: [] },
                    params: { edcID: data.edcID || null },
                };

                const mockRes = {
                    status: (code) => ({
                        json: (responseData) => {
                            if (code === 200) {
                                socket.emit(
                                    'edcDemandGraphDetails',
                                    responseData
                                );
                            } else {
                                socket.emit('error', responseData);
                            }
                        },
                    }),
                };

                await getEdcDemandGraphDetails(mockReq, mockRes);
            } catch (error) {
                logger.error('Error fetching EDC demand graph details:', error);
                socket.emit('error', {
                    message: 'Error fetching EDC demand graph details',
                });
            }
        });
    }

    async sendEdcData(socket, edcs) {
        try {
            await fetchEdcGraphs(socket, edcs);
        } catch (error) {
            logger.error('Error sending EDC data:', error);
            socket.emit('error', { message: 'Error fetching EDC data' });
        }
    }
}

const edcSocketHandler = new EdcSocketHandler();
export { edcSocketHandler };
