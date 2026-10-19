import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

const ROLE_LEVEL = {
  customer: 1,
  organizer: 2,
  admin: 3,
};

/**
 * ProtectedRoute — redirects to /login if not authenticated,
 * or to / if the user lacks the required role.
 */
export function ProtectedRoute({ children, requiredRole, requiredExactRole, redirectTo = '/login' }) {
  const { isAuthenticated, user, fetchMe, accessToken } = useAuthStore();
  const location = useLocation();
  const [checking, setChecking] = useState(!isAuthenticated && !!accessToken);

  useEffect(() => {
    if (!isAuthenticated && accessToken) {
      fetchMe().finally(() => setChecking(false));
    }
  }, [isAuthenticated, accessToken, fetchMe]);

  if (checking) {
    return (
      <div className="min-h-dvh bg-surface flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  if (requiredRole && user) {
    const userLevel = ROLE_LEVEL[user.role] || 0;
    const requiredLevel = ROLE_LEVEL[requiredRole] || 0;
    if (userLevel < requiredLevel) {
      return <Navigate to="/" replace />;
    }
  }

  if (requiredExactRole && user?.role !== requiredExactRole) {
    return <Navigate to="/" replace />;
  }

  return children;
}

/**
 * GuestRoute — redirects authenticated users away from auth pages.
 */
export function GuestRoute({ children, redirectTo = '/' }) {
  const { isAuthenticated } = useAuthStore();
  if (isAuthenticated) {
    return <Navigate to={redirectTo} replace />;
  }
  return children;
}
