# End-to-end (e2e) tests for web

Browser tests written in plain English for [Kane CLI](https://www.testmuai.com/kane-cli/).

| Test | What it covers |
|---|---|
| `setup_test.md` | Creating the first user and logging in |
| `files_test.md` | First user and login, then creating a folder and a file |

## Run

Start a fresh instance on port 4900:

```bash
docker run -d --name filerise-e2e -p 4900:80 -e PERSISTENT_TOKENS_KEY=e2e-tokens-key error311/filerise-docker:latest
npm install -g @testmuai/kane-cli
kane-cli login
kane-cli testmd run e2e/kane/setup_test.md
kane-cli testmd run e2e/kane/files_test.md
```

Both tests start from the first-user form, so recreate the container before each run.
