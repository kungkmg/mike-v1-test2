import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEY = '@arenacore_user';

export type UserData = {
  user_tag: string;
  user_money: number;
  user_avatar: string;
  user_expiry: string;
  is_permanent: boolean;
  is_active: boolean;
};

type UserContextType = {
  user: UserData | null;
  setUser: (u: UserData | null) => void;  // explore.tsx เรียกหลัง login สำเร็จ
  logout: () => Promise<void>;
  isLoading: boolean;
};

const UserContext = createContext<UserContextType>({} as UserContextType);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user,      setUserState] = useState<UserData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // โหลด session จากเครื่องครั้งแรก
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) setUserState(JSON.parse(raw));
    }).finally(() => setIsLoading(false));
  }, []);

  // setUser — บันทึกลง AsyncStorage พร้อมกัน
  const setUser = (u: UserData | null) => {
    setUserState(u);
    if (u) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      AsyncStorage.removeItem(STORAGE_KEY);
    }
  };

  // logout
  const logout = async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    setUserState(null);
  };

  return (
    <UserContext.Provider value={{ user, setUser, logout, isLoading }}>
      {children}
    </UserContext.Provider>
  );
}

export const useUser = () => useContext(UserContext);