// EXPO_PUBLIC_* must stay a literal reference so Expo can inline it at build time.
const configuredSiteUrl = process.env.EXPO_PUBLIC_SITE_URL;

function siteBaseUrl(): string | null {
  const value = configuredSiteUrl?.trim().replace(/\/$/, '');
  return value || null;
}

export function getCanonicalGameUrl(gameId: string): string | null {
  const base = siteBaseUrl();
  return base ? `${base}/jogos/${gameId}` : null;
}

export function getCanonicalProfileUrl(profileId: string): string | null {
  const base = siteBaseUrl();
  return base ? `${base}/perfil/${profileId}` : null;
}
