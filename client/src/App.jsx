import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider } from '@shopify/polaris';
import en from '@shopify/polaris/locales/en.json';
import { QueryClient, QueryClientProvider } from 'react-query';
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

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
});

function PrivateAdminRoute({ children }) {
  const token = localStorage.getItem('admin_token');
  return token ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppProvider i18n={en}>
        <BrowserRouter>
          <AuthProvider>
            <ShopProvider>
              <Routes>
                {/* Billing — outside AppLayout so it shows without nav */}
                <Route path="/billing" element={<Billing />} />

                {/* Shopify embedded app */}
                <Route path="/" element={<AppLayout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="seo" element={<SEOPage />} />
                  <Route path="sitemap" element={<SitemapPage />} />
                  <Route path="analytics" element={<AnalyticsPage />} />
                  <Route path="ads" element={<AdsPage />} />
                  <Route path="products" element={<Products />} />
                  <Route path="insights" element={<Insights />} />
                  <Route path="connect-google" element={<ConnectGoogle />} />
                  <Route path="settings" element={<ShopSettings />} />
                  <Route path="setup-guide" element={<SetupGuide />} />
                  <Route path="help" element={<Help />} />
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
