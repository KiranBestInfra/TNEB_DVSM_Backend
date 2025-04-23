import pool from '../../config/db.js';
import REGIONS from '../../models/main/regions.model.js';
import EDCS from '../../models/main/edcs.model.js';
import SUBSTATIONS from '../../models/main/substations.model.js';
import FEEDERS from '../../models/main/feeders.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const getDashboardWidgets = async (req, res) => {
    try {
        const totalRegions = await REGIONS.getTotalRegions(pool);
        const totalEdcs = await EDCS.getTotalEdcs(pool);
        const totalDistricts = await REGIONS.getTotalDistricts(pool);
        const totalSubstations = await SUBSTATIONS.getTotalSubstations(pool);
        const totalFeeders = await FEEDERS.getTotalFeeders(pool);
        const commMeters = await REGIONS.getCommMeters(pool);
        const nonCommMeters = await REGIONS.getNonCommMeters(pool);
        const regionNames = await REGIONS.getRegionNames(pool);
        const regionEdcCounts = await REGIONS.getRegionEdcCounts(pool);
        const regionSubstationCounts = await REGIONS.getRegionSubstationCounts(
            pool
        );
        const regionFeederCounts = await REGIONS.getRegionFeederCounts(pool);

        const responseData = {
            status: 'success',
            data: {
                totalRegions,
                totalEdcs,
                totalDistricts,
                totalSubstations,
                totalFeeders,
                commMeters,
                nonCommMeters,
                regionNames: regionNames.map((region) => region.hierarchy_name),
                regionEdcCounts,
                regionSubstationCounts,
                regionFeederCounts,
            },
        };

        return res.status(200).json(responseData);
    } catch (error) {
        logger.error('Error fetching dashboard widgets:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        return res
            .status(500)
            .json({ status: 'error', message: 'Server Error' });
    }
};

export const fetchRegionGraphs = async (socket, regionNames) => {
    try {
        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        const regionDemandData = {};

        for (const region of regionNames) {
            const normalizedRegion = region.toLowerCase().trim();
            const hierarchy = await REGIONS.getHierarchyByRegion(
                pool,
                normalizedRegion
            );
            const meters = await REGIONS.getRegionMeters(
                pool,
                null,
                hierarchy.hierarchy_type_id,
                hierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const meterMap = {};
            const meterCal = await REGIONS.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no;
                meterMap[id] = meter.scaling_factor;
            });

            const todayDemandData = await REGIONS.getDemandTrendsData(
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

            const yesterdayDemandData = await REGIONS.getDemandTrendsData(
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

                const yesterdayData = yesterdayFinalResults.find(
                    (d) =>
                        moment(new Date(d.datetime)).format('HH:mm:ss') ===
                        timestamp
                );

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

            regionDemandData[region] = detailedGraphData;

            if (socket) {
                socket.emit('regionUpdate', {
                    region,
                    graphData: regionDemandData[region],
                });
            }
        }

        return regionDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);

        if (socket) {
            socket.emit('error', {
                status: 'error',
                message: 'Error fetching region graphs data',
            });
        }
    }
};

export const getRegionStats = async (req, res) => {
    try {
        const regions = await REGIONS.getRegionNames(pool);

        let regionStats = {};

        for (const region of regions) {
            const regionId = region.hierarchy_id;

            //   const edcCount = await EDCS.getEdcCount(pool, regionId);
            const districtCount = await REGIONS.getDistrictCount(
                pool,
                regionId
            );
            const substationCount = await REGIONS.getSubstationCount(
                pool,
                regionId
            );
            const feederCount = await REGIONS.getFeederCount(pool, regionId);
            const meterCount = await REGIONS.getMeterCount(pool, regionId);

            regionStats[region] = {
                edcCount,
                districtCount,
                substationCount,
                feederCount,
                meterCount,
            };
        }

        const responseData = {
            status: 'success',
            data: { regionStats },
        };

        return res.status(200).json(responseData);
    } catch (error) {
        console.error('Error fetching region statistics:', error);
        return res
            .status(500)
            .json({ status: 'error', message: 'Server Error' });
    }
};

export const searchConsumers = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const searchTerm = req.query.term || '';

        const searchResults = await REGIONS.getSearch(
            pool,
            accessValues,
            searchTerm
        );

        const responseData = {
            status: 'success',
            data: searchResults,
        };

        return res.status(200).json(responseData);
    } catch (error) {
        logger.error('Error searching consumers', {
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

export const demandGraph = async (req, res) => {
    try {
        const user = req.user || null;
        const accessValues = req.locationAccess?.values || [];
        const regionID = user
            ? user.user_hierarchy_id
            : req.params.regionID || null;
        const regionId = req.query.regionId;
        const selectedDate =
            regionId === 'main' ? req.query.date : req.params.date;
        let hierarchyMeters = null;
        const regionDetails = await REGIONS.getRegionNames(pool);
        const regionIds = regionDetails.map((region) => region.hierarchy_id);
        if (regionID) {
            const regionHierarchy = await REGIONS.getHierarchyByRegion(
                pool,
                regionID
            );

            const meters = await REGIONS.getRegionMeters(
                pool,
                null,
                regionHierarchy.hierarchy_type_id,
                regionHierarchy.hierarchy_id
            );
            hierarchyMeters = meters.map((meter) => meter.meter_serial_no);
        } else {
            const hierarchy_type_id = 10;
            const meters = await REGIONS.getRegionMeters(
                pool,
                null,
                hierarchy_type_id,
                regionIds
            );
            hierarchyMeters = meters.map((meter) => meter.meter_serial_no);
        }

        const meterMap = {};
        const meterCal = await REGIONS.getMeterCalculation(
            pool,
            null,
            hierarchyMeters
        );

        meterCal.forEach((meter) => {
            const id = meter.meter_serial_no;
            meterMap[id] = meter.scaling_factor;
        });
        const startOfDay = moment(selectedDate)
            .tz('Asia/Kolkata')
            .startOf('day')
            .format('YYYY-MM-DD HH:mm:ss');
        const endOfDay = moment(selectedDate)
            .tz('Asia/Kolkata')
            .endOf('day')
            .format('YYYY-MM-DD HH:mm:ss');

        const startOfYesterday = moment(selectedDate)
            .tz('Asia/Kolkata')
            .subtract(1, 'days')
            .startOf('day')
            .format('YYYY-MM-DD HH:mm:ss');
        const endOfYesterday = moment(selectedDate)
            .tz('Asia/Kolkata')
            .subtract(1, 'days')
            .endOf('day')
            .format('YYYY-MM-DD HH:mm:ss');

        const todayDemandData = await REGIONS.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? startOfDay
                    ? startOfDay
                    : '2025-03-27 00:00:00'
                : startOfDay,
            process.env.NODE_ENV === 'development'
                ? endOfDay
                    ? endOfDay
                    : '2025-03-27 23:59:59'
                : endOfDay,
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
                todayGroupedDemand[timeKey] = 0;
            }
            todayGroupedDemand[timeKey] += demandMW;
        });

        const todayFinalResults = Object.keys(todayGroupedDemand)
            .sort((a, b) => new Date(a) - new Date(b))
            .map((time) => ({
                datetime: time,
                actual_demand_mw: Number(todayGroupedDemand[time].toFixed(4)),
            }));

        const yesterdayDemandData = await REGIONS.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? startOfYesterday
                    ? startOfYesterday
                    : '2025-03-26 00:00:00'
                : startOfYesterday,
            process.env.NODE_ENV === 'development'
                ? startOfYesterday
                    ? endOfYesterday
                    : '2025-03-26 23:59:59'
                : endOfYesterday,
            hierarchyMeters
        );

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
                    timeDiff > 30
                );
            });

            const yesterdayData = yesterdayFinalResults.find(
                (d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss') ===
                    timestamp
            );

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

        const responseData = {
            status: 'success',
            data: detailedGraphData,
        };

        return res.status(200).json(responseData);
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

export default {
    getDashboardWidgets,
    getRegionStats,
    searchConsumers,
};
