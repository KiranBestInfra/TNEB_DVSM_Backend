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
    async getSubstationNamesByRegion(connection, region) {
        try {
            const sql = `
            SELECT h.hierarchy_name 
            FROM hierarchy h
            JOIN hierarchy_master hm 
                ON h.hierarchy_type_id = hm.hierarchy_type_id 
            WHERE hm.hierarchy_title = "Substation" 
            AND h.parent_id IN (
                SELECT hierarchy_id 
                FROM hierarchy 
                WHERE hierarchy_name = ?
            )
        `;

            const [rows] = await connection.query(sql, [region]);
            console.log('Region:', region);

            return rows.map((row) => row.hierarchy_name);
        } catch (error) {
            console.error(
                '❌ Error fetching Substation names for region:',
                region,
                error
            );
            throw error;
        }
    }
}

export default new Substations();

