import { SetMetadata } from '@nestjs/common';
import type { ApiScopeValue } from './api-scopes';

export const API_SCOPE_KEY = 'apiScope';
/** Wymaga konkretnego scope'a na endpoincie publicznego API (vrs_live token). */
export const ApiScope = (scope: ApiScopeValue) => SetMetadata(API_SCOPE_KEY, scope);
