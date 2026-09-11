# Single-file projects

PlantUML Ultimate saves a project as one `.pumlu` file. The file contains its diagrams, diagram settings and retained history, stable project identities, and diagram links.

Create one through **File → New → Project**. Use the Project navigator to add, import, rename, or delete diagrams. **Save**, **Save As**, and Cmd/Ctrl-S save the complete project, not just the currently visible diagram.

Use **File → Open → Diagram** to open an existing project, a native single-document `.pumlu`, or ordinary PlantUML; a non-project file opens as a one-diagram project. Native encrypted files ask for their password and remain encrypted on subsequent saves.

Folder and ZIP projects are compatibility imports under **File → Open**. Their contents are staged and validated before conversion; save the imported result to create a normal single-file project. Exporting a diagram produces a separate PlantUML/SVG/PNG artifact and never changes the project’s save destination.
