# Changelog

## 1.0.0 (2026-10-24)

The first public release.

### What the app does

- Plans a factory for one or more items at a rate per minute or per second, with quick start plans for common goals.
- Works out every production step, including by-products, proliferator spray and the rules for fractionators, mining machines, oil extractors and orbital collectors.
- Shows the plan as a flow map you can pan and zoom, and as a build list with buildings, power, raw input, surplus and belt lines.
- Lets you change the recipe, building or proliferator of any step, or mark an item as supplied from elsewhere.
- Has settings for machine tiers, belt tier and stacking, proliferator, mining research, veins per miner, oil per extractor, collector yield and theme.
- Shares a plan as a text summary or as a plan code.
- Installs to the Home Screen and works offline.

### Changes in the cleanup before release

- Tabs, sheets and map nodes work with a keyboard and a screen reader.
- New layouts for phones in landscape, iPads in portrait, small laptops and large screens. Touch controls are at least 44 px.
- Keyboard shortcuts: `/` to search for an item, F to fit the map, + and - to zoom, Esc to close.
- The update prompt also shows for an update that was found on an earlier visit.
- The installed app keeps controls out of the notch and the home indicator, and the theme sets the browser bar color.
- The icon sheet is less than half its old size, so the app loads faster.
- New launch screens for iPhone Air, iPhone Duo and iPad Pro 11 (M4 and M5).
- Switching between per minute and per second no longer changes the rates.
- Plan codes are checked before they load.
- Settings has an About section with credits and licenses that also open offline.
- All text was rewritten in plain words.

For developers: the code is now plain ES modules with tests that keep the solver numbers the same. Tests run on GitHub for each pull request and each push to main.
