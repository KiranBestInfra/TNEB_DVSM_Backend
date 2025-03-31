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
}

export default new EDCs();
