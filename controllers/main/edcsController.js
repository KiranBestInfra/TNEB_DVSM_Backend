import pool from '../../config/db.js';
import EDCs from '../../models/main/edcs.model.js';
import Regions from '../../models/main/regions.model.js';
import Feeders from '../../models/main/feeders.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';

export const getEDCWidgets = async (req, res) => {
    try {
        const user = req.user || null;
        const region = user ? user.user_hierarchy_id : req.params.region;

        const deviceDate = '2025-03-09';
        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const regionDistricts = await Regions.getDistrictsByRegion(
            pool,
            region
        );

        const edcNames = await EDCs.getEdcNamesByRegion(pool, region);

        const substationCounts = await EDCs.getSubstationCountByRegion(
            pool,
            region
        );
        const feederCounts = await EDCs.getEdcFeederCounts(pool, region);

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
                region,
                edcNames,
                regionDistricts,
                substationCounts,
                feederCounts,
                commMeters,
                nonCommMeters,
            },
        });
    } catch (error) {
        console.error('❌ Error fetching EDC names:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};
export const getSubstationTotalWidgets = async (req, res) => {
    const user = req.user || null;
    const edcsID = (req.params.edcs || null).toUpperCase().replace(/-/g, ' ');

    const date = '2025-03-09';

    if (user && !edcsID) {
        const edcs = await EDCs.getEdcNamesByRegion(
            pool,
            user.user_hierarchy_id
        );

        const edcIds = edcs.map((edc) => edc.hierarchy_id);

        if (!edcIds.map((id) => Number(id)).includes(Number(edcsID))) {
            return res.status(403).json({
                status: 'error',
                message: 'Unauthorized access to substation data',
            });
        }
    }

    try {
        const districtCounts = await EDCs.getDistrictCountByEDC(pool, edcsID);
        const substationCounts = await EDCs.getSubstationCountByEDC(
            pool,
            edcsID
        );
        const totalFeeders = await EDCs.getTotalFeeders(pool);
        const commMeters = await EDCs.getEdcCommMeterCounts(pool, edcsID, date);
        const nonCommMeters = await EDCs.getEdcNonCommMeterCounts(
            pool,
            edcsID,
            date
        );
        const regionFeederNames = await Feeders.getFeederNamesByEdcId(
            pool,
            edcsID
        );

        res.status(200).json({
            status: 'success',
            data: {
                districtCounts,
                substationCounts,
                totalFeeders,
                commMeters,
                nonCommMeters,
                regionFeederNames: regionFeederNames,
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
export const fetchEdcGraphs = async (socket, edcNames) => {
    try {
        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        const edcDemandData = {};

        for (const edc of edcNames) {
            const normalizedEdc = edc.toLowerCase().trim();
            const hierarchy = await EDCs.getHierarchyByEdc(pool, normalizedEdc);
            const meters = await EDCs.getEdcMeters(
                pool,
                null,
                hierarchy.hierarchy_type_id,
                hierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const meterMap = {};
            const meterCal = await EDCs.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no.replace(/^0+/, '');
                meterMap[id] = meter.scaling_factor;
            });

            const todayDemandData = await EDCs.getDemandTrendsData(
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

            const yesterdayDemandData = await EDCs.getDemandTrendsData(
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
                const meterNo = record.meter_no.replace(/^0+/, '');
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
                const meterNo = record.meter_no.replace(/^0+/, '');
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

            sortedTimestamps.forEach((timestamp) => {
                xAxis.push(timestamp);

                const todayData = todayFinalResults.find(
                    (d) =>
                        moment(new Date(d.datetime)).format('HH:mm:ss') ===
                        timestamp
                );
                currentDayData.push(todayData ? todayData.actual_demand_mw : 0);

                const yesterdayData = yesterdayFinalResults.find(
                    (d) =>
                        moment(new Date(d.datetime)).format('HH:mm:ss') ===
                        timestamp
                );
                previousDayData.push(
                    yesterdayData ? yesterdayData.actual_demand_mw : 0
                );
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

            edcDemandData[edc] = detailedGraphData;
            if (edcDemandData[edc]) {
                socket.emit('edcUpdate', {
                    edc,
                    graphData: edcDemandData[edc],
                });
            }
        }

        return edcDemandData;
    } catch (error) {
        console.error('Error fetching EDC graphs:', error);
        throw error;
    }
};
export const getEdcDemandGraphDetails = async (req, res) => {
    try {
        const accessValues = req.locationAccess?.values || [];
        const edcID = (req.params.edcID || '').toUpperCase().replace(/-/g, ' ');

        if (edcID) {
            const edcHierarchy = await EDCs.getHierarchyByEdc(pool, edcID);
            const meters = await EDCs.getEdcMeters(
                pool,
                null,
                edcHierarchy.hierarchy_type_id,
                edcHierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const meterMap = {};
            const meterCal = await EDCs.getMeterCalculation(
                pool,
                null,
                hierarchyMeters
            );

            meterCal.forEach((meter) => {
                const id = meter.meter_serial_no.replace(/^0+/, '');
                meterMap[id] = meter.scaling_factor;
            });

            const { startOfDay, endOfDay } = getTodayStartAndEnd();
            const { startOfYesterday, endOfYesterday } =
                getYesterdayStartAndEnd();

            const todayDemandData = await EDCs.getDemandTrendsData(
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

            const yesterdayDemandData = await EDCs.getDemandTrendsData(
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
                const meterNo = record.meter_no.replace(/^0+/, '');
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
                const meterNo = record.meter_no.replace(/^0+/, '');
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

            sortedTimestamps.forEach((timestamp) => {
                xAxis.push(timestamp);

                const todayData = todayFinalResults.find(
                    (d) =>
                        moment(new Date(d.datetime)).format('HH:mm:ss') ===
                        timestamp
                );
                currentDayData.push(todayData ? todayData.actual_demand_mw : 0);

                const yesterdayData = yesterdayFinalResults.find(
                    (d) =>
                        moment(new Date(d.datetime)).format('HH:mm:ss') ===
                        timestamp
                );
                previousDayData.push(
                    yesterdayData ? yesterdayData.actual_demand_mw : 0
                );
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
        const meterCal = await EDCs.getMeterCalculation(
            pool,
            null,
            hierarchyMeters
        );

        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        meterCal.forEach((meter) => {
            const id = meter.meter_serial_no.replace(/^0+/, '');
            meterMap[id] = meter.scaling_factor;
        });

        const todayDemandData = await EDCs.getDemandTrendsData(
            pool,
            accessValues,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 00:00:00'
                : startOfDay,
            process.env.NODE_ENV === 'development'
                ? '2025-03-27 23:59:59'
                : endOfDay
        );

        const yesterdayDemandData = await EDCs.getDemandTrendsData(
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
            const meterNo = record.meter_no.replace(/^0+/, '');
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
            const meterNo = record.meter_no.replace(/^0+/, '');
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
        sortedTimestamps.forEach((timestamp) => {
            xAxis.push(timestamp);

            const todayData = todayFinalResults.find(
                (d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss') ===
                    timestamp
            );
            currentDayData.push(todayData ? todayData.actual_demand_mw : 0);

            const yesterdayData = yesterdayFinalResults.find(
                (d) =>
                    moment(new Date(d.datetime)).format('HH:mm:ss') ===
                    timestamp
            );
            previousDayData.push(
                yesterdayData ? yesterdayData.actual_demand_mw : 0
            );
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

export default getEDCWidgets;
