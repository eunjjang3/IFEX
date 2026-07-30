import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RefreshCw, TriangleAlert } from 'lucide-react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('IFEX render failure:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
        <section className="w-full max-w-xl border border-rose-500/40 bg-card/40 p-6">
          <TriangleAlert className="h-6 w-6 text-rose-400" />
          <h1 className="mt-4 font-serif text-2xl font-bold">IFEX could not render this analysis</h1>
          <p className="mt-2 font-sans text-sm leading-relaxed text-muted-foreground">
            The file remains local. Reload the app to clear the failed in-memory session and start again.
          </p>
          <pre className="mt-4 max-h-28 overflow-auto border border-border bg-background/60 p-3 font-mono text-[11px] text-rose-300">
            {this.state.error.message || 'Unknown rendering error'}
          </pre>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-5 inline-flex items-center gap-2 border border-border px-3 py-2 font-sans text-xs hover:border-gold hover:text-gold"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Reload IFEX
          </button>
        </section>
      </main>
    );
  }
}
