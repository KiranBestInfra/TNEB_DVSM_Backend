import pool from '../../config/db.js';
import Substations from '../../models/main/substations.model.js';
import EDCs from '../../models/main/edcs.model.js';
import Regions from '../../models/main/regions.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';
// import logger from "../../utils/logger.js";

export const getSubstationWidgets = async (req, res) => {
    try {
        const user = req.user || null;
        const region = user ? user.user_hierarchy_id : req.params.region || '';
        const edcs = req.params.edcs || '';

        const param = region ? region : edcs;

        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const substationNames = await Substations.getSubstationNamesByRegion(
            pool,
            param
        );
        const feederCounts = await Substations.getFeederCountBySubstation(
            pool,
            param
        );
        const commMeters = await Regions.getRegionCommMeterCounts(pool, region);
        const nonCommMeters = await Regions.getRegionNonCommMeterCounts(
            pool,
            region
        );

        const substationFeederCounts = Array.isArray(feederCounts)
            ? feederCounts.reduce((acc, feeder) => {
                  acc[feeder.substation_name] = feeder.feeder_count;
                  return acc;
              }, {})
            : feederCounts;

        res.status(200).json({
            status: 'success',
            data: {
                edcs,
                substationNames,
                substationFeederCounts,
                commMeters,
                nonCommMeters,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching substation widgets:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};
export const getEdcSubstationWidgets = async (req, res) => {
    try {
        const user = req.user || null;
        const edcID = req.params.edcs || null;

        if (!edcID) {
            return res.status(400).json({
                status: 'error',
                message: 'Edc parameter is missing',
            });
        }

        if (user && !edcID) {
            const edcs = await EDCs.getEdcNamesByRegion(
                pool,
                user.user_hierarchy_id
            );

            const edcIds = edcs.map((edc) => edc.hierarchy_id);

            if (!edcIds.map((id) => Number(id)).includes(Number(edcID))) {
                return res.status(403).json({
                    status: 'error',
                    message: 'Unauthorized access to substation data',
                });
            }
        }

        const edcsubstationNames =
            await Substations.getEdcSubstationNamesByRegion(pool, edcID);
        const feederCountsedc = await Substations.getFeederCountBySubstationEdc(
            pool,
            edcID
        );

        const substationFeederCountsedc = Array.isArray(feederCountsedc)
            ? feederCountsedc.reduce((acc, feeder) => {
                  acc[feeder.substation_name] = feeder.feeder_count;
                  return acc;
              }, {})
            : feederCountsedc;

        res.status(200).json({
            status: 'success',
            data: {
                edcID,
                edcsubstationNames,
                substationFeederCountsedc,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching substation widgets:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export const fetchSubstationGraphs = async (socket, substations) => {
    try {
        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        const substationDemandData = {};

        let count = 0;
        for (const substation of substations) {
            const hierarchy = await Substations.getHierarchyBySubstation(
                pool,
                substation
            );
            const meters = await Substations.getSubstationMeters(
                pool,
                null,
                hierarchy.hierarchy_type_id,
                hierarchy.hierarchy_id
            );
            //count++;

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const meterMap = {};
            const meterCal = await Substations.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no;
                meterMap[id] = meter.scaling_factor;
            });

            const todayDemandData = await Substations.getDemandTrendsData(
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

            const yesterdayDemandData = await Substations.getDemandTrendsData(
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
                        timeDiff > 45
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

            substationDemandData[substation] = detailedGraphData;
            if (substationDemandData[substation]) {
                socket.emit('substationUpdate', {
                    substation,
                    graphData: substationDemandData[substation],
                });
            }
        }
        // return substationDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);
    }
};
export const getSubstationDemandGraphDetails = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const substationID = (req.params.substationID || '')
            .toUpperCase()
            .replace(/-/g, ' ');
        const selectedDate = req.params.date;

        if (substationID) {
            const substationHierarchy =
                await Substations.getHierarchyBySubstation(pool, substationID);
            const meters = await Substations.getSubstationMeters(
                pool,
                null,
                substationHierarchy.hierarchy_type_id,
                substationHierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const meterMap = {};
            const meterCal = await Substations.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no;
                meterMap[id] = meter.scaling_factor;
            });

            const startOfDay = moment(selectedDate)
                .startOf('day')
                .format('YYYY-MM-DD HH:mm:ss');
            const endOfDay = moment(selectedDate)
                .endOf('day')
                .format('YYYY-MM-DD HH:mm:ss');

            const startOfYesterday = moment(selectedDate)
                .subtract(1, 'days')
                .startOf('day')
                .format('YYYY-MM-DD HH:mm:ss');
            const endOfYesterday = moment(selectedDate)
                .subtract(1, 'days')
                .endOf('day')
                .format('YYYY-MM-DD HH:mm:ss');
            console.log(startOfDay, endOfDay, startOfYesterday, endOfYesterday);

            const todayDemandData = await Substations.getDemandTrendsData(
                pool,
                accessValues,
                process.env.NODE_ENV === 'development'
                    ? startOfDay
                        ? startOfDay
                        : '2025-03-27 00:00:00'
                    : '2025-03-27 00:00:00',
                process.env.NODE_ENV === 'development'
                    ? endOfDay
                        ? endOfDay
                        : '2025-03-27 23:59:59'
                    : '2025-03-27 23:59:59',
                hierarchyMeters
            );

            const yesterdayDemandData = await Substations.getDemandTrendsData(
                pool,
                accessValues,
                process.env.NODE_ENV === 'development'
                    ? startOfYesterday
                        ? startOfYesterday
                        : '2025-03-26 00:00:00'
                    : '2025-03-26 00:00:00',
                process.env.NODE_ENV === 'development'
                    ? endOfYesterday
                        ? endOfYesterday
                        : '2025-03-26 23:59:59'
                    : '2025-03-26 23:59:59',
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
                        timeDiff > 45
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
        const meterCal = await Substations.getMeterCalculation(
            pool,
            null,
            hierarchyMeters
        );

        meterCal.forEach((meter) => {
            const id = meter.meter_serial_no;
            meterMap[id] = meter.scaling_factor;
        });

        const todayDemandData = await Substations.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 00:00:00'
                : startOfDay,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 23:59:59'
                : endOfDay
        );

        const yesterdayDemandData = await Substations.getDemandTrendsData(
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
                    timeDiff > 45
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
        logger.error('Error fetching demand graph data:', {
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
export const getFeedersDataBySubstation = async (req, res) => {
    try {
        const user = req.user || null;
        const substationId = req.params.substationId || '';

        if (user) {
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

        const commMeters = await Substations.getSubstationCommMeterCounts(
            pool,
            substationId
        );

        const nonCommMeters = await Substations.getSubstationNonCommMeterCounts(
            pool,
            substationId
        );

        res.status(200).json({
            status: 'success',
            data: {
                commMeters,
                nonCommMeters,
            },
        });
    } catch (error) {
        logger.error('❌ Error fetching feeders widgets by Substation:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export default getSubstationWidgets;
