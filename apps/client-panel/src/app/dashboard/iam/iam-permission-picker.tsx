'use client';

import { useMemo, useState } from 'react';
import { PERMISSION_DESCRIPTIONS, PERMISSION_LABELS } from './constants';
import { IAM_ROLE_PRESETS } from './role-presets';
import { Checkbox } from '@/components/panel/checkbox';

export function IamPermissionPicker({
  permissions,
  defaultSelected = [],
}: {
  permissions: string[];
  defaultSelected?: string[];
}) {
  const initial = useMemo(
    () => new Set(defaultSelected.filter((p) => permissions.includes(p))),
    [defaultSelected, permissions],
  );
  const [selected, setSelected] = useState(initial);

  const toggle = (permission: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const applyPreset = (presetPermissions: readonly string[]) => {
    setSelected(new Set(presetPermissions.filter((p) => permissions.includes(p))));
  };

  return (
    <div className="space-y-4">
      {/* P3-05 — opis szablonu widoczny na stałe (wcześniej tylko w dymku `title`). */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {IAM_ROLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => applyPreset(preset.permissions)}
            className="rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-left transition hover:border-white/30 hover:bg-white/10"
          >
            <span className="block text-xs font-medium text-neutral-200">{preset.label}</span>
            <span className="mt-0.5 block text-[12px] leading-snug text-neutral-400">{preset.description}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {permissions.map((permission) => (
          <label
            key={permission}
            className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300"
          >
            <Checkbox
              name="permissions"
              value={permission}
              checked={selected.has(permission)}
              onChange={() => toggle(permission)}
              className="mt-0.5 h-4 w-4 accent-white"
            />
            <span>
              <span className="block">{PERMISSION_LABELS[permission] ?? permission}</span>
              {PERMISSION_DESCRIPTIONS[permission] ? (
                <span className="mt-0.5 block text-[12px] leading-snug text-neutral-500">{PERMISSION_DESCRIPTIONS[permission]}</span>
              ) : null}
            </span>
          </label>
        ))}
      </div>
      {selected.size === 0 && (
        <p className="text-xs text-amber-400/90">Wybierz co najmniej jedno uprawnienie lub użyj szablonu.</p>
      )}
    </div>
  );
}
