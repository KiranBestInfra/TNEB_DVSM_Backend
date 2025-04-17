import mysql from 'mysql2/promise';
import config from './config.js';

const pool = mysql.createPool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: 20,
    queueLimit: 0,
    connectTimeout: 60000,
    port: config.DB_PORT,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    acquireTimeout: 30000,
    namedPlaceholders: true,
});

pool.on('error', (err) => {
    console.error('Database pool error:', err);
    if (err.code === 'ECONNRESET' || err.code === 'PROTOCOL_CONNECTION_LOST') {
        console.log(
            'Database connection lost. Will be reconnected automatically.'
        );
    }
});

export default pool;
