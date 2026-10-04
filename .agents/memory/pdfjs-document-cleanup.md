---
name: PDF.js document cleanup
description: Lifecycle cleanup for the installed PDF.js 6 API.
---

PDF.js 6 exposes worker teardown through `PDFDocumentLoadingTask.destroy()`. Do not assume the resolved `PDFDocumentProxy` has a `destroy()` method; retain the loading task when opening the document and use it for cleanup.

**Why:** The PDF.js upgrade surfaced stale lifecycle calls during type checking. Destroying the loading task is also important when abandoning an opened file or unmounting the reader so its worker can be released.

**How to apply:** When changing PDF open/close behavior, verify against the installed `pdfjs-dist` type definitions and keep a reference to the loading task for both error cleanup and normal teardown.