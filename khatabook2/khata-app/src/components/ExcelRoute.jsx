import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function ExcelRoute({ children }) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("khata_role");

    if (role === "admin") {
      setAuthorized(true);
      return;
    }

    if (role === "employee") {
      const level = Number(localStorage.getItem("khata_permission_level")) || 1;
      if (level >= 2) {
        setAuthorized(true);
        return;
      }
      navigate("/employee/home", { replace: true });
      return;
    }

    navigate("/", { replace: true });
  }, [navigate]);

  if (!authorized) return null;
  return children;
}

export default ExcelRoute;
