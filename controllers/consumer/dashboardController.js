import Consumer from '../../models/consumer/dashboardModal.js';
import logger from '../../utils/logger.js';
import pool from '../../config/db.js';
import { convertToIST } from '../../utils/dashboardUtils.js';

export const getConsumerDetails = async (req, res) => {
    try {
        const user = req.user;
        const consumer = await Consumer.getConsumerDetails(pool, user);
        const blockName = consumer.block_name;
        const hierarchy = await Consumer.getHierarchyUsingLocationName(
            pool,
            blockName
        );
        const lastComm = await Consumer.getMeterLastCommunicationDate(
            pool,
            user
        );

        res.status(200).json({
            status: 'success',
            data: {
                ...consumer,
                ...hierarchy,
                lastComm: convertToIST(lastComm),
                meter_serial: consumer.meter_serial,
            },
        });
    } catch (error) {
        logger.error('Error Fetching Consumer Details:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching consumers',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getTariffRates = async (req, res) => {
    try {
        const tariffs = await Consumer.getTariffRates(pool);
        res.status(200).json({
            status: 'success',
            data: tariffs,
        });
    } catch (error) {
        logger.error('Error fetching tariff rate:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching tariff rate',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getPowerDetails = async (req, res) => {
    try {
        const user = req.user;
        const power = await Consumer.getD2Data(pool, user);
        const last_comm = await Consumer.getMeterLastCommunication(pool, user);
        const due = await Consumer.getOverdueAmount(pool, user);

        res.status(200).json({
            status: 'success',
            data: {
                ...power,
                last_comm,
                due,
            },
        });
    } catch (error) {
        logger.error('Error fetching Power details:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching tariff rate',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};

export const getBillingData = async (req, res) => {
    try {
        const user = req.user;
        const bill = await Consumer.getLatestBill(pool, user);

        res.status(200).json({
            status: 'success',
            // data: {
            //     ...power,
            //     last_comm,
            //     due,
            // },
        });
    } catch (error) {
        logger.error('Error fetching Billing details:', {
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
        });

        res.status(500).json({
            status: 'error',
            message: 'An error occurred while fetching tariff rate',
            errorId: error.code || 'INTERNAL_SERVER_ERROR',
        });
    }
};
