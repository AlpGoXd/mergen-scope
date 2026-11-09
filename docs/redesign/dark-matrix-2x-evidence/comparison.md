# Matrix 2x comparison

Captured from the running app at 1440 × 900 and device scale factor 2 with `cascaded chain.s2p`. [Dark dB](comparison.png), [dark Phase](comparison-phase.png), and [light dB](comparison-light.png) compare unscaled reference and complete actual Matrix crops. Full [dark](dark-app.png) and [light](light-app.png) captures are included. [Dark](dark-narrow.png) and [light](light-narrow.png) show the panel resized to its 220 px minimum at 1024 × 640.

- Fixed: dark unplotted cells use the canvas background; selected Family and Plot as tabs have the slate fill; corner dots inherit their trace colors. Light unplotted cells retain their panel fill. Grid and control row gaps now use 4 px; the assembled-sidebar cell width matches the left-hand reference. More was fully visible in the app at standard width; the original comparison crop had cut it off. At the minimum width, view controls wrap within the card rather than overflow.
- Intentional: the fixture name and frequency range differ; the application uses the written-spec file summary including trace count. Trace colors come from the real palette; the browser renders More as a native selector. At minimum width, wrapping trades the single-line reference arrangement for fully accessible controls.
- Existing tooltip and large-port behavior deferrals remain in the ledger; these are outside this visual correction.
