import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[GhostVault ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[300px] w-full p-6 text-center bg-bgCard/60 border border-borderBase rounded-sm my-4 font-ui">
          <div className="w-12 h-12 rounded-full bg-danger/10 border border-danger/30 flex items-center justify-center text-danger mb-4">
            <AlertTriangle size={24} />
          </div>
          <h3 className="font-display text-base font-bold text-textPrimary tracking-tight mb-1">
            {this.props.title || 'Component Render Error'}
          </h3>
          <p className="text-xs text-textSecondary max-w-md mb-3">
            An unexpected error occurred while rendering this view. Your session and vault data remain fully secure.
          </p>

          {this.state.error?.message && (
            <div className="w-full max-w-md p-2.5 bg-bgBase border border-borderBase rounded text-left font-mono text-[11px] text-danger/90 mb-4 overflow-x-auto select-all">
              {this.state.error.message}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={this.handleReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-accent text-white hover:bg-accentHover transition-colors text-xs font-semibold"
            >
              <RefreshCw size={13} /> Try Again
            </button>
            <button
              onClick={() => { window.location.href = '/dashboard'; }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-bgHover text-textSecondary hover:text-textPrimary border border-borderBase transition-colors text-xs"
            >
              <Home size={13} /> Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
