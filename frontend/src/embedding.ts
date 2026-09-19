/** Source entry point for shared UI. Import index.css once in the consuming app.
 * Resolve React, React DOM, React Router and React Query to single copies. */
export { default as App } from './App';
export { ApplicationExtensionsProvider, useApplicationExtensions, useSessionMe } from './context/ApplicationExtensions';
export type { ApplicationExtensions, ApplicationRoute, ResourceAction, ResourcePermissions } from './context/ApplicationExtensions';
export { SelectedPetProvider, useSelectedPet } from './context/SelectedPetContext';
export { DisplaySettingsProvider } from './context/DisplaySettingsProvider';
export { usePermissions } from './context/usePermissions';
export { useResourceTime } from './context/useResourceTime';
export type { Permissions } from './context/usePermissions';
export { configureApiSession } from './api/client';
export type { ApiSessionAdapter } from './api/client';
export type { MeResponse } from './api/me';
