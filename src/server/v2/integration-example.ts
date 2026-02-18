/**
 * Integration Example: Adding API v2.0 to Express Server
 *
 * This file shows how to integrate the v2 API endpoints into your Express server.
 * Add this code to your main server file (e.g., /server/index.ts)
 */

import express from 'express'
import { middleware as authMiddleware, bodyMiddleware } from '../api'
import v2API from './api'
import rateLimit from 'express-rate-limit'

const app = express()

// Rate limiter (reuse existing one)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
})

/**
 * Initialize v2 API
 */
const API_V2 = v2API()

/**
 * Register v2 GET endpoints
 *
 * Each endpoint includes:
 * - apiLimiter: Rate limiting
 * - bodyMiddleware: Body parsing
 * - authMiddleware: Authentication
 * - endpoint.middlewares: Field selection middlewares
 * - endpoint.handler: Request handler
 */
API_V2.get.forEach((endpoint: any, route: string) => {
  app.get(
    route,
    apiLimiter,
    bodyMiddleware,
    authMiddleware(),
    ...endpoint.middlewares,
    endpoint.handler,
  )
})

/**
 * Example: Adding v2 POST endpoints (when implemented)
 */
// API_V2.post.forEach((endpoint, route) => {
//   app.post(
//     route,
//     apiLimiter,
//     bodyMiddleware,
//     authMiddleware(),
//     ...endpoint.middlewares,
//     endpoint.handler,
//   )
// })

/**
 * Start server
 */
const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log('API v2.0 endpoints available:')
  API_V2.get.forEach((_: any, route: string) => {
    console.log(`  GET ${route}`)
  })
})

/**
 * Example Usage with Existing Server Structure
 *
 * If you already have a server setup like in /server/index.ts,
 * simply add this after your v1 API registration:
 */

/*
// Your existing v1 API
API.get.forEach((fn, r) => app.get(r, apiLimiter, bodyMiddleware, middleware, fn))

// Add v2 API
const API_V2 = v2API()
API_V2.get.forEach((endpoint, route) => {
  app.get(
    route,
    apiLimiter,
    bodyMiddleware,
    middleware,
    ...endpoint.middlewares,
    endpoint.handler,
  )
})
*/

/**
 * Testing the Integration
 *
 * 1. Start your server
 * 2. Test v2 endpoints:
 *
 * curl -X GET "http://localhost:3000/api/v2/bots/dca?fields=minimal" \
 *   -H "token: your-token" \
 *   -H "time: $(date +%s)000" \
 *   -H "signature: your-signature"
 *
 * 3. Try different field selections:
 *
 * # Minimal fields
 * ?fields=minimal
 *
 * # Standard fields
 * ?fields=standard
 *
 * # Custom fields
 * ?fields=id,name,status,settings.pair,profit.total
 *
 * # All fields
 * ?fields=full
 */

export default app
