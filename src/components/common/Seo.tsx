import React, { useEffect } from 'react';

export interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  robots?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogType?: string;
  twitterCard?: string;
  structuredData?: Record<string, any> | Record<string, any>[];
}

/**
 * Reusable SEO component to safely update metadata and headers in a client-side SPA.
 * Fully compliant with role-based visibility guidelines and privacy mandates.
 */
export const Seo: React.FC<SeoProps> = ({
  title,
  description,
  canonical,
  robots = 'noindex, nofollow', // Safe private default
  ogTitle,
  ogDescription,
  ogImage,
  ogType = 'website',
  twitterCard = 'summary_large_image',
  structuredData,
}) => {
  useEffect(() => {
    // 1. Update document title
    document.title = title;

    // Helper to get or create a meta element
    const getOrCreateMeta = (attributeName: string, attributeValue: string): HTMLMetaElement => {
      let element = document.querySelector(`meta[${attributeName}="${attributeValue}"]`) as HTMLMetaElement;
      if (!element) {
        element = document.createElement('meta');
        element.setAttribute(attributeName, attributeValue);
        document.head.appendChild(element);
      }
      return element;
    };

    // Helper to get or create a link element
    const getOrCreateLink = (relValue: string): HTMLLinkElement => {
      let element = document.querySelector(`link[rel="${relValue}"]`) as HTMLLinkElement;
      if (!element) {
        element = document.createElement('link');
        element.setAttribute('rel', relValue);
        document.head.appendChild(element);
      }
      return element;
    };

    // 2. Meta description
    if (description) {
      const metaDesc = getOrCreateMeta('name', 'description');
      metaDesc.setAttribute('content', description);
    } else {
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc) metaDesc.remove();
    }

    // 3. Robots
    const metaRobots = getOrCreateMeta('name', 'robots');
    metaRobots.setAttribute('content', robots);

    // 4. Canonical Link
    if (canonical) {
      const linkCanonical = getOrCreateLink('canonical');
      linkCanonical.setAttribute('href', canonical);
    } else {
      const linkCanonical = document.querySelector('link[rel="canonical"]');
      if (linkCanonical) linkCanonical.remove();
    }

    // 5. Open Graph Meta Tags
    const ogTitleVal = ogTitle || title;
    const ogDescVal = ogDescription || description;

    if (ogTitleVal) {
      const ogTitleMeta = getOrCreateMeta('property', 'og:title');
      ogTitleMeta.setAttribute('content', ogTitleVal);
    }

    if (ogDescVal) {
      const ogDescMeta = getOrCreateMeta('property', 'og:description');
      ogDescMeta.setAttribute('content', ogDescVal);
    }

    if (ogType) {
      const ogTypeMeta = getOrCreateMeta('property', 'og:type');
      ogTypeMeta.setAttribute('content', ogType);
    }

    if (ogImage) {
      const ogImageMeta = getOrCreateMeta('property', 'og:image');
      ogImageMeta.setAttribute('content', ogImage);
    } else {
      const ogImageMeta = document.querySelector('meta[property="og:image"]');
      if (ogImageMeta) ogImageMeta.remove();
    }

    // 6. Twitter Meta Tags
    if (twitterCard) {
      const twitterCardMeta = getOrCreateMeta('name', 'twitter:card');
      twitterCardMeta.setAttribute('content', twitterCard);
    }

    if (ogTitleVal) {
      const twitterTitleMeta = getOrCreateMeta('name', 'twitter:title');
      twitterTitleMeta.setAttribute('content', ogTitleVal);
    }

    if (ogDescVal) {
      const twitterDescMeta = getOrCreateMeta('name', 'twitter:description');
      twitterDescMeta.setAttribute('content', ogDescVal);
    }

    if (ogImage) {
      const twitterImageMeta = getOrCreateMeta('name', 'twitter:image');
      twitterImageMeta.setAttribute('content', ogImage);
    } else {
      const twitterImageMeta = document.querySelector('meta[name="twitter:image"]');
      if (twitterImageMeta) twitterImageMeta.remove();
    }

    // 7. Structured Data (JSON-LD)
    const scriptId = 'seo-structured-data';
    const existingScript = document.getElementById(scriptId);
    if (existingScript) existingScript.remove();

    if (structuredData) {
      const script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      script.innerHTML = JSON.stringify(structuredData);
      document.head.appendChild(script);
    }

    // Cleanup on unmount or update
    return () => {
      // In a SPA, we want to reset or clear some elements when this specific Seo instance is unmounted.
      // However, we can also let the next Seo instance override them.
    };
  }, [
    title,
    description,
    canonical,
    robots,
    ogTitle,
    ogDescription,
    ogImage,
    ogType,
    twitterCard,
    structuredData
  ]);

  return null;
};
