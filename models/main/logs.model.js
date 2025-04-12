const getLogs = async (connection, socket) => {
    try {
        const [rows] = await connection.query(
            `SELECT id, type, message, path, time 
             FROM logs 
             ORDER BY id`
        );

        if (socket) {
            socket.emit('logs_data', rows); // emits logs to client
        }

        return rows;
    } catch (error) {
        console.error('Error getting logs from database:', error);
        return [];
    }
};

export default {
    getLogs,
};
