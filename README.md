# File Uploader

A simple file uploader web app that allows authenticated users to upload, list, and delete files. 
The application uses PHP, running on Apache2, Ubuntu (but definitely should work everywhere).

## Prerequisites

- Apache2, configured, up and running
- PHP 8.1 or higher
- Required PHP extensions: `php-json`, `php-curl`

Hint:
```
sudo apt update
sudo apt install apache2
sudo apt install php libapache2-mod-php
```

## Installation

  ### Clone 
   ```
   git clone https://github.com/sensboston/uploader.git
   cd uploader
   ```
   ### or download this repository
   ```
   wget https://github.com/sensboston/uploader/archive/refs/heads/master.zip
   unzip master.zip -d uploader
   mv uploader/uploader-master/* uploader/
   rm -r uploader/uploader-master
   rm master.zip
   ```

  ### Configure PHP
  Note: adjust PHP version in paths

  Ensure the following PHP settings are in your **/etc/php/8.1/apache2/php.ini**:
  ```
  log_errors = On
  error_log = /var/log/php_errors.log
  ```
  
  Also check for max upload file/post size limits in **/etc/php/8.1/apache2/php.ini** (adjust to your needs, like 10G):
  ```
  upload_max_filesize = 10M
  post_max_size = 10M
  ```

  ### Create the upload directory and set the necessary permissions:

  ```
  sudo mkdir -p /var/www/html/upload
  sudo chown -R www-data:www-data /var/www/html/upload
  sudo chmod -R 755 /var/www/html/upload
  ```

  ### Do not forget to add proper permissions to www-data (used by apache & php)
  ```
  sudo chown -R www-data:www-data /var/www/html/upload
  sudo chmod -R 775 /var/www/html/upload
  ```

  ### Create application directory at webroot (or configure app/site):
  (note: with my Apache configuration, I just need to create a subdirectory)
  ```
  sudo mkdir -p /var/www/html/uploader
  ```

  ### Edit file config.php and adjust variables
  (website name, time zone etc.)
  ```
  sudo nano /home/ubuntu/uploader/config.php
  ```
  ### Edit file users.txt:
  This file lists pseudo-users for upload access authentication, in the format **username:password**. 
  These pseudo-users have **nothing to do** with Linux users and only serve as **an additional layer** of protection! 
  Please **do not use your real login credentials** for this file!
  Also, be sure to check if you copied the **.htaccess** file with content (that denies access to **users.txt** file)
  ```
  <Files "users.txt">
    Order Allow,Deny
    Deny from all
  </Files>
  ```

  ### Copy all app files (html, php & js) to the app folder:
  ```
  sudo cp /home/ubuntu/uploader/*.* /var/www/html/uploader/
  ```

  ### Restart Apache to apply changes:

  ```
  sudo systemctl restart apache2
  ```

## Usage
Open your web browser and navigate to https://yourserveraddress/uploader

Enter username and password, stored in **user.txt** to authenticate.

Choose a file to upload and click the "Upload" button.

The uploaded files will be listed on the page, and you can delete them using the "Delete" button.

![screenshot](https://github.com/sensboston/uploader/assets/1036158/5428672d-7dcc-4d7a-a96f-dfe578618c75)

## Issues / TODO
  - Add JS check for upload file size, before starting actual upload.
