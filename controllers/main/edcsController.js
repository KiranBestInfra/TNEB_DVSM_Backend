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
        const region = req.params.region;
        const deviceDate = '2025-03-09';
        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const edcNames = await EDCs.getEdcNamesByRegion(pool, region);
        const substationCounts = await EDCs.getSubstationCountByRegion(
            pool,
            region
        );
        const feederCounts = await EDCs.getEdcFeederCounts(pool, region);
        // const commMeters = await EDCs.getCommMeters(pool, region);
        const commMeters = await Regions.getRegionCommMeterCounts(
            pool,
            region,
            deviceDate
        );

        // const nonCommMeters = await EDCs.getNonCommMeters(
        //     pool,
        //     region
        // );
        const nonCommMeters = await Regions.getRegionNonCommMeterCounts(
            pool,
            region,
            deviceDate
        );

        console.log(edcNames);
        res.status(200).json({
            status: 'success',
            data: {
                region,
                edcNames,
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
    const edcs = (req.params.edcs || '').toUpperCase().replace(/-/g, ' ');
    try {
        const totalsubstations = await EDCs.getTotalSubstations(pool);
        const totalFeeders = await EDCs.getTotalFeeders(pool);
        const commMeters = await EDCs.getEdcCommMeterCounts(pool, edcs);
        const nonCommMeters = await EDCs.getEdcNonCommMeterCounts(pool, edcs);
        const regionFeederNames = await Feeders.getFeederNamesByEdcId(
            pool,
            edcs
        );

        console.log(regionFeederNames);
        res.status(200).json({
            status: 'success',
            data: {
                totalsubstations,
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
export const fetchEdcGraphs = async (edcNames) => {
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
            //console.log(hierarchyMeters);

            const todayDemandData = await EDCs.getDemandTrendsData(
                pool,
                null,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );
            //console.log('edctodayDemandData', todayDemandData);
            const yesterdayDemandData = await EDCs.getDemandTrendsData(
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

            edcDemandData[edc] = detailedGraphData;
        }

        return edcDemandData;
    } catch (error) {
        console.error('Error fetching EDC graphs:', error);
        throw error;
    }
};

export default getEDCWidgets;
