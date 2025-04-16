import crypto from 'crypto';

export const generateDeviceFingerprint = (req, res) => {
    if (req.cookies && req.cookies.deviceFingerprint) {
        return req.cookies.deviceFingerprint;
    }

    const userAgent = req.headers['user-agent'] || '';
    const acceptLanguage = req.headers['accept-language'] || '';

    const fingerprintData = `${userAgent}|${acceptLanguage}`;

    const fingerprint = crypto
        .createHash('sha256')
        .update(fingerprintData)
        .digest('hex');

    return fingerprint;
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
