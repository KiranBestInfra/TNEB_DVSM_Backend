const QUERY_TIMEOUT = 30000;

class EDCs {
    async getEdcNames(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT hierarchy_name 
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "EDC";
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.map((row) => row.hierarchy_name);
        } catch (error) {
            console.error('❌ Error fetching region names:', error);
            throw error;
        }
    }

    async getTotalEdcs(connection) {
        try {
            const [[{ totalEdcs }]] = await connection.query({
                sql: `
                        SELECT COUNT(hierarchy_name) AS totalEdcs 
                        FROM hierarchy h, hierarchy_master hm 
                        WHERE h.hierarchy_type_id = hm.hierarchy_type_id 
                        AND hm.hierarchy_title = "EDC"
                    `,
                timeout: QUERY_TIMEOUT,
            });
            return totalEdcs;
        } catch (error) {
            console.log('getTotalEdcs', error);
            throw error;
        }
    }
    async getEdcNamesByRegion(connection, region) {
        try {
            const sql = `
            SELECT hierarchy_name 
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "EDC" 
                    AND h.parent_id in (select hierarchy_id from hierarchy where hierarchy_name = ? )
        `;

            const [rows] = await connection.query(sql, [region]); // Correct way
            console.log('Region ID:', region);

            return rows.map((row) => row.hierarchy_name);
        } catch (error) {
            console.error(
                '❌ Error fetching EDC names for region:',
                region,
                error
            );
            throw error;
        }
    }
    async getSubstationCountByRegion(connection, region) {
        try {
            const sql = `SELECT 
                        edc.hierarchy_name AS edc_name,
                        COUNT(substation.hierarchy_id) AS substation_count
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
                     AND region.hierarchy_name = ?  
                     GROUP BY edc.hierarchy_name`;

            const [rows] = await connection.query(sql, [region]);
            console.log('Region ID:', region);
            return rows;
        } catch (error) {
            console.error('❌ Error fetching substation count:', error);
            throw error;
        }
    }
    async getEdcFeederCounts(connection, region) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    edc.hierarchy_name AS edc_name,
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
                GROUP BY edc.hierarchy_name;
            `,
                timeout: QUERY_TIMEOUT,
                values: [region], // Filter by region
            });

            return rows.reduce((acc, row) => {
                acc[row.edc_name] = row.feeder_count;
                return acc;
            }, {});
        } catch (error) {
            console.error('❌ Error fetching Feeder counts for EDCs:', error);
            throw error;
        }
    }

    async getHierarchyByEdc(connection, edcName) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT h.hierarchy_id, h.hierarchy_name, h.hierarchy_type_id
                        FROM hierarchy h
                        JOIN hierarchy_master hm 
                            ON h.hierarchy_type_id = hm.hierarchy_type_id 
                        WHERE hm.hierarchy_title = "EDC"
                        AND h.hierarchy_name = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [edcName]
            );
            return results;
        } catch (error) {
            console.log('getHierarchyByEdc', error);
            throw error;
        }
    }

    async getEdcMeters(
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
                        FROM hierarchy edc
                        JOIN hierarchy district 
                            ON edc.hierarchy_id = district.parent_id 
                        JOIN hierarchy substation 
                            ON district.hierarchy_id = substation.parent_id  
                        JOIN hierarchy feeder 
                            ON substation.hierarchy_id = feeder.parent_id  
                        JOIN meter 
                            ON feeder.hierarchy_id = meter.location_id 
                        WHERE edc.hierarchy_type_id = ?  
                        AND edc.hierarchy_id = ?
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
            console.log('getEdcMeters', error);
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
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT 
                            ad.datetime,
                            MAX(ad.actual_demand_mw) as actual_demand_mw
                        FROM actualdemand ad
                        WHERE ad.datetime BETWEEN ? AND ?
                        ${meters ? `AND ad.meter_no IN (?)` : ''}
                        GROUP BY ad.datetime
                        ORDER BY ad.datetime ASC
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [start, end, meters]
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

export default new EDCs();
