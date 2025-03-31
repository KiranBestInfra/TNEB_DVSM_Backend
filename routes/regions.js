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

export default router;
