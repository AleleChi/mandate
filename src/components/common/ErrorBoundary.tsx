import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Technical details are logged to developer console only
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  private handleRefresh = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          className="p-6 sm:p-8 bg-white border border-[#EAE8E1] rounded-3xl space-y-4 max-w-lg mx-auto my-6 shadow-xs animate-fade-in text-center"
          id="error-boundary-fallback"
        >
          <div className="w-12 h-12 rounded-full bg-amber-50 text-[#C59B27] flex items-center justify-center mx-auto border border-amber-200/60">
            <AlertTriangle className="w-6 h-6 text-[#A47E1F]" />
          </div>

          <div className="space-y-1.5">
            <h3
              className="text-lg font-bold text-[#18181B] tracking-tight"
              style={{ fontFamily: "'Cormorant Garamond', serif" }}
            >
              {this.props.fallbackTitle || "This section couldn't load"}
            </h3>
            <p className="text-xs text-zinc-600 font-sans leading-relaxed max-w-sm mx-auto">
              {this.props.fallbackDescription || "We couldn't open this section right now. Refresh the page and try again."}
            </p>
          </div>

          <div className="flex items-center justify-center gap-2.5 pt-3 border-t border-[#EAE8E1]">
            <button
              type="button"
              onClick={this.handleReset}
              className="px-4 py-2 bg-white border border-[#EAE8E1] hover:bg-zinc-50 text-zinc-700 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={this.handleRefresh}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#18181B] hover:bg-zinc-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Refresh page</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
