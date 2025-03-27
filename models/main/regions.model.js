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
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "REGION";
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.map(row => row.hierarchy_name); // ✅ Returns an array of region names
        } catch (error) {
            console.error("❌ Error fetching region names:", error);
            throw error;
        }
    }

    async getRegionEdcCounts(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT 
                        region.hierarchy_name AS region_name,
                        COUNT(edc.hierarchy_id) AS edc_count
                    FROM hierarchy region
                    LEFT JOIN hierarchy edc 
                        ON region.hierarchy_id = edc.parent_id 
                        AND edc.hierarchy_type_id = 11  -- ✅ EDCs under Regions
                    WHERE region.hierarchy_type_id = 10  -- ✅ Only Regions
                    GROUP BY region.hierarchy_name;
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.reduce((acc, row) => {
                acc[row.region_name] = row.edc_count;
                return acc;
            }, {});
        } catch (error) {
            console.error("❌ Error fetching EDC counts:", error);
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
            console.error("❌ Error fetching Substation counts:", error);
            throw error;
        }
    }

    async getRegionFeederCounts(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT 
                        region.hierarchy_name AS region_name,
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
                    GROUP BY region.hierarchy_name;
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.reduce((acc, row) => {
                acc[row.region_name] = row.feeder_count; // ✅ Fixed variable name
                return acc;
            }, {});
        } catch (error) {
            console.error("❌ Error fetching Feeder counts for Regions:", error);
            throw error;
        }
    }
}

// ✅ Export all models efficiently
export default {
    regions: new Regions(),
    edcs: new Edcs(),
    substations: new Substations(),
    feeders: new Feeders(),
    commMeters: new CommMeters(),
    nonCommMeters: new NonCommMeters(),
    regionDetails: new RegionsDetails(), // ✅ Correct instance creation
};
