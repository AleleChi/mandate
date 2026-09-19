import React from 'react';
import { LandingVideoSection as CommonLandingVideoSection, LandingVideoSectionProps } from '../common/LandingVideoSection';

export const LandingVideoSection: React.FC<LandingVideoSectionProps> = (props) => {
  return (
    <div id="video" className="scroll-mt-20">
      <CommonLandingVideoSection {...props} />
    </div>
  );
};
