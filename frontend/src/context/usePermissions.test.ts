import { describe, expect, it } from 'vitest';
import { effectiveCapabilities } from './usePermissions';
import { allowedTokenScopes } from '../api/settings';
import type { MeResponse } from '../api/me';

const me: MeResponse = { subject: 'user', email: null, name: null, display_name: 'User', kind: 'api_token', scopes: [] };

describe('credential capability boundaries', () => {
  it('denies pending identity and never infers administrative authority from all or legacy empty scopes', () => {
    expect([...effectiveCapabilities(undefined)]).toEqual([]);
    expect(effectiveCapabilities(me).has('instance_admin')).toBe(false);
    expect(effectiveCapabilities({ ...me, scopes: ['all'], roles: ['instance_admin'] }).has('instance_admin')).toBe(false);
  });
  it('uses effective server capabilities rather than roles or token scope labels', () => {
    expect([...effectiveCapabilities({ ...me, scopes: ['all', 'instance_admin'], roles: ['instance_admin'], capabilities: ['api_read'] })]).toEqual(['api_read']);
  });
  it('keeps MCP independent of ordinary REST reads and writes', () => {
    const caps = effectiveCapabilities({ ...me, scopes: ['api_read', 'mcp'] });
    expect(caps.has('mcp')).toBe(true);
    expect(caps.has('api_write')).toBe(false);
    expect(allowedTokenScopes(caps)).toEqual(['api_read', 'mcp']);
  });
  it('only offers scopes whose normalized capabilities the caller holds', () => {
    expect(allowedTokenScopes(new Set(['api_write']))).toEqual(['api_write']);
    expect(allowedTokenScopes(new Set(['api_read', 'api_write', 'mcp']))).toEqual(['all', 'api_read', 'api_write', 'mcp']);
    expect(allowedTokenScopes(new Set(['api_read', 'instance_admin']))).toEqual(['api_read', 'instance_admin']);
  });
});
