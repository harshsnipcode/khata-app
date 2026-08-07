-- Add 'half_day' as a valid attendance status.
-- Run this in the Supabase SQL editor before using Half Day attendance.
ALTER TABLE employee_attendance DROP CONSTRAINT IF EXISTS employee_attendance_status_check;
ALTER TABLE employee_attendance ADD CONSTRAINT employee_attendance_status_check
  CHECK (status IN ('present', 'absent', 'paid_leave', 'half_day'));
