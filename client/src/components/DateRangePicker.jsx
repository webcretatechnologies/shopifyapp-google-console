import React, { useState } from 'react';
import { InlineStack, Button, Text, Box } from '@shopify/polaris';

const PRESETS = [
  { label: '7 Days',  value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '90 Days', value: '90d' },
];

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}
function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return toDateStr(d);
}

/**
 * Props:
 *   period: '7d' | '30d' | '90d' | 'custom'
 *   startDate, endDate: ISO date strings (used when period === 'custom')
 *   onChange({ period, startDate, endDate })
 */
export default function DateRangePicker({ period, startDate, endDate, onChange }) {
  const [showCustom, setShowCustom] = useState(period === 'custom');
  const [localStart, setLocalStart] = useState(startDate || offsetDate(30));
  const [localEnd, setLocalEnd] = useState(endDate || toDateStr(new Date()));

  const selectPreset = (p) => {
    setShowCustom(false);
    onChange({ period: p, startDate: null, endDate: null });
  };

  const applyCustom = () => {
    onChange({ period: 'custom', startDate: localStart, endDate: localEnd });
  };

  return (
    <InlineStack gap="200" blockAlign="center" wrap={false}>
      {/* Preset buttons */}
      {PRESETS.map(p => (
        <Button
          key={p.value}
          size="slim"
          variant={period === p.value ? 'primary' : 'secondary'}
          onClick={() => selectPreset(p.value)}
        >
          {p.label}
        </Button>
      ))}

      {/* Custom toggle */}
      <Button
        size="slim"
        variant={period === 'custom' ? 'primary' : 'secondary'}
        onClick={() => { setShowCustom(v => !v); }}
      >
        Custom Range
      </Button>

      {/* Date inputs — shown when custom is open */}
      {showCustom && (
        <InlineStack gap="200" blockAlign="center">
          <input
            type="date"
            value={localStart}
            max={localEnd}
            onChange={e => setLocalStart(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid #c4cdd5',
              fontSize: 13, color: '#202223', background: '#fff', cursor: 'pointer',
            }}
          />
          <Text variant="bodySm" tone="subdued">to</Text>
          <input
            type="date"
            value={localEnd}
            min={localStart}
            max={toDateStr(new Date())}
            onChange={e => setLocalEnd(e.target.value)}
            style={{
              padding: '5px 10px', borderRadius: 6, border: '1px solid #c4cdd5',
              fontSize: 13, color: '#202223', background: '#fff', cursor: 'pointer',
            }}
          />
          <Button size="slim" variant="primary" onClick={applyCustom}>
            Apply
          </Button>
        </InlineStack>
      )}

      {/* Show active custom range label */}
      {period === 'custom' && !showCustom && (
        <Text variant="bodySm" tone="subdued">
          {startDate} → {endDate}
        </Text>
      )}
    </InlineStack>
  );
}
