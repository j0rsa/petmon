import { useEffect, useState } from 'react';
import { refreshPwaApp } from '../lib/pwaCache';

export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('pwa-update-available', handler);
    return () => window.removeEventListener('pwa-update-available', handler);
  }, []);

  if (!visible) return null;

  async function handleUpdate() {
    setUpdating(true);
    try {
      await refreshPwaApp();
    } catch {
      setUpdating(false);
    }
  }

  return (
    <div className="pwa-update-banner">
      <span>A new version is available.</span>
      <button className="pwa-update-btn" type="button" disabled={updating} onClick={handleUpdate}>
        {updating ? 'Updating…' : 'Update'}
      </button>
    </div>
  );
}
