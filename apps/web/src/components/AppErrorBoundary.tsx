import { Component, ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: ""
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    const message = error instanceof Error ? error.message : "Unknown render error.";
    return { hasError: true, message };
  }

  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.error("App render failure:", error);
  }

  private handleReset = () => {
    try {
      localStorage.clear();
    } catch {
      // Ignore localStorage reset failures.
    }
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <main
        style={{
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1rem",
          background: "linear-gradient(180deg, #1d2a3f 0%, #1a2638 100%)",
          color: "#e9f1ff",
          fontFamily: 'Inter, "DM Sans", "Segoe UI", Roboto, sans-serif'
        }}
      >
        <section
          style={{
            maxWidth: 760,
            width: "100%",
            border: "1px solid rgba(141, 171, 222, 0.45)",
            borderRadius: 8,
            background: "rgba(34, 48, 70, 0.92)",
            padding: "1rem"
          }}
        >
          <h2 style={{ marginTop: 0 }}>Dashboard render error</h2>
          <p style={{ marginBottom: "0.75rem" }}>
            The UI hit a runtime error and was reset to prevent a blank screen.
          </p>
          <code style={{ display: "block", whiteSpace: "pre-wrap", marginBottom: "0.9rem" }}>{this.state.message}</code>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              minHeight: 34,
              padding: "0.4rem 0.7rem",
              borderRadius: 4,
              border: "1px solid rgba(171, 197, 236, 0.65)",
              background: "#334761",
              color: "#eff6ff",
              cursor: "pointer"
            }}
          >
            Clear local state and reload
          </button>
        </section>
      </main>
    );
  }
}
