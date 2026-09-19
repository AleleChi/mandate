import React from 'react';
import { LandingEventDetailsSection, LandingEventDetailsSectionProps } from '../common/LandingEventDetailsSection';

export const CurrentEventSection: React.FC<LandingEventDetailsSectionProps> = (props) => {
  return (
    <div id="event-details" className="scroll-mt-24">
      <LandingEventDetailsSection {...props} />
    </div>
  );
};
