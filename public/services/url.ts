/**
 * Normalizes a URL, adding protocol if needed for regular URLs
 * @param url The URL to normalize
 * @returns The normalized URL
 */
export const normalizeUrl = (url: string) => {
  // Parse the scheme from the URL (e.g. https, mailto, monero, bitcoin, etc.)
  const trimmedUrl = url.trim()
  const scheme = trimmedUrl.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)?.[1]?.toLowerCase()
  // For URLs without a scheme, add https://, otherwise return the URL as is
  return scheme ? trimmedUrl : `https://${trimmedUrl}`
}

/**
 * URL validation with allowed schemes
 * @param url The URL to validate
 * @param allowedSchemesRegex Array of RegExp patterns for allowed schemes
 * @returns true if valid, false otherwise
 */
export const isValidUrl = (url: string, allowedSchemesRegex?: RegExp[]): boolean => {
  // Return false if the URL is empty
  if (!url || !url.trim()) {
    return false
  }
  // Normalize the URL
  const normalizedUrl = normalizeUrl(url)
  // Check URL against allowed schemes, always including https?://
  const allowed = [new RegExp("^https?://", "i"), ...(allowedSchemesRegex || [])]
  return allowed.some((pattern) => pattern.test(normalizedUrl))
}

/**
 * A redirect target to follow only if it stays on this site: a same-origin relative path.
 * Rejects absolute URLs, protocol-relative "//host" and anything with a backslash, also after
 * normalization ("/.//evil.com" becomes "//evil.com", which a browser reads as another host).
 * @returns the normalized path, or undefined when the target is unsafe
 */
export const sameOriginPath = (redirect: string | undefined, origin: string): string | undefined => {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//") || redirect.includes("\\")) return undefined
  try {
    const u = new URL(redirect, origin)
    if (u.origin !== origin) return undefined
    const path = u.pathname + u.search + u.hash
    return path.startsWith("//") || path.startsWith("/\\") ? undefined : path
  } catch {
    return undefined
  }
}
