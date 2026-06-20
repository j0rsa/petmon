import { useEffect, useState } from 'react';

export function PwaUpdateBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = () => setVisible(true);
    window.addEventListener('pwa-update-available', handler);
    return () => window.removeEventListener('pwa-update-available', handler);
  }, []);

  if (!visible) return null;

  return (
    <div className="pwa-update-banner">
      <span>A new version is available.</span>
      <button className="pwa-update-btn" type="button" onClick={() => window.location.reload()}>
        Update
      </button>
    </div>
  );
}
