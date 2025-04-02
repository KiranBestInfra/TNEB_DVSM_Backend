import pool from '../../config/db.js';
import EDCS from '../../models/main/edcs.model.js';
import logger from '../../utils/logger.js';
import moment from 'moment-timezone';
import {
    getTodayStartAndEnd,
    getYesterdayStartAndEnd,
} from '../../utils/globalUtils.js';

export const fetchEdcGraphs = async (edcNames) => {
        console.log(edcNames)

    try {
        const { startOfDay, endOfDay } = getTodayStartAndEnd();
        const { startOfYesterday, endOfYesterday } = getYesterdayStartAndEnd();

        const edcDemandData = {};

        for (const edc of edcNames) {
            const hierarchy = await EDCS.getHierarchyByEdc(pool, edc);
            const meters = await EDCS.getEdcMeters(
                pool,
                null,
                hierarchy.hierarchy_type_id,
                hierarchy.hierarchy_id
            );

            const hierarchyMeters = meters.map(
                (meter) => meter.meter_serial_no
            );

            const todayDemandData = await EDCS.getDemandTrendsData(
                pool,
                null,
                '2025-03-27 00:00:00',
                '2025-03-27 23:59:59',
                hierarchyMeters
            );

            const yesterdayDemandData = await EDCS.getDemandTrendsData(
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