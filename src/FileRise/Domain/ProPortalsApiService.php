<?php

declare(strict_types=1);

namespace FileRise\Domain;

use FileRise\Http\Controllers\AdminController;
use FileRise\Http\Controllers\PortalController;
use FileRise\Http\Controllers\UserController;
use FileRise\Support\EventBus;

final class ProPortalsApiService
{
    /**
     * @param array<string,mixed> $payload
     * @return array{status:int,payload:array<string,mixed>}
     */
    private static function response(int $status, array $payload): array
    {
        return [
            'status' => $status,
            'payload' => $payload,
        ];
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function getPortal(string $slug): array
    {
        $portal = PortalController::getPortalBySlug($slug);
        return self::response(200, [
            'success' => true,
            'portal' => $portal,
        ]);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listPortals(): array
    {
        $ctrl = new AdminController();
        $portals = $ctrl->getProPortals();

        return self::response(200, [
            'success' => true,
            'portals' => $portals,
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function savePortals(array $body, string $actor): array
    {
        $portals = $body['portals'] ?? null;
        if (!is_array($portals)) {
            return self::response(400, [
                'success' => false,
                'error' => 'Invalid or missing "portals" payload',
            ]);
        }

        $ctrl = new AdminController();
        $result = $ctrl->saveProPortals($portals);

        $portalSlugs = array_map('strval', array_keys($portals));
        $sampleSlugs = array_slice($portalSlugs, 0, 20);
        EventBus::emit('portal.save', [
            'user' => $actor,
            'count' => count($portalSlugs),
            'slugs' => $sampleSlugs,
            'truncated' => count($portalSlugs) > count($sampleSlugs),
        ]);

        $payload = ['success' => true];
        if (is_array($result) && !empty($result['portalUsers'])) {
            $payload['portalUsers'] = $result['portalUsers'];
        }

        return self::response(200, $payload);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function listEntries(array $query): array
    {
        $slug = isset($query['slug']) ? trim((string)$query['slug']) : '';
        $path = isset($query['path']) ? (string)$query['path'] : '';
        $page = isset($query['page']) ? (int)$query['page'] : 1;
        $perPage = isset($query['perPage']) ? (int)$query['perPage'] : 50;
        $all = !empty($query['all']);

        $data = PortalController::listPortalEntries($slug, $path, $page, $perPage, $all);
        if (isset($data['error'])) {
            return self::response((int)($data['status'] ?? 400), [
                'success' => false,
                'error' => (string)$data['error'],
            ]);
        }

        return self::response(200, ['success' => true] + $data);
    }

    /**
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function publicMeta(string $slug): array
    {
        $public = PortalPublicMetaService::getPublicPortalMeta($slug);
        return self::response(200, [
            'success' => true,
            'portal' => $public,
        ]);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function submissions(array $query, string $username, bool $isAdmin): array
    {
        if ($username === '' || !$isAdmin) {
            return self::response(403, [
                'success' => false,
                'error' => 'Forbidden',
            ]);
        }

        if (!defined('FR_PRO_ACTIVE') || !FR_PRO_ACTIVE || !defined('FR_PRO_BUNDLE_DIR') || !FR_PRO_BUNDLE_DIR) {
            return self::response(500, [
                'success' => false,
                'error' => 'Server error: FileRise Pro is not active on this instance.',
            ]);
        }

        $slug = isset($query['slug']) ? trim((string)$query['slug']) : '';
        if ($slug === '') {
            return self::response(400, [
                'success' => false,
                'error' => 'Missing slug.',
            ]);
        }

        $submissions = PortalSubmissionsService::listSubmissions($slug, 200);
        $downloads = PortalSubmissionsService::loadDownloadEvents($slug, 400);
        $submissions = PortalSubmissionsService::attachDownloads($submissions, $downloads);

        return self::response(200, [
            'success' => true,
            'slug' => $slug,
            'submissions' => $submissions,
        ]);
    }

    /**
     * @param array<string,mixed> $body
     * @param array<string,mixed> $server
     * @return array{status:int,payload:array<string,mixed>}
     */
    public static function submitForm(array $body, string $submittedBy, array $server): array
    {
        $slug = isset($body['slug']) ? trim((string)$body['slug']) : '';
        if ($slug === '') {
            return self::response(400, [
                'success' => false,
                'error' => 'Missing portal slug',
            ]);
        }

        $portal = PortalController::getPortalBySlug($slug);

        $built = PortalSubmissionsService::buildSubmissionPayload(
            $slug,
            $portal,
            $body,
            $submittedBy,
            $server
        );

        PortalSubmissionsService::storeSubmission($slug, $built['payload']);

        $eventPayload = [
            'user' => $submittedBy,
            'slug' => $slug,
            'submissionRef' => (string)$built['submissionRef'],
        ];
        $portalSourceId = trim((string)($portal['sourceId'] ?? ''));
        if ($portalSourceId !== '') {
            $eventPayload['sourceId'] = $portalSourceId;
        }
        EventBus::emit('portal.form.submit', $eventPayload);

        return self::response(200, [
            'success' => true,
            'submissionRef' => $built['submissionRef'],
        ]);
    }

    public static function uploadPortalLogo(): void
    {
        $ctrl = new UserController();
        $ctrl->uploadPortalLogo();
    }

    public static function uploadBrandLogo(): void
    {
        $ctrl = new UserController();
        $ctrl->uploadBrandLogo();
    }
}
