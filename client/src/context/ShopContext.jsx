import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi, googleApi, billingApi } from '../api';

const ShopContext = createContext(null);

export function ShopProvider({ children }) {
  const [shopData, setShopData]       = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading]         = useState(true);
  const initialized = useRef(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Skip admin routes — they have their own auth
    if (location.pathname.startsWith('/admin')) {
      setLoading(false);
      return;
    }

    // Only run the full init once per page load
    if (initialized.current) return;
    initialized.current = true;

    const params = new URLSearchParams(window.location.search);
    const shop = params.get('shop') || sessionStorage.getItem('shop');

    if (!shop) {
      setLoading(false);
      return;
    }

    sessionStorage.setItem('shop', shop);

    const load = async () => {
      try {
        const auth = await authApi.verify(shop);
        setShopData(auth);

        if (!auth?.installed) {
          window.top.location.href = `${window.location.origin}/api/auth/install?shop=${shop}`;
          return;
        }

        // Load google status and subscription in parallel
        // Use sentinel { _error: true } so we can tell apart "API failed" vs "null response"
        const [googleResult, subResult] = await Promise.all([
          googleApi.status().catch(() => ({ _error: true })),
          billingApi.subscription().catch(() => ({ _error: true })),
        ]);

        if (!googleResult?._error) setGoogleStatus(googleResult);

        const subFailed = !!subResult?._error;
        const sub = subFailed ? null : subResult;
        setSubscription(sub);

        const onBillingPage = location.pathname === '/billing';
        const hasActiveSub = sub && ['active', 'trial'].includes(sub.status);

        // Redirect to billing only when we got a real API response confirming no active plan
        // (if the API call itself failed, leave the user where they are)
        if (!onBillingPage && !subFailed && !hasActiveSub) {
          navigate(`/billing${window.location.search}`);
        }

        // If already on billing page but subscription is active, go to dashboard
        if (onBillingPage && hasActiveSub) {
          navigate(`/${window.location.search}`);
        }
      } catch (err) {
        console.error('ShopContext load error:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [location.pathname]);

  const refreshGoogleStatus = async () => {
    try {
      const status = await googleApi.status();
      setGoogleStatus(status);
    } catch {
      // keep existing state on error
    }
  };

  // Re-check google status whenever the tab becomes visible again
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && initialized.current) {
        refreshGoogleStatus();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  const refreshSubscription = async () => {
    try {
      const sub = await billingApi.subscription();
      setSubscription(sub);
      return sub;
    } catch {
      return null;
    }
  };

  return (
    <ShopContext.Provider value={{ shopData, googleStatus, subscription, loading, refreshGoogleStatus, refreshSubscription }}>
      {children}
    </ShopContext.Provider>
  );
}

export const useShop = () => useContext(ShopContext);
