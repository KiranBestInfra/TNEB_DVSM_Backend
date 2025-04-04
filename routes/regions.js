import express from 'express';
import {
    demandGraph,
    getDashboardWidgets,
    searchConsumers,
} from '../controllers/main/regionsController.js';
import {
    getFeedersNamesByRegion,
    getFeedersWidgets,
} from '../controllers/main/feederController.js';


const router = express.Router();

router.get('/widgets', getDashboardWidgets);
router.get('/graph/demand', demandGraph);
router.get('/search', searchConsumers);
router.get('/graph/:regionID/demand', demandGraph);
router.get('/:region/feeders', getFeedersNamesByRegion, getFeedersWidgets);

export default router;
