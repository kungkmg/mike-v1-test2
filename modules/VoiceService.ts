import { NativeModules, Platform } from 'react-native';
const { VoiceServiceModule } = NativeModules;

const VoiceService = {
  start: async (username: string): Promise<void> => {
    if (Platform.OS !== 'android') return;
    await VoiceServiceModule?.start(username);
  },
  stop: async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    await VoiceServiceModule?.stop();
  },
  isRunning: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    return await VoiceServiceModule?.isRunning() ?? false;
  },
  requestOverlayPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    return await VoiceServiceModule?.requestOverlayPermission() ?? false;
  },
  hasOverlayPermission: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true;
    return await VoiceServiceModule?.hasOverlayPermission() ?? false;
  },
  requestBatteryOptimizationExemption: async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    await VoiceServiceModule?.requestBatteryOptimizationExemption();
  },
};

export default VoiceService;