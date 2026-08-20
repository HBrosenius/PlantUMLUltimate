# ADR 0005: Local rendering

Status: Accepted

Diagram source is confidential by default. Rendering runs in the browser without sending source to a remote service. The rendering implementation is isolated behind a worker contract.

The official `@plantuml/core` TeaVM build is used. Because that engine requires a DOM, its isolation boundary is a hidden renderer iframe rather than a DOM-less Web Worker. Communication is asynchronous and source never leaves the browser.
