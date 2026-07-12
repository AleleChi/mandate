import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
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
    console.error('ErrorBoundary caught an unhandled error:', error, errorInfo);
  }

  private handleReset = () => {
    if (this.props.onReset) {
      this.props.onReset();
    }
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 bg-rose-50/50 border border-rose-200 rounded-3xl space-y-4 max-w-2xl mx-auto my-4 animate-fade-in" id="error-boundary-fallback">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-rose-100 text-rose-700 rounded-2xl shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-zinc-900">
                {this.props.fallbackTitle || 'A non-critical view failed to load'}
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed font-semibold">
                An unexpected error occurred while rendering this feature. The rest of the application remains fully functional.
              </p>
              {this.state.error && (
                <div className="mt-2 p-3 bg-zinc-900/5 text-zinc-700 font-mono text-[10px] rounded-xl overflow-x-auto max-w-full">
                  {this.state.error.toString()}
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-end pt-2 border-t border-rose-100">
            <button
              onClick={this.handleReset}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-900 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 text-rose-700" />
              <span>Retry Component</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
