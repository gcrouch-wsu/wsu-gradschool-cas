# GradCAS API explorer

This is a small local Python CLI for testing a Liaison CAS API account without putting credentials in git.

## Why this exists

Liaison's documentation says the CAS API normally requires:

- `x-api-key`
- a sign-in call to get an auth token
- a username and password in addition to the API key

It also says the CAS API includes an Applicant API and a Configuration API, and that program-related branding data is available through the Configuration API.

## Setup

1. Copy `.env.gradcas.example` to `.env.gradcas`.
2. Fill in your CAS API values.
3. Run commands from the repo root.

## Examples

Validate your credentials:

```powershell
python tools/gradcas/client.py token
```

Call an endpoint directly:

```powershell
python tools/gradcas/client.py get /v1/applicationForms
```

Pass query string values:

```powershell
python tools/gradcas/client.py get /v1/some/path --query applicationFormId=12345
```

Save a response locally:

```powershell
python tools/gradcas/client.py get /v1/applicationForms --save gradcas-response-forms.json
```

POST JSON:

```powershell
python tools/gradcas/client.py post /v1/some/path --json "{\"example\": true}"
```

## Notes

- Default API root is `https://api.liaisonedu.com`.
- Default auth path is `/v1/auth/token`.
- If Liaison gave you a different root URL or token path, override it in `.env.gradcas`.
- If `token` works but an endpoint returns `403`, your account likely lacks access to that API area.
