import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

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

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        localStorage.removeItem("khata_role");
        localStorage.removeItem("khata_user");
        navigate("/", { replace: true });
        return;
      }

      setAuthorized(true);
    };
    check();
  }, [navigate]);

  if (!authorized) return null;
  return children;
}

export default EmployeeRoute;
