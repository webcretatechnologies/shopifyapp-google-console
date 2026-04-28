import React, { useState } from 'react';
import { InlineStack, Text } from '@shopify/polaris';

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

const segBtnBase = {
  border: 'none',
  borderRadius: 8,
  padding: '6px 14px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  lineHeight: 1.4,
  transition: 'background 120ms ease, color 120ms ease',
};
const segBtnSelected = {
  ...segBtnBase,
  background: '#1a1a1a',
  color: '#ffffff',
  boxShadow: '0 0 0 1px #1a1a1a inset',
};
const segBtnUnselected = {
  ...segBtnBase,
  background: '#ffffff',
  color: '#303030',
  boxShadow: '0 0 0 1px #cccccc inset, 0 -1px 0 0 #b5b5b5 inset',
};

function SegButton({ selected, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={selected ? segBtnSelected : segBtnUnselected}
    >
      {children}
    </button>
  );
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
      {PRESETS.map(p => (
        <SegButton
          key={p.value}
          selected={period === p.value}
          onClick={() => selectPreset(p.value)}
        >
          {p.label}
        </SegButton>
      ))}

      <SegButton
        selected={period === 'custom'}
        onClick={() => { setShowCustom(v => !v); }}
      >
        Custom Range
      </SegButton>

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
          <SegButton selected onClick={applyCustom}>Apply</SegButton>
        </InlineStack>
      )}

      {period === 'custom' && !showCustom && (
        <Text variant="bodySm" tone="subdued">
          {startDate} → {endDate}
        </Text>
      )}
    </InlineStack>
  );
}
