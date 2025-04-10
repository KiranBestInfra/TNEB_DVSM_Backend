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

        res.status(200).json({
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
        });
    } catch (error) {
        logger.error('Error fetching dashboard widgets:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });
        res.status(500).json({ status: 'error', message: 'Server Error' });
    }
};

export const fetchRegionGraphs = async (socket, regionNames) => {
    try {
        // const regionNames = await REGIONS.getRegionNames(pool);

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

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const todayDemandData = await REGIONS.getDemandTrendsData(
                pool,
                null,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );
            // console.log('todayDemandData', todayDemandData);

            const yesterdayDemandData = await REGIONS.getDemandTrendsData(
                pool,
                null,
                '2025-03-26 00:00:00',
                '2025-03-26 23:59:59',
                hierarchyMeters
            );

            const xAxis = [];
            const currentDayData = [];
            const previousDayData = [];

            const allTimestamps = new Set([
                ...todayDemandData.map((d) =>
                    moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss')
                ),
                ...yesterdayDemandData.map((d) =>
                    moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss')
                ),
            ]);

            const sortedTimestamps = Array.from(allTimestamps).sort(
                (a, b) =>
                    moment(a, 'HH:mm:ss').valueOf() -
                    moment(b, 'HH:mm:ss').valueOf()
            );
            sortedTimestamps.forEach((timestamp) => {
                xAxis.push(timestamp);

                const todayData = todayDemandData.find(
                    (d) =>
                        moment(d.datetime)
                            .tz('Asia/Kolkata')
                            .format('HH:mm:ss') === timestamp
                );
                currentDayData.push(todayData ? todayData.actual_demand_mw : 0);

                const yesterdayData = yesterdayDemandData.find(
                    (d) =>
                        moment(d.datetime)
                            .tz('Asia/Kolkata')
                            .format('HH:mm:ss') === timestamp
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

            regionDemandData[region] = detailedGraphData;
            if (regionDemandData[region]) {
                socket.emit('regionUpdate', {
                    region,
                    graphData: regionDemandData[region],
                });
            }
        }

        return regionDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);
    }
};

export const getRegionStats = async (req, res) => {
    try {
        const regions = await REGIONS.getRegionNames(pool);

        let regionStats = {};

        for (const region of regions) {
            const regionId = region.hierarchy_id;

            const edcCount = await EDCS.getEdcCount(pool, regionId);
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

        res.status(200).json({
            status: 'success',
            data: { regionStats },
        });
    } catch (error) {
        console.error('Error fetching region statistics:', error);
        res.status(500).json({ status: 'error', message: 'Server Error' });
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

export const demandGraph = async (req, res) => {
    try {
        const user = req.user || null;
        const accessValues = req.locationAccess?.values || [];
        const regionID = user
            ? user.user_hierarchy_id
            : req.params.regionID || null;

        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        let hierarchyMeters = null;

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

            hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );
        }

        const todayDemandData = await REGIONS.getDemandTrendsData(
            pool,
            accessValues,
            '2025-03-27 00:00:00',
            '2025-03-27 23:59:59',
            hierarchyMeters
        );

        const yesterdayDemandData = await REGIONS.getDemandTrendsData(
            pool,
            accessValues,
            '2025-03-26 00:00:00',
            '2025-03-26 23:59:59',
            hierarchyMeters
        );

        const xAxis = [];
        const currentDayData = [];
        const previousDayData = [];

        const allTimestamps = new Set([
            ...todayDemandData.map((d) =>
                moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss')
            ),
            ...yesterdayDemandData.map((d) =>
                moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss')
            ),
        ]);

        const sortedTimestamps = Array.from(allTimestamps).sort(
            (a, b) =>
                moment(a, 'HH:mm:ss').valueOf() -
                moment(b, 'HH:mm:ss').valueOf()
        );
        sortedTimestamps.forEach((timestamp) => {
            xAxis.push(timestamp);

            const todayData = todayDemandData.find(
                (d) =>
                    moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss') ===
                    timestamp
            );
            currentDayData.push(todayData ? todayData.actual_demand_mw : 0);

            const yesterdayData = yesterdayDemandData.find(
                (d) =>
                    moment(d.datetime).tz('Asia/Kolkata').format('HH:mm:ss') ===
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

export default {
    getDashboardWidgets,
    getRegionStats,
    searchConsumers,
};
