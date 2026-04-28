import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Popover, Button, DatePicker, TextField, OptionList, Box, Divider, InlineStack,
} from '@shopify/polaris';
import { CalendarIcon } from '@shopify/polaris-icons';

// Standard Shopify-admin preset list
const PRESETS = [
  { id: 'today',  label: 'Today',         days: 0 },
  { id: 'last7',  label: 'Last 7 days',   days: 7 },
  { id: 'last30', label: 'Last 30 days',  days: 30 },
  { id: 'last60', label: 'Last 60 days',  days: 60 },
  { id: 'last90', label: 'Last 90 days',  days: 90 },
  { id: 'last360',label: 'Last 360 days', days: 360 },
];

const fmt = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const iso = (d) => {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date)) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};
const parseIso = (s) => {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d) ? null : d;
};

function presetRange(id) {
  const end = new Date();
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  if (id === 'today') {
    return { start: end, end };
  }
  const p = PRESETS.find(p => p.id === id);
  if (!p) return null;
  start.setDate(end.getDate() - p.days);
  return { start, end };
}

function detectPreset(start, end) {
  if (!start || !end) return 'custom';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const e = new Date(end); e.setHours(0, 0, 0, 0);
  if (e.getTime() !== today.getTime()) return 'custom';
  const diff = Math.round((today - new Date(start)) / 86400000);
  if (diff === 0) return 'today';
  const found = PRESETS.find(p => p.days === diff);
  return found ? found.id : 'custom';
}

/**
 * <DateRangeFilter
 *   value={{ start: Date|ISO, end: Date|ISO }}
 *   onChange={({ start, end, presetId }) => ...}
 * />
 *
 * Matches the Shopify admin date filter pattern: trigger button + popover with
 * preset list on left, calendar + date fields on right, Cancel/Apply at bottom.
 */
export default function DateRangeFilter({ value, onChange, presets, disclosureLabel }) {
  const enabledPresetIds = presets || PRESETS.map(p => p.id);
  const filteredPresets = PRESETS.filter(p => enabledPresetIds.includes(p.id));

  const initialStart = value?.start ? new Date(value.start) : presetRange('last30').start;
  const initialEnd   = value?.end   ? new Date(value.end)   : presetRange('last30').end;

  const [open, setOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(initialStart);
  const [draftEnd,   setDraftEnd]   = useState(initialEnd);
  const [startInput, setStartInput] = useState(iso(initialStart));
  const [endInput,   setEndInput]   = useState(iso(initialEnd));
  const [calMonth,   setCalMonth]   = useState({ month: initialEnd.getMonth(), year: initialEnd.getFullYear() });

  // When the parent value changes externally, sync drafts (only on close)
  useEffect(() => {
    if (open) return;
    if (value?.start) { setDraftStart(new Date(value.start)); setStartInput(iso(value.start)); }
    if (value?.end)   { setDraftEnd(new Date(value.end));     setEndInput(iso(value.end)); }
  }, [value?.start, value?.end, open]);

  const activePreset = useMemo(
    () => detectPreset(draftStart, draftEnd),
    [draftStart, draftEnd]
  );

  const handlePresetSelect = useCallback((selected) => {
    const id = selected[0];
    const r = presetRange(id);
    if (!r) return;
    setDraftStart(r.start);
    setDraftEnd(r.end);
    setStartInput(iso(r.start));
    setEndInput(iso(r.end));
    setCalMonth({ month: r.end.getMonth(), year: r.end.getFullYear() });
  }, []);

  const handleCalChange = useCallback(({ start, end }) => {
    setDraftStart(start);
    setDraftEnd(end);
    setStartInput(iso(start));
    setEndInput(iso(end));
  }, []);

  const handleStartInputChange = useCallback((v) => {
    setStartInput(v);
    const d = parseIso(v);
    if (d) {
      setDraftStart(d);
      setCalMonth({ month: d.getMonth(), year: d.getFullYear() });
    }
  }, []);

  const handleEndInputChange = useCallback((v) => {
    setEndInput(v);
    const d = parseIso(v);
    if (d) setDraftEnd(d);
  }, []);

  const handleApply = useCallback(() => {
    onChange?.({
      start: draftStart,
      end: draftEnd,
      startIso: iso(draftStart),
      endIso: iso(draftEnd),
      presetId: activePreset,
    });
    setOpen(false);
  }, [draftStart, draftEnd, activePreset, onChange]);

  const handleCancel = useCallback(() => {
    if (value?.start) setDraftStart(new Date(value.start));
    if (value?.end)   setDraftEnd(new Date(value.end));
    setStartInput(iso(value?.start));
    setEndInput(iso(value?.end));
    setOpen(false);
  }, [value?.start, value?.end]);

  const triggerLabel = disclosureLabel ?? (
    iso(initialStart) === iso(initialEnd)
      ? fmt(initialStart)
      : `${fmt(initialStart)} – ${fmt(initialEnd)}`
  );

  const activator = (
    <Button
      icon={CalendarIcon}
      onClick={() => setOpen((o) => !o)}
      disclosure={open ? 'up' : 'down'}
    >
      {triggerLabel}
    </Button>
  );

  return (
    <Popover
      active={open}
      activator={activator}
      onClose={handleCancel}
      preferredAlignment="left"
      preferredPosition="below"
      autofocusTarget="none"
      fluidContent
    >
      <Popover.Pane fixed>
        <div style={{
          display: 'flex',
          width: 'min(560px, 92vw)',
          maxWidth: '92vw',
          alignItems: 'stretch',
        }}>
          {/* Preset list */}
          <div style={{
            width: 170, flexShrink: 0,
            borderRight: '1px solid #e1e3e5', padding: 6,
            overflowY: 'auto', maxHeight: 420,
          }}>
            <OptionList
              onChange={handlePresetSelect}
              selected={[activePreset]}
              options={[
                ...filteredPresets.map(p => ({ value: p.id, label: p.label })),
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>

          {/* Calendar + inputs */}
          <div style={{ padding: 14, flex: 1, minWidth: 0 }}>
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label=""
                  labelHidden
                  value={startInput}
                  onChange={handleStartInputChange}
                  autoComplete="off"
                  placeholder="YYYY-MM-DD"
                />
              </div>
              <span style={{ color: '#6d7175', fontSize: 14 }}>→</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <TextField
                  label=""
                  labelHidden
                  value={endInput}
                  onChange={handleEndInputChange}
                  autoComplete="off"
                  placeholder="YYYY-MM-DD"
                />
              </div>
            </InlineStack>

            <Box paddingBlockStart="300">
              <div style={{ width: '100%' }}>
                <DatePicker
                  month={calMonth.month}
                  year={calMonth.year}
                  selected={{ start: draftStart, end: draftEnd }}
                  onMonthChange={(month, year) => setCalMonth({ month, year })}
                  onChange={handleCalChange}
                  allowRange
                />
              </div>
            </Box>

            <Box paddingBlockStart="300">
              <Divider />
              <Box paddingBlockStart="300">
                <InlineStack gap="200" align="end">
                  <Button onClick={handleCancel}>Cancel</Button>
                  <Button variant="primary" onClick={handleApply}>Apply</Button>
                </InlineStack>
              </Box>
            </Box>
          </div>
        </div>
      </Popover.Pane>
    </Popover>
  );
}
