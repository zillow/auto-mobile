# TapOn Tool

Use `tapOn` to tap UI elements by text or resource ID. It supports optional container scoping when you need to target a
specific element inside a list, card, or panel that contains repeated labels.

## When to use container

Use `container` when:
- Multiple elements share the same text and you want the one inside a specific list or section.
- You want to limit the search to a specific panel or sub-tree for speed and predictability.

Avoid `container` when the element is unique on screen; it adds an extra lookup step.

## Schema highlights

- `text` and `id` are optional, but one must be provided.
- If both `text` and `id` are provided, `text` takes precedence.
- `container` accepts either `elementId` or `text` to locate the container element.
- If both `container.elementId` and `container.text` are provided, `elementId` is used to find the container.

## Examples

Tap within a specific container by ID:

```ts
tapOn({
  platform: "android",
  text: "Duluth",
  container: { elementId: "com.google.android.apps.maps:id/suggestions_list" }
});
```

Tap within a container found by text:

```ts
tapOn({
  platform: "android",
  text: "Duluth",
  container: { text: "Suggested places" }
});
```

Multiple containers match:

If multiple containers match the selector, the first match in the view-hierarchy traversal order is used. If multiple
target elements match inside that container, exact text matches are preferred and the smallest visible element is chosen.

## Precedence and matching behavior

- Container lookup happens first; if the container is not found, `tapOn` fails with a container-specific error.
- The element search is scoped to the container's subtree when `container` is set.
- Text matching is fuzzy by default, so partial matches can resolve to a smaller, more specific element.
