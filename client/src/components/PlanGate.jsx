import React from 'react';
import { Text, Button, BlockStack, InlineStack } from '@shopify/polaris';
import { useNavigate } from 'react-router-dom';
import { usePlan } from '../hooks/usePlan';

const PLAN_ORDER = { starter: 0, growth: 1, pro: 2 };

const PLAN_COLOR = {
  growth: { bg: '#f4f5fa', border: '#1a1a1a', badge: '#1a1a1a', label: 'Growth Plan' },
  pro:    { bg: '#f4f5fa', border: '#1a1a1a', badge: '#1a1a1a', label: 'Pro Plan' },
};

/**
 * Wraps content that requires a higher plan.
 * Props:
 *   feature   — key from usePlan().features to check (e.g. 'ads')
 *   required  — plan slug required: 'growth' | 'pro'
 *   children  — content to blur/lock when not available
 *   compact   — show inline banner instead of overlay (for buttons/small elements)
 */
export default function PlanGate({ feature, required = 'growth', children, compact = false }) {
  const { can, slug } = usePlan();
  const navigate = useNavigate();
  const qs = window.location.search;

  // If user has access, render children normally
  if (can(feature)) return children;

  const colors = PLAN_COLOR[required] || PLAN_COLOR.growth;

  // Compact mode — just show a small inline badge (for buttons)
  if (compact) {
    return (
      <div
        onClick={() => navigate('/billing' + qs)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 6, cursor: 'pointer',
          background: colors.bg, border: `1px solid ${colors.border}`,
          fontSize: 13, fontWeight: 600, color: colors.badge,
        }}
      >
        🔒 {children} — {colors.label}
      </div>
    );
  }

  // Full overlay mode — blur the content and show upgrade card
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden' }}>
      {/* Blurred background preview */}
      <div style={{ filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none', opacity: 0.6 }}>
        {children}
      </div>

      {/* Upgrade overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(255,255,255,0.88)',
        backdropFilter: 'blur(2px)',
        zIndex: 10,
      }}>
        <div style={{
          textAlign: 'center', padding: '32px 40px',
          background: '#fff', borderRadius: 16,
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
          border: `2px solid ${colors.border}`,
          maxWidth: 380,
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
          <div style={{ fontWeight: 700, fontSize: 17, color: '#202223', marginBottom: 6 }}>
            {colors.label} Required
          </div>
          <div style={{ color: '#6d7175', fontSize: 13, marginBottom: 20, lineHeight: 1.6 }}>
            This feature is not available on your current <strong>{slug}</strong> plan. Upgrade to unlock it.
          </div>
          <button
            onClick={() => navigate('/billing' + qs)}
            style={{
              background: colors.badge, color: '#fff',
              border: 'none', borderRadius: 8, padding: '10px 24px',
              fontWeight: 700, fontSize: 14, cursor: 'pointer',
            }}
          >
            Upgrade to {colors.label} →
          </button>
        </div>
      </div>
    </div>
  );
}
