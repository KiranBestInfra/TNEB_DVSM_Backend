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
            console.log('getTotalRegions', error);
            throw error;
        }
    }

    async getRegionNames(connection) {
        try {
            const [rows] = await connection.query({
                sql: `
                    SELECT hierarchy_name ,h.hierarchy_id, h.hierarchy_type_id
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "REGION";
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows;
        } catch (error) {
            console.error('❌ Error fetching region names:', error);
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
                        AND edc.hierarchy_type_id = 11  
                    WHERE region.hierarchy_type_id = 10  
                    GROUP BY region.hierarchy_name;
                `,
                timeout: QUERY_TIMEOUT,
            });

            return rows.reduce((acc, row) => {
                acc[row.region_name] = row.edc_count;
                return acc;
            }, {});
        } catch (error) {
            console.error('❌ Error fetching EDC counts:', error);
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
                acc[row.region_name] = row.feeder_count;
                return acc;
            }, {});
        } catch (error) {
            console.error(
                '❌ Error fetching Feeder counts for Regions:',
                error
            );
            throw error;
        }
    }

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
            console.log('getCommMeters', error);
            throw error;
        }
    }

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
            console.log('getNonCommMeters', error);
            throw error;
        }
    }

    async getSearch(connection, accessValues = [], searchTerm) {
        try {
            const searchParams = [
                `%${searchTerm}%`,
                `%${searchTerm}%`,
                `%${searchTerm}%`,
                ...accessValues,
            ];

            const [results] = await connection.query(
                {
                    sql: `
              SELECT c.hierarchy_id, c.hierarchy_name, c.hierarchy_type_id
              FROM hierarchy c
              WHERE (c.hierarchy_id LIKE ? 
                 OR c.hierarchy_name LIKE ? 
                 OR c.hierarchy_type_id LIKE ?)
              LIMIT 5
          `,
                    timeout: QUERY_TIMEOUT,
                },
                searchParams
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
            console.log('search', error);
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
                            ROUND(SUM(ad.kwh * (mt.ad_pt / mt.me_pt) * (mt.ad_ct / mt.me_ct) / 0.25 / 1000), 4) AS actual_demand_mw 
                        FROM actualdemand ad 
                        JOIN meter mt ON ad.meter_no = mt.meter_serial_no 
                        WHERE ad.datetime BETWEEN ? AND ?
                        ${meters ? `AND ad.meter_no IN (?)` : ''}
                        GROUP BY ad.datetime 
                        ORDER BY ad.datetime ASC;
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

    async getRegionMeters(
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
                        FROM hierarchy region
                        JOIN hierarchy edc 
                            ON region.hierarchy_id = edc.parent_id 
                        JOIN hierarchy district 
                            ON edc.hierarchy_id = district.parent_id 
                        JOIN hierarchy substation 
                            ON district.hierarchy_id = substation.parent_id  
                        JOIN hierarchy feeder 
                            ON substation.hierarchy_id = feeder.parent_id  
                        JOIN meter 
                            ON feeder.hierarchy_id = meter.location_id 
                        WHERE region.hierarchy_type_id = ?  
                        AND region.hierarchy_id = ?
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
            console.log('getDemandTrendsData', error);
            throw error;
        }
    }

    async getHierarchyByRegion(connection, regionID) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT h.hierarchy_id, h.hierarchy_name, h.hierarchy_type_id
                        FROM hierarchy h
                        JOIN hierarchy_master hm 
                            ON h.hierarchy_type_id = hm.hierarchy_type_id 
                        WHERE hm.hierarchy_title = "REGION"
                        AND h.hierarchy_name = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [regionID]
            );
            return results;
        } catch (error) {
            console.log('getHierarchyByRegion', error);
            throw error;
        }
    }
}

export default new Regions();
