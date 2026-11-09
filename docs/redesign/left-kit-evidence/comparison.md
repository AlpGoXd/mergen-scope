# Left panel comparison

Captured at device scale factor 2 in Chromium. `light-populated-vs-demo.png` and `dark-populated-vs-demo.png` compare the running app with the supplied demo, including normal and delta markers and horizontal and linked vertical lines. The numbered `*-vs-*` comparisons use the supplied 2x C03, C04 and L1 reference boards. Fixtures differ from the sample data in those boards.

The More control now uses the shared popover with the kit menu; trace color editing uses a flat kit swatch; and the shared pane trigger displays separate kit pane badges. Empty Traces, Markers and Lines text uses the kit wording. Multi-pane marker clipping and an absent reference-marker label were fixed.

Sample names, values, number of rows and selected state differ because captures use real app data. Parsing and error states in the demo are not present in the populated fixture. Kit presentation accepts shared popover slots, resolved trace colors, the existing keyboard-capable matrix picker and batch actions, and an invalid line state; narrow matrix controls wrap.
