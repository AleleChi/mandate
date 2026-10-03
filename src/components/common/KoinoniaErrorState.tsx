import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface KoinoniaErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
}

export const KoinoniaErrorState: React.FC<KoinoniaErrorStateProps> = ({
  title = 'We could not load this information',
  description = 'Please check your connection and try again.',
  onRetry,
  className = ''
}) => {
  return (
    <div
      className={`bg-white border border-red-100/80 rounded-2xl p-6 text-center space-y-3 ${className}`}
      role="alert"
      data-component-version="koinonia-error-state-v1"
    >
      <div className="mx-auto w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center border border-red-100">
        <AlertCircle className="w-5 h-5" />
      </div>
      <div className="space-y-1 max-w-sm mx-auto">
        <h3 className="font-medium text-sm text-zinc-900 font-sans">
          {title}
        </h3>
        <p className="text-xs text-zinc-500 font-normal">
          {description}
        </p>
      </div>
      {onRetry && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-xl text-xs font-medium transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 text-zinc-500" />
            <span>Try again</span>
          </button>
        </div>
      )}
    </div>
  );
};
