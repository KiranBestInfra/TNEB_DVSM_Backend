const QUERY_TIMEOUT = 30000;

class EDCsDetails {
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

            return rows.map(row => row.hierarchy_name); // ✅ Returns an array of EDC names
        } catch (error) {
            console.error("❌ Error fetching region names:", error);
            throw error;
        }
    }
}


export default {
    edcDetails: new EDCsDetails() 
};
