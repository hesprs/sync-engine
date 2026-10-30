# File Tree Component

File tree is a SolidJS component that visualizes an array of sync tasks, and enables selecting / deselecting tasks.

## How It Works

Creates visual hierarchy (left padding) for different folder nesting levels.

Renders select box, Obsidian tooltip, icon, and task path

1 universal path compaction rule:

- if a folder only has one children in the task list, and the folder itself is not in the task list, the children and folder combines into one entry with path shown as `<parent-basename> / <child-basename>`. This applies to each two path segments, so continuous nesting chains can be joined continuously, only stop at shallowest common parent.

Selection rules:

- Deselecting a delete task deselects ancestor delete-folder tasks; selecting a delete-folder task selects descendant delete tasks.
- Deselecting a folder creation task deselects descendant creation tasks; selecting a creation task selects ancestor creation-folder tasks.
- These rules cascade through all task ancestors and descendants.
- `Move` tasks follow creation-selection rules.
- A move task is presented as a folder creation whenever any descendant move task is deselected; conversion is derived from current selection.

Behavior: selecting / unselecting only, no collapsing, no expansion.

Select all / deselect all:

- This option is rendered in style similar to a normal tree node with a checkbox icon `folders`, and corresponding state text `selectAll` or `deselectAll`, positioned like a root node in the tree, above all task nodes.
- When any of the tasks is selected, the action should be `deselectAll`. Only when none of the tasks is selected, action is `selectAll`.
- The checkbox should show indeterminate state when tasks are partially selected, otherwise show checked / unchecked.

## Implementation

1. Pre-process:

First, build a prefix tree from task paths, then recursively compact single-child folders. The flattened visible tree stores task ancestor and descendant links for selection cascades.

2. Rendering and selection:

Flatten the compacted tree into a 1D array and store nodes in a `Record`. Selection lives in a Solid store; task conversions are derived from that selection.

The UI simply maps over the flat array and applies padding-left based on the depth property.
