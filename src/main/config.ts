import Store from 'electron-store';
import { AppConfig, DEFAULT_CONFIG } from './config-defaults';

// Re-export types + defaults so existing `from './config'` imports keep working.
export * from './config-defaults';

export const config = new Store<AppConfig>({
  name: 'krunker-civilian-config',
  defaults: DEFAULT_CONFIG,
});
