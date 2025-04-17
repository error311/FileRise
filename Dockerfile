# syntax=docker/dockerfile:1.4

#############################
# Source Stage – copy your FileRise app
#############################
FROM ubuntu:24.04 AS appsource
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# prepare the folder and remove Apache’s default index
RUN mkdir -p /var/www && rm -f /var/www/html/index.html

# **Copy the FileRise source** (where your composer.json lives)
COPY . /var/www

#############################
# Composer Stage – install PHP dependencies
#############################
FROM composer:2 AS composer
WORKDIR /app

# **Copy composer files from the source** and install
COPY --from=appsource /var/www/composer.json /var/www/composer.lock ./
RUN composer install --no-dev --optimize-autoloader

#############################
# Final Stage – runtime image
#############################
FROM ubuntu:24.04

LABEL by=error311

# Set basic environment variables
ENV DEBIAN_FRONTEND=noninteractive \
    HOME=/root \
    LC_ALL=C.UTF-8 \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US.UTF-8 \
    TERM=xterm \
    UPLOAD_MAX_FILESIZE=5G \
    POST_MAX_SIZE=5G \
    TOTAL_UPLOAD_SIZE=5G \
    PERSISTENT_TOKENS_KEY=default_please_change_this_key

ARG PUID=99
ARG PGID=100

# Install Apache, PHP, and required extensions
RUN apt-get update && \
    apt-get upgrade -y && \
    apt-get install -y --no-install-recommends \
      apache2 php php-json php-curl php-zip php-mbstring php-gd \
      ca-certificates curl git openssl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Fix www-data UID/GID
RUN set -eux; \
    if [ "$(id -u www-data)" != "${PUID}" ]; then usermod -u ${PUID} www-data || true; fi; \
    if [ "$(id -g www-data)" != "${PGID}" ]; then groupmod -g ${PGID} www-data || true; fi; \
    usermod -g ${PGID} www-data

# Copy application code and vendor directory
COPY custom-php.ini /etc/php/8.3/apache2/conf.d/99-app-tuning.ini
COPY --from=appsource /var/www /var/www
COPY --from=composer  /app/vendor /var/www/vendor

# Fix ownership & permissions
RUN chown -R www-data:www-data /var/www && chmod -R 775 /var/www

# Create a symlink for uploads folder in public directory.
RUN cd /var/www/public && ln -s ../uploads uploads

# Configure Apache
RUN cat <<'EOF' > /etc/apache2/sites-available/000-default.conf
<VirtualHost *:80>
    ServerAdmin webmaster@localhost
    DocumentRoot /var/www/public
    <Directory "/var/www/public">
        AllowOverride All
        Require all granted
        DirectoryIndex index.php index.html
    </Directory>
    ErrorLog /var/log/apache2/error.log
    CustomLog /var/log/apache2/access.log combined
</VirtualHost>
EOF

# Enable the rewrite and headers modules
RUN a2enmod rewrite headers

# Expose ports and set up start script
EXPOSE 80 443
COPY start.sh /usr/local/bin/start.sh
RUN chmod +x /usr/local/bin/start.sh

CMD ["/usr/local/bin/start.sh"]