import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

function copyFileIfExists(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function overlayFlavorAssets(flavorDir: string, destDir: string) {
  for (const file of ['favicon.svg', 'favicon.png']) {
    copyFileIfExists(path.join(flavorDir, file), path.join(destDir, file));
  }

  const iconsSrc = path.join(flavorDir, 'icons');
  const iconsDest = path.join(destDir, 'icons');
  if (!fs.existsSync(iconsSrc)) return;

  fs.mkdirSync(iconsDest, { recursive: true });
  for (const name of fs.readdirSync(iconsSrc)) {
    copyFileIfExists(path.join(iconsSrc, name), path.join(iconsDest, name));
  }
}

/** Overlay `public/flavors/<flavor>/` assets onto the build output (icons, favicons). */
export function flavorAssetsPlugin(flavor: string | undefined, publicDir: string): Plugin {
  let outDir = 'dist';

  return {
    name: 'petmon-flavor-assets',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      if (!flavor) return;
      const flavorDir = path.join(publicDir, 'flavors', flavor);
      if (!fs.existsSync(flavorDir)) {
        throw new Error(`VITE_APP_FLAVOR=${flavor} but ${flavorDir} does not exist`);
      }
      overlayFlavorAssets(flavorDir, path.resolve(outDir));
    },
  };
}
