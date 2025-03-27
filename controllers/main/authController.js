import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import User from '../../models/main/user.model.js';
import config from '../../config/config.js';
import { authSchemas } from '../../schemas/auth.schema.js';
import { sendVerificationEmail } from '../../utils/emailService.js';
import crypto from 'crypto';
import pool from '../../config/db.js';

const JWT_SECRET = config.SECRET_KEY;
const JWT_REFRESH_SECRET = config.SECRET_KEY;
const JWT_EXPIRES_IN = config.JWT_EXPIRES_IN || '1h';
const JWT_REFRESH_EXPIRES_IN = config.JWT_REFRESH_EXPIRES_IN || '7';

// Generate random 6-digit code
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

const register = async (req, res) => {
    try {
        const { error, value } = authSchemas.register.validate(req.body);
        if (error) {
            return res.status(400).json({
                status: 'error',
                message: error.details[0].message,
            });
        }

        const { name, email, password } = value;

        const existingUser = await User.findByEmail(pool, email);
        if (existingUser) {
            return res.status(409).json({
                status: 'error',
                message: 'Email already registered',
            });
        }

        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        const userId = await User.createUser(pool, {
            name,
            email,
            passwordHash,
        });

        const verificationCode = generateVerificationCode();
        await User.saveVerificationCode(pool, userId, verificationCode);

        // Send verification email
        const emailSent = await sendVerificationEmail(
            email,
            verificationCode,
            true
        );
        if (!emailSent) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to send verification email. Please try again.',
            });
        }

        return res.status(201).json({
            status: 'success',
            message:
                'Registration successful. Please check your email for verification code.',
            userId,
        });
    } catch (err) {
        console.error('Registration error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred during registration',
        });
    }
};

const login = async (req, res) => {
    try {
        const {
            error,
            value: { email, password, rememberMe },
        } = authSchemas.login.validate(req.body);
        if (error) {
            return res
                .status(400)
                .json({ status: 'error', message: error.details[0].message });
        }
        const user = await User.findByEmailOrName(pool, email);
        if (!user) {
            return res
                .status(401)
                .json({ status: 'error', message: 'Authentication failed' });
        }

        // Check if email is verified
        // const isVerified = await User.isEmailVerified(user.id);
        // if (!isVerified) {
        //     // Generate new verification code for unverified users
        //     const verificationCode = generateVerificationCode();
        //     await User.saveVerificationCode(user.id, verificationCode);

        //     // Send verification email
        //     await sendVerificationEmail(email, verificationCode, true);

        //     return res.status(403).json({
        //         status: 'error',
        //         message:
        //             'Email not verified. A new verification code has been sent to your email.',
        //         userId: user.id,
        //         requiresVerification: true,
        //     });
        // }

        const loginSecurity = await User.getLoginSecurity(pool, user.id);
        if (
            loginSecurity.login_attempts >= 5 &&
            loginSecurity.lock_until &&
            loginSecurity.lock_until > Date.now()
        ) {
            return res.status(403).json({
                status: 'error',
                message:
                    'Account is temporarily locked. Please try again later.',
            });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await User.updateLoginAttempts(pool, user.id);
            return res
                .status(401)
                .json({ status: 'error', error: 'Invalid email or password.' });
        }

        await User.resetLoginAttempts(pool, user.id);

        // const verificationCode = generateVerificationCode();
        // await User.saveVerificationCode(pool, user.id, verificationCode);

        // Send verification email
        // const emailSent = await sendVerificationEmail(
        //     email,
        //     verificationCode,
        //     false
        // );
        // if (!emailSent) {
        //     return res.status(500).json({
        //         status: 'error',
        //         message: 'Failed to send verification code. Please try again.',
        //     });
        // }

        const roledata = await User.getRoleByID(pool, user.role_id);

        if (rememberMe) {
       //     if (user.role_id == 3) {
                const accessToken = jwt.sign(
                    {
                        userId: user.id,
                        email: user.email ? user.email : 'test@gmail.com',
                        role: roledata.role_title,
                        uid: user.name,
                        locationHierarchy: user.location_hierarchy,
                    },
                    JWT_SECRET,
                    { expiresIn: JWT_EXPIRES_IN }
                );

                const refreshToken = jwt.sign(
                    { userId: user.id },
                    JWT_REFRESH_SECRET,
                    {
                        expiresIn: JWT_REFRESH_EXPIRES_IN + 'd',
                    }
                );

                await User.saveRefreshToken(
                    pool,
                    user.id,
                    refreshToken,
                    JWT_REFRESH_EXPIRES_IN
                );

                res.cookie('accessToken', accessToken, {
                    httpOnly: config.NODE_ENV === 'production',
                    secure: config.NODE_ENV === 'production',
                    sameSite:
                        config.NODE_ENV === 'production' ? 'none' : 'strict',
                    maxAge: 24 * 60 * 60 * 1000,
                    domain:
                        config.NODE_ENV === 'production'
                            ? '.lk-ea.co.in'
                            : 'localhost',
                });

                res.cookie('accessTokenDuplicate', accessToken, {
                    httpOnly: false,
                    secure: config.NODE_ENV === 'production',
                    sameSite:
                        config.NODE_ENV === 'production' ? 'none' : 'strict',
                    maxAge: 24 * 60 * 60 * 1000,
                    domain:
                        config.NODE_ENV === 'production'
                            ? '.lk-ea.co.in'
                            : 'localhost',
                });

                res.cookie('refreshToken', refreshToken, {
                    httpOnly: config.NODE_ENV === 'production',
                    secure: config.NODE_ENV === 'production',
                    sameSite:
                        config.NODE_ENV === 'production' ? 'none' : 'strict',
                    path: '/api/refresh-token',
                    maxAge: 7 * 24 * 60 * 60 * 1000,
                    domain:
                        config.NODE_ENV === 'production'
                            ? '.lk-ea.co.in'
                            : 'localhost',
                });
        }

        return res.status(200).json({
            status: 'success',
            message: 'Login successful',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred',
        });
    }
};

// const verify2FA = async (req, res) => {
//     try {
//         const { userId, code } = req.body;

//         if (!userId || !code) {
//             return res.status(400).json({
//                 status: 'error',
//                 message: 'User ID and verification code are required',
//             });
//         }

//         const user = await User.findById(pool, userId);
//         if (!user) {
//             return res.status(404).json({
//                 status: 'error',
//                 message: 'User not found',
//             });
//         }

//         const isValid = await User.verifyCode(pool, userId, code);
//         if (!isValid) {
//             return res.status(401).json({
//                 status: 'error',
//                 message: 'Invalid or expired verification code',
//             });
//         }

//         const accessToken = jwt.sign(
//             { userId: user.id, email: user.email },
//             JWT_SECRET,
//             { expiresIn: JWT_EXPIRES_IN }
//         );

//         const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, {
//             expiresIn: JWT_REFRESH_EXPIRES_IN + 'd',
//         });

//         await User.saveRefreshToken(
//             pool,
//             user.id,
//             refreshToken,
//             JWT_REFRESH_EXPIRES_IN
//         );

//         res.cookie('accessToken', accessToken, {
//             httpOnly: config.NODE_ENV === 'production',
//             secure: config.NODE_ENV === 'production',
//             sameSite: config.NODE_ENV === 'production' ? 'none' : 'strict',
//             maxAge: 24 * 60 * 60 * 1000,
//             domain: config.NODE_ENV === 'production' ? '.lk-ea.co.in' : 'localhost',
//         });

//         res.cookie('refreshToken', refreshToken, {
//             httpOnly: config.NODE_ENV === 'production',
//             secure: config.NODE_ENV === 'production',
//             sameSite: 'strict',
//             path: '/api/refresh-token',
//             maxAge: 7 * 24 * 60 * 60 * 1000,
//             domain: config.NODE_ENV === 'production' ? '.lk-ea.co.in' : 'localhost',
//         });

//         return res.status(200).json({
//             status: 'success',
//             message: 'Login successful',
//             user: {
//                 id: user.id,
//                 email: user.email,
//                 name: user.name,
//             },
//         });
//     } catch (err) {
//         console.error('Verification error:', err);
//         return res.status(500).json({
//             status: 'error',
//             message: 'An unexpected error occurred',
//         });
//     }
// };

const verifyEmail = async (req, res) => {
    try {
        const { userId, code } = req.body;

        if (!userId || !code) {
            return res.status(400).json({
                status: 'error',
                message: 'User ID and verification code are required',
            });
        }

        const user = await User.findById(pool, userId);
        if (!user) {
            return res.status(404).json({
                status: 'error',
                message: 'User not found',
            });
        }

        // Check if email is already verified
        const isVerified = await User.isEmailVerified(pool, userId);
        if (isVerified) {
            return res.status(400).json({
                status: 'error',
                message: 'Email is already verified',
            });
        }

        const isValid = await User.verifyCode(pool, userId, code);
        if (!isValid) {
            return res.status(401).json({
                status: 'error',
                message: 'Invalid or expired verification code',
            });
        }

        // Mark email as verified
        await User.markEmailAsVerified(pool, userId);

        // Generate initial access token
        const accessToken = jwt.sign(
            { userId: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: JWT_EXPIRES_IN }
        );

        // Generate refresh token
        const refreshToken = jwt.sign({ userId: user.id }, JWT_REFRESH_SECRET, {
            expiresIn: JWT_REFRESH_EXPIRES_IN + 'd',
        });

        await User.saveRefreshToken(
            pool,
            user.id,
            refreshToken,
            JWT_REFRESH_EXPIRES_IN
        );

        // Set cookies
        res.cookie('accessToken', accessToken, {
            httpOnly: config.NODE_ENV === 'production',
            secure: config.NODE_ENV === 'production',
            sameSite: config.NODE_ENV === 'production' ? 'none' : 'strict',
            maxAge: 24 * 60 * 60 * 1000,
            domain:
                config.NODE_ENV === 'production' ? '.lk-ea.co.in' : 'localhost',
        });

        res.cookie('refreshToken', refreshToken, {
            httpOnly: config.NODE_ENV === 'production',
            secure: config.NODE_ENV === 'production',
            sameSite: config.NODE_ENV === 'production' ? 'none' : 'strict',
            path: '/api/refresh-token',
            maxAge: 7 * 24 * 60 * 60 * 1000,
            domain:
                config.NODE_ENV === 'production' ? '.lk-ea.co.in' : 'localhost',
        });

        return res.status(200).json({
            status: 'success',
            message: 'Email verified successfully',
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
            },
        });
    } catch (err) {
        console.error('Email verification error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred',
        });
    }
};

const forgotPassword = async (req, res) => {
    try {
        const { error, value } = authSchemas.forgotPassword.validate(req.body);
        if (error) {
            return res.status(400).json({
                status: 'error',
                message: error.details[0].message,
            });
        }

        const { email } = value;

        // Find user but don't reveal if email exists or not
        const user = await User.findByEmail(pool, email);
        if (!user) {
            // Return success even if email doesn't exist to prevent enumeration
            return res.status(200).json({
                status: 'success',
                message:
                    'If the email exists, you will receive password reset instructions.',
            });
        }

        // Generate secure reset token (32 bytes = 256 bits)
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + 3600000; // 1 hour

        // Hash the token before saving
        const hashedToken = await bcrypt.hash(resetToken, 12);

        // Save hashed token and expiry
        await User.saveResetToken(pool, user.id, hashedToken, resetTokenExpiry);

        // Send reset email with the unhashed token
        const resetLink = `${
            config.FRONTEND_URL
        }/reset-password?token=${resetToken}&email=${encodeURIComponent(
            email
        )}`;

        const emailSent = await sendVerificationEmail(
            email,
            resetLink,
            false,
            'reset'
        );

        if (!emailSent) {
            return res.status(500).json({
                status: 'error',
                message: 'Failed to send reset email. Please try again.',
            });
        }

        return res.status(200).json({
            status: 'success',
            message:
                'If the email exists, you will receive password reset instructions.',
        });
    } catch (err) {
        console.error('Forgot password error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred',
        });
    }
};

const resetPassword = async (req, res) => {
    try {
        const { error, value } = authSchemas.resetPassword.validate(req.body);
        if (error) {
            return res.status(400).json({
                status: 'error',
                message: error.details[0].message,
            });
        }

        const { email, token, newPassword } = value;

        const user = await User.findByEmail(pool, email);
        if (!user) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token',
            });
        }

        // Get stored reset token data
        const storedResetData = await User.getResetToken(pool, user.id);
        if (
            !storedResetData ||
            !storedResetData.token ||
            !storedResetData.expiry
        ) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token',
            });
        }

        // Check if token is expired
        if (Date.now() > storedResetData.expiry) {
            await User.clearResetToken(pool, user.id);
            return res.status(400).json({
                status: 'error',
                message: 'Reset token has expired',
            });
        }

        // Verify token
        const isValidToken = await bcrypt.compare(token, storedResetData.token);
        if (!isValidToken) {
            return res.status(400).json({
                status: 'error',
                message: 'Invalid or expired reset token',
            });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(newPassword, salt);

        // Update password and clear reset token
        await User.updatePassword(pool, user.id, passwordHash);
        await User.clearResetToken(pool, user.id);

        return res.status(200).json({
            status: 'success',
            message: 'Password has been reset successfully',
        });
    } catch (err) {
        console.error('Reset password error:', err);
        return res.status(500).json({
            status: 'error',
            message: 'An unexpected error occurred',
        });
    }
};

export {
    login,
    // verify2FA,
    register,
    verifyEmail,
    forgotPassword,
    resetPassword,
};
