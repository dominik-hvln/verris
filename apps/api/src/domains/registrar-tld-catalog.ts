/** Kopia runtime z @verris/contracts — API nie importuje wartości z contracts w prod (webpack external). */
export const REGISTRAR_TLD_CATALOG = [
  { extension: 'pl', label: '.pl', popular: true },
  { extension: 'com', label: '.com', popular: true },
  { extension: 'eu', label: '.eu', popular: true },
  { extension: 'com.pl', label: '.com.pl', popular: true },
  { extension: 'org.pl', label: '.org.pl', popular: false },
  { extension: 'net.pl', label: '.net.pl', popular: false },
  { extension: 'org', label: '.org', popular: false },
  { extension: 'net', label: '.net', popular: false },
  { extension: 'info', label: '.info', popular: false },
  { extension: 'biz', label: '.biz', popular: false },
  { extension: 'online', label: '.online', popular: false },
  { extension: 'store', label: '.store', popular: false },
] as const;
