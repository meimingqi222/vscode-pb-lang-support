# PureBasic Forms Editor v0.5

- Supports PureBasic Form Designer style assignments:
  - `Button_0 = ButtonGadget(#PB_Any, ...)`
  - `Window_0 = OpenWindow(#PB_Any, ...)`
- Uses a stable gadget key for patching:
  - If first param is `#PB_Any`, key is the assigned variable (left side).
  - Else key is the first param (e.g. `#Button_0`).
- Patches multi-line calls and preserves the left-side assignment (if any).

> Still in development: Currently, only “x/y” is patched when dragging.

## Notes

- The editor reads the PureBasic Form Designer header (`; Form Designer for PureBasic - x.xx`).
- Parsing/patching is limited to the form block (from the header to `; IDE Options`, if present).
- Optional: set `purebasicFormsDesigner.expectedPbVersion` to show a warning when the header version differs.
