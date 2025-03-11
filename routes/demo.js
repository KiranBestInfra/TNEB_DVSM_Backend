import express from 'express';
import {
    getMainWidgets,
    getMainGraphAnalytics,
    getOverdueConsumers,
    getDisconnectedConsumers,
    getConsumersTable,
    getTariffRates,
    getHierarchy,
    getReportsWidgets,
} from '../controllers/demo/dashboardController.js';

const router = express.Router();

let with_pagination = true;
let consumer_no = '';

// Dashboard
router.get('/main/widgets', getMainWidgets);
router.get('/main/graphs', getMainGraphAnalytics);
router.get('/main/overdue-consumers', getOverdueConsumers);
router.get('/main/disconnected-consumers', getDisconnectedConsumers);
router.get('/consumers', getConsumersTable(with_pagination, consumer_no));

// Global
router.get('/tariff', getTariffRates);
router.get('/hierarchy', getHierarchy);

// Reports
router.get('/reports/widgets', getReportsWidgets);

export default router