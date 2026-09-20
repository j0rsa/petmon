/** Wire values shared by session identity, token forms and permission checks. */
export const SCOPES = ['all', 'api_read', 'api_write', 'mcp'] as const;
export type Scope = typeof SCOPES[number];

export const ORDINARY_SCOPES = ['api_read', 'api_write', 'mcp'] as const satisfies readonly Scope[];
export type OrdinaryScope = typeof ORDINARY_SCOPES[number];

/** Server-side roles are not credential scopes. */
export const ROLES = ['instance_admin'] as const;
export type Role = typeof ROLES[number];
