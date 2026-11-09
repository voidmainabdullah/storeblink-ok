import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

export type SceneRenderErrorBoundaryProps = {
  surfaceName: string;
  children: ReactNode;
  onRetry?: () => void;
  /** Bounded observability hook. Callers must not transmit the error message or stack. */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
};

type SceneRenderErrorBoundaryState = {
  error: Error | null;
  retryKey: number;
};

export class SceneRenderErrorBoundary extends Component<
  SceneRenderErrorBoundaryProps,
  SceneRenderErrorBoundaryState
> {
  state: SceneRenderErrorBoundaryState = { error: null, retryKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<SceneRenderErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[StoreBlink] ${this.props.surfaceName} render failed`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  private retry = () => {
    this.props.onRetry?.();
    this.setState((state) => ({ error: null, retryKey: state.retryKey + 1 }));
  };

  render() {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="grid h-full min-h-64 w-full place-items-center bg-[#202020] p-6 text-white"
        >
          <div className="max-w-md rounded-md border border-[#444] bg-[#2c2c2c] p-5 text-center">
            <h2 className="text-sm font-semibold">{this.props.surfaceName} could not render</h2>
            <p className="mt-2 text-xs leading-5 text-[#b8b8b8]">
              Your document is unchanged. Retry after the invalid asset or recovered data has been validated.
            </p>
            <button
              type="button"
              onClick={this.retry}
              className="mt-4 h-9 rounded bg-[#0178ff] px-4 text-xs font-semibold text-white hover:bg-[#0b86df] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0178ff]"
            >
              Retry preview
            </button>
          </div>
        </div>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
