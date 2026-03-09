# Pro AI Chat

FileRise Pro AI Chat is a scoped AI assistant layer for FileRise. It covers authenticated app chat, public share copilots, public portal copilots, queued AI workflows, watched automations, and AI agents.

It is not a raw provider console. FileRise stays in control of scope, ACL, workflow dispatch, confirmations, and public-surface limits.

## Where AI appears

FileRise Pro AI currently has 4 main surfaces:

- **App chat** inside the signed-in FileRise UI
- **Public share AI** on shared folder pages when the share has AI enabled
- **Public portal AI** on client portals when the portal has AI enabled
- **Admin AI workspace** under **Automation -> AI**

Related docs:

- [Pro Automation](/docs/?page=pro-automation)
- [Pro client portals](/docs/?page=pro-client-portals)

## What app chat can do

Inside the authenticated FileRise app, AI Chat can help with:

- browsing files and folders in the current allowed scope
- reading text files
- creating files or folders
- renaming files
- moving or copying files
- deleting files or folders when the user has permission
- adding, removing, or clearing tags
- provider-backed extraction and analysis workflows
- FileRise-specific diagnostics and troubleshooting prompts

Examples:

- `List files and folders here.`
- `Read the notes file in this folder.`
- `Create a folder called Processed.`
- `Rename all files that contain invoice to use INV-.`
- `Move the largest 10 files here into Archive.`
- `Tag all images in this folder.`
- `Extract all invoices in this folder to csv.`
- `Transcribe all audio files in this folder and tag them.`
- `/diagnostics`

## Public share AI

Shared folders can expose a public AI assistant when:

- public AI is enabled in admin settings
- the share has **Enable AI Assistant** turned on
- the share is still valid and accessible

Public share AI is intentionally narrower than signed-in app chat.

It is designed for:

- explaining what the share is for
- answering upload/access questions
- listing or discussing files that are already visible in the share
- summarizing visible readable files
- searching visible readable text
- comparing two visible readable files

Important limits:

- public share AI is read-only
- it stays inside the current shared folder scope
- it cannot mutate files or folders
- upload-only or hidden-listing shares do not expose file inspection behavior

Examples:

- `What is this share for?`
- `How do I upload files here?`
- `Summarize the visible text files in this share.`
- `Search the visible files for the contract start date.`
- `Compare file A and file B.`

## Public portal AI

Client portals can also expose a public AI assistant when:

- public AI is enabled in admin settings
- the portal has **Enable AI Assistant** turned on
- the portal is active and accessible

Portal AI can help with:

- upload instructions
- portal purpose and access guidance
- questions about what can be uploaded
- questions about currently available downloadable files
- summarizing or searching readable files that the portal currently exposes

Important limits:

- portal AI is read-only
- it stays inside the configured portal folder scope
- if downloads are disabled, file inspection actions are unavailable
- if uploads are enabled, the assistant can guide users without gaining extra access

Examples:

- `What can I upload here?`
- `Is this portal upload-only?`
- `Summarize the files available in this portal.`
- `Search the visible files for the project number.`

## Guardrails and scope

AI Chat stays inside FileRise guardrails:

- every authenticated action runs as a FileRise user
- source and folder scope are enforced before execution
- Core ACL rules still apply
- public share and portal copilots are forced into read-only profiles
- destructive or bulk plans use preview plus `/confirm <token>`
- admin settings can enable global read-only mode
- public share, portal, and IP-based rate limits apply
- recent AI activity can be reported in admin views

The AI provider does not directly mutate the filesystem. FileRise plans and executes allowed operations through its own guarded backend layer.

## Core operations exposed to AI

The current AI operation catalog includes FileRise-aware actions such as:

- list files and folders
- read file
- create file
- create folder
- rename file
- move files
- copy files
- delete files or folders
- add tags
- remove tags
- clear tags

The catalog is generated from Core so the Pro runtime can use the current operation list and metadata instead of maintaining a separate hardcoded copy.

## Bulk workflows

AI Chat also supports bounded workflows for larger jobs.

Current examples include:

- invoice extraction to CSV/JSON
- structured extraction using an admin-defined schema
- image tagging
- audio transcription
- audio transcription plus tagging
- bulk organize by type
- bulk organize by year
- bulk move
- bulk copy
- bulk delete
- bulk rename
- bulk tag or clear tags

These are registry-driven workflows, not unrestricted freeform automation.

## Analysis modes

Depending on the workflow and available tooling, FileRise AI can use:

- provider vision
- local OCR
- both
- workflow defaults

The admin AI settings page also supports OCR/audio helper paths and a default vision preference.

## Recipes

AI Chat includes:

- built-in recipes
- saved per-user recipes
- pinned recipes
- scope-aware recipe usage
- workflow hints tied to known tasks

This makes common prompts reusable without needing users to remember exact wording.

## AI agents

FileRise Pro also includes AI agents for external or automated callers.

Agents support:

- mapping each agent to a FileRise user
- restricting each agent to a `sourceId` and `rootPath`
- issued bearer tokens
- hashed token storage instead of plaintext token storage
- optional outbound webhooks
- token rotation
- queued processing through the automation worker

Authentication supports:

- `Authorization: Bearer`
- `X-Agent-Token`
- JSON body token

## Watched AI automations

The admin AI workspace adds watched AI rules and approval flows.

These can trigger AI jobs from supported events such as uploads and route them into bounded workflows like:

- invoice extraction
- structured extraction
- image tagging
- audio transcription

Rules can optionally require approval before the job is queued.

## Admin AI workspace

The **Automation -> AI** area includes:

- **Dashboard** for provider/model activity, job counts, approvals, watched-rule coverage, enabled agents, and recent activity
- **Operations** for watched rules, approvals, and agent management
- **Reporting** for recent AI jobs, failures, watched-rule history, blocked approvals, public AI activity, and exports
- **Settings** for provider setup, model selection, limits, read-only mode, public AI controls, OCR/audio tools, extraction schemas, and agent endpoints

## Provider support

Current provider support includes:

- OpenAI
- OpenAI-compatible endpoints
- Claude
- Gemini

Provider keys are stored encrypted at rest. Admin UI responses expose summaries like whether a key is present, rather than returning raw secrets.

## External-provider data egress

If you use an external AI provider, visible file excerpts may be sent to that provider so it can answer the request. That is expected behavior, not a FileRise ACL bypass.

FileRise now shows an external-provider warning in:

- AI Chat
- Admin AI settings

Local or private OpenAI-compatible endpoints are treated differently from clearly external endpoints.

## UI features

Current signed-in app chat UI features include:

- header entry button
- compact chat modal
- scope controls
- built-in and saved recipes
- tips and example prompts
- workflow cards for plans, queued jobs, progress, and results
- job polling
- folder refresh after tool or workflow completion
- data-egress warning when an external provider is active

Current public share and portal UI features include:

- AI launcher card
- example prompts
- assistant message history
- modal dialog UI
- read-only prompt guidance tuned to the current surface

## Security model summary

The intended model is:

- ACL remains the source of truth
- share AI can only see the current share scope
- portal AI can only see the current portal scope
- app chat only acts within the signed-in user's allowed scope
- public AI never exposes raw provider keys or agent secrets
- public AI uses bounded request sizes and abuse limits
- public AI responses use the visible share/portal context, not arbitrary filesystem traversal

## Limits and notes

- very large folders may be capped or truncated in previews or analysis
- some workflows depend on local OCR/vision tooling or provider support
- public share and portal AI are intentionally narrower than signed-in app chat
- older share and portal links remain backward-compatible with default AI behavior unless explicitly disabled
- FileRise Core remains usable without Pro; AI is a Pro feature layer
