import logger from '../../utils/logger.js';
import Dashboard from '../../models/main/dashboard.model.js';
import {
    getDateInMDYFormat,
    getDateInMYFormat,
    calculatePercentageIncrease,
    formatDatesMY,
    calculateTotalOutstanding,
    transformMeters,
    formatDecimal,
    formatPercentage,
    safeNumber,
    calculatePercentage,
    fillMissingDatesDyno,
    fillMissingReadingDates,
    fillMissingMDData,
    predictFutureValues,
} from '../../utils/dashboardUtils.js';
import Joi from 'joi';
import pool from '../../config/db.js';
import XLSX from 'xlsx';
import path from 'path';

export const getConsumersTable = (
    with_pagination = 'true',
    consumer_no = ''
) => {
    return async (req, res) => {
        try {
            const accessCondition = req.locationAccess?.condition || '';
            const accessValues = req.locationAccess?.values || [];

            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const status = req.query.communicationStatus || '';
            let meters = [];
            let activeFlag = '';

            if (status == 'non-communicating') {
                activeFlag = 'non-comm';
                meters = await Dashboard.getInActiveMeters(
                    pool,
                    accessCondition,
                    accessValues
                );
            } else if (status == 'communicating') {
                activeFlag = 'comm';
                meters = await Dashboard.getActiveMeters(
                    pool,
                    accessCondition,
                    accessValues
                );
            }
            const meterNumbers = transformMeters(meters, activeFlag);

            const result = await Dashboard.getConsumersTable(
                pool,
                accessCondition,
                accessValues,
                page,
                limit,
                with_pagination,
                consumer_no,
                activeFlag.length > 0 && meterNumbers.length == 0
                    ? null
                    : meterNumbers
            );
            res.status(200).json({
                status: 'success',
                ...result,
            });
        } catch (error) {
            logger.error('Error fetching consumers:', {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString(),
            });

            res.status(500).json({
                status: 'error',
                message: 'An error occurred while fetching consumers',
                errorId: error.code || 'INTERNAL_SERVER_ERROR',
            });
        }
        // finally {
        //     if (connection) connection.release();
        // }
    };
};

function formatYearMonth(input) {
    const months = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
    ];

    const [year, month] = input.split('-');
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = months[monthIndex];
    return `${year} ${monthName}`;
}

export const getMainGraphAnalytics = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const consumptionOnDaily = await Dashboard.graphDashboardAnalytics(
            pool,
            accessCondition,
            accessValues,
            'daily'
        );
        const consumptionOnMonthly = await Dashboard.graphDashboardAnalytics(
            pool,
            accessCondition,
            accessValues,
            'monthly'
        );
        const billingAndCollectionData =
            await Dashboard.getBillingAndCollectionGraphData(
                pool,
                accessCondition,
                accessValues
            );

        const { dailyxAxisData, dailysums } = consumptionOnDaily.reduce(
            (acc, item) => {
                acc.dailyxAxisData.push(item.consumption_date);
                acc.dailysums.push(item.sum.toFixed(2));
                return acc;
            },
            { dailyxAxisData: [], dailysums: [] }
        );

        const daily = fillMissingDatesDyno(
            dailyxAxisData,
            dailysums,
            'DD MMM, YYYY',
            'day'
        );

        const { monthlyxAxisData, monthlysums } = consumptionOnMonthly.reduce(
            (acc, item) => {
                acc.monthlyxAxisData.push(
                    getDateInMYFormat(item.consumption_date)
                );
                acc.monthlysums.push(item.sum.toFixed(2));
                return acc;
            },
            { monthlyxAxisData: [], monthlysums: [] }
        );

        const monthly = fillMissingDatesDyno(
            monthlyxAxisData,
            monthlysums,
            'DD MMM, YYYY',
            'month'
        );

        const {
            billMonth,
            totalBillCount,
            pendingBillCount,
            paidBillCount,
            overDueCount,
        } = billingAndCollectionData.reduce(
            (acc, item) => {
                acc.billMonth.push(formatYearMonth(item.bill_month));
                acc.totalBillCount.push(item.total_bill_count);
                acc.pendingBillCount.push(item.pending_bill_count);
                acc.paidBillCount.push(item.paid_bill_count);
                acc.overDueCount.push(item.overdue_bill_count);
                return acc;
            },
            {
                billMonth: [],
                totalBillCount: [],
                pendingBillCount: [],
                paidBillCount: [],
                overDueCount: [],
            }
        );

        const billingData = {
            billMonth,
            totalBillCount,
            pendingBillCount,
            paidBillCount,
            overDueCount,
        };

        const dailyData = {
            xAxisData: daily.dates,
            sums: daily.values,
        };

        const monthlyData = {
            xAxisData: monthly.dates,
            sums: monthly.values,
        };

        res.status(200).json({
            status: 'success',
            data: {
                dailyData,
                monthlyData,
                billingData,
            },
        });
    } catch (error) {
        logger.error('Error fetching graph analytics:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching graph analytics',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

function formatDate1(date) {
    date = new Date(date);
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();

    return `${day}-${month}-${year}`;
}

export const getMainWidgets = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const consumers = await Dashboard.getConsumerTypeCount(
            pool,
            accessCondition,
            accessValues
        );
        const activeStatus = await Dashboard.getActiveStatus(
            pool,
            accessCondition,
            accessValues
        );
        const usersCount = await Dashboard.getUserConsumptionCategory(
            pool,
            accessCondition,
            accessValues
        );
        const tariffs = await Dashboard.getTariffRates(pool);

        const {
            total_overdue_revenue: total_overdue_bill,
            total_overdue_revenue_count: total_overdue_bill_count,
        } = await Dashboard.getTotalOverDueRevenueCurrentMonth(
            pool,
            accessCondition,
            accessValues
        );
        const {
            total_pending_revenue: total_pending_bill,
            total_pending_revenue_count: total_pending_bill_count,
        } = await Dashboard.getTotalPendingRevenueCurrentMonth(
            pool,
            accessCondition,
            accessValues
        );

        const totalOutstanding = calculateTotalOutstanding(
            total_pending_bill,
            total_overdue_bill
        );

        const now = new Date();

        const firstDayCurrentMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            1
        );
        const lastDayCurrentMonth = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999
        );
        const firstDayPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );
        const lastDayPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            0,
            23,
            59,
            59,
            999
        );
        const firstDayBeforePreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 2,
            1
        );
        const lastDayBeforePreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            0,
            23,
            59,
            59,
            999
        );

        const startOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );
        const endOfToday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999
        );
        const startOfYesterday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 1
        );
        const endOfYesterday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 1,
            23,
            59,
            59,
            999
        );
        const startOfDayBeforeYesterday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 2
        );
        const endOfDayBeforeYesterday = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate() - 2,
            23,
            59,
            59,
            999
        );
        const formatDate = (date) =>
            date.toISOString().slice(0, 19).replace('T', ' ');

        const yesterdayStartTimestamp = formatDate(startOfYesterday);
        const yesterdayEndTimestamp = formatDate(endOfYesterday);
        const dayBeforeYesterdayStartTimestamp = formatDate(
            startOfDayBeforeYesterday
        );
        const dayBeforeYesterdayEndTimestamp = formatDate(
            endOfDayBeforeYesterday
        );

        const yesterdayConsumption =
            await Dashboard.getConsumptionWithStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                yesterdayStartTimestamp,
                yesterdayEndTimestamp
            );
        const dayBeforeYesterdayConsumption =
            await Dashboard.getConsumptionWithStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                dayBeforeYesterdayStartTimestamp,
                dayBeforeYesterdayEndTimestamp
            );

        const {
            total_revenue: total_revenue,
            total_revenue_count: total_revenue_count,
        } = await Dashboard.getTotalRevenueCurrentMonth(
            pool,
            accessCondition,
            accessValues,
            firstDayPreviousMonth,
            lastDayPreviousMonth
        );
        // const {
        //     total_overdue_revenue: current_month_overdue_amount,
        //     total_overdue_revenue_count: current_month_overdue_count,
        // } = await Dashboard.getTotalOverDueRevenueCurrentMonth(
        //     pool,
        //     accessCondition,
        //     accessValues,
        //     firstDayCurrentMonth,
        //     lastDayCurrentMonth
        // );
        const totalOutstandingPercentage = calculatePercentage(
            total_overdue_bill ?? 0,
            total_revenue ?? 0
        );
        console.log(firstDayBeforePreviousMonth, lastDayBeforePreviousMonth);
        const {
            total_revenue: total_bill_last_month,
            total_revenue_count: total_bill_last_month_count,
        } = await Dashboard.getTotalRevenueCurrentMonth(
            pool,
            accessCondition,
            accessValues,
            firstDayBeforePreviousMonth,
            lastDayBeforePreviousMonth
        );
        const { total_bill_generated: yesterdayTotalRevenue } =
            await Dashboard.getTotalRevenueByStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                null,
                tariffs,
                yesterdayStartTimestamp,
                yesterdayEndTimestamp
            );
        const { total_bill_generated: dayBeforeYesterdayTotalRevenue } =
            await Dashboard.getTotalRevenueByStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                null,
                tariffs,
                dayBeforeYesterdayStartTimestamp,
                dayBeforeYesterdayEndTimestamp
            );

        const activeUnits = activeStatus.active_count;
        const inactiveUnits = activeStatus.inactive_count;

        const { postpaid, prepaid } =
            await Dashboard.getDisconnectedConsumerCount(
                pool,
                accessCondition,
                accessValues
            );

        res.status(200).json({
            status: 'success',
            data: {
                totalConsumers: consumers.total_consumers,
                postpaidConsumers: consumers.postpaid_count,
                prepaidConsumer: consumers.prepaid_count,
                activeUnits,
                inactiveUnits,
                usersCount,
                totalOverdueAmount: total_overdue_bill,
                totalOverdueBillCount: total_overdue_bill_count,
                totalOutstanding: totalOutstanding,
                prepaidDisconnected: prepaid,
                postpaidDisconnected: postpaid,
                totalOutstandingPercentage,

                // Monthly Widgets Data
                currentMonthtotalRevenue: total_revenue,
                lastMonthTotalRevenue: total_bill_last_month,
                paymentReceiptsCurrentMonth: total_revenue_count,
                paymentReceiptsLastMonth: total_bill_last_month_count,

                // Daily Widgets Data
                yesterdayConsumption,
                dayBeforeYesterdayConsumption,
                yesterdayTotalRevenue,
                dayBeforeYesterdayTotalRevenue,
                yesterdayPaymentReceipts: 0,
                dayBeforeYesterdayPaymentReceipts: 0,

                // Todat Widgets Data
                // todayConsumption,
                // todayTotalRevenue,
                todayPaymentReceipts: 0,
            },
        });
    } catch (error) {
        logger.error('Error fetching total consumers:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching total consumers count',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

export const getBillingWidgets = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const { total_revenue, total_revenue_count } =
            await Dashboard.getTotalRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues
            );

        const { total_pending_revenue } =
            await Dashboard.getTotalPendingRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues
            );
        const { total_overdue_revenue, total_overdue_revenue_count } =
            await Dashboard.getTotalOverDueRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues
            );
        const averageBillAmount =
            total_revenue_count > 0 ? total_revenue / total_revenue_count : 0;

        res.status(200).json({
            status: 'success',
            data: {
                totalBillsGenerated: total_revenue_count || 0,
                totalRevenue: total_revenue || 0,
                pendingPayments: total_pending_revenue || 0,
                overdueBills: {
                    count: total_overdue_revenue_count || 0,
                    amount: total_overdue_revenue || 0,
                },
                averageBillAmount: averageBillAmount.toFixed(2) || 0,
            },
        });
    } catch (error) {
        logger.error('Error fetching billing data:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching billing data',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getBillingData = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const date = req.query.date || '';
        const bill = req.query.bill || '';
        const payment = req.query.payment || '';
        const consumer = req.query.consumer || '';

        const filters = {
            date,
            bill,
            payment,
            consumer,
        };

        const invoices = await Dashboard.getConsumerBillingTable(
            pool,
            accessCondition,
            accessValues,
            page,
            limit,
            filters
        );

        res.status(200).json({
            status: 'success',
            data: invoices.consumers,
            pagination: invoices.pagination,
        });
    } catch (error) {
        logger.error('Error fetching billing data:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching billing data',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

export const getInvoiceByInvoiceNo = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const invoice_id = req.query.id || '';
        const invoice = await Dashboard.getInvoiceByInvoiceNo(pool, invoice_id);
        const consumer = await Dashboard.getConsumerByID(pool, invoice.uid);
        const tariff = await Dashboard.getTariffRates(pool);

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

        const calculations = await Dashboard.getTotalRevenueByStartAndEndDate(
            pool,
            accessCondition,
            accessValues,
            consumer.meter_serial,
            tariff,
            startOfPreviousMonth,
            endOfPreviousMonth
        );

        const due_amount = await Dashboard.getConsumerOverdueByUID(
            pool,
            consumer.uid
        );
        const total_bill_with_overdue =
            parseFloat(due_amount ?? 0.0) +
            parseFloat(calculations.total_bill ?? 0.0) -
            parseFloat(invoice.due_amount ?? 0.0);

        res.status(200).json({
            status: 'success',
            data: {
                ...invoice,
                ...consumer,
                ...calculations,
                total_bill_with_overdue,
            },
        });
    } catch (error) {
        logger.error('Error fetching billing data:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching billing data',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getTariffRates = async (req, res) => {
    try {
        const tariffs = await Dashboard.getTariffRates(pool);
        res.status(200).json({
            status: 'success',
            data: tariffs,
        });
    } catch (error) {
        logger.error('Error fetching tariff rate:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching tariff rate',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getReportsWidgets = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const { start, end } = req.query;
        const startDate = start ? new Date(start) : null;
        const endDate = end ? new Date(end) : null;

        const now = new Date();
        const firstDayPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1
        );
        const lastDayPreviousMonth = new Date(
            now.getFullYear(),
            now.getMonth(),
            0,
            23,
            59,
            59,
            999
        );

        const newConnections = await Dashboard.newConnections(
            pool,
            accessCondition,
            accessValues,
            startDate,
            endDate
        );
        const newConnectionsLastMonth = await Dashboard.newConnectionsLastMonth(
            pool,
            accessCondition,
            accessValues
        );

        const { total_revenue, total_revenue_count } =
            await Dashboard.getTotalRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues,
                startDate,
                endDate
            );
        const { total_pending_revenue } =
            await Dashboard.getTotalPendingRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues,
                startDate,
                endDate
            );
        const { total_overdue_revenue } =
            await Dashboard.getTotalOverDueRevenueCurrentMonth(
                pool,
                accessCondition,
                accessValues,
                startDate,
                endDate
            );

        const {
            total_revenue: total_bill_last_month,
            total_revenue_count: total_bill_last_month_count,
        } = await Dashboard.getTotalRevenueCurrentMonth(
            pool,
            accessCondition,
            accessValues,
            firstDayPreviousMonth,
            lastDayPreviousMonth
        );
        const { total_pending_revenue_last_month } =
            await Dashboard.getTotalPendingRevenueLastMonth(
                pool,
                accessCondition,
                accessValues
            );
        const { total_overdue_revenue_last_month } =
            await Dashboard.getTotalOverDueRevenueLastMonth(
                pool,
                accessCondition,
                accessValues
            );

        const averageBillAmount =
            total_revenue_count > 0 ? total_revenue / total_revenue_count : 0;
        const averageBillAmountLastMonth =
            total_bill_last_month_count > 0
                ? total_bill_last_month / total_bill_last_month_count
                : 0;

        const totalRevenuePercentile = calculatePercentageIncrease(
            total_bill_last_month || 0,
            total_revenue || 0
        );
        const activeConsumersPercentile = calculatePercentageIncrease(
            total_bill_last_month_count || 0,
            total_revenue_count || 0
        );
        const pendingBillsPercentile = calculatePercentageIncrease(
            total_pending_revenue_last_month || 0,
            total_pending_revenue || 0
        );

        const billGeneratedPercentile = calculatePercentageIncrease(
            averageBillAmountLastMonth || 0,
            averageBillAmount || 0
        );
        const overdueBillsPercentile = calculatePercentageIncrease(
            total_overdue_revenue_last_month || 0,
            total_overdue_revenue || 0
        );
        const newConnectionsPercentile = calculatePercentageIncrease(
            newConnectionsLastMonth || 0,
            newConnections || 0
        );

        res.status(200).json({
            status: 'success',
            data: {
                totalRevenue: formatDecimal(total_revenue),
                totalRevenuePercentile: formatPercentage(
                    totalRevenuePercentile
                ),
                activeConsumers: safeNumber(total_revenue_count),
                activeConsumersPercentile: formatPercentage(
                    activeConsumersPercentile
                ),
                pendingBills: formatDecimal(total_pending_revenue),
                pendingBillsPercentile: formatPercentage(
                    pendingBillsPercentile
                ),
                averageBillAmount: formatDecimal(averageBillAmount),
                averageBillAmountPercentile: formatPercentage(
                    billGeneratedPercentile
                ),
                overdueBills: formatDecimal(total_overdue_revenue),
                overdueBillsPercentile: formatPercentage(
                    overdueBillsPercentile
                ),
                newConnections: safeNumber(newConnections),
                newConnectionsPercentile: formatPercentage(
                    newConnectionsPercentile
                ),
            },
        });
    } catch (error) {
        logger.error('Error fetching reports widgets data', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching report widgets data',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

function formatNumericDate(dateInput) {
    const date = new Date(dateInput);
    if (isNaN(date)) return dateInput;
    return date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata',
        month: 'numeric',
        day: 'numeric',
        year: 'numeric',
    });
}

function formatCreatedAt(dateInput) {
    const date = new Date(dateInput);
    if (isNaN(date)) return dateInput; // Fallback for invalid date
    return date.toLocaleDateString('en-US', {
        timeZone: 'Asia/Kolkata', // Set to Indian Standard Time
        month: 'long',
        year: 'numeric',
    });
}

function convertInvoiceDates(invoices) {
    return invoices.map((invoice) => ({
        ...invoice,
        billing_period_start: formatNumericDate(invoice.billing_period_start),
        billing_period_end: formatNumericDate(invoice.billing_period_end),
        bill_date: formatNumericDate(invoice.bill_date),
        due_date: formatNumericDate(invoice.due_date),
        created_at: formatCreatedAt(invoice.bill_date),
    }));
}

function fillMissingMonths(data) {
    const { monthlyxAxisData, monthlysums } = data;

    if (!monthlyxAxisData || !monthlysums || monthlyxAxisData.length === 0) {
        return { monthlyxAxisData: [], monthlysums: [] };
    }

    const dateValueMap = {};
    monthlyxAxisData.forEach((dateStr, index) => {
        dateValueMap[dateStr] = monthlysums[index];
    });

    const firstDateStr = monthlyxAxisData[0];
    const firstDate = new Date(firstDateStr);

    const currentDate = new Date();

    const completeXAxisData = [];
    const completeSums = [];

    const tempDate = new Date(firstDate);
    tempDate.setDate(1);

    while (tempDate <= currentDate) {
        const formattedDate = tempDate.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
        });

        completeXAxisData.push(formattedDate);

        completeSums.push(dateValueMap[formattedDate] || 0.0);

        tempDate.setMonth(tempDate.getMonth() + 1);
    }

    return {
        monthlyxAxisData: completeXAxisData,
        monthlysums: completeSums,
    };
}

function fillMissingConsumptionDates(data) {
    const { dailyxAxisData, dailysums } = data;

    if (!dailyxAxisData || !dailysums || dailyxAxisData.length === 0) {
        return { dailyxAxisData: [], dailysums: [] };
    }

    const dateValueMap = {};
    dailyxAxisData.forEach((dateStr, index) => {
        const date = new Date(dateStr);
        const day = date.getDate();
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        const year = date.getFullYear();
        const newFormatDateStr = `${day} ${month}, ${year}`;

        dateValueMap[newFormatDateStr] = dailysums[index];
    });

    const firstDateStr = dailyxAxisData[0];
    const firstDate = new Date(firstDateStr);

    const currentDate = new Date();
    const oneDayBefore = new Date(currentDate);
    oneDayBefore.setDate(currentDate.getDate() - 1);

    const completeXAxisData = [];
    const completeSums = [];

    const tempDate = new Date(firstDate);

    while (tempDate < oneDayBefore) {
        const day = tempDate.getDate();
        const month = tempDate.toLocaleDateString('en-US', { month: 'short' });
        const year = tempDate.getFullYear();
        const formattedDate = `${day} ${month}, ${year}`;

        completeXAxisData.push(formattedDate);
        completeSums.push(dateValueMap[formattedDate] || 0.0);
        tempDate.setDate(tempDate.getDate() + 1);
    }

    return {
        dailyxAxisData: completeXAxisData,
        dailysums: completeSums,
    };
}

export const getConsumerByID = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const consumer_uid = req.query.consumer_uid || '';

        const now = new Date();

        const consumer = await Dashboard.getConsumerByID(pool, consumer_uid);
        const dailyConsumption =
            (await Dashboard.geConsumerSpecificConsumptionGraphData(
                pool,
                consumer.meter_serial,
                'daily'
            )) || [];
        const monthlyConsumption =
            (await Dashboard.geConsumerSpecificConsumptionGraphData(
                pool,
                consumer.meter_serial,
                'monthly'
            )) || [];

        const results = await Dashboard.getInvoicesByConsumerUID(
            pool,
            page,
            limit,
            consumer.uid
        );

        const lastbill = await Dashboard.getConsumerLastBillDetails(pool);

        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();

        const startOfCurrentMonth = new Date(
            currentYear,
            currentMonth,
            1,
            0,
            0,
            0,
            0
        );
        const endOfCurrentMonth = new Date(
            currentYear,
            currentMonth + 1,
            0,
            23,
            59,
            59,
            999
        );

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

        const startOfToday = new Date(
            currentYear,
            currentMonth,
            now.getDate(),
            0,
            0,
            0,
            0
        );
        const endOfToday = new Date(
            currentYear,
            currentMonth,
            now.getDate(),
            23,
            59,
            59,
            999
        );

        const yesterday = new Date(now);
        yesterday.setDate(now.getDate() - 1);
        const startOfYesterday = new Date(
            yesterday.getFullYear(),
            yesterday.getMonth(),
            yesterday.getDate(),
            0,
            0,
            0,
            0
        );
        const endOfYesterday = new Date(
            yesterday.getFullYear(),
            yesterday.getMonth(),
            yesterday.getDate(),
            23,
            59,
            59,
            999
        );

        const convertedInvoices = convertInvoiceDates(results.invoices || []);

        // Initialize default values for consumption data
        let dailyCons = { dates: [], values: [] };
        let monthlyCons = { dates: [], values: [] };
        let modifiedLastMonthCons = { dates: [], values: [] };
        let modifiedCurrentMonthCons = { dates: [], values: [] };

        if (dailyConsumption && dailyConsumption.length > 0) {
            let { dailyxAxisData, dailysums } = dailyConsumption.reduce(
                (acc, item) => {
                    acc.dailyxAxisData.push(
                        getDateInMDYFormat(item.consumption_date)
                    );
                    acc.dailysums.push(item.sum ? item.sum.toFixed(2) : '0.00');
                    return acc;
                },
                { dailyxAxisData: [], dailysums: [] }
            );

            dailyCons = fillMissingDatesDyno(
                dailyxAxisData,
                dailysums,
                'DD MMM, YYYY',
                'day'
            );
        }

        if (monthlyConsumption && monthlyConsumption.length > 0) {
            const { monthlyxAxisData, monthlysums } = monthlyConsumption.reduce(
                (acc, item) => {
                    acc.monthlyxAxisData.push(
                        getDateInMDYFormat(item.consumption_date)
                    );
                    acc.monthlysums.push(
                        item.sum ? item.sum.toFixed(2) : '0.00'
                    );
                    return acc;
                },
                { monthlyxAxisData: [], monthlysums: [] }
            );

            monthlyCons = fillMissingDatesDyno(
                monthlyxAxisData,
                monthlysums,
                'DD MMM, YYYY',
                'month'
            );
        }

        const todayConsumption =
            (await Dashboard.getConsumptionWithStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                startOfToday,
                endOfToday,
                consumer.meter_serial
            )) || [];

        const yesterdayConsumption =
            (await Dashboard.getConsumptionWithStartAndEndDate(
                pool,
                accessCondition,
                accessValues,
                startOfYesterday,
                endOfYesterday,
                consumer.meter_serial
            )) || [];

        const currentMonthCons =
            (await Dashboard.getConsumptionGraphDataWithStartAndEndDates(
                pool,
                accessCondition,
                accessValues,
                startOfCurrentMonth,
                endOfCurrentMonth,
                consumer.meter_serial
            )) || [];

        const lastMonthCons =
            (await Dashboard.getConsumptionGraphDataWithStartAndEndDates(
                pool,
                accessCondition,
                accessValues,
                startOfPreviousMonth,
                endOfPreviousMonth,
                consumer.meter_serial
            )) || [];

        if (lastMonthCons && lastMonthCons.length > 0) {
            const { lastMonthConsXaxis, lastMonthConsYaxis } =
                lastMonthCons.reduce(
                    (acc, item) => {
                        acc.lastMonthConsXaxis.push(
                            getDateInMDYFormat(item.consumption_date)
                        );
                        acc.lastMonthConsYaxis.push(
                            parseFloat(item.sum || 0).toFixed(2)
                        );
                        return acc;
                    },
                    { lastMonthConsXaxis: [], lastMonthConsYaxis: [] }
                );

            modifiedLastMonthCons = fillMissingDatesDyno(
                lastMonthConsXaxis,
                lastMonthConsYaxis,
                'DD MMM, YYYY',
                'day'
            );
        }

        if (currentMonthCons && currentMonthCons.length > 0) {
            const { currentMonthConsXaxis, currentMonthConsYaxis } =
                currentMonthCons.reduce(
                    (acc, item) => {
                        acc.currentMonthConsXaxis.push(
                            getDateInMDYFormat(item.consumption_date)
                        );
                        acc.currentMonthConsYaxis.push(
                            parseFloat(item.sum || 0).toFixed(2)
                        );
                        return acc;
                    },
                    { currentMonthConsXaxis: [], currentMonthConsYaxis: [] }
                );

            modifiedCurrentMonthCons = fillMissingDatesDyno(
                currentMonthConsXaxis,
                currentMonthConsYaxis,
                'DD MMM, YYYY',
                'day'
            );
        }

        const xAxisData = generateMatchingDaysArray();

        // Only predict future values if we have current month data
        let yAxis = [];
        if (
            modifiedCurrentMonthCons &&
            modifiedCurrentMonthCons.dates &&
            modifiedCurrentMonthCons.dates.length > 0
        ) {
            const prediction = predictFutureValues(
                {
                    xAxis: modifiedCurrentMonthCons.dates,
                    yAxis: modifiedCurrentMonthCons.values,
                },
                xAxisData
            );
            yAxis = prediction.yAxis || [];
        }

        res.status(200).json({
            status: 'success',
            consumer,
            dailyConsumption: {
                dailyxAxisData: dailyCons.dates || [],
                dailysums: dailyCons.values || [],
            },
            monthlyConsumption: {
                monthlyxAxisData: monthlyCons.dates || [],
                monthlysums: monthlyCons.values || [],
            },
            projectedGraphData: {
                xAxis: xAxisData || [],
                prevMonthyValues: modifiedLastMonthCons.values || [],
                currMonthyValues: yAxis,
            },
            invoices: convertedInvoices,
            lastbill,
            consumption: {
                todayConsumption: todayConsumption || [],
                yesterdayConsumption: yesterdayConsumption || [],
            },
            pagination: results.pagination,
        });
    } catch (error) {
        logger.error('Error fetching consumer with id', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching consumer with id',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

export const getOverdueConsumers = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;

        const result = await Dashboard.getOverdueConsumerTable(
            pool,
            accessCondition,
            accessValues,
            page,
            limit
        );

        res.status(200).json({
            status: 'success',
            data: {
                overdueConsumerDetails: result.data,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        logger.error('Error fetching overdue consumers', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getDisconnectedConsumers = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;

        const result = await Dashboard.getDisconnectedMeters(
            pool,
            accessCondition,
            accessValues,
            page,
            limit
        );

        res.status(200).json({
            status: 'success',
            data: {
                disconnectedMeters: result.data,
                pagination: result.pagination,
            },
        });
    } catch (error) {
        logger.error('Error fetching disconnected consumers', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const searchConsumers = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const searchTerm = req.query.term || '';
        const searchResults = await Dashboard.search(
            pool,
            accessCondition,
            accessValues,
            searchTerm
        );

        res.status(200).json({
            status: 'success',
            data: searchResults,
        });
    } catch (error) {
        logger.error('Error searching consumers', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getHierarchy = async (req, res) => {
    try {
        const hierarchy = await Dashboard.getHierarchy(pool);
        res.status(200).json({
            status: 'success',
            data: hierarchy,
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const bulkUpdate = async (req, res) => {
    // let connection;
    try {
        // connection = connection ? connection : await pool.getConnection();
        let ids = [];
        const data = req.body;
        if (data.updateType == 'bulk') {
            if (data.bulkSelection == 'allPending') {
                await Dashboard.updateAllPendingBills(pool, data.newStatus);
            }

            if (data.bulkSelection == 'byConsumerType') {
                const uids = await Dashboard.getConsumersByType(
                    pool,
                    data.consumerType
                );
                uids.map((id) => ids.push(id.uid));
                if (ids.length == 0) {
                    res.status(200).json({
                        status: 'success',
                    });
                }
                await Dashboard.updateAllBillStatusUsingConsumerType(
                    pool,
                    ids,
                    data.newStatus
                );
            }

            if (data.bulkSelection == 'byDateRange') {
                const startDate = new Date(data.startDate);
                const endDate = new Date(data.endDate);

                const options = {
                    timeZone: 'Asia/Kolkata',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                };

                const startDateIST = new Intl.DateTimeFormat(
                    'en-CA',
                    options
                ).format(startDate);
                const endDateIST = new Intl.DateTimeFormat(
                    'en-CA',
                    options
                ).format(endDate);

                await Dashboard.updateAllBillStatusUsingDateRange(
                    pool,
                    startDateIST,
                    endDateIST,
                    data.newStatus
                );
            }

            if (data.bulkSelection == 'byAmount') {
                const minAmount = parseFloat(data.minAmount);
                const maxAmount = parseFloat(data.maxAmount);

                await Dashboard.updateAllBillStatusUsingAmountRange(
                    pool,
                    minAmount,
                    maxAmount,
                    data.newStatus
                );
            }
        }

        if (data.updateType == 'individual') {
            await Dashboard.updateBillStatusOfSingleUser(
                pool,
                data.invoiceNumber,
                data.newStatus
            );
        }

        res.status(200).json({
            status: 'success',
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

export const getTicketAnalytics = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const analytics = await Dashboard.getTicketAnalytics(
            pool,
            accessCondition,
            accessValues
        );

        res.status(200).json({
            status: 'success',
            data: analytics,
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

const consumerSchema = Joi.object({
    fullName: Joi.string().trim().optional().allow(''),
    consumerId: Joi.string().trim().optional().allow(''),
    primaryMobile: Joi.string().trim().optional().allow(''),
    secondaryMobile: Joi.string().trim().optional().allow(''),
    email: Joi.string().email().optional().allow(''),
    uniqueIdentificationNo: Joi.string().trim().required(),
    permanentAddress: Joi.string().trim().optional().allow(''),
    billingAddress: Joi.string().trim().optional().allow(''),
    block_name: Joi.string().trim().optional().allow(''),
    flat_no: Joi.string().trim().optional().allow(''),
    meter_serial: Joi.string().trim().optional().allow(''),
}).unknown(true);

export const editConsumerDetails = async (req, res) => {
    // let connection;
    try {
        // connection = connection ? connection : await pool.getConnection();
        const { error, value } = consumerSchema.validate(req.body, {
            abortEarly: false,
        });

        if (error) {
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
            });
        }

        const {
            fullName: _fullName,
            consumerId: _consumerId,
            primaryMobile: _primaryMobile,
            secondaryMobile: _secondaryMobile,
            email: _email,
            uniqueIdentificationNo: _uniqueIdentificationNo,
            permanentAddress: _permanentAddress,
            billingAddress: _billingAddress,
            flat_no: _flat_no,
            meter_serial: _meter_serial,
            block_name: _block_name,
        } = value;

        const fullName = _fullName ?? '';
        const consumerId = _consumerId ?? '';
        const primaryMobile = _primaryMobile ?? '';
        const secondaryMobile = _secondaryMobile ?? '';
        const email = _email ?? '';
        const uniqueIdentificationNo = _uniqueIdentificationNo ?? '';
        const permanentAddress = _permanentAddress ?? '';
        const billingAddress = _billingAddress ?? '';
        const flat_no = _flat_no ?? '';
        const meter_serial = _meter_serial ?? '';
        const block_name = _block_name ?? '';

        const consumer = await Dashboard.getConsumerByID(
            pool,
            uniqueIdentificationNo
        );

        if (
            !flat_no ||
            !meter_serial ||
            !consumer.flat_no ||
            !consumer.meter_serial
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Flat number or Block name is missing',
            });
        }

        const trimmedFlatNoValue = flat_no.trim();
        const trimmedFlatNoConsumer = consumer.flat_no.trim();
        const trimmedMeterNoValue = meter_serial.trim();
        const trimmedMeterNoConsumer = consumer.meter_serial.trim();

        const meterOrFlatChanged =
            trimmedFlatNoValue !== trimmedFlatNoConsumer ||
            trimmedMeterNoValue !== trimmedMeterNoConsumer;

        let newUID = consumer.uid;

        if (meterOrFlatChanged) {
            const newBlockLetter = block_name.split('-').pop().trim();
            const currentYear = new Date().getFullYear();

            newUID = await Dashboard.getNewUID(
                pool,
                currentYear,
                newBlockLetter
            );
        }

        await Dashboard.updateConsumer(pool, {
            fullName,
            consumerId,
            primaryMobile,
            secondaryMobile,
            email,
            permanentAddress,
            billingAddress,
        });

        await Dashboard.updateConsumerLkea(pool, {
            block_name,
            flat_no: trimmedFlatNoValue,
            meter_serial: trimmedMeterNoValue,
            consumerId,
            consumer_name: fullName,
            uid: newUID,
        });

        if (meterOrFlatChanged) {
            await Dashboard.insertNewConsumerUID(pool, {
                uid: newUID,
                meter_serial_no: trimmedMeterNoValue,
                flat_no: trimmedFlatNoValue,
                consumer_name: fullName,
            });
        }

        res.status(200).json({
            status: 'success',
            data: newUID,
        });
    } catch (error) {
        logger.error('Error Editing Consumer', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    // }
};

export const cosumerBulkUpload = async (req, res) => {
    // let connection;
    const filePath = path.resolve(req.file.destination, req.file.filename);
    try {
        // connection = connection ? connection : await pool.getConnection();
        const workbook = XLSX.readFile(filePath);
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(sheet);

        if (data.length < 0) {
            return res.status(200).json({
                status: 'error',
                message: 'File is empty',
            });
        }

        for (const consumer of data) {
            const block_name = consumer.BLOCK_NAME || '';
            const flat_no = consumer.FLAT_NO || '';
            const meter_serial = consumer.METER_SERIAL || '';
            const consumerId = consumer.CONSUMER_ID || '';
            const fullName = consumer.CONSUMER_NAME || '';
            const consumer_type = consumer.CONSUMER_TYPE || '';
            const meter_type = consumer.METER_TYPE || '';
            const hierarchy_id = consumer.HIERARCHY_ID || '';

            const newBlockLetter = block_name.split('-').pop().trim().slice(-1);
            const currentYear = new Date().getFullYear();

            const newUID = await Dashboard.getNewUID(
                pool,
                currentYear,
                newBlockLetter
            );

            await Dashboard.insertConsumer(pool, {
                fullName,
                consumerId,
            });
            await Dashboard.insertConsumerLkea(pool, {
                block_name,
                flat_no,
                meter_serial,
                consumerId,
                consumer_name: fullName,
                consumer_type,
                meter_type: 'Prepaid',
                hierarchy_id,
                uid: newUID,
            });
            await Dashboard.insertNewConsumerUID(pool, {
                uid: newUID,
                meter_serial_no: meter_serial,
                flat_no,
                consumer_name: fullName,
            });
        }

        res.status(200).json({
            status: 'success',
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
    // finally {
    //     if (connection) connection.release();
    //     fs.unlinkSync(filePath);
    // }
};

export const getReportsGraphAnalytics = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const analytics = await Dashboard.reportGraphAnalytics(
            pool,
            accessCondition,
            accessValues
        );
        const amounts = await Dashboard.getTotalBillAmountForAllMonths(
            pool,
            accessCondition,
            accessValues
        );
        const formattedDates = formatDatesMY(amounts);

        const xAxisData = formattedDates.map((item) => item.month);
        const seriesData = [
            {
                name: 'Total Amount Generated',
                data: formattedDates.map((item) =>
                    parseFloat(item.total_amount_generated)
                ),
            },
            {
                name: 'Total Paid Amount',
                data: formattedDates.map((item) =>
                    parseFloat(item.total_paid_amount)
                ),
            },
            {
                name: 'Total Overdue Amount',
                data: formattedDates.map((item) =>
                    parseFloat(item.total_overdue_amount)
                ),
            },
        ];

        res.status(200).json({
            status: 'success',
            data: {
                consumer_types: analytics,
                amounts: {
                    xAxisData,
                    seriesData,
                },
            },
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getTicketTrends = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const trendsData = await Dashboard.getLastTwelveMonthsTrends(
            pool,
            accessCondition,
            accessValues
        );

        const formattedData = formatDatesMY(trendsData);

        const result = {
            xAxisData: formattedData.map((row) => row.month),
            seriesData: [
                {
                    name: 'Open',
                    data: formattedData.map((row) => parseInt(row.open_count)),
                },
                {
                    name: 'In Progress',
                    data: formattedData.map((row) =>
                        parseInt(row.in_progress_count)
                    ),
                },
                {
                    name: 'Resolved',
                    data: formattedData.map((row) =>
                        parseInt(row.resolved_count)
                    ),
                },
                {
                    name: 'Closed',
                    data: formattedData.map((row) =>
                        parseInt(row.closed_count)
                    ),
                },
            ],
        };

        res.status(200).json({
            status: 'success',
            data: result,
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getTicketTable = async (req, res) => {
    try {
        const accessCondition = req.locationAccess?.condition || '';
        const accessValues = req.locationAccess?.values || [];

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;

        const tickets = await Dashboard.getTicketsWithConsumerDetails(
            pool,
            accessCondition,
            accessValues,
            page,
            limit
        );
        res.status(200).json({
            status: 'success',
            data: tickets,
            pagination: tickets.pagination,
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

const hierarchyEntrySchema = Joi.object({
    location_id: Joi.number().required(),
    location_name: Joi.string().required().trim(),
    description: Joi.string().allow('', null),
    parent_location_id: Joi.string().allow(null),
    location_type: Joi.string()
        .required()
        .valid(
            'Country',
            'State',
            'City',
            'Area',
            'Builder',
            'Township',
            'Block'
        ),
    active_flag: Joi.string().required().valid('1', '0'),
});

const hierarchyArraySchema = Joi.array().items(hierarchyEntrySchema);

export const editHierarchy = async (req, res) => {
    try {
        const hierarchyData = req.body;

        const { error, value } = hierarchyArraySchema.validate(hierarchyData, {
            abortEarly: false,
        });

        if (error) {
            logger.error('Validation error in hierarchy data', {
                errors: error.details,
                timestamp: new Date().toISOString(),
            });

            return res.status(400).json({
                status: 'error',
                message: 'Invalid input data',
                errors: error.details.map((err) => ({
                    field: err.path.join('.'),
                    message: err.message,
                })),
            });
        }

        await Dashboard.insertNewHierarchy(pool, value);

        res.status(200).json({
            status: 'success',
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const bulkRemainder = async (req, res) => {
    try {
        const reminder = req.body;
        if (!reminder || !reminder.type) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid input parameters',
            });
        }

        const bills = await Dashboard.sendBulkRemainders(pool, reminder);

        const BATCH_SIZE = 50;
        // for (let i = 0; i < bills.length; i += BATCH_SIZE) {
        //     const batch = bills.slice(i, i + BATCH_SIZE);
        //     await Promise.all(
        //         batch.map(async (bill) => {
        //             const emailData = {
        //                 to: bill.consumer_email,
        //                 subject: `Electricity Bill Reminder - ${bill.invoice_id}`,
        //                 template: 'electricity-bill-reminder',
        //                 data: {
        //                     consumerName: bill.consumer_name,
        //                     consumerNo: bill.consumer_id,
        //                     billNo: bill.invoice_id,
        //                     billMonth: new Date(
        //                         bill.billing_period_start
        //                     ).toLocaleString('default', { month: 'long' }),
        //                     billFromDate: bill.billing_period_start,
        //                     billToDate: bill.billing_period_end,
        //                     presentBillAmount: bill.amount,
        //                     previousBalance: bill.due_amount - bill.amount,
        //                     balance: bill.due_amount,
        //                     dueDate: bill.due_date,
        //                 },
        //             };

        //             try {
        //                 await sendEmail(emailData);
        //             } catch (error) {
        //                 logger.error('Error sending reminder email', {
        //                     error: error.message,
        //                     invoiceId: bill.invoice_id,
        //                     timestamp: new Date().toISOString(),
        //                 });
        //             }
        //         })
        //     );
        // }

        res.status(200).json({
            status: 'success',
            // data: tickets,
            // pagination: tickets.pagination,
        });
    } catch (error) {
        logger.error('Error fetching hierarchy', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const disconnectConsumer = async (req, res) => {
    try {
        const uid = req.params.uid;
        const status = 'Disconnected';
        const { meter_serial, consumer_id } = await Dashboard.getConsumerByID(
            pool,
            uid
        );

        const due_amount = await Dashboard.getConsumerOverdueByUID(pool, uid);
        const data = {
            uid,
            meter_serial,
            consumer_id,
            due_amount,
            status,
        };

        await Dashboard.disconnectConsumer(pool, data);

        res.status(200).json({
            status: 'success',
            message: 'Successfully Disconnected Consumer',
        });
    } catch (error) {
        logger.error('Error disconnecting Consumer', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const reconnectConsumer = async (req, res) => {
    try {
        const uid = req.params.uid;
        await Dashboard.deleteMeterByUid(pool, uid);

        res.status(200).json({
            status: 'success',
            message: 'Successfully Reconnected Consumer',
        });
    } catch (error) {
        logger.error('Error disconnecting Consumer', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

const newconsumerSchema = Joi.object({
    flat_no: Joi.string().required(),
    meter_serial: Joi.string().required(),
    consumer_id: Joi.string().required(),
    consumer_name: Joi.string().required(),
    consumer_type: Joi.string()
        .valid('residential', 'commercial', 'industrial', 'sez')
        .required(),
    meter_type: Joi.string().valid('prepaid', 'postpaid').required(),
    mobile_number: Joi.string()
        .pattern(/^[0-9]{10}$/)
        .messages({
            'string.pattern.base': 'Mobile number must be a 10-digit number',
        }),
    email_address: Joi.string().email(),
    permanent_address: Joi.string(),
    billing_address: Joi.string(),
    parent_hierarchy_id: Joi.string().required(),
    block_name: Joi.string().required(),
});

export const addNewConsumer = async (req, res) => {
    try {
        const data = req.body;

        const { error, value } = newconsumerSchema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid request data',
                errors: error.details.map((err) => ({
                    field: err.path[0],
                    message: err.message,
                })),
            });
        }
        const {
            flat_no: _flat_no,
            meter_serial: _meter_serial,
            consumer_id: _consumerId,
            consumer_name: _consumer_name,
            consumer_type: _consumer_type,
            meter_type: _meter_type,
            mobile_number: _mobile_number,
            email_address: _email_address,
            permanent_address: _permanent_address,
            billing_address: _billing_address,
            parent_hierarchy_id: _parent_hierarchy_id,
            block_name: _block_name,
        } = value;

        const flat_no = _flat_no ?? '';
        const meter_serial = _meter_serial ?? '';
        const consumerId = _consumerId ?? '';
        const consumer_name = _consumer_name ?? '';
        const consumer_type = _consumer_type ?? '';
        const meter_type = _meter_type ?? '';
        const mobile_number = _mobile_number ?? '';
        const email_address = _email_address ?? '';
        const permanent_address = _permanent_address ?? '';
        const billing_address = _billing_address ?? '';
        const parent_hierarchy_id = _parent_hierarchy_id ?? '';
        const block_name = _block_name ?? '';

        const currentYear = new Date().getFullYear();
        const newBlockLetter = _block_name.split('-').pop().trim().slice(-1);

        const uid = await Dashboard.getNewUID(
            pool,
            currentYear,
            newBlockLetter
        );

        const newData = {
            block_name,
            flat_no,
            meter_serial,
            consumerId,
            consumer_name,
            consumer_type,
            meter_type,
            parent_hierarchy_id,
            uid,
            permanent_address,
            billing_address,
            mobile_number,
            email_address,
        };

        await Dashboard.newConsumer(pool, newData);

        res.status(200).json({
            status: 'success',
        });
    } catch (error) {
        logger.error('Error disconnecting Consumer', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getPowerWidgets = async (req, res) => {
    try {
        const meter = req.query.meterOrUid;

        const consumer = await Dashboard.getConsumerByIDOrMeter(pool, meter);
        const meter_serial = consumer.meter_serial;

        const last_comm_date = await Dashboard.getMeterLastCommunicationDate(
            pool,
            meter_serial
        );
        const last_comm = await Dashboard.getMeterLastCommunication(
            pool,
            meter_serial
        );

        const power = await Dashboard.getVoltage(pool, meter_serial);

        res.status(200).json({
            status: 'success',
            data: {
                last_comm_date,
                last_comm,
                power,
            },
        });
    } catch (error) {
        logger.error('Error getting power', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

function fillMissingConsDates(data) {
    const dates = data.xAxis;
    const values = data.yAxis;

    const startDate = new Date(dates[0]);

    const endDate = new Date(
        startDate.getFullYear(),
        startDate.getMonth() + 1,
        0
    );

    const completeDates = [];
    const completeValues = [];

    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const formattedDate = `${currentDate.toLocaleDateString('en-US', {
            month: 'short',
        })} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
        const originalIndex = dates.indexOf(formattedDate);
        completeDates.push(formattedDate);
        completeValues.push(
            originalIndex !== -1 ? values[originalIndex] : '0.0'
        );

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
        xAxis: completeDates,
        yAxis: completeValues,
    };
}

function generateMatchingDaysArray(referenceDate = new Date()) {
    const dateArray = [];

    const currentDate = new Date(referenceDate);

    const prevMonth =
        currentDate.getMonth() === 0 ? 11 : currentDate.getMonth() - 1;
    const prevMonthYear =
        currentDate.getMonth() === 0
            ? currentDate.getFullYear() - 1
            : currentDate.getFullYear();

    const daysInPrevMonth = new Date(prevMonthYear, prevMonth + 1, 0).getDate();

    currentDate.setDate(1);

    for (let i = 0; i < daysInPrevMonth; i++) {
        const day = currentDate.getDate();
        const month = currentDate.toLocaleString('en-US', { month: 'short' });
        const year = currentDate.getFullYear();
        const formattedDate = `${month} ${day}, ${year}`;

        dateArray.push(formattedDate);

        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dateArray;
}

export const getPowerGraphs = async (req, res) => {
    try {
        const meter = req.query.meterOrUid;

        const consumer = await Dashboard.getConsumerByIDOrMeter(pool, meter);
        const meter_serial = consumer.meter_serial;

        const readings = await Dashboard.graphDemoReportsAnalytics(
            pool,
            meter_serial
        );

        const md_consumption =
            await Dashboard.graphDemoCumulativeReportsAnalytics(
                pool,
                meter_serial
            );

        const { readingsxAxisData, readingssums } = readings.reduce(
            (acc, item) => {
                acc.readingsxAxisData.push(
                    getDateInMDYFormat(item.consumption_date)
                );
                acc.readingssums.push(item.sum);
                return acc;
            },
            { readingsxAxisData: [], readingssums: [] }
        );
        const modifiedReadings = fillMissingReadingDates({
            readingsxAxisData,
            readingssums,
        });

        let startDate = modifiedReadings.dailyxAxisData[0];
        const md_data = fillMissingMDData(md_consumption, startDate);

        const { mdxAxisData, mdsums } = md_data.reduce(
            (acc, item) => {
                acc.mdxAxisData.push(getDateInMDYFormat(item.date));
                acc.mdsums.push(item.value);
                return acc;
            },
            { mdxAxisData: [], mdsums: [] }
        );

        res.status(200).json({
            status: 'success',
            data: {
                consumption: {
                    dailyxAxisData: modifiedReadings.dailyxAxisData,
                    dailysums: modifiedReadings.dailysums,
                },
                md_kw: {
                    mdxAxisData,
                    mdsums,
                },
            },
        });
    } catch (error) {
        logger.error('Error getting Demo Graphs', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};
