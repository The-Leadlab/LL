/** Drop a trailing slash so requests match routes registered without one. */
export function stripTrailingSlash(url: string | undefined): string | undefined {
  if (!url || url.startsWith('http')) {
    if (url && url.startsWith('http')) {
      try {
        const parsed = new URL(url);
        if (parsed.pathname.length > 1) {
          parsed.pathname = parsed.pathname.replace(/\/+$/, '');
        }
        return parsed.toString();
      } catch {
        return url;
      }
    }
    return url;
  }
  const hashIndex = url.indexOf('#');
  const hash = hashIndex === -1 ? '' : url.slice(hashIndex);
  const beforeHash = hashIndex === -1 ? url : url.slice(0, hashIndex);
  const queryIndex = beforeHash.indexOf('?');
  const path = queryIndex === -1 ? beforeHash : beforeHash.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : beforeHash.slice(queryIndex);
  const stripped = path.length > 1 ? path.replace(/\/+$/, '') : path;
  return `${stripped}${query}${hash}`;
}
