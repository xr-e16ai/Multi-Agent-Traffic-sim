import * as THREE from 'three';
import { TrafficLight, Car, Student, ConfettiSystem } from './entities.js';

export class Simulation {
    constructor(scene, camera, uiHandler, controls, onEvent) {
        this.scene    = scene;
        this.camera   = camera;
        this.uiHandler = uiHandler;
        this.controls  = controls;
        this.onEvent   = onEvent || (() => {});

        this.cars          = [];
        this.trafficLights = [];
        this.student       = null;
        this.confetti      = new ConfettiSystem(scene);
        this.aiFetchId     = 0;

        // ── AI state ─────────────────────────────────────────────────────────
        this.aiState = {
            pedestrian:    'WAIT',
            vehicles:      'MOVE',
            traffic_light: 'RED',
            risk:          'LOW',
            message:       ''
        };

        // ── User inputs ───────────────────────────────────────────────────────
        this.weatherType    = 'Sunny';
        this.trafficDensity = 'Normal';
        this.currentLight   = 'RED';

        // ── Scenario ──────────────────────────────────────────────────────────
        this.scenarioType = 'SAFE'; // 'SAFE' | 'HAZARDOUS'

        // ── Safe crossing state ───────────────────────────────────────────────
        this.pedestrianCrossed = false;
        this.safePedCrossStarted = false;

        // ── Hazardous state ───────────────────────────────────────────────────
        this.haz = {
            pedStarted:       false,
            atPhone:          false,
            phoneTimer:       0,
            countdown:        30,
            countdownActive:  false,
            countdownElapsed: 0,
            collisionTriggered: false,
            collisionCarIdx:    -1,
            colCarPostHit:    false,  // car coasts past ped after impact
            fallStarted:      false,
            fallTimer:        0,
            fallDuration:     1.2,
            collisionDone:    false,
            safetyMsgIdx:     0,
            safetyMsgTimer:   0,
        };

        this.ambulanceGroup  = null;
        this.ambulancePhase  = 'NONE';
        this.ambulanceTimer  = 0;
        this._ambLightL      = null;
        this._ambLightR      = null;
        this.paramedicGroup  = null;

        this.score = 100;

        this._safetyMessages = [
            '📵 Do not use mobile phones while crossing.',
            '⏱️ Always cross within the allotted time.',
            '👀 Stay alert and watch for traffic.',
            '🚦 Only cross when the signal says WALK.',
            '⚠️ Distractions on roads can be fatal.',
            '🚶 Cross quickly — never stop in the middle.',
        ];

        this.initEnvironment();
    }

    // ═════════════════════════════════════════════════════════════════════════
    // ENVIRONMENT (unchanged from original)
    // ═════════════════════════════════════════════════════════════════════════

    initEnvironment() {
        this.scene.background = new THREE.Color(0x87CEEB);
        this.scene.fog        = new THREE.Fog(0x87CEEB, 50, 200);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.4));
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
        this.scene.add(this.hemiLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
        this.dirLight.position.set(30, 50, 30);
        this.dirLight.castShadow = true;
        this.dirLight.shadow.mapSize.set(2048, 2048);
        Object.assign(this.dirLight.shadow.camera, { left:-50, right:50, top:50, bottom:-50 });
        this.scene.add(this.dirLight);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(500, 500),
            new THREE.MeshStandardMaterial({ color: 0x55aa55, roughness: 0.9 })
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.1;
        ground.receiveShadow = true;
        this.scene.add(ground);

        const road = new THREE.Mesh(
            new THREE.PlaneGeometry(24, 300),
            new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 5 })
        );
        road.rotation.x = -Math.PI / 2;
        road.receiveShadow = true;
        this.scene.add(road);

        const swGeo = new THREE.BoxGeometry(10, 0.4, 300);
        const swMat = new THREE.MeshLambertMaterial({ color: 0x999999 });
        [-17, 17].forEach(x => {
            const m = new THREE.Mesh(swGeo, swMat);
            m.position.set(x, -0.2, 0);
            m.receiveShadow = true;
            this.scene.add(m);
        });

        this.createZebraCrossing();
        this.createLaneMarkings();
        this.createStopLines();

        const treeMat   = new THREE.MeshLambertMaterial({ color: 0x8B4513 });
        const leavesMat = new THREE.MeshLambertMaterial({ color: 0x228B22 });
        for (let i = 0; i < 40; i++) {
            const tree   = new THREE.Group();
            const trunk  = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.8, 2, 8), treeMat);
            const leaves = new THREE.Mesh(new THREE.ConeGeometry(3, 6, 8), leavesMat);
            trunk.position.y = 1; leaves.position.y = 4;
            trunk.castShadow = leaves.castShadow = true;
            tree.add(trunk); tree.add(leaves);
            tree.position.set((Math.random() > 0.5 ? 1 : -1) * (25 + Math.random() * 20), 0, (Math.random() - 0.5) * 200);
            tree.scale.setScalar(0.8 + Math.random() * 0.4);
            this.scene.add(tree);
        }

        this.mainLight = new TrafficLight(-12.5, 5, Math.PI);
        this.secLight  = new TrafficLight( 12.5, 5, 0);
        this.scene.add(this.mainLight.group);
        this.scene.add(this.secLight.group);
        this.trafficLights.push(this.mainLight, this.secLight);

        this.createUrbanEnvironment();
        this.createStreetProps();

        this.student = new Student(-13, 4);
        this.scene.add(this.student.group);

        this.clickableObjects = [this.mainLight.buttonMesh];
        this.particleSystem   = null;
        this.cars = [];
        this.spawnInitialTraffic();
        this.setTrafficLights('RED');
    }

    createZebraCrossing() {
        const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        for (let i = 0; i < 8; i++) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(22, 0.6), mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(0, 0.02, 4.0 - i * 0.9);
            this.scene.add(m);
        }
    }
    createLaneMarkings() {
        const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        for (let i = 0; i < 30; i++) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 3), mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(0, 0.01, -150 + i * 10);
            this.scene.add(m);
        }
    }
    createStopLines() {
        const mat = new THREE.MeshLambertMaterial({ color: 0xFFFFFF });
        for (const z of [-2.0, 10.0]) {
            const m = new THREE.Mesh(new THREE.PlaneGeometry(24, 0.4), mat);
            m.rotation.x = -Math.PI / 2;
            m.position.set(0, 0.03, z);
            this.scene.add(m);
        }
    }

    // ─── Traffic spawning with guaranteed spacing ─────────────────────────
    spawnInitialTraffic() {
        let count = 7;
        if (this.trafficDensity === 'Low')  count = 4;
        if (this.trafficDensity === 'High') count = 11;

        const colors = [0xCC0000, 0x0000CC, 0xFFAA00, 0x8800AA,
                        0x006600, 0xC0C0C0, 0x333333, 0xFF69B4,
                        0x004466, 0x884400, 0x008888];

        // TWO lanes only — one per direction — so cars always travel
        // in a single-file line. Lane x=11.5 is reserved for ambulance.
        //   x = -4.5  →  direction  1 (southbound, left side)
        //   x =  4.5  →  direction -1 (northbound, right side)
        //   x = 11.5  →  AMBULANCE ONLY (emergency lane — never spawn here)

        const GAP = 18; // spacing between cars in the queue

        const spawnLane = (laneX, dir) => {
            for (let i = 0; i < count; i++) {
                const color  = colors[i % colors.length];
                const speed  = 8 + (i % 4) * 1.5;
                const startZ = dir === 1
                    ? -150 + i * GAP   // southbound: start far south, drive north
                    :  150 - i * GAP;  // northbound: start far north, drive south
                const car = new Car(color, startZ, speed, laneX, dir);
                car.group.position.set(laneX, 0, startZ);
                this.scene.add(car.group);
                this.cars.push(car);
            }
        };

        spawnLane(-4.5,  1);  // southbound lane
        spawnLane( 4.5, -1);  // northbound lane
        // x=11.5 is emergency-only — never spawn civilian cars here
    }

    respawnTraffic() {
        this.cars.forEach(c => this.scene.remove(c.group));
        this.cars = [];
        this.spawnInitialTraffic();
    }

    // ─── Lane-keep following distance ─────────────────────────────────────
    // LANE-MERGE FIX:
    // The old version only throttled *speed* and re-checked gaps AFTER every
    // car had already moved that frame. That meant a trailing car could close
    // a gap and visually clip/overlap (merge) into the car ahead within a
    // single frame — most visible when a whole queue bunches up at a red
    // light. This version processes each lane in strict front-to-back travel
    // order and HARD-CLAMPS position so a trailing vehicle can never occupy
    // the same space as the vehicle ahead of it, regardless of frame rate,
    // speed delta, or how many vehicles are braking at once.
    _applyFollowingDistance() {
        const MIN_GAP  = 12.0;  // units — start smoothly slowing down here
        const HARD_GAP = 5.0; // units — absolute minimum clearance, never closer

        // Group vehicles by lane (laneX + direction) so each queue is
        // resolved independently and in the correct order.
        const lanes = new Map();
        this.cars.forEach((car, idx) => {
            const key = `${car.laneX.toFixed(1)}_${car.direction}`;
            if (!lanes.has(key)) lanes.set(key, []);
            lanes.get(key).push({ car, idx });
        });

        lanes.forEach(group => {
            if (group.length < 2) return;
            const dir = group[0].car.direction;

            // Sort FRONT → BACK (closest to the front of the queue first) so
            // each car is resolved relative to a lead car whose position has
            // already been finalized this frame.
            group.sort((a, b) => dir === 1
                ? b.car.group.position.z - a.car.group.position.z
                : a.car.group.position.z - b.car.group.position.z);

            for (let i = 1; i < group.length; i++) {
                const { car, idx } = group[i];
                const leadCar = group[i - 1].car;

                // No exemption for collision car, all cars must maintain safe distance
                
                const gap = dir === 1
                    ? leadCar.group.position.z - car.group.position.z
                    : car.group.position.z - leadCar.group.position.z;

                // Smooth deceleration as the gap narrows
                if (gap < MIN_GAP) {
                    const ratio = Math.max(0, (gap - HARD_GAP) / MIN_GAP);
                    car.speed = Math.min(car.speed, car.baseSpeed * ratio);
                }

                // Hard position clamp — guarantees no overlap/merging, ever.
                if (gap < HARD_GAP) {
                    car.group.position.z = dir === 1
                        ? leadCar.group.position.z - HARD_GAP
                        : leadCar.group.position.z + HARD_GAP;
                    car.speed = 0;
                    car.stop();
                }
            }
        });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // TRAFFIC LIGHT / WEATHER / DENSITY
    // ═════════════════════════════════════════════════════════════════════════

    setTrafficLights(state) {
        this.currentLight = state;
        const pedState = state === 'GREEN' ? 'WALK' : 'DONT_WALK';
        this.trafficLights.forEach(l => l.setState(state, pedState));
    }

    setWeather(w) { this.weatherType = w; this._updateSky(w); this._updateParticles(w); }
    setTrafficDensity(d) { this.trafficDensity = d; }
    setScenario(s) { this.scenarioType = s.toUpperCase(); }

    _updateSky(w) {
        const c = new THREE.Color({ Sunny:0x87CEEB, Rain:0x556677, Snow:0xDDDDEE, Foggy:0xAAAAAA }[w] || 0x87CEEB);
        this.scene.background = c;
        if (this.scene.fog) this.scene.fog.color = c;
    }
    _updateParticles(w) {
        if (this.particleSystem) { this.scene.remove(this.particleSystem); this.particleSystem = null; }
        if (w !== 'Rain' && w !== 'Snow') return;
        const count = 2000, pos = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            pos[i*3]   = (Math.random()-0.5)*100;
            pos[i*3+1] = Math.random()*30;
            pos[i*3+2] = (Math.random()-0.5)*100;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: w==='Rain'?0x8888ff:0xffffff, size: w==='Rain'?0.08:0.2, transparent:true, opacity:0.7 });
        this.particleSystem = new THREE.Points(geo, mat);
        this.particleSystem.userData.type = w;
        this.scene.add(this.particleSystem);
    }
    updateParticles() {
        if (!this.particleSystem) return;
        const pos = this.particleSystem.geometry.attributes.position;
        const spd = this.particleSystem.userData.type === 'Rain' ? 0.5 : 0.1;
        for (let i = 0; i < pos.count; i++) { pos.setY(i, pos.getY(i)-spd); if (pos.getY(i)<0) pos.setY(i,30); }
        pos.needsUpdate = true;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MAIN UPDATE LOOP
    // ═════════════════════════════════════════════════════════════════════════

    update(dt) {
        this.updateParticles();

        if (this.scenarioType === 'HAZARDOUS') {
            this._updateHazardous(dt);
        } else {
            this._updateSafe(dt);
        }

        this._updateAmbulance(dt);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SAFE SCENARIO UPDATE (ORIGINAL — UNCHANGED LOGIC)
    // ═════════════════════════════════════════════════════════════════════════

    _updateSafe(dt) {
        // Vehicles obey aiState.vehicles
        this.cars.forEach(car => {
            let shouldStop  = false;
            let targetSpeed = car.baseSpeed;

            const z         = car.group.position.z;
            const stopLineZ = car.direction === 1 ? -2.0 : 10.0;
            const isApproach = car.direction === 1 ? z < stopLineZ + 35 : z > stopLineZ - 35;

            if (this.aiState.vehicles === 'STOP' && isApproach) {
                const offset = 2.5;
                const dist   = car.direction === 1
                    ? (stopLineZ - offset) - z
                    : z - (stopLineZ + offset);
                if (dist < 35 && dist > -0.5) {
                    targetSpeed = Math.min(car.baseSpeed, Math.max(0, dist * 1.5));
                    if (dist < 0.1) {
                        shouldStop = true;
                        car.speed  = 0;
                        car.group.position.z = car.direction === 1 ? stopLineZ - offset : stopLineZ + offset;
                    }
                }
            }

            if (this.aiState.vehicles === 'MOVE') { shouldStop = false; targetSpeed = car.baseSpeed; }

            if (shouldStop) { car.speed = Math.max(0, car.speed - 40 * dt); car.stop(); }
            else { car.speed = car.speed < targetSpeed ? Math.min(targetSpeed, car.speed + 15*dt) : Math.max(targetSpeed, car.speed - 20*dt); car.go(); }

            car.update(dt);

            const gap = this.trafficDensity === 'High' ? 12 : this.trafficDensity === 'Low' ? 50 : 22;
            if      (car.direction === 1  && car.group.position.z >  150) { car.group.position.z = -150 - Math.random()*gap; car.speed = car.baseSpeed; }
            else if (car.direction === -1 && car.group.position.z < -150) { car.group.position.z =  150 + Math.random()*gap; car.speed = car.baseSpeed; }
        });

        this._applyFollowingDistance();

        // Pedestrian — original logic
        const walkSpeed = 5.0;
        let isMoving = false;

        if (this.aiState.pedestrian === 'CROSS' && !this.pedestrianCrossed) {
            this.safePedCrossStarted = true;
        }

        if (this.safePedCrossStarted && !this.pedestrianCrossed) {
            this.student.group.position.x += walkSpeed * dt;
            this.student.group.position.z  = 4;   // locked to crosswalk
            this.student.group.position.y  = 0;
            this.student.group.rotation.set(0, Math.PI / 2, 0); // perfectly upright
            isMoving = true;

            if (this.student.group.position.x >= 13) {
                this.student.group.position.x = 13;
                this.pedestrianCrossed        = true;
                this._onCrossSuccess();
            }
        }

        this.student.update(dt, isMoving);

        // Camera follow
        if (this.controls && this.student) {
            if (!this.lastStudentPos) this.lastStudentPos = this.student.group.position.clone();
            const delta = this.student.group.position.clone().sub(this.lastStudentPos);
            this.camera.position.add(delta);
            this.controls.target.copy(this.student.group.position);
            this.controls.update();
            this.lastStudentPos.copy(this.student.group.position);
        }

        this.confetti.update(dt);
    }

    // ═════════════════════════════════════════════════════════════════════════
    // HAZARDOUS SCENARIO UPDATE
    // ═════════════════════════════════════════════════════════════════════════

    _updateHazardous(dt) {
        const h = this.haz;

        // ── Safety messages ───────────────────────────────────────────────────
        if (h.countdownActive) {
            h.safetyMsgTimer += dt;
            if (h.safetyMsgTimer >= 4) {
                h.safetyMsgTimer = 0;
                h.safetyMsgIdx = (h.safetyMsgIdx + 1) % this._safetyMessages.length;
                const el = document.getElementById('safety-msg-bar');
                if (el) { el.style.opacity = 0; setTimeout(() => { el.textContent = this._safetyMessages[h.safetyMsgIdx]; el.style.opacity = 1; }, 300); }
            }
        }

        // ── Countdown timer ───────────────────────────────────────────────────
        if (h.countdownActive && !h.collisionDone) {
            h.countdownElapsed += dt;
            const remaining = Math.max(0, Math.ceil(h.countdown - h.countdownElapsed));
            const el = document.getElementById('countdown-display');
            if (el) {
                el.textContent = remaining;
                el.style.color = remaining <= 5 ? '#ff4040' : remaining <= 10 ? '#ffaa00' : '#00dc82';
            }

            // ── Timer = 0: signal turns RED, ONE vehicle starts moving ────────
            if (remaining === 0 && !h.collisionTriggered) {
                h.collisionTriggered = true;

                // Switch signal to RED
                this.setTrafficLights('RED');
                this.aiState.vehicles      = 'MOVE';
                this.aiState.traffic_light = 'RED';
                this._updateAIPanel();
                this._syncLightButtons('RED');

                // Move pedestrian to the center of collisionLane
                if (h.collisionCarIdx !== -1) {
                    this.student.group.position.x = this.cars[h.collisionCarIdx].laneX;
                }

                // Score penalty
                this.score -= 100;
                this._updateScoreDisplay();

                this._updateStatusText('⚠️ DANGER — Distracted pedestrian in road!', '#ff4040');
            }
        }

        // ── VEHICLES ──────────────────────────────────────────────────────────
        this.cars.forEach((car, idx) => {
            const isCollisionCar = (idx === h.collisionCarIdx);

            if (h.collisionDone) {
                if (isCollisionCar) {
                    // Collision car stays stopped at hit location forever
                    car.speed = 0; car.stopped = true;
                    car.update(dt);
                    return;
                }
                // ISSUE 3: non-collision cars resume normal traffic flow after collision
                // They move freely — the accident is over, traffic unblocked
                car.stopped = false;
                car.speed = Math.min(car.baseSpeed, car.speed + 12 * dt);
                car.go();
                car.update(dt);
                const gap3 = 22;
                if      (car.direction ===  1 && car.group.position.z >  150) { car.group.position.z = -150 - Math.random()*gap3; car.speed = car.baseSpeed; }
                else if (car.direction === -1 && car.group.position.z < -150) { car.group.position.z =  150 + Math.random()*gap3; car.speed = car.baseSpeed; }
                return;
            }

            if (h.collisionTriggered && isCollisionCar) {
                // Already hit and stopped
                if (h.colCarPostHit) {
                    car.speed   = 0;
                    car.stopped = true;
                    return;
                }

                // Approaching: drive normally
                car.stopped = false;
                car.speed   = Math.min(car.baseSpeed, car.speed + 15 * dt);
                car.go();
                car.update(dt);

                const pedX  = this.student.group.position.x;
                const pedZ  = this.student.group.position.z;
                const carZ = car.group.position.z;
                const carX = car.group.position.x;

                // Hit detection
                if (!h.fallStarted && Math.abs(carZ - pedZ) < 4.0 && Math.abs(carX - pedX) < 2.5) {
                    h.fallStarted    = true;
                    h.countdownActive = false;
                    h.colCarPostHit  = true;
                    // stop car exactly where it hits
                    car.speed   = 0;
                    car.stopped = true;
                }
                return;
            }

            if (!h.collisionTriggered) {
                // Vehicles stop ONLY when pedestrian is actively crossing (pedStarted)
                // Before ped starts: signal is RED → vehicles move normally
                const shouldStopForPed = h.pedStarted; // ped on road = vehicles stop
                const z         = car.group.position.z;
                const stopLineZ = car.direction === 1 ? -2.0 : 10.0;
                const isApp     = car.direction === 1 ? z < stopLineZ + 35 : z > stopLineZ - 35;

                if (shouldStopForPed && isApp) {
                    // Ped is crossing — brake smoothly to stop line
                    const offset = 2.5;
                    const dist   = car.direction === 1 ? (stopLineZ-offset)-z : z-(stopLineZ+offset);
                    if (dist < 0.1) { car.speed = 0; car.group.position.z = car.direction===1 ? stopLineZ-offset : stopLineZ+offset; car.stop(); }
                    else { car.speed = Math.max(0, Math.min(car.speed, dist * 1.5)); if (car.speed < 0.1) car.stop(); else car.go(); }
                } else if (shouldStopForPed) {
                    // Already past stop line and ped crossing — hold still
                    car.speed = Math.max(0, car.speed - 30 * dt);
                    if (car.speed < 0.05) { car.speed = 0; car.stop(); }
                } else {
                    // Ped not yet crossing — vehicles move freely (RED signal, normal flow)
                    car.stopped = false;
                    car.speed = Math.min(car.baseSpeed, car.speed + 15 * dt);
                    car.go();
                }
                car.update(dt);
                // Recycle cars that flow off the end
                const gap = 22;
                if      (car.direction ===  1 && car.group.position.z >  150) { car.group.position.z = -150 - Math.random()*gap; car.speed = car.baseSpeed; }
                else if (car.direction === -1 && car.group.position.z < -150) { car.group.position.z =  150 + Math.random()*gap; car.speed = car.baseSpeed; }
            } else {
                // After timer=0, non-collision cars start moving (signal RED)
                car.stopped = false;                       // MUST clear before update
                car.speed = Math.min(car.baseSpeed, car.speed + 10 * dt);
                car.go();
                car.update(dt);
                const gap = 22;
                if      (car.direction ===  1 && car.group.position.z >  150) { car.group.position.z = -150 - Math.random()*gap; car.speed = car.baseSpeed; }
                else if (car.direction === -1 && car.group.position.z < -150) { car.group.position.z =  150 + Math.random()*gap; car.speed = car.baseSpeed; }
            }
        });

        this._applyFollowingDistance();

        // ── PEDESTRIAN ────────────────────────────────────────────────────────
        if (!h.collisionDone) {
            if (h.pedStarted && !h.collisionTriggered) {
                const walkSpeed = 5.0; // SAME as safe scenario
                
                // Select collision vehicle if not already selected
                if (h.collisionCarIdx === -1) {
                    const pedZ = 4;
                    let best = null, bestDist = Infinity;
                    this.cars.forEach((car, idx) => {
                        if (car.direction !== 1) return;
                        const d = pedZ - car.group.position.z;
                        if (d > 0 && d < bestDist) { bestDist = d; best = idx; }
                    });
                    if (best === null) {
                        this.cars.forEach((car, idx) => { if (car.direction === 1 && best === null) best = idx; });
                    }
                    h.collisionCarIdx = best;
                }

                const stopX = h.collisionCarIdx !== -1 ? this.cars[h.collisionCarIdx].laneX : 2.6;

                if (this.student.group.position.x < stopX) {
                    // Walking — identical style to safe scenario
                    this.student.group.position.x += walkSpeed * dt;
                    this.student.group.position.z  = 4;
                    this.student.group.position.y  = 0;
                    this.student.group.rotation.set(0, Math.PI / 2, 0);
                    this.student.update(dt, true);
                    h.phoneTimer = 0;
                    h.atPhone = false;
                } else {
                    // Stopped at 60% — phone distraction
                    this.student.group.position.x = stopX;
                    this.student.group.position.z = 4;
                    this.student.group.position.y = 0;
                    this.student.group.rotation.set(0, Math.PI / 2, 0); // body stays upright
                    h.phoneTimer += dt;
                    h.atPhone = true;

                    // Head looks down at phone
                    if (this.student.head) {
                        this.student.head.rotation.x = 0.4 + Math.sin(h.phoneTimer * 1.5) * 0.06;
                    }
                    // Right arm raised (holding phone)
                    if (this.student.rArm) {
                        this.student.rArm.rotation.x = -0.9;
                    }
                    this.student.update(dt, false);

                    // Start countdown once ped is stopped
                    if (!h.countdownActive) {
                        h.countdownActive = true;
                        const cdEl = document.getElementById('countdown-display');
                        if (cdEl) { cdEl.style.display = 'block'; cdEl.textContent = '30'; }
                        const safeEl = document.getElementById('safety-msg-bar');
                        if (safeEl) { safeEl.style.display = 'block'; safeEl.textContent = this._safetyMessages[0]; }
                        this._updateAIPanel();
                    }
                }
            } else if (!h.pedStarted) {
                this.student.update(dt, false);
            }
        }

        // ── FALL ANIMATION ────────────────────────────────────────────────────
        if (h.fallStarted && !h.collisionDone) {
            h.fallTimer += dt;
            const t = Math.min(1, h.fallTimer / h.fallDuration);

            // Rotate forward on X axis — lies flat on road
            this.student.group.rotation.x = t * (Math.PI / 2);
            this.student.group.rotation.y = Math.PI / 2;
            this.student.group.rotation.z = 0;
            this.student.group.position.y = 0; // never sink below road
            this.student.group.position.z = 4;

            this.student.update(dt, false);

            if (t >= 1) {
                h.collisionDone = true;
                this.student.group.position.y = 0;
                // Spawn ambulance
                this._spawnAmbulance();
                this._updateStatusText('🚑 Ambulance dispatched — Emergency response!', '#ffaa00');
                this._showHazardReport();
            }
        }

        // Camera follow
        if (this.controls && this.student) {
            if (!this.lastStudentPos) this.lastStudentPos = this.student.group.position.clone();
            const delta = this.student.group.position.clone().sub(this.lastStudentPos);
            this.camera.position.add(delta);
            this.controls.target.copy(this.student.group.position);
            this.controls.update();
            this.lastStudentPos.copy(this.student.group.position);
        }
    }

    // ═════════════════════════════════════════════════════════════════════════
    // AMBULANCE
    // ═════════════════════════════════════════════════════════════════════════

    _spawnAmbulance() {
        if (this.ambulanceGroup) return;

        const g = new THREE.Group();

        // Body (oriented along Z — travels in +Z direction like direction=1 cars)
        const bodyMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
        const body    = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.8, 4.2), bodyMat);
        body.position.y = 0.9;
        g.add(body);

        // Red stripes on sides
        const sm = new THREE.MeshLambertMaterial({ color: 0xff2222 });
        [-1.03, 1.03].forEach(x => {
            const s = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.35, 4.3), sm);
            s.position.set(x, 1.1, 0); g.add(s);
        });

        // Roof
        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 2.5), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
        roof.position.y = 1.95; g.add(roof);

        // Light bar
        this._ambLightL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
        this._ambLightL.position.set(-0.4, 2.15, 0); g.add(this._ambLightL);
        this._ambLightR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x0000ff }));
        this._ambLightR.position.set( 0.4, 2.15, 0); g.add(this._ambLightR);

        // Wheels — rotation.x = PI/2 because vehicle travels along Z (axle along X)
        const wR = 0.38;
        const wGeo = new THREE.CylinderGeometry(wR, wR, 0.28, 14);
        const wMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        [[-0.95, wR, 1.5],[0.95, wR, 1.5],[-0.95, wR,-1.5],[0.95, wR,-1.5]].forEach(p => {
            const w = new THREE.Mesh(wGeo, wMat);
            w.rotation.x = Math.PI / 2;  // correct for Z-travelling vehicle
            w.position.set(...p);
            g.add(w);
        });

        // Red cross on front
        const cm = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 0.05), cm);
        const cv = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.15, 0.05), cm);
        ch.position.set(0, 1.2, 2.13); cv.position.set(0, 1.2, 2.13);
        g.add(ch); g.add(cv);

        // ISSUE 2: Dedicated emergency lane x=11.5 — fully outside all traffic
        // (outermost traffic lane is x=7.5). Starts far back at z=-140.
        g.position.set(11.5, 0, -140);
        this.scene.add(g);
        this.ambulanceGroup = g;
        this.ambulancePhase = 'ARRIVING';
        this.ambulanceTimer = 0;
    }

    _updateAmbulance(dt) {
        if (!this.ambulanceGroup) return;

        // Flash lights
        const t = Date.now() * 0.006;
        if (this._ambLightL) this._ambLightL.material.color.setHex(Math.sin(t) > 0 ? 0xff0000 : 0x330000);
        if (this._ambLightR) this._ambLightR.material.color.setHex(Math.sin(t) > 0 ? 0x000033 : 0x0000ff);

        this.ambulanceTimer += dt;

        if (this.ambulancePhase === 'ARRIVING') {
            // Drive along Z toward accident. Stop at z=4 (crosswalk centre)
            // at x=11.5 — fully outside both traffic lanes (-4.5 and 4.5).
            const targetZ = 4.0;
            if (this.ambulanceGroup.position.z < targetZ) {
                this.ambulanceGroup.position.z += 24 * dt;
                this.ambulanceGroup.position.y  = 0;
            } else {
                this.ambulanceGroup.position.z = targetZ;
                this.ambulanceGroup.position.y = 0;
                this.ambulancePhase = 'STOPPED';
                this.ambulanceTimer = 0;
                this._spawnParamedic();
            }
        }

        if (this.ambulancePhase === 'PARAMEDIC' && this.paramedicGroup) {
            // Paramedic walks along +X toward fallen ped
            const pedX   = this.student.group.position.x;
            const target = pedX - 1.0;
            if (this.paramedicGroup.position.x < target) {
                this.paramedicGroup.position.x += 3 * dt;
            } else {
                this.ambulancePhase = 'LOADING';
                this.ambulanceTimer = 0;
            }
        }

        if (this.ambulancePhase === 'LOADING' && this.ambulanceTimer > 2.5) {
            if (this.student)        this.student.group.visible       = false;
            if (this.paramedicGroup) this.paramedicGroup.visible       = false;
            this.ambulancePhase = 'LEAVING';
            this.ambulanceTimer = 0;
        }

        if (this.ambulancePhase === 'LEAVING') {
            this.ambulanceGroup.position.z += 20 * dt;
            if (this.ambulanceGroup.position.z > 160) {
                this.scene.remove(this.ambulanceGroup);
                this.ambulanceGroup = null;
                this.ambulancePhase = 'NONE';
                this._updateStatusText('Simulation complete. Press Restart.', 'white');
            }
        }
    }

    _spawnParamedic() {
        const g   = new THREE.Group();
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.4), new THREE.MeshLambertMaterial({ color: 0x00aa00 }));
        body.position.y = 0.8; g.add(body);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshLambertMaterial({ color: 0xffcc99 }));
        head.position.y = 1.55; g.add(head);
        // ISSUE 2: spawn at ambulance X (11.5), walk along X toward ped
        const ambX = this.ambulanceGroup ? this.ambulanceGroup.position.x : 11.5;
        g.position.set(ambX, 0, 4);
        g.rotation.y = Math.PI / 2;
        this.scene.add(g);
        this.paramedicGroup  = g;
        this.ambulancePhase  = 'PARAMEDIC';
        this.ambulanceTimer  = 0;
    }

    // ═════════════════════════════════════════════════════════════════════════
    // SUCCESS / REPORTS
    // ═════════════════════════════════════════════════════════════════════════

    _onCrossSuccess() {
        this.confetti.trigger(this.student.group.position);
        this.score += 50;
        this._updateScoreDisplay();
        this._showSuccessOverlay();
        this.setTrafficLights('RED');
        this._syncLightButtons('RED');
    }

    _showSuccessOverlay() {
        const el = document.getElementById('status-message');
        if (!el) return;
        const rc = { LOW:'#00dc82', MEDIUM:'#ffaa00', HIGH:'#ff4040' }[this.aiState.risk] || '#fff';
        el.innerHTML =
            `<div style="text-align:center;line-height:1.8">` +
            `<div style="font-size:1.5em;font-weight:800;color:#00dc82">✅ SUCCESSFULLY CROSSED</div>` +
            `<div style="font-size:0.9em;color:#ccc;margin-top:4px">Risk Level: <span style="color:${rc};font-weight:700">${this.aiState.risk}</span></div>` +
            `<div style="font-size:0.85em;color:#aaa;margin-top:2px">AI Message: ${this.aiState.message}</div>` +
            `<div style="font-size:0.75em;color:#666;margin-top:8px">Press ⟳ Restart to go again</div>` +
            `</div>`;
        el.style.color   = 'white';
        el.style.display = 'block';
    }

    _showHazardReport() {
        const el = document.getElementById('status-message');
        if (!el) return;
        el.innerHTML =
            `<div style="text-align:center;line-height:1.9">` +
            `<div style="font-size:1.3em;font-weight:800;color:#ff4040">⚠️ COLLISION OCCURRED</div>` +
            `<div style="font-size:0.85em;color:#ffaa00;margin-top:6px">📵 Pedestrian was distracted by phone</div>` +
            `<div style="font-size:0.85em;color:#ffaa00">⏱️ Failed to cross within 30 seconds</div>` +
            `<div style="font-size:0.8em;color:#aaa;margin-top:6px">Score: ${this.score}</div>` +
            `<div style="font-size:0.75em;color:#666;margin-top:6px">Press ⟳ Restart to try again</div>` +
            `</div>`;
        el.style.color   = 'white';
        el.style.display = 'block';
    }

    // ═════════════════════════════════════════════════════════════════════════
    // RESET
    // ═════════════════════════════════════════════════════════════════════════

    reset() {
        // Pedestrian
        this.pedestrianCrossed = false;
        this.safePedCrossStarted = false;
        this.student.group.position.set(-13, 0, 4);
        this.student.group.rotation.set(0, 0, 0);
        this.student.group.visible = true;
        this.lastStudentPos = null;

        // Hazardous state
        this.haz = {
            pedStarted: false, atPhone: false, phoneTimer: 0,
            countdown: 30, countdownActive: false, countdownElapsed: 0,
            collisionTriggered: false, collisionCarIdx: -1,
            fallStarted: false, fallTimer: 0, fallDuration: 1.2,
            collisionDone: false, safetyMsgIdx: 0, safetyMsgTimer: 0,
        };

        // Score
        this.score = 100;
        this._updateScoreDisplay();

        // Ambulance
        if (this.ambulanceGroup) { this.scene.remove(this.ambulanceGroup); this.ambulanceGroup = null; }
        if (this.paramedicGroup)  { this.scene.remove(this.paramedicGroup);  this.paramedicGroup  = null; }
        this.ambulancePhase = 'NONE';
        this.ambulanceTimer = 0;

        // Countdown display
        const cdEl = document.getElementById('countdown-display');
        if (cdEl) { cdEl.textContent = '30'; cdEl.style.display = 'none'; cdEl.style.color = '#00dc82'; }

        // Safety msg bar
        const smEl = document.getElementById('safety-msg-bar');
        if (smEl) { smEl.style.display = 'none'; }

        // AI state
        this.aiState = { pedestrian:'WAIT', vehicles:'MOVE', traffic_light:'RED', risk:'LOW', message:'' };
        this.setTrafficLights('RED');
        this._syncLightButtons('RED');

        // Vehicles
        this.cars.forEach(car => { car.speed = car.baseSpeed; car.go(); });

        // UI
        const statusEl = document.getElementById('status-message');
        if (statusEl) { statusEl.innerHTML = ''; statusEl.style.display = 'none'; }

        const alertPanel = document.getElementById('ai-alert-panel');
        if (alertPanel) { alertPanel.classList.remove('ai-alert-show'); alertPanel.classList.add('ai-alert-hide'); }

        const riskBadge = document.getElementById('ai-risk-badge');
        if (riskBadge) { riskBadge.className = 'risk-badge risk-low'; riskBadge.textContent = 'LOW'; }

        const msgText = document.getElementById('ai-message-text');
        if (msgText) msgText.textContent = 'Awaiting AI assessment…';

        ['ai-tag-light','ai-tag-safety','ai-tag-driver','ai-tag-pedestrian','ai-tag-scenario'].forEach(id => {
            const e = document.getElementById(id); if (e) e.className = 'ai-agent-tag';
        });

        this.fetchAIDecisions();
    }

    handleClick() {}

    // ═════════════════════════════════════════════════════════════════════════
    // AI FETCH / APPLY
    // ═════════════════════════════════════════════════════════════════════════

    async fetchAIDecisions() {
        const fetchId = ++this.aiFetchId;
        const dMap = { Low:'LOW', Normal:'MEDIUM', High:'HIGH' };
        const wMap = { Sunny:'SUNNY', Rain:'RAINY', Snow:'SNOWY', Foggy:'FOGGY' };
        const payload = {
            traffic_light:   this.currentLight,
            traffic_density: dMap[this.trafficDensity] || 'MEDIUM',
            weather:         wMap[this.weatherType]    || 'SUNNY'
        };
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 1000);
            const res = await fetch('http://127.0.0.1:5000/traffic-decision', {
                method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload), signal: controller.signal
            });
            clearTimeout(timeoutId);
            if (fetchId !== this.aiFetchId) return;
            if (res.ok) { this.applyAIDecisions(await res.json()); }
            else { this._applyFallback(payload); }
        } catch (e) { 
            if (fetchId !== this.aiFetchId) return;
            this._applyFallback(payload); 
        }
    }

    _applyFallback(payload) {
        const light = payload.traffic_light, density = payload.traffic_density;
        let risk, message;
        if (density === 'HIGH')        { risk='HIGH';   message='Heavy traffic. Pedestrian must wait.'; }
        else if (density === 'MEDIUM') { risk='MEDIUM'; message='Moderate traffic. Pedestrian must wait.'; }
        else                           { risk='LOW';    message='Low traffic. Safe to cross.'; }
        const pedestrian = (light === 'GREEN') ? 'CROSS' : 'WAIT';
        const vehicles   = light === 'GREEN' ? 'STOP' : 'MOVE';
        this.applyAIDecisions({ pedestrian, vehicles, traffic_light:light, risk, message });
    }

    applyAIDecisions(data) {
        if (!data) return;

        this.aiState = {
            pedestrian:    (data.pedestrian    || 'WAIT').toUpperCase(),
            vehicles:      (data.vehicles      || 'MOVE').toUpperCase(),
            traffic_light: (data.traffic_light || this.currentLight).toUpperCase(),
            risk:          (data.risk          || 'LOW').toUpperCase(),
            message:       data.message || ''
        };

        // In hazardous, CROSS triggers ped walking (not controlled by aiState directly)
        if (this.scenarioType === 'HAZARDOUS' && this.aiState.pedestrian === 'CROSS') {
            if (!this.haz.pedStarted && !this.haz.collisionDone) {
                this.haz.pedStarted = true;
            }
        }

        // Vehicle nudge for safe scenario only
        if (this.scenarioType === 'SAFE' && this.aiState.vehicles === 'MOVE') {
            this.cars.forEach(car => { if (car.speed < 0.1) car.speed = car.baseSpeed * 0.1; car.go(); });
        }

        this._updateAIPanel();
        this._updateStatusBar();
    }

    _updateAIPanel() {
        const panel = document.getElementById('ai-alert-panel');
        if (!panel) return;

        // In hazardous, show scenario-aware state
        const isHaz   = this.scenarioType === 'HAZARDOUS';
        const h       = this.haz;

        const displayRisk  = isHaz && (h.atPhone || h.collisionTriggered) ? 'HIGH'
            : isHaz && h.pedStarted ? 'MEDIUM'
            : this.aiState.risk;

        const displayPed   = isHaz && h.collisionDone     ? 'FALLEN'
            : isHaz && h.collisionTriggered               ? 'DISTRACTED'
            : isHaz && h.atPhone                          ? 'DISTRACTED'
            : isHaz && h.pedStarted                       ? 'CROSSING'
            : this.aiState.pedestrian;

        const displayVeh   = isHaz && h.collisionDone     ? 'STOPPED'
            : isHaz && h.collisionTriggered               ? 'MOVE'
            : isHaz && h.pedStarted                       ? 'STOP'
            : this.aiState.vehicles;

        const displayLight = this.currentLight;

        const riskBadge = document.getElementById('ai-risk-badge');
        if (riskBadge) { riskBadge.className = 'risk-badge risk-'+displayRisk.toLowerCase(); riskBadge.textContent = displayRisk; }

        const msgText = document.getElementById('ai-message-text');
        if (msgText) {
            if (isHaz && h.collisionDone) msgText.textContent = '⚠️ Unsafe crossing — collision occurred.';
            else if (isHaz && h.atPhone) msgText.textContent  = '📵 Pedestrian distracted! Vehicle approaching!';
            else if (isHaz && h.pedStarted) msgText.textContent = '⏱️ Pedestrian crossing — vehicles stopped.';
            else msgText.textContent = this.aiState.message || 'Awaiting AI assessment…';
        }

        const setTag = (id, label, isGood) => {
            const el = document.getElementById(id);
            if (el) { el.textContent = label; el.className = 'ai-agent-tag ' + (isGood ? 'active-safe' : 'active-warn'); }
        };

        setTag('ai-tag-light',      '🚦 Light: '      + displayLight,  displayLight === 'GREEN');
        setTag('ai-tag-safety',     '🛡️ Safety: '    + displayRisk + ' RISK', displayRisk === 'LOW');
        setTag('ai-tag-driver',     '🚗 Vehicle: '    + displayVeh,    displayVeh === 'STOP');
        setTag('ai-tag-pedestrian', '🚶 Pedestrian: ' + displayPed,    displayPed === 'CROSSING' || displayPed === 'CROSS');

        const tagScen = document.getElementById('ai-tag-scenario');
        if (tagScen) {
            tagScen.textContent = '🎭 Scenario: ' + this.scenarioType;
            tagScen.className   = 'ai-agent-tag ' + (isHaz ? 'active-warn' : 'active-safe');
        }

        panel.classList.remove('ai-alert-hide');
        panel.classList.add('ai-alert-show');
    }

    _updateStatusBar() {
        const el = document.getElementById('status-message');
        if (!el || el.innerHTML.includes('SUCCESSFULLY') || el.innerHTML.includes('COLLISION')) return;
        if (this.aiState.risk === 'HIGH')        { el.innerHTML = `⚠️ HIGH RISK — ${this.aiState.message}`; el.style.color = '#ff4040'; }
        else if (this.aiState.risk === 'MEDIUM') { el.innerHTML = `⚠️ Medium Risk — ${this.aiState.message}`; el.style.color = '#ffaa00'; }
        else if (this.aiState.pedestrian === 'CROSS') { el.innerHTML = `✅ Safe to cross — ${this.aiState.message}`; el.style.color = '#00dc82'; }
        else { el.innerHTML = `🚦 ${this.aiState.message}`; el.style.color = 'white'; }
        el.style.display = 'block';
    }

    _updateStatusText(msg, color) {
        const el = document.getElementById('status-message');
        if (el) { el.innerHTML = msg; el.style.color = color || 'white'; el.style.display = 'block'; }
    }

    _updateScoreDisplay() {
        const el = document.getElementById('score-display');
        if (el) el.textContent = 'Score: ' + this.score;
    }

    _syncLightButtons(state) {
        const r = document.getElementById('toggle-red-btn');
        const g = document.getElementById('toggle-green-btn');
        if (r) r.className = 'traffic-toggle-btn' + (state==='RED'   ? ' active-red'   : '');
        if (g) g.className = 'traffic-toggle-btn' + (state==='GREEN' ? ' active-green' : '');
    }

    // ═════════════════════════════════════════════════════════════════════════
    // URBAN ENVIRONMENT (unchanged from original)
    // ═════════════════════════════════════════════════════════════════════════

    createUrbanEnvironment() {
        const mats = [
            new THREE.MeshStandardMaterial({ color:0x9a9a9a, metalness:0.1, roughness:0.8 }),
            new THREE.MeshStandardMaterial({ color:0x8b4726, metalness:0.0, roughness:0.9 }),
            new THREE.MeshStandardMaterial({ color:0x4a6fa5, metalness:0.7, roughness:0.2 })
        ];
        const side = s => {
            for (let i = 0; i < 20; i++) {
                const w=8+Math.random()*12, h=15+Math.random()*40, d=8+Math.random()*12;
                const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mats[Math.floor(Math.random()*3)]);
                m.position.set(s*(32+Math.random()*25), h/2, (Math.random()-0.5)*450);
                m.castShadow = m.receiveShadow = true;
                this.scene.add(m);
            }
        };
        side(-1); side(1);
    }

    createStreetProps() {
        for (let i = 0; i < 12; i++) {
            const z = (i/11)*400-200;
            this._lamp(-12.5, z, Math.PI);
            this._lamp( 12.5, z, 0);
        }
    }

    _lamp(x, z, rot) {
        const g   = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({ color:0x222222 });
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.15,7,8), mat);
        const head = new THREE.Mesh(new THREE.BoxGeometry(1.2,0.2,0.4), mat);
        const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.8,0.1,0.3), new THREE.MeshBasicMaterial({ color:0xffffaa }));
        pole.position.y=3.5; head.position.set(0.5,7,0); bulb.position.set(0.6,6.9,0);
        g.add(pole); g.add(head); g.add(bulb);
        g.position.set(x,0,z); g.rotation.y=rot;
        this.scene.add(g);
    }
}
