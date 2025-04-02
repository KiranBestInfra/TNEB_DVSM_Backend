import express from 'express';
import {
    demandGraph,
    getDashboardWidgets,
    searchConsumers,
} from '../controllers/main/regionsController.js';

const router = express.Router();

router.get('/widgets', getDashboardWidgets);
router.get('/graph/demand', demandGraph);
router.get('/search', searchConsumers);
router.get('/graph/:regionID/demand', demandGraph);

export default router;
