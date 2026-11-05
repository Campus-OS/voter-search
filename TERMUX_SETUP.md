# Run Voter Search in Termux (Android)

These steps run the Node/Express server on an Android phone using Termux. The phone needs an internet connection to reach your configured MongoDB server, unless MongoDB is also running locally.

## 1. Install Termux and Node.js

1. Install the current Termux app from the F-Droid distribution. Avoid old Play Store builds.
2. Open Termux and update its package list:

   ```sh
   pkg update && pkg upgrade -y
   ```

3. Install Node.js, Git, and a terminal editor:

   ```sh
   pkg install nodejs-lts git nano -y
   ```

4. Confirm Node and npm work:

   ```sh
   node --version
   npm --version
   ```

The project requires Node.js 20 or newer.

## 2. Get the project

Clone your repository (replace the placeholder with your actual repository address):

```sh
git clone <your-repository-url> voter-search
cd voter-search
npm ci
```

If you downloaded a source archive instead, extract it, `cd` into its project directory, and run `npm install`.

## 3. Configure MongoDB and private keys

1. Create a private environment file and edit it:

   ```sh
   cp .env.example .env
   nano .env
   ```

2. Set `MONGODB_URI` to the current MongoDB URI, `MONGODB_DB` to the database name, `VOTERS_COLLECTION` to the voter collection, and `WARD_COLLECTION` to the collection containing wards. The app expects voter `ward_id` or `wardId` to contain the MongoDB `_id` of a ward document.
3. Set `NODE_ENV=production`, `HOST=0.0.0.0`, `PORT=3000`, and `DEFAULT_DATASET_ID` as appropriate.
4. Generate a new `VOTE_API_KEY` with at least 24 random characters. Never reuse the example value. Keep `.env` private; do not commit, publish, message, or screenshot it.
5. Put the server's `.device-access-key-hashes.json` file in the project root using a secure file-transfer method. The app needs the hashes, not the distributable raw-key file. If you are enrolling users on this phone, generate a fresh set with `npm run access-keys:generate`; privately distribute one matching secret from `.device-access-keys.generated.json` per browser. Keep both generated files private and out of Git.

For key generation on a trusted machine, use:

```sh
npm run access-keys:generate
```

The command writes 10 keys and their hashes. Each key can bind to only one browser profile. If generated keys or the MongoDB URI have already been exposed, rotate them before use.

## 4. Start and open the app on the phone

Start the server in Termux:

```sh
npm start
```

Keep Termux running. In the Android browser on the same phone, open:

```text
http://127.0.0.1:3000
```

Enter that browser's assigned 32-character device key. If the browser offers “Remember key on this browser,” only enable it on a phone you control.

The browser profile is identified using origin-scoped storage. Use the same exact URL every time: `127.0.0.1`, `localhost`, and the phone's Wi-Fi IP are different browser origins and can appear as different devices. Use a distinct assigned key for each browser profile. Do not clear the browser's site data after the key is bound.

## 5. Open it from another device on the same Wi-Fi (optional)

1. Find the Android phone's Wi-Fi IPv4 address in Android Wi-Fi network details. It is often in a private range such as `192.168.x.x` or `10.x.x.x`.
2. On another device connected to the same Wi-Fi, open `http://<phone-wifi-ip>:3000` (replace the placeholder with the phone's actual IP).
3. Enter a different assigned key in that device's browser. Do not reuse the phone's key; the browser is a separate profile.
4. If it does not connect, ensure both devices are on the same non-guest Wi-Fi, Android/Termux is not being restricted by battery or network settings, and the server is still running. Confirm the configured port is 3000.

## 6. Stop or restart

- Stop the server by returning to Termux and pressing `Ctrl+C`.
- To restart later, open Termux, go back to the project directory with `cd voter-search`, then run `npm start`.
- Android may stop background processes to save battery. Keep Termux in the foreground or adjust Android battery optimization for Termux if the server must remain available.

## Security and Git warning

Never commit `.env`; it contains the MongoDB password and operator secrets. `.env` is intentionally ignored by Git. Commit `.env.example` with placeholders instead. The live MongoDB URI was exposed in project context and the `.env` was already tracked in Git, so immediately rotate the MongoDB database user's password in MongoDB Atlas and update your private `.env`. Removing `.env` from the latest Git version does not erase it from prior commits or remote history; coordinate history cleanup with repository collaborators after rotating the credential. Use HTTPS for access over the internet; this same-Wi-Fi HTTP setup is for a trusted local network only.
