import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use(config => {
  const shop = new URLSearchParams(window.location.search).get('shop') || sessionStorage.getItem('shop');
  if (shop) {
    config.headers['x-shopify-shop-domain'] = shop;
    sessionStorage.setItem('shop', shop);
  }
  const adminToken = localStorage.getItem('admin_token');
  if (adminToken && config.url?.startsWith('/admin')) {
    config.headers['Authorization'] = `Bearer ${adminToken}`;
  }
  return config;
});

api.interceptors.response.use(
  r => r.data,
  err => {
    if (err.response?.status === 401 && window.location.pathname.startsWith('/admin')) {
      localStorage.removeItem('admin_token');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err.response?.data || err);
  }
);

// Analytics API — period OR { startDate, endDate } custom range
export const analyticsApi = {
  overview: () => api.get('/analytics/overview'),
  seoKeywords: (params) => api.get('/analytics/seo/keywords', { params: typeof params === 'string' ? { period: params } : params }),
  seoOverview: (params) => api.get('/analytics/seo/overview', { params: typeof params === 'string' ? { period: params } : params }),
  seoPages: (params) => api.get('/analytics/seo/pages', { params: typeof params === 'string' ? { period: params } : params }),
  seoCountries: (params) => api.get('/analytics/seo/countries', { params: typeof params === 'string' ? { period: params } : params }),
  seoDevices: (params) => api.get('/analytics/seo/devices', { params: typeof params === 'string' ? { period: params } : params }),
  seoSites: () => api.get('/analytics/seo/sites'),
  seoSitemaps: () => api.get('/analytics/seo/sitemaps'),
  submitSitemap: (sitemapUrl) => api.post('/analytics/seo/sitemaps/submit', { sitemapUrl }),
  deleteSitemap: (sitemapUrl) => api.delete('/analytics/seo/sitemaps', { data: { sitemapUrl } }),
  ga4Sessions: (params) => api.get('/analytics/ga4/sessions', { params: typeof params === 'string' ? { period: params } : params }),
  ga4Countries: (params) => api.get('/analytics/ga4/countries', { params: typeof params === 'string' ? { period: params } : params }),
  ga4Pages: (params) => api.get('/analytics/ga4/pages', { params: typeof params === 'string' ? { period: params } : params }),
  ga4Sources: (params) => api.get('/analytics/ga4/sources', { params: typeof params === 'string' ? { period: params } : params }),
  ga4Devices: (params) => api.get('/analytics/ga4/devices', { params: typeof params === 'string' ? { period: params } : params }),
  ga4Ecommerce: (params) => api.get('/analytics/ga4/ecommerce', { params: typeof params === 'string' ? { period: params } : params }),
  adsCampaigns: (params) => api.get('/analytics/ads/campaigns', { params: typeof params === 'string' ? { period: params } : params }),
};

// Google API
export const googleApi = {
  status: () => api.get('/google/status'),
  getConnectUrl: (email) => api.get('/google/connect', { params: email ? { email } : {} }),
  updateSettings: (data) => api.put('/google/settings', data),
  disconnect: () => api.delete('/google/disconnect'),
  searchConsoleSites: () => api.get('/google/search-console-sites'),
  ga4Properties: () => api.get('/google/ga4-properties'),
};

// Billing API
export const billingApi = {
  plans: () => api.get('/billing/plans'),
  subscription: () => api.get('/billing/subscription'),
  subscribe: (plan_id) => api.post('/billing/subscribe', { plan_id }),
};

// Auth API
export const authApi = {
  verify: (shop) => api.get('/auth/verify', { params: { shop } }),
};

// Insights API
export const insightsApi = {
  alerts:        () => api.get('/insights/alerts'),
  productSeo:    () => api.get('/insights/product-seo'),
  seoSuggestions:() => api.get('/insights/seo-suggestions'),
  adsCorrelation:() => api.get('/insights/ads-correlation'),
  syncOrders:    () => api.post('/insights/sync-orders'),
};

// Products API
export const productsApi = {
  list:  (params) => api.get('/products', { params }),
  stats: ()       => api.get('/products/stats'),
  get:   (id)     => api.get(`/products/${id}`),
  sync:  ()       => api.post('/products/sync'),
};

// Shop Settings API
export const settingsApi = {
  get: () => api.get('/settings'),
  save: (data) => api.put('/settings', data),
  clearCredentials: () => api.delete('/settings/credentials'),
};

// Admin API
export const adminApi = {
  login: (email, password) => api.post('/admin/login', { email, password }),
  me: () => api.get('/admin/me'),
  stats: () => api.get('/admin/stats'),
  shops: (params) => api.get('/admin/shops', { params }),
  shop: (id) => api.get(`/admin/shops/${id}`),
  updateShop: (id, data) => api.patch(`/admin/shops/${id}`, data),
  plans: () => api.get('/admin/plans'),
  createPlan: (data) => api.post('/admin/plans', data),
  updatePlan: (id, data) => api.put(`/admin/plans/${id}`, data),
  deletePlan: (id) => api.delete(`/admin/plans/${id}`),
  subscriptions: (params) => api.get('/admin/subscriptions', { params }),
  updateSubscription: (id, data) => api.patch(`/admin/subscriptions/${id}`, data),
  admins: () => api.get('/admin/admins'),
  createAdmin: (data) => api.post('/admin/admins', data),
  updateAdmin: (id, data) => api.patch(`/admin/admins/${id}`, data),
  config: () => api.get('/admin/config'),
  saveConfig: (patch) => api.put('/admin/config', { patch }),
};

// AI Visibility API
export const aiVisibilityApi = {
  settings:        () => api.get('/ai-visibility/settings'),
  saveSettings:    (data) => api.put('/ai-visibility/settings', data),
  latest:          () => api.get('/ai-visibility/latest'),
  history:         () => api.get('/ai-visibility/history'),
  results:         (id) => api.get(`/ai-visibility/runs/${id}/results`),
  defaultPrompts:  () => api.get('/ai-visibility/default-prompts'),
  run:             (data) => api.post('/ai-visibility/run', data || {}),
};

// Site Audit API
export const auditApi = {
  latest:      () => api.get('/audit/latest'),
  history:     () => api.get('/audit/history'),
  storefront:  () => api.get('/audit/storefront'),
  setStorefrontPassword: (password) => api.put('/audit/storefront-password', { password }),
  get:         (id) => api.get(`/audit/${id}`),
  issues:      (id, params) => api.get(`/audit/${id}/issues`, { params }),
  summary:     (id) => api.get(`/audit/${id}/summary`),
  pages:       (id, params) => api.get(`/audit/${id}/pages`, { params }),
  stats:       (id) => api.get(`/audit/${id}/stats`),
  run:         (data) => api.post('/audit/run', data || {}),
  issueTypes:  () => api.get('/audit/issue-types'),
};

export default api;
