import { WhatsAppProvider, WhatsAppProviderName } from './types';
import { TwilioWhatsAppProvider } from './twilioProvider';
import { MetaWhatsAppProvider } from './metaProvider';
import { SimulatedWhatsAppProvider } from './simulatedProvider';

export * from './types';
export * from './consent';
export * from './queue';
export { TwilioWhatsAppProvider } from './twilioProvider';
export { MetaWhatsAppProvider } from './metaProvider';
export { SimulatedWhatsAppProvider } from './simulatedProvider';
export { normalizePhoneNumberToE164, resolveParentWhatsAppCandidate } from '../../utils/phone';

let cachedProvider: WhatsAppProvider | null = null;
let cachedProviderName: WhatsAppProviderName | null = null;

export function getWhatsAppProvider(): WhatsAppProvider {
  const configured = (process.env.WHATSAPP_PROVIDER || 'simulated').toLowerCase() as WhatsAppProviderName;

  if (cachedProvider && cachedProviderName === configured) {
    return cachedProvider;
  }

  if (configured === 'twilio') {
    cachedProvider = new TwilioWhatsAppProvider();
  } else if (configured === 'meta') {
    cachedProvider = new MetaWhatsAppProvider();
  } else {
    cachedProvider = new SimulatedWhatsAppProvider();
  }

  cachedProviderName = configured;
  return cachedProvider;
}
