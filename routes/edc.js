import express from 'express';
import {
    getEDCWidgets,
    getSubstationTotalWidgets,
} from '../controllers/main/edcsController.js';
import { getSubstationWidgets } from '../controllers/main/substationController.js';
import { getFeedersNamesByEdcNameHandler } from '../controllers/main/feederController.js';

const router = express.Router();

router.get('/widgets/:region', getEDCWidgets);
router.get('/widgets/:region/substations', getSubstationWidgets);
router.get('/:edcs/widgets', getSubstationTotalWidgets);
router.get('/:edc/feeders', getFeedersNamesByEdcNameHandler);

export default router;
