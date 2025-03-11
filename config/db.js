import mysql from 'mysql2/promise';
import config from './config.js';

let activeConnections = 0;

const pool = mysql.createPool({
    host: config.DB_HOST,
    user: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 1000000,
    port: 3307,
});

export default pool;
