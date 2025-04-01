import express from 'express';
import { getSubstationWidgets } from '../controllers/main/substationController.js';

const router = express.Router();

router.get('/widgets/:region/substations', getSubstationWidgets);

export default router;
