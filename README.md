# Jailbreak My TV

It's your TV. Take back its home screen for free: your apps, your order, none of the clutter, with Edison, a small British butler, floating above it all. LG webOS TVs first, more TVs later.

A jailbreak in spirit, not a root hack: it uses LG's own Developer Mode, with no root and no exploit, and one command takes it back off. The app shows up on your TV as Edison Home.

**[Get it at heyedison.ai/tv](https://heyedison.ai/tv)** · **[Support it on Ko-fi](https://ko-fi.com/heyedison)** (optional)

This is for tinkerers. It is not in LG's app store, so it installs through LG Developer Mode from a computer. The installer walks you through each step in about 15 minutes, and on Windows you start it by double-clicking **Jailbreak My TV**. If something breaks, run it again: it checks itself and repairs what it can. Want an AI helper beside you? The installer copies a ready-made prompt for it. See **[the install guide](INSTALL.md)**.

## What it does
- Shows your TV's apps, with LG's extras and games hidden from the start. Hold OK on one to move or hide it, and bring any back in Settings.
- Gives each app a one-color icon, made during install from the icon already on your TV. No logos come with the download. Any app whose icon can't be used shows its first letter.
- Six moving backgrounds and a still, or Random, which fades to a new one about once a minute.
- Colors and layouts you can change in Settings, and weather for your city if you want it.
- Edison speaks when you open apps or click on him. You can turn his voice off.

## What it does not do
- It doesn't replace the Home button or open when the TV turns on. You open it from the app bar, or hold a number key on the remote to give it a shortcut.
- It has no accounts, ads or tracking. The only outside service is Open-Meteo, and only if you pick a weather city.

## Good to know
- **Tested on one TV:** an LG 65UR9000PUA on webOS 25, installed from Windows. Others may work. Please open an issue with your model either way.
- **Developer Mode runs out.** LG gives you about 1,000 hours at a time. Open the Developer Mode app and press Extend before then, or the TV removes the app.
- **New apps on your TV** show up after you run `node install.js` again. webOS doesn't let a web app read the app list itself.
- It comes with no warranty, and you install it at your own risk.

## Code
`app/` is the TV app, `install.js` is the installer, and `installer/` holds the Windows button and its source. The code is MIT licensed. The Edison name, character, voice and artwork are not, so a version you build yourself needs its own. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

Not made by or connected with LG.
