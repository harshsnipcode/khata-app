CREATE TABLE IF NOT EXISTS employee_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present', 'absent', 'paid_leave')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, date)
);

ALTER PUBLICATION supabase_realtime ADD TABLE employee_attendance;
