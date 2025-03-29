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
}

export default new Feeders();
