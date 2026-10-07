<?php

declare(strict_types=1);

namespace Grav\Plugin\GravCommander\Controller;

use Grav\Framework\Psr7\Response;
use Grav\Plugin\Api\Controllers\AbstractApiController;
use Grav\Plugin\Api\Exceptions\ApiException;
use Grav\Plugin\Api\Exceptions\ValidationException;
use Grav\Plugin\Api\Response\ApiResponse;
use Grav\Plugin\GravCommander\Jarvis\JarvisContextPolicy;
use Grav\Plugin\GravCommander\Jarvis\JarvisIntegrationException;
use Grav\Plugin\GravCommander\Jarvis\JarvisIntegrationService;
use Grav\Plugin\GravCommander\Jarvis\JarvisProposalStore;
use Grav\Plugin\GravCommander\Service\FileService;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

class ApiController extends AbstractApiController
{
    private function service(): FileService
    {
        return new FileService();
    }

    private function requireCommanderPermission(ServerRequestInterface $request, string $permission): void
    {
        // API 1.0.44 owns scope caps, group ACLs, demo restrictions and API super authority.
        $this->requirePermission($request, $permission);
    }

    public function status(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $data = $this->service()->status();
        $data['can_write'] = false;
        try {
            $this->requireCommanderPermission($request, 'grav-commander.write');
            $data['can_write'] = true;
        } catch (ApiException) { /* Display only; mutation repeats the full permission gate. */ }
        $data['preference_key'] = hash('sha256', (string) $this->getUser($request)->username);
        return ApiResponse::create($data);
    }

    public function roots(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        return ApiResponse::create($this->service()->roots());
    }

    public function list(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $params = $request->getQueryParams();
        return ApiResponse::create($this->service()->list((string) ($params['root'] ?? 'pages'), (string) ($params['path'] ?? '')));
    }

    public function read(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $params = $request->getQueryParams();
        return ApiResponse::create($this->service()->read((string) ($params['root'] ?? 'pages'), (string) ($params['path'] ?? '')));
    }

    public function download(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $params = $request->getQueryParams();
        $root = (string) ($params['root'] ?? 'pages');
        $path = (string) ($params['path'] ?? '');
        $file = $this->service()->fileForDownload($root, $path);

        return $this->downloadResponse((string) $file['absolute'], (string) $file['name'], (string) $file['mime']);
    }

    public function write(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path']);
        if (!isset($body['content']) || !is_string($body['content'])) throw new ValidationException('Content must be text.');
        return ApiResponse::create($this->service()->write((string) $body['root'], (string) $body['path'], (string) $body['content'], isset($body['revision']) ? (string) $body['revision'] : null));
    }

    public function changePermissions(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-commander.write');
        return ApiResponse::create($this->service()->changePermissions($this->getRequestBody($request)));
    }

    public function previewMarkdown(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        return ApiResponse::create($this->service()->previewMarkdown($this->getRequestBody($request)));
    }

    public function operate(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-commander.write');
        return ApiResponse::create($this->service()->operate($this->getRequestBody($request)));
    }

    public function createFile(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'name']);
        return ApiResponse::create($this->service()->createFile((string) $body['root'], (string) ($body['path'] ?? ''), (string) $body['name']));
    }

    public function validate(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['path']);
        return ApiResponse::create($this->service()->validateContent((string) $body['path'], (string) ($body['content'] ?? '')));
    }

    public function inspectArchive(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $params = $request->getQueryParams();
        return ApiResponse::create($this->service()->inspectArchive((string) ($params['root'] ?? ''), (string) ($params['path'] ?? '')));
    }

    public function mkdir(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'name']);
        return ApiResponse::create($this->service()->mkdir((string) $body['root'], (string) ($body['path'] ?? ''), (string) $body['name']));
    }

    public function upload(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $params = $request->getQueryParams();
        $root = (string) ($params['root'] ?? 'pages');
        $path = (string) ($params['path'] ?? '');
        $uploadedFiles = $request->getUploadedFiles();
        $file = $uploadedFiles['file'] ?? null;
        if (!$file || $file->getError() !== UPLOAD_ERR_OK) {
            throw new ValidationException('No file uploaded or upload error.');
        }
        return ApiResponse::create($this->service()->upload($root, $path, $file));
    }

    public function archiveZip(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path']);
        return ApiResponse::create($this->service()->archiveZip(
            (string) $body['root'],
            (string) $body['path'],
            (string) ($body['name'] ?? '')
        ));
    }

    public function extractArchive(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path']);
        return ApiResponse::create($this->service()->extractArchive(
            (string) $body['root'],
            (string) $body['path'],
            (string) ($body['dest_path'] ?? ''),
            (bool) ($body['overwrite'] ?? false)
        ));
    }

    public function rename(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path', 'name']);
        return ApiResponse::create($this->service()->rename((string) $body['root'], (string) $body['path'], (string) $body['name']));
    }

    public function copy(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path', 'dest_root', 'dest_path']);
        return ApiResponse::create($this->service()->copy((string) $body['root'], (string) $body['path'], (string) $body['dest_root'], (string) $body['dest_path']));
    }

    public function move(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path', 'dest_root', 'dest_path']);
        return ApiResponse::create($this->service()->move((string) $body['root'], (string) $body['path'], (string) $body['dest_root'], (string) $body['dest_path']));
    }

    public function delete(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path']);
        return ApiResponse::create($this->service()->delete((string) $body['root'], (string) $body['path']));
    }

    public function backupFile(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['root', 'path']);
        return ApiResponse::create($this->service()->backupPath((string) $body['root'], (string) $body['path'], (string) ($body['reason'] ?? 'manual')));
    }

    public function backupSite(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $body = $this->getRequestBody($request);

        // Compatibility shim: Admin2 / API route caches in early Grav 2 RC builds can be stubborn
        // about newly-added plugin routes. The already-established backup/site endpoint can safely
        // dispatch config operations when the component sends an explicit action.
        $action = (string) ($body['__action'] ?? $body['action'] ?? '');
        if ($action === 'save_profiles') {
            $profiles = $body['profiles'] ?? null;
            if (!is_array($profiles)) {
                throw new ValidationException('profiles must be an object/map.');
            }
            return ApiResponse::create($this->service()->saveProfiles($profiles));
        }
        if ($action === 'save_schedules') {
            $schedules = $body['schedules'] ?? null;
            if (!is_array($schedules)) {
                throw new ValidationException('schedules must be an object/map.');
            }
            return ApiResponse::create($this->service()->saveSchedules($schedules));
        }
        if ($action === 'set_backup_path') {
            return ApiResponse::create($this->service()->saveBackupPath((string) ($body['path'] ?? '')));
        }

        return ApiResponse::create($this->service()->backupSite((string) ($body['reason'] ?? 'manual-site'), (string) ($body['profile'] ?? 'full_site'), (string) ($body['note'] ?? '')));
    }

    public function backups(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        return ApiResponse::create($this->service()->backups());
    }

    public function profiles(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        return ApiResponse::create($this->service()->profiles());
    }

    public function saveProfiles(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $body = $this->getRequestBody($request);
        $profiles = $body['profiles'] ?? null;
        if (!is_array($profiles)) {
            throw new ValidationException('profiles must be an object/map.');
        }
        return ApiResponse::create($this->service()->saveProfiles($profiles));
    }

    public function schedules(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        return ApiResponse::create($this->service()->schedules());
    }

    public function saveSchedules(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $body = $this->getRequestBody($request);
        $schedules = $body['schedules'] ?? null;
        if (!is_array($schedules)) {
            throw new ValidationException('schedules must be an object/map.');
        }
        return ApiResponse::create($this->service()->saveSchedules($schedules));
    }

    public function runSchedule(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $key = (string) $this->getRouteParam($request, 'key');
        return ApiResponse::create($this->service()->runSchedule($key));
    }

    public function deleteSchedule(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $key = (string) $this->getRouteParam($request, 'key');
        return ApiResponse::create($this->service()->deleteSchedule($key));
    }


    public function createBackupDownloadToken(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $body = $this->getRequestBody($request);
        $name = (string) ($body['name'] ?? '');
        $data = $this->service()->createBackupDownloadToken($name);

        return ApiResponse::create($data);
    }

    public function directDownloadBackup(ServerRequestInterface $request): ResponseInterface
    {
        $params = $request->getQueryParams();
        $token = (string) ($params['token'] ?? '');
        $file = $this->service()->consumeBackupDownloadToken($token);

        return $this->downloadResponse((string) $file['absolute'], (string) $file['name'], 'application/zip');
    }

    public function downloadBackupQuery(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $params = $request->getQueryParams();
        $name = (string) ($params['name'] ?? '');
        $path = $this->service()->backupFilePath($name);

        return $this->downloadResponse($path, basename($path), 'application/zip');
    }

    public function downloadBackup(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $name = (string) $this->getRouteParam($request, 'name');
        $path = $this->service()->backupFilePath($name);

        return $this->downloadResponse($path, basename($path), 'application/zip');
    }

    private function downloadResponse(string $path, string $name, string $mime): ResponseInterface
    {
        if (!is_file($path) || !is_readable($path)) {
            throw new ValidationException('Unable to open file for download.');
        }

        // Direct output is intentional here. Some Admin2/API builds try to stringify
        // PSR-7 resource bodies, which can trigger a 500 or memory spike on large ZIPs.
        // We authenticate first, clear buffers, stream in chunks, then stop execution.
        $this->streamFileAndExit($path, $name, $mime);

        return new Response(204);
    }

    private function streamFileAndExit(string $path, string $name, string $mime): void
    {
        if (function_exists('set_time_limit')) {
            @set_time_limit(0);
        }

        while (ob_get_level() > 0) {
            @ob_end_clean();
        }

        if (headers_sent()) {
            throw new ValidationException('Unable to send download headers; output has already started.');
        }

        $asciiName = preg_replace('/[^A-Za-z0-9._-]+/', '_', $name) ?: 'download.zip';
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . (string) filesize($path));
        header("Content-Disposition: attachment; filename=\"" . $asciiName . "\"; filename*=UTF-8''" . rawurlencode($name));
        header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
        header('Pragma: no-cache');
        header('X-Content-Type-Options: nosniff');

        $handle = fopen($path, 'rb');
        if ($handle === false) {
            throw new ValidationException('Unable to open file for download.');
        }

        while (!feof($handle)) {
            echo fread($handle, 1024 * 1024);
            flush();
        }
        fclose($handle);
        exit;
    }

    public function restore(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.restore');
        $body = $this->getRequestBody($request);
        $this->requireFields($body, ['name', 'confirm']);
        return ApiResponse::create($this->service()->restore((string) $body['name'], (bool) $body['confirm']));
    }

    public function deleteBackup(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.backup');
        $name = (string) $this->getRouteParam($request, 'name');
        return ApiResponse::create($this->service()->deleteBackup($name));
    }

    public function jarvisStatus(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        if (!$this->jarvisIntegrationEnabled()) {
            return ApiResponse::create([
                'available' => false,
                'state' => 'disabled',
                'message' => 'The optional Commander Jarvis integration is disabled.',
                'providers' => [],
                'actions' => [],
            ]);
        }
        return ApiResponse::create($this->jarvis()->status());
    }

    public function jarvisModels(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        $this->assertJarvisIntegrationEnabled();
        try {
            return ApiResponse::create($this->jarvis()->models($this->jarvisProviderId($request)));
        } catch (JarvisIntegrationException $error) {
            throw $this->jarvisApiFailure($error);
        } catch (\Throwable) {
            throw new ApiException(503, 'Jarvis Unavailable', 'Jarvis could not discover models for this provider.');
        }
    }

    public function jarvisValidate(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        $this->assertJarvisIntegrationEnabled();
        try {
            return ApiResponse::create($this->jarvis()->validate($this->jarvisProviderId($request)));
        } catch (JarvisIntegrationException $error) {
            throw $this->jarvisApiFailure($error);
        }
    }

    public function jarvisPropose(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        $this->assertJarvisIntegrationEnabled();
        $body = $this->jarvisBody($request, [
            'root', 'path', 'content', 'action', 'provider_id', 'model', 'custom_instruction',
        ]);
        $action = $this->jarvisString($body, 'action', 32);
        if (in_array($action, ['improve', 'custom'], true)) {
            $this->requireCommanderPermission($request, 'grav-commander.write');
        }
        try {
            return ApiResponse::create($this->jarvis()->propose(
                $this->jarvisActor($request),
                $this->jarvisString($body, 'root', 64),
                $this->jarvisString($body, 'path', 2048),
                $this->jarvisString($body, 'content', JarvisIntegrationService::MAX_REQUEST_CONTENT_BYTES, true),
                $action,
                $this->jarvisString($body, 'provider_id', 64),
                $this->jarvisOptionalString($body, 'model', 256),
                $this->jarvisOptionalString($body, 'custom_instruction', 4000)
            ));
        } catch (JarvisIntegrationException $error) {
            throw $this->jarvisApiFailure($error);
        } catch (\InvalidArgumentException) {
            throw new ValidationException('The Commander Jarvis request is invalid.');
        } catch (\Throwable) {
            throw new ApiException(503, 'Jarvis Unavailable', 'Jarvis could not complete this Commander action.');
        }
    }

    public function jarvisAccept(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.write');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        $this->assertJarvisIntegrationEnabled();
        $body = $this->jarvisBody($request, ['root', 'path', 'current_content', 'proposed_content']);
        try {
            return ApiResponse::create($this->jarvis()->accept(
                $this->jarvisActor($request),
                (string) $this->getRouteParam($request, 'id'),
                $this->jarvisString($body, 'root', 64),
                $this->jarvisString($body, 'path', 2048),
                $this->jarvisString($body, 'current_content', JarvisIntegrationService::MAX_REQUEST_CONTENT_BYTES, true),
                $this->jarvisString($body, 'proposed_content', JarvisIntegrationService::MAX_REQUEST_CONTENT_BYTES, true)
            ));
        } catch (JarvisIntegrationException $error) {
            throw $this->jarvisApiFailure($error);
        }
    }

    public function jarvisDiscard(ServerRequestInterface $request): ResponseInterface
    {
        $this->requireCommanderPermission($request, 'grav-commander.browse');
        $this->requireCommanderPermission($request, 'grav-jarvis.use');
        $this->assertJarvisIntegrationEnabled();
        $body = $this->jarvisBody($request, ['root', 'path']);
        try {
            $this->jarvis()->discard(
                $this->jarvisActor($request),
                (string) $this->getRouteParam($request, 'id'),
                $this->jarvisString($body, 'root', 64),
                $this->jarvisString($body, 'path', 2048)
            );
            return ApiResponse::create(['discarded' => true]);
        } catch (JarvisIntegrationException $error) {
            throw $this->jarvisApiFailure($error);
        }
    }

    private function jarvis(): JarvisIntegrationService
    {
        $cache = '';
        $locator = $this->grav['locator'] ?? null;
        if (is_object($locator) && method_exists($locator, 'findResource')) {
            $cache = (string) $locator->findResource('cache://');
        }
        if ($cache === '') {
            throw new ApiException(503, 'Jarvis Unavailable', 'Commander temporary proposal storage is unavailable.');
        }
        $config = (array) $this->grav['config']->get('plugins.grav-commander.jarvis', []);
        $maxContextBytes = max(4096, min(262144, (int) ($config['max_context_bytes'] ?? JarvisContextPolicy::DEFAULT_CONTEXT_BYTES)));
        $maxLargeContextBytes = max(
            $maxContextBytes,
            min(2097152, (int) ($config['max_large_context_bytes'] ?? JarvisContextPolicy::DEFAULT_LARGE_CONTEXT_BYTES))
        );
        return new JarvisIntegrationService(
            $this->grav,
            $this->service(),
            new JarvisContextPolicy($maxContextBytes, $maxLargeContextBytes),
            new JarvisProposalStore(rtrim($cache, '/\\') . '/grav-commander/jarvis-proposals'),
            $this->jarvisSiteScope()
        );
    }

    private function jarvisIntegrationEnabled(): bool
    {
        return (bool) $this->grav['config']->get('plugins.grav-commander.jarvis.enabled', true);
    }

    private function assertJarvisIntegrationEnabled(): void
    {
        if (!$this->jarvisIntegrationEnabled()) {
            throw new ApiException(503, 'Jarvis Unavailable', 'The optional Commander Jarvis integration is disabled.');
        }
    }

    /** @param list<string> $allowed @return array<string, mixed> */
    private function jarvisBody(ServerRequestInterface $request, array $allowed): array
    {
        $body = $this->getRequestBody($request);
        if (array_diff(array_keys($body), $allowed) !== []) {
            throw new ValidationException('The Commander Jarvis request contains unsupported fields.');
        }
        return $body;
    }

    /** @param array<string, mixed> $body */
    private function jarvisString(array $body, string $key, int $maxBytes, bool $allowEmpty = false): string
    {
        $value = $body[$key] ?? null;
        if (!is_string($value) || (!$allowEmpty && trim($value) === '') || strlen($value) > $maxBytes
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1) {
            throw new ValidationException("The {$key} field is invalid or exceeds its safety limit.");
        }
        return $value;
    }

    /** @param array<string, mixed> $body */
    private function jarvisOptionalString(array $body, string $key, int $maxBytes): ?string
    {
        if (!isset($body[$key]) || $body[$key] === '') return null;
        return $this->jarvisString($body, $key, $maxBytes);
    }

    private function jarvisProviderId(ServerRequestInterface $request): string
    {
        $id = trim(rawurldecode((string) $this->getRouteParam($request, 'id')));
        if (preg_match('/^[a-z][a-z0-9._-]{0,63}$/D', $id) !== 1) {
            throw new ValidationException('The selected Jarvis provider is invalid.');
        }
        return $id;
    }

    private function jarvisActor(ServerRequestInterface $request): string
    {
        $user = $this->getUser($request);
        foreach (['username', 'email', 'id'] as $property) {
            if (is_object($user) && method_exists($user, 'get')) {
                $value = $user->get($property);
                if (is_scalar($value) && (string) $value !== '') return $property . ':' . (string) $value;
            }
        }
        return 'authenticated:' . (is_object($user) ? spl_object_id($user) : 'unknown');
    }

    private function jarvisSiteScope(): string
    {
        $locator = $this->grav['locator'] ?? null;
        $userPath = is_object($locator) && method_exists($locator, 'findResource')
            ? (string) $locator->findResource('user://')
            : '';
        return 'site:' . hash('sha256', $userPath !== '' ? $userPath : 'grav-default-site');
    }

    private function jarvisApiFailure(JarvisIntegrationException $error): ApiException
    {
        [$status, $title] = match ($error->category) {
            'rate_limited' => [429, 'Provider Rate Limited'],
            'context_too_large', 'unsafe_partial_rewrite', 'unsupported_file', 'sensitive_file',
            'empty_context', 'invalid_context', 'invalid_action', 'invalid_model',
            'unsupported_capability', 'budget_exceeded' => [422, 'Jarvis Action Unavailable'],
            'proposal_conflict' => [409, 'Proposal Conflict'],
            'response_invalid' => [502, 'Invalid Provider Response'],
            default => [503, 'Jarvis Unavailable'],
        };
        return new ApiException(
            statusCode: $status,
            errorTitle: $title,
            detail: $error->getMessage(),
            errorCode: 'commander_jarvis_' . preg_replace('/[^a-z0-9_]+/', '_', $error->category)
        );
    }
}
