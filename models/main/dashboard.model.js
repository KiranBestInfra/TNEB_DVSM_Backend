import {
    calculateTotalAmount,
    convertToIST,
    formatDate,
    formatDateDMY,
    formatDateYMD,
    sortAndFillData,
} from '../../utils/dashboardUtils.js';

const QUERY_TIMEOUT = 30000;

class Dashboard {
    async getLocationAccessCondition(connection, user, prefix) {
        try {
            const [[location]] = await connection.query({
                sql: `
                SELECT l.location_id, l.location_name, l.location_type
                FROM location_hierarchy_lkea l
                WHERE location_id = ?
            `,
                values: [user.locationHierarchy],
                timeout: 30000,
            });

            if (!location) {
                throw new Error('Invalid location hierarchy');
            }

            async function getAccessibleBlocks(locationId) {
                await connection.query('SET @ids := ?', [locationId]);

                const [blocks] = await connection.query(
                    `
                    SELECT DISTINCT h2.location_name 
                    FROM (
                        SELECT 
                            @parent_ids := (
                                SELECT GROUP_CONCAT(location_id SEPARATOR ',')
                                FROM location_hierarchy_lkea
                                WHERE FIND_IN_SET(parent_location_id, @ids)
                            ) as child_ids,
                            IF(@parent_ids IS NOT NULL, CONCAT(@ids, ',', @parent_ids), @ids) as all_ids,
                            @ids := IF(@parent_ids IS NOT NULL, CONCAT(@ids, ',', @parent_ids), @ids) as current_level
                        FROM 
                            location_hierarchy_lkea
                        WHERE @ids IS NOT NULL
                        LIMIT 999999  
                    ) hierarchy_recursive
                    JOIN location_hierarchy_lkea h2
                    WHERE 
                        (
                            FIND_IN_SET(h2.location_id, hierarchy_recursive.all_ids)
                            OR FIND_IN_SET(h2.parent_location_id, hierarchy_recursive.all_ids)
                            OR h2.location_id = ?
                        )
                        AND h2.location_type = 'Block'
                    ORDER BY h2.location_name
                `,
                    [locationId]
                );

                return (
                    blocks.map((block) => block.location_name).join(',') || ''
                );
            }

            let accessCondition = '';
            const tablePrefix = prefix ? prefix + '.' : '';

            if (location.location_type === 'Block') {
                accessCondition = `AND ${tablePrefix}block_name = ?`;
                return {
                    condition: accessCondition,
                    values: [location.location_name],
                };
            } else if (location.location_type === 'City') {
                const blockNames = await getAccessibleBlocks(
                    location.location_id
                );
                if (blockNames) {
                    let blockList = blockNames
                        .split(',')
                        .filter((block) => block.trim() !== 'Block-D');
                    const placeholders = blockList.map(() => '?').join(',');
                    accessCondition = `AND ${tablePrefix}block_name IN (${placeholders})`;
                    return {
                        condition: accessCondition,
                        values: blockList,
                    };
                }
            }

            return {
                condition: '',
                values: [],
            };
        } catch (error) {
            console.error('getLocationAccessCondition error:', error);
            throw error;
        }
    }

    async getConsumersTable(
        connection = null,
        accessCondition,
        accessValues,
        page = 1,
        limit = 5,
        with_pagination = true,
        searchTerm = '',
        meterNumbers = null
    ) {
        try {
            if (meterNumbers === null) {
                return {
                    data: [],
                    pagination: {
                        currentPage: page,
                        totalPages: 0,
                        totalCount: 0,
                        limit,
                        hasNextPage: false,
                        hasPrevPage: false,
                    },
                };
            }

            page = Math.max(1, parseInt(page));
            limit = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (page - 1) * limit;

            let countQuery = `SELECT COUNT(DISTINCT c.uid) as total 
                            FROM consumers_lkea c
                            WHERE 1=1
                            `;
            let countParams = [];

            if (meterNumbers && meterNumbers.length > 0) {
                countQuery += ' AND c.meter_serial IN (?)';
                countParams.push(meterNumbers);
            }

            if (searchTerm) {
                countQuery += ' AND c.consumer_id LIKE ?';
                countParams.push(`%${searchTerm}%`);
            }

            if (accessCondition) {
                countQuery += ` ${accessCondition}`;
                countParams.push(...accessValues);
            }

            const [[{ total }]] = await connection.query({
                sql: countQuery,
                values: countParams,
                timeout: QUERY_TIMEOUT,
            });

            let mainQuery = `
            SELECT (@row_num := @row_num + 1) AS s_no, t.*
            FROM (
                SELECT c.*
                FROM consumers_lkea c
                WHERE 1=1
                ${
                    meterNumbers && meterNumbers.length > 0
                        ? 'AND c.meter_serial IN (?)'
                        : ''
                }
                ${searchTerm ? 'AND c.consumer_id LIKE ?' : ''}
                ${accessCondition}
                ORDER BY c.consumer_name ASC
                LIMIT ? OFFSET ?
            ) t, (SELECT @row_num := ?) r
        `;

            const mainQueryParams = [
                ...(meterNumbers && meterNumbers.length > 0
                    ? [meterNumbers]
                    : []),
                ...(searchTerm ? [`%${searchTerm}%`] : []),
                ...accessValues,
                limit,
                offset,
                offset,
            ];

            const [consumers] = await connection.query({
                sql: mainQuery,
                values: mainQueryParams,
                timeout: QUERY_TIMEOUT,
            });

            for (const consumer of consumers) {
                try {
                    const statusResults = await this.getConsumerActiveStatus(
                        connection,
                        consumer.meter_serial
                    );
                    consumer.is_communicating =
                        statusResults?.[0]?.active === 1;
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
            console.error('getConsumersTable Error:', error);
            throw error;
        }
    }

    async getConsumerByID(connection, consumer_uid) {
        try {
            const [[consumer]] = await connection.query(
                {
                    sql: 'SELECT * FROM consumers_lkea WHERE uid = ?',
                    timeout: QUERY_TIMEOUT,
                },
                [consumer_uid]
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
            console.log('getConsumerByID', error);
            throw error;
        }
    }

    async getConsumerByIDOrMeter(connection, id) {
        try {
            const [[consumer]] = await connection.query(
                {
                    sql: 'SELECT * FROM consumers_lkea WHERE uid = ? || meter_serial = ?',
                    timeout: QUERY_TIMEOUT,
                },
                [id, id]
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
            console.log('getConsumerByID', error);
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
						WHERE meter_serial = ?`,
                    timeout: QUERY_TIMEOUT,
                },
                [meter_no]
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
            console.log('getConsumerUsingMeterNo', error);
            throw error;
        }
    }

    async getConsumerTypeCount(connection, accessCondition, accessValues) {
        try {
            const [[{ total_consumers, postpaid_count, prepaid_count }]] =
                await connection.query({
                    sql: `
                    SELECT 
                        COUNT(DISTINCT c.consumer_id) AS total_consumers,
                        COUNT(DISTINCT CASE WHEN c.meter_type = 'Postpaid' THEN c.consumer_id END) AS postpaid_count,
                        COUNT(DISTINCT CASE WHEN c.meter_type = 'Prepaid' THEN c.consumer_id END) AS prepaid_count
                    FROM consumers_lkea c
                    WHERE 1=1 ${accessCondition}
                `,
                    values: accessValues,
                    timeout: QUERY_TIMEOUT,
                });

            return { total_consumers, postpaid_count, prepaid_count };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getConsumerTypeCount error:', error);
            throw error;
        }
    }

    // async getTotalRevenueByStartAndEndDate(
    //     connection,
    //     accessCondition,
    //     accessValues,
    //     meter_serial_no = null,
    //     tariffs = [],
    //     startDate = null,
    //     endDate = null
    // ) {
    //     let total_bill_generated = 0;

    //     try {
    //         const now = new Date();
    //         const sdate = new Date(now.getFullYear(), now.getMonth(), 1);
    //         const edate = now;

    //         const sdateFormatted = formatDateDMY(sdate);
    //         const edateFormatted = formatDateDMY(edate);

    //         if (startDate && endDate) {
    //             startDate = formatDateDMY(new Date(startDate));
    //             endDate = formatDateDMY(new Date(endDate));
    //         }

    //         // Build query parameters
    //         const params = [
    //             startDate ? startDate : sdateFormatted,
    //             endDate ? endDate : edateFormatted,
    //             ...accessValues,
    //             ...(meter_serial_no ? [meter_serial_no] : []),
    //         ];

    //         const [meters] = await connection.query({
    //             sql: `
    // SELECT
    //     d.METER_SERIAL_NO,
    //     SUBSTRING_INDEX(
    //         GROUP_CONCAT(d.DATA_STRING ORDER BY d.D6_TIME_STAMP ASC),
    //         ',',
    //         1
    //     ) AS previous_reading,
    //     SUBSTRING_INDEX(
    //         GROUP_CONCAT(d.DATA_STRING ORDER BY d.D6_TIME_STAMP ASC),
    //         ',',
    //         -1
    //     ) AS current_reading,
    //     c.consumer_type
    // FROM d6_data d
    // JOIN consumers_lkea c ON d.METER_SERIAL_NO = c.meter_serial
    // WHERE d.D6_TIME_STAMP >= STR_TO_DATE(?, '%d-%m-%Y')
    // AND d.D6_TIME_STAMP <= STR_TO_DATE(?, '%d-%m-%Y')
    // ${accessCondition}
    // ${meter_serial_no ? 'AND d.METER_SERIAL_NO = ?' : ''}
    // GROUP BY d.METER_SERIAL_NO
    //         `,
    //             values: params,
    //             timeout: QUERY_TIMEOUT,
    //         });

    //         if (meter_serial_no) {
    //             // Single meter case
    //             if (meters.length === 0) {
    //                 return {
    //                     previous_reading: '0.00',
    //                     current_reading: '0.00',
    //                     units: '0.00',
    //                     total_bill: 0,
    //                     tariff: 'Category - 1',
    //                 };
    //             }

    //             const meter = meters[0];
    //             const prev = parseFloat(meter.previous_reading) || 0;
    //             const curr = parseFloat(meter.current_reading) || 0;
    //             let total_units = (curr - prev).toFixed(2);

    //             const consumer_type = await this.getConsumerUsingMeterNo(
    //                 connection,
    //                 meter_serial_no
    //             );

    //             let { amount: total_bill, tariff } = calculateTotalAmount(
    //                 tariffs,
    //                 consumer_type ? consumer_type.consumer_type : ''
    //             );

    //             return {
    //                 previous_reading: prev.toFixed(2),
    //                 current_reading: curr.toFixed(2),
    //                 units: total_units,
    //                 total_bill: total_bill,
    //                 tariff,
    //             };
    //         }

    //         // Multiple meters case
    //         for (const row of meters) {
    //             const prev = parseFloat(row.previous_reading) || 0;
    //             const curr = parseFloat(row.current_reading) || 0;
    //             let consumption = (curr - prev).toFixed(2);
    //             let { amount: total_bill } = calculateTotalAmount(
    //                 consumption,
    //                 row.consumer_type
    //             );
    //             total_bill_generated += parseFloat(total_bill);
    //         }

    //         return {
    //             total_bill_generated: total_bill_generated.toFixed(2),
    //             count: meters.length,
    //         };
    //     } catch (error) {
    //         if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
    //             throw new Error(
    //                 'Dashboard query timed out after ' +
    //                     QUERY_TIMEOUT / 1000 +
    //                     ' seconds'
    //             );
    //         }
    //         console.error('getTotalRevenueByStartAndEndDate error:', error);
    //         throw error;
    //     }
    // }

    async getTotalRevenueByStartAndEndDate(
        connection,
        accessCondition,
        accessValues,
        meter_serial_no = null,
        tariffs = [],
        startDate = null,
        endDate = null
    ) {
        let total_bill_generated = 0;

        try {
            const now = new Date().toLocaleString('en-US', {
                timeZone: 'Asia/Kolkata',
            });
            const ist = new Date(now);

            const sdate = new Date(ist.getFullYear(), ist.getMonth(), 1);
            const edate = ist;

            const sdateFormatted = sdate;
            const edateFormatted = edate;

            const params = [
                startDate ? startDate : sdateFormatted,
                endDate ? endDate : edateFormatted,
                ...accessValues,
                ...(meter_serial_no ? [meter_serial_no] : []),
            ];

            const [meters] = await connection.query({
                sql: `
                SELECT 
                    cons.meter_serial_no,
                    SUBSTRING_INDEX(
                        GROUP_CONCAT(cons.consumption ORDER BY cons.consumption_date ASC),
                        ',',
                        1
                    ) AS previous_consumption,
                    SUBSTRING_INDEX(
                        GROUP_CONCAT(cons.consumption ORDER BY cons.consumption_date ASC),
                        ',',
                        -1
                    ) AS current_consumption,
                    SUM(cons.consumption) as total,
                    c.consumer_type
                FROM consumption_lkea cons
                JOIN consumers_lkea c ON cons.meter_serial_no = c.meter_serial
                WHERE cons.consumption_date >= ? 
                AND cons.consumption_date < ?
                ${accessCondition}
                ${meter_serial_no ? 'AND cons.meter_serial_no = ?' : ''}
                GROUP BY cons.meter_serial_no, c.consumer_type
            `,
                values: params,
                timeout: QUERY_TIMEOUT,
            });
            if (meter_serial_no) {
                if (meters.length === 0) {
                    return {
                        previous_reading: '0.00',
                        current_reading: '0.00',
                        units: '0.00',
                        total_bill: 0,
                        tariff: 'Category - 1',
                    };
                }

                const meter = meters[0];
                const prev = parseFloat(meter.previous_consumption) || 0;
                const curr = parseFloat(meter.current_consumption) || 0;
                let total_units = meter.total;

                const consumer_type = await this.getConsumerUsingMeterNo(
                    connection,
                    meter_serial_no
                );

                let { amount: total_bill, tariff } = calculateTotalAmount(
                    total_units,
                    consumer_type ? consumer_type.consumer_type : ''
                );

                return {
                    previous_reading: prev.toFixed(2),
                    current_reading: curr.toFixed(2),
                    units: total_units,
                    total_bill: total_bill,
                    tariff,
                };
            }

            for (const row of meters) {
                const prev = parseFloat(row.previous_reading) || 0;
                const curr = parseFloat(row.current_reading) || 0;
                let consumption = row.total;
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
            console.error('getTotalRevenueByStartAndEndDate error:', error);
            throw error;
        }
    }

    async getTotalRevenueLastMonth(connection, accessCondition, accessValues) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    COALESCE(SUM(b.paid_amount), 0) as total_bill_last_month, 
                    COUNT(*) as total_bill_last_month_count
                FROM bill_lkea b
                INNER JOIN consumers_lkea c ON c.uid = b.uid
                WHERE YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                  AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                  AND b.uid != 0
                  ${accessCondition}
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

            if (!rows[0]) {
                return {
                    total_bill_last_month: 0,
                    count: 0,
                };
            }

            return {
                total_bill_last_month: rows[0].total_bill_last_month || 0,
                count: rows[0].total_bill_last_month_count || 0,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalRevenueLastMonth error:', error);
            throw error;
        }
    }

    async getTotalPendingRevenueLastMonth(
        connection,
        accessCondition,
        accessValues
    ) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    COALESCE(SUM(b.paid_amount), 0) as total_pending_revenue_last_month, 
                    COUNT(b.uid) as total_pending_revenue_last_month_count
                FROM bill_lkea b
                INNER JOIN consumers_lkea c ON c.uid = b.uid
                WHERE YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND b.uid != 0
                    AND b.status = 'Pending'
                    ${accessCondition}
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

            // Handle case where no rows are found
            if (!rows[0]) {
                return {
                    total_pending_revenue_last_month: 0,
                    total_pending_revenue_last_month_count: 0,
                };
            }

            return {
                total_pending_revenue_last_month:
                    rows[0].total_pending_revenue_last_month || 0,
                total_pending_revenue_last_month_count:
                    rows[0].total_pending_revenue_last_month_count || 0,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalPendingRevenueLastMonth error:', error);
            throw error;
        }
    }

    async getTotalOverDueRevenueLastMonth(
        connection,
        accessCondition,
        accessValues
    ) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    COALESCE(SUM(b.paid_amount), 0) as total_overdue_revenue_last_month, 
                    COUNT(b.uid) as total_overdue_revenue_last_month_count
                FROM bill_lkea b
                INNER JOIN consumers_lkea c ON c.uid = b.uid
                WHERE YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = 
                      MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND b.uid != 0
                    AND b.status = 'Overdue'
                    ${accessCondition}
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

            if (!rows[0]) {
                return {
                    total_overdue_revenue_last_month: 0,
                    total_overdue_revenue_last_month_count: 0,
                };
            }

            return {
                total_overdue_revenue_last_month:
                    rows[0].total_overdue_revenue_last_month || 0,
                total_overdue_revenue_last_month_count:
                    rows[0].total_overdue_revenue_last_month_count || 0,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalOverDueRevenueLastMonth error:', error);
            throw error;
        }
    }

    async getTotalRevenueCurrentMonth(
        connection,
        accessCondition,
        accessValues,
        startDate = null,
        endDate = null
    ) {
        try {
            let query = `
            SELECT 
                COALESCE(SUM(b.amount), 0) AS total_revenue, 
                COUNT(b.uid) AS total_revenue_count
            FROM bill_lkea b
            INNER JOIN consumers_lkea c ON c.uid = b.uid
            WHERE b.uid != 0
            AND b.uid NOT IN (
                SELECT uid
                FROM disconnected_consumers_lkea
            )
            ${accessCondition}
        `;

            const params = [...accessValues];

            if (startDate && endDate) {
                query +=
                    " AND CONVERT_TZ(b.created_at, '+00:00', '+05:30') BETWEEN ? AND ?";
                params.push(startDate, endDate);
            } else {
                query += `
                AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
            `;
            }

            const [rows] = await connection.query({
                sql: query,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

            if (!rows[0]) {
                return {
                    total_revenue: 0,
                    total_revenue_count: 0,
                };
            }

            return {
                total_revenue: rows[0].total_revenue,
                total_revenue_count: rows[0].total_revenue_count,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalRevenueCurrentMonth error:', error);
            throw error;
        }
    }

    async getTotalPendingRevenueCurrentMonth(
        connection,
        accessCondition,
        accessValues,
        startDate = null,
        endDate = null
    ) {
        try {
            let query = `
            SELECT 
                COALESCE(SUM(b.amount), 0) AS total_pending_revenue, 
                COUNT(b.uid) AS total_pending_revenue_count
            FROM bill_lkea b
            INNER JOIN consumers_lkea c ON c.uid = b.uid
            WHERE b.status = 'Pending'
                AND b.uid != 0
                ${accessCondition}
        `;
            const params = [...accessValues];

            if (startDate && endDate) {
                query +=
                    " AND CONVERT_TZ(b.created_at, '+00:00', '+05:30') BETWEEN ? AND ?";
                params.push(startDate, endDate);
            } else {
                query += `
                AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
            `;
            }

            const [rows] = await connection.query({
                sql: query,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

            if (!rows[0]) {
                return {
                    total_pending_revenue: 0,
                    total_pending_revenue_count: 0,
                };
            }

            return {
                total_pending_revenue: rows[0].total_pending_revenue,
                total_pending_revenue_count:
                    rows[0].total_pending_revenue_count,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalPendingRevenueCurrentMonth error:', error);
            throw error;
        }
    }

    async getTotalOverDueRevenueCurrentMonth(
        connection,
        accessCondition,
        accessValues,
        startDate = null,
        endDate = null
    ) {
        try {
            let query = `
            SELECT 
                COALESCE(SUM(b.amount), 0) AS total_overdue_revenue, 
                COUNT(b.uid) AS total_overdue_revenue_count
            FROM bill_lkea b
            INNER JOIN consumers_lkea c ON c.uid = b.uid
            WHERE b.status = 'Overdue'
                AND b.uid != 0
                AND b.uid NOT IN (
                    SELECT uid
                    FROM disconnected_consumers_lkea
                )
                ${accessCondition}
        `;
            const params = [...accessValues];

            if (startDate && endDate) {
                query +=
                    " AND CONVERT_TZ(b.created_at, '+00:00', '+05:30') BETWEEN ? AND ?";
                params.push(startDate, endDate);
            } else {
                query += `
                AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
            `;
            }

            const [rows] = await connection.query({
                sql: query,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

            if (!rows[0]) {
                return {
                    total_overdue_revenue: 0,
                    total_overdue_revenue_count: 0,
                };
            }

            return {
                total_overdue_revenue: rows[0].total_overdue_revenue,
                total_overdue_revenue_count:
                    rows[0].total_overdue_revenue_count,
            };
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getTotalOverDueRevenueCurrentMonth error:', error);
            throw error;
        }
    }

    async getTotalPaidRevenueCurrentMonth(
        connection,
        startDate = null,
        endDate = null
    ) {
        try {
            let query = `
            SELECT SUM(amount) AS total_paid_revenue, COUNT(*) AS total_paid_revenue_count
            FROM bill_lkea
            WHERE status = 'Paid'
        `;
            const params = [];

            if (startDate && endDate) {
                query +=
                    " AND CONVERT_TZ(created_at, '+00:00', '+05:30') BETWEEN ? AND ?";
                params.push(startDate, endDate);
            } else {
                query += `
                AND YEAR(CONVERT_TZ(created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND uid != 0
            `;
            }

            // Modified: Use built-in query timeout option instead of Promise.race
            const [rows] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                params
            );
            const bills = rows[0];

            return {
                total_paid_revenue: bills.total_paid_revenue,
                total_paid_revenue_count: bills.total_paid_revenue_count,
            };
        } catch (error) {
            // Modified: Check for the built-in timeout error code (adjust if necessary)
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getTotalPaidRevenueCurrentMonth', error);
            throw error;
        }
    }

    async getActiveStatus(connection, accessCondition, accessValues) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT 
                    SUM(active) AS active_count,
                    SUM(inactive) AS inactive_count
                FROM (
                    SELECT 
                        cc.meter_serial_no,
                        MAX(cc.comm_date) AS last_update,
                        CASE 
                            WHEN MAX(cc.comm_date) >= CURRENT_DATE() 
                                 AND MAX(cc.comm_date) < CURRENT_DATE() + INTERVAL 1 DAY 
                            THEN 1  
                            ELSE 0 
                        END AS active,
                        CASE 
                            WHEN MAX(cc.comm_date) < DATE_SUB(CURRENT_DATE(), INTERVAL 1 DAY)
                            THEN 1 
                            ELSE 0 
                        END AS inactive
                    FROM comm_count cc
                    INNER JOIN consumers_lkea c ON c.meter_serial = cc.meter_serial_no
                    WHERE 1=1 ${accessCondition}
                    GROUP BY cc.meter_serial_no
                ) AS meter_activity
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

            // If no rows found, return default values
            if (!rows[0]) {
                return {
                    active_count: 0,
                    inactive_count: 0,
                };
            }

            return rows[0];
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getActiveStatus error:', error);
            throw error;
        }
    }

    // Consumption as sum (single number output)
    async getConsumptionWithStartAndEndDate(
        connection,
        accessCondition,
        accessValues,
        startDate,
        endDate,
        meter_no = null
    ) {
        try {
            let sql = `
            SELECT COALESCE(SUM(cl.consumption), 0) as consumption
            FROM consumption_lkea cl
            INNER JOIN consumers_lkea c ON c.meter_serial = cl.meter_serial_no
            WHERE cl.consumption_date >= ? 
                AND cl.consumption_date < ? 
                AND LENGTH(cl.meter_serial_no) > 0
                AND TRIM(cl.meter_serial_no) != ''
                ${accessCondition}
        `;

            const params = [startDate, endDate, ...accessValues];

            if (meter_no) {
                sql += ' AND cl.meter_serial_no = ?';
                params.push(meter_no);
            }

            const [rows] = await connection.query({
                sql,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

            return rows[0]?.consumption != null
                ? Number(rows[0].consumption).toFixed(2)
                : '0.00';
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getConsumptionWithStartAndEndDate error:', error);
            throw error;
        }
    }

    async getTotalConsumption(connection, accessCondition, accessValues) {
        try {
            const [rows] = await connection.query({
                sql: `
                SELECT COALESCE(SUM(cl.consumption), 0) as total_consumption 
                FROM consumption_lkea cl
                INNER JOIN consumers_lkea c ON c.meter_serial = cl.meter_serial_no
                WHERE cl.log_timestamp >= DATE_FORMAT(NOW(), '%Y-%m-01')
                  AND cl.log_timestamp < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  ${accessCondition}
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

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
            console.error('getTotalConsumption error:', error);
            throw error;
        }
    }

    async getUserConsumptionCategory(
        connection,
        accessCondition,
        accessValues
    ) {
        try {
            const total_consumption = await this.getTotalConsumption(
                connection,
                accessCondition,
                accessValues
            );
            const total_consumers = await this.getConsumerTypeCount(
                connection,
                accessCondition,
                accessValues
            );

            // Calculate threshold based on authorized data
            const threshold =
                parseInt(total_consumption) /
                parseInt(total_consumers.total_consumers);

            // Get consumption data with location access control
            const [current_month_users] = await connection.query({
                sql: `
                SELECT 
                    cons.meter_serial_no,
                    SUM(cons.consumption) AS total_consumption,
                    CASE 
                        WHEN SUM(cons.consumption) > ? THEN 'heavy'
                        ELSE 'normal'
                    END AS user_type
                FROM consumption cons
                INNER JOIN consumers_lkea c ON c.meter_serial = cons.meter_serial_no
                WHERE cons.log_timestamp >= DATE_FORMAT(NOW(), '%Y-%m-01')
                  AND cons.log_timestamp < DATE_ADD(DATE_FORMAT(NOW(), '%Y-%m-01'), INTERVAL 1 MONTH)
                  ${accessCondition}
                GROUP BY cons.meter_serial_no
                ORDER BY total_consumption DESC
            `,
                values: [threshold, ...accessValues],
                timeout: QUERY_TIMEOUT,
            });

            // If no data found, return default values
            if (!current_month_users || current_month_users.length === 0) {
                return {
                    threshold: '0.00',
                    totalUsers: 0,
                    heavyUsers: 0,
                    standardUsers: 0,
                };
            }

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
            console.error('getUserConsumptionCategory error:', error);
            throw error;
        }
    }

    async getTariffRates(connection) {
        try {
            const [result] = await connection.query({
                sql: `SELECT * FROM tariff_lkea`,
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
            console.log('getTariffRates', error);
            throw error;
        }
    }

    async getBillingData(connection, page = 1, limit = 10, id = null) {
        try {
            // Ensure valid pagination parameters
            page = Math.max(1, parseInt(page));
            limit = Math.max(1, parseInt(limit));
            const offset = (page - 1) * limit;

            // Get total count using built-in timeout option
            const [countRows] = await connection.query({
                sql: 'SELECT COUNT(*) as total FROM consumers_lkea',
                timeout: QUERY_TIMEOUT, // Timeout in milliseconds
            });
            const total = countRows[0]?.total || 0;

            // Build the billing query dynamically
            let billingQuery = `
            SELECT 
                c.consumer_name,
                c.uid,
                c.consumer_id as cpf_no, 
                c.meter_serial as meter_no,
                c.flat_no as flat_no,
                tm.div_nm as venture,
                tm.dist_ss as builder
            FROM consumers_lkea c 
            LEFT JOIN total_masterdata tm ON c.meter_serial = tm.meter_serial_no
        `;
            const billingParams = [];

            // If id is provided, add a WHERE clause
            if (id) {
                billingQuery += ` WHERE c.meter_serial = ? `;
                billingParams.push(id);
            }

            // Append pagination if needed
            billingQuery += ` ${
                page > 0 && limit > 0 ? 'LIMIT ? OFFSET ?' : ''
            } `;
            if (page > 0 && limit > 0) {
                billingParams.push(limit, offset);
            }

            // Execute the billing query using the built-in timeout
            const [billingData] = await connection.query(
                {
                    sql: billingQuery,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                billingParams
            );

            const totalPages =
                page > 0 && limit > 0 ? Math.ceil(total / limit) : 1;

            return {
                data: billingData,
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
            // Check for built-in timeout error code (adjust if necessary)
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getBillingData', error);
            throw error;
        }
    }

    async graphDashboardAnalytics(
        connection,
        accessCondition,
        accessValues,
        period
    ) {
        try {
            if (period == 'daily') {
                const d1 = new Date();
                const sdf = (date) => date.toISOString().split('T')[0];
                const presDate = sdf(new Date(d1.setDate(d1.getDate() - 62)));
                d1.setDate(d1.getDate() + 62);
                const nextDate = sdf(new Date(d1));

                const [datewiseConsumption] = await connection.query({
                    sql: `
                    SELECT 
                        SUBSTR(cl.consumption_date, 1, 10) AS consumption_date,
                        COUNT(*) AS count,
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
                      ${accessCondition}
                    GROUP BY SUBSTR(cl.consumption_date, 1, 10)
                `,
                    values: [presDate, nextDate, ...accessValues],
                    timeout: QUERY_TIMEOUT,
                });

                return datewiseConsumption;
            }

            if (period == 'monthly') {
                const d1 = new Date();
                const sdf = (date) => date.toISOString().split('T')[0];
                const presDate = sdf(new Date(d1.setMonth(d1.getMonth() - 13)));
                d1.setMonth(d1.getMonth() + 14);
                const nextDate = sdf(new Date(d1));

                const [datewiseConsumption] = await connection.query({
                    sql: `
                    SELECT 
                        SUBSTR(cl.consumption_date, 1, 7) AS consumption_date,
                        COUNT(*) AS count,
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
                      ${accessCondition}
                    GROUP BY SUBSTR(cl.consumption_date, 1, 7)
                `,
                    values: [presDate, nextDate, ...accessValues],
                    timeout: QUERY_TIMEOUT,
                });

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
            console.error('graphDashboardAnalytics error:', error);
            throw error;
        }
    }

    async newConnections(
        connection,
        accessCondition,
        accessValues,
        startDate = null,
        endDate = null
    ) {
        try {
            const sql = `
            SELECT COUNT(*) AS count
            FROM consumer cl
            INNER JOIN consumers_lkea c ON cl.consumer_name = c.consumer_name
            WHERE 1=1 
            ${
                startDate && endDate
                    ? 'AND cl.created_date BETWEEN ? AND ?'
                    : 'AND MONTH(cl.created_date) = MONTH(CURRENT_DATE()) AND YEAR(cl.created_date) = YEAR(CURRENT_DATE())'
            }
            ${accessCondition}
        `;

            const params = [
                ...(startDate && endDate ? [startDate, endDate] : []),
                ...accessValues,
            ];

            const [rows] = await connection.query({
                sql,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

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
            console.error('newConnections error:', error);
            throw error;
        }
    }

    async newConnectionsLastMonth(connection, accessCondition, accessValues) {
        try {
            const sql = `
            SELECT COUNT(*) AS count
            FROM consumer cl
            INNER JOIN consumers_lkea c ON cl.consumer_no = c.consumer_id
            WHERE MONTH(cl.created_date) = MONTH(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
              AND YEAR(cl.created_date) = YEAR(DATE_SUB(CURRENT_DATE(), INTERVAL 1 MONTH))
              ${accessCondition}
        `;

            const [rows] = await connection.query({
                sql,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

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
            console.error('newConnectionsLastMonth error:', error);
            throw error;
        }
    }

    async getBillingAndCollectionGraphData(
        connection,
        accessCondition,
        accessValues
    ) {
        try {
            const [bills] = await connection.query({
                sql: `
                SELECT 
                    DATE_FORMAT(CONVERT_TZ(b.created_at, '+00:00', '+05:30'), '%Y-%m') AS bill_month,
                    COUNT(*) AS total_bill_count,
                    SUM(CASE WHEN b.status = 'pending' THEN 1 ELSE 0 END) AS pending_bill_count,
                    SUM(CASE WHEN b.status = 'paid' THEN 1 ELSE 0 END) AS paid_bill_count,
                    SUM(CASE WHEN b.status = 'overdue' THEN 1 ELSE 0 END) AS overdue_bill_count
                FROM bill_lkea b
                INNER JOIN consumers_lkea c ON c.uid = b.uid
                WHERE CONVERT_TZ(b.created_at, '+00:00', '+05:30') >= 
                    DATE_FORMAT(DATE_SUB(CONVERT_TZ(NOW(), '+00:00', '+05:30'), INTERVAL 13 MONTH), '%Y-%m-01')
                    AND b.uid != 0
                    ${accessCondition}
                    AND b.uid NOT IN (
                        SELECT uid
                        FROM disconnected_consumers_lkea
                    )
                GROUP BY bill_month
                ORDER BY bill_month
            `,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

            return bills;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.error('getBillingAndCollectionGraphData error:', error);
            throw error;
        }
    }

    async getOverdueConsumerTable(
        connection,
        accessCondition,
        accessValues,
        page = 1,
        limit = 5
    ) {
        try {
            page = Math.max(0, parseInt(page));
            limit = Math.max(0, parseInt(limit));
            const offset = (page - 1) * limit;

            const [consumersResult, countResult] = await Promise.all([
                connection.query({
                    sql: `
                    SELECT 
                        c.consumer_id, 
                        c.consumer_name, 
                        c.block_name, 
                        c.flat_no, 
                        b.due_amount, 
                        c.uid
                    FROM consumers_lkea c
                    JOIN bill_lkea b ON c.uid = b.uid
                    WHERE b.status = 'Overdue' 
                        AND b.due_amount > 0 
                        AND b.uid != 0
                        ${accessCondition}
                        AND b.uid NOT IN (
                            SELECT uid
                            FROM disconnected_consumers_lkea
                        )
                    ORDER BY b.due_amount DESC
                    LIMIT ? OFFSET ?
                `,
                    values: [...accessValues, limit, offset],
                    timeout: QUERY_TIMEOUT,
                }),
                connection.query({
                    sql: `
                    SELECT COUNT(*) AS count
                    FROM consumers_lkea c
                    JOIN bill_lkea b ON c.uid = b.uid
                    WHERE b.status = 'Overdue' 
                        AND b.due_amount > 0 
                        AND b.uid != 0
                        AND b.uid NOT IN (
                            SELECT uid
                            FROM disconnected_consumers_lkea
                        )
                        ${accessCondition}
                `,
                    values: accessValues,
                    timeout: QUERY_TIMEOUT,
                }),
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
            console.error('getOverdueConsumerTable error:', error);
            throw error;
        }
    }

    async getConsumerBillingTable(
        connection,
        accessCondition,
        accessValues,
        page = 1,
        limit = 5,
        filters = {}
    ) {
        try {
            page = Math.max(0, parseInt(page));
            limit = Math.max(0, parseInt(limit));
            const offset = (page - 1) * limit;

            let sqlQuery = `
            SELECT 
                b.invoice_id,
                b.uid,
                c.consumer_name,
                c.block_name,
                c.flat_no,
                c.meter_serial,
                b.status,
                b.consumption,
                b.amount,
                b.bill_date,
                b.due_date,
                b.due_amount
            FROM consumers_lkea c
            JOIN bill_lkea b ON c.uid = b.uid
            WHERE b.uid != 0
            ${
                filters.bill && filters.bill.length > 0
                    ? ''
                    : `
                AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
            `
            }
            ${accessCondition}
        `;

            let countQuery = `
            SELECT COUNT(*) AS count
            FROM consumers_lkea c
            JOIN bill_lkea b ON c.uid = b.uid
            WHERE b.uid != 0
            ${
                filters.bill && filters.bill.length > 0
                    ? ''
                    : `
                AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
            `
            }
            ${accessCondition}
        `;

            // Combine filter values and access values
            let queryParams = [...accessValues];
            let countParams = [...accessValues];

            if (filters.bill) {
                if (filters.bill === 'thisMonth') {
                    sqlQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                `;
                    countQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                `;
                } else if (filters.bill === 'lastMonth') {
                    sqlQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                `;
                    countQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                    AND MONTH(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = MONTH(CONVERT_TZ(DATE_SUB(NOW(), INTERVAL 1 MONTH), '+00:00', '+05:30'))
                `;
                } else if (filters.bill === 'year') {
                    sqlQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                `;
                    countQuery += `
                    AND YEAR(CONVERT_TZ(b.created_at, '+00:00', '+05:30')) = YEAR(CONVERT_TZ(NOW(), '+00:00', '+05:30'))
                `;
                }
            }

            if (filters.payment) {
                sqlQuery += ' AND b.status = ?';
                countQuery += ' AND b.status = ?';
                queryParams.push(filters.payment);
                countParams.push(filters.payment);
            }

            if (filters.consumer) {
                sqlQuery += ' AND c.consumer_type = ?';
                countQuery += ' AND c.consumer_type = ?';
                queryParams.push(filters.consumer);
                countParams.push(filters.consumer);
            }

            // If pagination is used, add LIMIT and OFFSET
            if (page > 0 && limit > 0) {
                sqlQuery += ' LIMIT ? OFFSET ?';
                queryParams.push(limit, offset);
            }

            // Execute both queries in parallel using built-in timeouts
            const [consumersResult, countResult] = await Promise.all([
                connection.query(
                    { sql: sqlQuery, timeout: QUERY_TIMEOUT },
                    queryParams
                ),
                connection.query(
                    { sql: countQuery, timeout: QUERY_TIMEOUT },
                    countParams
                ),
            ]);

            const consumers = consumersResult[0];
            const total = countResult[0][0].count;
            const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

            return {
                consumers,
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
            // Check for the built-in timeout error code (adjust if necessary)
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getConsumerBillingTable', error);
            throw error;
        }
    }

    async search(
        connection,
        accessCondition = '',
        accessValues = [],
        searchTerm
    ) {
        try {
            const searchParams = [
                `%${searchTerm}%`,
                `%${searchTerm}%`,
                `%${searchTerm}%`,
                `%${searchTerm}%`,
                ...accessValues,
            ];

            const [results] = await connection.query(
                {
                    sql: `
                SELECT c.sl_no, c.consumer_name, c.consumer_id, c.uid
                FROM consumers_lkea c
                WHERE (c.consumer_id LIKE ? 
                   OR c.consumer_name LIKE ? 
                   OR c.meter_serial LIKE ? 
                   OR c.uid LIKE ?)
                ${accessCondition}
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
            console.log('getHierarchy', error);
            throw error;
        }
    }

    async geConsumerSpecificConsumptionGraphData(connection, meter_no, period) {
        try {
            if (period === 'daily') {
                const d1 = new Date();
                const sdf = (date) => date.toISOString().split('T')[0];
                const presDate = sdf(new Date(d1.setDate(d1.getDate() - 62)));
                d1.setDate(d1.getDate() + 62);
                const nextDate = sdf(new Date(d1));

                const [results] = await connection.query(
                    {
                        sql: `
                        SELECT SUBSTR(consumption_date, 1, 10) AS consumption_date,
                               COUNT(*) AS count,
                               SUM(consumption) AS sum
                        FROM consumption_lkea
                        WHERE consumption_date >= ?
                          AND consumption_date < ?
                          AND meter_serial_no = ?
                        GROUP BY SUBSTR(consumption_date, 1, 10)
                    `,
                        timeout: QUERY_TIMEOUT,
                    },
                    [presDate, nextDate, meter_no]
                );

                return results;
            }

            if (period === 'monthly') {
                const now = new Date();
                const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
                const startMonth = new Date(
                    ist.getFullYear(),
                    ist.getMonth() - 12,
                    1
                );
                const presDate = new Date(
                    startMonth.getFullYear(),
                    startMonth.getMonth(),
                    1
                );
                const nextDate = ist;

                const [results] = await connection.query(
                    {
                        sql: `
                        SELECT SUBSTR(consumption_date, 1, 7) AS consumption_date,
                               COUNT(*) AS count,
                               SUM(consumption) AS sum
                        FROM consumption_lkea
                        WHERE consumption_date >= ?
                          AND consumption_date <= ?
                          AND meter_serial_no = ?
                        GROUP BY SUBSTR(consumption_date, 1, 7)
                    `,
                        timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                    },
                    [presDate, nextDate, meter_no]
                );

                return sortAndFillData(results);
            }
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('geConsumerSpecificConsumptionGraphData', error);
            throw error;
        }
    }

    async getConsumptionGraphDataWithStartAndEndDates(
        connection,
        accessCondition,
        accessValues,
        startDate,
        endDate,
        meter_no
    ) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                        SELECT SUBSTR(cl.consumption_date, 1, 10) AS consumption_date,
                               COUNT(*) AS count,
                               SUM(cl.consumption) AS sum
                        FROM consumption_lkea cl
                        INNER JOIN consumers_lkea c ON c.meter_serial = cl.meter_serial_no
                        WHERE cl.consumption_date >= ?
                          AND cl.consumption_date < ?
                          AND cl.meter_serial_no = ?
                          ${accessCondition}
                        GROUP BY SUBSTR(consumption_date, 1, 10)
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [startDate, endDate, meter_no, ...accessValues]
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
            console.log('geConsumerSpecificConsumptionGraphData', error);
            throw error;
        }
    }

    async getInvoicesByConsumerUID(
        connection,
        page = 1,
        limit = 5,
        consumer_uid
    ) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.min(100, Math.max(1, parseInt(limit)));
            const offset = (page - 1) * limit;

            const [countRows] = await connection.query(
                {
                    sql: `SELECT COUNT(*) as total FROM bill_lkea WHERE uid = ?`,
                    timeout: QUERY_TIMEOUT,
                },
                [consumer_uid]
            );
            const total = countRows[0].total;

            const [invoicesRows] = await connection.query(
                {
                    sql: `SELECT * FROM bill_lkea WHERE uid = ? LIMIT ? OFFSET ?`,
                    timeout: QUERY_TIMEOUT,
                },
                [consumer_uid, limit, offset]
            );

            const totalPages = Math.ceil(total / limit);

            return {
                invoices: invoicesRows,
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
            console.log('getInvoicesByConsumerUID', error);
            throw error;
        }
    }

    async getInvoiceByInvoiceNo(connection, invoice_id) {
        try {
            const [rows] = await connection.query(
                {
                    sql: `SELECT * FROM bill_lkea WHERE invoice_id = ?`,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [invoice_id]
            );
            // Return the first result (or null if none found)
            return rows[0] || null;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getInvoiceByInvoiceNo', error);
            throw error;
        }
    }

    async updateAllPendingBills(connection, action) {
        try {
            let query = 'UPDATE bill_lkea SET ';
            if (action === 'paid') {
                query += ` status = 'Paid',
                        due_amount = 0,
                        paid_amount = amount,`;
            } else if (action === 'overdue') {
                query += ` status = 'Overdue',
                        due_amount = CASE 
                            WHEN paid_amount = 0 THEN amount 
                            ELSE amount - paid_amount 
                        END,`;
            }
            query += ` updated_at = NOW() WHERE status = 'Pending'`;

            await connection.query({
                sql: query,
                timeout: QUERY_TIMEOUT, // Timeout in milliseconds
            });
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateAllPendingBills', error);
            throw error;
        }
    }

    async getConsumersByType(connection, type) {
        type = type === 'government' ? 'SEZ' : type;
        try {
            const [results] = await connection.query(
                {
                    sql: `
                SELECT uid FROM consumers_lkea WHERE consumer_type = ?
            `,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [type]
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
            console.log('getConsumersByType', error);
            throw error;
        }
    }

    async updateAllBillStatusUsingConsumerType(connection, ids, action) {
        try {
            if (!ids || ids.length === 0) {
                console.log('No consumer IDs provided; skipping update.');
                return;
            }

            let query = 'UPDATE bill_lkea SET ';
            if (action === 'paid') {
                query += `status = 'Paid',
              due_amount = 0,
              paid_amount = amount,`;
            } else if (action === 'overdue') {
                query += `status = 'Overdue',
              due_amount = amount,
              paid_amount = 0,`;
            } else if (action === 'pending') {
                query += `status = 'Pending',
              due_amount = 0,
              paid_amount = 0,`;
            }
            query += ` updated_at = NOW() WHERE uid IN (?)
                        AND MONTH(created_at) = MONTH(NOW()) 
                        AND YEAR(created_at) = YEAR(NOW())`;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [ids]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateAllBillStatusUsingConsumerType', error);
            throw error;
        }
    }

    async updateAllBillStatusUsingDateRange(
        connection,
        startDate,
        endDate,
        action
    ) {
        try {
            if (!startDate || !endDate) {
                throw new Error('Start and end dates are required');
            }

            let query = 'UPDATE bill_lkea SET ';
            if (action === 'paid') {
                query += `status = 'Paid',
              due_amount = 0,
              paid_amount = amount,`;
            } else if (action === 'overdue') {
                query += `status = 'Overdue',
              due_amount = amount,
              paid_amount = 0,`;
            } else if (action === 'pending') {
                query += `status = 'Pending',
              due_amount = 0,
              paid_amount = 0,`;
            }
            query += ` updated_at = NOW() WHERE bill_date BETWEEN ? AND ?`;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [startDate, endDate]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateAllBillStatusUsingDateRange', error);
            throw error;
        }
    }

    async updateAllBillStatusUsingAmountRange(
        connection,
        startAmount,
        endAmount,
        action
    ) {
        try {
            let query = 'UPDATE bill_lkea SET ';
            if (action === 'paid') {
                query += `status = 'Paid',
              due_amount = 0,
              paid_amount = amount,`;
            } else if (action === 'overdue') {
                query += `status = 'Overdue',
              due_amount = amount,
              paid_amount = 0,`;
            } else if (action === 'pending') {
                query += `status = 'Pending',
              due_amount = 0,
              paid_amount = 0,`;
            }
            query += ` updated_at = NOW() WHERE amount BETWEEN ? AND ?
                        AND MONTH(created_at) = MONTH(NOW()) 
                        AND YEAR(created_at) = YEAR(NOW())`;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [startAmount, endAmount]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateAllBillStatusUsingAmountRange', error);
            throw error;
        }
    }

    async updateBillStatusOfSingleUser(connection, invoice_no, action) {
        try {
            if (!invoice_no) {
                throw new Error('Invoice Number is required');
            }

            let query = 'UPDATE bill_lkea SET ';

            if (action === 'paid') {
                query += `status = 'Paid',
              due_amount = 0,
              paid_amount = amount,`;
            } else if (action === 'overdue') {
                query += `status = 'Overdue',
              due_amount = amount,
              paid_amount = 0,`;
            } else if (action === 'pending') {
                query += `status = 'Pending',
              due_amount = 0,
              paid_amount = 0,`;
            }

            query += ` updated_at = NOW() WHERE invoice_id = ?`;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [invoice_no]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateBillStatusOfSingleUser', error);
            throw error;
        }
    }

    async getTicketAnalytics(connection, accessCondition, accessValues) {
        try {
            const [results] = await connection.query({
                sql: `
            SELECT 
                COUNT(*) AS totalTickets,
                SUM(CASE WHEN t.status = 'Open' THEN 1 ELSE 0 END) AS openTickets,
                SUM(CASE WHEN t.status = 'In Progress' THEN 1 ELSE 0 END) AS inProgressTickets,
                SUM(CASE WHEN t.status = 'Resolved' THEN 1 ELSE 0 END) AS resolvedTickets,
                SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) AS closedTickets,
                SUM(CASE 
                    WHEN DATE_FORMAT(t.created_at, '%Y-%m') = DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 1 MONTH), '%Y-%m')
                    THEN 1 ELSE 0 END) AS lastMonthTotalTickets,
                AVG(TIMESTAMPDIFF(MINUTE, t.created_at, t.updated_at)) AS averageResponseTime,
                NULL AS customerSatisfaction,
                (SUM(CASE WHEN t.status = 'Resolved' THEN 1 ELSE 0 END) / COUNT(*) * 100.0) AS resolutionRateOfResolvedTickets,
                (SUM(CASE WHEN t.status = 'Closed' THEN 1 ELSE 0 END) / COUNT(*) * 100.0) AS ClosureRateOfClosedtickets
            FROM tickets_lkea t
            JOIN consumers_lkea c ON t.uid = c.uid
            WHERE 1=1
            ${accessCondition}
            `,
                timeout: QUERY_TIMEOUT,
                values: accessValues,
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
            console.log('getTicketAnalytics', error);
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
                WHERE meter_serial_no = ?
            `,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [meter_no]
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
            console.log('getConsumerActiveStatus', error);
            throw error;
        }
    }

    async getNewUID(connection, year, block) {
        try {
            const [results] = await connection.query(
                {
                    sql: `
                SELECT MAX(CAST(RIGHT(uid, 3) AS UNSIGNED)) AS maxSeq
                FROM ntpl.consumers_lkea
                WHERE uid LIKE CONCAT(?, 'UID', ?, '%')
            `,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [year, block]
            );

            const maxSeq = results[0].maxSeq || 0;
            const newSeq = maxSeq + 1;
            const newUID = `${year}UID${block}${String(newSeq).padStart(
                3,
                '0'
            )}`;
            return newUID;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getNewUID', error);
            throw error;
        }
    }

    async updateConsumer(connection, data) {
        try {
            if (!data.consumerId) {
                throw new Error('Consumer ID is required');
            }

            // Note: Removed the extra comma after email assignment.
            const query = `
            UPDATE consumer
            SET 
                consumer_name = ?,
                permanent_address = ?,
                billing_address = ?,
                mobile1 = ?,
                mobile2 = ?,
                email = ?
            WHERE consumer_id = ?
        `;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [
                    data.fullName,
                    data.permanentAddress,
                    data.billingAddress,
                    data.primaryMobile,
                    data.secondaryMobile,
                    data.email,
                    data.consumerId,
                ]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateConsumer', error);
            throw error;
        }
    }

    async updateConsumerLkea(connection, data) {
        try {
            if (!data.consumerId) {
                throw new Error('Consumer ID is required');
            }

            const query = `
            UPDATE consumers_lkea
            SET
                block_name = ?,
                flat_no = ?,
                meter_serial = ?,
                consumer_id = ?,
                consumer_name = ?,
                uid = ?
            WHERE consumer_id = ?
        `;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT, // Timeout in milliseconds
                },
                [
                    data.block_name,
                    data.flat_no,
                    data.meter_serial,
                    data.consumerId,
                    data.consumer_name,
                    data.uid,
                    data.consumerId,
                ]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('updateConsumerLkea', error);
            throw error;
        }
    }

    async insertNewConsumerUID(connection, data) {
        try {
            const query = `
            INSERT INTO consumers_uid (sl_no, uid, meter_serial_no, flat_no, consumer_name)
            VALUES (?, ?, ?, ?, ?)
        `;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [
                    1000,
                    data.uid,
                    data.meter_serial_no,
                    data.flat_no,
                    data.consumer_name,
                ]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('insertNewConsumerUID', error);
            throw error;
        }
    }

    async insertConsumer(connection, data) {
        try {
            if (!data.consumerId) {
                throw new Error('Consumer ID is required');
            }

            const query = `
            INSERT INTO consumer (
                consumer_id,
                consumer_name
            )
            VALUES (?, ?)
        `;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [data.consumerId, data.fullName]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('insertConsumer', error);
            throw error;
        }
    }

    async insertConsumerLkea(connection, data) {
        try {
            if (!data.consumerId) {
                throw new Error('Consumer ID is required');
            }

            const query = `
            INSERT INTO consumers_lkea (
                block_name,
                flat_no,
                meter_serial,
                consumer_id,
                consumer_name,
                uid,
                consumer_type,
                meter_type,
                hierarchy_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

            await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [
                    data.block_name,
                    data.flat_no,
                    data.meter_serial,
                    data.consumerId,
                    data.consumer_name,
                    data.uid,
                    data.consumer_type,
                    data.meter_type,
                    data.hierarchy_id,
                ]
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('insertConsumerLkea', error);
            throw error;
        }
    }

    async reportGraphAnalytics(connection, accessCondition, accessValues) {
        try {
            const query = `
            SELECT 
                COALESCE(c.consumer_type, 'Unspecified') as name, 
                COUNT(c.uid) as value
            FROM consumers_lkea c
            WHERE 1=1 
                ${accessCondition}
            GROUP BY c.consumer_type
            ORDER BY value DESC, name ASC
        `;

            const [results] = await connection.query({
                sql: query,
                values: accessValues,
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
            console.error('reportGraphAnalytics error:', error);
            throw error;
        }
    }

    async getTotalBillAmountForAllMonths(
        connection,
        accessCondition,
        accessValues
    ) {
        try {
            const query = `
            SELECT 
                DATE_FORMAT(b.bill_date, '%Y-%m') as month,
                SUM(b.amount) as total_amount_generated,
                SUM(b.paid_amount) as total_paid_amount,
                SUM(b.due_amount) as total_overdue_amount
            FROM bill_lkea b
            JOIN consumers_lkea c ON b.uid = c.uid
            WHERE 1=1
            ${accessCondition}
            AND b.uid NOT IN (
                    SELECT uid
                    FROM disconnected_consumers_lkea
            )
            GROUP BY DATE_FORMAT(b.bill_date, '%Y-%m')
            ORDER BY month
        `;

            const queryParams = {
                sql: query,
                timeout: QUERY_TIMEOUT,
                values: accessValues,
            };

            const [results] = await connection.query(queryParams);

            return results;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getTotalBillAmountForAllMonths', error);
            throw error;
        }
    }

    async getActiveMeters(connection, accessCondition, accessValues) {
        try {
            const query = `
            SELECT 
                cc.meter_serial_no
            FROM ntpl.comm_count cc
            INNER JOIN consumers_lkea c ON c.meter_serial = cc.meter_serial_no
            WHERE 1=1 
                ${accessCondition}
            GROUP BY cc.meter_serial_no
            HAVING MAX(cc.comm_date) >= CURRENT_DATE() 
                AND MAX(cc.comm_date) < CURRENT_DATE() + INTERVAL 1 DAY
        `;

            const [results] = await connection.query({
                sql: query,
                values: accessValues,
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
            console.error('getActiveMeters error:', error);
            throw error;
        }
    }

    async getInActiveMeters(connection, accessCondition, accessValues) {
        try {
            const activeMeters = await this.getActiveMeters(
                connection,
                accessCondition,
                accessValues
            );

            const transformMeters = (metersArray) => {
                return metersArray.map((meter) => meter.meter_serial_no);
            };
            const meters = transformMeters(activeMeters);

            if (!meters.length) {
                const query = `
                SELECT 
                    meter_serial
                FROM consumers_lkea c
                WHERE 1=1 
                    ${accessCondition}
            `;

                const [results] = await connection.query({
                    sql: query,
                    values: accessValues,
                    timeout: QUERY_TIMEOUT,
                });

                return results;
            }

            const query = `
            SELECT 
                meter_serial
            FROM consumers_lkea c
            WHERE meter_serial NOT IN (?)
                ${accessCondition}
        `;

            const [results] = await connection.query({
                sql: query,
                values: [meters, ...accessValues],
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
            console.error('getInActiveMeters error:', error);
            throw error;
        }
    }

    async getConsumerLastBillDetails(connection) {
        try {
            const query = `
                SELECT * from bill_lkea ORDER BY created_at DESC LIMIT 1
            `;

            const [[results]] = await connection.query({
                sql: query,
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
            console.log('getConsumerLastBillDetails', error);
            throw error;
        }
    }

    async getDisconnectedMeters(
        connection,
        accessCondition,
        accessValues,
        page = 1,
        limit = 5
    ) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.max(1, parseInt(limit));
            const offset = (page - 1) * limit;

            const [metersResult, countResult] = await Promise.all([
                connection.query({
                    sql: `
                    SELECT 
                        t2.uid,
                        c.consumer_name,
                        c.block_name,
                        c.flat_no,
                        t2.overdue_amount as amount
                    FROM consumers_lkea c
                    INNER JOIN disconnected_consumers_lkea t2 ON c.uid = t2.uid
                    WHERE t2.overdue_amount > 0
                        ${accessCondition}
                    ORDER BY t2.overdue_amount DESC
                    LIMIT ? OFFSET ?
                `,
                    values: [...accessValues, limit, offset],
                    timeout: QUERY_TIMEOUT,
                }),
                connection.query({
                    sql: `
                    SELECT COUNT(*) AS count
                    FROM consumers_lkea c
                    INNER JOIN disconnected_consumers_lkea t2 ON c.uid = t2.uid
                    WHERE t2.overdue_amount > 0
                        ${accessCondition}
                `,
                    values: accessValues,
                    timeout: QUERY_TIMEOUT,
                }),
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
            console.error('getDisconnectedMeters error:', error);
            throw error;
        }
    }

    async getLastTwelveMonthsTrends(connection, accessCondition, accessValues) {
        try {
            const query = `
            SELECT 
                DATE_FORMAT(months.month, '%Y-%m') as month,
                COUNT(CASE WHEN t.status = 'Open' THEN 1 END) as open_count,
                COUNT(CASE WHEN t.status = 'In Progress' THEN 1 END) as in_progress_count,
                COUNT(CASE WHEN t.status = 'Resolved' THEN 1 END) as resolved_count,
                COUNT(CASE WHEN t.status = 'Closed' THEN 1 END) as closed_count
            FROM (
                SELECT 
                    LAST_DAY(DATE_SUB(CURDATE(), INTERVAL months.number MONTH)) as month
                FROM (
                    SELECT 0 number UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 
                    UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 
                    UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11
                ) as months
            ) as months
            LEFT JOIN tickets_lkea t ON
            DATE_FORMAT(t.created_at, '%Y-%m') = DATE_FORMAT(months.month, '%Y-%m')
            JOIN consumers_lkea c ON t.uid = c.uid
            ${accessCondition}
            GROUP BY months.month
            ORDER BY months.month;
        `;

            const [results] = await connection.query({
                sql: query,
                timeout: QUERY_TIMEOUT,
                values: accessValues,
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
            console.log('getLastTwelveMonthsTrends', error);
            throw error;
        }
    }

    async getTicketsWithConsumerDetails(
        connection,
        accessCondition = '',
        accessValues = [],
        page = 1,
        limit = 5
    ) {
        try {
            page = Math.max(1, parseInt(page));
            limit = Math.max(1, parseInt(limit));
            const offset = (page - 1) * limit;

            const countQuery = `
            SELECT COUNT(*) as count
            FROM tickets_lkea t
            LEFT JOIN consumers_lkea c ON c.uid = t.uid
            LEFT JOIN consumer m ON m.consumer_name = c.consumer_name
            WHERE t.status != 'Deleted'
            ${accessCondition}
        `;

            const dataQuery = `
            SELECT 
                t.ticket_id,
                t.title,
                t.description,
                t.category,
                t.status,
                t.priority,
                c.consumer_name,
                c.consumer_id,
                m.mobile1,
                m.email
            FROM tickets_lkea t
            LEFT JOIN consumers_lkea c ON c.uid = t.uid
            LEFT JOIN consumer m ON m.consumer_name = c.consumer_name
            WHERE t.status != 'Deleted'
            ${accessCondition}
            ORDER BY t.created_at DESC
            LIMIT ? OFFSET ?
        `;

            // Combine access values with pagination values
            const dataQueryParams = [...accessValues, limit, offset];
            const countQueryParams = [...accessValues];

            const [ticketsResult, countResult] = await Promise.all([
                connection.query(dataQuery, dataQueryParams),
                connection.query(countQuery, countQueryParams),
            ]);

            const tickets = ticketsResult[0];
            const total = countResult[0][0].count;
            const totalPages = Math.ceil(total / limit);

            return {
                data: tickets,
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
            console.log('getTicketsWithConsumerDetails', error);
            throw error;
        }
    }

    async insertNewHierarchy(connection, value) {
        try {
            const query = `
            INSERT INTO location_hierarchy_lkea 
            (location_id, location_name, parent_location_id, location_type, active_flag)
            VALUES
            ${value
                .map(
                    (item) => `(
                ${connection.escape(item.location_id)},
                ${connection.escape(item.location_name)},
                ${
                    item.parent_location_id === null
                        ? 'NULL'
                        : connection.escape(item.parent_location_id)
                },
                ${connection.escape(item.location_type)},
                ${connection.escape(item.active_flag)}
            )`
                )
                .join(',\n')}
        `;

            await connection.query({
                sql: query,
                timeout: QUERY_TIMEOUT,
            });
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('insertNewHierarchy', error);
            throw error;
        }
    }

    async sendBulkRemainders(connection, filterOptions) {
        try {
            const params = [];
            let conditions = [];
            let query = '';

            // Handle individual invoice reminder
            if (
                filterOptions.type === 'individual' &&
                filterOptions.invoiceNumber
            ) {
                query = `
                    SELECT 
                        c.consumer_no,
                        COALESCE(c.consumer_name, cl.consumer_name) as consumer_name,
                        c.email,
                        c.mobile1,
                        b.invoice_id as bill_no,
                        b.billing_period_start,
                        b.billing_period_end,
                        b.amount as present_bill_amount,
                        b.due_amount as balance,
                        b.due_date
                    FROM bill_lkea b
                    INNER JOIN consumers_lkea cl ON b.uid = cl.uid
                    LEFT JOIN consumer c ON cl.consumer_id = c.consumer_id
                    WHERE b.invoice_id = ?
                    LIMIT 1
                `;
                params.push(filterOptions.invoiceNumber);
            }
            // Handle bulk reminders
            else {
                // Base condition
                conditions.push('cl.consumer_type IS NOT NULL');

                if (
                    filterOptions.bulkSelection === 'consumerType' &&
                    filterOptions.consumerType
                ) {
                    conditions.push('cl.consumer_type = ?');
                    params.push(filterOptions.consumerType);

                    query = `
                        SELECT 
                            c.consumer_no,
                            COALESCE(c.consumer_name, unique_consumers.lkea_consumer_name) as consumer_name,
                            c.email,
                            c.mobile1,
                            latest_bills.invoice_id as bill_no,
                            latest_bills.billing_period_start,
                            latest_bills.billing_period_end,
                            latest_bills.amount as present_bill_amount,
                            latest_bills.due_amount as balance,
                            latest_bills.due_date
                        FROM (
                            SELECT DISTINCT
                                cl.uid,
                                cl.consumer_id,
                                cl.consumer_name as lkea_consumer_name
                            FROM consumers_lkea cl
                            WHERE ${conditions.join(' AND ')}
                        ) as unique_consumers
                        LEFT JOIN (
                            SELECT b.*
                            FROM bill_lkea b
                            INNER JOIN (
                                SELECT uid, MAX(bill_date) as latest_bill_date
                                FROM bill_lkea
                                WHERE status IN ('Pending', 'Overdue')
                                GROUP BY uid
                            ) as latest_dates ON b.uid = latest_dates.uid 
                            AND b.bill_date = latest_dates.latest_bill_date
                        ) as latest_bills ON unique_consumers.uid = latest_bills.uid
                        LEFT JOIN consumer c ON unique_consumers.consumer_id = c.consumer_id
                        ORDER BY latest_bills.due_date ASC
                    `;
                } else {
                    if (filterOptions.bulkSelection === 'allPending') {
                        conditions.push('b.status = "Pending"');
                    } else if (filterOptions.bulkSelection === 'overdue') {
                        conditions.push('b.status = "Overdue"');
                    }

                    query = `
                        SELECT 
                            c.consumer_no,
                            COALESCE(c.consumer_name, cl.consumer_name) as consumer_name,
                            c.email,
                            c.mobile1,
                            b.invoice_id as bill_no,
                            b.billing_period_start,
                            b.billing_period_end,
                            b.amount as present_bill_amount,
                            b.due_amount as balance,
                            b.due_date
                        FROM bill_lkea b
                        INNER JOIN consumers_lkea cl ON b.uid = cl.uid
                        LEFT JOIN consumer c ON cl.consumer_id = c.consumer_id
                        WHERE ${conditions.join(' AND ')}
                        ORDER BY b.due_date ASC
                    `;
                }
            }

            const [bills] = await connection.query({
                sql: query,
                values: params,
                timeout: QUERY_TIMEOUT,
            });

            // For individual reminders, verify we found the invoice
            if (filterOptions.type === 'individual' && bills.length === 0) {
                throw new Error(
                    `Invoice ${filterOptions.invoiceNumber} not found`
                );
            }

            return bills.map((bill) => ({
                ...bill,
                billing_period_start: formatDate(bill.billing_period_start),
                billing_period_end: formatDate(bill.billing_period_end),
                due_date: formatDate(bill.due_date),
                previous_balance:
                    (bill.balance || 0) - (bill.present_bill_amount || 0),
                // Only include emailData if notificationType is email
                emailData:
                    filterOptions.notificationType === 'email' && bill.email
                        ? {
                              to: bill.email,
                              subject: `Electricity Bill Reminder - ${bill.bill_no}`,
                              template: 'electricity-bill-reminder',
                              data: {
                                  consumerName: bill.consumer_name,
                                  consumerNo: bill.consumer_no,
                                  billNo: bill.bill_no,
                                  billFromDate: formatDate(
                                      bill.billing_period_start
                                  ),
                                  billToDate: formatDate(
                                      bill.billing_period_end
                                  ),
                                  presentBillAmount:
                                      bill.present_bill_amount || 0,
                                  previousBalance:
                                      (bill.balance || 0) -
                                      (bill.present_bill_amount || 0),
                                  balance: bill.balance || 0,
                                  dueDate: formatDate(bill.due_date),
                              },
                          }
                        : null,
                smsData:
                    filterOptions.notificationType === 'sms' && bill.mobile1
                        ? {
                              to: bill.mobile1,
                              template: 'electricity-bill-reminder-sms',
                              data: {
                                  consumerName: bill.consumer_name,
                                  billNo: bill.bill_no,
                                  dueAmount: bill.balance || 0,
                                  dueDate: formatDate(bill.due_date),
                              },
                          }
                        : null,
            }));
        } catch (error) {
            console.error('Error in sendBulkRemainders:', error);
            throw error;
        }
    }

    async getConsumerOverdueByUID(connection, uid) {
        try {
            const query = `SELECT SUM(due_amount) as amount FROM bill_lkea WHERE uid = ?`;

            const [[{ amount }]] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [uid]
            );

            return amount;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getConsumerOverdueByUID', error);
            throw error;
        }
    }

    async disconnectConsumer(connection, data) {
        try {
            const query = `
            INSERT INTO disconnected_consumers_lkea (
                uid,
                meter_serial_no,
                consumer_id,
                overdue_amount,
                status,
                remarks
            ) VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                NULL
            )
        `;

            const [results] = await connection.query(
                {
                    sql: query,
                    timeout: QUERY_TIMEOUT,
                },
                [
                    data.uid,
                    data.meter_serial,
                    data.consumer_id,
                    data.due_amount,
                    data.status,
                ]
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
            console.log('disconnectConsumer', error);
            throw error;
        }
    }

    async getDisconnectedConsumerCount(
        connection,
        accessCondition,
        accessValues
    ) {
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
                ${accessCondition}
            GROUP BY 
                c.meter_type
            ORDER BY 
                disconnection_count DESC
        `;

            const [results] = await connection.query({
                sql: query,
                values: accessValues,
                timeout: QUERY_TIMEOUT,
            });

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
            console.error('getDisconnectedConsumerCount error:', error);
            throw error;
        }
    }

    async deleteMeterByUid(connection, uid) {
        try {
            const query = `
            DELETE FROM disconnected_consumers_lkea 
            WHERE uid = ?
        `;

            const [result] = await connection.query({
                sql: query,
                timeout: QUERY_TIMEOUT,
                values: [uid],
            });

            return result.affectedRows > 0;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Delete query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('deleteMeterByUid error:', error);
            throw error;
        }
    }

    async newConsumer(
        connection,
        {
            block_name,
            flat_no,
            meter_serial,
            consumerId,
            consumer_name,
            consumer_type,
            meter_type,
            parent_hierarchy_id,
            uid,
            permanent_address,
            billing_address,
            mobile_number,
            email_address,
        }
    ) {
        try {
            const lkeaQuery = `
            INSERT INTO consumers_lkea (
                block_name,
                flat_no,
                meter_serial,
                consumer_id,
                consumer_name,
                consumer_type,
                meter_type,
                hierarchy_id,
                uid
            ) VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?
            )
        `;

            const lkeaValues = [
                block_name,
                flat_no,
                meter_serial,
                consumerId,
                consumer_name,
                consumer_type,
                meter_type,
                parent_hierarchy_id,
                uid,
            ];

            const consumerQuery = `
            INSERT INTO consumer (
                consumer_name,
                consumer_id,
                permanent_address,
                billing_address,
                mobile1,
                email,
                hierarchy_id,
                created_date,
                ac_status
            ) VALUES (
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                ?,
                NOW(),
                1
            )
        `;

            const consumerValues = [
                consumer_name,
                consumerId,
                permanent_address,
                billing_address,
                mobile_number,
                email_address,
                parent_hierarchy_id,
            ];

            const [lkeaResult] = await connection.query({
                sql: lkeaQuery,
                values: lkeaValues,
                timeout: QUERY_TIMEOUT,
            });

            const [consumerResult] = await connection.query({
                sql: consumerQuery,
                values: consumerValues,
                timeout: QUERY_TIMEOUT,
            });

            return (
                lkeaResult.affectedRows > 0 && consumerResult.affectedRows > 0
            );
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Query timed out after ' + QUERY_TIMEOUT / 1000 + ' seconds'
                );
            }
            console.log('newConsumer error:', error);
            throw error;
        }
    }

    async getMeterLastCommunication(connection, meter) {
        try {
            const [[{ last_comm }]] = await connection.query(
                {
                    sql: `
                        SELECT DATA_STRING as last_comm
                        FROM d3_b3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
            );
            return last_comm;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getMeterLastCommunication', error);
            throw error;
        }
    }

    async getD2Data(connection, meter) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT
                            RPH_VOLTAGE as voltage,
                            RPH_LINE_CURRENT as current,
                            RPH_POWER_FACTOR as powerFactor,
                            YPH_VOLTAGE as vYPh,
                            BPH_VOLTAGE as vBPh,
                            YPH_LINE_CURRENT as cYPh,
                            BPH_LINE_CURRENT as cBPh,
                            FREQUENCY as frequency,
                            APPARENT_POWER as apparent_power,
                            RPH_POWER_FACTOR as pfRPh,
                            YPH_POWER_FACTOR as pfRPh,
                            BPH_POWER_FACTOR as pfRPh,
                            AVG_POWER_FACTOR as pfAVG
                        FROM ntpl.d2 
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY METER_TIME_STAMP DESC
                        LIMIT 1
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
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
            console.log('getD2Data', error);
            throw error;
        }
    }

    async getD3Data(connection, meter) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT
                            KVAH_IMP as MDkVA
                        FROM ntpl.d3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY d3_time_stamp DESC
                        LIMIT 1
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
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
            console.log('getD2Data', error);
            throw error;
        }
    }

     async getD3B3Data(connection, meter) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                        SELECT
                            KWH_Imp as ckVAh,
                            DATA_STRING as ckWh
                        FROM ntpl.d3_b3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
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
            console.log('getD2Data', error);
            throw error;
        }
    }

    async graphDemoReportsAnalytics(connection, meter) {
        try {
            const d1 = new Date();
            const sdf = (date) => date.toISOString().split('T')[0];
            const presDate = sdf(new Date(d1.setDate(d1.getDate() - 210)));
            d1.setDate(d1.getDate() + 210);
            const nextDate = sdf(new Date(d1));

            const [results] = await connection.query({
                sql: `
                    SELECT
                        SUBSTR(D3_TIME_STAMP, 1, 10) AS consumption_date,
                        COUNT(*) AS count,
                        DATA_STRING as sum
                    FROM d3_b3
                    WHERE D3_TIME_STAMP >= ?
                      AND D3_TIME_STAMP <= ?
                      AND LENGTH(METER_SERIAL_NO) > 0
                      AND TRIM(METER_SERIAL_NO) != ''
                      AND METER_SERIAL_NO = ?
                    GROUP BY SUBSTR(D3_TIME_STAMP, 1, 10)
                `,
                values: [presDate, nextDate, meter],
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
            console.error('graphDashboardAnalytics error:', error);
            throw error;
        }
    }

    // async graphDemoReportsAnalytics(connection, meter) {
    //     try {
    //         const d1 = new Date();
    //         const sdf = (date) => date.toISOString().split('T')[0];
    //         const presDate = sdf(new Date(d1.setDate(d1.getDate() - 210)));
    //         d1.setDate(d1.getDate() + 210);
    //         const nextDate = sdf(new Date(d1));

    //         const [results] = await connection.query({
    //             sql: `
    //                 SELECT
    //                     SUBSTR(consumption_date, 1, 10) AS consumption_date,
    //                     COUNT(*) AS count,
    //                     SUM(consumption) as sum
    //                 FROM consumption
    //                 WHERE consumption_date >= ?
    //                   AND consumption_date <= ?
    //                   AND LENGTH(meter_serial_no) > 0
    //                   AND TRIM(meter_serial_no) != ''
    //                   AND meter_serial_no = ?
    //                 GROUP BY SUBSTR(consumption_date, 1, 10)
    //             `,
    //             values: [presDate, nextDate, meter],
    //             timeout: QUERY_TIMEOUT,
    //         });

    //         return results;
    //     } catch (error) {
    //         if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
    //             throw new Error(
    //                 'Dashboard query timed out after ' +
    //                     QUERY_TIMEOUT / 1000 +
    //                     ' seconds'
    //             );
    //         }
    //         console.error('graphDashboardAnalytics error:', error);
    //         throw error;
    //     }
    // }

    async graphDemoCumulativeReportsAnalytics(connection, meter) {
        try {
            const d1 = new Date();
            const sdf = (date) => date.toISOString().split('T')[0];
            const presDate = sdf(new Date(d1.setDate(d1.getDate() - 210)));
            d1.setDate(d1.getDate() + 210);
            const nextDate = sdf(new Date(d1));

            const [results] = await connection.query({
                sql: `
                    SELECT 
                        SUBSTR(D6_TIME_STAMP, 1, 10) AS date,
                        COUNT(*) AS count,
                        DATA_STRING as value
                    FROM d6_data 
                    WHERE D6_TIME_STAMP >= ?
                      AND D6_TIME_STAMP <= ?
                      AND LENGTH(METER_SERIAL_NO) > 0
                      AND TRIM(METER_SERIAL_NO) != ''
                      AND METER_SERIAL_NO = ?
                    GROUP BY SUBSTR(D6_TIME_STAMP, 1, 10)
                `,
                values: [presDate, nextDate, meter],
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
            console.error('graphDashboardAnalytics error:', error);
            throw error;
        }
    }

    async getMeterLastCommunicationDate(connection, meter) {
        try {
            const [[{ last_comm_date }]] = await connection.query(
                {
                    sql: `
                        SELECT D3_TIME_STAMP as last_comm_date
                        FROM d3_b3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
            );
            return last_comm_date;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getMeterLastCommunication', error);
            throw error;
        }
    }

    async getMeterLastCommunication(connection, meter) {
        try {
            const [[{ last_comm }]] = await connection.query(
                {
                    sql: `
                        SELECT DATA_STRING as last_comm
                        FROM d3_b3
                        WHERE METER_SERIAL_NO = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [meter]
            );
            return last_comm;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getMeterLastCommunication', error);
            throw error;
        }
    }
}

export default new Dashboard();
