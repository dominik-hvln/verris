import type { ReactNode, SVGProps } from 'react';

export type VerrisIconProps = SVGProps<SVGSVGElement> & { className?: string };

function VerrisIconBase({ children, className, ...props }: VerrisIconProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export function VerrisAntyChmuraIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M7 16 H16 A3.5 3.5 0 0 0 16 9 A5 5 0 0 0 7.5 10.5"/><path d="M4 5 L20 19"/>
    </VerrisIconBase>
  );
}

export function VerrisAutoSkalowanieIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 9 V4 H9 M20 9 V4 H15 M4 15 V20 H9 M20 15 V20 H15"/>
    </VerrisIconBase>
  );
}

export function VerrisBazyDanychIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6 V18 A7 3 0 0 0 19 18 V6"/><path d="M5 12 A7 3 0 0 0 19 12"/>
    </VerrisIconBase>
  );
}

export function VerrisBezpieczenstwoIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M12 3 L19 6 V11 C19 16 16 19 12 21 C8 19 5 16 5 11 V6 Z"/>
    </VerrisIconBase>
  );
}

export function VerrisCronIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M20 12 A8 8 0 1 1 16 5"/><path d="M16 5 H19.5 V8.5"/><path d="M12 9 V12 L14 13.5"/>
    </VerrisIconBase>
  );
}

export function VerrisDnsIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <circle cx="12" cy="5" r="2.2"/><circle cx="5" cy="19" r="2.2"/><circle cx="19" cy="19" r="2.2"/><path d="M12 7.2 V11 M12 11 L6 16.8 M12 11 L18 16.8"/>
    </VerrisIconBase>
  );
}

export function VerrisDomenyIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <circle cx="12" cy="12" r="8"/><path d="M4 12 H20"/><path d="M12 4 C15 7 15 17 12 20 C9 17 9 7 12 4 Z"/>
    </VerrisIconBase>
  );
}

export function VerrisEkoIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M6 18 C6 10 12 6 19 6 C19 13 14 19 6 18 Z"/><path d="M8 16 L15 9"/>
    </VerrisIconBase>
  );
}

export function VerrisEnergiaIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M13 3 L6 13 H11 L10 21 L18 10 H13 Z"/>
    </VerrisIconBase>
  );
}

export function VerrisFtpIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M8 4 V14 M8 14 L5 11 M8 14 L11 11 M16 20 V10 M16 10 L13 13 M16 10 L19 13"/>
    </VerrisIconBase>
  );
}

export function VerrisKopieZapasoweIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M12 4 L20 8 L12 12 L4 8 Z"/><path d="M4 12 L12 16 L20 12"/><path d="M4 16 L12 20 L20 16"/>
    </VerrisIconBase>
  );
}

export function VerrisManagerPlikowIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 7 H9 L11 9 H20 V18 H4 Z"/>
    </VerrisIconBase>
  );
}

export function VerrisPocztaIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <rect x="4" y="6" width="16" height="12" rx="2"/><path d="M4 8 L12 13 L20 8"/>
    </VerrisIconBase>
  );
}

export function VerrisPortfelIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <rect x="4" y="7" width="16" height="11" rx="2"/><path d="M15 11 H20 V15 H15 A2 2 0 0 1 15 11 Z"/>
    </VerrisIconBase>
  );
}

export function VerrisProgramPartnerskiIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M8.2 11 L15.8 7 M8.2 13 L15.8 17"/>
    </VerrisIconBase>
  );
}

export function VerrisSerweryIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <rect x="4" y="5" width="16" height="6" rx="1.6"/><rect x="4" y="14" width="16" height="6" rx="1.6"/><circle cx="7.5" cy="8" r=".6" fill="currentColor"/><circle cx="7.5" cy="17" r=".6" fill="currentColor"/>
    </VerrisIconBase>
  );
}

export function VerrisSkalowanieIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M5 17 A7 7 0 0 1 19 17"/><path d="M12 17 L16 11"/>
    </VerrisIconBase>
  );
}

export function VerrisSslIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11 V8 A4 4 0 0 1 16 8 V11"/>
    </VerrisIconBase>
  );
}

export function VerrisStatystykiIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 20 H20"/><path d="M6 20 V13 M11 20 V7 M16 20 V15 M20.5 20 V10"/>
    </VerrisIconBase>
  );
}

export function VerrisSupportIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M5 13 V11 A7 7 0 0 1 19 11 V13"/><rect x="3.5" y="13" width="3.5" height="6" rx="1.6"/><rect x="17" y="13" width="3.5" height="6" rx="1.6"/><path d="M19 19 A4 4 0 0 1 14 22"/>
    </VerrisIconBase>
  );
}

export function VerrisUptimeIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <circle cx="12" cy="12" r="8"/><path d="M12 8 V12 L15 13.5"/>
    </VerrisIconBase>
  );
}

export function VerrisUstawieniaIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 7 H13 M18 7 H20 M4 12 H8 M13 12 H20 M4 17 H15 M19 17 H20"/><circle cx="15.5" cy="7" r="2.2"/><circle cx="10.5" cy="12" r="2.2"/><circle cx="17" cy="17" r="2.2"/>
    </VerrisIconBase>
  );
}

export function VerrisWzrostIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 20 H20"/><path d="M6 15 L11 10 L14 13 L19 7"/><path d="M15 7 H19 V11"/>
    </VerrisIconBase>
  );
}

export function VerrisZgoszeniaIcon({ className, ...props }: VerrisIconProps) {
  return (
    <VerrisIconBase className={className} {...props}>
      <path d="M4 8 A2 2 0 0 1 6 6 H18 A2 2 0 0 1 20 8 V10 A2 2 0 0 0 20 14 V16 A2 2 0 0 1 18 18 H6 A2 2 0 0 1 4 16 V14 A2 2 0 0 0 4 10 Z"/><path d="M14 7 V17"/>
    </VerrisIconBase>
  );
}
