# TapOn Tool

Use `tapOn` to tap UI elements by text or resource ID. It supports optional container scoping when you need to target a
specific element inside a list, card, or panel that contains repeated labels.

## When to use container

Use `container` when:
- Multiple elements share the same text and you want the one inside a specific list or section.
- You want to limit the search to a specific panel or sub-tree for speed and predictability.

Avoid `container` when the element is unique on screen; it adds an extra lookup step.

## Schema highlights

- `action` is required and must be one of `tap`, `doubleTap`, `longPress`, `longPressDrag`, or `focus`.
- `text` and `id` are optional, but one must be provided.
- If both `text` and `id` are provided, `text` takes precedence.
- `container` accepts exactly one of `elementId` or `text` to locate the container element.
- `await` optionally waits for an element to appear after the tap using `await.element.id` or `await.element.text`.

## Examples

Tap within a specific container by ID:

```ts
tapOn({
  platform: "android",
  action: "tap",
  text: "Duluth",
  container: { elementId: "com.google.android.apps.maps:id/suggestions_list" }
});
```

Tap within a container found by text:

```ts
tapOn({
  platform: "android",
  action: "tap",
  text: "Duluth",
  container: { text: "Suggested places" }
});
```

Multiple containers match:

If multiple containers match the selector, the first match in the view-hierarchy traversal order is used. If multiple
target elements match inside that container, exact text matches are preferred and the smallest-area element is chosen.

## Precedence and matching behavior

- Container lookup happens first; if the container is not found, `tapOn` fails with a container-specific error.
- The element search is scoped to the container's subtree when `container` is set.
- Text matching is fuzzy by default, so partial matches can resolve to a smaller, more specific element.

## Implementation references

- [`src/server/interactionTools.ts#L161-L198`](https://github.com/kaeawc/auto-mobile/blob/main/src/server/interactionTools.ts#L161-L198) for the `tapOn` tool schema (required `action`, `text`/`id` precedence, and container rules).
- [`src/features/action/TapOnElement.ts#L220-L277`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/action/TapOnElement.ts#L220-L277) for runtime validation and tap execution flow.
- [`src/features/utility/ElementFinder.ts#L101-L203`](https://github.com/kaeawc/auto-mobile/blob/main/src/features/utility/ElementFinder.ts#L101-L203) for fuzzy matching and smallest-area selection behavior.
