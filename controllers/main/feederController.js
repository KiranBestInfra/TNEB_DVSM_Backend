import pool from '../../config/db.js';
import Feeders from '../../models/main/feeders.model.js';
import Regions from '../../models/main/regions.model.js';
import Substations from '../../models/main/substations.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';

export const fetchFeederGraphs = async (socket, feeders) => {
    try {
        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        const feederDemandData = {};

        for (const feeder of feeders) {
            const hierarchy = await Feeders.getHierarchyByFeeder(pool, feeder);
            const meters = await Feeders.getFeederMeters(
                pool,
                null,
                hierarchy.hierarchy_type_id,
                hierarchy.hierarchy_id
            );

            if (!meters || meters.length === 0) {
                const detailedGraphData = {
                    xAxis: [],
                    series: [
                        {
                            name: 'Current Day',
                            data: [],
                        },
                        {
                            name: 'Previous Day',
                            data: [],
                        },
                    ],
                };

                feederDemandData[feeder] = detailedGraphData;
                if (feederDemandData[feeder]) {
                    socket.emit('feederUpdate', {
                        feeder,
                        graphData: feederDemandData[feeder],
                    });
                }
                continue;
            }

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const meterMap = {};
            const meterCal = await Feeders.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no;
                meterMap[id] = meter.scaling_factor;
            });

            const todayDemandData = await Feeders.getDemandTrendsData(
                pool,
                null,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-27 00:00:00'
                    : startOfDay,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-27 23:59:59'
                    : endOfDay,
                hierarchyMeters
            );

            const yesterdayDemandData = await Feeders.getDemandTrendsData(
                pool,
                null,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-26 00:00:00'
                    : startOfYesterday,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-26 23:59:59'
                    : endOfYesterday,
                hierarchyMeters
            );

            const todayGroupedDemand = {};
            const yesterdayGroupedDemand = {};

            todayDemandData.forEach((record) => {
                const meterNo = record.meter_no;
                const scalingFactor = meterMap[meterNo];
                if (scalingFactor === undefined) return;

                const demandMW = record.kwh * scalingFactor;
                const timeKey = record.datetime;
                if (!todayGroupedDemand[timeKey]) {
                    todayGroupedDemand[timeKey] = 0;
                }
                todayGroupedDemand[timeKey] += demandMW;
            });

            yesterdayDemandData.forEach((record) => {
                const meterNo = record.meter_no;
                const scalingFactor = meterMap[meterNo];
                if (scalingFactor === undefined) return;

                const demandMW = record.kwh * scalingFactor;
                const timeKey = record.datetime;
                if (!yesterdayGroupedDemand[timeKey]) {
                    yesterdayGroupedDemand[timeKey] = 0;
                }
                yesterdayGroupedDemand[timeKey] += demandMW;
            });

            const todayFinalResults = Object.keys(todayGroupedDemand)
                .sort((a, b) => new Date(a) - new Date(b))
                .map((time) => ({
                    datetime: time,
                    actual_demand_mw: Number(
                        todayGroupedDemand[time].toFixed(4)
                    ),
                }));

            const yesterdayFinalResults = Object.keys(yesterdayGroupedDemand)
                .sort((a, b) => new Date(a) - new Date(b))
                .map((time) => ({
                    datetime: time,
                    actual_demand_mw: Number(
                        yesterdayGroupedDemand[time].toFixed(4)
                    ),
                }));

            const xAxis = [];
            const currentDayData = [];
            const previousDayData = [];

            const allTimestamps = new Set([
                ...todayFinalResults.map((d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss')
                ),
                ...yesterdayFinalResults.map((d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss')
                ),
            ]);

            const sortedTimestamps = Array.from(allTimestamps).sort(
                (a, b) =>
                    moment(a, 'HH:mm:ss').valueOf() -
                    moment(b, 'HH:mm:ss').valueOf()
            );

            const now = moment();

            sortedTimestamps.forEach((timestamp) => {
                const todayData = todayFinalResults.find((d) => {
                    const dataTime = moment(new Date(d.datetime));
                    const timeDiff = now.diff(dataTime, 'minutes');
                    return (
                        dataTime.format('HH:mm:ss') === timestamp &&
                        dataTime.isSameOrBefore(now) &&
                        timeDiff > 180
                    );
                });
                const yesterdayData = yesterdayFinalResults.find((d) => {
                    const dataTime = moment(new Date(d.datetime));
                    return (
                        dataTime.format('HH:mm:ss') === timestamp &&
                        dataTime.isSameOrBefore(now)
                    );
                });

                const todayValue = todayData
                    ? todayData.actual_demand_mw
                    : undefined;
                const yesterdayValue = yesterdayData
                    ? yesterdayData.actual_demand_mw
                    : undefined;

                if (
                    (todayValue !== undefined && todayValue != 0) ||
                    (yesterdayValue !== undefined && yesterdayValue != 0)
                ) {
                    xAxis.push(timestamp);
                    if (todayValue !== undefined && todayValue != 0) {
                        currentDayData.push(todayValue);
                    }
                    if (yesterdayValue !== undefined && yesterdayValue != 0) {
                        previousDayData.push(yesterdayValue);
                    }
                }
            });

            const detailedGraphData = {
                xAxis,
                series: [
                    {
                        name: 'Current Day',
                        data: currentDayData,
                    },
                    {
                        name: 'Previous Day',
                        data: previousDayData,
                    },
                ],
            };

            feederDemandData[feeder] = detailedGraphData;
            if (feederDemandData[feeder]) {
                socket.emit('feederUpdate', {
                    feeder,
                    graphData: feederDemandData[feeder],
                });
            }
        }

        // return feederDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);
    }
};
export const getFeedersDataByRegion = async (req, res) => {
    try {
        const user = req.user || null;
        const region = user ? user.user_hierarchy_id : req.params.region;

        const deviceDate = '2025-03-09';
        const feedersWithCount = await Feeders.getFeederNamesByRegion(
            pool,
            region
        );
        const commMeters = await Regions.getRegionCommMeterCounts(
            pool,
            region,
            deviceDate
        );
        const nonCommMeters = await Regions.getRegionNonCommMeterCounts(
            pool,
            region,
            deviceDate
        );
        res.status(200).json({
            status: 'success',
            data: {
                feedersWithCount,
                commMeters,
                nonCommMeters,
            },
        });
    } catch (error) {
        logger.error('Error fetching feeders widgets:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export const getFeedersNamesByEdcNameHandler = async (req, res) => {
    try {
        let edcName = req.params.edc;
        edcName = edcName.replace(/-/g, ' ');
        const edcInfo = await Feeders.getEdcIdByName(pool, edcName);

        if (!edcInfo) {
            return res.status(404).json({
                status: 'error',
                message: `No EDC found with name: ${edcName}`,
            });
        }

        const edcId = edcInfo.hierarchy_id;

        const feedersWithCount = await Feeders.getFeederNamesByEdcId(
            pool,
            edcId
        );

        res.status(200).json({
            status: 'success',
            data: {
                edc_id: edcId,
                edcFeederNames: feedersWithCount,
            },
        });
    } catch (error) {
        logger.error('Error fetching feeder names by EDC name:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};
export const getFeedersWidgets = async (req, res) => {
    try {
        const totalFeeders = await Feeders.getTotalFeeders(pool);
        const commMeters = await Feeders.getCommMeters(pool);
        const nonCommMeters = await Feeders.getNonCommMeters(pool);
        //  const regionFeederNames = await Feeders.getFeederNamesByRegion(pool,region);

        res.status(200).json({
            status: 'success',
            data: {
                totalFeeders,
                commMeters,
                nonCommMeters,
                // regionFeederNames: regionFeederNames.map(
                //     (region) => region.hierarchy_name
                // ),
            },
        });
    } catch (error) {
        logger.error('Error fetching feeders widgets:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};
export const getFeedersBySubstationName = async (req, res) => {
    try {
        const user = req.user || null;
        const substationId = req.params.substationId;

        if (user && !substationId) {
            const substations = await Substations.getSubstationNamesByRegion(
                pool,
                user.user_hierarchy_id
            );

            const substationIDs = substations.map(
                (substation) => substation.id
            );

            if (
                !substationIDs
                    .map((id) => Number(id))
                    .includes(Number(substationId))
            ) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Unauthorized access to substation data',
                });
            }
        }

        const feeders = await Feeders.getFeederNamesBySubstationId(
            pool,
            substationId
        );
        const commMeters = await Substations.getFeedersCommMeterCounts(
            pool,
            substationId
        );
        const nonCommMeters = await Substations.getFeedersNonCommMeterCounts(
            pool,
            substationId
        );

        res.status(200).json({
            status: 'success',
            data: {
                substation_id: substationId,
                commMeters,
                nonCommMeters,
                feeders,
            },
        });
    } catch (error) {
        logger.error('Error fetching feeders by substation name:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export const demandGraph = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const feederID = req.params.feederID || null;
        if (feederID) {
            const feederHierarchy = await Feeders.getHierarchyByFeeder(
                pool,
                feederID
            );
            const meters = await Feeders.getFeederMeters(
                pool,
                null,
                feederHierarchy.hierarchy_type_id,
                feederHierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const { startOfDay, endOfDay } = getTodayStartAndEnd();
            const { startOfYesterday, endOfYesterday } =
                getYesterdayStartAndEnd();

            const meterMap = {};
            const meterCal = await Feeders.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no;
                meterMap[id] = meter.scaling_factor;
            });

            const todayDemandData = await Feeders.getDemandTrendsData(
                pool,
                accessValues,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-27 00:00:00'
                    : startOfDay,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-27 23:59:59'
                    : endOfDay,
                hierarchyMeters
            );

            const yesterdayDemandData = await Feeders.getDemandTrendsData(
                pool,
                accessValues,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-26 00:00:00'
                    : startOfYesterday,
                process.env.NODE_ENV === 'development'
                    ? '2025-03-26 23:59:59'
                    : endOfYesterday,
                hierarchyMeters
            );

            const todayGroupedDemand = {};
            const yesterdayGroupedDemand = {};

            todayDemandData.forEach((record) => {
                const meterNo = record.meter_no;
                const scalingFactor = meterMap[meterNo];
                if (scalingFactor === undefined) return;

                const demandMW = record.kwh * scalingFactor;
                const timeKey = record.datetime;
                if (!todayGroupedDemand[timeKey]) {
                    todayGroupedDemand[timeKey] = 0;
                }
                todayGroupedDemand[timeKey] += demandMW;
            });

            yesterdayDemandData.forEach((record) => {
                const meterNo = record.meter_no;
                const scalingFactor = meterMap[meterNo];
                if (scalingFactor === undefined) return;

                const demandMW = record.kwh * scalingFactor;
                const timeKey = record.datetime;
                if (!yesterdayGroupedDemand[timeKey]) {
                    yesterdayGroupedDemand[timeKey] = 0;
                }
                yesterdayGroupedDemand[timeKey] += demandMW;
            });

            const todayFinalResults = Object.keys(todayGroupedDemand)
                .sort((a, b) => new Date(a) - new Date(b))
                .map((time) => ({
                    datetime: time,
                    actual_demand_mw: Number(
                        todayGroupedDemand[time].toFixed(4)
                    ),
                }));

            const yesterdayFinalResults = Object.keys(yesterdayGroupedDemand)
                .sort((a, b) => new Date(a) - new Date(b))
                .map((time) => ({
                    datetime: time,
                    actual_demand_mw: Number(
                        yesterdayGroupedDemand[time].toFixed(4)
                    ),
                }));

            const xAxis = [];
            const currentDayData = [];
            const previousDayData = [];

            const allTimestamps = new Set([
                ...todayFinalResults.map((d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss')
                ),
                ...yesterdayFinalResults.map((d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss')
                ),
            ]);

            const sortedTimestamps = Array.from(allTimestamps).sort(
                (a, b) =>
                    moment(a, 'HH:mm:ss').valueOf() -
                    moment(b, 'HH:mm:ss').valueOf()
            );

            const now = moment();

            sortedTimestamps.forEach((timestamp) => {
                const todayData = todayFinalResults.find((d) => {
                    const dataTime = moment(new Date(d.datetime));
                    const timeDiff = now.diff(dataTime, 'minutes');
                    return (
                        dataTime.format('HH:mm:ss') === timestamp &&
                        dataTime.isSameOrBefore(now) &&
                        timeDiff > 180
                    );
                });
                const yesterdayData = yesterdayFinalResults.find((d) => {
                    const dataTime = moment(new Date(d.datetime));
                    return (
                        dataTime.format('HH:mm:ss') === timestamp &&
                        dataTime.isSameOrBefore(now)
                    );
                });

                const todayValue = todayData
                    ? todayData.actual_demand_mw
                    : undefined;
                const yesterdayValue = yesterdayData
                    ? yesterdayData.actual_demand_mw
                    : undefined;

                if (
                    (todayValue !== undefined && todayValue != 0) ||
                    (yesterdayValue !== undefined && yesterdayValue != 0)
                ) {
                    xAxis.push(timestamp);
                    if (todayValue !== undefined && todayValue != 0) {
                        currentDayData.push(todayValue);
                    }
                    if (yesterdayValue !== undefined && yesterdayValue != 0) {
                        previousDayData.push(yesterdayValue);
                    }
                }
            });

            const detailedGraphData = {
                xAxis,
                series: [
                    {
                        name: 'Current Day',
                        data: currentDayData,
                    },
                    {
                        name: 'Previous Day',
                        data: previousDayData,
                    },
                ],
            };

            return res.status(200).json({
                status: 'success',
                data: detailedGraphData,
            });
        }

        const meterMap = {};
        const meterCal = await Feeders.getMeterCalculation(
            pool,
            null,
            hierarchyMeters
        );

        meterCal.forEach((meter) => {
            const id = meter.meter_serial_no;
            meterMap[id] = meter.scaling_factor;
        });

        const todayDemandData = await Feeders.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 00:00:00'
                : startOfDay,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 23:59:59'
                : endOfDay
        );

        const yesterdayDemandData = await Feeders.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? '2025-03-26 00:00:00'
                : startOfYesterday,
            process.env.NODE_ENV === 'development'
                ? '2025-03-26 23:59:59'
                : endOfYesterday
        );

        const todayGroupedDemand = {};
        const yesterdayGroupedDemand = {};

        todayDemandData.forEach((record) => {
            const meterNo = record.meter_no;
            const scalingFactor = meterMap[meterNo];
            if (scalingFactor === undefined) return;

            const demandMW = record.kwh * scalingFactor;
            const timeKey = record.datetime;
            if (!todayGroupedDemand[timeKey]) {
                todayGroupedDemand[timeKey] = 0;
            }
            todayGroupedDemand[timeKey] += demandMW;
        });

        yesterdayDemandData.forEach((record) => {
            const meterNo = record.meter_no;
            const scalingFactor = meterMap[meterNo];
            if (scalingFactor === undefined) return;

            const demandMW = record.kwh * scalingFactor;
            const timeKey = record.datetime;
            if (!yesterdayGroupedDemand[timeKey]) {
                yesterdayGroupedDemand[timeKey] = 0;
            }
            yesterdayGroupedDemand[timeKey] += demandMW;
        });

        const todayFinalResults = Object.keys(todayGroupedDemand)
            .sort((a, b) => new Date(a) - new Date(b))
            .map((time) => ({
                datetime: time,
                actual_demand_mw: Number(todayGroupedDemand[time].toFixed(4)),
            }));

        const yesterdayFinalResults = Object.keys(yesterdayGroupedDemand)
            .sort((a, b) => new Date(a) - new Date(b))
            .map((time) => ({
                datetime: time,
                actual_demand_mw: Number(
                    yesterdayGroupedDemand[time].toFixed(4)
                ),
            }));

        const xAxis = [];
        const currentDayData = [];
        const previousDayData = [];

        const allTimestamps = new Set([
            ...todayFinalResults.map((d) =>
                moment(new Date(d.datetime)).format('HH:mm:ss')
            ),
            ...yesterdayFinalResults.map((d) =>
                moment(new Date(d.datetime)).format('HH:mm:ss')
            ),
        ]);

        const sortedTimestamps = Array.from(allTimestamps).sort(
            (a, b) =>
                moment(a, 'HH:mm:ss').valueOf() -
                moment(b, 'HH:mm:ss').valueOf()
        );

        const now = moment();

        sortedTimestamps.forEach((timestamp) => {
            const todayData = todayFinalResults.find((d) => {
                const dataTime = moment(new Date(d.datetime));
                const timeDiff = now.diff(dataTime, 'minutes');
                return (
                    dataTime.format('HH:mm:ss') === timestamp &&
                    dataTime.isSameOrBefore(now) &&
                    timeDiff > 180
                );
            });
            const yesterdayData = yesterdayFinalResults.find((d) => {
                const dataTime = moment(new Date(d.datetime));
                return (
                    dataTime.format('HH:mm:ss') === timestamp &&
                    dataTime.isSameOrBefore(now)
                );
            });

            const todayValue = todayData
                ? todayData.actual_demand_mw
                : undefined;
            const yesterdayValue = yesterdayData
                ? yesterdayData.actual_demand_mw
                : undefined;

            if (
                (todayValue !== undefined && todayValue != 0) ||
                (yesterdayValue !== undefined && yesterdayValue != 0)
            ) {
                xAxis.push(timestamp);
                if (todayValue !== undefined && todayValue != 0) {
                    currentDayData.push(todayValue);
                }
                if (yesterdayValue !== undefined && yesterdayValue != 0) {
                    previousDayData.push(yesterdayValue);
                }
            }
        });

        const detailedGraphData = {
            xAxis,
            series: [
                {
                    name: 'Current Day',
                    data: currentDayData,
                },
                {
                    name: 'Previous Day',
                    data: previousDayData,
                },
            ],
        };

        return res.status(200).json({
            status: 'success',
            data: detailedGraphData,
        });
    } catch (error) {
        logger.error('Error fetching feeder demand graph data:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        return res.status(500).json({
            status: 'error',
            message: 'Internal Server Error',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};
