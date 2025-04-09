import express from 'express';
import {
    getEdcSubstationWidgets,
    getFeedersDataBySubstation,
} from '../controllers/main/substationController.js';
import { getFeedersBySubstationName } from '../controllers/main/feederController.js';

const router = express.Router();

router.get('/widgets/:edcs/substations', getEdcSubstationWidgets);

// Use 'substationName' instead of 'substationId'
router.get('/:substationName/feeders', getFeedersBySubstationName);

router.get('/:substationName/widgets', getFeedersDataBySubstation);

export default router;
