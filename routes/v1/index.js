import express from 'express';
import authRoutes from '../auth.js';
import dashboardRoutes from '../dashboard.js';
// import demoRoutes from '../demo.js';
import consumerRoutes from '../consumer.js';


const router = express.Router();

router.use('/auth', authRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/consumer', consumerRoutes);
// router.use('/demo', demoRoutes);

export default router;
