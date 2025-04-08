import logger from '../../../utils/logger.js';
import { fetchSubstationGraphs } from '../../../controllers/main/substationController.js';
import socketService from '../socketService.js';
import pool from '../../../config/db.js';

class SubstationSocketHandler {
    constructor() {
        this.updateInterval = 600000;
    }

    initialize(socket) {
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
    }

    async sendSubstationData(socket, substations) {
        try {
            await fetchSubstationGraphs(socket, substations);
            //console.log(substationDemandData);

            // substations.forEach((substation) => {
            //     if (substationDemandData[substation]) {
            //         socket.emit('substationUpdate', {
            //             substation,
            //             graphData: substationDemandData[substation],
            //         });
            //     }
            // });
        } catch (error) {
            logger.error('Error sending substation data:', error);
            socket.emit('error', { message: 'Error fetching substation data' });
        }
    }
}

const substationSocketHandler = new SubstationSocketHandler();
export { substationSocketHandler };
