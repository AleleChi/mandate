import React from 'react';
import { PrivacyPolicyView } from './PrivacyPolicyView';
import { TermsOfServiceView } from './TermsOfServiceView';
import { ChildSafetyView } from './ChildSafetyView';
import { ContactView } from './ContactView';

export interface LegalPagesViewProps {
  page: 'privacy' | 'terms' | 'child-safety' | 'contact';
  onNavigate: (route: string) => void;
}

export const LegalPagesView: React.FC<LegalPagesViewProps> = ({ page, onNavigate }) => {
  switch (page) {
    case 'privacy':
      return <PrivacyPolicyView onNavigate={onNavigate} />;
    case 'terms':
      return <TermsOfServiceView onNavigate={onNavigate} />;
    case 'child-safety':
      return <ChildSafetyView onNavigate={onNavigate} />;
    case 'contact':
      return <ContactView onNavigate={onNavigate} />;
    default:
      return <PrivacyPolicyView onNavigate={onNavigate} />;
  }
};

export default LegalPagesView;
