import express from 'express';
import authRoutes from '../auth.js';
import regionRoutes from '../regions.js';
// import demoRoutes from '../demo.js';
import consumerRoutes from '../consumer.js';
import edcRoutes from '../edc.js';
import profileRoutes from '../profile.js';
import ticketRoutes from '../tickets.js';
import feederRoutes from '../feeder.js';
import substationRoutes from '../substation.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/regions', regionRoutes);
router.use('/consumer', consumerRoutes);
router.use('/edcs', edcRoutes);
router.use('/substations', substationRoutes);
router.use('/profile', profileRoutes);
router.use('/feeders', feederRoutes);
router.use('/tickets', ticketRoutes);

// router.use('/demo', demoRoutes);

export default router;
