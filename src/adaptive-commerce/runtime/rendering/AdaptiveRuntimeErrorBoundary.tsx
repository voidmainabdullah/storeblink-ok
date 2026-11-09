import { Component, type ErrorInfo, type ReactNode } from "react";

export type AdaptiveRuntimeErrorBoundaryProps = Readonly<{
  children: ReactNode;
  onError?: (code: string) => void;
}>;

type AdaptiveRuntimeErrorBoundaryState = Readonly<{ failed: boolean }>;

export class AdaptiveRuntimeErrorBoundary extends Component<
  AdaptiveRuntimeErrorBoundaryProps,
  AdaptiveRuntimeErrorBoundaryState
> {
  state: AdaptiveRuntimeErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): AdaptiveRuntimeErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("[StoreBlink] Adaptive storefront render failed", error, errorInfo);
    this.props.onError?.("ADAPTIVE_STOREFRONT_RENDER_FAILED");
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="sb-adaptive-runtime-error" role="alert">
          <div>
            <p>Store temporarily unavailable</p>
            <h1>We couldn't open this storefront.</h1>
            <p>Please try again shortly. Your cart and account have not been changed.</p>
            <button type="button" onClick={() => window.location.reload()}>Try again</button>
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
