import express from 'express';
import { getFeedersWidgets } from '../controllers/main/feederController.js';
const router = express.Router();
router.get('/regions/:region/feeders', getFeedersWidgets);

export default router;
