# Installing Edison Home

You need an LG webOS TV, a Windows, Mac or Linux computer on the same network, and [Node.js](https://nodejs.org) 22 or newer. So far it has only been tested from Windows.

## 1. Turn on Developer Mode on the TV
1. On a computer, create a free account at [webOS TV Developer](https://webostv.developer.lge.com).
2. On the TV, open the app store, then find and install **Developer Mode**.
3. Open it, sign in with that account, and turn **Dev Mode Status** on. The TV restarts.
4. Open it again and note the passphrase on the screen. You'll need it in step 3.

## 2. Find your TV's IP address
On the TV, go to Settings, General, Network, then your connection. It looks like `192.168.0.33`.

## 3. Run the installer
Unzip the download, open a terminal in that folder, and run:

```
npm install
node install.js
```

It will walk you through this:
1. Type the TV's IP address.
2. Turn **Key Server** on in the Developer Mode app, then press Enter on the computer.
3. Type the passphrase from the TV. LG's tool shows it on screen as you type, so don't do this while sharing your screen or a log. Turn Key Server off afterward.
4. Press **Accept** on the TV when it asks. This lets the installer read your app list, and nothing else.
5. Wait about half a minute. Edison Home opens by itself.

## Using it
- Open it from the app bar. To add a shortcut, keep it open and hold a number key on the remote until LG's Quick Access offers to assign it.
- Hold OK on an app to move or hide it. Settings is the gear in the bottom rail.
- For weather, go to Settings, press **WEATHER**, and type your city name. ZIP codes don't look up reliably.

## Keeping it running
- **Extend Developer Mode before it runs out.** Open the Developer Mode app and press Extend. If the timer runs out, the TV removes the app on its next restart, and you'd need to install again.
- **Got a new app on your TV?** Run `node install.js` again.

## Removing it

```
node install.js uninstall
```

To turn Developer Mode off too, switch it off in the Developer Mode app.

## If something goes wrong
- **"Could not reach the TV":** check that the TV is on, and on the same network as the computer.
- **A key or passphrase error:** turn Key Server on and try again. If it keeps failing, delete the `edison-home-tv` line with `npx ares-setup-device --remove edison-home-tv` and run the installer again.
- **Still stuck?** [Open an issue](https://github.com/floridagraham/edison-home/issues) with your TV model and webOS version.
