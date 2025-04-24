# syntax=docker/dockerfile:1.4

#############################
# Source Stage – copy your FileRise app
#############################
FROM ubuntu:24.04 AS appsource
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*  # clean up apt cache

RUN mkdir -p /var/www && rm -f /var/www/html/index.html
COPY . /var/www

#############################
# Composer Stage – install PHP dependencies
#############################
FROM composer:2 AS composer
WORKDIR /app
COPY --from=appsource /var/www/composer.json /var/www/composer.lock ./
RUN composer install --no-dev --optimize-autoloader  # production-ready autoloader

#############################
# Final Stage – runtime image
#############################
FROM ubuntu:24.04
LABEL by=error311

ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    LC_ALL=C.UTF-8 LANG=en_US.UTF-8 LANGUAGE=en_US.UTF-8 TERM=xterm \
    UPLOAD_MAX_FILESIZE=5G POST_MAX_SIZE=5G TOTAL_UPLOAD_SIZE=5G \
    PERSISTENT_TOKENS_KEY=default_please_change_this_key \
    PUID=99 PGID=100

# Install Apache, PHP, and required extensions
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      apache2 php php-json php-curl php-zip php-mbstring php-gd php-xml \
      ca-certificates curl git openssl && \
    apt-get clean && rm -rf /var/lib/apt/lists/*  # slim down image

# Remap www-data to the PUID/PGID provided for safe bind mounts
RUN set -eux; \
    if [ "$(id -u www-data)" != "${PUID}" ]; then usermod -u "${PUID}" www-data; fi; \
    if [ "$(id -g www-data)" != "${PGID}" ]; then groupmod -g "${PGID}" www-data 2>/dev/null || true; fi; \
    usermod -g "${PGID}" www-data

# Copy config, code, and vendor
COPY custom-php.ini /etc/php/8.3/apache2/conf.d/99-app-tuning.ini
COPY --from=appsource /var/www /var/www
COPY --from=composer /app/vendor /var/www/vendor

# Secure permissions: code read-only, only data dirs writable
RUN chown -R root:www-data /var/www && \
    find /var/www -type d -exec chmod 755 {} \; && \
    find /var/www -type f -exec chmod 644 {} \; && \
    mkdir -p /var/www/public/uploads /var/www/users /var/www/metadata && \
    chown -R www-data:www-data /var/www/public/uploads /var/www/users /var/www/metadata && \
    chmod -R 775 /var/www/public/uploads /var/www/users /var/www/metadata  # writable upload areas

# Apache site configuration
RUN cat <<'EOF' > /etc/apache2/sites-available/000-default.conf
<VirtualHost *:80>
    # Global settings
    TraceEnable off
    KeepAlive On
    MaxKeepAliveRequests 100
    KeepAliveTimeout 5
    Timeout 60

    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/public

    # Security headers for all responses
    <IfModule mod_headers.c>
      Header always set X-Frame-Options "SAMEORIGIN"
      Header always set X-Content-Type-Options "nosniff"
      Header always set X-XSS-Protection "1; mode=block"
      Header always set Referrer-Policy "strict-origin-when-cross-origin"
    </IfModule>

    # Compression
    <IfModule mod_deflate.c>
      AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript application/json
    </IfModule>

    # Cache static assets
    <IfModule mod_expires.c>
      ExpiresActive on
      ExpiresByType image/jpeg      "access plus 1 month"
      ExpiresByType image/png       "access plus 1 month"
      ExpiresByType text/css        "access plus 1 week"
      ExpiresByType application/javascript "access plus 3 hour"
    </IfModule>

    # Protect uploads directory
    Alias /uploads/ /var/www/uploads/
    <Directory "/var/www/uploads/">
        Options -Indexes
        AllowOverride None
        <IfModule mod_php7.c>
           php_flag engine off
        </IfModule>
        <IfModule mod_php.c>
           php_flag engine off
        </IfModule>
        Require all granted
    </Directory>

    # Public directory
    <Directory "/var/www/public">
        AllowOverride All
        Require all granted
        DirectoryIndex index.html index.php
    </Directory>

    # Deny access to hidden files
    <FilesMatch "^\.">
      Require all denied
    </FilesMatch>

    ErrorLog /var/www/metadata/log/error.log
    CustomLog /var/www/metadata/log/access.log combined
</VirtualHost>
EOF

# Enable required modules
RUN a2enmod rewrite headers

EXPOSE 80 443
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]