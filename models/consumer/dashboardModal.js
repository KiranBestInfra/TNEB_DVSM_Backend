const QUERY_TIMEOUT = 30000;

class Consumer {
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

    async getConsumerDetails(connection, user) {
        try {
            const [[consumer]] = await connection.query(
                {
                    sql: `
                        SELECT *
                        FROM consumers_lkea 
                        WHERE uid = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
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
            console.log('getConsumerDetails', error);
            throw error;
        }
    }

    async getMeterLastCommunicationDate(connection, user) {
        try {
            const [[{ last_comm_date }]] = await connection.query(
                {
                    sql: `
                        SELECT d.D3_TIME_STAMP as last_comm_date
                        FROM d3_b3 d
                        JOIN consumers_lkea cl ON d.meter_serial_no = cl.meter_serial
                        WHERE cl.uid = ?
                        ORDER BY D3_TIME_STAMP DESC
                        LIMIT 1;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
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

    async getMeterLastCommunication(connection, user) {
        try {
            const [[{ last_comm }]] = await connection.query(
                {
                    sql: `
                        SELECT d.DATA_STRING as last_comm
                        FROM d3_b3 d
                        JOIN consumers_lkea cl ON d.meter_serial_no = cl.meter_serial
                        WHERE cl.uid = ?
                        ORDER BY d.D3_TIME_STAMP DESC
                        LIMIT 1;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
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

    async getD2Data(connection, user) {
        try {
            const [[results]] = await connection.query(
                {
                    sql: `
                       SELECT
                            d.RPH_VOLTAGE as voltage,
                            d.RPH_LINE_CURRENT as current,
                            d.RPH_POWER_FACTOR as powerFactor,
                            d.YPH_VOLTAGE as vYPh,
                            d.BPH_VOLTAGE as vBPh,
                            d.YPH_LINE_CURRENT as cYPh,
                            d.BPH_LINE_CURRENT as cBPh,
                            d.FREQUENCY as frequency
                        FROM ntpl.d2 d
                        JOIN consumers_lkea cl ON d.meter_serial_no = cl.meter_serial
                        WHERE cl.uid = ?
                        ORDER BY d.METER_TIME_STAMP DESC
                        LIMIT 1
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
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

    async getOverdueAmount(connection, user) {
        try {
            const [[{ due }]] = await connection.query(
                {
                    sql: `
                        SELECT SUM(due_amount) as due
                        FROM bill_lkea 
                        WHERE uid = ?
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
            );
            return due;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getOverdueAmount', error);
            throw error;
        }
    }

    async getHierarchyUsingLocationName(connection, locationName) {
        try {
            const [[hierarchy]] = await connection.query(
                {
                    sql: `
                        SELECT 
                            l1.location_id as level1_id, l1.location_name as level1_name, l1.location_type as level1_type,
                            l2.location_id as level2_id, l2.location_name as level2_name, l2.location_type as level2_type,
                            l3.location_id as level3_id, l3.location_name as level3_name, l3.location_type as level3_type,
                            l4.location_id as level4_id, l4.location_name as level4_name, l4.location_type as level4_type,
                            l5.location_id as level5_id, l5.location_name as level5_name, l5.location_type as level5_type
                        FROM ntpl.location_hierarchy_lkea l1
                        LEFT JOIN ntpl.location_hierarchy_lkea l2 ON l1.parent_location_id = l2.location_id
                        LEFT JOIN ntpl.location_hierarchy_lkea l3 ON l2.parent_location_id = l3.location_id
                        LEFT JOIN ntpl.location_hierarchy_lkea l4 ON l3.parent_location_id = l4.location_id
                        LEFT JOIN ntpl.location_hierarchy_lkea l5 ON l4.parent_location_id = l5.location_id
                        WHERE l1.location_name = ?;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [locationName]
            );
            return hierarchy;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getHierarchyUsingLocationName', error);
            throw error;
        }
    }

    async getLatestBill(connection, user) {
        try {
            const [[bill]] = await connection.query(
                {
                    sql: `
                        SELECT *
                        FROM ntpl.bill_lkea
                        WHERE uid = ?
                        ORDER BY 
                            (DATE_FORMAT(bill_date, '%Y-%m') = DATE_FORMAT(CURDATE(), '%Y-%m')) DESC,
                            bill_date DESC
                        LIMIT 1;
                    `,
                    timeout: QUERY_TIMEOUT,
                },
                [user.uid]
            );
            return bill;
        } catch (error) {
            if (error.code === 'PROTOCOL_SEQUENCE_TIMEOUT') {
                throw new Error(
                    'Dashboard query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            console.log('getOverdueAmount', error);
            throw error;
        }
    }
}

export default new Consumer();
