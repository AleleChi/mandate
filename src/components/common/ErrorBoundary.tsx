import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackTitle?: string;
  fallbackDescription?: string;
  onReset?: () => void;
  // 'page' renders a full-screen fallback for app-level crashes
  variant?: 'section' | 'page';
  // The error state clears when this value changes (e.g. the current route)
  resetKey?: unknown;
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

  public componentDidUpdate(prevProps: Props) {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, error: null });
    }
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

  private handleGoHome = () => {
    if (typeof window !== 'undefined') {
      window.location.assign('/');
    }
  };

  // Plain markup only: the page fallback must not depend on components that could be the source of the crash
  private renderPageFallback() {
    return (
      <div
        className="min-h-screen bg-[#FAF9F6] dark:bg-[#19191A] text-[#18181B] dark:text-[#F0EBE3] flex items-center justify-center px-4 py-12 font-sans antialiased"
        id="error-boundary-page-fallback"
        role="alert"
      >
        <div className="w-full max-w-md bg-[#FFFDF9] dark:bg-[#1D1D1A] border border-[#EBE3D3] dark:border-[#302E29] rounded-[24px] sm:rounded-[32px] p-6 sm:p-10 shadow-[0_18px_45px_rgba(15,23,42,0.04)] dark:shadow-none text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#9A7326] mx-auto">
            <AlertTriangle className="w-8 h-8 stroke-[1.5]" />
          </div>

          <div className="space-y-2">
            <h1 className="type-h1-app text-2xl sm:text-3xl leading-tight tracking-tight">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-[#B8B0A5] leading-relaxed max-w-[340px] mx-auto pt-1">
              {this.props.fallbackDescription || "This page couldn't load. Reloading usually fixes it."}
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={this.handleRefresh}
              className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-medium tracking-wide text-white rounded-xl bg-gradient-to-r from-[#B89047] to-[#C59B27] hover:from-[#A67C2E] hover:to-[#B89047] shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#C59B27] focus:ring-offset-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload page</span>
            </button>
            <button
              type="button"
              onClick={this.handleGoHome}
              className="text-xs font-semibold tracking-wider text-zinc-600 dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] transition-colors cursor-pointer focus:outline-none"
            >
              Go to homepage
            </button>
          </div>
        </div>
      </div>
    );
  }

  public render() {
    if (this.state.hasError && this.props.variant === 'page') {
      return this.renderPageFallback();
    }

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
