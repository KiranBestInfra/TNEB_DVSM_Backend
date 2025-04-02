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
        const substationNames = rows.map(row => row.substation_names).filter(name => name !== null);

        return substationNames;
    } catch (error) {
        console.error(
            `❌ Error fetching Substation names for region: ${region}`,
            error
        );
        throw error;
    }
}
}

export default new Substations();
