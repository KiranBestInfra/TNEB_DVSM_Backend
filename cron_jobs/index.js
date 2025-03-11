import dashboardModel from '../models//main/dashboard.model.js';
import { calculateTotalAmount } from '../utils/dashboardUtils.js';

const QUERY_TIMEOUT = 30000;

function createInvoiceGenerator() {
    const prefix = 'INV';
    let lastDate = '';
    let counter = 0;

    return function generateInvoiceNumber(timestamp) {
        const now = new Date(timestamp);

        const year = String(now.getFullYear()).slice(-2);
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const currentDate = `${year}${month}${day}`;

        if (currentDate !== lastDate) {
            lastDate = currentDate;
            counter = 1;
        } else {
            counter++;
        }

        const counterStr = String(counter).padStart(4, '0');

        return `${prefix}${currentDate}${counterStr}`;
    };
}

// function formatDate(date) {
//     const day = date.getDate().toString().padStart(2, '0');
//     const month = (date.getMonth() + 1).toString().padStart(2, '0');
//     const year = date.getFullYear();

//     return `${day}-${month}-${year}`;
// }

export const generateInvoiceNumber = createInvoiceGenerator();

// export const generateBills = async (connection) => {
//     const currentDate = new Date();
//     const billingDate = new Date(currentDate);
//     billingDate.setMonth(billingDate.getMonth() - 1);

//     const billingYear = billingDate.getFullYear();
//     const billingMonth = billingDate.getMonth() + 1;
//     const year = billingYear;
//     const month = billingMonth;

//     let startDate = new Date(year, month - 1, 1);
//     let endDate = new Date(year, month, 0);
//     let startDateDUP = new Date(year, month - 1, 1);
//     let endDateDUP = new Date(year, month, 1);
//     try {
//         const due_amount = (0.0).toFixed(2);
//         const status = 'Pending';
//         const billing_period_start = startDate;
//         const billing_period_end = endDate;
//         const bill_date = new Date(year, month, 1);
//         const due_date = new Date(year, month, 9);
//         const created_at = bill_date
//             .toISOString()
//             .slice(0, 19)
//             .replace('T', ' ');

//         startDate = formatDate(startDate);
//         endDate = formatDate(endDate);
//         const tariffs = await dashboardModel.getTariffRates();

//         const [meters] = await Promise.race([
//             connection.query(
//                 `SELECT
//                     DISTINCT METER_SERIAL_NO
//                     FROM d6_data
//                     WHERE d6_time_stamp >= STR_TO_DATE(?, '%d-%m-%Y')
//                     AND d6_time_stamp <= STR_TO_DATE(?, '%d-%m-%Y')
//                     `,
//                 [startDate, endDate]
//             ),
//             new Promise((_, reject) =>
//                 setTimeout(
//                     () => reject(new Error('Query timeout')),
//                     QUERY_TIMEOUT
//                 )
//             ),
//         ]);

//         for (const meter of meters) {
//             const [[uid]] = await Promise.race([
//                 connection.query(
//                     `SELECT
//                     uid
//                     FROM consumers_lkea
//                     WHERE meter_serial = ?
//                     `,
//                     [meter.METER_SERIAL_NO]
//                 ),
//                 new Promise((_, reject) =>
//                     setTimeout(
//                         () => reject(new Error('Query timeout')),
//                         QUERY_TIMEOUT
//                     )
//                 ),
//             ]);
//             const uniqueID = uid?.uid ?? 0;
//             const invoice = generateInvoiceNumber(startDate);

//             const { units, total_bill, previous_reading, current_reading } =
//                 await dashboardModel.getTotalRevenueByStartAndEndDate(
//                     meter.METER_SERIAL_NO,
//                     tariffs,
//                     startDateDUP,
//                     endDateDUP
//                 );
//             const paid_amount = (0.0).toFixed(2);

//             await connection.query(
//                 `INSERT INTO bill_lkea (
//                     invoice_id, uid, billing_period_start, billing_period_end,
//                     bill_date, due_date, consumption, amount, paid_amount,
//                     due_amount, status, created_at, updated_at
//                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
//                 [
//                     invoice,
//                     uniqueID,
//                     billing_period_start,
//                     billing_period_end,
//                     bill_date,
//                     due_date,
//                     units || (0.0).toFixed(2),
//                     total_bill || (0.0).toFixed(2),
//                     paid_amount || (0.0).toFixed(2),
//                     due_amount,
//                     status,
//                     created_at,
//                 ]
//             );
//         }
//     } catch (error) {
//         if (error.message === 'Query timeout') {
//             throw new Error(
//                 'Cron Job Query timed out after ' +
//                     QUERY_TIMEOUT / 1000 +
//                     ' seconds'
//             );
//         }
//         throw error;
//     } finally {
//         if (connection) {
//             connection.release();
//         }
//     }
// };

export const generateBills = async (pool) => {
    try {
        const defaultAmount = (0.0).toFixed(2);

        const [consumers] = await Promise.race([
            pool.query(
                `SELECT 
                DISTINCT meter_serial, uid, consumer_type 
                FROM consumers_lkea`
            ),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Query timeout')),
                    QUERY_TIMEOUT
                )
            ),
        ]);

        const now = new Date();
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        let previousMonthYear = currentYear;
        let previousMonth = currentMonth - 1;

        if (previousMonth < 0) {
            previousMonth = 11;
            previousMonthYear -= 1;
        }

        const startOfPreviousMonth = new Date(
            previousMonthYear,
            previousMonth,
            1,
            0,
            0,
            0,
            0
        );

        const endOfPreviousMonth = new Date(
            previousMonthYear,
            previousMonth + 1,
            0,
            23,
            59,
            59,
            999
        );

        const billDate = new Date(currentYear, currentMonth, 1);
        const dueDate = new Date(currentYear, currentMonth, 9);

        for (const consumer of consumers) {
            const totalConsumption =
                await dashboardModel.getConsumptionWithStartAndEndDate(
                    pool,
                    '',
                    [],
                    startOfPreviousMonth,
                    endOfPreviousMonth,
                    consumer.meter_serial
                );

            const uniqueID = consumer?.uid || 0;
            const consumerType = consumer?.consumer_type || 0;
            const invoice = generateInvoiceNumber(startOfPreviousMonth);
            const createdAt = billDate;

            const hasConsumption =
                totalConsumption !== '0.0' && totalConsumption !== '0.00';

            const billData = {
                invoice_id: invoice,
                uid: uniqueID,
                billing_period_start: startOfPreviousMonth,
                billing_period_end: endOfPreviousMonth,
                bill_date: billDate,
                due_date: dueDate,
                created_at: createdAt,
            };

            if (hasConsumption) {
                const consumption = parseFloat(totalConsumption).toFixed(2);
                const { amount: totalBill } = calculateTotalAmount(
                    consumption,
                    consumerType
                );

                // Add consumption-specific fields
                billData.consumption = consumption;
                billData.amount = totalBill || defaultAmount;
                billData.paid_amount = defaultAmount;
                billData.due_amount = defaultAmount;
                billData.status = 'Pending';
            } else {
                // Process zero-consumption bills
                billData.consumption = defaultAmount;
                billData.amount = defaultAmount;
                billData.paid_amount = defaultAmount;
                billData.due_amount = defaultAmount;
                billData.status = 'Paid';
            }

            await pool.query(
                `INSERT INTO bill_lkea (
                    invoice_id, uid, billing_period_start, billing_period_end,
                    bill_date, due_date, consumption, amount, paid_amount,
                    due_amount, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
                [
                    billData.invoice_id,
                    billData.uid,
                    billData.billing_period_start,
                    billData.billing_period_end,
                    billData.bill_date,
                    billData.due_date,
                    billData.consumption,
                    billData.amount,
                    billData.paid_amount,
                    billData.due_amount,
                    billData.status,
                    billData.created_at,
                ]
            );
        }
    } catch (error) {
        if (error.message === 'Query timeout') {
            throw new Error(
                'Cron Job Query timed out after ' +
                    QUERY_TIMEOUT / 1000 +
                    ' seconds'
            );
        }
        throw error;
    }
};

export const generateOverDueBills = async (connection) => {
    try {
        const updateQuery = `
            UPDATE bill_lkea
            SET 
                status = CASE 
                            WHEN amount = 0 THEN 'Paid'
                            ELSE 'Overdue'
                        END,
                due_amount = CASE 
                            WHEN paid_amount = 0 THEN amount 
                            ELSE amount - paid_amount 
                            END,
                updated_at = NOW()
            WHERE status = 'Pending'
        `;

        const [result] = await Promise.race([
            connection.query(updateQuery),
            new Promise((_, reject) =>
                setTimeout(
                    () => reject(new Error('Query timeout')),
                    QUERY_TIMEOUT
                )
            ),
        ]);

        return result;
    } catch (error) {
        if (error.message === 'Query timeout') {
            throw new Error(
                'Generate overdue cron job query timed out after ' +
                    QUERY_TIMEOUT / 1000 +
                    ' seconds'
            );
        }
        throw error;
    }
};
