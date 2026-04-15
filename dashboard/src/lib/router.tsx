/* eslint-disable react-refresh/only-export-components -- route tree registers pages via lazy(); router export is intentional */
import { lazy, Suspense } from 'react';
import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router';
import App from '../App';
import { Layout } from '../components/Layout';
import { Spinner } from '../components/Spinner';

const Home = lazy(() => import('../pages/Home'));
const Devices = lazy(() => import('../pages/Devices'));
const Rooms = lazy(() => import('../pages/Rooms'));
const Automations = lazy(() => import('../pages/Automations'));
const Scenes = lazy(() => import('../pages/Scenes'));
const Notifications = lazy(() => import('../pages/Notifications'));
const Users = lazy(() => import('../pages/Users'));
const Settings = lazy(() => import('../pages/Settings'));
const Setup = lazy(() => import('../pages/Setup'));
const Login = lazy(() => import('../pages/Login'));
const Trust = lazy(() => import('../pages/Trust'));

const rootRoute = createRootRoute({
  component: App,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: () => <Suspense fallback={<Spinner />}><Login /></Suspense>,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: () => <Suspense fallback={<Spinner />}><Setup /></Suspense>,
});

const trustRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trust',
  component: () => <Suspense fallback={<Spinner />}><Trust /></Suspense>,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: '_authenticated',
  beforeLoad: () => {
    if (!localStorage.getItem('token')) {
      throw redirect({ to: '/login' });
    }
  },
  component: () => (
    <Layout>
      <Suspense fallback={<Spinner />}>
        <Outlet />
      </Suspense>
    </Layout>
  ),
});

const homeRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: Home,
});

const devicesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/devices',
  component: Devices,
});

const roomsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/rooms',
  component: Rooms,
});

const automationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/automations',
  component: Automations,
});

const scenesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/scenes',
  component: Scenes,
});

const notificationsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/notifications',
  component: Notifications,
});

const usersRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/users',
  component: Users,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/settings',
  component: Settings,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  trustRoute,
  authenticatedRoute.addChildren([
    homeRoute,
    devicesRoute,
    roomsRoute,
    automationsRoute,
    scenesRoute,
    notificationsRoute,
    usersRoute,
    settingsRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => (
    <div className="flex h-screen items-center justify-center bg-[var(--bg-primary)]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-[var(--text-primary)]">404</h1>
        <p className="mt-2 text-[var(--text-secondary)]">Page not found</p>
      </div>
    </div>
  ),
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
