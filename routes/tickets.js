import express from 'express';
import {
    getAllTickets,
    getTicketById,
    createTicket,
    updateTicketStatus,
    deleteTicket,
} from '../controllers/main/ticketController.js';

const router = express.Router();

router.get('/', getAllTickets); // Fetch all tickets
router.get('/:TicketId', getTicketById); // Get ticket by ID
router.post('/', createTicket); // Create a new ticket
router.patch('/:TicketId', updateTicketStatus); // Update ticket status
router.delete('/:TicketId', deleteTicket); // Delete a ticket

export default router;
