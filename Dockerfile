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
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/public
    Alias /uploads/ /var/www/uploads/
    <Directory "/var/www/uploads/">
        Options -Indexes
        AllowOverride None
        Require all granted
    </Directory>
    <Directory "/var/www/public">
        AllowOverride All
        Require all granted
        DirectoryIndex index.html
    </Directory>
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