import {
    calculateTotalAmount,
    convertToIST,
    formatDateDMY,
    sortAndFillData,
} from '../../utils/dashboardUtils.js';

const QUERY_TIMEOUT = 30000;

class Demo {
    constructor() {
        this.meters = [
            'A3250202',
            'AB3250200',
            'A3250201',
            'A3250204',
            'A3250203',
        ];
    }

    async getConsumerTypeCount(connection) {
        try {
            const [[{ total_consumers, postpaid_count, prepaid_count }]] =
                await connection.query(
                    {
                        sql: `SELECT 
                            COUNT(DISTINCT consumer_id) AS total_consumers,
                            COUNT(DISTINCT CASE WHEN meter_type = 'Postpaid' THEN consumer_id END) AS postpaid_count,
                            COUNT(DISTINCT CASE WHEN meter_type = 'Prepaid' THEN consumer_id END) AS prepaid_count
                        FROM consumers_lkea
                        WHERE meter_serial IN (?)
                        `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [this.meters]
                );

            return { total_consumers, postpaid_count, prepaid_count };
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

    async getActiveStatus(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT 
                    SUM(active) AS active_count,
                    SUM(inactive) AS inactive_count
                FROM (
                    SELECT 
                        meter_serial_no,
                        MAX(comm_date) AS last_update,
                        CASE 
                            WHEN MAX(comm_date) >= CURRENT_DATE() 
                                 AND MAX(comm_date) < CURRENT_DATE() + INTERVAL 1 DAY 
                            THEN 1  
                            ELSE 0 
                        END AS active,
                        CASE 
                            WHEN MAX(comm_date) < DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
                            THEN 1 
                            ELSE 0 
                        END AS inactive
                    FROM comm_count
                    WHERE meter_serial_no IN (?)
                    GROUP BY meter_serial_no
                ) AS meter_activity;
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );

            return rows[0];
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

    async getTotalConsumption(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT SUM(consumption) as total_consumption FROM consumption_lkea
                WHERE log_timestamp >= DATE_FORMAT(NOW(), '%Y-%m-01')
                  AND log_timestamp < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  AND meter_serial_no IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );

            const total_consumption = rows[0]?.total_consumption || 0;
            return total_consumption;
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

    async getUserConsumptionCategory(connection) {
        try {
            const total_consumption = await this.getTotalConsumption(
                connection
            );
            const total_consumers = await this.getConsumerTypeCount(connection);
            const threshold =
                parseInt(total_consumption) /
                parseInt(total_consumers.total_consumers);

            const [current_month_users] = await connection.query(
                {
                    sql: `
                    SELECT 
                        meter_serial_no,
                        SUM(consumption) AS total_consumption,
                        CASE 
                            WHEN SUM(consumption) > ? THEN 'heavy'
                            ELSE 'normal'
                        END AS user_type
                    FROM consumption
                    WHERE log_timestamp >= DATE_FORMAT(NOW(), '%Y-%m-01')
                      AND log_timestamp < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH)
                      AND meter_serial_no IN (?)
                    GROUP BY meter_serial_no
                    ORDER BY total_consumption DESC
                `,
                    timeout: QUERY_TIMEOUT,
                },
                [threshold, this.meters]
            );

            const currentMonthHeavyUsers = current_month_users.filter(
                (user) => user.user_type === 'heavy'
            );
            const currentMonthStandardUsers = current_month_users.filter(
                (user) => user.user_type === 'normal'
            );

            return {
                threshold: threshold.toFixed(2),
                totalUsers: current_month_users.length,
                heavyUsers: currentMonthHeavyUsers.length,
                standardUsers: currentMonthStandardUsers.length,
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

    async getTariffRates(connection) {
        try {
            const [result] = await connection.query({
                sql: `SELECT * FROM tariff`,
                timeout: QUERY_TIMEOUT,
            });
            return result;
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

    async getTotalRevenueCurrentMonth(
        connection,
        startDate = null,
        endDate = null
    ) {
        try {
            let query = `
            SELECT SUM(b.amount) AS total_revenue, COUNT(*) AS total_revenue_count
            FROM bill_lkea b
            JOIN consumers_lkea c ON b.uid = c.uid
        `;
            const params = [];

            if (startDate && endDate) {
                query +=
                    " WHERE CONVERT_TZ(b.created_at, '+00:00', '+05:30') BETWEEN ? AND ? AND c.meter_serial IN (?)";
                params.push(startDate, endDate);
                params.push(this.meters);
            } else {
                query += `
                WHERE YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                  AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                  AND b.uid != 0
                  AND c.meter_serial IN (?)
            `;
                params.push(this.meters);
            }

            const [rows] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                params
            );
            const bills = rows[0];
            return {
                total_revenue: bills.total_revenue,
                total_revenue_count: bills.total_revenue_count,
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

    async getTotalRevenueLastMonth(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT 
                    SUM(b.paid_amount) as total_bill_last_month, 
                    COUNT(*) as total_bill_last_month_count
                FROM bill_lkea b
                JOIN consumers_lkea c ON b.uid = c.uid
                WHERE YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                  AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                  AND b.uid != 0
                  AND c.meter_serial IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );

            const bills = rows[0];

            return {
                total_bill_last_month: bills.total_bill_last_month,
                count: bills.total_bill_last_month_count,
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

    async getOverdueConsumersCount(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT SUM(due_amount) as total_overdue_bill, COUNT(*) as total_overdue_bill_count
                FROM bill_lkea b
                JOIN consumers_lkea c ON b.uid = c.uid
                WHERE b.status = "Overdue" AND b.uid != 0 AND b.due_amount > 0
                AND b.uid NOT IN (
                    SELECT uid 
                    FROM disconnected_consumers_lkea
                  )
                AND c.meter_serial IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );
            const result = rows[0];
            return result;
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

    async getPendingConsumersCount(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT SUM(b.amount) as total_pending_bill, COUNT(*) as total_pending_bill_count
                FROM bill_lkea b
                JOIN consumers_lkea c ON b.uid = c.uid
                WHERE b.status = "Pending" AND b.uid != 0 AND b.amount > 0
                AND c.meter_serial IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );
            const result = rows[0];
            return result;
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

    async getConsumptionWithStartAndEndDate(
        connection,
        startDate,
        endDate,
        meter_no = null
    ) {
        try {
            let sql = `
            SELECT SUM(CONSUMPTION) as consumption
            FROM consumption_lkea
            WHERE consumption_date >= ? AND consumption_date < ? AND LENGTH(meter_serial_no) > 0
            AND TRIM(meter_serial_no) != ''
            AND meter_serial_no IN (?)
        `;

            startDate = convertToIST(startDate);
            endDate = convertToIST(endDate);

            const params = [startDate, endDate, this.meters];

            if (meter_no) {
                sql += ' AND meter_serial_no = ?';
                params.push(meter_no);
            }

            const [rows] = await connection.query(
                {
                    sql,
                    timeout: QUERY_TIMEOUT,
                },
                params
            );
            return rows[0]?.consumption != null
                ? rows[0].consumption.toFixed(2)
                : 0;
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

    async getConsumerUsingMeterNo(connection, meter_no) {
        try {
            const [[consumer]] = await connection.query(
                {
                    sql: `SELECT
						uid, consumer_type
						FROM consumers_lkea
						WHERE meter_serial = ?
                        AND meter_serial IN (?)`,
                    timeout: QUERY_TIMEOUT,
                },
                [meter_no, this.meters]
            );

            return consumer;
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

    async getTotalRevenueByStartAndEndDate(
        connection,
        meter_serial_no = null,
        tariffs = [],
        startDate = null,
        endDate = null
    ) {
        let total_bill_generated = 0;

        try {
            const now = new Date();
            const sdate = new Date(now.getFullYear(), now.getMonth(), 1);
            const edate = now;

            const sdateFormatted = formatDateDMY(sdate);
            const edateFormatted = formatDateDMY(edate);

            if (startDate && endDate) {
                startDate = formatDateDMY(new Date(startDate));
                endDate = formatDateDMY(new Date(endDate));
            }

            const params = meter_serial_no
                ? [
                      startDate ? startDate : sdateFormatted,
                      endDate ? endDate : edateFormatted,
                      this.meters,
                      meter_serial_no,
                  ]
                : [
                      startDate ? startDate : sdateFormatted,
                      endDate ? endDate : edateFormatted,
                      this.meters,
                  ];

            const [meters] = await connection.query(
                {
                    sql: `SELECT 
                            d.METER_SERIAL_NO,
                            SUBSTRING_INDEX(
                                GROUP_CONCAT(d.DATA_STRING ORDER BY d.D6_TIME_STAMP ASC),
                                ',', 
                                1
                            ) AS previous_reading,
                            SUBSTRING_INDEX(
                                GROUP_CONCAT(d.DATA_STRING ORDER BY d.D6_TIME_STAMP ASC),
                                ',', 
                                -1
                            ) AS current_reading,
                            c.consumer_type 
                        FROM d6_data d
                        JOIN consumers_lkea c 
                          ON d.METER_SERIAL_NO = c.meter_serial
                        WHERE d.D6_TIME_STAMP >= STR_TO_DATE(?, '%d-%m-%Y')
                          AND d.D6_TIME_STAMP <= STR_TO_DATE(?, '%d-%m-%Y')
                          AND METER_SERIAL_NO IN (?)
                        ${meter_serial_no ? 'AND d.METER_SERIAL_NO = ?' : ''}
                        GROUP BY d.METER_SERIAL_NO`,
                    timeout: QUERY_TIMEOUT,
                },
                params
            );

            if (meter_serial_no) {
                if (meters.length === 0) {
                    return {
                        previous_reading: 0,
                        current_reading: 0,
                        units: 0,
                        total_bill: 0,
                        tariff: 'Category - 1',
                    };
                }
                const meter = meters[0];
                const prev = parseFloat(meter.previous_reading) || 0;
                const curr = parseFloat(meter.current_reading) || 0;
                let total_units = (curr - prev).toFixed(2);

                const consumer_type = await this.getConsumerUsingMeterNo(
                    connection,
                    meter_serial_no
                );
                let { amount: total_bill, tariff } = calculateTotalAmount(
                    tariffs,
                    consumer_type ? consumer_type.consumer_type : ''
                );
                let bill = total_bill;
                return {
                    previous_reading: prev.toFixed(2),
                    current_reading: curr.toFixed(2),
                    units: total_units,
                    total_bill: bill,
                    tariff,
                };
            }

            for (const row of meters) {
                const prev = parseFloat(row.previous_reading) || 0;
                const curr = parseFloat(row.current_reading) || 0;
                let consumption = (curr - prev).toFixed(2);
                let { amount: total_bill } = calculateTotalAmount(
                    consumption,
                    row.consumer_type
                );
                total_bill_generated += parseFloat(total_bill);
            }
            return {
                total_bill_generated: total_bill_generated.toFixed(2),
                count: meters.length,
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

    async getDisconnectedConsumerCount(connection) {
        try {
            const query = `
            SELECT 
                c.meter_type,
                COUNT(*) as disconnection_count
            FROM 
                disconnected_consumers_lkea d
            JOIN 
                consumers_lkea c ON d.uid = c.uid
            WHERE 
                d.status = 'Disconnected'
                AND c.meter_serial IN (?)
            GROUP BY 
                c.meter_type
            ORDER BY 
                disconnection_count DESC;
        `;

            const [results] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );

            let postpaidCount = 0;
            let prepaidCount = 0;

            results.forEach((row) => {
                if (row.meter_type.toLowerCase() === 'postpaid') {
                    postpaidCount = row.disconnection_count;
                } else if (row.meter_type.toLowerCase() === 'prepaid') {
                    prepaidCount = row.disconnection_count;
                }
            });

            return {
                postpaid: postpaidCount,
                prepaid: prepaidCount,
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

    async graphDashboardAnalytics(connection, peroid) {
        // let levelId = 0;
        // let hierarchyId = 0;
        // let selhLevelNo = 0;
        // let d2LastDate = '-1';
        // let install_type_forDB = 24;

        try {
            // Query 1: Get hierarchy master data for the given levelId
            // const [hierarchyMaster] = await connection.query(
            //     {
            //         sql: `SELECT * FROM hierarchy_master WHERE hierarchy_type_id = ?`,
            //         timeout: QUERY_TIMEOUT, // Timeout in milliseconds
            //     },
            //     [levelId]
            // );

            // if (hierarchyMaster) {
            //     hierarchyMaster.forEach((item) => {
            //         if (item.parent_title_id !== 0) {
            //             levelId = item.parent_title_id;
            //             selhLevelNo++;
            //         }
            //     });
            // }

            // Query 2: Get hierarchy types based on client and device location
            // const [result] = await connection.query({
            //     sql: `SELECT hierarchy_type_id FROM hierarchy_master WHERE client_id = 1 AND device_location = 1`,
            //     timeout: QUERY_TIMEOUT,
            // });

            // if (!result) return [];

            // const consumptionByDate = await Promise.all(
            //     result.map(async (item) => {
            //         if (
            //             install_type_forDB == 0 ||
            //             install_type_forDB == item.hierarchy_type_id
            //         ) {
            // let hLevelNo = 0;
            // let levelCount = 0;
            // let levelNo = 0;
            // let tempLocationID = item.hierarchy_type_id;

            // // Query 3: Get hierarchy IDs for the current tempLocationID
            // const [hierarchyIDs] = await connection.query(
            //     {
            //         sql: `SELECT * FROM hierarchy_master WHERE hierarchy_type_id = ?`,
            //         timeout: QUERY_TIMEOUT,
            //     },
            //     [tempLocationID]
            // );

            // hierarchyIDs.forEach((hierarchyID) => {
            //     if (hierarchyID.parent_title_id !== 0) {
            //         tempLocationID = hierarchyID.parent_title_id;
            //         hLevelNo++;
            //     }
            // });

            // // Determine levelCount based on hierarchy levels
            // levelCount = hLevelNo + 1;

            // // Build the complete hierarchy SQL for meter_serial_no list
            // let complHierarchySql =
            //     'SELECT meter_serial_no FROM meter m';
            // for (let h = 1; h <= levelCount; h++) {
            //     complHierarchySql += `, hierarchy h${h}`;
            // }
            // complHierarchySql += ` WHERE m.location_id = h1.hierarchy_id AND h1.client_id = 1`;
            // for (let h = 1; h < levelCount; h++) {
            //     complHierarchySql += ` AND h${h}.parent_id = h${
            //         h + 1
            //     }.hierarchy_id`;
            // }
            // if (levelId !== 0) {
            //     complHierarchySql += ` AND h${
            //         levelCount - selhLevelNo
            //     }.hierarchy_id = ${hierarchyId}`;
            // }

            // // Build the complete hierarchy SQL for counts
            // let complHierarchySql_Counts =
            //     'SELECT meter_serial_no, m3.modem_sl_no, c.consumer_id FROM meter m, modem m3, consumers_lkea c';
            // for (let h = 1; h <= levelCount; h++) {
            //     complHierarchySql_Counts += `, hierarchy h${h}`;
            // }
            // complHierarchySql_Counts +=
            //     ' WHERE m.location_id = h1.hierarchy_id AND c.consumer_name = h1.hierarchy_name ' +
            //     'AND m.modem_sl_no = m3.modem_id AND h1.client_id = 1';
            // for (let h = 1; h < levelCount; h++) {
            //     complHierarchySql_Counts += ` AND h${h}.parent_id = h${
            //         h + 1
            //     }.hierarchy_id`;
            // }
            // if (levelId !== 0) {
            //     complHierarchySql_Counts += ` AND h${
            //         levelCount - selhLevelNo
            //     }.hierarchy_id = ${hierarchyId}`;
            // }

            if (peroid == 'daily') {
                const d1 = new Date();
                const sdf = (date) => date.toISOString().split('T')[0];
                const presDate = sdf(new Date(d1.setDate(d1.getDate() - 62)));
                d1.setDate(d1.getDate() + 62);
                const nextDate = sdf(new Date(d1));

                const [datewiseConsumption] = await connection.query(
                    {
                        sql: `
                            SELECT SUBSTR(consumption_date, 1, 10) AS consumption_date,
                                COUNT(*) AS count,
                                SUM(consumption) AS sum
                            FROM consumption_lkea
                            WHERE consumption_date >= ?
                                AND consumption_date < ?
                                AND LENGTH(meter_serial_no) > 0
                                AND TRIM(meter_serial_no) != ''
                                AND meter_serial_no IN (?)
                            GROUP BY SUBSTR(consumption_date, 1, 10)
                                    `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [presDate, nextDate, this.meters]
                );

                return datewiseConsumption;
            }

            if (peroid == 'monthly') {
                const d1 = new Date();
                const sdf = (date) => date.toISOString().split('T')[0];
                const presDate = sdf(new Date(d1.setMonth(d1.getMonth() - 13)));
                d1.setMonth(d1.getMonth() + 14);
                const nextDate = sdf(new Date(d1));

                const [datewiseConsumption] = await connection.query(
                    {
                        sql: `
                            SELECT SUBSTR(consumption_date, 1, 7) AS consumption_date,
                                COUNT(*) AS count,
                                SUM(consumption) AS sum
                            FROM consumption_lkea
                            WHERE consumption_date >= ?
                                AND consumption_date < ? AND LENGTH(meter_serial_no) > 0
                                AND TRIM(meter_serial_no) != ''
                                AND meter_serial_no IN (?)
                            GROUP BY SUBSTR(consumption_date, 1, 7)
                                    `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [presDate, nextDate, this.meters]
                );

                return sortAndFillData(datewiseConsumption);
            }
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

    async getBillingAndCollectionGraphData(connection) {
        try {
            const [bills] = await connection.query(
                {
                    sql: `
                SELECT 
                    DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+05:30'), '%Y-%m') AS bill_month,
                    COUNT(*) AS total_bill_count,
                    SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) AS pending_bill_count,
                    SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) AS paid_bill_count
                FROM bill_lkea b
                JOIN consumers_lkea c ON b.uid = c.uid
                WHERE CONVERT_TZ(b.created_at, '+00:00', '+05:30') >= 
                    DATE_FORMAT(DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '+05:30'), INTERVAL 13 MONTH), '%Y-%m-01')
                    AND b.uid != 0
                    AND c.meter_serial IN (?)
                GROUP BY bill_month
                ORDER BY bill_month
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );
            return bills;
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

    async getOverdueConsumerTable(connection, page = 1, limit = 5) {
        try {
            page = Math.max(0, parseInt(page));
            limit = Math.max(0, parseInt(limit));
            const offset = (page - 1) * limit;

            const [consumersResult, countResult] = await Promise.all([
                connection.query(
                    {
                        sql: `
                    SELECT c.consumer_id, c.consumer_name, c.block_name, c.flat_no, b.due_amount, c.uid
                    FROM consumers_lkea c
                    JOIN bill_lkea b ON c.uid = b.uid
                    WHERE b.status = 'Overdue' 
                      AND b.due_amount > 0 
                      AND b.uid != 0
                      AND c.uid NOT IN (
                        SELECT uid 
                        FROM disconnected_consumers_lkea
                      )
                      AND c.meter_serial IN (?)
                    LIMIT ? OFFSET ?
                `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [this.meters, limit, offset]
                ),
                connection.query(
                    {
                        sql: `
                SELECT COUNT(*) AS count
                FROM consumers_lkea c
                JOIN bill_lkea b ON c.uid = b.uid
                WHERE b.status = 'Overdue' 
                  AND b.due_amount > 0 
                  AND b.uid != 0
                  AND c.uid NOT IN (
                    SELECT uid 
                    FROM disconnected_consumers_lkea
                  )
                  AND c.meter_serial IN (?)
            `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [this.meters]
                ),
            ]);

            const consumers = consumersResult[0];
            const total = countResult[0][0].count;
            const totalPages = Math.ceil(total / limit);

            return {
                data: consumers,
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

    async getDisconnectedMeters(connection, page = 1, limit = 5) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.max(1, parseInt(limit));
            const offset = (page - 1) * limit;

            const [metersResult, countResult] = await Promise.all([
                connection.query(
                    {
                        sql: `
                    SELECT 
                        t2.uid,
                        t1.consumer_name,
                        t1.block_name,
                        t1.flat_no,
                        t2.overdue_amount as amount
                    FROM consumers_lkea t1
                    INNER JOIN disconnected_consumers_lkea t2 ON t1.uid = t2.uid
                    WHERE t2.overdue_amount > 0
                        AND t1.meter_serial IN (?)
                    ORDER BY t2.overdue_amount DESC
                    LIMIT ? OFFSET ?
                    `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [this.meters, limit, offset]
                ),
                connection.query(
                    {
                        sql: `
                SELECT COUNT(*) AS count
                FROM consumers_lkea t1
                INNER JOIN disconnected_consumers_lkea t2 ON t1.uid = t2.uid
                WHERE t2.overdue_amount > 0
                    AND t1.meter_serial IN (?)
                `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [this.meters]
                ),
            ]);

            const meters = metersResult[0];
            const total = countResult[0][0].count;
            const totalPages = Math.ceil(total / limit);

            return {
                data: meters,
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

    async getConsumersTable(
        connection = null,
        page = 1,
        limit = 5,
        with_pagination = true,
        searchTerm = '',
        meterNumbers = null
    ) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (page - 1) * limit;

            const metersToUse = meterNumbers ? meterNumbers : this.meters;

            if (metersToUse.length == 0) {
                return {
                    data: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 1,
                        totalCount: 1,
                        limit,
                        hasNextPage: page < 1,
                        hasPrevPage: page > 1,
                    },
                };
            }

            let countQuery = `SELECT COUNT(DISTINCT consumer_id) as total FROM consumers_lkea WHERE${
                meterNumbers ? '' : ' meter_serial IN (?)'
            } `;
            let countParams = [metersToUse];

            if (meterNumbers) {
                countQuery += ' meter_serial IN (?)';
                countParams.push(meterNumbers);
            }

            if (searchTerm) {
                countQuery += ' AND consumer_id LIKE ?';
                countParams.push(`%${searchTerm}%`);
            }

            const [[{ total }]] = await connection.query(
                {
                    sql: countQuery,
                    timeout: QUERY_TIMEOUT,
                },
                countParams
            );

            let mainQuery = `
            SELECT (@row_num := @row_num + 1) AS s_no, t.*
            FROM (
                SELECT c.*
                FROM consumers_lkea c
                JOIN (
                    SELECT MIN(sl_no) AS min_consumer_no
                    FROM consumers_lkea
                    WHERE consumer_id LIKE ?
                    ${
                        meterNumbers && meterNumbers.length > 0
                            ? 'AND meter_serial IN (?)'
                            : 'AND meter_serial IN (?)'
                    }
                    GROUP BY consumer_id
                ) AS sub ON c.sl_no = sub.min_consumer_no
                ORDER BY c.consumer_name ASC
                LIMIT ? OFFSET ?
            ) t, (SELECT @row_num := ?) r`;

            const queryParams = [
                `%${searchTerm}%`,
                metersToUse,
                limit,
                offset,
                offset,
            ];

            const [consumers] = await connection.query(
                {
                    sql: mainQuery,
                    timeout: QUERY_TIMEOUT,
                },
                queryParams
            );

            for (const consumer of consumers) {
                try {
                    const statusResults = await this.getConsumerActiveStatus(
                        connection,
                        consumer.meter_serial
                    );

                    consumer.is_communicating =
                        statusResults &&
                        statusResults[0] &&
                        statusResults[0].active === 1;
                } catch (error) {
                    consumer.is_communicating = false;
                }
            }

            const totalPages = Math.ceil(total / limit);

            return {
                data: consumers,
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

    async getConsumerActiveStatus(connection, meter_no) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                SELECT 
                    CASE 
                        WHEN MAX(comm_date) >= CURRENT_DATE() 
                             AND MAX(comm_date) < CURRENT_DATE() + INTERVAL 1 DAY 
                        THEN 1  
                        ELSE 0 
                    END AS active,
                    CASE 
                        WHEN MAX(comm_date) < DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
                        THEN 1 
                        ELSE 0 
                    END AS inactive
                FROM comm_count
                WHERE meter_serial_no = ? AND meter_serial_no IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter_no, this.meters]
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

    async getActiveMeters(connection) {
        try {
            const query = `
               SELECT 
                meter_serial_no
            FROM ntpl.comm_count
            WHERE meter_serial_no IN (?)
            GROUP BY meter_serial_no
            HAVING MAX(comm_date) >= CURRENT_DATE() 
            AND MAX(comm_date) < CURRENT_DATE() + INTERVAL 1 DAY
            `;

            const [results] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
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

    async getInActiveMeters(connection) {
        try {
            const activeMeters = await this.getActiveMeters(connection);

            const transformMeters = (metersArray) => {
                return metersArray.map((meter) => meter.meter_serial_no);
            };
            const meters = transformMeters(activeMeters);
            if (!meters || meters.length === 0) {
                const simpleQuery = `
                SELECT
                    meter_serial
                FROM consumers_lkea
                WHERE meter_serial IN (?)
            `;

                const [results] = await connection.query({
                    sql: simpleQuery,
                    timeout: QUERY_TIMEOUT,
                    values: [this.meters],
                });

                return results;
            }

            const query = `
                SELECT 
                    meter_serial
                FROM consumers_lkea
                WHERE meter_serial IN (?) AND meter_serial NOT IN (?)
            `;

            const [results] = await connection.query({
                sql: query,
                timeout: QUERY_TIMEOUT,
                values: [this.meters, meters],
            });

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

    async getTariffRates(connection) {
        try {
            const [result] = await connection.query({
                sql: `SELECT * FROM tariff`,
                timeout: QUERY_TIMEOUT,
            });
            return result;
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

    async getHierarchy(connection) {
        try {
            const [results] = await connection.query({
                sql: `SELECT 
                    child.location_id,
                    child.location_name,
                    child.parent_location_id,
                    parent.location_name AS parent_location_name,
                    child.location_type,
                    child.active_flag
                    FROM location_hierarchy_lkea AS child
                    LEFT JOIN location_hierarchy_lkea AS parent
                    ON child.parent_location_id = parent.location_id;
`,
                timeout: QUERY_TIMEOUT,
            });
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

    async newConnections(connection, startDate = null, endDate = null) {
        try {
            const sql = `
                SELECT COUNT(*) AS count
                FROM consumer c
                JOIN consumers_lkea c_new ON c.consumer_name = c_new.consumer_name
                ${
                    startDate && endDate
                        ? 'WHERE c.created_date BETWEEN ? AND ? AND c_new.meter_serial IN (?)'
                        : 'WHERE MONTH(c.created_date) = MONTH(CURRENT_DATE()) AND YEAR(c.created_date) = YEAR(CURRENT_DATE()) AND c_new.meter_serial IN (?)'
                }
            `;
            const params =
                startDate && endDate
                    ? [startDate, endDate, this.meters]
                    : [this.meters];

            const [rows] = await connection.query(
                { sql, timeout: QUERY_TIMEOUT },
                params
            );
            const count = rows[0]?.count || 0;
            return count;
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

    async newConnectionsLastMonth(connection) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `
                SELECT COUNT(*) AS count
                FROM consumer c
                JOIN consumers_lkea c_new ON c.consumer_name = c_new.consumer_name
                WHERE MONTH(c.created_date) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
                  AND YEAR(c.created_date) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
                  AND c_new.meter_serial IN (?)
            `,
                    timeout: QUERY_TIMEOUT,
                },
                [this.meters]
            );
            const count = rows[0]?.count || 0;
            return count;
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

export default new Demo();
