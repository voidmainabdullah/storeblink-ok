import { Component, type ErrorInfo, type ReactNode } from "react";

type AuthRuntimeErrorBoundaryProps = {
  children: ReactNode;
};

type AuthRuntimeErrorBoundaryState = {
  failed: boolean;
};

export class AuthRuntimeErrorBoundary extends Component<
  AuthRuntimeErrorBoundaryProps,
  AuthRuntimeErrorBoundaryState
> {
  state: AuthRuntimeErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AuthRuntimeErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Authentication runtime initialization failed.", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-background p-6">
        <section
          role="alert"
          className="w-full max-w-md border border-border bg-card p-6 text-card-foreground"
        >
          <h1 className="text-xl font-semibold">Authentication is temporarily unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            StoreBlink could not initialize a secure session. Reload the page to try again.
          </p>
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
            <a
              href="/"
              className="border border-border px-4 py-2 text-sm font-medium"
            >
              Back to home
            </a>
          </div>
        </section>
      </main>
    );
  }
}
