# Gainium – Main Backend

Gainium is a TypeScript-based crypto-trading platform that provides automated trading bots, back-testing, and portfolio management.  
This repository contains the **backend micro-services** that power the Gainium ecosystem.

## Core Services
| Service | Description |
|---------|-------------|
| Main API Server | GraphQL API with authentication, user management, and trading endpoints |
| Bot Services | Workers that execute bot strategies: **DCA**, **Grid**, **Combo**, **Hedge** |
| Stream Service | WebSocket server for real-time updates between backend and frontend |
| Indicators Service | Calculates & streams technical indicators on-demand |
| Backtest Service | Runs historical back-tests on strategies server-side |
| Cron Service | Scheduled maintenance tasks (snapshots, clean-up, exchange rate updates) |

---

For detailed architecture and setup instructions, please refer to the internal documentation.