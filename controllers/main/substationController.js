import pool from '../../config/db.js';
import Substations from '../../models/main/substations.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';
// import logger from "../../utils/logger.js";

export const getSubstationWidgets = async (req, res) => {
    try {
        const region = req.params.region;
        const edcs = req.params.edcs;

        console.log(region);

        if (!region) {
            return res.status(400).json({
                status: 'error',
                message: 'Region parameter is missing',
            });
        }

        const substationNames = await Substations.getSubstationNamesByRegion(
            pool,
            edcs
        );
        const feederCounts = await Substations.getFeederCountBySubstation(
            pool,
            edcs
        );

        const substationFeederCounts = Array.isArray(feederCounts)
            ? feederCounts.reduce((acc, feeder) => {
                  acc[feeder.substation_name] = feeder.feeder_count;
                  return acc;
              }, {})
            : feederCounts;

        // Return the response
        res.status(200).json({
            status: 'success',
            data: {
                edcs,
                substationNames,
                substationFeederCounts,
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
            // console.log(meters);
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
            // if (substationDemandData[substation]) {
            //     socket.emit('substationUpdate', {
            //         substation,
            //         graphData: substationDemandData[substation],
            //     });
            // }
        }

        return substationDemandData;
    } catch (error) {
        console.error('Error fetching region graphs:', error);
    }
};

export default getSubstationWidgets;
