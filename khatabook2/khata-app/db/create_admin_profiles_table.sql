-- Create admin_profiles table for multi-admin support
-- Each row represents an administrator account with full access.
CREATE TABLE IF NOT EXISTS admin_profiles (
  id SERIAL PRIMARY KEY,
  profile_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
