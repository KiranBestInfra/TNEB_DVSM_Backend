import pool from '../../config/db.js';
import Feeders from '../../models/main/feeders.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';

export const fetchFeederGraphs = async (socket, feeders) => {
    console.log(feeders);
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
            console.log('hierarchy', meters);

            const hierarchyMeters = meters.map((meter) =>
                meter.meter_serial_no.replace(/^0+/, '')
            );

            const todayDemandData = await Feeders.getDemandTrendsData(
                pool,
                null,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );

            const yesterdayDemandData = await Feeders.getDemandTrendsData(
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

            feederDemandData[feeder] = detailedGraphData;
            if (feederDemandData[feeder]) {
                socket.emit('feederUpdate', {
                    feeder,
                    graphData: feederDemandData[feeder],
                });
            }
        }

        // console.log('feederDemandData', feederDemandData);
        // return feederDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);
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
export const getFeedersNamesByRegion = async (req, res) => {
    try {
        const region = req.params.region;
        const feedersWithCount = await Feeders.getFeederNamesByRegion(
            pool,
            region
        );

        res.status(200).json({
            status: 'success',
            data: feedersWithCount,
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
export const getFeedersBySubstationName = async (req, res) => {
    try {
        const substationName = req.params.substationName.replace(/-/g, ' '); // Convert "chennai-substation" -> "chennai substation"

        // Step 1: Get substation ID
        const substation = await Feeders.getSubstationIdByName(
            pool,
            substationName
        );

        if (!substation) {
            return res.status(404).json({
                status: 'error',
                message: `No substation found with name: ${substationName}`,
            });
        }

        // Step 2: Get feeder names by substation ID
        const feeders = await Feeders.getFeederNamesBySubstationId(
            pool,
            substation.hierarchy_id
        );

        res.status(200).json({
            status: 'success',
            data: {
                substation_id: substation.hierarchy_id,
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
