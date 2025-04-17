import pool from '../../config/db.js';
import Tickets from '../../models/tickets/tickets.model.js';
import logger from '../../utils/logger.js';

export const getAllTickets = async (req, res) => {
    try {
        const tickets = await Tickets.getTickets(pool);
        res.status(200).json(tickets);
    } catch (error) {
        logger.error('Error fetching tickets:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const getTicketById = async (req, res) => {
    try {
        const { TicketId } = req.params;
        const ticket = await Tickets.getTicketById(pool, TicketId);
        if (!ticket) {
            return res.status(404).json({ error: 'Ticket not found' });
        }
        res.status(200).json(ticket);
    } catch (error) {
        logger.error('Error fetching ticket by ID:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const createTicket = async (req, res) => {
    try {
        const ticketData = req.body;
        const newTicket = await Tickets.createTicket(pool, ticketData);
        res.status(201).json(newTicket);
    } catch (error) {
        logger.error('Error creating ticket:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const updateTicketStatus = async (req, res) => {
    try {
        const { TicketId } = req.params;
        const { Status } = req.body;

        await Tickets.updateTicketStatus(pool, TicketId, Status);
        const latest = await Tickets.getTicketById(pool, TicketId); // fetch full updated ticket
        res.status(200).json(latest); // ✅ return updated ticket data
    } catch (error) {
        console.error('❌ Error updating ticket status:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export const deleteTicket = async (req, res) => {
    try {
        const { TicketId } = req.params;
        await Tickets.deleteTicket(pool, TicketId);
        res.status(200).json({ message: 'Ticket deleted successfully' });
    } catch (error) {
        logger.error('Error deleting ticket:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

export default {
    getAllTickets,
    getTicketById,
    createTicket,
    updateTicketStatus,
    deleteTicket,
};
