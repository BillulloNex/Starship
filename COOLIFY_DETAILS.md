# Coolify Project & Deployment Details — Grokbot

This document contains all fetched configuration details from Coolify for the **Grokbot** project and its deployment environment.

---

## 1. Application Overview

- **Application Name**: `grokbot`
- **Application UUID**: `b13aardv73k5fyl01a80ggzc`
- **Description**: Self-hosted OpenHands AI coding agent
- **Public URL (FQDN)**: [http://grok.beenex.org](http://grok.beenex.org)
- **Current Status**: `running:unknown`
- **Last Online At**: `2026-08-13 03:51:36`
- **Created At**: `2026-08-12T23:26:00.000000Z`
- **Updated At**: `2026-08-13T03:51:36.000000Z`

---

## 2. Coolify Project & Environment

- **Project Name**: `Comfy BackOffice`
- **Project Description**: Comfy BackOffice project for managing LibreChat and internal systems
- **Project UUID**: `j8f68ahwy8q4nbwgbnigfynr` (ID: `75`)
- **Environment**: `production`
- **Environment UUID**: `qetqze4xdpui4miigmsnmtaa` (ID: `75`)

---

## 3. Build & Repository Configuration

- **Git Repository**: `ThomasVuNguyen/Grokbot`
- **Git Branch**: `main`
- **Git Commit SHA**: `HEAD`
- **Build Pack**: `dockerfile`
- **Dockerfile Location**: `/Dockerfile`
- **Base Directory**: `/`
- **Exposed Ports**: `8000`
- **Compose Parsing Version**: `5`
- **Source Type**: `App\Models\GithubApp`

---

## 4. Server & Infrastructure Target

- **Host Name**: `lenovo`
- **Server UUID**: `kw1b1pmbkbwqqrjo3sfh6hbg`
- **IP Address (Tailscale)**: `100.77.63.10`
- **OS**: Linux Mint 22.1 (x86_64, Kernel `6.8.0-55-generic`)
- **Hardware Allocation**: 12 CPUs, ~25 GB RAM
- **Proxy Engine**: Traefik `3.6.17`
- **Wildcard Domain**: `http://beenex.org`

---

## 5. Network Routing & Proxy Rules

- **Traefik Router Rule**: `Host('grok.beenex.org') && PathPrefix('/')`
- **Load Balancer Server Port**: `8000`
- **Redirect Scheme**: `https` (redirects HTTP to HTTPS) / `both`
- **Docker Destination Network**: `coolify`

---

## 6. Environment Variables

| Variable Name | Scope | Build Time | Runtime |
|---|---|---|---|
| `LOCAL_BACKEND_API_KEY` | Production | No | Yes |
| `LOCAL_BACKEND_API_KEY` | Preview (PR) | No | Yes |

---

## 7. Health Check & Resource Limits

- **Health Check Status**: Disabled (`health_check_enabled: false`)
- **Configured Health Path**: `/` (Port 8000, HTTP GET)
- **CPU Shares**: `1024`
- **CPUs Limit**: `0` (Unlimited)
- **Memory Limit**: `0` (Unlimited)

---

## 8. Other Services in the "Comfy BackOffice" Project

The `Comfy BackOffice` project contains the following co-located services:

1. **`grokbot`** (Application) — Self-hosted OpenHands AI coding agent ([http://grok.beenex.org](http://grok.beenex.org))
2. **`librechat`** (Service) — LibreChat instance with MongoDB (`ghcr.io/billullonex/comfyspace-chat:latest`)
3. **`qm`** (Service) — ComfySpace QM multiplayer agent (`qm.beenex.org`)
4. **`coder`** (Service) — Self-hosted Coder AI development sandbox environment (`coder.beenex.org`)
5. **`twenty-crm`** (Service) — Twenty CRM platform with PostgreSQL & Redis (`twenty-q8z4rxfatsg7auhnbcxph6ig.beenex.org`)
