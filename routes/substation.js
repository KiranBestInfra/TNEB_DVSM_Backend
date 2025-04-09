import express from 'express';
import {
    getEdcSubstationWidgets,
    getSubstationDemandGraphDetails,
} from '../controllers/main/substationController.js';
import { getFeedersBySubstationName } from '../controllers/main/feederController.js';

const router = express.Router();

router.get('/widgets/:edcs/substations', getEdcSubstationWidgets);
router.get('/:substationName/feeders', getFeedersBySubstationName);
router.get('/graph/:substationID/demand', getSubstationDemandGraphDetails);

export default router;
