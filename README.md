
# Trigox 0.1.0 FULL
[![Rust Edition](https://img.shields.io/badge/Rust-2024_Edition-ce4431?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![App Type](https://img.shields.io/badge/App-GUI-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-238636?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-6e7681?style=flat-square)


<img src="logo.png" alt="Trigox Logo" width="500px" max-width="300px" height="300px"/>

## What is Trigox?

**Trigox** is a fully async computer watcher (yeah, a little goofy way to describe it).

You create **triggers**: each one watches a **condition** (a file, a folder or an app) and runs **actions** (webhooks, shell scripts or notifications) when that condition fires.

## How does it work?

When the **condition** you selected fires, the **actions** you chose run.

You pick the actions while creating the trigger.

## Create your first trigger

1. Choose a trigger type (file, folder or app).
2. Configure the condition and the actions.
3. Save it — Trigox starts watching right away.

The screenshots under *Installation* show each step.

## Installation (Ubuntu)

First, make sure WebKit and the other dependencies are up to date:

```bash
sudo apt update && sudo apt install -y \
  libnotify4 \
  libnotify-bin \
  libnotify-dev \
  notification-daemon \
  dbus-x11 \
  d-feet \
  gir1.2-notify-0.7 \
  libwebkit2gtk-4.1-dev \
  libappindicator3-1 \
  libappindicator3-dev \
  librsvg2-common \
  libasound2-dev \
  libglib2.0-dev \
  libgtk-3-dev \
  xdg-desktop-portal \
  xdg-desktop-portal-gtk \
  zenity
```

Then install Trigox from the `.deb` file:
```bash
sudo apt install ./trigox_*_amd64.deb
```

Now you can run it:
```bash
trigox
```

### Notification bug (fixed)

On Ubuntu 24.04 LTS and older, notifications used to fail. This is fixed now. If you still have problems, use `notify-send` as an action instead.


| STEP | Usage |
| --- |  ---  |
| 1) Choosing trigger type | <img src="ss1.png" alt="Trigger Selection"/>|
| 2) Configuring trigger   | <img src="ss2.png" alt="Trigger Selection"/>|
| 3) Opening the webhook docs and others | <img src="ss3.png" alt="Trigger Selection"/>|
| 4) Checking doc page | <img src="ss4.png" alt="Trigger Selection"/>|
| 5) After creating trigger | <img src="ss5.png" alt="Trigger Selection"/>|
| 6) Making changes after creating trigger | <img src="ss6.png" alt="Trigger Selection"/>|

## Tech stack
| Tech | Where |
| --- |  ---  |
| Vanilla CSS, HTML, TS | Frontend and talking with rust side |
| Tauri | Bridge between states, frontend and backend |
| Rust | Creating and listening to triggers, talking with the TypeScript side |


## Tested distros

| Distro | Desc |
| --- |  ---  |
| CachyOS | My daily system |
| Ubuntu 24.04 LTS | Tested on a live boot (the old notification bug is fixed) |

**Note:** Ubuntu versions from before 2023 may not work because of their older glibc. Please use a recent distro.

## AI tools used

| LLM | Usage |
| --- |  ---  |
| Copilot | pressing tab :D |
| Gemini | Research |
