import express from 'express';
import { getEdcSubstationWidgets, getSubstationWidgets } from '../controllers/main/substationController.js';

const router = express.Router();

router.get('/widgets/:edcs/substations', getEdcSubstationWidgets);

export default router;
