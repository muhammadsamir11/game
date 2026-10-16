// The play-together city games: Treasure hunt, Coin rush, Police tag and Follow the leader.
// The server referees (server/games.js); this draws the game, says what's happening and claims things.
import * as THREE from 'three';
import { $, el, toast, openModal } from './ui.js';
import { sfx, speak, createSirenSound } from './audio.js';
import { GAMES, GAME_KINDS } from './net/protocol.js';
import { TREASURE_SPOTS, RUSH_SPOTS } from './cityGameSpots.js';
import { emojiSprite } from './net/remotePlayers.js';
import { wrapAngle } from './math.js';

const MEDALS = ['🥇', '🥈', '🥉', '🏅'];
const UNITS = { treasure: '💎', rush: '🪙', tag: 's', follow: '⭐' };
const RUSH_REACH = 2.4;
const now = () => performance.now() / 1000;

// me(): { p, driving, host } — where I am, and the object (car or figure) to hang things on.
// friends: the remote players. hidePersonalCoins(on): Coin rush puts its coins where the city's coins are.
export function createCityGames({ ui, scene, camera, net, friends, me, confetti, award, hidePersonalCoins }) {
  const hud = $('#game-hud', ui);
  const arrow = $('#game-arrow', ui);
  const big = $('#game-big', ui);
  let game = null; // the running game, with times turned into this tablet's clock
  let clock = 0;
  let shownCount = 0;
  const offs = [];
  const youId = () => net.state.you;
  const nameOf = id => (id === youId() ? 'You' : net.state.players.get(id)?.name ?? 'A friend');
  const colorOf = id => friends.get(id)?.color ?? '#ffc107';

  // --- things in the world ---
  const group = new THREE.Group();
  scene.add(group);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc107, metalness: 0.4, roughness: 0.3, emissive: 0xffb300, emissiveIntensity: 0.6 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.8 });
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xfff176, transparent: true, opacity: 0.35, depthWrite: false });
  const coinGeometry = new THREE.CylinderGeometry(0.6, 0.6, 0.14, 24).rotateX(Math.PI / 2);
  const sparkleGeometry = new THREE.OctahedronGeometry(0.25);
  const sparkleMaterial = new THREE.MeshBasicMaterial({ color: 0xffeb3b, transparent: true });

  function makeChest() {
    const chest = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1, 1.1), wood);
    base.position.y = 0.5;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.35, 1.2), gold);
    lid.position.y = 1.15;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 40, 16, 1, true), beamMaterial);
    beam.position.y = 20;
    chest.add(base, lid, beam);
    for (const m of [base, lid]) m.castShadow = true;
    return chest;
  }

  // Police: a flashing red-and-blue light bar over whoever is the police.
  function makeLightBar() {
    const bar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0xe53935, emissive: 0xe53935 }));
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.35), new THREE.MeshStandardMaterial({ color: 0x1e88e5, emissive: 0x1e88e5 }));
    red.position.x = -0.27;
    blue.position.x = 0.27;
    bar.add(red, blue);
    bar.userData.lights = [red, blue];
    return bar;
  }

  let chest = null;
  let rushCoins = [];
  let lightBar = null;
  let leaderStar = null;
  let sparkles = [];
  let sparkleTimer = 0;
  let claimTimer = 0;
  let beepTimer = 0;
  let pendingChest = -1;
  const pendingCoins = new Set();
  const siren = createSirenSound(0.05);

  function clearWorld() {
    for (const child of [...group.children]) group.remove(child);
    chest = null;
    rushCoins = [];
    sparkles = [];
    lightBar?.parent?.remove(lightBar);
    lightBar = null;
    leaderStar?.parent?.remove(leaderStar);
    leaderStar = null;
    siren.stop();
    hidePersonalCoins(false);
  }

  // Where any player is right now, me included.
  function posOf(id) {
    if (id === youId()) return me().p;
    return friends.positions().find(f => f.id === id)?.p ?? null;
  }
  function hostOf(id) {
    if (id === youId()) return me().host;
    const f = friends.get(id);
    if (!f?.shown) return null;
    return f.shown.foot ? f.figure : f.car?.group ?? null;
  }
  const hostHeight = id => {
    if (id === youId()) return me().driving ? 2.4 : 2.9;
    const f = friends.get(id);
    return f?.shown?.foot ? 2.9 : (f?.car?.height ?? 1.2) + 0.9;
  };

  // Keeps a marker (light bar, star) on a player as they get in and out of cars.
  function follow(marker, id, lift) {
    const host = hostOf(id);
    if (!host || marker.parent === host) return;
    host.add(marker);
    marker.position.y = hostHeight(id) + lift;
  }

  // --- starting, updating and ending ---
  function start(msg) {
    clearWorld();
    const t = now();
    game = { ...msg, startsAt: t + msg.startsIn / 1000, endsAt: t + msg.endsIn / 1000, turnEndsAt: msg.turnEndsIn ? t + msg.turnEndsIn / 1000 : null, scores: { ...msg.scores } };
    shownCount = 0;
    pendingChest = -1;
    pendingCoins.clear();
    const rules = GAMES[game.kind];
    if (game.kind === 'treasure') {
      chest = makeChest();
      group.add(chest);
      placeChest();
    }
    if (game.kind === 'rush') {
      hidePersonalCoins(true);
      rushCoins = game.coins.map(i => {
        const coin = new THREE.Mesh(coinGeometry, gold);
        const s = RUSH_SPOTS[i];
        coin.position.set(s.x, s.y, s.z);
        group.add(coin);
        return coin;
      });
    }
    const starter = msg.by ? `${nameOf(msg.by)} started ` : '';
    toast(`${rules.emoji} ${starter}${rules.name}! ${rules.how}`, 4000);
    speak(`${rules.name}! ${rules.how}`);
    hud.classList.remove('hidden');
    $('.gh-emoji', hud).textContent = rules.emoji;
    afterUpdate({});
  }

  function placeChest() {
    const s = TREASURE_SPOTS[game.spot];
    chest.position.set(s.x, s.y, s.z);
  }

  // Something changed (the server said so): move things, cheer, and redo the words on the HUD.
  function afterUpdate(msg) {
    if (game.kind === 'treasure' && msg.foundBy) {
      placeChest();
      pendingChest = -1;
      if (msg.foundBy === youId()) {
        sfx.bigCoin();
        award(5);
        toast('You found the treasure! 💎 +5 🪙');
      } else {
        sfx.wrong();
        toast(`${nameOf(msg.foundBy)} found the treasure! 💎 A new one appeared!`);
      }
      const at = posOf(msg.foundBy);
      if (at) confetti.burst(new THREE.Vector3(at.x, at.y + 1.5, at.z), 60);
    }
    if (game.kind === 'rush' && msg.taken !== undefined) {
      const coin = rushCoins[msg.taken];
      if (coin) coin.visible = false;
      pendingCoins.delete(msg.taken);
      if (msg.by === youId()) {
        sfx.coin();
        award(1);
      }
    }
    if (game.kind === 'tag') {
      if (msg.tagged) {
        sfx.horn();
        toast(msg.tagged === youId() ? 'You got caught! Now YOU are the police! 🚓' : `${nameOf(msg.tagged)} is the police now! 🚓`);
      }
      const police = game.police;
      lightBar?.parent?.remove(lightBar);
      lightBar = makeLightBar();
      follow(lightBar, police, -0.4);
      if (police === youId()) siren.start();
      else siren.stop();
    }
    if (game.kind === 'follow') {
      if (msg.turnEndsIn !== undefined) game.turnEndsAt = now() + msg.turnEndsIn / 1000;
      if (msg.star === youId()) sfx.tick();
      if (game.leader !== game.shownLeader) {
        game.shownLeader = game.leader;
        toast(game.leader === youId() ? 'Your turn to lead! ⭐ Drive somewhere fun!' : `Follow ${nameOf(game.leader)}! ⭐`);
        leaderStar?.parent?.remove(leaderStar);
        leaderStar = emojiSprite('⭐', 1);
        follow(leaderStar, game.leader, 0.6);
      }
    }
    renderScores();
  }

  function renderScores() {
    const unit = UNITS[game.kind];
    const ids = [...new Set([...Object.keys(game.scores)])];
    ids.sort((a, b) => (game.scores[b] ?? 0) - (game.scores[a] ?? 0));
    $('.gh-scores', hud).replaceChildren(...ids.map(id => el('li', {
      class: id === youId() ? 'me' : '',
      style: `--ring: ${colorOf(id)}`,
      text: `${nameOf(id)} ${Math.floor(game.scores[id] ?? 0)}${unit}`,
    })));
  }

  function end(msg) {
    if (!game) return;
    const kind = game.kind;
    const rules = GAMES[kind];
    clearWorld();
    hud.classList.add('hidden');
    arrow.classList.add('hidden');
    big.classList.add('hidden');
    game = null;
    if (msg.stopped) {
      toast(`${rules.emoji} ${rules.name} stopped.`);
      return;
    }
    const ranked = Object.entries(msg.scores).sort((a, b) => b[1] - a[1]);
    const won = ranked[0]?.[0] === youId();
    if (won) sfx.fanfare();
    else sfx.success();
    const at = me().p;
    if (at) confetti.burst(new THREE.Vector3(at.x, at.y + 2, at.z), 90);
    openModal({
      title: ranked.length === 1 ? `You got ${ranked[0][1]}${UNITS[kind]}!` : won ? 'You won! 🏆' : `${nameOf(ranked[0][0])} won!`,
      icon: rules.emoji,
      body: [el('ol', { class: 'results' }, ranked.map(([id, score], i) => el('li', { class: id === youId() ? 'me' : '', text: `${MEDALS[i] ?? ''} ${nameOf(id)}: ${score}${UNITS[kind]}` })))],
      buttons: [
        { label: '🎮 Another game', onClick: () => openMenu() },
        { label: '👍 Done', kind: 'go' },
      ],
    });
  }

  function openMenu() {
    if (game) {
      openModal({
        title: `Stop ${GAMES[game.kind].name}?`,
        icon: GAMES[game.kind].emoji,
        buttons: [{ label: 'Keep playing' }, { label: '✋ Stop the game', kind: 'danger', onClick: () => net.send('game.stop') }],
      });
      return;
    }
    const friendsHere = net.state.players.size;
    openModal({
      title: 'Play a game!',
      icon: '🎮',
      className: 'wide',
      body: [el('div', { class: 'game-choices' }, GAME_KINDS.map(kind => {
        const rules = GAMES[kind];
        const needsFriend = friendsHere < rules.minPlayers;
        return el('button', {
          class: `game-choice${needsFriend ? ' needs' : ''}`,
          onclick: () => {
            if (needsFriend) {
              toast('This game needs a friend! 👫');
              return;
            }
            net.send('game.start', { kind });
            document.querySelector('#modal-root').replaceChildren();
          },
        }, [el('span', { class: 'gc-emoji', text: rules.emoji }), el('b', { text: rules.name }), el('small', { text: needsFriend ? 'Needs a friend' : rules.how })]);
      }))],
      buttons: [{ label: 'Not now' }],
    });
  }

  offs.push(
    net.on('game.start', start),
    net.on('game.update', msg => {
      if (!game || msg.kind !== game.kind) return;
      Object.assign(game, msg, { scores: { ...msg.scores } });
      afterUpdate(msg);
    }),
    net.on('game.end', end),
    net.on('error', msg => { if (msg.reason === 'need-friends') toast('This game needs a friend! 👫'); }),
    net.on('left', () => { if (game) renderScores(); }),
  );
  if (net.state.game) start(net.state.game); // joined while a game was on

  // --- every frame ---
  function pointArrow(target) {
    const my = me().p;
    if (!target || !my) {
      arrow.classList.add('hidden');
      return;
    }
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const view = Math.atan2(dir.x, dir.z);
    const toTarget = Math.atan2(target.x - my.x, target.z - my.z);
    // Heading grows to the left, the screen turns clockwise: flip the sign.
    arrow.style.transform = `rotate(${(-wrapAngle(toTarget - view) * 180) / Math.PI}deg)`;
    arrow.classList.remove('hidden');
  }

  function showBig(text) {
    big.textContent = text;
    big.classList.remove('hidden', 'pop');
    void big.offsetWidth;
    big.classList.add('pop');
  }

  // The treasure (a big gold diamond) and the rush coins (gold dots) on the mini-map.
  function drawMap(g, toMap) {
    if (!game) return;
    g.fillStyle = '#ffc107';
    g.strokeStyle = '#1b2340';
    g.lineWidth = 3;
    if (game.kind === 'treasure') {
      const s = TREASURE_SPOTS[game.spot];
      const pulse = 12 + Math.sin(clock * 6) * 3;
      g.beginPath();
      g.moveTo(toMap(s.x), toMap(s.z) - pulse);
      g.lineTo(toMap(s.x) + pulse, toMap(s.z));
      g.lineTo(toMap(s.x), toMap(s.z) + pulse);
      g.lineTo(toMap(s.x) - pulse, toMap(s.z));
      g.closePath();
      g.fill();
      g.stroke();
    }
    if (game.kind === 'rush') {
      rushCoins.forEach(c => {
        if (!c.visible) return;
        g.beginPath();
        g.arc(toMap(c.position.x), toMap(c.position.z), 5, 0, Math.PI * 2);
        g.fill();
      });
    }
  }

  return {
    openMenu,
    drawMap,
    get running() { return !!game; },
    update(dt) {
      clock += dt;
      if (!game) return;
      const t = now();
      const my = me().p;
      // 3-2-1 before the start
      if (t < game.startsAt) {
        const left = Math.ceil(game.startsAt - t);
        if (left !== shownCount) {
          shownCount = left;
          showBig(String(left));
          sfx.beep();
        }
      } else if (shownCount > 0) {
        shownCount = 0;
        showBig('GO!');
        sfx.go();
        setTimeout(() => big.classList.add('hidden'), 900);
      }
      const started = t >= game.startsAt;
      const left = Math.max(0, Math.ceil((game.turnEndsAt ?? game.endsAt) - Math.max(t, game.startsAt)));
      $('.gh-timer', hud).textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      claimTimer -= dt;

      if (game.kind === 'treasure' && chest) {
        chest.rotation.y += dt;
        const s = TREASURE_SPOTS[game.spot];
        const d = my ? Math.hypot(my.x - s.x, my.z - s.z) : Infinity;
        $('.gh-text', hud).textContent = `Find the treasure! ${game.chest + 1} of ${GAMES.treasure.chests}`;
        pointArrow(s);
        // Beeps get faster the closer you are.
        beepTimer -= dt;
        if (started && beepTimer <= 0 && d < 80) {
          sfx.tick();
          beepTimer = 0.15 + Math.min(1.4, d / 40);
        }
        if (started && d < GAMES.treasure.reach && pendingChest !== game.chest) {
          pendingChest = game.chest;
          net.send('game.claim', { data: { chest: game.chest } });
        }
      }

      if (game.kind === 'rush') {
        $('.gh-text', hud).textContent = `Grab the sparkly coins! ${rushCoins.filter(c => c.visible).length} left`;
        rushCoins.forEach((coin, k) => {
          if (!coin.visible) return;
          coin.rotation.y = clock * 3 + k;
          if (started && my && !pendingCoins.has(k) && coin.position.distanceTo(new THREE.Vector3(my.x, my.y, my.z)) < RUSH_REACH + (me().driving ? 0.6 : 0)) {
            pendingCoins.add(k);
            net.send('game.claim', { data: { coin: k } });
          }
        });
        arrow.classList.add('hidden');
      }

      if (game.kind === 'tag') {
        const police = game.police;
        if (started) for (const id of Object.keys(game.scores)) if (id !== police) game.scores[id] += dt;
        if (lightBar) {
          follow(lightBar, police, -0.4); // onto their car or figure, whichever they are now
          const flip = Math.floor(clock * 6) % 2 === 0;
          lightBar.userData.lights[0].material.emissiveIntensity = flip ? 2.5 : 0.2;
          lightBar.userData.lights[1].material.emissiveIntensity = flip ? 0.2 : 2.5;
        }
        if (police === youId()) {
          $('.gh-text', hud).textContent = 'You are the police! 🚓 Catch someone!';
          let nearest = null;
          for (const f of friends.positions()) {
            const d = my ? Math.hypot(f.p.x - my.x, f.p.z - my.z) : Infinity;
            if (!nearest || d < nearest.d) nearest = { ...f, d };
          }
          pointArrow(nearest?.p);
          if (started && nearest && nearest.d < GAMES.tag.reach && claimTimer <= 0) {
            claimTimer = 0.5;
            net.send('game.claim', { data: { victim: nearest.id } });
          }
        } else {
          $('.gh-text', hud).textContent = `Run! ${nameOf(police)} is the police! 🚓`;
          arrow.classList.add('hidden');
        }
        if (clock % 1 < dt) renderScores();
      }

      if (game.kind === 'follow') {
        const leader = game.leader;
        if (leaderStar) follow(leaderStar, leader, 0.6);
        const lp = posOf(leader);
        // A sparkle trail behind the leader, so followers can see the way they went.
        sparkleTimer -= dt;
        if (lp && sparkleTimer <= 0) {
          sparkleTimer = 0.15;
          const s = new THREE.Mesh(sparkleGeometry, sparkleMaterial.clone());
          s.position.set(lp.x, lp.y + 0.6, lp.z);
          s.userData.life = 2.5;
          group.add(s);
          sparkles.push(s);
        }
        sparkles = sparkles.filter(s => {
          s.userData.life -= dt;
          s.rotation.y += dt * 4;
          s.material.opacity = Math.max(0, s.userData.life / 2.5);
          if (s.userData.life > 0) return true;
          group.remove(s);
          s.material.dispose();
          return false;
        });
        if (leader === youId()) {
          $('.gh-text', hud).textContent = 'You lead! ⭐ Drive somewhere fun!';
          arrow.classList.add('hidden');
        } else {
          const d = lp && my ? Math.hypot(lp.x - my.x, lp.z - my.z) : Infinity;
          const close = d < GAMES.follow.reach;
          $('.gh-text', hud).textContent = close ? `Great! Stay close to ${nameOf(leader)} ⭐` : `Follow ${nameOf(leader)}! Get closer!`;
          pointArrow(close ? null : lp);
          if (started && close && claimTimer <= 0) {
            claimTimer = 1;
            net.send('game.claim', { data: { near: true } });
          }
        }
      }
    },
    dispose() {
      for (const off of offs) off();
      clearWorld();
      scene.remove(group);
      hud.classList.add('hidden');
      arrow.classList.add('hidden');
      big.classList.add('hidden');
      for (const thing of [gold, wood, beamMaterial, coinGeometry, sparkleGeometry, sparkleMaterial]) thing.dispose();
    },
  };
}
