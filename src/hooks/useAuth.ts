import { useState, useEffect } from 'react';
import { blink } from '../blink/client';
import type { BlinkUser } from '@blinkdotnew/sdk';

/**
 * Hook to manage authentication state using Blink Auth.
 */
export function useAuth() {
  const [user, setUser] = useState<BlinkUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = blink.auth.onAuthStateChanged((state) => {
      setUser(state.user);
      setLoading(state.isLoading);
    });

    return () => unsubscribe();
  }, []);

  const login = () => blink.auth.login(window.location.origin);
  const logout = () => blink.auth.signOut();

  return {
    user,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    isAdmin: user?.role === 'admin'
  };
}
