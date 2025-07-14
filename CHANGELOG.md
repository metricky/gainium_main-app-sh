# Changelog

## [1.0.6] – 2025-07-14
### Fixed
- Fixed TP order size calculation in coinm futures for limit-based orders placed after base order is filled

## [1.0.5] – 2025-07-08
### Changed
- Updated indicator service connection and publish channel logic
- Enhanced hedge bot to use callback after successful start

## [1.0.4] – 2025-07-02
### Changed
- Updated all dependencies to their latest versions
- Updated private dependencies (@gainium/indicators, @gainium/backtester)
- Updated package-lock.json with latest dependency versions

### Fixed
- Fixed database reference in deal monitor

## [1.0.3] – 2025-06-30
### Changed
- Switched to npm package manager
- Removed yarn.lock file (no longer needed with npm)

## [1.0.2] – 2025-06-30
### Added  
- Initial public release of Gainium Main Backend.  
- Main API Server (GraphQL, auth, user & trading endpoints).  
- Bot Services (DCA, Grid, Combo, Hedge).  
- Stream Service (real-time WebSocket).  
- Indicators Service (technical indicators & subscriptions).  
- Backtest Service (server-side strategy back-testing).  
- Cron Service (scheduled maintenance & data updates).

### Changed  
- Bumped package version from 1.0.1 → 1.0.2.
