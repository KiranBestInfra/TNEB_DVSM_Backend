import crypto from 'crypto';

export const generateDeviceFingerprint = (req) => {
    const userAgent = req.headers['user-agent'] || '';
    const ipAddress =
        req.ip ||
        req.connection.remoteAddress ||
        req.socket.remoteAddress ||
        req.headers['x-forwarded-for']?.split(',')[0] ||
        '';
    const acceptLanguage = req.headers['accept-language'] || '';
    const xForwardedFor = req.headers['x-forwarded-for'] || '';

    const fingerprintData = `${userAgent}|${ipAddress}|${acceptLanguage}|${xForwardedFor}`;

    const hash = crypto
        .createHash('sha256')
        .update(fingerprintData)
        .digest('hex');

    return hash;
};


export const validateDeviceFingerprint = (storedFingerprint, req) => {
    const currentFingerprint = generateDeviceFingerprint(req);

    if (storedFingerprint === currentFingerprint) {
        return true;
    }
    const storedParts =
        storedFingerprint.substring(0, 16) +
        storedFingerprint.substring(48, 64);
    const currentParts =
        currentFingerprint.substring(0, 16) +
        currentFingerprint.substring(48, 64);

    const similarity = storedParts === currentParts;

    return similarity;
};
