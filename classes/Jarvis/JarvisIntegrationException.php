<?php

declare(strict_types=1);

namespace Grav\Plugin\GravCommander\Jarvis;

use RuntimeException;

final class JarvisIntegrationException extends RuntimeException
{
    public function __construct(
        public readonly string $category,
        string $message,
        public readonly bool $retryable = false,
        public readonly ?int $retryAfterSeconds = null
    ) {
        parent::__construct($message);
    }
}
