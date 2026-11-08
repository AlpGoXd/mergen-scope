# File-card comparison

Captured at 1440 x 900 in Chromium on port 5185. `comparison-light.png` and `comparison-dark.png` place reference board 22-C03 beside the current populated network matrix plus Info and multi-column CSV. Full screenshots also include the error state. The fixtures and metadata differ from the board examples. Boards 00, 01, 23, 24 and 42 were also inspected.

Fixed: compact row with summary only when expanded; Matrix and Info can remain open together; labelled matrix axes; segmented compact controls; CSV Columns checklist using source headers; single hidden view Plot action and dashed card; Info close and parsed-field Copy; tinted error row with reason tooltip and Fix action when the parent provides a file pipeline.

Remaining differences: a parsing-progress row cannot be shown because the file model exposes no progress; the error Fix control is disabled where App has not supplied its replacement callback (Phase 7D/7E). The native More selector and cell sizing still differ slightly from the reference. Matrix tooltips do not describe pane membership; large-port picker styling remains incomplete. The surrounding app differs from assembled references in other phases.
