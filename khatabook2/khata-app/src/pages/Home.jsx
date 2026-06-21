import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Login from "./Login";

function Home() {
  const navigate = useNavigate();

  useEffect(() => {
    let role = null;
    try { role = localStorage.getItem("khata_role"); } catch {}

    if (role === "admin") {
      navigate("/admin/home", { replace: true });
    } else if (role === "employee") {
      navigate("/employee/home", { replace: true });
    }
    // No role — stay on this route (render Login below)
  }, [navigate]);

  const role = (() => { try { return localStorage.getItem("khata_role"); } catch { return null; } })();

  if (role === "admin" || role === "employee") return null;

  return <Login />;
}

export default Home;