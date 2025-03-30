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
}

export default new Substations();
