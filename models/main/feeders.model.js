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
            SELECT feeder.hierarchy_name AS feeder_name
            FROM hierarchy region
            JOIN hierarchy edc 
                ON region.hierarchy_id = edc.parent_id
            JOIN hierarchy district 
                ON edc.hierarchy_id = district.parent_id
            JOIN hierarchy substation 
                ON district.hierarchy_id = substation.parent_id
            JOIN hierarchy feeder 
                ON substation.hierarchy_id = feeder.parent_id
            WHERE region.hierarchy_name = ?;
        `;

            const [rows] = await connection.query(sql, [region]); // Parameterized query for security
            console.log('Region:', region);

            return rows.map((row) => row.hierarchy_name);
        } catch (error) {
            console.error(
                '❌ Error fetching feeder names for region:',
                region,
                error
            );
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
                        SELECT DISTINCT meter.meter_serial_no
                        FROM hierarchy region
                        JOIN hierarchy edc 
                            ON region.hierarchy_id = edc.parent_id 
                        JOIN hierarchy district 
                            ON edc.hierarchy_id = district.parent_id 
                        JOIN hierarchy substation 
                            ON district.hierarchy_id = substation.parent_id  
                        JOIN hierarchy feeder 
                            ON substation.hierarchy_id = feeder.parent_id  
                        JOIN meter 
                            ON feeder.hierarchy_id = meter.location_id 
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
    async getRegionFeederNames(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    region.hierarchy_name AS region_name,
                    COALESCE(GROUP_CONCAT(DISTINCT feeder.hierarchy_name ORDER BY feeder.hierarchy_name SEPARATOR ', '), '') AS feeder_names
                FROM hierarchy region
                JOIN hierarchy edc 
                    ON region.hierarchy_id = edc.parent_id 
                JOIN hierarchy district 
                    ON edc.hierarchy_id = district.parent_id  
                JOIN hierarchy substation 
                    ON district.hierarchy_id = substation.parent_id 
                LEFT JOIN hierarchy feeder 
                    ON substation.hierarchy_id = feeder.parent_id 
                WHERE region.hierarchy_type_id = 10  
                GROUP BY region.hierarchy_name;
            `,
                timeout: QUERY_TIMEOUT,
            });
            return rows.reduce((acc, row) => {
                acc[row.region_name] = row.feeder_names
                    ? row.feeder_names.split(', ')
                    : [];
                return acc;
            }, {});
        } catch (error) {
            console.error('❌ Error fetching Feeder names for Regions:', error);
            throw error;
        }
    }
}

export default new Feeders();
