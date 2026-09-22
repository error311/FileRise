<?php

declare(strict_types=1);

namespace FileRise\WebDAV;

use Sabre\DAV\Server;

final class RequestPath
{
    public static function configure(Server $server, string $basePath, bool $hasNestedUploads): void
    {
        $endpoint = '/webdav.php';
        $publicEndpoint = $basePath . $endpoint;
        $request = $server->httpRequest;
        $path = (string)(parse_url($request->getUrl(), PHP_URL_PATH) ?: '');

        if ($basePath !== '' && self::isWithin($path, $publicEndpoint)) {
            // The proxy (or a real subdirectory install) retained the public prefix.
            $endpoint = $publicEndpoint;
        } elseif (
            $basePath !== '' && self::isWithin($path, $endpoint)
            && in_array($request->getMethod(), ['MOVE', 'COPY'], true)
        ) {
            // Strip only the configured public endpoint prefix. Preserve authority,
            // percent-encoding and the rest of the URI for Sabre's normal validation.
            $destination = $request->getHeader('Destination');
            if ($destination !== null) {
                $pattern = '~^((?i:https?)://[^/?#]+)?' . preg_quote($publicEndpoint, '~') . '(?=/|$)~';
                $normalized = preg_replace_callback(
                    $pattern,
                    static fn(array $match): string => ($match[1] ?? '') . '/webdav.php',
                    $destination,
                    1
                );
                if ($normalized !== null && $normalized !== $destination) {
                    $request->setHeader('Destination', $normalized);
                }
            }
        }

        $legacyEndpoint = $endpoint . '/uploads';
        if (!$hasNestedUploads && self::isWithin($path, $legacyEndpoint)) {
            $endpoint = $legacyEndpoint;
        }
        $server->setBaseUri($endpoint . '/');
    }

    private static function isWithin(string $path, string $prefix): bool
    {
        return $path === $prefix || str_starts_with($path, $prefix . '/');
    }
}
