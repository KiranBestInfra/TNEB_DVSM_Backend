import logger from '../../../utils/logger.js';
import {
    getAllTickets,
    getTicketById,
    createTicket,
    updateTicketStatus,
    deleteTicket,
} from '../../../controllers/main/ticketController.js';
import socketService from '../socketService.js';

class TicketSocketHandler {
    constructor() {
        this.updateInterval = 30000; // 30 seconds
    }

    initialize(socket) {
        // Handle subscription to all tickets
        socket.on('subscribeToTickets', async () => {
            logger.info('Client subscribed to all tickets');

            try {
                // Send initial data
                await this.sendAllTickets(socket);

                // Set up interval for real-time updates
                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendAllTickets(socket);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error('Error in ticket subscription:', error);
                socket.emit('error', {
                    message: 'Error processing ticket subscription',
                });
            }
        });

        // Handle subscription to a specific ticket
        socket.on('subscribeToTicket', async (data) => {
            if (!data || !data.ticketId) {
                logger.error('Invalid ticket subscription data received');
                socket.emit('error', {
                    message:
                        'Invalid subscription data. Expected { ticketId: string }',
                });
                return;
            }

            const { ticketId } = data;
            logger.info(`Client subscribed to ticket: ${ticketId}`);

            try {
                // Send initial data
                await this.sendTicketById(socket, ticketId);

                // Set up interval for real-time updates
                const intervalId = setInterval(async () => {
                    if (socket.connected) {
                        await this.sendTicketById(socket, ticketId);
                    }
                }, this.updateInterval);

                socketService.storeInterval(socket.id, intervalId);
            } catch (error) {
                logger.error(
                    `Error in ticket subscription for ID ${ticketId}:`,
                    error
                );
                socket.emit('error', {
                    message: 'Error processing ticket subscription',
                });
            }
        });

        // Handle ticket creation
        socket.on('createTicket', async (data) => {
            try {
                const result = await createTicket({ body: data });
                socket.emit('ticketCreated', result);

                // Notify all connected clients about the new ticket
                socket.broadcast.emit('ticketUpdated', {
                    action: 'created',
                    ticket: result,
                });
            } catch (error) {
                logger.error('Error creating ticket:', error);
                socket.emit('error', {
                    message: 'Error creating ticket',
                });
            }
        });

        // Handle ticket status update
        socket.on('updateTicketStatus', async (data) => {
            if (!data || !data.ticketId) {
                socket.emit('error', {
                    message:
                        'Invalid update data. Expected { ticketId: string, status: string }',
                });
                return;
            }

            try {
                const result = await updateTicketStatus({
                    params: { TicketId: data.ticketId },
                    body: data,
                });
                socket.emit('ticketUpdated', result);

                // Notify all connected clients about the status update
                socket.broadcast.emit('ticketUpdated', {
                    action: 'updated',
                    ticket: result,
                });
            } catch (error) {
                logger.error('Error updating ticket:', error);
                socket.emit('error', {
                    message: 'Error updating ticket',
                });
            }
        });

        // Handle ticket deletion
        socket.on('deleteTicket', async (data) => {
            if (!data || !data.ticketId) {
                socket.emit('error', {
                    message:
                        'Invalid deletion data. Expected { ticketId: string }',
                });
                return;
            }

            try {
                const result = await deleteTicket({
                    params: { TicketId: data.ticketId },
                });
                socket.emit('ticketDeleted', result);

                // Notify all connected clients about the deletion
                socket.broadcast.emit('ticketUpdated', {
                    action: 'deleted',
                    ticketId: data.ticketId,
                });
            } catch (error) {
                logger.error('Error deleting ticket:', error);
                socket.emit('error', {
                    message: 'Error deleting ticket',
                });
            }
        });
    }

    async sendAllTickets(socket) {
        try {
            const ticketsData = await getAllTickets({ query: {} });
            socket.emit('ticketsUpdate', ticketsData);
        } catch (error) {
            logger.error('Error sending all tickets data:', error);
            socket.emit('error', { message: 'Error fetching tickets data' });
        }
    }

    async sendTicketById(socket, ticketId) {
        try {
            const ticketData = await getTicketById({
                params: { TicketId: ticketId },
            });
            socket.emit('ticketUpdate', ticketData);
        } catch (error) {
            logger.error(
                `Error sending ticket data for ID ${ticketId}:`,
                error
            );
            socket.emit('error', { message: 'Error fetching ticket data' });
        }
    }
}

const ticketSocketHandler = new TicketSocketHandler();
export { ticketSocketHandler };
