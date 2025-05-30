import express from 'express';
import {
    getEdcSubstationWidgets,
    getSubstationDemandGraphDetails,
    getFeedersDataBySubstation,
} from '../controllers/main/substationController.js';
import { getFeedersBySubstationName } from '../controllers/main/feederController.js';

const router = express.Router();

router.get('/widgets/:edcs/substations', getEdcSubstationWidgets);
router.get('/:substationId/feeders', getFeedersBySubstationName);
router.get(
    '/graph/:substationID/demand/:date',
    getSubstationDemandGraphDetails
);
router.get('/:substationId/widgets', getFeedersDataBySubstation);

export default router;
