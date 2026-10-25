# Changelog

## 1.1.0 (2026-10-25)

- Save plans. A saved plan keeps the targets, the recipe, building and proliferator you chose for each step, the items supplied from elsewhere and all settings. Open, rename, duplicate or delete a plan. You can undo opening a plan and undo a delete.
- The sidebar has four tabs: Plan, Saved, Load/Save and Settings. On phones, the Plan tab has Plan, Saved and Load/Save at the top, and goes back to the one you used last.
- Saved lists your plans. Load/Save has the plan's name, Save, Save as new and a list to load a plan from. The Plan tab keeps one line that says whether the plan is saved, with a Save button.
- An open plan you have changed shows "Unsaved changes".
- Export makes a .json file with all plans or with only the open plan, saved or not. A plan's ••• menu can export it too. Import adds the plans from either file, and from a .json file with an old plan code. After importing one plan, the message has Open. On iPhone and iPad, Export opens the share sheet, so you can save the file to Files.
- Share has Copy link. The link opens the plan in the app, where you can save it or undo it.
- A plan code now drops a made-up item name such as "constructor", like any other unknown name.
- You can move the boxes on the flow map to see the links behind them. Drag a box with a mouse, or hold it with a finger and then drag. With a keyboard, Shift and an arrow key move the box that has focus. The links follow the box. Saved plans, backup files and plan links keep where you put the boxes. Map options has Reset box positions, which you can undo.

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
- Deuterium now needs 1 hydrogen each. It asked for 100 before, because the hydrogen that loops back through the fractionators was counted as used. The step details say how to feed them.
- Switching between per minute and per second no longer changes the rates.
- Plan codes are checked before they load.
- Settings has an About section with credits and licenses that also open offline.
- All text was rewritten in plain words.

For developers: the code is now plain ES modules with tests that keep the solver numbers the same. Tests run on GitHub for each pull request and each push to main.
