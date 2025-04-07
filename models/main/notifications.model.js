const QUERY_TIMEOUT = 30000;

class Notification {
    async sendUnreadNotifications(connection, socket) {
        try {
            const [results] = await connection.query({
                sql: `
                        SELECT * FROM notifications_tgnpdcl WHERE is_read = 0 ORDER BY created_at DESC
                    `,
                timeout: QUERY_TIMEOUT,
            });
            if (results.length > 0) {
                socket.emit('unread_notifications', results);
            }
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getDTRData', error);
            throw error;
        }
    }

    async markAsReadAllNotifications(connection, socket) {
        try {
            const [results] = await connection.query({
                sql: `
                        UPDATE notifications_tgnpdcl SET is_read = 1 WHERE is_read = 0
                    `,
                timeout: QUERY_TIMEOUT,
            });

            socket.emit('notification_count', 0);
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getDTRData', error);
            throw error;
        }
    }

    async markNotificationAsRead(connection, socket, id) {
        try {
            await connection.query(
                {
                    sql: `
                        UPDATE notifications_tgnpdcl SET is_read = 1 WHERE is_read = 0 AND id = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [id]
            );
            this.getNotificationCount(connection, socket);
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getDTRData', error);
            throw error;
        }
    }
    async getNotificationCount(connection, socket) {
        try {
            const [[result]] = await connection.query(
                `SELECT COUNT(*) as count 
             FROM notifications_tgnpdcl 
             WHERE is_read = 0`
            );

            socket.emit('notification_count', result.count);
        } catch (error) {
            console.error('Error getting notification count:', error);
            return 0;
        }
    }
}

export default new Notification();
