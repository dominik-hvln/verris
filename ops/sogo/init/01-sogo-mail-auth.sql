-- Web login for SOGo (IMAP still uses Dovecot). Synced from API on create/reset IMAP password.
CREATE TABLE IF NOT EXISTS sogo_mail_auth (
  c_uid VARCHAR(255) NOT NULL PRIMARY KEY,
  c_name VARCHAR(255) NOT NULL,
  c_password VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE OR REPLACE VIEW sogo_auth_view AS
  SELECT
    c_uid,
    c_name,
    c_password,
    c_uid AS mail,
    c_name AS cn
  FROM sogo_mail_auth;
