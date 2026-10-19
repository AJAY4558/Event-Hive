import { createBrowserRouter, Navigate, Outlet } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { ProtectedRoute, GuestRoute } from '@/components/ui/ProtectedRoute';

// ── Lazy-loaded pages ─────────────────────────────────────────────────────────
const DiscoverPage  = lazy(() => import('./pages/customer/DiscoverPage.jsx'));
const LoginPage     = lazy(() => import('./pages/customer/LoginPage.jsx'));
const RegisterPage  = lazy(() => import('./pages/customer/RegisterPage.jsx'));
const EventDetailPage = lazy(() => import('./pages/customer/EventDetailPage.jsx'));
const OrganizerDashboardPage = lazy(() => import('./pages/organizer/OrganizerDashboardPage.jsx'));
const EventEditorPage = lazy(() => import('./pages/organizer/EventEditorPage.jsx'));
const VenueManagerPage = lazy(() => import('./pages/organizer/VenueManagerPage.jsx'));
const MyBookingsPage = lazy(() => import('./pages/customer/MyBookingsPage.jsx'));
const EventBookingsPage = lazy(() => import('./pages/organizer/EventBookingsPage.jsx'));
const AdminDashboardPage = lazy(() => import('./pages/admin/AdminDashboardPage.jsx'));

// ── Loading spinner ───────────────────────────────────────────────────────────
function PageLoader() {
  return (
    <div className="min-h-dvh bg-surface flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-full border-2 border-brand-500 border-t-transparent animate-spin" />
        <p className="text-gray-400 text-sm animate-pulse-soft">Loading EventHive…</p>
      </div>
    </div>
  );
}

function Wrap({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

function NotFoundPage() {
  return (
    <div className="min-h-dvh bg-surface flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-display font-bold text-brand-500 mb-4">404</h1>
        <p className="text-gray-400 mb-8">This page doesn&apos;t exist.</p>
        <a href="/" className="btn-primary">Go Home</a>
      </div>
    </div>
  );
}

// ── Router ────────────────────────────────────────────────────────────────────
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Wrap><DiscoverPage /></Wrap>,
  },
  {
    path: '/login',
    element: (
      <GuestRoute>
        <Wrap><LoginPage /></Wrap>
      </GuestRoute>
    ),
  },
  {
    path: '/register',
    element: (
      <GuestRoute>
        <Wrap><RegisterPage /></Wrap>
      </GuestRoute>
    ),
  },
  {
    path: '/events/:eventId',
    element: <Wrap><EventDetailPage /></Wrap>,
  },
  {
    path: '/profile',
    element: (
      <ProtectedRoute requiredExactRole="customer">
        <Wrap><MyBookingsPage /></Wrap>
      </ProtectedRoute>
    ),
  },
  {
    path: '/profile/bookings/:bookingId',
    element: (
      <ProtectedRoute requiredExactRole="customer">
        <Wrap><MyBookingsPage /></Wrap>
      </ProtectedRoute>
    ),
  },
  {
    path: '/organizer',
    element: (
      <ProtectedRoute requiredRole="organizer">
        <Wrap><Outlet /></Wrap>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Wrap><OrganizerDashboardPage /></Wrap>,
      },
      {
        path: 'events/new',
        element: <Wrap><EventEditorPage /></Wrap>,
      },
      {
        path: 'events/:eventId/edit',
        element: <Wrap><EventEditorPage /></Wrap>,
      },
      {
        path: 'events/:eventId/bookings',
        element: <Wrap><EventBookingsPage /></Wrap>,
      },
      {
        path: 'venues',
        element: <Wrap><VenueManagerPage /></Wrap>,
      },
    ],
  },
  {
    path: '/vendor',
    element: <Navigate to="/organizer" replace />,
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute requiredRole="admin">
        <Wrap><Outlet /></Wrap>
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Wrap><AdminDashboardPage /></Wrap>,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
]);
