import express from 'express';
import { getEDCWidgets } from '../controllers/main/edcsController.js';
import { getSubstationWidgets } from '../controllers/main/substationController.js';

const router = express.Router();

router.get('/widgets/:region', getEDCWidgets);
router.get('/widgets/:region/substations', getSubstationWidgets);

export default router;

