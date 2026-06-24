import * as THREE from 'three';

export class TrafficLight {
    constructor(x, z, rotationY = 0) {
        this.group = new THREE.Group();
        this.state = 'RED';
        this.pedState = 'DONT_WALK';

        const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 6, 16);
        const poleMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
        this.pole = new THREE.Mesh(poleGeo, poleMat);
        this.pole.position.y = 3;
        this.group.add(this.pole);

        const boxGeo = new THREE.BoxGeometry(0.6, 1.5, 0.5);
        const boxMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        this.box = new THREE.Mesh(boxGeo, boxMat);
        this.box.position.set(0, 5, 0);
        this.group.add(this.box);

        this.redLight = this.createLight(0x330000, 5.4, 0.26);
        this.yellowLight = this.createLight(0x333300, 5.0, 0.26);
        this.greenLight = this.createLight(0x003300, 4.6, 0.26);

        this.group.add(this.redLight);
        this.group.add(this.yellowLight);
        this.group.add(this.greenLight);

        const buttonBoxGeo = new THREE.BoxGeometry(0.2, 0.3, 0.15);
        const buttonBoxMat = new THREE.MeshLambertMaterial({ color: 0xFFD700 });
        this.buttonBox = new THREE.Mesh(buttonBoxGeo, buttonBoxMat);
        this.buttonBox.position.set(0, 1.5, 0.1);
        this.group.add(this.buttonBox);

        this.buttonMesh = this.buttonBox;
        this.buttonMesh.name = "CrossButton";

        const pedGroup = new THREE.Group();
        pedGroup.position.set(0, 3.5, 0);
        pedGroup.rotation.y = -Math.PI / 2;

        // Larger housing for the light
        const pModGeo = new THREE.BoxGeometry(0.7, 0.7, 0.35);
        const pModMat = new THREE.MeshLambertMaterial({ color: 0x111111 });
        this.pedStructure = new THREE.Mesh(pModGeo, pModMat);
        pedGroup.add(this.pedStructure);

        // Create the single signal display (Canvas based)
        this.createPedSignal(pedGroup);

        this.group.add(pedGroup);

        this.group.position.set(x, 0, z);
        this.group.rotation.y = rotationY;

        this.setState('GREEN', 'DONT_WALK');
    }

    createLight(colorHex, y, z) {
        const geo = new THREE.CircleGeometry(0.15, 32);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, y, z);
        return mesh;
    }

    createPedSignal(group) {
        // Create shared canvas texture
        this.pedCanvas = document.createElement('canvas');
        this.pedCtx = this.pedCanvas.getContext('2d');
        this.pedCanvas.width = 256;
        this.pedCanvas.height = 256;

        this.pedTexture = new THREE.CanvasTexture(this.pedCanvas);
        this.pedMat = new THREE.MeshBasicMaterial({
            map: this.pedTexture,
            transparent: true
        });

        const signGeo = new THREE.PlaneGeometry(0.55, 0.55);

        // Front Sign
        this.pedFront = new THREE.Mesh(signGeo, this.pedMat);
        this.pedFront.position.set(0, 0, 0.18);
        group.add(this.pedFront);

        // Back Sign
        this.pedBack = new THREE.Mesh(signGeo, this.pedMat);
        this.pedBack.position.set(0, 0, -0.18);
        this.pedBack.rotation.y = Math.PI;
        group.add(this.pedBack);
    }

    setState(state, pedestrianState) {
        this.state = state;
        this.pedState = pedestrianState;

        this.redLight.material.color.setHex(0x330000);
        this.yellowLight.material.color.setHex(0x333300);
        this.greenLight.material.color.setHex(0x003300);

        if (state === 'RED') {
            this.redLight.material.color.setHex(0xFF0000);
        } else if (state === 'YELLOW') {
            this.yellowLight.material.color.setHex(0xFFAA00);
        } else if (state === 'GREEN') {
            this.greenLight.material.color.setHex(0x00FF00);
        }

        // Update pedestrian signal
        this.updatePedCanvas(pedestrianState);
    }

    updatePedCanvas(pedState) {
        const ctx = this.pedCtx;
        const width = 256;
        const height = 256;

        // Clear
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);

        const isWalk = pedState === 'WALK';
        const color = isWalk ? '#00FF00' : '#FF0000';
        ctx.fillStyle = color;

        // Draw Symbol (Scale up coordinates)
        const cx = width / 2;
        const cy = height / 2 - 20;

        // Head
        ctx.beginPath();
        ctx.arc(cx, cy - 50, 25, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillRect(cx - 10, cy - 20, 20, 60);

        if (isWalk) {
            // Walking Pose
            // Arms
            ctx.save();
            ctx.translate(cx, cy); // shoulder pivot roughly

            // Left Arm (swing back)
            ctx.save();
            ctx.rotate(-Math.PI / 4);
            ctx.fillRect(-10, 0, 10, 45); // arm length
            ctx.restore();

            // Right Arm (swing forward)
            ctx.save();
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(0, 0, 10, 45);
            ctx.restore();

            ctx.restore();

            // Legs
            // Left Leg (back)
            ctx.save();
            ctx.translate(cx, cy + 40); // hip
            ctx.rotate(-Math.PI / 6);
            ctx.fillRect(-10, 0, 15, 60);
            ctx.restore();

            // Right Leg (forward)
            ctx.save();
            ctx.translate(cx, cy + 40);
            ctx.rotate(Math.PI / 6);
            ctx.fillRect(-5, 0, 15, 60);
            ctx.restore();

        } else {
            // Standing Pose (Stop)
            // Arms (sides)
            ctx.fillRect(cx - 35, cy - 20, 15, 55);
            ctx.fillRect(cx + 20, cy - 20, 15, 55);

            // Legs (straight)
            ctx.fillRect(cx - 15, cy + 40, 12, 60);
            ctx.fillRect(cx + 3, cy + 40, 12, 60);
        }

        this.pedTexture.needsUpdate = true;

    }
}

export class Car {
    constructor(color, startZ, speed, laneX, direction = 1) {
        this.group = new THREE.Group();
        this.speed = speed;
        this.baseSpeed = speed;
        this.laneX = laneX;
        this.direction = direction; // 1 for +Z, -1 for -Z
        this.stopped = false;

        // --- REALISTIC CAR MODEL ---
        const carWidth = 1.8;
        const carLength = 4.2;
        const chassisHeight = 0.6;
        const wheelRadius = 0.32;
        const wheelWidth = 0.25;

        // Materials
        const paintMat = new THREE.MeshStandardMaterial({
            color: color,
            metalness: 0.7,
            roughness: 0.2
        });

        const glassMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.95,
            roughness: 0.05,
            transparent: true,
            opacity: 0.3
        });

        const chromeMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.95,
            roughness: 0.1
        });

        const blackPlasticMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.2,
            roughness: 0.8
        });

        // 1. MAIN CHASSIS (Lower body) - Rounded
        const chassisGeo = new THREE.BoxGeometry(carWidth, chassisHeight, carLength);
        // Round the edges
        chassisGeo.parameters = { width: carWidth, height: chassisHeight, depth: carLength };
        this.chassis = new THREE.Mesh(chassisGeo, paintMat);
        this.chassis.position.y = wheelRadius + chassisHeight / 2;
        this.chassis.castShadow = true;
        this.chassis.receiveShadow = true;
        this.group.add(this.chassis);

        // 2. CABIN (Upper body) - More realistic proportions
        const cabinLength = 2.2;
        const cabinWidth = carWidth - 0.15;
        const cabinHeight = 0.7;
        const cabinGeo = new THREE.BoxGeometry(cabinWidth, cabinHeight, cabinLength);
        const cabin = new THREE.Mesh(cabinGeo, paintMat);
        cabin.position.y = wheelRadius + chassisHeight + cabinHeight / 2;
        cabin.position.z = -0.4; // Offset back
        cabin.castShadow = true;
        this.group.add(cabin);

        // 3. HOOD (Front section)
        const hoodGeo = new THREE.BoxGeometry(carWidth, 0.15, 1.2);
        const hood = new THREE.Mesh(hoodGeo, paintMat);
        hood.position.set(0, wheelRadius + chassisHeight + 0.075, carLength / 2 - 0.6);
        hood.castShadow = true;
        this.group.add(hood);

        // 4. TRUNK (Rear section)
        const trunkGeo = new THREE.BoxGeometry(carWidth, 0.2, 0.8);
        const trunk = new THREE.Mesh(trunkGeo, paintMat);
        trunk.position.set(0, wheelRadius + chassisHeight + 0.1, -carLength / 2 + 0.4);
        trunk.castShadow = true;
        this.group.add(trunk);

        // 5. WINDSHIELD (Angled)
        const windshieldGeo = new THREE.PlaneGeometry(cabinWidth - 0.1, 0.65);
        const windshield = new THREE.Mesh(windshieldGeo, glassMat);
        windshield.position.set(0, cabin.position.y + 0.15, cabin.position.z + cabinLength / 2 + 0.01);
        windshield.rotation.x = -Math.PI / 8;
        this.group.add(windshield);

        // 6. REAR WINDOW
        const rearWinGeo = new THREE.PlaneGeometry(cabinWidth - 0.1, 0.55);
        const rearWin = new THREE.Mesh(rearWinGeo, glassMat);
        rearWin.position.set(0, cabin.position.y + 0.1, cabin.position.z - cabinLength / 2 - 0.01);
        rearWin.rotation.set(Math.PI / 10, Math.PI, 0);
        this.group.add(rearWin);

        // 7. SIDE WINDOWS
        const sideWinGeo = new THREE.PlaneGeometry(cabinLength - 0.8, 0.5);
        const lSideWin = new THREE.Mesh(sideWinGeo, glassMat);
        lSideWin.position.set(-cabinWidth / 2 - 0.01, cabin.position.y + 0.05, cabin.position.z);
        lSideWin.rotation.y = -Math.PI / 2;
        this.group.add(lSideWin);

        const rSideWin = new THREE.Mesh(sideWinGeo, glassMat);
        rSideWin.position.set(cabinWidth / 2 + 0.01, cabin.position.y + 0.05, cabin.position.z);
        rSideWin.rotation.y = Math.PI / 2;
        this.group.add(rSideWin);

        // 8. SIDE MIRRORS (Detailed)
        const mirrorBaseGeo = new THREE.BoxGeometry(0.08, 0.12, 0.15);
        const mirrorGlassGeo = new THREE.BoxGeometry(0.02, 0.15, 0.2);

        // Left mirror
        const lMirrorBase = new THREE.Mesh(mirrorBaseGeo, blackPlasticMat);
        lMirrorBase.position.set(-carWidth / 2 - 0.04, cabin.position.y - 0.1, cabinLength / 2 - 0.3);
        this.group.add(lMirrorBase);
        const lMirrorGlass = new THREE.Mesh(mirrorGlassGeo, chromeMat);
        lMirrorGlass.position.set(-carWidth / 2 - 0.12, cabin.position.y - 0.1, cabinLength / 2 - 0.3);
        this.group.add(lMirrorGlass);

        // Right mirror
        const rMirrorBase = new THREE.Mesh(mirrorBaseGeo, blackPlasticMat);
        rMirrorBase.position.set(carWidth / 2 + 0.04, cabin.position.y - 0.1, cabinLength / 2 - 0.3);
        this.group.add(rMirrorBase);
        const rMirrorGlass = new THREE.Mesh(mirrorGlassGeo, chromeMat);
        rMirrorGlass.position.set(carWidth / 2 + 0.12, cabin.position.y - 0.1, cabinLength / 2 - 0.3);
        this.group.add(rMirrorGlass);

        // 9. HEADLIGHTS (Realistic housings)
        const headlightHousingGeo = new THREE.BoxGeometry(0.35, 0.22, 0.12);
        const headlightGlassGeo = new THREE.PlaneGeometry(0.3, 0.18);
        const headlightMat = new THREE.MeshStandardMaterial({
            color: 0xffffee,
            emissive: 0xffffaa,
            emissiveIntensity: 0.3
        });

        // Left headlight
        const lHLHousing = new THREE.Mesh(headlightHousingGeo, chromeMat);
        lHLHousing.position.set(-0.65, this.chassis.position.y + 0.15, carLength / 2 - 0.06);
        this.group.add(lHLHousing);
        const lHLGlass = new THREE.Mesh(headlightGlassGeo, headlightMat);
        lHLGlass.position.set(-0.65, this.chassis.position.y + 0.15, carLength / 2 + 0.01);
        this.group.add(lHLGlass);

        // Right headlight
        const rHLHousing = new THREE.Mesh(headlightHousingGeo, chromeMat);
        rHLHousing.position.set(0.65, this.chassis.position.y + 0.15, carLength / 2 - 0.06);
        this.group.add(rHLHousing);
        const rHLGlass = new THREE.Mesh(headlightGlassGeo, headlightMat);
        rHLGlass.position.set(0.65, this.chassis.position.y + 0.15, carLength / 2 + 0.01);
        this.group.add(rHLGlass);

        // 10. TAILLIGHTS (Realistic housings)
        const taillightHousingGeo = new THREE.BoxGeometry(0.3, 0.25, 0.1);
        const taillightGlassGeo = new THREE.PlaneGeometry(0.25, 0.2);
        const taillightMat = new THREE.MeshStandardMaterial({
            color: 0xff0000,
            emissive: 0x880000,
            emissiveIntensity: 0.4
        });

        // Left taillight
        const lTLHousing = new THREE.Mesh(taillightHousingGeo, blackPlasticMat);
        lTLHousing.position.set(-0.7, this.chassis.position.y + 0.2, -carLength / 2 + 0.05);
        this.group.add(lTLHousing);
        const lTLGlass = new THREE.Mesh(taillightGlassGeo, taillightMat);
        lTLGlass.position.set(-0.7, this.chassis.position.y + 0.2, -carLength / 2 - 0.01);
        lTLGlass.rotation.y = Math.PI;
        this.group.add(lTLGlass);

        // Right taillight
        const rTLHousing = new THREE.Mesh(taillightHousingGeo, blackPlasticMat);
        rTLHousing.position.set(0.7, this.chassis.position.y + 0.2, -carLength / 2 + 0.05);
        this.group.add(rTLHousing);
        const rTLGlass = new THREE.Mesh(taillightGlassGeo, taillightMat);
        rTLGlass.position.set(0.7, this.chassis.position.y + 0.2, -carLength / 2 - 0.01);
        rTLGlass.rotation.y = Math.PI;
        this.group.add(rTLGlass);

        // 11. LICENSE PLATES
        const plateGeo = new THREE.PlaneGeometry(0.4, 0.15);
        const plateMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            metalness: 0.1,
            roughness: 0.7
        });

        // Front plate
        const frontPlate = new THREE.Mesh(plateGeo, plateMat);
        frontPlate.position.set(0, this.chassis.position.y - 0.1, carLength / 2 + 0.01);
        this.group.add(frontPlate);

        // Rear plate
        const rearPlate = new THREE.Mesh(plateGeo, plateMat);
        rearPlate.position.set(0, this.chassis.position.y - 0.05, -carLength / 2 - 0.01);
        rearPlate.rotation.y = Math.PI;
        this.group.add(rearPlate);

        // 12. WHEELS (Detailed with rims)
        const tireGeo = new THREE.CylinderGeometry(wheelRadius, wheelRadius, wheelWidth, 24);
        const tireMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.1,
            roughness: 0.9
        });

        const rimGeo = new THREE.CylinderGeometry(wheelRadius * 0.7, wheelRadius * 0.7, wheelWidth * 0.6, 24);
        const rimMat = new THREE.MeshStandardMaterial({
            color: 0xaaaaaa,
            metalness: 0.8,
            roughness: 0.2
        });

        const wheelPositions = [
            [-0.85, wheelRadius, 1.5],  // Front left
            [0.85, wheelRadius, 1.5],   // Front right
            [-0.85, wheelRadius, -1.3], // Rear left
            [0.85, wheelRadius, -1.3]   // Rear right
        ];

        wheelPositions.forEach(pos => {
            // Tire
            const tire = new THREE.Mesh(tireGeo, tireMat);
            tire.rotation.z = Math.PI / 2;
            tire.position.set(...pos);
            tire.castShadow = true;
            this.group.add(tire);

            // Rim
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            rim.position.set(...pos);
            this.group.add(rim);
        });

        // 13. WHEEL WELLS / FENDERS
        const fenderGeo = new THREE.BoxGeometry(0.3, 0.25, 0.8);
        const fenderMat = paintMat;

        // Front fenders
        const flFender = new THREE.Mesh(fenderGeo, fenderMat);
        flFender.position.set(-0.85, wheelRadius + 0.15, 1.5);
        this.group.add(flFender);

        const frFender = new THREE.Mesh(fenderGeo, fenderMat);
        frFender.position.set(0.85, wheelRadius + 0.15, 1.5);
        this.group.add(frFender);

        // Rear fenders
        const rlFender = new THREE.Mesh(fenderGeo, fenderMat);
        rlFender.position.set(-0.85, wheelRadius + 0.15, -1.3);
        this.group.add(rlFender);

        const rrFender = new THREE.Mesh(fenderGeo, fenderMat);
        rrFender.position.set(0.85, wheelRadius + 0.15, -1.3);
        this.group.add(rrFender);

        // 14. DOOR HANDLES (Small detail)
        const handleGeo = new THREE.BoxGeometry(0.05, 0.08, 0.15);
        const handleMat = chromeMat;

        // Left door handles
        const lFrontHandle = new THREE.Mesh(handleGeo, handleMat);
        lFrontHandle.position.set(-carWidth / 2 - 0.01, cabin.position.y - 0.15, 0.3);
        this.group.add(lFrontHandle);

        const lRearHandle = new THREE.Mesh(handleGeo, handleMat);
        lRearHandle.position.set(-carWidth / 2 - 0.01, cabin.position.y - 0.15, -0.8);
        this.group.add(lRearHandle);

        // Right door handles
        const rFrontHandle = new THREE.Mesh(handleGeo, handleMat);
        rFrontHandle.position.set(carWidth / 2 + 0.01, cabin.position.y - 0.15, 0.3);
        this.group.add(rFrontHandle);

        const rRearHandle = new THREE.Mesh(handleGeo, handleMat);
        rRearHandle.position.set(carWidth / 2 + 0.01, cabin.position.y - 0.15, -0.8);
        this.group.add(rRearHandle);

        // 15. ANTENNA
        const antennaGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.4, 8);
        const antenna = new THREE.Mesh(antennaGeo, blackPlasticMat);
        antenna.position.set(0.6, cabin.position.y + cabinHeight / 2, -0.8);
        this.group.add(antenna);

        // Position car
        this.group.position.set(laneX, 0, startZ);

        // Face direction
        if (direction === -1) {
            this.group.rotation.y = Math.PI;
        }
    }

    update(dt) {
        if (!this.stopped) {
            this.group.position.z += this.speed * dt * this.direction;
        }
    }

    stop() {
        this.stopped = true;
    }

    go() {
        this.stopped = false;
    }
}

export class Student {
    constructor(startX, startZ) {
        this.group = new THREE.Group();
        this.animTime = 0;

        // --- REALISTIC MATERIALS ---
        const skinMat = new THREE.MeshStandardMaterial({
            color: 0xffdbac,
            metalness: 0.1,
            roughness: 0.9
        });

        const jacketMat = new THREE.MeshStandardMaterial({
            color: 0x2a5a8a, // Blue jacket
            metalness: 0.1,
            roughness: 0.7
        });

        const pantsMat = new THREE.MeshStandardMaterial({
            color: 0x3a3a3a, // Dark gray pants
            metalness: 0.05,
            roughness: 0.8
        });

        const shoeMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.2,
            roughness: 0.6
        });

        const hairMat = new THREE.MeshStandardMaterial({
            color: 0x2b1810, // Dark brown
            metalness: 0.0,
            roughness: 0.95
        });

        const backpackMat = new THREE.MeshStandardMaterial({
            color: 0xcc3333, // Red backpack
            metalness: 0.1,
            roughness: 0.7
        });

        // 1. TORSO (Upper body)
        const torsoGeo = new THREE.BoxGeometry(0.45, 0.65, 0.22);
        this.torso = new THREE.Mesh(torsoGeo, jacketMat);
        this.torso.position.y = 1.15; // Hip level at ~0.8
        this.torso.castShadow = true;
        this.group.add(this.torso);

        // 2. HEAD (Rounded - using sphere)
        const headGeo = new THREE.SphereGeometry(0.18, 16, 16);
        this.head = new THREE.Mesh(headGeo, skinMat);
        this.head.position.set(0, 0.5, 0); // Relative to torso
        this.head.castShadow = true;
        this.torso.add(this.head);

        // 3. FACIAL FEATURES
        // Eyes
        const eyeGeo = new THREE.SphereGeometry(0.025, 8, 8);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: 0x000000,
            metalness: 0.3,
            roughness: 0.5
        });

        const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
        leftEye.position.set(-0.07, 0.03, 0.16);
        this.head.add(leftEye);

        const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
        rightEye.position.set(0.07, 0.03, 0.16);
        this.head.add(rightEye);

        // Nose
        const noseGeo = new THREE.ConeGeometry(0.02, 0.06, 8);
        const nose = new THREE.Mesh(noseGeo, skinMat);
        nose.position.set(0, -0.01, 0.18);
        nose.rotation.x = Math.PI / 2;
        this.head.add(nose);

        // Ears
        const earGeo = new THREE.SphereGeometry(0.04, 8, 8);
        const leftEar = new THREE.Mesh(earGeo, skinMat);
        leftEar.position.set(-0.18, 0, 0);
        leftEar.scale.set(0.5, 1, 0.8);
        this.head.add(leftEar);

        const rightEar = new THREE.Mesh(earGeo, skinMat);
        rightEar.position.set(0.18, 0, 0);
        rightEar.scale.set(0.5, 1, 0.8);
        this.head.add(rightEar);

        // Mouth
        const mouthGeo = new THREE.BoxGeometry(0.08, 0.015, 0.01);
        const mouthMat = new THREE.MeshStandardMaterial({
            color: 0x8b4545,
            metalness: 0.1,
            roughness: 0.8
        });
        const mouth = new THREE.Mesh(mouthGeo, mouthMat);
        mouth.position.set(0, -0.08, 0.17);
        this.head.add(mouth);

        // 4. HAIR (Volumetric)
        const hairTopGeo = new THREE.SphereGeometry(0.19, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        const hairTop = new THREE.Mesh(hairTopGeo, hairMat);
        hairTop.position.set(0, 0.05, 0);
        this.head.add(hairTop);

        // Hair sides
        const hairSideGeo = new THREE.BoxGeometry(0.38, 0.15, 0.3);
        const hairSides = new THREE.Mesh(hairSideGeo, hairMat);
        hairSides.position.set(0, 0.08, -0.02);
        this.head.add(hairSides);

        // 5. NECK
        const neckGeo = new THREE.CylinderGeometry(0.08, 0.09, 0.12, 12);
        const neck = new THREE.Mesh(neckGeo, skinMat);
        neck.position.set(0, 0.26, 0);
        this.torso.add(neck);

        // 6. BACKPACK (Detailed)
        const backpackBodyGeo = new THREE.BoxGeometry(0.32, 0.42, 0.16);
        const backpackBody = new THREE.Mesh(backpackBodyGeo, backpackMat);
        backpackBody.position.set(0, 0.05, -0.22);
        backpackBody.castShadow = true;
        this.torso.add(backpackBody);

        // Backpack straps
        const strapGeo = new THREE.BoxGeometry(0.04, 0.5, 0.02);
        const strapMat = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            metalness: 0.1,
            roughness: 0.8
        });

        const leftStrap = new THREE.Mesh(strapGeo, strapMat);
        leftStrap.position.set(-0.12, 0.1, -0.05);
        this.torso.add(leftStrap);

        const rightStrap = new THREE.Mesh(strapGeo, strapMat);
        rightStrap.position.set(0.12, 0.1, -0.05);
        this.torso.add(rightStrap);

        // Backpack pocket
        const pocketGeo = new THREE.BoxGeometry(0.22, 0.15, 0.06);
        const pocket = new THREE.Mesh(pocketGeo, backpackMat);
        pocket.position.set(0, -0.08, 0.11);
        backpackBody.add(pocket);

        // 7. ARMS (Improved with shoulders and hands)
        const upperArmGeo = new THREE.CylinderGeometry(0.06, 0.055, 0.35, 12);
        const forearmGeo = new THREE.CylinderGeometry(0.055, 0.045, 0.3, 12);
        const handGeo = new THREE.SphereGeometry(0.06, 12, 12);

        // Left Arm
        this.lArm = new THREE.Group();
        this.lArm.position.set(-0.28, 0.22, 0);
        this.torso.add(this.lArm);

        const lUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
        lUpperArm.position.y = -0.175;
        lUpperArm.castShadow = true;
        this.lArm.add(lUpperArm);

        const lForearm = new THREE.Mesh(forearmGeo, skinMat);
        lForearm.position.y = -0.5;
        this.lArm.add(lForearm);

        const lHand = new THREE.Mesh(handGeo, skinMat);
        lHand.position.y = -0.7;
        lHand.scale.set(0.8, 1, 0.6);
        this.lArm.add(lHand);

        // Right Arm
        this.rArm = new THREE.Group();
        this.rArm.position.set(0.28, 0.22, 0);
        this.torso.add(this.rArm);

        const rUpperArm = new THREE.Mesh(upperArmGeo, jacketMat);
        rUpperArm.position.y = -0.175;
        rUpperArm.castShadow = true;
        this.rArm.add(rUpperArm);

        const rForearm = new THREE.Mesh(forearmGeo, skinMat);
        rForearm.position.y = -0.5;
        this.rArm.add(rForearm);

        const rHand = new THREE.Mesh(handGeo, skinMat);
        rHand.position.y = -0.7;
        rHand.scale.set(0.8, 1, 0.6);
        this.rArm.add(rHand);

        // 8. LEGS (Improved with thighs and shoes)
        const thighGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.45, 12);
        const shinGeo = new THREE.CylinderGeometry(0.075, 0.065, 0.4, 12);
        const shoeGeo = new THREE.BoxGeometry(0.12, 0.08, 0.22);

        // Left Leg
        this.lLeg = new THREE.Group();
        this.lLeg.position.set(-0.12, -0.35, 0);
        this.torso.add(this.lLeg);

        const lThigh = new THREE.Mesh(thighGeo, pantsMat);
        lThigh.position.y = -0.225;
        lThigh.castShadow = true;
        this.lLeg.add(lThigh);

        const lShin = new THREE.Mesh(shinGeo, pantsMat);
        lShin.position.y = -0.65;
        lShin.castShadow = true;
        this.lLeg.add(lShin);

        const lShoe = new THREE.Mesh(shoeGeo, shoeMat);
        lShoe.position.set(0, -0.9, 0.03);
        lShoe.castShadow = true;
        this.lLeg.add(lShoe);

        // Right Leg
        this.rLeg = new THREE.Group();
        this.rLeg.position.set(0.12, -0.35, 0);
        this.torso.add(this.rLeg);

        const rThigh = new THREE.Mesh(thighGeo, pantsMat);
        rThigh.position.y = -0.225;
        rThigh.castShadow = true;
        this.rLeg.add(rThigh);

        const rShin = new THREE.Mesh(shinGeo, pantsMat);
        rShin.position.y = -0.65;
        rShin.castShadow = true;
        this.rLeg.add(rShin);

        const rShoe = new THREE.Mesh(shoeGeo, shoeMat);
        rShoe.position.set(0, -0.9, 0.03);
        rShoe.castShadow = true;
        this.rLeg.add(rShoe);

        // Position student
        this.group.position.set(startX, 0, startZ);

        // Initial Pose
        this.neutralPose();
    }

    neutralPose() {
        this.lArm.rotation.x = 0;
        this.rArm.rotation.x = 0;
        this.lLeg.rotation.x = 0;
        this.rLeg.rotation.x = 0;
    }

    update(dt, isMoving) {
        if (isMoving) {
            this.animTime += dt * 10; // Speed of cycle
            // Simple swing
            const angle = Math.sin(this.animTime) * 0.5;

            this.lArm.rotation.x = angle;
            this.rArm.rotation.x = -angle;
            this.lLeg.rotation.x = -angle;
            this.rLeg.rotation.x = angle;
        } else {
            // Return to neutral
            this.lArm.rotation.x *= 0.8;
            this.rArm.rotation.x *= 0.8;
            this.lLeg.rotation.x *= 0.8;
            this.rLeg.rotation.x *= 0.8;
        }
    }
}

export class ConfettiSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = [];
        this.active = false;
        this.timer = 0;
    }

    trigger(position) {
        this.active = true;
        this.timer = 3.0; // Last for 3 seconds
        const count = 100;
        const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

        for (let i = 0; i < count; i++) {
            const geo = new THREE.PlaneGeometry(0.12, 0.12);
            const mat = new THREE.MeshBasicMaterial({
                color: colors[Math.floor(Math.random() * colors.length)],
                side: THREE.DoubleSide
            });
            const p = new THREE.Mesh(geo, mat);

            p.position.copy(position);
            p.position.y += 2 + Math.random() * 2;
            p.position.x += (Math.random() - 0.5) * 4;
            p.position.z += (Math.random() - 0.5) * 4;

            const velocity = new THREE.Vector3(
                (Math.random() - 0.5) * 10,
                (Math.random()) * 8 + 5,
                (Math.random() - 0.5) * 10
            );

            this.particles.push({
                mesh: p,
                vel: velocity,
                rotVel: new THREE.Vector3(Math.random(), Math.random(), Math.random())
            });
            this.scene.add(p);
        }
    }

    update(dt) {
        if (!this.active) return;
        this.timer -= dt;

        this.particles.forEach(p => {
            p.vel.y -= 15 * dt; // Gravity
            p.mesh.position.add(p.vel.clone().multiplyScalar(dt));
            p.mesh.rotation.x += p.rotVel.x * 8 * dt;
            p.mesh.rotation.y += p.rotVel.y * 8 * dt;

            if (p.mesh.position.y < 0) {
                p.mesh.position.y = 0;
                p.vel.set(0, 0, 0);
            }
        });

        if (this.timer <= 0) {
            this.active = false;
            this.particles.forEach(p => this.scene.remove(p.mesh));
            this.particles = [];
        }
    }
}
