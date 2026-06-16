const STORAGE_KEY = 'petmon.pet-photos';

type PhotoMap = Record<string, string>;

function readMap(): PhotoMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PhotoMap) : {};
  } catch {
    return {};
  }
}

function writeMap(map: PhotoMap) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

export function getPetPhoto(petId: string): string | undefined {
  return readMap()[petId];
}

export function setPetPhoto(petId: string, dataUrl: string) {
  const map = readMap();
  map[petId] = dataUrl;
  writeMap(map);
}

export function removePetPhoto(petId: string) {
  const map = readMap();
  delete map[petId];
  writeMap(map);
}

export function readPhotoFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
