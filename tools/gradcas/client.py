#!/usr/bin/env python3
"""Minimal Liaison CAS API client for local exploration."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


DEFAULT_ENV_FILE = Path(".env.gradcas")
DEFAULT_BASE_URL = "https://api.liaisonedu.com"
DEFAULT_TOKEN_PATH = "/v1/auth/token"


def load_env_file(path: Path) -> None:
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def get_settings(env_file: Path) -> dict[str, str]:
    load_env_file(env_file)

    settings = {
        "base_url": os.environ.get("GRADCAS_BASE_URL", DEFAULT_BASE_URL).rstrip("/"),
        "token_path": os.environ.get("GRADCAS_TOKEN_PATH", DEFAULT_TOKEN_PATH),
        "api_key": os.environ.get("GRADCAS_API_KEY", ""),
        "username": os.environ.get("GRADCAS_USERNAME", ""),
        "password": os.environ.get("GRADCAS_PASSWORD", ""),
    }

    missing = [name for name in ("api_key", "username", "password") if not settings[name]]
    if missing:
        joined = ", ".join(missing)
        raise SystemExit(
            f"Missing required GradCAS settings: {joined}. "
            f"Populate {env_file} or export the corresponding environment variables."
        )

    return settings


def normalize_path(path: str) -> str:
    return path if path.startswith("/") else f"/{path}"


def parse_key_value_pairs(pairs: list[str]) -> dict[str, str]:
    data: dict[str, str] = {}
    for pair in pairs:
        if "=" not in pair:
            raise SystemExit(f"Expected key=value, got: {pair}")
        key, value = pair.split("=", 1)
        data[key] = value
    return data


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str],
    body: dict[str, Any] | None = None,
) -> tuple[int, Any]:
    payload = None
    final_headers = dict(headers)
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        final_headers["Content-Type"] = "application/json"

    req = Request(url, method=method.upper(), headers=final_headers, data=payload)
    try:
        with urlopen(req, timeout=30) as response:
            raw = response.read().decode("utf-8")
            return response.status, json.loads(raw) if raw else {}
    except HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {"error": exc.reason}
        except json.JSONDecodeError:
            parsed = {"error": raw or exc.reason}
        return exc.code, parsed
    except URLError as exc:
        raise SystemExit(f"Network error calling {url}: {exc}") from exc


def sign_in(settings: dict[str, str]) -> tuple[int, Any]:
    token_url = f"{settings['base_url']}{normalize_path(settings['token_path'])}"
    return request_json(
        "POST",
        token_url,
        headers={"x-api-key": settings["api_key"]},
        body={"UserName": settings["username"], "Password": settings["password"]},
    )


def auth_token_from_response(data: Any) -> str:
    if isinstance(data, dict):
        for key in ("Token", "token", "idToken", "IdToken", "access_token"):
            value = data.get(key)
            if isinstance(value, str) and value:
                return value
    raise SystemExit("Sign-in succeeded but no auth token field was found in the response.")


def call_api(
    settings: dict[str, str],
    method: str,
    path: str,
    *,
    query: dict[str, str],
    body: dict[str, Any] | None,
) -> tuple[int, Any]:
    sign_in_status, sign_in_data = sign_in(settings)
    if sign_in_status >= 400:
        return sign_in_status, {"auth_error": sign_in_data}

    token = auth_token_from_response(sign_in_data)
    url = f"{settings['base_url']}{normalize_path(path)}"
    if query:
        url = f"{url}?{urlencode(query)}"

    return request_json(
        method,
        url,
        headers={
            "x-api-key": settings["api_key"],
            "Authorization": token,
        },
        body=body,
    )


def pretty_print(data: Any) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def parse_json_body(body_text: str | None, body_file: str | None) -> dict[str, Any] | None:
    if body_text and body_file:
        raise SystemExit("Use either --json or --json-file, not both.")
    if body_text:
        return json.loads(body_text)
    if body_file:
        return json.loads(Path(body_file).read_text(encoding="utf-8"))
    return None


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Explore Liaison CAS API endpoints from a local .env.gradcas file."
    )
    parser.add_argument(
        "--env-file",
        default=str(DEFAULT_ENV_FILE),
        help="Path to a GradCAS env file. Default: .env.gradcas",
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    token_parser = subparsers.add_parser("token", help="Validate credentials and print token metadata.")
    token_parser.add_argument("--show-token", action="store_true", help="Print the full auth token.")

    for method in ("get", "post"):
        cmd = subparsers.add_parser(method, help=f"{method.upper()} a CAS API path.")
        cmd.add_argument("path", help="API path, for example /v1/applicationForms")
        cmd.add_argument(
            "--query",
            action="append",
            default=[],
            help="Query parameter in key=value format. Repeat as needed.",
        )
        if method == "post":
            cmd.add_argument("--json", help="Inline JSON body.")
            cmd.add_argument("--json-file", help="Path to a JSON file to send as the body.")
        cmd.add_argument("--save", help="Write the response body to a file.")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    env_file = Path(args.env_file)
    settings = get_settings(env_file)

    if args.command == "token":
        status, data = sign_in(settings)
        print(f"HTTP {status}")
        if status >= 400:
            pretty_print(data)
            return 1

        if not args.show_token and isinstance(data, dict):
            masked = dict(data)
            token = masked.get("Token") or masked.get("token")
            if isinstance(token, str) and len(token) > 12:
                masked["Token"] = f"{token[:8]}...{token[-4:]}"
            pretty_print(masked)
        else:
            pretty_print(data)
        return 0

    query = parse_key_value_pairs(getattr(args, "query", []))
    body = parse_json_body(getattr(args, "json", None), getattr(args, "json_file", None))
    status, data = call_api(settings, args.command.upper(), args.path, query=query, body=body)

    print(f"HTTP {status}")
    pretty_print(data)

    if getattr(args, "save", None):
        save_path = Path(args.save)
        save_path.write_text(json.dumps(data, indent=2, sort_keys=True), encoding="utf-8")
        print(f"Saved response to {save_path}")

    return 0 if status < 400 else 1


if __name__ == "__main__":
    sys.exit(main())
