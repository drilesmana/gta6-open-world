"""Browser integration evidence. Requires Python Playwright, installed outside game/.
State fixtures place the player at objectives; movement, combat and mission rules remain live.
Run with the static server on port 8080. No game code is imported or substituted.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]

def main():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True, args=['--no-sandbox', '--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 720})
        errors, external, failed = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: external.append(request.url) if not request.url.startswith(('http://127.0.0.1:8080/', 'data:')) else None)
        page.on('response', lambda response: failed.append(response.url) if response.status >= 400 else None)
        # Deterministic simulation time prevents software rendering from changing test timing.
        page.add_init_script('window.requestAnimationFrame = () => 1;')
        page.goto('http://127.0.0.1:8080/?lite=1&qa=1')
        page.wait_for_function('window.G?.state === "title"', polling=100, timeout=60000)
        page.click('#btnNew')
        report = page.evaluate('''() => {
          const checks = {};
          const check = (key, value) => { checks[key] = !!value; if (!value) throw new Error(key); };
          G.sim(.2);
          G.tap('KeyE'); check('briefing', G.state === 'brief');
          document.getElementById('btnBriefLater').click(); check('declineResumes', G.state === 'play');
          G.player.setPosition(-104,-80,0); G.cam.setYaw(Math.PI);
          const z = G.player.z; G.sim(1,['KeyW']); checks.walkedMeters = G.player.z-z;
          check('forwardMovesIntoView', checks.walkedMeters > 3);
          G.tap('KeyM'); check('fullMapOpens', G.bigMapOpen); G.tap('KeyM');
          G.tap('Escape'); check('pause', G.state === 'paused'); G.resume();
          const car = G.traffic.spawnParked(-104,-60,0); car.driver = 'ai';
          G.player.setPosition(car.x+2,car.z); G.tap('KeyF');
          check('carjack', G.player.vehicle === car && G.wanted.level > 0);
          G.sim(1,['KeyW']); checks.drivingKmh = car.speedKmh; check('accelerates', car.speedKmh > 25);
          G.tap('KeyF'); check('exitCar', !G.player.vehicle);
          G.player.armed = false; G.input.mouse.leftPressed = true; G.step(.02); G.input.endFrame();
          check('punch', G.player.punchTimer > 0);
          G.player.armed = true; const ammo = G.player.ammo; G.sim(.3);
          G.input.mouse.leftPressed = true; G.step(.02); G.input.endFrame(); check('shoot', G.player.ammo === ammo-1);
          G.tap('KeyR'); G.sim(1.3); check('reload', G.player.ammo === 12);
          G.wanted.clear(); G.police.clear();
          G.player.setPosition(-150,-150); G.wanted.addCrime(14); G.sim(4);
          check('policeRespond', G.police.heatCount > 0);
          G.player.setPosition(150,230); G.sim(35); check('escape', G.wanted.level === 0);
          G.startNew(); G.sim(.1); G.tap('KeyE'); G.beginBrief();
          let marker = G.missions.marker; G.player.setPosition(marker.x,marker.z); G.tap('KeyE');
          check('parcelPickup', G.missions.active.stage === 1 && G.wanted.level === 2);
          marker = G.missions.marker; G.player.setPosition(marker.x,marker.z); G.tap('KeyE'); check('parcelComplete', G.progress.chapter === 1);
          G.sim(.1); G.player.setPosition(-80,-72); G.tap('KeyE'); G.beginBrief();
          const target = G.missions.active.data.car; const tx=target.x,tz=target.z;
          G.sim(.5); check('courierWaitsForArrival', Math.hypot(target.x-tx,target.z-tz)<.1);
          marker=G.missions.marker; G.player.setPosition(marker.x,marker.z); G.tap('KeyE'); G.sim(1);
          check('courierFlees', Math.hypot(target.x-tx,target.z-tz)>2);
          const ram=G.traffic.spawnParked(target.x,target.z-3,0); ram.driver='player';
          let hits=0;
          while(target.health>40 && hits<8) {
            ram.x=target.x; ram.z=target.z-3; ram.vx=0;ram.vz=28;
            target.vx=target.vz=0; ram.lastImpact=target.lastImpact=0;
            G.resolveVehicleContacts(); hits++;
          }
          checks.ramHits=hits; G.missions.update(.02); check('ramDisablesCourier',G.missions.active.stage===2);
          marker=G.missions.marker; G.player.setPosition(marker.x+3,marker.z);G.missions.interact();
          check('cannotSkipReturn',G.progress.chapter===1);
          G.player.setPosition(marker.x,marker.z);G.missions.update(.02);check('casePickup',G.missions.active.stage===3);
          marker=G.missions.marker;G.player.setPosition(marker.x,marker.z);G.missions.update(.02);check('courierComplete',G.progress.chapter===2);
          G.sim(.1);G.player.setPosition(-80,-72);G.tap('KeyE');G.beginBrief();
          const deed=G.missions.active.data.car;G.player.setPosition(deed.x+2,deed.z);G.tap('KeyF');
          check('deedCar',G.player.vehicle===deed&&G.wanted.level===3);G.sim(.7,['KeyW']);
          check('pierDrive',deed.speedKmh>35&&deed.z<=G.city.maxZ);
          marker=G.missions.marker;deed.x=marker.x;deed.z=marker.z;deed.vx=deed.vz=deed.forwardSpeed=0;
          G.player.setPosition(marker.x,marker.z);G.missions.update(.02);
          check('storyEnding',G.state==='finish'&&G.progress.finished&&G.progress.chapter===3&&G.progress.stats.jobsDone===3);
          G.save();check('saveWritten',JSON.parse(localStorage.getItem('marisol-heat.save.v1')).finished);
          checks.cash=G.cash;return checks;
        }''')
        page.reload()
        page.wait_for_function('window.G?.state === "title"', polling=100, timeout=60000)
        page.click('#btnContinue')
        report['loadCompletedStory'] = page.evaluate('G.progress.finished && G.progress.chapter === 3')
        report['deathAndRecovery'] = page.evaluate('''() => {G.startNew();G.player.health=0;G.player.dead=true;G.onPlayerDead();const dead=G.state==='dead';G.wakeUp();return dead&&G.state==='play'&&G.player.health===100;}''')
        report['missionTimeoutRetry'] = page.evaluate('''() => {
          if (G.state === 'paused') G.resume();
          G.player.setPosition(-80,-72); G.sim(.1); G.tap('KeyE'); G.beginBrief();
          G.missions.timer=.01; G.sim(.02); const failed=G.state==='brief'; G.beginBrief();
          return failed&&G.state==='play'&&G.missions.active?.id==='parcel';
        }''')
        report['audio'] = page.evaluate('''() => {G.audio.init();G.audio.startEngine();G.audio.engineState(60,1);G.audio.horn();G.audio.startSiren();G.audio.stopSiren();G.audio.stopEngine();const mute=G.audio.toggleMute();G.audio.toggleMute();return {context:G.audio.ctx.state,muteWorked:mute,engineStopped:!G.audio.engine,sirenStopped:!G.audio.siren};}''')
        report['pageErrors'] = errors
        report['externalRequests'] = external
        report['failedRequests'] = failed
        assert not errors and not external and not failed, report
        assert report['loadCompletedStory'] and report['deathAndRecovery'] and report['missionTimeoutRetry'], report
        output = ROOT / 'tests' / 'last-run.json'
        output.write_text(json.dumps(report, indent=2)+'\n')
        print(json.dumps(report, indent=2))
        browser.close()

if __name__ == '__main__':
    main()
