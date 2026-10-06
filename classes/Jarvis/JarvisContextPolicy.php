<?php

declare(strict_types=1);

namespace Grav\Plugin\GravCommander\Jarvis;

use InvalidArgumentException;

/**
 * Commander-owned file eligibility and disclosure boundary.
 *
 * This class deliberately knows nothing about providers. It decides only what
 * bounded text Commander may disclose to Jarvis and whether a returned
 * proposal may safely enter the current unsaved editor buffer.
 */
final class JarvisContextPolicy
{
    public const DEFAULT_CONTEXT_BYTES = 49152;
    public const DEFAULT_LARGE_CONTEXT_BYTES = 196608;

    /** @var list<string> */
    private const ELIGIBLE_EXTENSIONS = [
        'css', 'csv', 'html', 'htm', 'ini', 'inc', 'js', 'json', 'jsx', 'less',
        'markdown', 'md', 'mjs', 'php', 'scss', 'source', 'sql', 'svg', 'text',
        'toml', 'ts', 'tsx', 'twig', 'txt', 'xml', 'yaml', 'yml',
    ];

    /** @var list<string> */
    private const TEXT_FILENAMES = [
        'composer.json', 'makefile', 'readme', 'readme.md', 'robots.txt',
    ];

    public function __construct(
        private readonly int $maxContextBytes = self::DEFAULT_CONTEXT_BYTES,
        private readonly int $maxLargeContextBytes = self::DEFAULT_LARGE_CONTEXT_BYTES
    ) {
        if ($maxContextBytes < 4096 || $maxContextBytes > 262144
            || $maxLargeContextBytes < $maxContextBytes || $maxLargeContextBytes > 2097152) {
            throw new InvalidArgumentException('Commander Jarvis context limits are outside their safety bounds.');
        }
    }

    /** @return array{context_bytes: int, large_context_bytes: int} */
    public function limits(): array
    {
        return [
            'context_bytes' => $this->maxContextBytes,
            'large_context_bytes' => $this->maxLargeContextBytes,
        ];
    }

    /** @return array<string, bool|int|string> */
    public function prepare(string $root, string $path, string $content, string $action): array
    {
        $sourceContent = $content;
        $root = $this->identifier($root, 'root');
        $path = $this->path($path);
        $action = $this->identifier($action, 'action');
        $this->assertEligibleFile($root, $path, $content);

        $sourceBytes = strlen($content);
        if ($sourceBytes > $this->maxLargeContextBytes) {
            throw new JarvisIntegrationException(
                'context_too_large',
                'This file exceeds the bounded Jarvis context limit. Use a smaller selection or file.'
            );
        }

        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));
        $largeSummary = $action === 'summarize'
            && in_array($extension, ['md', 'markdown'], true)
            && $sourceBytes > $this->maxContextBytes;
        $truncated = false;
        if ($sourceBytes > $this->maxContextBytes && !$largeSummary) {
            if (in_array($action, ['improve', 'custom'], true)) {
                throw new JarvisIntegrationException(
                    'unsafe_partial_rewrite',
                    'Jarvis will not propose a rewrite from a partial file. Use a smaller file.'
                );
            }
            $content = $this->truncateUtf8($content, $this->maxContextBytes);
            $truncated = true;
        }

        [$content, $redactions] = $this->redact($content);
        if (trim($content) === '') {
            throw new JarvisIntegrationException('empty_context', 'No eligible text remains after safety filtering.');
        }

        return [
            'root' => $root,
            'path' => $path,
            'format' => $extension !== '' ? $extension : 'text',
            'content' => $content,
            'source_bytes' => $sourceBytes,
            'included_bytes' => strlen($content),
            'source_sha256' => hash('sha256', $sourceContent),
            'truncated' => $truncated,
            'large_summary' => $largeSummary,
            'redacted' => $redactions > 0,
            'redaction_count' => $redactions,
        ];
    }

    private function assertEligibleFile(string $root, string $path, string $content): void
    {
        $lowerPath = strtolower('/' . $root . '/' . $path);
        $base = strtolower(basename($path));
        $extension = strtolower(pathinfo($path, PATHINFO_EXTENSION));

        if (preg_match('#(?:^|/)(?:\.env(?:\.|$)|\.ssh(?:/|$)|accounts?(?:/|$)|credentials?(?:/|$)|secrets?(?:/|$)|private[-_]?keys?(?:/|$))#i', $lowerPath)
            || preg_match('/(?:^|[._-])(?:credential|password|private[-_]?key|secret|token)(?:[._-]|$)/i', $base)) {
            throw new JarvisIntegrationException(
                'sensitive_file',
                'This file is in a credential or secret-bearing location and cannot be sent to Jarvis.'
            );
        }
        if (preg_match('/-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/i', $content)) {
            throw new JarvisIntegrationException(
                'sensitive_file',
                'Private-key material cannot be sent to Jarvis.'
            );
        }
        if (!in_array($extension, self::ELIGIBLE_EXTENSIONS, true)
            && !in_array($base, self::TEXT_FILENAMES, true)) {
            throw new JarvisIntegrationException(
                'unsupported_file',
                'Jarvis actions are limited to eligible text and source files.'
            );
        }
        if (str_contains(substr($content, 0, 8192), "\0")) {
            throw new JarvisIntegrationException('unsupported_file', 'Binary content cannot be sent to Jarvis.');
        }
    }

    /** @return array{string, int} */
    private function redact(string $content): array
    {
        $count = 0;
        $patterns = [
            ['/(?im)^(\s*"(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|password|credentials?|secret)"\s*:\s*)"[^"\r\n]*"/', true],
            ['/\b((?:sk|gh[pousr])[-_])[A-Za-z0-9_-]{16,}/i', false],
            ['/(?im)^(\s*\$?(?:authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|client[_-]?secret|password|credentials?|secret)\s*[:=]\s*)[^\r\n,}]+/', false],
            ['/(?i)\b(Bearer\s+)[A-Za-z0-9._~+\/-]{12,}/', false],
        ];
        foreach ($patterns as [$pattern, $quoted]) {
            $updated = preg_replace_callback(
                $pattern,
                static function (array $match) use (&$count, $quoted): string {
                    $count++;
                    return (string) ($match[1] ?? '') . ($quoted ? '"[REDACTED]"' : '[REDACTED]');
                },
                $content
            );
            if (is_string($updated)) {
                $content = $updated;
            }
        }
        return [$content, $count];
    }

    private function truncateUtf8(string $content, int $bytes): string
    {
        $truncated = substr($content, 0, $bytes);
        while ($truncated !== '' && preg_match('//u', $truncated) !== 1) {
            $truncated = substr($truncated, 0, -1);
        }
        return rtrim($truncated) . "\n\n[Commander context truncated at {$bytes} bytes]";
    }

    private function identifier(string $value, string $label): string
    {
        $value = trim($value);
        if (preg_match('/^[a-z][a-z0-9._-]{0,63}$/D', $value) !== 1) {
            throw new JarvisIntegrationException('invalid_context', "The Commander {$label} is invalid.");
        }
        return $value;
    }

    private function path(string $path): string
    {
        $path = trim(str_replace(["\0", '\\'], ['', '/'], $path), '/');
        if ($path === '' || strlen($path) > 2048) {
            throw new JarvisIntegrationException('invalid_context', 'The Commander file path is invalid.');
        }
        foreach (explode('/', $path) as $part) {
            if ($part === '' || $part === '.' || $part === '..') {
                throw new JarvisIntegrationException('invalid_context', 'The Commander file path is invalid.');
            }
        }
        return $path;
    }
}
