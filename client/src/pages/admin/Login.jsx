import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Page, Card, FormLayout, TextField, Button, Banner, Text, BlockStack, InlineStack, Box,
} from '@shopify/polaris';
import { useAuth } from '../../context/AuthContext';

export default function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  // Set when the API interceptor or PrivateAdminRoute redirected here after a 401
  const expired = new URLSearchParams(window.location.search).get('expired') === '1';

  const handleSubmit = async () => {
    if (!email || !password) { setError('Email and password are required'); return; }
    setError('');
    try {
      await login(email, password);
      navigate('/admin/dashboard');
    } catch (err) {
      setError(err.error || 'Invalid credentials. Please try again.');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0d1b2a 0%, #1b2838 50%, #0d1b2a 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Logo / Brand */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 56, height: 56, borderRadius: 14, background: '#1a1a1a',
            marginBottom: 16, boxShadow: '0 4px 20px rgba(92,106,196,0.4)',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
          </div>
          <Text variant="headingXl" as="h1" alignment="center">
            <span style={{ color: '#ffffff' }}>Google Console</span>
          </Text>
          <Text variant="bodyMd" alignment="center">
            <span style={{ color: '#8899aa' }}>Super Admin Panel</span>
          </Text>
        </div>

        <Card>
          <Box padding="500">
            <BlockStack gap="400">
              <BlockStack gap="100">
                <Text variant="headingMd">Sign in to your account</Text>
                <Text variant="bodySm" tone="subdued">Enter your admin credentials to continue</Text>
              </BlockStack>

              {expired && !error && (
                <Banner tone="warning">
                  <p>Your session has expired. Please sign in again to continue.</p>
                </Banner>
              )}

              {error && (
                <Banner tone="critical" onDismiss={() => setError('')}>
                  <p>{error}</p>
                </Banner>
              )}

              <FormLayout>
                <TextField
                  label="Email address"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  placeholder="admin@yourdomain.com"
                  autoComplete="email"
                  onKeyDown={handleKeyDown}
                />
                <TextField
                  label="Password"
                  type="password"
                  value={password}
                  onChange={setPassword}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  onKeyDown={handleKeyDown}
                />
              </FormLayout>

              <Button
                variant="primary"
                size="large"
                fullWidth
                onClick={handleSubmit}
                loading={loading}
              >
                Sign In
              </Button>
            </BlockStack>
          </Box>
        </Card>

        <Text variant="bodySm" alignment="center">
          <span style={{ color: '#556677', marginTop: 16, display: 'block' }}>
            Google Console Analytics · Admin v1.0
          </span>
        </Text>
      </div>
    </div>
  );
}
