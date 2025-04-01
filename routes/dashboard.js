import express from 'express';
import {
    getConsumersTable,
    getMainWidgets,
    getBillingData,
    getBillingWidgets,
    getTariffRates,
    getMainGraphAnalytics,
    getReportsWidgets,
    getConsumerByID,
    searchConsumers,
    getHierarchy,
    getInvoiceByInvoiceNo,
    bulkUpdate,
    getTicketAnalytics,
    editConsumerDetails,
    cosumerBulkUpload,
    getReportsGraphAnalytics,
    getOverdueConsumers,
    getDisconnectedConsumers,
    getTicketTrends,
    getTicketTable,
    editHierarchy,
    bulkRemainder,
    disconnectConsumer,
    reconnectConsumer,
    addNewConsumer,
    getPowerWidgets,
    getPowerGraphs,
} from '../controllers/main/dashboardController.js';
import multer from 'multer';

const upload = multer({ dest: 'uploads/' });

const router = express.Router();

let with_pagination = true;
let consumer_no = '';

// Dashboard
router.get('/consumers', getConsumersTable(with_pagination, consumer_no));
router.get('/consumer', getConsumerByID);
router.post('/consumer', addNewConsumer);
router.post('/consumer/:uid/disconnect', disconnectConsumer);
router.post('/consumer/:uid/reconnect', reconnectConsumer);
router.post('/edit/consumer', editConsumerDetails);
router.get('/main/widgets', getMainWidgets);
router.get('/main/graphs', getMainGraphAnalytics);
router.get('/main/overdue-consumers', getOverdueConsumers);
router.get('/main/disconnected-consumers', getDisconnectedConsumers);
router.get('/consumers/search', searchConsumers);

// Billing
router.get('/billing/widgets', getBillingWidgets);
router.get('/billing', getBillingData);
router.get('/invoice', getInvoiceByInvoiceNo);
router.get('/tariff', getTariffRates);

// Reports
router.get('/reports/widgets', getReportsWidgets);
router.get('/reports/graphs', getReportsGraphAnalytics);
router.get('/reports/power', getPowerWidgets);
router.get('/reports/power-graphs', getPowerGraphs);

// Hierarchy
router.get('/hierarchy', getHierarchy);
router.post('/bills/bulk-update', bulkUpdate);
router.post('/remainders/bulk-update', bulkRemainder);
router.post('/consumers/bulk-upload', upload.single('file'), cosumerBulkUpload);
router.post('/edit/hierarchy', editHierarchy);

// Tickets
router.get('/tickets/widgets', getTicketAnalytics);
router.get('/tickets/trends', getTicketTrends);
router.get('/tickets', getTicketTable);

export default router;
