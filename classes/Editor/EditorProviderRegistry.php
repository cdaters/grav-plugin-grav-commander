<?php

declare(strict_types=1);
namespace Grav\Plugin\GravCommander\Editor;

/** Public v1 registration contract. Providers edit canonical buffers, never filesystem paths. */
final class EditorProviderRegistry
{
    private array $providers = [];

    public function register(array $provider): void
    {
        foreach (['id', 'plugin', 'field'] as $key) {
            if (!is_string($provider[$key] ?? null) || !preg_match('/^[a-z][a-z0-9-]{0,63}$/D', $provider[$key])) throw new \InvalidArgumentException('Invalid editor provider identifier.');
        }
        if (($provider['adapter'] ?? null) !== 'admin2-field-v1' || isset($this->providers[$provider['id']])) throw new \InvalidArgumentException('Unsupported or duplicate editor provider.');
        if (!is_array($provider['formats'] ?? null) || !is_array($provider['contexts'] ?? null) || !is_array($provider['permissions'] ?? null) || !$provider['permissions']) throw new \InvalidArgumentException('Explicit formats, contexts and permissions are required.');
        if (($provider['preserves_source'] ?? false) !== true) throw new \InvalidArgumentException('Canonical source preservation is required.');
        $provider['priority'] = max(-1000, min(1000, (int) ($provider['priority'] ?? 0)));
        $provider['max_bytes'] = max(1, min(16777216, (int) ($provider['max_bytes'] ?? 1048576)));
        $this->providers[$provider['id']] = $provider;
    }

    public function all(): array
    {
        $items = array_values($this->providers);
        usort($items, static fn (array $a, array $b): int => ($b['priority'] <=> $a['priority']) ?: strcmp($a['id'], $b['id']));
        return $items;
    }
}
