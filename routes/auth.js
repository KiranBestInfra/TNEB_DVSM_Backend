import express from 'express';
import {
    login,
    // verify2FA,
    register,
    verifyEmail,
    forgotPassword,
    resetPassword,
} from '../controllers/main/authController.js';
const router = express.Router();

router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/login', login);
// router.post('/verify', verify2FA);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

export default router;
