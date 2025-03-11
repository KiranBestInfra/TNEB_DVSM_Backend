import logger from '../../utils/logger.js';
import Demo from '../../models/demo/dashboard.model.js';
import pool from '../../config/db.js';
import {
    calculateTotalOutstanding,
    transformMeters,
} from '../../utils/dashboardUtils.js';

export const getMainWidgets = async (req, res) => {
    try {
        const consumers = await Demo.getConsumerTypeCount(pool);
        const activeStatus = await Demo.getActiveStatus(pool);
        const usersCount = await Demo.getUserConsumptionCategory(pool);
        const tariffs = await Demo.getTariffRates(pool);
        const { total_revenue, total_revenue_count } =
            await Demo.getTotalRevenueCurrentMonth(pool);
        const { total_bill_last_month, count: total_bill_last_month_count } =
            await Demo.getTotalRevenueLastMonth(pool);
        const { total_overdue_bill, total_overdue_bill_count } =
            await Demo.getOverdueConsumersCount(pool);
        const { total_pending_bill, total_pending_bill_count } =
            await Demo.getPendingConsumersCount(pool);
        const totalOutstanding = calculateTotalOutstanding(
            total_pending_bill,
            total_overdue_bill
        );

        const now = new Date();

        const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
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

        const firstOfMonthTimestamp = formatDate(firstOfMonth);
        const todayStartTimestamp = formatDate(startOfToday);
        const todayEndTimestamp = formatDate(endOfToday);
        const yesterdayStartTimestamp = formatDate(startOfYesterday);
        const yesterdayEndTimestamp = formatDate(endOfYesterday);
        const dayBeforeYesterdayStartTimestamp = formatDate(
            startOfDayBeforeYesterday
        );
        const dayBeforeYesterdayEndTimestamp = formatDate(
            endOfDayBeforeYesterday
        );

        const todayConsumption = await Demo.getConsumptionWithStartAndEndDate(
            pool,
            todayStartTimestamp,
            todayEndTimestamp
        );
        const yesterdayConsumption =
            await Demo.getConsumptionWithStartAndEndDate(
                pool,
                yesterdayStartTimestamp,
                yesterdayEndTimestamp
            );
        const dayBeforeYesterdayConsumption =
            await Demo.getConsumptionWithStartAndEndDate(
                pool,
                dayBeforeYesterdayStartTimestamp,
                dayBeforeYesterdayEndTimestamp
            );

        const { total_bill_generated: todayTotalRevenue } =
            await Demo.getTotalRevenueByStartAndEndDate(
                pool,
                null,
                tariffs,
                todayStartTimestamp,
                todayEndTimestamp
            );
        const { total_bill_generated: yesterdayTotalRevenue } =
            await Demo.getTotalRevenueByStartAndEndDate(
                pool,
                null,
                tariffs,
                yesterdayStartTimestamp,
                yesterdayEndTimestamp
            );
        const { total_bill_generated: dayBeforeYesterdayTotalRevenue } =
            await Demo.getTotalRevenueByStartAndEndDate(
                pool,
                null,
                tariffs,
                dayBeforeYesterdayStartTimestamp,
                dayBeforeYesterdayEndTimestamp
            );

        const activeUnits = activeStatus.active_count;
        const inactiveUnits = activeStatus.inactive_count;

        const { postpaid, prepaid } = await Demo.getDisconnectedConsumerCount(
            pool
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
                todayConsumption,
                todayTotalRevenue,
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
};

export const getMainGraphAnalytics = async (req, res) => {
    try {
        const consumptionOnDaily = await Demo.graphDashboardAnalytics(
            pool,
            'daily'
        );
        const consumptionOnMonthly = await Demo.graphDashboardAnalytics(
            pool,
            'monthly'
        );
        const billingAndCollectionData =
            await Demo.getBillingAndCollectionGraphData(pool);

        const { dailyxAxisData, dailysums } = consumptionOnDaily.reduce(
            (acc, item) => {
                acc.dailyxAxisData.push(
                    getDateInMDYFormat(item.consumption_date)
                );
                acc.dailysums.push(item.sum.toFixed(2));
                return acc;
            },
            { dailyxAxisData: [], dailysums: [] }
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
        const { billMonth, totalBillCount, pendingBillCount, paidBillCount } =
            billingAndCollectionData.reduce(
                (acc, item) => {
                    acc.billMonth.push(formatYearMonth(item.bill_month));
                    acc.totalBillCount.push(item.total_bill_count);
                    acc.pendingBillCount.push(item.pending_bill_count);
                    acc.paidBillCount.push(item.paid_bill_count);
                    return acc;
                },
                {
                    billMonth: [],
                    totalBillCount: [],
                    pendingBillCount: [],
                    paidBillCount: [],
                }
            );

        const billingData = {
            billMonth,
            totalBillCount,
            pendingBillCount,
            paidBillCount,
        };

        const dailyData = {
            xAxisData: dailyxAxisData,
            sums: dailysums,
        };

        const monthlyData = {
            xAxisData: monthlyxAxisData,
            sums: monthlysums,
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
};

export const getOverdueConsumers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;

        const result = await Demo.getOverdueConsumerTable(pool, page, limit);

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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;

        const result = await Demo.getDisconnectedMeters(pool, page, limit);
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

export const getConsumersTable = (
    with_pagination = 'true',
    consumer_no = ''
) => {
    return async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 5;
            const status = req.query.communicationStatus || '';
            let meters = [];
            let activeFlag = '';

            if (status == 'non-communicating') {
                activeFlag = 'non-comm';
                meters = await Demo.getInActiveMeters(pool);
            } else if (status == 'communicating') {
                activeFlag = 'comm';
                meters = await Demo.getActiveMeters(pool);
            }
            const meterNumbers = transformMeters(meters, activeFlag);

            const result = await Demo.getConsumersTable(
                pool,
                page,
                limit,
                with_pagination,
                consumer_no,
                activeFlag.length > 0 ? meterNumbers : null
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
    };
};

export const getTariffRates = async (req, res) => {
    try {
        const tariffs = await Demo.getTariffRates(pool);

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

export const getHierarchy = async (req, res) => {
    try {
        const hierarchy = await Demo.getHierarchy(pool);
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

export const getReportsWidgets = async (req, res) => {
    try {
        const { start, end } = req.query;
        const startDate = start ? new Date(start) : null;
        const endDate = end ? new Date(end) : null;

        const newConnections = await Demo.newConnections(
            pool,
            startDate,
            endDate
        );
        const newConnectionsLastMonth = await Demo.newConnectionsLastMonth(
            pool
        );

        // const { total_revenue, total_revenue_count } =
        //     await Dashboard.getTotalRevenueCurrentMonth(
        //         pool,
        //         startDate,
        //         endDate
        //     );
        // const { total_pending_revenue } =
        //     await Dashboard.getTotalPendingRevenueCurrentMonth(
        //         pool,
        //         startDate,
        //         endDate
        //     );
        // const { total_overdue_revenue } =
        //     await Dashboard.getTotalOverDueRevenueCurrentMonth(
        //         pool,
        //         startDate,
        //         endDate
        //     );

        // const { total_bill_last_month, count: total_bill_last_month_count } =
        //     await Dashboard.getTotalRevenueLastMonth(pool);
        // const { total_pending_revenue_last_month } =
        //     await Dashboard.getTotalPendingRevenueLastMonth(pool);
        // const { total_overdue_revenue_last_month } =
        //     await Dashboard.getTotalOverDueRevenueLastMonth(pool);

        // const averageBillAmount =
        //     total_revenue_count > 0 ? total_revenue / total_revenue_count : 0;
        // const averageBillAmountLastMonth =
        //     total_bill_last_month_count > 0
        //         ? total_bill_last_month / total_bill_last_month_count
        //         : 0;

        // const totalRevenuePercentile = calculatePercentageIncrease(
        //     total_bill_last_month || 0,
        //     total_revenue || 0
        // );
        // const activeConsumersPercentile = calculatePercentageIncrease(
        //     total_bill_last_month_count || 0,
        //     total_revenue_count || 0
        // );
        // const pendingBillsPercentile = calculatePercentageIncrease(
        //     total_pending_revenue_last_month || 0,
        //     total_pending_revenue || 0
        // );

        // const billGeneratedPercentile = calculatePercentageIncrease(
        //     averageBillAmountLastMonth || 0,
        //     averageBillAmount || 0
        // );
        // const overdueBillsPercentile = calculatePercentageIncrease(
        //     total_overdue_revenue_last_month || 0,
        //     total_overdue_revenue || 0
        // );
        // const newConnectionsPercentile = calculatePercentageIncrease(
        //     newConnectionsLastMonth || 0,
        //     newConnections || 0
        // );

        // res.status(200).json({
        //     status: 'success',
        //     data: {
        //         totalRevenue: total_revenue || 0,
        //         totalRevenuePercentile: totalRevenuePercentile.toFixed(2),
        //         activeConsumers: total_revenue_count || 0,
        //         activeConsumersPercentile: activeConsumersPercentile.toFixed(2),
        //         pendingBills: total_pending_revenue || 0,
        //         pendingBillsPercentile: pendingBillsPercentile,
        //         averageBillAmount: averageBillAmount.toFixed(2) || 0,
        //         averageBillAmountPercentile: billGeneratedPercentile.toFixed(2),
        //         overdueBills: total_overdue_revenue || 0,
        //         overdueBillsPercentile: overdueBillsPercentile.toFixed(2),
        //         newConnections: newConnections || 0,
        //         newConnectionsPercentile: newConnectionsPercentile.toFixed(2),
        //     },
        // });
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