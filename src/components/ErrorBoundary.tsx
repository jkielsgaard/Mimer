import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Shows what went wrong instead of a blank window when something in the screen throws while it
 * is drawn. React can only catch such errors in a class component, so this is the one class
 * component in the app (an exception to the "function components only" rule, see DECISIONS.md).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept in the console (and so in the developer tools) for whoever has to look into it.
    console.error("Mimer screen error", error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <main className="flex h-full items-center justify-center bg-background p-8 text-foreground">
        <div role="alert" className="max-w-xl rounded-lg border border-destructive/50 p-6">
          <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm">The screen could not be drawn. Your notes are not affected.</p>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 text-xs">
            {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
          <button
            type="button"
            className="mt-4 rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
            onClick={() => {
              window.location.reload();
            }}
          >
            Reload Mimer
          </button>
        </div>
      </main>
    );
  }
}
