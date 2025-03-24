import {
  calculateTotalAmount,
  convertToIST,
  formatDate,
  formatDateDMY,
  formatDateYMD,
  sortAndFillData,
} from "../../utils/dashboardUtils.js";

const QUERY_TIMEOUT = 30000;

class Regions {
  async getTotalRegions(connection) {
    try {
      const [[{ totalRegions }]] = await connection.query({
        sql: `
                        SELECT COUNT(hierarchy_name) AS totalRegions 
                        FROM hierarchy h, hierarchy_master hm 
                        WHERE h.hierarchy_type_id = hm.hierarchy_type_id 
                        AND hm.hierarchy_title = "REGION"
                    `,
        timeout: QUERY_TIMEOUT,
      });
      return totalRegions;
    } catch (error) {
      console.log("getTotalRegions", error);
      throw error;
    }
  }
}

class Edcs {
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
      console.log("getTotalEdcs", error);
      throw error;
    }
  }
}

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
      console.log("getTotalSubstations", error);
      throw error;
    }
  }
}

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
      console.log("getTotalFeeders", error);
      throw error;
    }
  }
}
class CommMeters {
    async getCommMeters(connection) {
      try {
        const [[{ commMeters }]] = await connection.query({
          sql: `
              SELECT COUNT(DISTINCT meter_no) AS commMeters
              FROM instant_comm 
              WHERE meter_no IN (
                  SELECT meter_serial_no FROM meter 
                  WHERE location_id IS NOT NULL
              ) 
              AND DATE(device_date) = '2025-03-09';
          `,
          timeout: QUERY_TIMEOUT,
        });
        return commMeters; 
      } catch (error) {
        console.log("getCommMeters", error);
        throw error;
      }
    }
  }
  
  class NonCommMeters {
    async getNonCommMeters(connection) {
      try {
        const [[{ nonCommMeters }]] = await connection.query({
          sql: `
              SELECT COUNT(DISTINCT meter_serial_no) AS nonCommMeters
              FROM meter 
              WHERE location_id IS NOT NULL 
              AND meter_serial_no NOT IN (
                  SELECT DISTINCT meter_no FROM instant_comm 
                  WHERE DATE(device_date) = '2025-03-09'
              );
          `,
          timeout: QUERY_TIMEOUT,
        });
        return nonCommMeters;
      } catch (error) {
        console.log("getNonCommMeters", error);
        throw error;
      }
    }
  }
  class RegionsDetails {
    async getRegionNames(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT hierarchy_name 
                    FROM hierarchy h, hierarchy_master hm 
                    WHERE h.hierarchy_type_id = hm.hierarchy_type_id 
                    AND hm.hierarchy_title = "REGION";
                `,
                timeout: QUERY_TIMEOUT,
            });
            return rows.map(row => row.hierarchy_name); // ✅ Returns an array of region names
        } catch (error) {
            console.log("Error fetching region names:", error);
            throw error;
        }
    }
}

  
  // ✅ Export all models, including CommMeters and NonCommMeters
  export default {
    regions: new Regions(),
    edcs: new Edcs(),
    substations: new Substations(),
    feeders: new Feeders(),
    commMeters: new CommMeters(),
    nonCommMeters: new NonCommMeters(),
    regionDetails: new RegionsDetails(),
  };
  