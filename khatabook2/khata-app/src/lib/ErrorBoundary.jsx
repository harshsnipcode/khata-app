import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.warn("[ErrorBoundary] Caught:", error, info);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback || (
        <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] p-6 flex items-center justify-center">
          <div className="text-center space-y-3">
            <p className="text-sm font-bold text-[var(--text-secondary)]">Something went wrong</p>
            <button
              onClick={() => window.location.reload()}
              className="bg-[var(--primary)] hover:bg-[var(--primary-hover)] text-white font-black px-5 py-2.5 rounded-xl text-xs uppercase tracking-widest transition cursor-pointer outline-none"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
