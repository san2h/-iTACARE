import { useEffect, useState } from 'react';
import { supabase } from './supabaseConfig';
import { useAuth } from './AuthContext';

// Fonte única da verdade sobre plano: profiles.user_type (banco), nunca metadata do JWT.
export const PREMIUM_TYPES = ['premium', 'premium_user', 'comerciante_premium', 'admin'];

export function usePlan() {
  const { user, loading: authLoading } = useAuth();
  const [userType, setUserType] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.id) {
      setUserType(null);
      setLoading(false);
      return;
    }
    let ativo = true;
    setLoading(true);
    (async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('user_type')
          .eq('id', user.id)
          .maybeSingle();
        if (ativo) setUserType(data?.user_type || 'free');
      } catch {
        if (ativo) setUserType('free');
      } finally {
        if (ativo) setLoading(false);
      }
    })();
    return () => { ativo = false; };
  }, [user?.id, authLoading]);

  return {
    user,
    userType,
    isGuest: !user,
    isPremium: PREMIUM_TYPES.includes(userType),
    isAdmin: userType === 'admin',
    loading: authLoading || loading,
  };
}
