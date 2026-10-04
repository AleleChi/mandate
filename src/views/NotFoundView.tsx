import React from 'react';
import { Compass } from 'lucide-react';
import { AuthScreenShell } from '../components/common/AuthScreenShell';
import { Button } from '../components/common/Button';
import { Seo } from '../components/common/Seo';

interface NotFoundViewProps {
  onNavigate: (route: string) => void;
}

export const NotFoundView: React.FC<NotFoundViewProps> = ({ onNavigate }) => {
  return (
    <AuthScreenShell dataViewVersion="not-found-v1" maxWidth="md">
      <Seo title="Page not found | Koinonia Children and Teens" robots="noindex, nofollow" />

      <div className="flex justify-center">
        <div className="w-16 h-16 rounded-full bg-[#C59B27]/10 flex items-center justify-center text-[#9A7326]">
          <Compass className="w-8 h-8 stroke-[1.5]" />
        </div>
      </div>

      <div className="text-center space-y-2">
        <p className="text-xs font-semibold tracking-widest uppercase text-[#9A7326] dark:text-[#D4AF37]">
          Error 404
        </p>
        <h1 className="type-h1-app text-2xl sm:text-3xl text-[#18181B] dark:text-[#F0EBE3] leading-tight tracking-tight">
          Page not found
        </h1>
        <p className="text-sm text-zinc-600 dark:text-[#B8B0A5] leading-relaxed max-w-[340px] mx-auto pt-1">
          The link you followed may be broken, or the page may have moved.
        </p>
      </div>

      <div className="space-y-4">
        <Button variant="primary" fullWidth onClick={() => onNavigate('/')}>
          Go to homepage
        </Button>
        <div className="text-center">
          <button
            type="button"
            onClick={() => onNavigate('/contact')}
            className="text-xs font-semibold tracking-wider text-zinc-600 dark:text-[#B8B0A5] hover:text-[#18181B] dark:hover:text-[#F0EBE3] transition-colors cursor-pointer focus:outline-none"
          >
            Contact us
          </button>
        </div>
      </div>
    </AuthScreenShell>
  );
};
