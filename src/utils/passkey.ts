// Device security and passkey utility
// Adheres strictly to security and wording policies

export interface DevicePasskey {
  id: string;
  deviceName: string;
  createdAt: string;
  lastUsedAt?: string;
}

// Check if WebAuthn is supported on this device
export function isWebAuthnSupported(): boolean {
  return typeof window !== 'undefined' && 
         !!window.navigator?.credentials && 
         typeof window.PublicKeyCredential !== 'undefined';
}

// Generate a random ID for credentials
export function generateMockCredentialId(): string {
  return 'cred_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Base64 helper
export function bufferToBase64URL(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export function base64URLToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}
