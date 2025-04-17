const QUERY_TIMEOUT = 30000;

class User {
    // Find user by email
    async findByEmailOrName(connection, identifier) {
        try {
            const [rows] = await Promise.race([
                connection.query(
                    'SELECT * FROM user WHERE email = ? OR user_id = ? LIMIT 1',
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
                    'INSERT INTO user (user_id, email, password) VALUES (?, ?, ?)',
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
                    'SELECT slno, name, email FROM user WHERE slno = ? LIMIT 1',
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

    async saveRefreshToken(
        connection,
        userId,
        refreshToken,
        expiresIn,
        ipAddress,
        deviceFingerprint
    ) {
        try {
            let expiresInSeconds = expiresIn;
            if (typeof expiresIn === 'string' && expiresIn.endsWith('d')) {
                const days = parseInt(expiresIn.slice(0, -1), 10);
                expiresInSeconds = days * 24 * 60 * 60;
            }

            const [existingRecords] = await Promise.race([
                connection.query(
                    `SELECT id FROM refresh_tokens 
                    WHERE user_id = ? AND (ip_address = ? AND device_fingerprint = ?)`,
                    [userId, ipAddress, deviceFingerprint]
                ),
                new Promise((_, reject) =>
                    setTimeout(
                        () => reject(new Error('Query timeout')),
                        QUERY_TIMEOUT
                    )
                ),
            ]);

            if (existingRecords.length > 0) {
                await Promise.race([
                    connection.query(
                        `UPDATE refresh_tokens 
                        SET token = ?,
                            expires_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND),
                            created_at = CURRENT_TIMESTAMP
                        WHERE user_id = ? AND (ip_address = ? AND device_fingerprint = ?)`,
                        [
                            refreshToken,
                            expiresInSeconds,
                            userId,
                            ipAddress,
                            deviceFingerprint,
                        ]
                    ),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error('Query timeout')),
                            QUERY_TIMEOUT
                        )
                    ),
                ]);
            } else {
                await Promise.race([
                    connection.query(
                        `INSERT INTO refresh_tokens 
                        (user_id, token, expires_at, ip_address, device_fingerprint, created_at) 
                        VALUES (?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND), ?, ?, CURRENT_TIMESTAMP)`,
                        [
                            userId,
                            refreshToken,
                            expiresInSeconds,
                            ipAddress,
                            deviceFingerprint,
                        ]
                    ),
                    new Promise((_, reject) =>
                        setTimeout(
                            () => reject(new Error('Query timeout')),
                            QUERY_TIMEOUT
                        )
                    ),
                ]);
            }
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

    async getRefreshToken(connection, userId, ipAddress, deviceFingerprint) {
        try {
            const [rows] = await Promise.race([
                connection.query(
                    `SELECT token 
                    FROM refresh_tokens 
                    WHERE user_id = ? 
                    AND (ip_address = ? AND device_fingerprint = ?)
                    AND expires_at > CURRENT_TIMESTAMP 
                    ORDER BY created_at DESC LIMIT 1`,
                    [userId, ipAddress, deviceFingerprint]
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
    }

    // Verify if refresh token matches the most recent one
    async verifyRefreshToken(
        connection,
        userId,
        token,
        ipAddress,
        deviceFingerprint
    ) {
        try {
            // Implement retries for database connection issues
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    const storedToken = await this.getRefreshToken(
                        connection,
                        userId,
                        ipAddress,
                        deviceFingerprint
                    );

                    if (!storedToken) {
                        return false;
                    }

                    return token === storedToken;
                } catch (err) {
                    // Only retry on connection errors
                    if (
                        err.code === 'ECONNRESET' ||
                        err.code === 'PROTOCOL_CONNECTION_LOST'
                    ) {
                        retryCount++;
                        // Wait a bit before retrying (exponential backoff)
                        await new Promise((resolve) =>
                            setTimeout(resolve, 500 * Math.pow(2, retryCount))
                        );
                        console.log(
                            `Retrying token verification (attempt ${retryCount}/${maxRetries})...`
                        );
                    } else {
                        // For other errors, throw immediately
                        throw err;
                    }
                }
            }

            // If we've exhausted retries, throw the last error
            throw new Error(
                'Maximum retry attempts reached for token verification'
            );
        } catch (error) {
            console.error('Refresh token verification error:', error);
            return false;
        }
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
                    'UPDATE user SET email_verified = true, email_verified_at = CURRENT_TIMESTAMP WHERE slno = ?',
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
                    'SELECT email_verified FROM user WHERE slno = ?',
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
                    `UPDATE user 
                    SET reset_token = ?, 
                        reset_token_expiry = FROM_UNIXTIME(?/1000)
                    WHERE slno = ?`,
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
                    FROM user
                    WHERE slno = ?`,
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
                    `UPDATE user 
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
                connection.query(`SELECT * FROM user_role WHERE role_id = ?`, [
                    id,
                ]),
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
                    `UPDATE user 
                     SET password = ?, 
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE slno = ?`,
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
