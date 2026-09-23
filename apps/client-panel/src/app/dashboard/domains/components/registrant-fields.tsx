'use client';

import { Input } from '@verris/ui';
import type { Abonent } from '../actions';

export const PUSTY_ABONENT: Abonent = {
  firstName: '', lastName: '', companyName: '', vat: '', street: '', houseNumber: '', zipcode: '',
  city: '', country: 'PL', phoneCountryCode: '+48', phone: '', email: '',
};

/** Brakujące pola wymagane — ten sam zestaw co RegistrantDto w API, żeby błąd wyszedł przed kliknięciem „Zamów”. */
export function brakiAbonenta(a: Abonent): string[] {
  const braki: string[] = [];
  if (!a.firstName.trim()) braki.push('imię');
  if (!a.lastName.trim()) braki.push('nazwisko');
  if (!a.street.trim()) braki.push('ulica');
  if (!a.houseNumber.trim()) braki.push('numer');
  if (!a.zipcode.trim()) braki.push('kod pocztowy');
  if (!a.city.trim()) braki.push('miasto');
  if (!/^[A-Za-z]{2}$/.test(a.country)) braki.push('kraj (np. PL)');
  if (!/^\+\d{1,3}$/.test(a.phoneCountryCode)) braki.push('kierunkowy (np. +48)');
  if (!/^[\d ]{6,15}$/.test(a.phone)) braki.push('telefon');
  if (!/^\S+@\S+\.\S+$/.test(a.email)) braki.push('e-mail');
  return braki;
}

/**
 * A-13 — dane abonenta (właściciela) domeny. Trafiają do rejestru domen (WHOIS/NASK):
 * domena jest zarejestrowana na klienta, nie na Verris (decyzja 2026-09-23).
 * `nazwaZablokowana` — przy edycji: imienia, nazwiska i firmy rejestrator nie zmienia (to cesja).
 */
export function RegistrantFields({
  value, onChange, nazwaZablokowana = false,
}: { value: Abonent; onChange: (a: Abonent) => void; nazwaZablokowana?: boolean }) {
  const pole = (k: keyof Abonent, label: string, extra: { placeholder?: string; type?: string; disabled?: boolean } = {}) => (
    <label className="block space-y-1">
      <span className="block text-xs text-neutral-500">{label}</span>
      <Input
        value={value[k] ?? ''}
        type={extra.type ?? 'text'}
        placeholder={extra.placeholder}
        disabled={extra.disabled}
        onChange={(e) => onChange({ ...value, [k]: e.target.value })}
      />
    </label>
  );
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {pole('firstName', 'Imię', { disabled: nazwaZablokowana })}
        {pole('lastName', 'Nazwisko', { disabled: nazwaZablokowana })}
        {pole('companyName', 'Firma (opcjonalnie)', { disabled: nazwaZablokowana })}
        {pole('vat', 'NIP / VAT-UE (dla firmy)')}
        {pole('street', 'Ulica')}
        {pole('houseNumber', 'Numer domu / lokalu', { placeholder: '5/7' })}
        {pole('zipcode', 'Kod pocztowy', { placeholder: '00-001' })}
        {pole('city', 'Miasto')}
        {pole('country', 'Kraj (kod)', { placeholder: 'PL' })}
        {pole('email', 'E-mail abonenta', { type: 'email' })}
      </div>
      <div className="grid grid-cols-[88px_1fr] gap-3">
        {pole('phoneCountryCode', 'Kierunkowy', { placeholder: '+48' })}
        {pole('phone', 'Telefon', { placeholder: '600100200', type: 'tel' })}
      </div>
      {nazwaZablokowana ? (
        <p className="text-xs text-neutral-500">
          Imię, nazwisko i firmę abonenta zmienia tylko cesja domeny — napisz zgłoszenie. Pozostałe dane zmienisz tutaj.
        </p>
      ) : (
        <p className="text-xs text-neutral-500">
          To dane właściciela domeny — trafiają do rejestru domen. Domena jest zarejestrowana na Ciebie, nie na Verris.
        </p>
      )}
    </div>
  );
}
