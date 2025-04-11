import 'dotenv/config';

const config = {
    PORT: process.env.PORT,
    SOCKET_PORT: process.env.SOCKET_PORT,
    NODE_ENV: process.env.NODE_ENV,
    SOCKET_PORT: process.env.SOCKET_PORT,
    DB_HOST: process.env.DB_HOST,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_PORT: process.env.DB_PORT,
    DB_NAME: process.env.DB_NAME,
    DB_NAME2: process.env.DB_NAME2,
    // DB_PORT: process.env.DB_PORT, //new modified
    SECRET_KEY: process.env.SECRET_KEY,
    JWT_SECRET: process.env.JWT_SECRET || process.env.SECRET_KEY,
    JWT_REFRESH_SECRET:
        process.env.JWT_REFRESH_SECRET || process.env.SECRET_KEY + '_refresh',
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN,
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN,
    JWT_EXPIRATION: parseInt(process.env.JWT_EXPIRATION || '3600'), // Default 1 hour in seconds
    API_VERSION: process.env.API_VERSION,
    API_KEY: process.env.API_KEY,

    // SMTP Configuration
    SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    SMTP_PORT: process.env.SMTP_PORT || 587,
    SMTP_SECURE: process.env.SMTP_SECURE || 'false',
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    APP_NAME: process.env.APP_NAME || 'Authentication App',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

    MSG_AUTH_TOKEN: process.env.MSG_AUTH_TOKEN,
    MSG_SENDER_ID: process.env.MSG_SENDER_ID,
    MSG_TEMPLATE_ID: process.env.MSG_TEMPLATE_ID,
    DLT_TE_ID: process.env.DLT_TE_ID,
};

export default config;
