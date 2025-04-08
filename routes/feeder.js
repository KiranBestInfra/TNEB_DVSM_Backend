import express from 'express';
import {
    // getFeedersWidgets,
    demandGraph,
} from '../controllers/main/feederController.js';
const router = express.Router();

router.get('/graph/:feederID/demand', demandGraph);
//router.get('/regions/:region/feeders', getFeedersWidgets);

export default router;
