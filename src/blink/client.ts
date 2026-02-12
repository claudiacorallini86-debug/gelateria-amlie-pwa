import { createClient } from '@blinkdotnew/sdk';
import { DatabaseSchema } from '../types/database';

/**
 * Blink SDK Client for Gelateria Amélie PWA
 * Configured with managed auth and fallback project ID.
 */
export const blink = createClient({
  projectId: import.meta.env.VITE_BLINK_PROJECT_ID || 'gelateria-amelie-pwa-dqkgydbb',
  publishableKey: import.meta.env.VITE_BLINK_PUBLISHABLE_KEY || 'blnk_pk_ab23174c',
  auth: {
    mode: 'managed'
  }
}) as any;
