import type { Access, Where } from 'payload';

/**
 * Audyt bezpieczeństwa 13.10: Posts i Pages mają wersje robocze, a reguła read zwracała `true` — anonim czytał
 * szkice przez REST/GraphQL Payload, a frontend (Local API z pominięciem dostępu) pokazywał je na blogu,
 * w sitemapie i llms.txt. Anonim widzi tylko opublikowane; zalogowany redaktor — wszystko.
 */
export const OPUBLIKOWANE: Where = { _status: { equals: 'published' } };

export const tylkoOpublikowaneDlaAnonima: Access = ({ req }) => (req?.user ? true : OPUBLIKOWANE);
