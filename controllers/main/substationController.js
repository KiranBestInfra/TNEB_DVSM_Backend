import pool from '../../config/db.js';
import Substations from '../../models/main/substations.model.js';
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
        const region = req.params.region || '';
        const edcs = req.params.edcs || '';

        const param = region ? region : edcs;
        const deviceDate = '2025-03-09';

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
        const edcs = req.params.edcs || null

        if (!edcs) {
            return res.status(400).json({
                status: 'error',
                message: 'Edc parameter is missing',
            });
        }

        const edcsubstationNames =
            await Substations.getEdcSubstationNamesByRegion(pool, edcs);
        // console.log('edcsubstationNames', edcsubstationNames);
        const feederCountsedc = await Substations.getFeederCountBySubstationEdc(
            pool,
            edcs
        );
        // console.log('feederCountsedc', feederCountsedc);

        const substationFeederCountsedc = Array.isArray(feederCountsedc)
            ? feederCountsedc.reduce((acc, feeder) => {
                  acc[feeder.substation_name] = feeder.feeder_count;
                  return acc;
              }, {})
            : feederCountsedc;

        res.status(200).json({
            status: 'success',
            data: {
                edcs,
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
        // const regionNames = await REGIONS.getRegionNames(pool);

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

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const todayDemandData = await Substations.getDemandTrendsData(
                pool,
                null,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );

            const yesterdayDemandData = await Substations.getDemandTrendsData(
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

        // console.log(substationID);

        if (substationID) {
            const substationHierarchy =
                await Substations.getHierarchyBySubstation(pool, substationID);
            const meters = await Substations.getSubstationMeters(
                pool,
                null,
                substationHierarchy.hierarchy_type_id,
                substationHierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const { startOfDay, endOfDay } = getTodayStartAndEnd();
            const { startOfYesterday, endOfYesterday } =
                getYesterdayStartAndEnd();

            const todayDemandData = await Substations.getDemandTrendsData(
                pool,
                accessValues,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );

            const yesterdayDemandData = await Substations.getDemandTrendsData(
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

            return res.status(200).json({
                status: 'success',
                data: detailedGraphData,
            });
        }

        const todayDemandData = await Substations.getDemandTrendsData(
            pool,
            accessValues,
            '2025-03-27 00:00:00',
            '2025-03-27 23:59:59'
        );

        const yesterdayDemandData = await Substations.getDemandTrendsData(
            pool,
            accessValues,
            '2025-03-26 00:00:00',
            '2025-03-26 23:59:59'
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

export default getSubstationWidgets;
