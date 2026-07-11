import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { offlineSupabase } from "../lib/offline/offlineSupabase";

function EmployeeRoute({ children }) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const check = async () => {
      const role = localStorage.getItem("khata_role");

      if (role !== "employee") {
        if (role === "admin") {
          navigate("/admin/home", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
        return;
      }

      if (!navigator.onLine) {
        setAuthorized(true);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.removeItem("khata_role");
        localStorage.removeItem("khata_user");
        localStorage.removeItem("khata_permission_level");
        navigate("/", { replace: true });
        return;
      }

      // refresh permission level from DB
      try {
        const username = localStorage.getItem("khata_user");
        if (username) {
          const { data: emp } = await offlineSupabase
            .from("employees")
            .select("permission_level, permissions_enabled")
            .eq("username", username)
            .single();
          if (emp) {
            const level = emp.permissions_enabled ? (emp.permission_level || 1) : 1;
            localStorage.setItem("khata_permission_level", String(level));
          }
        }
      } catch {}

      setAuthorized(true);
    };
    check();
  }, [navigate]);

  if (!authorized) return null;
  return children;
}

export default EmployeeRoute;
