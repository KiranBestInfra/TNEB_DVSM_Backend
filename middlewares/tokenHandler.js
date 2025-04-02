import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import config from '../config/config.js';

const JWT_SECRET = config.SECRET_KEY;
const JWT_EXPIRES_IN = config.JWT_EXPIRES_IN || '1d';
const JWT_REFRESH_SECRET = config.SECRET_KEY;

export const authenticateToken = async (req, res, next) => {
    try {
        const accessToken = req.cookies.accessToken;

        if (!accessToken) {
            return res.status(401).json({
                status: 'error',
                message: 'Access token not found',
            });
        }

        try {
            const decoded = jwt.verify(accessToken, JWT_SECRET);
            req.user = decoded;
            return next();
        } catch (err) {
            const refreshToken = req.cookies.refreshToken;

            if (!refreshToken) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Refresh token not found',
                });
            }

            const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
            const user = await User.findById(decoded.userId);
            const storedToken = await User.getRefreshToken(decoded.userId);

            if (!user || !storedToken || storedToken !== refreshToken) {
                return res.status(401).json({
                    status: 'error',
                    message: 'Invalid refresh token',
                });
            }

            const newAccessToken = jwt.sign(
                { userId: user.id, email: user.email },
                JWT_SECRET,
                { expiresIn: JWT_EXPIRES_IN }
            );

            res.cookie('accessToken', newAccessToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 24 * 60 * 60 * 1000, // 24 hours
            });

            req.user = { userId: user.id, email: user.email };
            next();
        }
    } catch (err) {
        console.error('Auth middleware error:', err);
        return res.status(401).json({
            status: 'error',
            message: 'Authentication failed',
        });
    }
};
