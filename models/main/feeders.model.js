const QUERY_TIMEOUT = 30000;

class Feeders {
    async getTotalFeeders(connection) {
        try {
            const [[{ totalFeeders }]] = await connection.query({
                sql: `
                        SELECT COUNT(hierarchy_name) AS totalFeeders 
                        FROM hierarchy h, hierarchy_master hm 
                        WHERE h.hierarchy_type_id = hm.hierarchy_type_id 
                        AND hm.hierarchy_title = "FEEDER"
                    `,
                timeout: QUERY_TIMEOUT,
            });
            return totalFeeders;
        } catch (error) {
            console.log('getTotalFeeders', error);
            throw error;
        }
    }
    async getFeederNamesByRegion(connection, region) {
        try {
            const sql = `
            SELECT 
                feeder.hierarchy_name AS name,
                feeder.hierarchy_id AS id,
                COUNT(m.meter_serial_no) AS meterCount
            FROM hierarchy region
            JOIN hierarchy edc ON region.hierarchy_id = edc.parent_id
            JOIN hierarchy district ON edc.hierarchy_id = district.parent_id
            JOIN hierarchy substation ON district.hierarchy_id = substation.parent_id
            LEFT JOIN hierarchy feeder ON substation.hierarchy_id = feeder.parent_id
            LEFT JOIN meter m ON feeder.hierarchy_id = m.location_id
            WHERE region.hierarchy_type_id = 10
            AND region.hierarchy_name = ?
            GROUP BY feeder.hierarchy_id, feeder.hierarchy_name
            ORDER BY feeder.hierarchy_name
        `;

            const [rows] = await connection.query(sql, [region]);
            return rows; // Each row has: { name: 'feederName', meterCount: 5 }
        } catch (error) {
            console.error(
                '❌ Error fetching feeder names with meter count:',
                region,
                error
            );
            throw error;
        }
    }

    async getHierarchyByFeeder(connection, regionID) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT h.hierarchy_id, h.hierarchy_name, h.hierarchy_type_id
                        FROM hierarchy h
                        JOIN hierarchy_master hm
                            ON h.hierarchy_type_id = hm.hierarchy_type_id
                        WHERE hm.hierarchy_title = "FEEDER"
                        AND h.hierarchy_name = ?
                        OR h.hierarchy_id = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [regionID, regionID]
            );
            return results;
        } catch (error) {
            console.log('getHierarchyByFeeder', error);
            throw error;
        }
    }

    async getFeederMeters(
        connection,
        accessValues = [],
        hierarchy_type_id,
        hierarchy_id
    ) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT distinct meter.meter_serial_no
                        FROM hierarchy region 
                        JOIN meter 
                            ON region.hierarchy_id = meter.location_id 
                        WHERE region.hierarchy_type_id = ?  
                        AND region.hierarchy_id = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [hierarchy_type_id, hierarchy_id]
            );

            return results;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getDemandTrendsData', error);
            throw error;
        }
    }
    async getDemandTrendsData(
        connection,
        accessValues = [],
        start,
        end,
        meters = null
    ) {
        try {
            const queryParams = [start, end];
            let meterCondition = '';

            if (meters && meters.length > 0) {
                meterCondition = 'AND ad.meter_no IN (?)';
                queryParams.push(meters);
            }

            const [results] = await connection.query(
                {
                    sql: `
                        SELECT 
                            ad.datetime, 
                            ROUND(SUM(ad.kwh * (mt.ad_pt / mt.me_pt) * (mt.ad_ct / mt.me_ct) / 0.25 / 1000), 4) AS actual_demand_mw 
                        FROM actualdemand ad 
                        JOIN meter mt ON ad.meter_no = mt.meter_serial_no 
                        WHERE ad.datetime BETWEEN ? AND ?
                        ${meterCondition}
                        GROUP BY ad.datetime 
                        ORDER BY ad.datetime ASC;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                queryParams
            );

            return results;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getDemandTrendsData', error);
            throw error;
        }
    }
    // async getMeterCountByRegion(connection, region) {
    //     try {
    //         const sql = `
    //         SELECT COUNT(*) AS meter_count
    //         FROM meter
    //         WHERE location_id IN (
    //             SELECT feeder.hierarchy_id
    //             FROM hierarchy region
    //             JOIN hierarchy edc
    //                 ON region.hierarchy_id = edc.parent_id
    //             JOIN hierarchy district
    //                 ON edc.hierarchy_id = district.parent_id
    //             JOIN hierarchy substation
    //                 ON district.hierarchy_id = substation.parent_id
    //             LEFT JOIN hierarchy feeder
    //                 ON substation.hierarchy_id = feeder.parent_id
    //             WHERE region.hierarchy_name = ?
    //             AND region.hierarchy_type_id = 10
    //         );
    //     `;

    //         const [rows] = await connection.query(sql, [region]);
    //         return rows[0]?.meter_count || 0;
    //     } catch (error) {
    //         console.error(
    //             '❌ Error fetching meter count for region:',
    //             region,
    //             error
    //         );
    //         throw error;
    //     }
    // }
    // async getFeederNamesByEdc(connection, edc) {
    //     try {
    //         const sql = `
    //         SELECT
    //             edc.hierarchy_id AS edc_id,
    //             feeder.hierarchy_name AS name,
    //             COUNT(m.meter_serial_no) AS meterCount
    //         FROM hierarchy region
    //         JOIN hierarchy edc ON region.hierarchy_id = edc.parent_id
    //         JOIN hierarchy district ON edc.hierarchy_id = district.parent_id
    //         JOIN hierarchy substation ON district.hierarchy_id = substation.parent_id
    //         LEFT JOIN hierarchy feeder ON substation.hierarchy_id = feeder.parent_id
    //         LEFT JOIN meter m ON feeder.hierarchy_id = m.location_id
    //         WHERE region.hierarchy_type_id = 10
    //         AND edc.hierarchy_name = ?
    //         GROUP BY edc.hierarchy_id, feeder.hierarchy_id, feeder.hierarchy_name
    //         ORDER BY feeder.hierarchy_name;
    //     `;

    //         const [rows] = await connection.query(sql, [edc]);
    //         return rows; // Each row will be { name: 'feederName', meterCount: X }
    //     } catch (error) {
    //         console.error(
    //             '❌ Error fetching feeder names with meter count for EDC:',
    //             edc,
    //             error
    //         );
    //         throw error;
    //     }
    // }
    // services/feederService.js

    // Step 1: Get hierarchy_id from edc name
    async getEdcIdByName(connection, edcName) {
        const sql = `
        SELECT hierarchy_id 
        FROM hierarchy 
        WHERE hierarchy_type_id = 11 AND hierarchy_name = ?
    `;
        const [rows] = await connection.query(sql, [edcName]);
        return rows[0]; // return null if not found
    }

    // Step 2: Get feeder names for given EDC ID
    async getFeederNamesByEdcId(connection, edcId) {
        const sql = `
        SELECT 
            feeder.hierarchy_name AS name,
            COUNT(m.meter_serial_no) AS meterCount
        FROM hierarchy edc
        JOIN hierarchy district ON edc.hierarchy_id = district.parent_id
        JOIN hierarchy substation ON district.hierarchy_id = substation.parent_id
        LEFT JOIN hierarchy feeder ON substation.hierarchy_id = feeder.parent_id
        LEFT JOIN meter m ON feeder.hierarchy_id = m.location_id
        WHERE edc.hierarchy_type_id = 11
        AND edc.hierarchy_id = ?
        GROUP BY feeder.hierarchy_id, feeder.hierarchy_name
        ORDER BY feeder.hierarchy_name;
    `;
        const [rows] = await connection.query(sql, [edcId]);
        return rows;
    }

    // Get hierarchy_id of the substation by name
    async getSubstationIdByName(connection, substationName) {
        const sql = `
        SELECT hierarchy_id
        FROM hierarchy
            where hierarchy_type_id = "35" and hierarchy_name =?           
    `;
        const [rows] = await connection.query(sql, [substationName]);
        return rows[0]; // may return undefined if not found
    }

    // Get feeders by substation ID
    async getFeederNamesBySubstationId(connection, substationId) {
        const sql = `
        SELECT 
            feeder.hierarchy_name AS name,
            COUNT(m.meter_serial_no) AS meterCount
        FROM hierarchy feeder
        LEFT JOIN meter m ON feeder.hierarchy_id = m.location_id
        WHERE feeder.parent_id = ?
        GROUP BY feeder.hierarchy_id, feeder.hierarchy_name
        ORDER BY feeder.hierarchy_name;
    `;
        const [rows] = await connection.query(sql, [substationId]);
        return rows;
    }
}

export default new Feeders();
