# Changelog

## [1.2.1] – 2025-09-05
### Changed
- Indicators (QFL fix)

## [1.2.0] – 2025-09-04
### Changed
- Hedge backtest

## [1.1.3] – 2025-08-25
### Changed
- Increase parallel listeners in bot
- Calcualte deal profit if deal canceled, but TP order is filled
### Fixed
- Bot not able to be closed if catch error deal not found

## [1.1.2] – 2025-08-20
### Changed
- Reset stats when corresponding global variable changed
- Optmization of get hedge bot deals stats
- Minimum dynamic price deviation

## [1.1.1] – 2025-08-08
### Changed
- Changed log level for some logs

## [1.1.0] – 2025-08-07
### Changed
- Updated log level logic

## [1.0.15] – 2025-08-05
### Changed
- Retry reasons in exchange connector
- Read hedge status from db while in service restart

## [1.0.14] – 2025-08-04
### Changed
- Not bypass dynamic price condition if not able to load latest price

## [1.0.13] – 2025-07-28
### Fixed
- Use static filter in multi coin bot

## [1.0.12] – 2025-07-24
### Fixed
- Retry 500 error

### Changed
- Bumped dependencies versions

## [1.0.11] – 2025-07-21
### Fixed
- Retry request timeout exchange requests

## [1.0.10] – 2025-07-18
### Changed
- Backtester update

## [1.0.9] – 2025-07-17
### Added
- Increased core compatibilities

### Fixed
- Fixed bot dashboard stats for bigAccount, prevent showing terminal bots in DCA bots stats

## [1.0.8] – 2025-07-16
### Added
- Added support for changing Bybit host configuration (com, eu, nl, tr, kz, ge)
- Enhanced exchange factory to support Bybit host parameter
- Added BybitHost enum for different regional hosts

### Changed
- Updated exchange types and interfaces to include bybitHost parameter
- Modified bot exchange update functionality to support Bybit host selection

### Fixed
- Undefined broker code
- Indicator connect timeout

## [1.0.7] – 2025-07-15
### Added
- Added license key validation to user registration form
- Enhanced license key checking functionality with registration support
- Snapshot assets aggregation by exchange UUID

### Changed
- Updated user registration GraphQL schema to include required license key field
- Modified license key validation to support both registration and existing user checks
  
### Fixed
- Return getGlobalVariablesByIds request

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
