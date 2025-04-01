import config from '../config/config.js';
import {
    getTransporter,
    resetTransporter,
} from '../config/emailTransporter.js';
import { isZero } from './dashboardUtils.js';

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
const MIN_EMAIL_INTERVAL_MS = 15 * 60 * 1000;

async function sendZeroValueAlert(
    meterSerial,
    zeroValues,
    powerData,
    last_comm_date
) {
    try {
        const now = Date.now();

        const transporter = await getTransporter();

        const zeroValuesList = Object.entries(zeroValues)
            .filter(([_, isZero]) => isZero)
            .map(([key, _]) => key)
            .join(', ');

        const propertyMap = {
            'Voltage- R': 'vRPh',
            'Current- R': 'cRPh',
            powerFactor: 'powerFactor',
            'Voltage- Y': 'vYPh',
            'Voltage- B': 'vBPh',
            'Current- Y': 'cYPh',
            'Current- B': 'cBPh',
        };

        const powerDataTable = Object.entries(zeroValues).map(
            ([key, isZero]) => {
                const dataKey = propertyMap[key];
                const value = powerData[dataKey];
                return {
                    key,
                    value:
                        value === null || value === undefined ? 'N/A' : value,
                    isZero,
                };
            }
        );

        const mailOptions = {
            from: config.EMAIL_FROM || config.SMTP_USER,
            to: [
                'chandrika.bestinfra@gmail.com',
                'kiran.bestinfra@gmail.com',
                'Achantaster@gmail.com',
            ],
            subject: `⚠️ Alert: Zero Power Values Detected for Meter ${meterSerial}`,
            html: `
        <h2>Zero Power Values Alert</h2>
        <p>The following power values are zero for meter <strong>${meterSerial}</strong>:</p>
        <ul>
          ${Object.entries(zeroValues)
              .filter(([_, isZero]) => isZero)
              .map(([key, _]) => `<li><strong>${key}</strong></li>`)
              .join('')}
        </ul>
        
        <h3>Instantaneous Values: @${last_comm_date}</h3>
        <table border="1" cellpadding="5" style="border-collapse: collapse;">
          <tr>
            <th>Parameter</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
          ${powerDataTable
              .map(
                  (item) => `
            <tr${item.isZero ? ' style="background-color: #ffcccc;"' : ''}>
              <td>${item.key}</td>
              <td>${item.value}</td>
              <td>${item.isZero ? '⚠️ ZERO' : 'OK'}</td>
            </tr>
          `
              )
              .join('')}
         
        </table>
        
        <p>This alert was generated at: ${(() => {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
        })()}</p>
        <p>Please investigate this issue promptly.</p>
        <p><small>This is an automated alert from the power monitoring system.</small></p>
      `,
            text: `ZERO POWER VALUES ALERT

The following power values are zero for meter ${meterSerial}: ${zeroValuesList}

Instantaneous Values: @${last_comm_date}
${powerDataTable
    .map(
        (item) =>
            `${item.key}: ${item.value}${item.isZero ? ' (ZERO - ALERT!)' : ''}`
    )
    .join('\n')}

This alert was generated at: ${(() => {
                const now = new Date();
                const day = String(now.getDate()).padStart(2, '0');
                const month = String(now.getMonth() + 1).padStart(2, '0');
                const year = now.getFullYear();
                const hours = String(now.getHours()).padStart(2, '0');
                const minutes = String(now.getMinutes()).padStart(2, '0');
                const seconds = String(now.getSeconds()).padStart(2, '0');
                return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
            })()}

Please investigate this issue promptly.

This is an automated alert from the power monitoring system.`,
        };

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

export { sendVerificationEmail, sendZeroValueAlert };
