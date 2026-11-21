---
mode: testing
url: http://localhost:4900/
max_steps: 30
---

# First user and login

## Create the first user
Verify the "Create New User" form is shown.
Type "alexmorgan" as the Username and "FileRise-Test-2026" as the Password, check "Grant Admin Access", then click "Save User".
Verify the "Please log in to continue" form is shown.

## Log in
Type "alexmorgan" as the User and "FileRise-Test-2026" as the Password, then click "Login".
Verify the header shows "alexmorgan" and the file list shows "Files in (root)" with "No files found.".
