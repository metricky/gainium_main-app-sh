/**
 * API v2.0 Response Types
 */

/**
 * Response metadata for paginated endpoints
 */
export interface ResponseMeta {
  /** Current page number */
  page: number
  /** Total number of pages */
  total: number
  /** Total count of items (across all pages) */
  count: number
  /** Number of items on current page */
  onPage: number
  /** Fields included in the response (added by middleware) */
  fields?: string[] | 'all'
}

/**
 * Standard API v2 response structure
 */
export interface APIv2Response<T = any> {
  status: 'ok' | 'notok'
  reason: string | null
  data: T
  meta?: Partial<ResponseMeta>
}

/**
 * Response for list endpoints with pagination
 */
export interface APIv2ListResponse<T = any> extends APIv2Response<T[]> {
  meta: ResponseMeta
}
