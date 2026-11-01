# Installing Jailbreak My TV

This puts the Edison Home app on your TV with LG's own Developer Mode. No root and no exploit. You need an LG webOS TV, a Windows, Mac or Linux computer on the same network, and [Node.js](https://nodejs.org) 22 or newer. So far it has only been tested from Windows.

## Start the installer
It tells you what to do at each step, so you can start it first and read along. Unzip the download, then:

- **Windows:** double-click **Jailbreak My TV**, the one with Edison's rainbow icon. If Windows warns about an unknown program, choose More info, then Run anyway. If you don't have Node.js, it opens the download page.
- **Mac or Linux:** install Node.js, open a terminal in the folder, and run:

```
npm install
node install.js
```

## The five steps
1. **Turn on Developer Mode.** On a computer, create a free account at [webOS TV Developer](https://webostv.developer.lge.com). On the TV, open the app store, find and install **Developer Mode**, sign in, and turn **Dev Mode Status** on. The TV restarts.
2. **Find your TV.** On the TV, go to Settings, General, Network, then your connection, and type the IP address. It looks like `192.168.1.50`.
3. **Connect this computer.** Turn **Key Server** on in the Developer Mode app, then type the passphrase from that screen. LG's tool shows it on screen as you type, so don't do this while sharing your screen or a log. Turn Key Server off afterward.
4. **Read your app list.** Press **Accept** on the TV when it asks. This lets the installer read your app list, and nothing else.
5. **Build and install.** Wait about half a minute. Edison Home opens by itself.

## Want an AI helper beside you?
The installer offers to copy this for you when it starts, and again if something fails. You can also paste it into any AI chat, such as Claude, yourself:

```text
Help me install Jailbreak My TV, a free project that puts the Edison Home app on my LG TV. I'm not technical, so go one step at a time.

The instructions are here: https://github.com/floridagraham/jailbreak-my-tv/blob/main/INSTALL.md
If you can't open that link, tell me, and I'll paste the page in.

How to help me:
1. First ask what TV model I have and whether my computer is Windows, Mac or Linux.
2. Give me one step, in plain words. Say where to look and what I should see.
3. Wait for me to say it worked before giving the next step.
4. If something fails, ask me to paste the exact message, then give me the most likely fix first.
5. The installer repairs most problems itself when it runs again, so try that first. Next, have me run "node install.js fix" in the folder and paste its checkup. It's safe to share.
6. Stay with the installer that comes with the download. Don't have me download other tools, root the TV or change TV settings the guide doesn't mention.

Safety rules:
- Never ask for my LG password, my Developer Mode passphrase or my tv.local.json file. If I paste one by accident, tell me.
- Remind me to remove the passphrase from anything I paste.
- Never have me run or paste "ares-setup-device --list". It prints the passphrase.
- If we get stuck after a few tries, help me write a short issue for https://github.com/floridagraham/jailbreak-my-tv/issues with my TV model, webOS version and the error.

Start now with your first question.
```

## Using it
- Open it from the app bar. To add a shortcut, keep it open and hold a number key on the remote until LG's Quick Access offers to assign it.
- Some LG extras and games start hidden on a new install, so the first look is clean. Bring any of them back in Settings, the gear in the bottom rail.
- Hold OK on an app to move or hide it.
- For weather, go to Settings, press **WEATHER**, and type your city name. ZIP codes don't look up reliably.

## Keeping it running
- **Extend Developer Mode before it runs out.** Open the Developer Mode app and press Extend. If the timer runs out, the TV removes the app on its next restart, and you'd need to install again.
- **Got a new app on your TV?** Run `node install.js` again. That also picks up its icon. An app whose icon can't be used shows its first letter.

## Removing it

```
node install.js uninstall
```

To turn Developer Mode off too, switch it off in the Developer Mode app.

## If something goes wrong
**Run the installer again first.** It checks itself and repairs what it can: LG's tools going missing, your TV's address changing, a key that stopped working, or an old pairing. If it still fails, it shows a checkup you can share, and offers to copy that with the AI helper prompt.

To run the same check by hand, open a terminal in the folder and run:

```
node install.js fix
```

- **"Could not reach the TV":** check that the TV is on, and on the same network as the computer.
- **A key or passphrase error:** turn Key Server on and try again. The passphrase has to match the TV screen exactly.
- **Still stuck?** [Open an issue](https://github.com/floridagraham/jailbreak-my-tv/issues) with your TV model and webOS version.
