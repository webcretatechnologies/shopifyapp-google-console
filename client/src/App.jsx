import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, Spinner } from '@shopify/polaris';
import en from '@shopify/polaris/locales/en.json';
import { QueryClient, QueryClientProvider } from 'react-query';
import { adminApi } from './api';
import { AuthProvider } from './context/AuthContext';
import { ShopProvider } from './context/ShopContext';

// Shopify app pages
import Dashboard from './pages/Dashboard';
import SEOPage from './pages/seo/SEOPage';
import AnalyticsPage from './pages/analytics/AnalyticsPage';
import AdsPage from './pages/ads/AdsPage';
import ConnectGoogle from './pages/ConnectGoogle';
import ShopSettings from './pages/ShopSettings';
import SetupGuide from './pages/SetupGuide';
import Billing from './pages/Billing';
import Products from './pages/Products';
import Insights from './pages/Insights';
import Help from './pages/Help';
import SitemapPage from './pages/SitemapPage';
import SiteAudit from './pages/SiteAudit';
import AIVisibility from './pages/AIVisibility';
import ContentTools from './pages/ContentTools';
import AppLayout from './components/Layout/AppLayout';

// Admin pages
import AdminLogin from './pages/admin/Login';
import AdminLayout from './components/Layout/AdminLayout';
import AdminDashboard from './pages/admin/Dashboard';
import AdminShops from './pages/admin/Shops';
import AdminPlans from './pages/admin/Plans';
import AdminSubscriptions from './pages/admin/Subscriptions';
import AdminAdmins from './pages/admin/Admins';
import AdminSettings from './pages/admin/Settings';
import AdminEmailTemplates from './pages/admin/EmailTemplates';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
});

// Verify the admin JWT on mount (not just check existence) so an expired token
// doesn't briefly mount the layout, fire 401s, then bounce — that's what was
// causing the "sometimes the panel opens, sometimes blank" reports.
function PrivateAdminRoute({ children }) {
  const token = localStorage.getItem('admin_token');
  // 'pending' | 'ok' | 'expired'
  const [authState, setAuthState] = useState(token ? 'pending' : 'expired');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    adminApi.me()
      .then(() => { if (!cancelled) setAuthState('ok'); })
      .catch(() => {
        if (cancelled) return;
        // Token invalid/expired — clear it so we go to login cleanly
        localStorage.removeItem('admin_token');
        setAuthState('expired');
      });
    return () => { cancelled = true; };
  }, [token]);

  if (authState === 'pending') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '60vh', flexDirection: 'column', gap: 12,
      }}>
        <Spinner accessibilityLabel="Verifying session" size="large" />
        <span style={{ fontSize: 13, color: '#6d7175' }}>Verifying session…</span>
      </div>
    );
  }
  if (authState === 'expired') {
    return <Navigate to="/admin/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider i18n={en}>
        <BrowserRouter>
          <AuthProvider>
            <ShopProvider>
              <Routes>
                {/* Shopify embedded app */}
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="seo" element={<SEOPage />} />
                  <Route path="site-audit" element={<SiteAudit />} />
                  <Route path="ai-visibility" element={<AIVisibility />} />
                  <Route path="content" element={<ContentTools />} />
                  <Route path="sitemap" element={<SitemapPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="ads" element={<AdsPage />} />
                  <Route path="products" element={<Products />} />
                  <Route path="insights" element={<Insights />} />
                  <Route path="connect-google" element={<ConnectGoogle />} />
                  <Route path="settings" element={<ShopSettings />} />
                  <Route path="setup-guide" element={<SetupGuide />} />
                  <Route path="help" element={<Help />} />
                  <Route path="billing" element={<Billing />} />
                </Route>

                {/* Super Admin Panel */}
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin" element={
                  <PrivateAdminRoute><AdminLayout /></PrivateAdminRoute>
                }>
                  <Route index element={<Navigate to="/admin/dashboard" replace />} />
                  <Route path="dashboard" element={<AdminDashboard />} />
                  <Route path="shops" element={<AdminShops />} />
                  <Route path="plans" element={<AdminPlans />} />
                  <Route path="subscriptions" element={<AdminSubscriptions />} />
                  <Route path="admins" element={<AdminAdmins />} />
                  <Route path="email-templates" element={<AdminEmailTemplates />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
              </Routes>
            </ShopProvider>
          </AuthProvider>
        </BrowserRouter>
      </AppProvider>
    </QueryClientProvider>
  );
}
