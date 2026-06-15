-- Employees table to track staff created by admin
-- Stores employee info alongside Supabase auth users

CREATE TABLE IF NOT EXISTS employees (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  auth_id TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER PUBLICATION supabase_realtime ADD TABLE employees;
