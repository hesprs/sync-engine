# File Tree Component

File tree is a SolidJS component that visualizes an array of sync tasks, and enables selecting / deselecting tasks.

## Mechanisms

Creates visual hierarchy (left padding) for different folder nesting levels.

Renders select box, Obsidian tooltip, icon, and task path

1 universal path compaction rule:

- if a folder only has one children in the task list, and the folder itself is not in the task list, the children and folder combines into one entry with path shown as `<parent-basename> / <child-basename>`. This applies to each two path segments, so continuous nesting chains can be joined continuously, only stop at shallowest common parent.

8 input validation rules:

- Deselecting any direct children delete task deselects parent delete.
- Selecting parent delete task selects all direct children delete tasks.
- Deselecting folder creation tasks deselects all direct children creation tasks.
- Selecting any children creation tasks selects its parent creation.
- All the four rules above cascade propagate.
- `Move` tasks are equal to creation tasks in validation logic.
- Convert a `Move` task into a `CreateDir` task if any direct child `Move` tasks is deselected or converted to a `CreateDir` task.
- Convert a `CreateDir` into a `Move` task if it was previously converted from a `Move` task and all its direct children are selected `Move` tasks.

Behavior: selecting / unselecting only, no collapsing, no expansion.

Single API shape:

```TypeScript
type Mount = (el: Element, tasks: Array<BaseTask>, selectAll: string) => {
	unmount: () => void;
	getState: () => { selected: Array<BaseTask>; deselected: Array<BaseTask> };
};
```

Select all / deselect all:

- This option is rendered in style similar to a normal tree node with a checkbox icon `folders`, and corresponding state text `selectAll` or `deselectAll`, positioned like a root node in the tree, above all task nodes.
- When any of the tasks is selected, the action should be `deselectAll`. Only when none of the tasks is selected, action is `selectAll`.
- The checkbox should show indeterminate state when tasks are partially selected, otherwise show checked / unchecked.

## Implementation

1. Pre-process:

First, build a prefix tree from the array of task paths. Then, run a recursive "compact" function that merges single-child folders.

2. Rendering and input validation:

Flatten the compacted tree into a 1D array, and store it in a `Record` object. The cascade logic is handled by a pure function that triggers dependent tasks.

The UI simply maps over the flat array and applies padding-left based on the depth property.
