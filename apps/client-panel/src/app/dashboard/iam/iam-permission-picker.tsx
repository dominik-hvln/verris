'use client';

import { useMemo, useState } from 'react';
import { PERMISSION_LABELS } from './constants';
import { IAM_ROLE_PRESETS } from './role-presets';

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
      <div className="flex flex-wrap gap-2">
        {IAM_ROLE_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            title={preset.description}
            onClick={() => applyPreset(preset.permissions)}
            className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-white/30 hover:bg-white/10"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {permissions.map((permission) => (
          <label
            key={permission}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-neutral-300"
          >
            <input
              name="permissions"
              type="checkbox"
              value={permission}
              checked={selected.has(permission)}
              onChange={() => toggle(permission)}
              className="h-4 w-4 accent-white"
            />
            {PERMISSION_LABELS[permission] ?? permission}
          </label>
        ))}
      </div>
      {selected.size === 0 && (
        <p className="text-xs text-amber-400/90">Wybierz co najmniej jedno uprawnienie lub użyj szablonu.</p>
      )}
    </div>
  );
}
