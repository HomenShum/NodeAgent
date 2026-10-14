# Session graph

## 2026-10-14 — Load the optional Map when requested

A developer opening chat previously downloaded the spatial Map renderer even
when staying in the default readable List. The renderer now loads only when
Map is selected and the session has entities. Chat, tool results and the graph
session remain eager. Loading is disclosed; a failed Map shows an alert and
keeps List and earlier answers available. The same failed import is not
advertised as retryable, and no page reload discards the conversation.

Run `npm run build`, then
`node e2e/graph-map-loading.mjs dist <new-evidence-directory>` with Google Chrome
installed. The production-browser scenarios check actual script requests,
three accumulated runs, repeated view switching, delayed/failed loading,
Map-before-data, Stop/Retry and retained results at 1440×900 and 375×812.
External requests are blocked; this is deterministic local evidence, not a
provider evaluation or production-deployment claim. The first Map visit pays
the deferred download; this change does not resolve the separate SDK-upgrade
bundle regression.

Measured on unchanged assistant-ui 0.14.14: initial JavaScript is 189,429 →
152,849 gzip bytes (36,580 bytes saved, 19.3%). First Map adds 37,554 bytes;
cumulative JavaScript is 190,403 bytes, 974 more than the unsplit app.
Three alternating cold Chrome trials at 100 ms latency, 1.6 Mbps download
and 4× CPU slowdown give median editable-composer readiness 1,663.2 →
1,467.5 ms. Baseline range 1,661.8–1,900.8 ms; candidate 1,465.1–1,470.0 ms.
External fonts were blocked in both variants. These small controlled samples
are not field Core Web Vitals; they do not establish a provider-response gain.
