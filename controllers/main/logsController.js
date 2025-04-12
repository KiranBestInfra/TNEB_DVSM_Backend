import db from '../../config/db.js';
import getLogs from '../../models/main/logs.model.js';

export const fetchLogs = async (_req, res) => {
    try {
        const connection = await db.getConnection(); // if you're using a pool
        const logs = await getLogs.getLogs(connection);
        connection.release();

        res.status(200).json({ success: true, logs });
    } catch (err) {
        console.error('Controller error:', err.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch logs',
        });
    }
};

export default fetchLogs;
