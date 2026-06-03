import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; label?: string; }
interface State { error: Error | null; }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: any) {
    console.error(`[ErrorBoundary:${this.props.label ?? 'app'}]`, error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          padding: '20px 24px',
          background: 'rgba(239,68,68,0.07)',
          border: '1px solid rgba(239,68,68,0.25)',
          borderRadius: 10,
          margin: 8,
        }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--red)', marginBottom: 6 }}>
            Render error {this.props.label ? `in ${this.props.label}` : ''}
          </div>
          <pre style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'pre-wrap', margin: 0 }}>
            {this.state.error.message}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{ marginTop: 12, fontSize: 12, padding: '4px 12px',
              background: 'var(--surface2)', border: '1px solid var(--border2)', color: 'var(--muted)' }}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
