<?php

declare(strict_types=1);

namespace Grav\Plugin\GravCommander\Jarvis;

use Closure;
use RuntimeException;

/** Hash-only, one-time receipts for applying a proposal to an unsaved buffer. */
final class JarvisProposalStore
{
    public const LIFETIME_SECONDS = 900;
    public const MAX_ACTIVE_RECEIPTS = 128;

    private readonly Closure $clock;

    public function __construct(private readonly string $directory, ?Closure $clock = null)
    {
        $this->clock = $clock ?? static fn (): int => time();
    }

    /** @return array{id: string, expires_at: string} */
    public function issue(string $actor, string $identity, string $sourceHash, string $proposalHash): array
    {
        $this->ensureDirectory();
        $directoryLock = @fopen($this->directory . '/.lock', 'c+b');
        if ($directoryLock === false || !flock($directoryLock, LOCK_EX)) {
            if (is_resource($directoryLock)) fclose($directoryLock);
            throw new RuntimeException('Commander proposal storage is unavailable.');
        }
        try {
            @chmod($this->directory . '/.lock', 0600);
            $this->cleanupExpired();
            if (count($this->receiptFiles()) >= self::MAX_ACTIVE_RECEIPTS) {
                throw new RuntimeException('Commander proposal storage is at capacity.');
            }
            $id = bin2hex(random_bytes(16));
            $now = ($this->clock)();
            $record = [
                'version' => 1,
                'actor_hash' => hash('sha256', $actor),
                'identity_hash' => hash('sha256', $identity),
                'source_hash' => $sourceHash,
                'proposal_hash' => $proposalHash,
                'expires' => $now + self::LIFETIME_SECONDS,
            ];
            $encoded = json_encode($record, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
            $path = $this->path($id);
            $handle = @fopen($path, 'x+b');
            if ($handle === false) {
                throw new RuntimeException('Commander could not create a proposal receipt.');
            }
            $stored = false;
            try {
                $stored = flock($handle, LOCK_EX)
                    && fwrite($handle, $encoded) === strlen($encoded)
                    && fflush($handle);
                if (!$stored) throw new RuntimeException('Commander could not store a proposal receipt.');
                @chmod($path, 0600);
            } finally {
                flock($handle, LOCK_UN);
                fclose($handle);
                if (!$stored) @unlink($path);
            }
            return ['id' => $id, 'expires_at' => gmdate('c', $record['expires'])];
        } finally {
            flock($directoryLock, LOCK_UN);
            fclose($directoryLock);
        }
    }

    public function consume(
        string $id,
        string $actor,
        string $identity,
        string $sourceHash,
        string $proposalHash
    ): void {
        $this->withReceipt($id, $actor, $identity, static function (array $record) use ($sourceHash, $proposalHash): void {
            if (!hash_equals((string) ($record['source_hash'] ?? ''), $sourceHash)
                || !hash_equals((string) ($record['proposal_hash'] ?? ''), $proposalHash)) {
                throw new RuntimeException('The Commander proposal is stale or belongs to another buffer.');
            }
        });
    }

    public function revoke(string $id, string $actor, string $identity): void
    {
        $this->withReceipt($id, $actor, $identity, static function (): void {});
    }

    private function withReceipt(string $id, string $actor, string $identity, callable $verify): void
    {
        if (preg_match('/^[a-f0-9]{32}$/D', $id) !== 1) {
            throw new RuntimeException('The Commander proposal receipt is invalid.');
        }
        $path = $this->path($id);
        $handle = @fopen($path, 'r+b');
        if ($handle === false) throw new RuntimeException('The Commander proposal expired or was already closed.');
        try {
            if (!flock($handle, LOCK_EX)) throw new RuntimeException('The Commander proposal receipt is unavailable.');
            $record = json_decode((string) stream_get_contents($handle), true);
            if (!is_array($record) || (int) ($record['expires'] ?? 0) <= ($this->clock)()) {
                @unlink($path);
                throw new RuntimeException('The Commander proposal expired or was already closed.');
            }
            if (!hash_equals((string) ($record['actor_hash'] ?? ''), hash('sha256', $actor))
                || !hash_equals((string) ($record['identity_hash'] ?? ''), hash('sha256', $identity))) {
                throw new RuntimeException('The Commander proposal belongs to another user or file.');
            }
            $verify($record);
            if (!@unlink($path)) throw new RuntimeException('Commander could not close the one-time proposal receipt.');
        } finally {
            flock($handle, LOCK_UN);
            fclose($handle);
        }
    }

    private function ensureDirectory(): void
    {
        if (!is_dir($this->directory) && !@mkdir($this->directory, 0700, true) && !is_dir($this->directory)) {
            throw new RuntimeException('Commander could not create protected proposal storage.');
        }
        @chmod($this->directory, 0700);
    }

    private function cleanupExpired(): void
    {
        $now = ($this->clock)();
        foreach ($this->receiptFiles() as $file) {
            $record = json_decode((string) @file_get_contents($file), true);
            if (!is_array($record) || (int) ($record['expires'] ?? 0) <= $now) @unlink($file);
        }
    }

    /** @return list<string> */
    private function receiptFiles(): array
    {
        $files = glob($this->directory . '/*.json') ?: [];
        sort($files, SORT_STRING);
        return array_values($files);
    }

    private function path(string $id): string
    {
        return rtrim($this->directory, '/\\') . '/' . $id . '.json';
    }
}
