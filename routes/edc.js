import express from 'express';
import {
    getEDCWidgets,
    getSubstationTotalWidgets,
} from '../controllers/main/edcsController.js';
import {
    getSubstationWidgets,
    getEdcSubstationWidgets,
} from '../controllers/main/substationController.js';

const router = express.Router();

router.get('/widgets/:region', getEDCWidgets);
router.get('/widgets/:region/substations', getSubstationWidgets);
router.get('/:edcs/widgets', getSubstationTotalWidgets);
export default router;
