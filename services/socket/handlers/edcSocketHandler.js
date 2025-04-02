import logger from '../../../utils/logger.js';
import { fetchEdcGraphs } from '../../../controllers/main/edcController.js';
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
                socket.emit('error', { message: 'Invalid subscription data. Expected { edcs: string[] }' });
                return;
            }

            const { edcs } = data;
            logger.info(`Client subscribed to EDCs: ${edcs.join(', ')}`);

            socket.subscribedEdcs = edcs;

            try {
                await this.sendEdcData(socket, edcs);

                const intervalId = setInterval(async () => {
                    await this.sendEdcData(socket, edcs);
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in EDC subscription:', error);
                socket.emit('error', { message: 'Error processing EDC subscription' });
            }
        });
    }

    async sendEdcData(socket, edcs) {
        try {
            const edcDemandData = await fetchEdcGraphs(edcs);
            edcs.forEach((edc) => {
                if (edcDemandData[edc]) {
                    socket.emit('edcUpdate', {
                        edc,
                        graphData: edcDemandData[edc],
                    });
                }
            });
        } catch (error) {
            logger.error('Error sending EDC data:', error);
            socket.emit('error', { message: 'Error fetching EDC data' });
        }
    }
}

const edcSocketHandler = new EdcSocketHandler();
export { edcSocketHandler }; 