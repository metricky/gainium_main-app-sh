# Changelog

## [1.4.7] – 2025-10-16
### Changed
- Backtester update

## [1.4.6] – 2025-10-15
### Changed
- NOB logic for bot

## [1.4.5] – 2025-10-15
### Changed
- Debug log for indicators

## [1.4.4] – 2025-10-14
### Fixed
- Clone combo bot input body
- Server url in swagger

## [1.4.3] – 2025-10-13
### Changed
- Reduced unknown order retry count

## [1.4.2] – 2025-10-10
### Fixed
- Multi SL issue

## [1.4.1] – 2025-10-09
### Fixed
- GQL input schema

## [1.4.0] – 2025-10-09
### Added
- Order Blocks & Fair Value Gaps (FVG only)

## [1.3.8] – 2025-10-07
### Changed
- Remove delisted pairs from the bot

## [1.3.7] – 2025-10-07
### Changed
- Added mutex to check candle in indicator service

## [1.3.6] – 2025-10-06
### Fixed
- Hyperliquid spot order price precision

## [1.3.5] – 2025-10-01
### Fixed
- Reset not enough balance status

## [1.3.4] – 2025-09-30
### Added
- Market TP order

## [1.3.3] – 2025-09-30
### Fixed
- Market structure price actions

## [1.3.2] – 2025-09-29
### Change
- Bot errors map updated

## [1.3.1] – 2025-09-26
### Change
- Rearranged set leverage and set margin methods to fit hyperliquid logic

## [1.3.0] – 2025-09-26
### Added
- Hyperliquid integration
  
## [1.2.8] – 2025-09-26
### Added
- ENCRYPT_KEY

## [1.2.7] – 2025-09-18
### Fixed
- Bot not stopped when reset account

## [1.2.6] – 2025-09-18
### Fixed
- TP called multiple times with OR condition and multiple timeframes

## [1.2.5] – 2025-09-15
### Changed
- TP order size calculation for long profit in base

## [1.2.4] – 2025-09-12
### Fixed
- Bot stop stuck
- Bitget Linear base order calculation

## [1.2.3] – 2025-09-09
### Changed
- Lock the bot while loading

## [1.2.2] – 2025-09-08
### Changed
- Indicators logs

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
