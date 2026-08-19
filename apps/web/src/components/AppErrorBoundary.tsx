import { Component, ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown dashboard render error."
    };
  }

  componentDidCatch(error: unknown) {
    // Keep the stack in console so local debugging still has details.
    console.error("Dashboard render error", error);
  }

  private clearLocalStateAndReload() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("trader-ui-state"))
      .forEach((key) => localStorage.removeItem(key));
    window.location.reload();
  }

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
          color: "#e9f1ff"
        }}
      >
        <section
          style={{
            width: "min(680px, 95vw)",
            border: "1px solid #415674",
            borderRadius: "6px",
            padding: "1rem",
            background: "#243247"
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.2rem" }}>Dashboard render error</h1>
          <p style={{ marginTop: "0.6rem", color: "#b6c5de" }}>
            The UI hit a runtime error and stopped rendering. You can clear local UI state and reload safely.
          </p>
          {this.state.message && (
            <pre
              style={{
                margin: "0.8rem 0",
                padding: "0.7rem",
                borderRadius: "4px",
                border: "1px solid rgba(181, 202, 236, 0.3)",
                background: "#202d42",
                color: "#d8e7ff",
                whiteSpace: "pre-wrap"
              }}
            >
              {this.state.message}
            </pre>
          )}
          <button type="button" onClick={() => this.clearLocalStateAndReload()}>
            Clear local state and reload
          </button>
        </section>
      </main>
    );
  }
}
