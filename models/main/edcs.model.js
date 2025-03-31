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
    async getRegionSubstationCounts(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT 
                        region.hierarchy_name AS region_name,
                        COALESCE(COUNT(substation.hierarchy_id), 0) AS substation_count
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
                    GROUP BY region.hierarchy_name;
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.reduce((acc, row) => {
                acc[row.region_name] = row.substation_count;
                return acc;
            }, {});
        } catch (error) {
            console.error('❌ Error fetching Substation counts:', error);
            throw error;
        }
    }
    
}

export default new EDCs();
