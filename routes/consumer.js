import express from 'express';
import {
    getConsumerDetails,
    getTariffRates,
    getPowerDetails,
    getBillingData,
} from '../controllers/consumer/dashboardController.js';

const router = express.Router();

router.get('/details', getConsumerDetails);
router.get('/tariff', getTariffRates);
router.get('/power', getPowerDetails);
router.get('/billing', getBillingData);

export default router;
