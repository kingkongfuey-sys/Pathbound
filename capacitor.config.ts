// Capacitor settings: app identity, where the built web files live, and system-bar behaviour.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.pathbound',
  appName: 'Pathbound',
  webDir: 'dist',
  // Paper colour, so there is never a white flash before the page paints.
  backgroundColor: '#E1D8B6',
  plugins: {
    SystemBars: {
      // Dark icons on the pale paper; the page reserves its own safe-area padding.
      style: 'LIGHT',
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
    },
  },
};

export default config;
