import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UserStore {
  name: string;
  setName: (name: string) => void;
}

export const useUserStore = create<UserStore>()(
  persist(
    (set) => ({
      name: '',
      setName: (name) => set({ name }),
    }),
    {
      name: 'user-storage',
    }
  )
);