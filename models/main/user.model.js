const QUERY_TIMEOUT = 15000;

class User {
    // Find user by email
    async findByEmailOrName(connection, identifier) {
        try {
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT * FROM users WHERE email = ? OR name = ? LIMIT 1',
                    [identifier, identifier]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows[0];
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'User query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Create new user
    async createUser(connection, userData) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const { name, email, passwordHash } = userData;
            const [result] = await Promise.race([
                connection.query(
                    'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
                    [name, email, passwordHash]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return result.insertId;
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'User creation timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Example: find user by id
    async findById(connection, id) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT id, name, email FROM users WHERE id = ? LIMIT 1',
                    [id]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows[0];
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'User query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Update login attempts
    async updateLoginAttempts(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `INSERT INTO login_security (user_id, login_attempts, updated_at) 
                    VALUES (?, 1, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE 
                        login_attempts = login_attempts + 1,
                        lock_until = CASE 
                            WHEN login_attempts + 1 >= 5 
                            THEN DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 15 MINUTE)
                            ELSE NULL 
                        END,
                        updated_at = CURRENT_TIMESTAMP`,
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Login attempt update timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Reset login attempts
    async resetLoginAttempts(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `INSERT INTO login_security (user_id, login_attempts, lock_until, last_login_at) 
                    VALUES (?, 0, NULL, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE 
                        login_attempts = 0,
                        lock_until = NULL,
                        last_login_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP`,
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Login attempt reset timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Save refresh token
    async saveRefreshToken(connection, userId, refreshToken, expiresIn) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `INSERT INTO refresh_tokens 
                    (user_id, token, expires_at) 
                    VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))
                    ON DUPLICATE KEY UPDATE
                        token = VALUES(token),
                        expires_at = VALUES(expires_at),
                        created_at = CURRENT_TIMESTAMP`,
                    [userId, refreshToken, expiresIn]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Token save timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Get login security information
    async getLoginSecurity(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT login_attempts, lock_until FROM login_security WHERE user_id = ? LIMIT 1',
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows[0] || { login_attempts: 0, lock_until: null };
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Login security query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Get refresh token
    async getRefreshToken(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT token FROM refresh_tokens WHERE user_id = ? AND expires_at > CURRENT_TIMESTAMP ORDER BY created_at DESC LIMIT 1',
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows[0]?.token || null;
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Token query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Save verification code
    async saveVerificationCode(connection, userId, code, expiresIn = 300) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `INSERT INTO verification_codes 
                    (user_id, code, expires_at) 
                    VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND))
                    ON DUPLICATE KEY UPDATE
                        code = VALUES(code),
                        expires_at = VALUES(expires_at),
                        created_at = CURRENT_TIMESTAMP`,
                    [userId, code, expiresIn]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Verification code save timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Verify code
    async verifyCode(connection, userId, code) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [rows] = await Promise.race([
                connection.query(
                    `SELECT id FROM verification_codes 
                    WHERE user_id = ? AND code = ? AND expires_at > CURRENT_TIMESTAMP
                    LIMIT 1`,
                    [userId, code]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows.length > 0;
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Code verification timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Mark email as verified
    async markEmailAsVerified(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    'UPDATE users SET email_verified = true, email_verified_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Email verification update timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Check if email is verified
    async isEmailVerified(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT email_verified FROM users WHERE id = ?',
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return rows[0]?.email_verified || false;
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Email verification check timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    // Rate limiting methods
    // async getRateLimitAttempts(key) {
    //     try {
    //         const result = await pool.query(
    //             'SELECT attempts, created_at FROM rate_limits WHERE key = $1',
    //             [key]
    //         );

    //         if (result.rows.length === 0) {
    //             await pool.query(
    //                 'INSERT INTO rate_limits (key, attempts, created_at) VALUES ($1, 0, NOW())',
    //                 [key]
    //             );
    //             return 0;
    //         }

    //         const record = result.rows[0];
    //         const oneHourAgo = new Date(Date.now() - 3600000);

    //         if (new Date(record.created_at) < oneHourAgo) {
    //             await pool.query(
    //                 'UPDATE rate_limits SET attempts = 0, created_at = NOW() WHERE key = $1',
    //                 [key]
    //             );
    //             return 0;
    //         }

    //         return record.attempts;
    //     } catch (error) {
    //         console.error('Error in getRateLimitAttempts:', error);
    //         return 0;
    //     }
    // }

    // async incrementRateLimitAttempts(key) {
    //     try {
    //         await pool.query(
    //             `INSERT INTO rate_limits (key, attempts, created_at)
    //              VALUES ($1, 1, NOW())
    //              ON CONFLICT (key)
    //              DO UPDATE SET attempts = rate_limits.attempts + 1`,
    //             [key]
    //         );
    //     } catch (error) {
    //         console.error('Error in incrementRateLimitAttempts:', error);
    //     }
    // }

    // Password reset methods
    async saveResetToken(connection, userId, token, expiry) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `UPDATE users 
                    SET reset_token = ?, 
                        reset_token_expiry = FROM_UNIXTIME(?/1000)
                    WHERE id = ?`,
                    [token, expiry, userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Reset token save timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    async getResetToken(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            const [result] = await Promise.race([
                connection.query(
                    `SELECT reset_token as token,
                           UNIX_TIMESTAMP(reset_token_expiry) * 1000 as expiry
                    FROM users
                    WHERE id = ?`,
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
            return result[0];
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Reset token query timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    async clearResetToken(connection, userId) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `UPDATE users 
                     SET reset_token = NULL, 
                         reset_token_expiry = NULL 
                     WHERE id = ?`,
                    [userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Reset token clear timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    async getRoleByID(connection, id) {
        try {
            const [[results]] = await Promise.race([
                connection.query(
                    `SELECT * FROM user_role_lkea WHERE role_id = ?`,
                    [id]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);

            return results;
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Reset token clear timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }

    async updatePassword(connection, userId, passwordHash) {
        // let connection;
        try {
            // connection = await pool.getConnection();
            await Promise.race([
                connection.query(
                    `UPDATE users 
                     SET password = ?, 
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = ?`,
                    [passwordHash, userId]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);
        } catch (error) {
            if (error.message === 'Query timeout') {
                throw new Error(
                    'Password update timed out after ' +
                        QUERY_TIMEOUT / 1000 +
                        ' seconds'
                );
            }
            throw error;
        }
        // finally {
        //     if (connection) {
        //         connection.release();
        //     }
        // }
    }
}

export default new User();
