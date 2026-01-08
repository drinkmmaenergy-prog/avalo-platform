// Environment configuration loader
import { firebaseConfig as devConfig, environment as devEnv } from './firebase.dev';
import { firebaseConfig as stagingConfig, environment as stagingEnv } from './firebase.staging';
import { firebaseConfig as productionConfig, environment as productionEnv } from './firebase.production';

export type Environment = 'dev' | 'staging' | 'production';

// Detect environment from process.env or default to dev
export const getCurrentEnvironment = (): Environment => {
  const env = process.env.REACT_APP_ENV || process.env.NODE_ENV || 'dev';
  
  if (env === 'production') return 'production';
  if (env === 'staging') return 'staging';
  return 'dev';
};

// Get the appropriate configuration based on environment
export const getFirebaseConfig = (env?: Environment) => {
  const environment = env || getCurrentEnvironment();
  
  switch (environment) {
    case 'production':
      return productionConfig;
    case 'staging':
      return stagingConfig;
    case 'dev':
    default:
      return devConfig;
  }
};

export const getEnvironmentSettings = (env?: Environment) => {
  const environment = env || getCurrentEnvironment();
  
  switch (environment) {
    case 'production':
      return productionEnv;
    case 'staging':
      return stagingEnv;
    case 'dev':
    default:
      return devEnv;
  }
};

// Export current config and settings
export const firebaseConfig = getFirebaseConfig();
export const environmentSettings = getEnvironmentSettings();
export const currentEnvironment = getCurrentEnvironment();

// Validate that all required environment variables are set
export const validateEnvironment = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];
  const env = getEnvironmentSettings();
  
  if (!firebaseConfig.apiKey) missing.push(`FIREBASE_${env.name.toUpperCase()}_API_KEY`);
  if (!firebaseConfig.appId) missing.push(`FIREBASE_${env.name.toUpperCase()}_APP_ID`);
  
  if (env.name !== 'dev') {
    if (!env.stripe.publishableKey) missing.push(`STRIPE_${env.name === 'production' ? 'LIVE' : 'TEST'}_PUBLISHABLE_KEY`);
    if (!env.ai.openaiKey) missing.push(`OPENAI_${env.name.toUpperCase()}_KEY`);
    if (!env.ai.anthropicKey) missing.push(`ANTHROPIC_${env.name.toUpperCase()}_KEY`);
  }
  
  return {
    valid: missing.length === 0,
    missing
  };
};