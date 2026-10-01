-- Create extensions in default database
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create test database if it doesn't already exist
SELECT 'CREATE DATABASE talentpulse_test'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'talentpulse_test')\gexec

-- Connect to test database and enable vector extension
\c talentpulse_test
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Back to talentpulse default database
\c talentpulse

-- Create read-only role for safe Text-to-SQL
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'tp_readonly') THEN
    CREATE ROLE tp_readonly WITH LOGIN PASSWORD 'tp_readonly';
  END IF;
END $$;

-- Revoke default public permissions from tp_readonly
REVOKE ALL ON SCHEMA public FROM tp_readonly;
GRANT USAGE ON SCHEMA public TO tp_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM tp_readonly;
