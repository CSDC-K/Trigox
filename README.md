
# Trigox 0.1.0 FULL
[![Rust Edition](https://img.shields.io/badge/Rust-2024_Edition-ce4431?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org/)
[![Built with Tauri](https://img.shields.io/badge/built%20with-Tauri-24C8D8?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
![App Type](https://img.shields.io/badge/App-GUI-blue?style=flat-square)
![Status](https://img.shields.io/badge/Status-Active-238636?style=flat-square)
![License](https://img.shields.io/badge/License-MIT-6e7681?style=flat-square)


<img src="logo.png" alt="Trigox Logo" width="500px" max-width="300px" height="300px"/>

## What is Trigox?

Basically **Trigox** is a fully async Computer watcher (yeah a lil goofy describing)

## How is it works?

When your selected **Condition** is fires **Actions** are runs.

**Actions** are selected by user in creating trigger phase.

## Create your first trigger with that document!

## Installation for ubuntu

first be sure your webkit is up-to-date

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
  libwebkit2gtk-4.0-dev \
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

then install trigox using .deb file
```bash
sudo apt install ./trigox_*_amd64.deb
```

now you can run it like:
```bash
trigox
```

### Warning

in ubuntu 24 lts and before versions of 24 lts, it's runnable but except notification system. I recommending to use notify-send if you want to send a notification.


| STEP | Usage |
| --- |  ---  |
| 1) Choosing trigger type | <img src="ss1.png" alt="Trigger Selection"/>|
| 2) Configuring trigger   | <img src="ss2.png" alt="Trigger Selection"/>|
| 3) If you wanting to see webhook doc and others | <img src="ss3.png" alt="Trigger Selection"/>|
| 4) Checking doc page | <img src="ss4.png" alt="Trigger Selection"/>|
| 5) After creating trigger | <img src="ss5.png" alt="Trigger Selection"/>|
| 6) Making changes after creating trigger | <img src="ss6.png" alt="Trigger Selection"/>|

## Used TECHS
| Tech | Where |
| --- |  ---  |
| Vanilla CSS, HTML, TS | Frontend and talking with rust side |
| Tauri | Bridge between states, frontend and backend |
| Rust | Creating ,listening triggers and talking with typescript side |


## Tested distros

| Distro | Desc |
| --- |  ---  |
| CachyOS | I just got CachyOS so i just tried in CachyOS |

**Note: old versions of ubuntu like before 2023 it might be not work on your distro cause of glibc version. Please test it in latest or new distros.**

## Used AIs

| LLM | Usage |
| --- |  ---  |
| Copilot | pressing tab :D |
| Gemini | For Researchs |
