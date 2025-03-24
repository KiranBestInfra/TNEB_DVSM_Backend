import express from 'express';
import authRoutes from '../auth.js';
import regionRoutes from '../regions.js';
// import demoRoutes from '../demo.js';
import consumerRoutes from '../consumer.js';


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/regions', regionRoutes);
router.use('/consumer', consumerRoutes);
// router.use('/demo', demoRoutes);

export default router;
