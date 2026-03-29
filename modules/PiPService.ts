import { NativeModules, Platform } from 'react-native';
const { PiPModule } = NativeModules;

const PiPService = {
  enter: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    return await PiPModule?.enter() ?? false;
  },
  isSupported: async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return false;
    return await PiPModule?.isSupported() ?? false;
  },
};

export default PiPService;