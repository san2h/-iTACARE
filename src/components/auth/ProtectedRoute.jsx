import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';
import { usePlan } from '../../lib/usePlan';
import Paywall from '../Paywall';

export const WELCOME_KEY = 'itacare_welcome_seen';

export function welcomeJaVisto() {
  try { return localStorage.getItem(WELCOME_KEY) === '1'; } catch { return true; }
}

/**
 * mode:
 *  - 'public'  : visitante (sem conta) pode ver. Na primeira abertura vai para /welcome.
 *  - 'auth'    : exige login (comportamento original).
 *  - 'premium' : visitante/free vê o Paywall; só Premium acessa.
 */
export default function ProtectedRoute({ mode = 'auth' }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return null;

  const hasOnboarded = user?.user_metadata?.onboarded === true;

  // Visitante
  if (!user) {
    if (mode === 'public') {
      if (location.pathname === '/' && !welcomeJaVisto()) {
        return <Navigate to="/welcome" replace />;
      }
      return <Outlet />;
    }
    if (mode === 'premium') return <PremiumGate />;
    return <Navigate to="/login" replace />;
  }

  // Logado
  if (hasOnboarded && location.pathname === '/onboarding') {
    return <Navigate to="/" replace />;
  }
  if (!hasOnboarded && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  if (mode === 'premium') return <PremiumGate />;
  return <Outlet />;
}

function PremiumGate() {
  const { isPremium, loading } = usePlan();
  if (loading) return null;
  return isPremium ? <Outlet /> : <Paywall />;
}
