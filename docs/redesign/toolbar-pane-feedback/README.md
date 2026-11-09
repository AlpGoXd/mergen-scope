# Toolbar pane feedback evidence

Light and dark captures are 1440 x 900 CSS pixels at 2x, taken after removing an empty fourth pane. The written v3 specification and 40-T1 board were consulted. The requested dedicated 2x toolbar reference has not yet been supplied, so precise visual parity is unverified.

The previous marker and line groups reserved separate blank hint widths, making their tinted zones oversized. A single reserved hint slot after the groups keeps buttons still when armed; its position outside the colored zone is tentative pending the requested reference. Layout presets remain disabled pending their existing integration work. The added minus pane control is user-requested and does not appear on the older 40-T1 board.

Focused tests cover the one-pane disabled explanation, four- and eight-pane limits, removal of empty last panes, undo and redo. Focused browser coverage exercises populated incompatible removal, cancel and confirm, paneless-line chart exclusion, and undo/redo. Unit coverage includes compatible and paneless lines, linked member IDs, and paneless save/reload. Independent history and migration review remains required.
