/**
 * Safely extract a string query parameter from Express 5's query object.
 * Express 5 query params can be string | string[] | ParsedQs | ParsedQs[].
 */
export function queryString(val: unknown): string | undefined {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return undefined;
}

/**
 * Safely extract a route parameter string from Express 5.
 */
export function paramString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (Array.isArray(val) && typeof val[0] === 'string') return val[0];
  return '';
}
