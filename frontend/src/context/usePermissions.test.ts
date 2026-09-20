import { describe, expect, expectTypeOf, it } from 'vitest';
import { effectiveScopes, hasInstanceAdminAccess } from '../api/me';
import { allowedTokenScopes } from '../api/settings';
import type { MeResponse } from '../api/me';
import { SCOPES, ROLES, type Scope, type Role } from '../api/authTypes';
import type { ApiTokenPublic, CreateApiToken, UpdateApiTokenScopes } from '../api/settings';
import type { TagInputProps } from '../components/TagInput';

const me: MeResponse = { subject: 'user', email: null, name: null, display_name: 'User', kind: 'api_token', scopes: [], roles: ['instance_admin'] };

describe('credential scope and role boundaries', () => {
  it('bounds identity, token payloads and picker callbacks to the same wire values', () => {
    expect(SCOPES).toEqual(['all', 'api_read', 'api_write', 'mcp']);
    expect(ROLES).toEqual(['instance_admin']);
    expectTypeOf<MeResponse['scopes']>().toEqualTypeOf<Scope[]>();
    expectTypeOf<MeResponse['roles']>().toEqualTypeOf<Role[]>();
    expectTypeOf<ApiTokenPublic['scopes']>().toEqualTypeOf<Scope[]>();
    expectTypeOf<CreateApiToken['scopes']>().toEqualTypeOf<Scope[] | undefined>();
    expectTypeOf<UpdateApiTokenScopes['scopes']>().toEqualTypeOf<Scope[]>();
    expectTypeOf<TagInputProps<Scope>['onChange']>().parameter(0).toEqualTypeOf<Scope[]>();
    expectTypeOf<string>().not.toExtend<Scope>();
    expectTypeOf<string>().not.toExtend<Role>();
    expectTypeOf<Role>().not.toExtend<Scope>();
  });
  it('denies pending identity and requires a live role plus literal all for token administration', () => {
    expect([...effectiveScopes(undefined)]).toEqual([]);
    expect(hasInstanceAdminAccess(me)).toBe(false);
    expect(hasInstanceAdminAccess({ ...me, scopes: ['api_read', 'api_write', 'mcp'] })).toBe(false);
    expect(hasInstanceAdminAccess({ ...me, scopes: ['all'] })).toBe(true);
  });
  it('requires a live role and permits interactive admin sessions', () => {
    expect(hasInstanceAdminAccess({ ...me, scopes: ['all'], roles: [] })).toBe(false);
    expect(hasInstanceAdminAccess({ ...me, kind: 'oidc' })).toBe(true);
  });
  it('keeps MCP independent of ordinary REST reads and writes', () => {
    const caps = effectiveScopes({ ...me, scopes: ['api_read', 'mcp'] });
    expect(caps.has('mcp')).toBe(true);
    expect(caps.has('api_write')).toBe(false);
    expect(allowedTokenScopes({ ...me, scopes: ['api_read', 'mcp'] })).toEqual(['api_read', 'mcp']);
  });
  it('never promotes narrow or legacy empty token scopes into all', () => {
    expect(allowedTokenScopes({ ...me, scopes: ['api_write'] })).toEqual(['api_write']);
    expect(allowedTokenScopes({ ...me, scopes: ['api_read', 'api_write', 'mcp'] })).toEqual(['api_read', 'api_write', 'mcp']);
    expect(allowedTokenScopes(me)).toEqual(['api_read', 'api_write', 'mcp']);
    expect(allowedTokenScopes({ ...me, scopes: ['all'] })).toEqual(['all', 'api_read', 'api_write', 'mcp']);
  });
});
