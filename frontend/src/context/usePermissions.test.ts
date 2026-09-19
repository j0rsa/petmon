import { describe, expect, it } from 'vitest';
import { effectiveScopes, hasInstanceAdminAccess } from '../api/me';
import { allowedTokenScopes } from '../api/settings';
import type { MeResponse } from '../api/me';

const me: MeResponse = { subject: 'user', email: null, name: null, display_name: 'User', kind: 'api_token', scopes: [], roles: ['instance_admin'] };

describe('credential scope and role boundaries', () => {
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
