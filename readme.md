# rainyday

private multiplayer easyrpg site with chat and accounts. uses [easyrpg-player-monoko-reupload](https://github.com/Nep-Timeline/EasyRPG-Player-Monoko) for in-game multiplayer. the wasm browser player is already included, came from the original [easyrpg-player-monoko](https://github.com/Monokotech/EasyRPG-Player-Monoko), which has since been removed. you only need to build the separate multiplayer server binary if you want players to see each other in-game.

## setup

```bash
git clone https://github.com/xendotflow/rainyday.git
cd rainyday
npm install
cp .env.example .env
```

set `ADMIN_USERNAME` in `.env` to whatever username should be admin, then register with that name.

```bash
npm start
```

open http://localhost:3000

## add a game

1. copy an rpg maker 2000/2003 game into `private/public/play/games/yourgameid/`
2. run `./rungencaches.sh` from `private/public/play/games/`
3. restart rainyday

optional: `game.json` with `{ "name": "display name" }` and a logo at `private/public/assets/images/logos/yourgameid/logo_yourgameid.png`

## in-game multiplayer

only needed to see other players on the same map. site chat works without this.

```bash
cd rainyday
git clone https://github.com/Nep-Timeline/EasyRPG-Player-Monoko.git
cd EasyRPG-Player-Monoko

# debian/ubuntu: sudo apt-get install build-essential cmake git libfmt-dev
# arch: sudo pacman -S base-devel cmake git fmt
# arch only — run before cmake:
# sed -i 's/fmt\/core.h/fmt\/format.h/' src/multiplayer/output_mt.h

cmake -B build -DBUILD_CLIENT=OFF -DBUILD_SERVER=ON -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

then `npm start` from the rainyday folder. rainyday auto-starts `EasyRPG-Player-Monoko/build/easyrpg-player-server` on port 6500 and proxies `/connect` to it.

## testing from scratch

deleting the folder and recloning is fine. these are **not** in git, so you redo them each time:

- `npm install`
- `cp .env.example .env` (set `ADMIN_USERNAME` before registering)
- clone and build `EasyRPG-Player-Monoko/` (gitignored — gone when you delete the folder)
- your game files in `private/public/play/games/` + `./rungencaches.sh`
- accounts in `private/users/` (reset with the folder)

these **persist outside the folder**:

- a rainyday process still running — `kill $(lsof -t -i:3000)` before `npm start`
- browser cached player config — hard refresh (ctrl+shift+r) or clear site data for localhost if multiplayer acts weird


## production

run behind nginx on port 3000 with websocket upgrade headers:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

keep it running with pm2:

```bash
pm2 start private/server.js --name rainyday
pm2 save && pm2 startup
```

change `SESSION_SECRET` in `.env` for production.

## user data

stored in `private/users/`, not tracked by git. each users folder includes a file with their settings and hashed passwords, as well as their uploaded ping sounds and badges.

## use of generative ai

yeah its slop code, im sorry. when tensions rose between myself and the admins on ynoproject i quickly left and started this project in early 2025. i just wanted to have a place with my partner and my friends away from everything and didnt really know anything about web development, so i turned to ai to assist in the sites creation. as such its a complete mess, but it worked for me. it was never really meant to be a public thing as it was just for me and my friends, but now id like to put this here in case people wanted to learn from how it worked or fork it and code their own version by hand. no ai art was used in the process of the sites creation.
