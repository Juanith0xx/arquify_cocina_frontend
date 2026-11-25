import type { CustomTextureItem } from '../store/adminStore';

function getApiBaseUrl(): string {
  const metaEnv = (import.meta as any).env || {};
  const configured =
    typeof metaEnv.VITE_API_BASE_URL === 'string' ? metaEnv.VITE_API_BASE_URL.trim() : '';
  return configured ? configured.replace(/\/+$/, '') : '';
}

function resolveManagedUrl(url: string | undefined): string {
  if (!url) return '';
  const base = getApiBaseUrl();
  if (base && url.startsWith('/api/v1/textures/')) {
    return `${base}${url}`;
  }
  return url;
}

function normalizeTextureFromApi(raw: CustomTextureItem): CustomTextureItem {
  return {
    ...raw,
    url: resolveManagedUrl(raw.url),
    previewUrl: resolveManagedUrl(raw.previewUrl || raw.url),
  };
}

export async function fetchCloudTextures(): Promise<CustomTextureItem[] | null> {
  const endpoint = `${getApiBaseUrl()}/api/v1/textures`;
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.warn('[TexturesAPI] Error consultando texturas en PostgreSQL:', response.status);
      return null;
    }

    const data = await response.json();
    if (data?.success && Array.isArray(data.textures)) {
      return (data.textures as CustomTextureItem[]).map(normalizeTextureFromApi);
    }
    return null;
  } catch (err) {
    console.warn('[TexturesAPI] No se pudo conectar con PostgreSQL (Railway):', err);
    return null;
  }
}

export async function saveCloudTexture(
  texture: CustomTextureItem,
  isNew = false
): Promise<{ ok: boolean; texture?: CustomTextureItem; error?: string }> {
  const base = getApiBaseUrl();
  const endpoint = isNew
    ? `${base}/api/v1/textures`
    : `${base}/api/v1/textures/${encodeURIComponent(texture.id)}`;

  try {
    const response = await fetch(endpoint, {
      method: isNew ? 'POST' : 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(texture),
    });

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : null;

    if (!response.ok || !data?.success) {
      return {
        ok: false,
        error: data?.error || `HTTP ${response.status}`,
      };
    }

    return {
      ok: true,
      texture: data.texture ? normalizeTextureFromApi(data.texture as CustomTextureItem) : texture,
    };
  } catch (err: any) {
    console.warn('[TexturesAPI] Error guardando textura en PostgreSQL (Railway):', err);
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor',
    };
  }
}

export async function deleteCloudTexture(id: string): Promise<{ ok: boolean; error?: string }> {
  const endpoint = `${getApiBaseUrl()}/api/v1/textures/${encodeURIComponent(id)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const contentType = response.headers.get('content-type') || '';
      const data = contentType.includes('application/json') ? await response.json() : null;
      return {
        ok: false,
        error: data?.error || `HTTP ${response.status}`,
      };
    }

    return { ok: true };
  } catch (err: any) {
    console.warn('[TexturesAPI] Error eliminando textura en PostgreSQL (Railway):', err);
    return {
      ok: false,
      error: err?.message || 'Error de conexión con el servidor',
    };
  }
}
