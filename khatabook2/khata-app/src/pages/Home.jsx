import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    let role = null;
    try { role = localStorage.getItem("khata_role"); } catch {}

    if (role === "admin") {
      navigate("/admin/home", { replace: true });
    } else if (role === "employee") {
      navigate("/employee/home", { replace: true });
    } else {
      // Not logged in — send to login
      navigate("/", { replace: true });
    }
  }, [navigate]);

  // Nothing is rendered — the redirect happens immediately
  return null;
}

export default Home;