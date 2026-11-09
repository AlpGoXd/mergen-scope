# Show in menu comparison

The kit reference crops and app screenshots in [comparison.png](comparison.png) are at 2x. Live captures use two Cartesian panes; the demo has three different pane types.

- Fixed: pane-type labels and New pane action now appear. New pane creates and assigns in one Undo/Redo transaction; the limit exposes a reason. `pane-menu-kit.spec.ts` covers placement, history, limit and incompatibility.
- Fixed: kit title, checkmarks, surface, spacing and light/dark colours. Incompatible entries show the actual reason beneath the title and retain the tooltip.
- Intentional: the incompatible reason wraps rather than using the demo's abbreviated inline reason. The selected second row is highlighted because the pointer remains after selection.
- Shared popover keyboard navigation remains a Phase 8 audit; Escape is covered.
