# Reference Gallery Pane

The conversation's floating reference gallery. A slim rail on the trailing
edge of the conversation column opens a pane over the transcript; the composer
stays visible and usable, so picking a reference and sending are one flow.

## Behavior

- The rail appears only for a local conversation with a composer, and never
  while a full-screen layer (an expanded answer) covers the screen.
- The pane runs from under the header to the top of the composer, is
  `min(0.86 × column, 560)` wide, and leaves at least 48 pt of the
  conversation visible. Tapping the strip, the close action, Android back, or a
  rightward drag dismisses it.
- Tabs switch between the two galleries; the search matches titles,
  descriptions, categories, IDs, and pose angles, and the category chips narrow
  the same list. `ChatScreen` remounts the pane per conversation, so an open
  pane is never inherited by another chat.
- Motion is the pane's own. The triggers above all set one shared progress
  value, so an interruption continues from the current frame. Reduce Motion
  jumps to the end state and drops the drag.

| Interaction | Behavior | Interruption | Reduced motion |
| --- | --- | --- | --- |
| Open | `translateX` from the pane width to 0, `duration.base` + `easing.settle`; scrim opacity `duration.fast` | The rail or back reverses from the current value | Snaps to the end state |
| Close | The reverse; a released drag continues from where it stopped | A new drag or action takes over | Snaps to the end state |
| Grip drag | A horizontal pan on the 12 pt grip at the panel's leading edge; it drives the same progress 1:1 and closes past a quarter of the width or a decisive flick. The grid keeps its vertical scroll because no pan covers the content | The latest gesture wins | Drag is unavailable; the close action and strip still work |

## Material

iOS renders `expo-blur` over the live conversation. Android has no equivalent
here: `expo-blur` needs a `BlurTargetView` that the pane cannot be outside of,
so Android uses a near-opaque translucent surface instead. Both platforms dim
the strip under a light scrim.

## Selection

A tile adds or removes an ordinary composer attachment:

- the id is `reference-gallery:<source>:<id>`, so the tile's state is derived
  from the composer's attachment list rather than kept separately;
- the file name carries the item's title, and the description switch (on by
  default) adds one editable prompt line plus the reference id,
  `costume:SPR-0001`. An image tool can resolve that id on its own server — the
  bundled MOSS MCP server does — so the request needs no binary channel;
- four references is the ceiling, with a warning when the limit is reached;
- attachments stay transient until send. `useManagedComposerAttachments`
  imports them, the message part carries its `fileEntryId`, and the Agent
  decides whether to pass it to its image tool. This pane adds no send or Agent
  behavior.

## Files

`ReferenceGalleryPane.tsx` owns the rail, scrim, pane surface, gestures, and
back press. `ReferenceGalleryBrowser.tsx` owns tabs, search, chips, the
`FlashList` grid, and the footer. `hooks/` holds the catalog query and the
attachment toggle; `utils/` holds the pure filtering, file-name, and geometry
helpers that the tests cover directly.
