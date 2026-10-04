# Single-file documents

PlantUML Ultimate saves a document as one `.pumlu` file. The file contains its diagrams, diagram settings and retained history, stable document identities, and diagram links.

Create one through **File → New → Document**. Use the Document navigator to add, import, rename, or delete diagrams. **Save**, **Save As**, and Cmd/Ctrl-S save the complete document, not just the currently visible diagram.

Use **File → Open → Diagram** to open an existing document, a native single-diagram `.pumlu`, or ordinary PlantUML; a standalone diagram file opens as a one-diagram document. Native encrypted files ask for their password and remain encrypted on subsequent saves.

Folder and ZIP documents are compatibility imports under **File → Open**. Their contents are staged and validated before conversion; save the imported result to create a normal single-file document. Exporting a diagram produces a separate PlantUML/SVG/PNG artifact and never changes the document’s save destination.
