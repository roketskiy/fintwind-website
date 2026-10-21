CREATE TABLE IF NOT EXISTS daily_activity (
    day TEXT NOT NULL,
    installation_hash TEXT NOT NULL,
    PRIMARY KEY (day, installation_hash)
) WITHOUT ROWID;

CREATE VIEW IF NOT EXISTS daily_active_users AS
SELECT day, COUNT(*) AS dau FROM daily_activity GROUP BY day;
