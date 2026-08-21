export const CONTROL_PLANE_MAIL_DOMAIN = 'verris.pl';

export const RESERVED_LOCAL_PARTS = new Set([
  'postmaster',
  'abuse',
  'hostmaster',
  'mail',
  'root',
  'admin',
  'administrator',
  'webmaster',
  'dmarc',
  'noreply',
  'no-reply',
]);

export const LOCAL_PART_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
