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
            console.error('getTotalEdcs', error);
            throw error;
        }
    }
    async getEdcNamesByRegion(connection, region) {
        try {
            const sql = `
            SELECT hierarchy_name , h.hierarchy_id
                    FROM hierarchy h
                    JOIN hierarchy_master hm 
                        ON h.hierarchy_type_id = hm.hierarchy_type_id 
                    WHERE hm.hierarchy_title = "EDC" 
                    AND h.parent_id in (select hierarchy_id from hierarchy where hierarchy_name = ? OR hierarchy_id = ?)
        `;

            const [rows] = await connection.query(sql, [region, region]);

            return rows;
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
                     OR region.hierarchy_id = ?
                     GROUP BY edc.hierarchy_name`;

            const [rows] = await connection.query(sql, [region, region]);
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
                JOIN hierarchy district 
                    ON edc.hierarchy_id = district.parent_id  
                JOIN hierarchy substation 
                    ON district.hierarchy_id = substation.parent_id 
                LEFT JOIN hierarchy feeder 
                    ON substation.hierarchy_id = feeder.parent_id  
                WHERE region.hierarchy_type_id = 10  
                AND region.hierarchy_name = ?
                OR region.hierarchy_id = ?
                GROUP BY edc.hierarchy_name;
            `,
                timeout: QUERY_TIMEOUT,
                values: [region, region],
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

    async getHierarchyByEdc(connection, edcName) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT h.hierarchy_id, h.hierarchy_name, h.hierarchy_type_id
                        FROM hierarchy h
                        JOIN hierarchy_master hm 
                            ON h.hierarchy_type_id = hm.hierarchy_type_id 
                        WHERE hm.hierarchy_title = "EDC"
                        AND  h.hierarchy_name = ? OR h.hierarchy_id = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [edcName, edcName]
            );
            return results;
        } catch (error) {
            throw error;
        }
    }

    async getEdcMeters(
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
                        FROM hierarchy edc
                        JOIN hierarchy district 
                            ON edc.hierarchy_id = district.parent_id 
                        JOIN hierarchy substation 
                            ON district.hierarchy_id = substation.parent_id  
                        JOIN hierarchy feeder 
                            ON substation.hierarchy_id = feeder.parent_id  
                        JOIN meter 
                            ON feeder.hierarchy_id = meter.location_id 
                        WHERE edc.hierarchy_type_id = ?  
                        AND edc.hierarchy_id = ?
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
            throw error;
        }
    }

    async getMeterCalculation(connection, accessValues = [], meters = null) {
        try {
            const queryParams = [];
            let meterCondition = '';

            if (meters && meters.length > 0) {
                meterCondition = 'WHERE meter_serial_no IN (?)';
                queryParams.push(meters);
            }

            const [results] = await connection.query(
                {
                    sql: `
                SELECT 
                    meter_serial_no, 
                    (ad_pt / me_pt) * (ad_ct / me_ct) / 0.25 / 1000 AS scaling_factor
                FROM meter
                ${meterCondition}
            `,
                    timeout: QUERY_TIMEOUT,
                },
                queryParams
            );

            return results;
        } catch (error) {
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
            const queryParams = [start, end];
            let meterCondition = '';

            if (meters && meters.length > 0) {
                meterCondition = 'AND ad.meter_no IN (?)';
                queryParams.push(meters);
            }

            const [results] = await connection.query(
                {
                    sql: `
                        SELECT 
                            datetime, 
                            kwh, 
                            meter_no
                        FROM actualdemand
                        WHERE datetime BETWEEN ? AND ?
                        ORDER BY datetime ASC;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                queryParams
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
            throw error;
        }
    }
    async getCommMeters(connection, region) {
        try {
            const [[{ commMeters }]] = await connection.query(
                {
                    sql: `
                SELECT COUNT(DISTINCT ic.meter_no) AS commMeters
                FROM instant_comm ic
                JOIN meter m ON ic.meter_no = m.meter_serial_no
                JOIN hierarchy h ON m.location_id = h.hierarchy_id
                WHERE DATE(ic.device_date) ='2025-03-09'
                AND h.hierarchy_name = ?;
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [region]
            ); // Passing date & region dynamically

            return commMeters;
        } catch (error) {
            console.error('Error in getCommMeters:', error);
            throw error;
        }
    }

    async getNonCommMeters(connection, region) {
        try {
            const [[{ nonCommMeters }]] = await connection.query(
                {
                    sql: `
                SELECT COUNT(DISTINCT m.meter_serial_no) AS nonCommMeters
                FROM meter m
                JOIN hierarchy h ON m.location_id = h.hierarchy_id
                WHERE h.hierarchy_name = ?
                AND m.meter_serial_no NOT IN (
                    SELECT DISTINCT ic.meter_no
                    FROM instant_comm ic
                    WHERE DATE(ic.device_date) = '2025-03-09'
                );
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [region]
            ); // Passing region & date dynamically

            return nonCommMeters;
        } catch (error) {
            console.error('Error in getNonCommMeters:', error);
            throw error;
        }
    }

    async getEdcCommMeterCounts(connection, edc, date) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    COUNT(DISTINCT ic.meter_no) AS comm_meters
                FROM hierarchy edc
                JOIN hierarchy district 
                    ON edc.hierarchy_id = district.parent_id  
                JOIN hierarchy substation 
                    ON district.hierarchy_id = substation.parent_id 
                JOIN hierarchy feeder 
                    ON substation.hierarchy_id = feeder.parent_id 
                JOIN meter m 
                    ON feeder.hierarchy_id = m.location_id
                JOIN instant_comm ic 
                    ON ic.meter_no = m.meter_serial_no
                WHERE edc.hierarchy_type_id = 11
                  AND edc.hierarchy_id = ?
                  AND DATE(ic.device_date) = ?
                `,
                values: [edc, date],
                timeout: QUERY_TIMEOUT,
            });

            return rows.length > 0 ? rows[0].comm_meters : 0;
        } catch (error) {
            console.error(
                '❌ Error fetching communication meter counts by EDC:',
                error
            );
            throw error;
        }
    }

    async getEdcNonCommMeterCounts(connection, edc, date) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    COUNT(DISTINCT m.meter_serial_no) AS non_comm_meters
                FROM hierarchy edc
                JOIN hierarchy district 
                    ON edc.hierarchy_id = district.parent_id  
                JOIN hierarchy substation 
                    ON district.hierarchy_id = substation.parent_id 
                JOIN hierarchy feeder 
                    ON substation.hierarchy_id = feeder.parent_id 
                JOIN meter m 
                    ON feeder.hierarchy_id = m.location_id
                WHERE edc.hierarchy_type_id = 11
                  AND edc.hierarchy_id = ?
                  AND m.meter_serial_no NOT IN (
                      SELECT DISTINCT ic.meter_no 
                      FROM instant_comm ic 
                      WHERE DATE(ic.device_date) = ?
                  )
                `,
                values: [edc, date],
                timeout: QUERY_TIMEOUT,
            });

            return rows.length > 0 ? rows[0].non_comm_meters : 0;
        } catch (error) {
            console.error(
                '❌ Error fetching non-communication meter counts by EDC:',
                error
            );
            throw error;
        }
    }

    // async getTotalSubstations(connection) {
    //     try {
    //         const [[{ totalFeeders }]] = await connection.query({
    //             sql: `
    //                     SELECT COUNT(hierarchy_name) AS totalFeeders
    //                     FROM hierarchy h, hierarchy_master hm
    //                     WHERE h.hierarchy_type_id = hm.hierarchy_type_id
    //                     AND hm.hierarchy_title = "SUBSTATION"
    //                 `,
    //             timeout: QUERY_TIMEOUT,
    //         });
    //         return totalFeeders;
    //     } catch (error) {
    //         throw error;
    //     }
    // }
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
            throw error;
        }
    }

    async getDistrictCountByEDC(connection, edc) {
        try {
            const [[{ district_count }]] = await connection.query({
                sql: `
                    SELECT 
                        COUNT(district.hierarchy_id) AS district_count
                    FROM hierarchy edc
                    JOIN hierarchy district 
                        ON edc.hierarchy_id = district.parent_id 
                        AND district.hierarchy_type_id = 34
                    WHERE edc.hierarchy_type_id = 11
                    AND edc.hierarchy_name = ? OR edc.hierarchy_id = ?;
                `,
                values: [edc, edc],
                timeout: QUERY_TIMEOUT,
            });

            return district_count || 0;
        } catch (error) {
            console.error('❌ Error fetching district count for EDC:', error);
            throw error;
        }
    }

    async getSubstationCountByEDC(connection, edc) {
        try {
            const [[{ substation_count }]] = await connection.query({
                sql: `
                    SELECT 
                        COUNT(substation.hierarchy_id) AS substation_count
                    FROM hierarchy edc
                    JOIN hierarchy district 
                        ON edc.hierarchy_id = district.parent_id 
                        AND district.hierarchy_type_id = 34
                    JOIN hierarchy substation 
                        ON district.hierarchy_id = substation.parent_id 
                        AND substation.hierarchy_type_id = 35
                    WHERE edc.hierarchy_type_id = 11
                    AND edc.hierarchy_name = ? OR edc.hierarchy_id = ?;
                `,
                values: [edc, edc],
                timeout: QUERY_TIMEOUT,
            });

            return substation_count || 0;
        } catch (error) {
            console.error('❌ Error fetching substation count for EDC:', error);
            throw error;
        }
    }
}

export default new EDCs();
