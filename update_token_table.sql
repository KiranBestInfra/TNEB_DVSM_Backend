-- Add ip_address column to refresh_tokens table
ALTER TABLE refresh_tokens 
ADD COLUMN ip_address VARCHAR(50) NULL AFTER expires_at;

-- Add device_fingerprint column for enhanced security
ALTER TABLE refresh_tokens 
ADD COLUMN device_fingerprint VARCHAR(255) NULL AFTER ip_address;

-- Add a composite unique key on user_id and device_fingerprint to allow only one token per user per device
ALTER TABLE refresh_tokens
DROP INDEX IF EXISTS user_id;

ALTER TABLE refresh_tokens
ADD UNIQUE INDEX user_device_unique (user_id, device_fingerprint); 