const QUERY_TIMEOUT = 30000;

class DTR {
    async getDTRData(connection, dtrName = null) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT *
                        FROM dtr_master
                        WHERE 1=1 
                        ${dtrName ? ' AND dtr_name = ?' : ''}
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                dtrName ? [dtrName] : []
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

    async getDTRTableData(
        connection = null,
        page = 1,
        limit = 5,
        with_pagination = true,
        searchTerm = ''
    ) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (page - 1) * limit;

            let countQuery = `SELECT COUNT(*) as total FROM dtr_master WHERE 1=1`;
            let countParams = [];

            if (searchTerm) {
                countQuery += ' AND (dtr_id LIKE ? OR name LIKE ?)';
                countParams.push(`%${searchTerm}%`, `%${searchTerm}%`);
            }

            const [[{ total }]] = await connection.query({
                sql: countQuery,
                values: countParams,
                timeout: QUERY_TIMEOUT,
            });

            let mainQuery = `
            SELECT (@row_num := @row_num + 1) AS s_no, t.*
            FROM (
                SELECT *
                FROM dtr_master
                WHERE 1=1
                ${searchTerm ? 'AND (dtr_name LIKE ?)' : ''}
                ORDER BY dtr_id ASC
                LIMIT ? OFFSET ?
            ) t, (SELECT @row_num := ?) r
        `;

            const mainQueryParams = [
                ...(searchTerm ? [`%${searchTerm}%`, `%${searchTerm}%`] : []),
                limit,
                offset,
                offset,
            ];

            const [dtrData] = await connection.query({
                sql: mainQuery,
                values: mainQueryParams,
                timeout: QUERY_TIMEOUT,
            });

            const totalPages = Math.ceil(total / limit);

            return {
                data: dtrData,
                pagination: {
                    currentPage: page,
                    totalPages,
                    totalCount: total,
                    limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1,
                },
            };
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

    async getMeterByFeederName(connection, feeder_name) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT * FROM feeder_master WHERE feeder_name = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [feeder_name]
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

    async getGeoUsingDtrID(connection, dtr_id) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT * FROM dtr_master WHERE dtr_id = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [dtr_id]
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

    async getFeederData(connection, dtrIds = null) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT *
                        FROM feeder_master
                        WHERE 1=1
                        ${dtrIds ? 'AND dtr_id IN (?)' : ''}
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                dtrIds ? [dtrIds] : []
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

    async getDTRMeters(connection, dtrID = null) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                    SELECT meter_serial_no FROM feeder_master
                    WHERE 1=1
                    ${dtrID ? 'AND dtr_id IN (?)' : ''}
                `,
                    timeout: QUERY_TIMEOUT,
                },
                dtrID ? [dtrID] : []
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

    async getDailyDTRMeterConsumption(connection, meters) {
        const d1 = new Date();
        const sdf = (date) => date.toISOString().split('T')[0];
        const presDate = sdf(new Date(d1.setDate(d1.getDate() - 62)));
        d1.setDate(d1.getDate() + 62);
        const nextDate = sdf(new Date(d1));

        const [datewiseConsumption] = await connection.query({
            sql: `
                    SELECT
                        SUBSTR(cl.consumption_date, 1, 10) AS consumption_date,
                        SUM(cl.consumption) AS sum
                    FROM consumption_lkea cl
                    INNER JOIN consumers_lkea c ON c.meter_serial = cl.meter_serial_no
                    WHERE cl.consumption_date >= ?
                      AND cl.consumption_date < ?
                      AND LENGTH(cl.meter_serial_no) > 0
                      AND TRIM(cl.meter_serial_no) != ''
                      AND c.uid NOT IN (
                        SELECT uid
                        FROM disconnected_consumers_lkea
                     )
                     AND cl.meter_serial_no IN (?)
                    GROUP BY SUBSTR(cl.consumption_date, 1, 10)
                `,
            values: [presDate, nextDate, meters],
            timeout: QUERY_TIMEOUT,
        });

        return datewiseConsumption;
    }

    async getDTRkWh(connection, meters) {
        try {
            const [[{ total_kwh }]] = await connection.query(
                {
                    sql: `
                        SELECT SUM(t1.KWH_Imp) AS total_kwh
                        FROM ntpl.d3_b3 t1
                        INNER JOIN (
                            SELECT METER_SERIAL_NO, MAX(D3_TIME_STAMP) as latest_timestamp
                            FROM ntpl.d3_b3
                            WHERE D3_TIME_STAMP >= DATE(NOW() - INTERVAL 1 DAY)
                            AND D3_TIME_STAMP < DATE(NOW())
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2 ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO 
                            AND t1.D3_TIME_STAMP = t2.latest_timestamp
                        WHERE t1.D3_TIME_STAMP >= DATE(NOW() - INTERVAL 1 DAY)
                        AND t1.D3_TIME_STAMP < DATE(NOW())
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
            );
            return total_kwh;
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

    async getDTRkVAh(connection, meters) {
        try {
            const [[{ total_kVAh }]] = await connection.query(
                {
                    sql: `
                        SELECT SUM(DATA_STRING) AS total_kVAh
                        FROM ntpl.d3_b3 t1
                        INNER JOIN (
                            SELECT METER_SERIAL_NO, MAX(D3_TIME_STAMP) as latest_timestamp
                            FROM ntpl.d3_b3
                            WHERE D3_TIME_STAMP >= DATE(NOW() - INTERVAL 1 DAY)
                            AND D3_TIME_STAMP < DATE(NOW())
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2 ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO 
                            AND t1.D3_TIME_STAMP = t2.latest_timestamp
                        WHERE t1.D3_TIME_STAMP >= DATE(NOW() - INTERVAL 1 DAY)
                        AND t1.D3_TIME_STAMP < DATE(NOW())
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
            );
            return total_kVAh;
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

    async getDTRkW(connection, meters) {
        try {
            const [[{ kw }]] = await connection.query(
                {
                    sql: `
                        SELECT SUM(t1.FUND_ACT_POWER) AS kw
                        FROM ntpl.d2 t1
                        JOIN (
                            SELECT METER_SERIAL_NO, MAX(METER_TIME_STAMP) AS latest_timestamp
                            FROM ntpl.d2
                            WHERE METER_TIME_STAMP BETWEEN NOW() - INTERVAL 1 DAY AND NOW() 
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2
                        ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO
                        AND t1.METER_TIME_STAMP = t2.latest_timestamp

                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
            );
            return kw;
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

    async getDTRkVA(connection, meters) {
        try {
            const [[{ kVA }]] = await connection.query(
                {
                    sql: `
                        SELECT SUM(t1.APPARENT_POWER) AS kVA
                        FROM ntpl.d2 t1
                        JOIN (
                            SELECT METER_SERIAL_NO, MAX(METER_TIME_STAMP) AS latest_timestamp
                            FROM ntpl.d2
                            WHERE METER_TIME_STAMP BETWEEN NOW() - INTERVAL 1 DAY AND NOW()
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2
                        ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO
                        AND t1.METER_TIME_STAMP = t2.latest_timestamp
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
            );
            return kVA;
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

    async getDTRNeutralCurrent(connection, meters) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT t1.NEUTRAL_CURRENT
                        FROM d2 t1
                        JOIN (
                            SELECT METER_SERIAL_NO, MAX(METER_TIME_STAMP) AS latest_timestamp
                            FROM d2
                            WHERE METER_TIME_STAMP BETWEEN NOW() - INTERVAL 1 DAY AND NOW()
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2
                        ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO
                        AND t1.METER_TIME_STAMP = t2.latest_timestamp

                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
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

    async getLongandLatUsingDTRId(connection, meters) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT t1.NEUTRAL_CURRENT
                        FROM d2 t1
                        JOIN (
                            SELECT METER_SERIAL_NO, MAX(METER_TIME_STAMP) as latest_timestamp
                            FROM d2
                            WHERE DATE(METER_TIME_STAMP) = DATE(NOW() - INTERVAL 1 DAY)
                            AND METER_SERIAL_NO IN (?)
                            GROUP BY METER_SERIAL_NO
                        ) t2
                        ON t1.METER_SERIAL_NO = t2.METER_SERIAL_NO 
                        AND t1.METER_TIME_STAMP = t2.latest_timestamp
                        WHERE DATE(t1.METER_TIME_STAMP) = DATE(NOW() - INTERVAL 1 DAY)
                        ORDER BY t1.METER_SERIAL_NO DESC;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meters]
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
}

export default new DTR();
