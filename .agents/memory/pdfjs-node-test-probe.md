---
name: Node PDF extraction probes
description: Test PDF extraction against local attachments from Node without Vite's worker URL transform.
---

Do not import the app's PDF.js wrapper directly in a `tsx` Node probe when it assigns a worker URL imported with Vite's `?url` suffix. Outside Vite, that import can resolve to a module object rather than the string URL PDF.js expects, causing `Invalid workerSrc type`.

**Why:** The real PDF extraction test must run outside the browser, but Vite's asset import transform is only available inside the Vite runtime.

**How to apply:** In a Node probe, import `pdfjs-dist/legacy/build/pdf.mjs`, set its worker source to a file URL from `require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs')`, open the attachment with `getDocument`, and pass the resolved document to the parser. Destroy the loading task in `finally`.
