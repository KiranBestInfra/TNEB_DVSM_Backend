const QUERY_TIMEOUT = 30000;

class Tickets {
    async createTicket(connection, ticketData) {
        try {
            const formattedDate = new Date(ticketData.LastUpdated)
                .toISOString()
                .slice(0, 19)
                .replace('T', ' ');

            const sql = `
                INSERT INTO tickets (
                    TicketId, Subject, Category, Description, Region, District, Status,
                    LastUpdated, EDC_Substations, ConsumerNo, ConsumerName, Email,
                    Mobile, Priority
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            `;

            const values = [
                ticketData.TicketId,
                ticketData.Subject,
                ticketData.Category,
                ticketData.Description,
                ticketData.Region,
                ticketData.District,
                ticketData.Status,
                formattedDate,
                ticketData.EDC_Substations,
                ticketData.ConsumerNo,
                ticketData.ConsumerName,
                ticketData.Email,
                ticketData.Mobile,
                ticketData.Priority,
            ];

            const [result] = await connection.query(
                { sql, timeout: QUERY_TIMEOUT },
                values
            );
            return result;
        } catch (error) {
            console.error('❌ Error creating ticket:', error);
            throw error;
        }
    }

    async getTickets(connection) {
        try {
            const sql = `SELECT * FROM tickets;`;
            const [rows] = await connection.query({
                sql,
                timeout: QUERY_TIMEOUT,
            });
            return rows;
        } catch (error) {
            console.error('❌ Error fetching tickets:', error);
            throw error;
        }
    }

    async getTicketById(connection, TicketId) {
        try {
            const sql = `SELECT * FROM tickets WHERE TicketId = ?;`;
            const [rows] = await connection.query(
                { sql, timeout: QUERY_TIMEOUT },
                [TicketId]
            );
            return rows[0];
        } catch (error) {
            console.error('❌ Error fetching ticket by ID:', error);
            throw error;
        }
    }
    async updateTicketStatus(connection, TicketId, Status) {
        try {
            const sql = `UPDATE tickets SET Status = ?, LastUpdated = NOW() WHERE TicketId = ?;`;
            const [result] = await connection.query(
                { sql, timeout: QUERY_TIMEOUT },
                [Status, TicketId]
            );
            return result;
        } catch (error) {
            console.error('❌ Error updating ticket status in model:', error);
            throw error; // ✅ CORRECT — throw the actual error, NOT result
        }
    }

    async deleteTicket(connection, TicketId) {
        try {
            const sql = `DELETE FROM tickets WHERE TicketId = ?;`;
            const [result] = await connection.query(
                { sql, timeout: QUERY_TIMEOUT },
                [TicketId]
            );
            return result;
        } catch (error) {
            console.error('❌ Error deleting ticket:', error);
            throw error;
        }
    }
}

export default new Tickets();
