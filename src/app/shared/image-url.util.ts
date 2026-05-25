const GOOGLE_DRIVE_THUMBNAIL_WIDTH = 1200;

export function normalizeServiceImageUrl(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) return null;

  const driveFileId = extractGoogleDriveFileId(trimmed);
  if (!driveFileId) return trimmed;

  return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${GOOGLE_DRIVE_THUMBNAIL_WIDTH}`;
}

function extractGoogleDriveFileId(value: string): string | null {
  const fallbackMatch = value.match(/drive\.google\.com\/file\/d\/([^/?#]+)/i);
  try {
    const url = new URL(value);
    if (!isGoogleDriveHost(url.hostname)) return null;

    const queryId = url.searchParams.get('id');
    if (queryId) return queryId;

    const filePathMatch = url.pathname.match(/^\/file\/d\/([^/]+)/i);
    return filePathMatch?.[1] ?? null;
  } catch {
    return fallbackMatch?.[1] ?? null;
  }
}

function isGoogleDriveHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === 'drive.google.com' || normalized.endsWith('.drive.google.com');
}
