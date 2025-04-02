import nodemailer from 'nodemailer';
import config from './config.js';

const createTransporter = async () => {
    try {
        const transporter = nodemailer.createTransport({
            host: config.SMTP_HOST,
            port: config.SMTP_PORT,
            secure: config.SMTP_SECURE === 'true',
            auth: {
                user: config.SMTP_USER,
                pass: config.SMTP_PASS,
            },
            tls: {
                rejectUnauthorized: false, 
            },
        });

        await transporter.verify();
        console.log('Email transporter configured successfully');
        return transporter;
    } catch (error) {
        console.error('Email transporter configuration failed:', error);
        throw error;
    }
};

let transporter = null;

export const getTransporter = async () => {
    if (!transporter) {
        transporter = await createTransporter();
    }
    return transporter;
};

export const resetTransporter = () => {
    transporter = null;
};
