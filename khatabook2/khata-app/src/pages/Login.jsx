import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError("");
    setLoading(true);

    const pseudoEmail = `${username}@example.com`;
    const { error } = await supabase.auth.signInWithPassword({
      email: pseudoEmail,
      password,
    });

    if (error) {
      setError("Invalid username or password.");
      setLoading(false);
      return;
    }

    // mark role as employee
    try {
      localStorage.setItem("khata_role", "employee");
      localStorage.setItem("khata_user", username);
    } catch (e) {}

    navigate("/employee/home", { state: { username } });
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-6 relative overflow-hidden select-none">

      <div className="w-full max-w-md card rounded-3xl p-8 shadow-md relative z-10 animate-scale-in">
        <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500 rounded-t-3xl opacity-70" />

        <div className="text-center mb-8">
          <h1 className="text-4xl font-black tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent drop-shadow-[0_2px_10px_rgba(16,185,129,0.1)]">
            KhataBook
          </h1>
          <p className="text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest mt-2">
            Staff Portal
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          {/* Username Field */}
          <div className="space-y-2">
            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full pl-11 pr-4 py-4 rounded-2xl bg-[var(--surface)] border border-[var(--border)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--primary)] transition-all duration-300 text-sm"
                required
              />
            </div>
          </div>

          {/* Password Field */}
          <div className="space-y-2">
            <label className="block text-slate-400 text-[10px] font-bold uppercase tracking-wider pl-1">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-11 pr-4 py-4 rounded-2xl bg-slate-950/40 border border-white/8 hover:border-white/15 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500/50 transition-all duration-300 text-sm focus:bg-slate-950/60 focus:shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                required
              />
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold p-3.5 rounded-xl text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs tracking-widest uppercase transition-all duration-200 active:scale-[0.98] shadow-lg shadow-emerald-500/10 disabled:opacity-50 cursor-pointer outline-none mt-2"
          >
            {loading ? "Authenticating..." : "Login"}
          </button>
        </form>

        <p className="text-center text-xs font-semibold text-slate-400 mt-6 tracking-wide">
          Admin?{" "}
          <a
            href="/admin"
            className="text-emerald-400 hover:text-emerald-300 transition-colors font-bold underline underline-offset-4"
          >
            Login here
          </a>
        </p>
      </div>
    </div>
  );
}

export default Login;
