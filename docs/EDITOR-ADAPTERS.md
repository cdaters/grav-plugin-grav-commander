# Commander editor adapters v1

Commander selects editors automatically; there is no editor chooser. It performs
canonical root/protected-path checks, format and Grav-page detection, permission
checks and size limits before supplying a buffer. It owns validation, explicit
Save, disk revision checks, dirty-state guards, focus/scroll and Jarvis context.

## Resolution

1. Eligible enabled providers, descending integer priority; ties sort by ASCII ID.
2. A clean Grav page falls back to the native Admin2 page editor.
3. Ordinary Markdown falls back to Commander Markdown tools; other authorized text
   formats fall back to Commander's source editor. Read-only files use Commander.

The built-in optional Caxton descriptor has priority **100**, formats `md` and
`markdown`, and contexts `grav-page` and `file`. It requires `grav-caxton.use`, an
enabled installation and `admin.replace_markdown_fields`. Source mode separately
requires `grav-caxton.source`. Commander uses only Caxton's public Admin2 custom
field/value/change contract and documented field options. No Caxton private class,
proof bundle, parser or implementation method is imported. Caxton is not rebuilt.
Commander supplies its own Jarvis panel; page-media and Caxton's page-bound Jarvis
controls are omitted because arbitrary filesystem buffers lack a page-media context.

## PHP registration

Trusted installed plugins subscribe to `onCommanderEditorProviders` and call the
public `Grav\Plugin\GravCommander\Editor\EditorProviderRegistry::register(array)`:

```php
public function onCommanderEditorProviders($event): void
{
    $event['registry']->register([
        'id' => 'example-code',
        'plugin' => 'example-editor',
        'field' => 'code',
        'label' => 'Example Code',
        'adapter' => 'admin2-field-v1',
        'priority' => 50,
        'formats' => ['yaml', 'json', 'twig', 'css', 'js', 'html', 'txt'],
        'contexts' => ['file'], // optionally 'grav-page'
        'permissions' => ['example-editor.use'], // all required, API scope-aware
        'preserves_source' => true,
        'max_bytes' => 1048576,
        'options' => [], // public field configuration, never credentials
    ]);
}
```

IDs/plugin/field names are lowercase alphanumeric/hyphen identifiers. Duplicate IDs
and unsupported adapters are rejected. Priority is bounded to -1000…1000. Every
format/context is explicitly declared; there is no wildcard or unsafe-format bypass.
A provider with priority >100 intentionally precedes Caxton. Disabled/missing plugins,
missing field assets, denied permissions and incompatible size/format/context are
omitted from the authenticated read response. Registration grants no file authority.

## Client buffer contract (`admin2-field-v1`)

Supply a self-contained ES module at `admin-next/fields/{field}.js`, served by
Admin2's public `/gpm/plugins/{plugin}/field/{field}` endpoint. It registers the
custom-element name supplied in `window.__GRAV_FIELD_TAG` and implements:

- `field`: public configuration assigned before connection, including readonly/disabled.
- `value`: exact canonical source string getter/setter, without serialization on mount.
- `change`: bubbling CustomEvent with the complete new canonical string as `detail`,
  only on intentional content changes. No auto-save, network or hidden storage.
- Normal custom-element connected/disconnected lifecycle. Focus uses an accessible
  contenteditable/textarea/input or button. Theme is the document's `data-theme`.

The field runs in a sandboxed iframe with **allow-scripts only**, no same-origin,
network, form or top-navigation privilege and no credentials or filesystem identity.
Its styles and custom-element/global editor events cannot collide with Admin2 or
another Commander instance. Self-contained modules are required: relative module
imports or network-loaded dependencies are incompatible and fall back safely.
This confines rendering; it is not a claim that malicious installed server plugins
can be made safe. Only install trusted plugins.

Commander retains the iframe across workspace rerenders so provider selection, undo
and focus survive. Intentional `change` events update the pinned unsaved buffer;
Save/Jarvis explicitly flush the getter first. Only Commander submits its regular
validated revision-bound write. A native-page fallback delegates to Admin2's existing
page workflow and ACLs. Loading an editor never saves a file.

Mount timeout, exceptions, non-registration and source normalization on initialization
advance to the next compatible provider. A runtime failure retains the last acknowledged
canonical buffer and tries remaining providers, then Commander source editing; it never
navigates away with unsaved content. Read timeout refuses Save. Failed/oversized provider
output is not accepted. A provider must emit complete changes promptly; Commander cannot
recover changes a broken provider never exposed through its public contract.

Providers do not supply save URLs, root IDs or editor-choice UI. New adapter protocol
versions must use a new `adapter` value; unsupported versions are ignored via registration
failure and do not replace built-in fallbacks.
