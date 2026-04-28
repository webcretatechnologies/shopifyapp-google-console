import React from 'react';

// Top-level error boundary. Without this, any render-time throw in the React
// tree leaves the user staring at a blank page. With this, they see the
// actual error message + stack — which is what you want during dev and what
// gives the user something to send to support in prod.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('[ErrorBoundary]', error);
    console.error('[ErrorBoundary] component stack:', info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = !import.meta.env || import.meta.env.MODE !== 'production';
    return (
      <div style={{
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        padding: '32px 24px', maxWidth: 720, margin: '40px auto',
        background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, borderRadius: 8, background: '#dc2626', color: '#fff',
            fontSize: 18, fontWeight: 700,
          }}>!</span>
          <h1 style={{ margin: 0, fontSize: 18, color: '#7f1d1d' }}>Something went wrong</h1>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#7f1d1d' }}>
          The page failed to render. Try reloading; if it persists, share the message below.
        </p>
        <div style={{
          background: '#fff', border: '1px solid #fecaca', borderRadius: 8,
          padding: 12, fontSize: 13, color: '#991b1b', fontFamily: 'monospace',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto', maxHeight: 240,
        }}>
          {String(this.state.error?.message || this.state.error || 'Unknown error')}
        </div>
        {isDev && this.state.info?.componentStack && (
          <details style={{ marginTop: 12, fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: '#991b1b' }}>Component stack</summary>
            <pre style={{
              background: '#fff', border: '1px solid #fecaca', borderRadius: 8,
              padding: 12, fontSize: 11, color: '#991b1b', overflow: 'auto', marginTop: 8,
            }}>{this.state.info.componentStack}</pre>
          </details>
        )}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button onClick={() => location.reload()} style={{
            background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: 6,
            padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}>Reload page</button>
          <button onClick={() => this.setState({ error: null, info: null })} style={{
            background: '#fff', color: '#1a1a1a', border: '1px solid #ccc', borderRadius: 6,
            padding: '8px 14px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}>Try again</button>
        </div>
      </div>
    );
  }
}
