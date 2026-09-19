import { createContext } from 'react';

/** Set only after the standalone server's timezone has been loaded and validated. */
export const InstanceTimezoneContext = createContext<string | null>(null);
