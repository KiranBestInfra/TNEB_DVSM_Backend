const QUERY_TIMEOUT = 30000;

class Substations {
    async getTotalSubstations(connection) {
        try {
            const [[{ totalSubstations }]] = await connection.query({
                sql: `
                        SELECT COUNT(hierarchy_name) AS totalSubstations 
                        FROM hierarchy h, hierarchy_master hm 
                        WHERE h.hierarchy_type_id = hm.hierarchy_type_id 
                        AND hm.hierarchy_title = "SUBSTATION"
                    `,
                timeout: QUERY_TIMEOUT,
            });
            return totalSubstations;
        } catch (error) {
            console.log('getTotalSubstations', error);
            throw error;
        }
    }
    async getSubstationNames(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT hierarchy_name 
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "SUBSTATION";
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.map((row) => row.hierarchy_name);
        } catch (error) {
            console.error('❌ Error fetching region names:', error);
            throw error;
        }
    }
    async getSubstationFeederCountsByRegion(connection, region) {
        try {
            const sql = `
            SELECT substation.hierarchy_name AS substation_name, 
                   COUNT(feeder.feeder_id) AS feeder_count
            FROM hierarchy region 
            JOIN hierarchy edc 
                ON region.hierarchy_id = edc.parent_id 
                AND edc.hierarchy_type_id = 11 
            JOIN hierarchy district 
                ON edc.hierarchy_id = district.parent_id 
                AND district.hierarchy_type_id = 34 
            JOIN hierarchy substation 
                ON district.hierarchy_id = substation.parent_id 
                AND substation.hierarchy_type_id = 35 
            LEFT JOIN feeder_table feeder
                ON substation.hierarchy_id = feeder.substation_id
            WHERE region.hierarchy_type_id = 10 
              AND region.hierarchy_name = ?
            GROUP BY substation.hierarchy_name`;

            const [rows] = await connection.query(sql, [region]);

            // Convert the result into the required JavaScript object format
            const substationFeederCounts = {};
            rows.forEach((row) => {
                substationFeederCounts[row.substation_name] = row.feeder_count;
            });

            return substationFeederCounts;
            console.log(substationFeederCounts);
        } catch (error) {
            console.error(
                '❌ Error fetching Substation feeder counts for region:',
                region,
                error
            );
            throw error;
        }
    }

    async getFeederCountBySubstation(connection, region) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    substation.hierarchy_name AS substation_name,
                    COALESCE(COUNT(feeder.hierarchy_id), 0) AS feeder_count
                FROM hierarchy region
                JOIN hierarchy edc 
                    ON region.hierarchy_id = edc.parent_id 
                    AND edc.hierarchy_type_id = 11  
                JOIN hierarchy district 
                    ON edc.hierarchy_id = district.parent_id 
                    AND district.hierarchy_type_id = 34  
                JOIN hierarchy substation 
                    ON district.hierarchy_id = substation.parent_id 
                    AND substation.hierarchy_type_id = 35  
                LEFT JOIN hierarchy feeder 
                    ON substation.hierarchy_id = feeder.parent_id 
                    AND feeder.hierarchy_type_id = 37  
                WHERE region.hierarchy_type_id = 10  
                AND region.hierarchy_name = ?
                GROUP BY substation.hierarchy_name;
            `,
                values: [region],
                timeout: QUERY_TIMEOUT,
            });

            return rows.reduce((acc, row) => {
                acc[row.substation_name] = row.feeder_count;
                return acc;
            }, {});
        } catch (error) {
            console.error(
                '❌ Error fetching Feeder counts for Substations:',
                error
            );
            throw error;
        }
    }
    async getSubstationNamesByRegion(connection, region) {
        try {
            const sql = `
            SELECT
                substation.hierarchy_name AS substation_names
            FROM hierarchy region
            JOIN hierarchy edc 
                ON region.hierarchy_id = edc.parent_id 
                AND edc.hierarchy_type_id = 11 
            JOIN hierarchy district 
                ON edc.hierarchy_id = district.parent_id 
                AND district.hierarchy_type_id = 34 
            LEFT JOIN hierarchy substation 
                ON district.hierarchy_id = substation.parent_id 
                AND substation.hierarchy_type_id = 35 
            WHERE region.hierarchy_type_id = 10 
            AND region.hierarchy_name = ?;
        `;

            const [rows] = await connection.query(sql, [region]);
            console.log('SQL Query Result:', rows); //Log the raw results.

            if (rows.length === 0) {
                return [];
            }

            // Collect substation names from each row
            const substationNames = rows
                .map((row) => row.substation_names)
                .filter((name) => name !== null);

            return substationNames;
        } catch (error) {
            console.error(
                `❌ Error fetching Substation names for region: ${region}`,
                error
            );
            throw error;
        }
    }
    async getHierarchyBySubstation(connection, regionID) {
        console.log(regionID);
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT h.hierarchy_id, h.hierarchy_name, h.hierarchy_type_id
                        FROM hierarchy h
                        JOIN hierarchy_master hm 
                            ON h.hierarchy_type_id = hm.hierarchy_type_id 
                        WHERE hm.hierarchy_title = "SUBSTATION"
                        AND h.hierarchy_name = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [regionID]
            );
            return results;
        } catch (error) {
            console.log('getHierarchyByRegion', error);
            throw error;
        }
    }
    async getSubstationMeters(
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
                        FROM hierarchy substation
                        JOIN hierarchy feeder 
                            ON substation.hierarchy_id = feeder.parent_id  
                        JOIN meter 
                            ON feeder.hierarchy_id = meter.location_id 
                        WHERE substation.hierarchy_type_id = ?
                        AND substation.hierarchy_id = ?        
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
}

export default new Substations();
