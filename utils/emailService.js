import config from '../config/config.js';
import {
    getTransporter,
    resetTransporter,
} from '../config/emailTransporter.js';
import { isZero } from './dashboardUtils.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sendVerificationEmail = async (
    email,
    code,
    isRegistration = false,
    type = 'verification'
) => {
    let subject, message, html;

    if (type === 'reset') {
        subject = 'Reset Your Password';
        message = `Click the following link to reset your password: ${code}\nThis link will expire in 1 hour.`;
        html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">Reset Your Password</h2>
                <p style="font-size: 16px; color: #666;">Click the button below to reset your password:</p>
                <div style="text-align: center; margin: 20px 0;">
                    <a href="${code}" style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Reset Password</a>
                </div>
                <p style="font-size: 14px; color: #666;">
                    This link will expire in 1 hour.<br>
                    If you didn't request this password reset, please ignore this email.
                </p>
            </div>
        `;
    } else {
        subject = isRegistration
            ? 'Verify Your Email Address'
            : 'Login Verification Code';

        message = isRegistration
            ? `Welcome! Your verification code is: ${code}\nPlease use this code to verify your email address.`
            : `Your login verification code is: ${code}\nPlease use this code to complete your login.`;

        html = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #333;">${subject}</h2>
                <p style="font-size: 16px; color: #666;">Your verification code is:</p>
                <div style="background-color: #f4f4f4; padding: 15px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 24px; font-weight: bold; color: #333;">${code}</span>
                </div>
                <p style="font-size: 14px; color: #666;">
                    This code will expire in 5 minutes.<br>
                    If you didn't request this code, please ignore this email.
                </p>
            </div>
        `;
    }

    try {
        const transporter = await getTransporter();

        await transporter.sendMail({
            from: `"${config.APP_NAME}" <${config.SMTP_USER}>`,
            to: email,
            subject,
            text: message,
            html,
        });
        return true;
    } catch (error) {
        console.error('Email sending failed:', error);
        resetTransporter();
        return false;
    }
};

const lastEmailSent = new Map();
const previousErrorStates = new Map();
const MIN_EMAIL_INTERVAL_MS = 15 * 60 * 1000;

async function sendZeroValueAlert(
    meterSerial,
    feederName,
    dtrName,
    zeroValues,
    powerData,
    last_comm_date,
    msg91
) {
    try {
        const currentErrorSignature = generateErrorSignature(
            zeroValues,
            powerData
        );

        const previousSignature = previousErrorStates.get(meterSerial);

        if (previousSignature && previousSignature === currentErrorSignature) {
            console.log(
                `Skipping alert for meter ${meterSerial}: No change in error state`
            );
            return null;
        }

        previousErrorStates.set(meterSerial, currentErrorSignature);

        const transporter = await getTransporter();

        const templatePath = path.join(
            __dirname,
            '../config/emails',
            'zeroAlertMail.html'
        );

        let template = fs.readFileSync(templatePath, 'utf8');
        template = template.replace(/\${DTRName}/g, dtrName);
        // template = template.replace(/\${meterSerial}/g, meterSerial);
        template = template.replace(/\${last_comm_date}/g, last_comm_date);

        // const zeroValuesList = Object.entries(zeroValues)
        //     .filter(([_, isZero]) => isZero)
        //     .map(([key, _]) => `<li><strong>${key}</strong></li>`)
        //     .join('');

        // template = template.replace(
        //     '<!-- ZERO_VALUES_LIST -->',
        //     zeroValuesList
        // );

        const propertyMap = {
            'Meter Power Fail (R - Phase)': 'powerFactor',
            'Meter Power Fail (Y - Phase)': 'pfYPh',
            'Meter Power Fail (B - Phase)': 'pfBPh',

            'R_PH Missing': 'vRPh',
            'Y_PH Missing': 'vYPh',
            'B_PH Missing': 'vBPh',

            'R_PH CT Open': 'cRPh',
            'Y_PH CT Open': 'cYPh',
            'B_PH CT Open': 'cBPh',

            'R_PH CT Reversed': 'cRPh',
            'Y_PH CT Reversed': 'cYPh',
            'B_PH CT Reversed': 'cBPh',

            'Load Imbalance': 'neutral_current',

            'Low PF (R - Phase)': 'powerFactor',
            'Low PF (Y - Phase)': 'pfYPh',
            'Low PF (B - Phase)': 'pfBPh',

            'Low Voltage (R - Phase)': 'vRPh',
            'Low Voltage (R - Phase)': 'vYPh',
            'Low Voltage (R - Phase)': 'vBPh',
        };

        let alertMessage = '';
        let zeroValuesList = '';
        const zeroEntries = Object.entries(zeroValues).filter(
            ([key, value]) => value === true
        );

        if (zeroEntries.length > 0) {
            const alertLines = zeroEntries.map(([key]) => {
                const dataKey = propertyMap[key] || key;
                const value = powerData[dataKey] || '0.000';

                return `${key} (${value})`;
            });

            zeroValuesList = alertLines.join('\n');

            alertMessage = `
                        <p style="margin: 0; padding: 0; color: black;">
                            ${alertLines.join('<br>')}
                        </p>
                    `;
        }

        template = template.replace('<!-- POWER_DATA_TABLE -->', alertMessage);

        const now = new Date();
        const day = String(now.getDate()).padStart(2, '0');
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const year = now.getFullYear();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timestamp = ` ${day}-${month}-${year} at ${hours}:${minutes}:${seconds}`;

        template = template.replace('<!-- TIMESTAMP -->', timestamp);

        const mailOptions = {
            from: config.EMAIL_FROM || config.SMTP_USER,
            to: [
                // 'chandrika.bestinfra@gmail.com',
                // 'kiran.bestinfra@gmail.com',
                // 'Achantaster@gmail.com',
                'kirankittu3760@gmail.com',
            ],
            subject: `⚠️ Important Alert: Abnormality Detected for ${feederName}`,
            html: template,
        };

        // SMS Configuration
        // const smsService = msg91.getSMS();
        // const recipient = {
        //     mobile: '917780314837',
        //     NAME: consumerName,
        //     METER: meterSerial,
        //     ZERO: zeroValuesList,
        //     TIME: timestamp,

        //     DLT_TE_ID: config.DLT_TE_ID,
        // };

        // const options = {
        //     senderId: config.MSG_SENDER_ID,
        // };

        // const response = await smsService.send(
        //     config.MSG_TEMPLATE_ID,
        //     recipient,
        //     options
        // );
        // console.log(response);

        const info = await transporter.sendMail(mailOptions);
        console.log(
            `Email alert sent for meter ${meterSerial}: ${info.messageId}`
        );

        lastEmailSent.set(meterSerial, now);

        return info;
    } catch (error) {
        console.error(
            `Failed to send email alert for meter ${meterSerial}:`,
            error
        );
        throw error;
    }
}

function generateErrorSignature(zeroValues, powerData) {
    let signature = '';

    const sortedKeys = Object.keys(zeroValues).sort();

    for (const key of sortedKeys) {
        if (zeroValues[key] === true) {
            const propertyMap = {
                'Meter Power Fail (R - Phase)': 'powerFactor',
                'Meter Power Fail (Y - Phase)': 'pfYPh',
                'Meter Power Fail (B - Phase)': 'pfBPh',
                'R_PH Missing': 'vRPh',
                'Y_PH Missing': 'vYPh',
                'B_PH Missing': 'vBPh',
                'R_PH CT Open': 'cRPh',
                'Y_PH CT Open': 'cYPh',
                'B_PH CT Open': 'cBPh',
                'R_PH CT Reversed': 'cRPh',
                'Y_PH CT Reversed': 'cYPh',
                'B_PH CT Reversed': 'cBPh',
                'Load Imbalance': 'neutral_current',
                'Low PF (R - Phase)': 'powerFactor',
                'Low PF (Y - Phase)': 'pfYPh',
                'Low PF (B - Phase)': 'pfBPh',
                'Low Voltage (R - Phase)': 'vRPh',
                'Low Voltage (Y - Phase)': 'vYPh',
                'Low Voltage (B - Phase)': 'vBPh',
            };

            const dataKey = propertyMap[key] || key;
            const value = powerData[dataKey] || '0.000';

            signature += `${key}:${value};`;
        }
    }

    return signature;
}

export { sendVerificationEmail, sendZeroValueAlert };
