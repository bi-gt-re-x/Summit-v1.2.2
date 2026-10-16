/**
 * The last thing between a thrown error and a white screen.
 *
 * React 19 unmounts the whole tree when a render throws and nothing catches
 * it. Without a boundary anywhere in this app, one bad date, one null field on
 * one panel, took the rail, the top bar and every other page with it — and
 * left nothing on screen to say so or to get back from. The reader's only
 * recovery was to know to reload.
 *
 * ## Where it sits, and why there are two
 *
 * `<AppBoundary>` wraps the router in App.tsx, so a throw inside any page is
 * caught with the rail and the top bar still rendered around it: the reader
 * loses the page they were on and keeps the app they were in. That is the
 * whole reason it is inside the shell rather than around it.
 *
 * `<RootBoundary>` wraps everything in main.tsx and catches what is left — a
 * provider failing, the shell itself throwing — where there is no app to keep,
 * so it draws a full-page apology instead.
 *
 * ## Resetting
 *
 * "Try again" clears the error and re-renders the same subtree. That is worth
 * offering because a good share of these are transient — a response that
 * arrived half-written, a race between two states — and re-rendering is
 * genuinely enough. `resetKey` does the same automatically: App.tsx passes the
 * current path, so navigating away from a page that threw clears it rather
 * than pinning the error over the route the reader just chose.
 *
 * ## What it does not do
 *
 * It does not report anywhere. There is no error service in this app and
 * inventing one here would be a networking decision made inside a render
 * boundary. `componentDidCatch` logs to the console with the component stack,
 * which is what a developer sitting in front of it needs; wiring it to
 * something remote is a change to this one method.
 *
 * A boundary catches renders, lifecycles and constructors — not event handlers
 * and not rejected promises. `useApi` already routes async failures into
 * `ErrorState`, which is the right place for them: a fetch that failed is
 * information about the data, not about the code.
 */
import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import '@/styles/page-state.css';

interface Props {
  children: ReactNode;
  /** Changing this clears a caught error. App.tsx passes the current path. */
  resetKey?: string;
  /** `page` keeps the app shell around the message; `root` replaces the screen. */
  variant?: 'page' | 'root';
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(previous: Props) {
    // The route changed under a caught error. Clearing it here rather than
    // making the caller remount by key, so the boundary's own identity — and
    // anything React has memoised beneath it — survives an ordinary navigation.
    if (this.state.error && previous.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // The component stack is the half a stack trace does not give you, and it
    // is the half that says which panel threw.
    console.error('Unhandled error in', info.componentStack, error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const root = this.props.variant === 'root';
    return (
      <div className={`page-state page-state-crash${root ? ' is-root' : ''}`} role="alert">
        <h2>{root ? 'Summit hit a problem.' : 'This page hit a problem.'}</h2>
        <p>
          {root
            ? 'Something went wrong before the app finished loading. Reloading usually clears it.'
            : 'The rest of the app is fine. Just this screen broke.'}
        </p>

        {/* The message, not the stack. It is occasionally the useful thing
            ("Cannot read properties of null"), it is never long, and a reader
            reporting a problem can quote it. The stack is in the console. */}
        <code className="page-state-detail">{error.message || String(error)}</code>

        <div className="page-state-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={this.reset}>
            Try again
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => window.location.reload()}
          >
            Reload the app
          </button>
        </div>
      </div>
    );
  }
}

/** Around the router: a page fails, the rail and top bar stay. */
export function AppBoundary({ children, resetKey }: { children: ReactNode; resetKey?: string }) {
  return (
    <ErrorBoundary variant="page" resetKey={resetKey}>
      {children}
    </ErrorBoundary>
  );
}

/** Around everything: the shell itself failed, so there is nothing to keep. */
export function RootBoundary({ children }: { children: ReactNode }) {
  return <ErrorBoundary variant="root">{children}</ErrorBoundary>;
}
