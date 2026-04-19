# Why Docker & Docker Dash — Beginner's Guide

**Audience:** anyone who's heard of Docker but hasn't really used it.
**Reading time:** ~4 minutes.

> ⏪ [Back to README](../../README.md) · 🇷🇴 [Versiunea română](why-docker-dash-beginners.ro.md)

---

## What is Docker, really?

Imagine your application is a **cooking recipe**. The code is the recipe — but to actually cook, you need a kitchen, ingredients, an oven, all configured exactly right.

The classic problem in software is called **"works on my machine"**. You cook perfectly at home, but when you give the recipe to your friend, theirs comes out different — they have a different oven, a different pan, a different pot.

**Docker fixes this** by putting the recipe + the kitchen + the ingredients into a single sealed box ("container") that runs *identically* wherever you take it: your laptop, your company's server, the cloud, the Raspberry Pi sitting on your shelf.

## Why this is a big deal

- **Install any app in 30 seconds** — no more "open terminal, install Python 3.11 not 3.12, make a symlink, edit a config file…"
- **Uninstall cleanly** — no leftover files scattered through the system, no broken OS
- **Two apps don't fight over the same resources** — each in its own box
- **Backup and migration is easy** — pack the box, send it to another server, runs the same

## OK, I get Docker. Why do I need Docker Dash?

Docker is controlled from **the terminal with text commands**: `docker run`, `docker ps`, `docker logs`, `docker exec`… For someone who doesn't live in the terminal, that's like being asked to program your oven by writing Morse code.

**Docker Dash is the visual control panel for Docker.** Instead of typing:

```bash
docker logs -f --tail 200 my-app | grep ERROR
```

you click on the container, click on "Logs", type "ERROR" in the filter. Done.

## What you see in the first 30 seconds after opening it

- **Every app running**, with live CPU and RAM (like Task Manager)
- **Start / Stop / Restart buttons** for each container
- **Live logs**, searchable, with download buttons
- **Disk statistics** — who's using space and how much
- **"Old" images** not used in weeks — one click to clean them up

## Why Docker Dash and not something else?

| | Docker Dash |
|---|---|
| **Free, no limits** | ✅ Portainer (the most popular alternative) charges $95/year per server for basics like Google login or backups |
| **One single container** | ✅ install with one command, no external database, no complicated setup |
| **80 MB on disk, 50 MB RAM** | ✅ runs on the cheapest VPS or a Raspberry Pi |
| **51 step-by-step guides built in** | ✅ EN + RO, no Googling required |
| **Zero lock-in** | ✅ uninstall Docker Dash → your containers stay running, nothing breaks |

## What you can do in your first hour

1. Install Docker Dash (2 minutes — see [Quick Start](../../README.md#quick-start))
2. See everything running on your server, visually
3. Start a new app (Nextcloud, WordPress, Vaultwarden) with 3 clicks from the built-in templates
4. Set up automatic daily backups
5. Enable 2FA on your admin account

> **Total cost:** zero. Not a trial, not freemium, no credit card required. Open source, MIT license.

## Where to go next

- 👉 [Quick Start](../../README.md#quick-start) — install Docker Dash in 2 minutes
- Open the **Containers** page in the left menu — see what's running
- Try **Templates** to deploy a new app in seconds
- Browse the other How-To Guides inside the app — there are 51 in total covering everything from basic Docker commands to advanced security
- Press **Ctrl + K** anywhere in the app to open the command palette

---

> Already comfortable with git and CI/CD? You'll probably want the [Developer guide](why-docker-dash-developers.md) instead — it skips the basics and goes straight to the git → Docker mental model and how Docker Dash compares to Portainer / Dockge / bash scripts.
