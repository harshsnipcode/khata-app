import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function AdminRoute({ children }) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const role = localStorage.getItem("khata_role");

    if (role !== "admin") {
      if (role === "employee") {
        navigate("/employee/home", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
      return;
    }

    setAuthorized(true);
  }, [navigate]);

  if (!authorized) return null;
  return children;
}

export default AdminRoute;
