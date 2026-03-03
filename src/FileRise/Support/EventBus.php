<?php

declare(strict_types=1);

namespace FileRise\Support;

use Throwable;

final class EventBus
{
    /**
     * @var null|callable(array<string,mixed>):void
     */
    private static $listener = null;

    /**
     * Register a single listener for automation events.
     * New registrations replace the previous listener.
     */
    public static function register(callable $listener): void
    {
        self::$listener = $listener;
    }

    /**
     * Emit an event envelope to the registered listener (if any).
     * Never throws.
     *
     * @param array<string,mixed> $payload
     */
    public static function emit(string $event, array $payload = []): void
    {
        $listener = self::$listener;
        if ($listener === null) {
            return;
        }

        $event = trim($event);
        if ($event === '') {
            return;
        }

        try {
            $listener([
                'version' => 1,
                'event' => $event,
                'timestamp' => time(),
                'payload' => $payload,
            ]);
        } catch (Throwable $e) {
            error_log('EventBus listener error: ' . $e->getMessage());
        }
    }
}
