/*
*	Ball Physics Simulation Javascript (Three.js Version) - Final Version 7/26/25
*
*	Original Copyright: 2017+ Jeff Miller
*	Three.js Conversion & Correction: 2025
*	License: MIT
*
*
*	Dependencies:
*	- three.min.js      - WebGL 3D Library
*	- Mainloop.js       - Managing main loop & FPS
*/

// Force restrictive declarations
"use strict";

//================================//
//  THREE.JS SCENE GLOBALS
//================================//
let scene, camera, renderer;
let directionalLight, groundPlane; 

//================================//
//  SIMULATION GLOBALS
//================================//
var fpsCounter = document.getElementById('fpscounter');
let simulationPaused = false;
let tiltEnabled = false;

// Dimensions for physics simulation boundaries
let simWidth, simHeight;

const GRAVITY_Y = 980;
var gravityVec = new THREE.Vector2(0.0, GRAVITY_Y);

// Touch/Mouse state
var isDragging = false;
var touch_Pos = new THREE.Vector2(0, 0);
var touch_Sel = -1;

// OS flags
var OS_Android = false;
var OS_iPAD = false;
var OS_iOS = false;

// Initialize function
window.onload = init;

// --- OS DETECTION & ORIENTATION ---
function detectOperatingSystem() {
    const ua = navigator.userAgent;
    const hasTouch = "ontouchend" in document;
    if (ua.includes("iPad") || (ua.includes("Macintosh") && hasTouch)) {
        OS_iPAD = true;
    } else if (/iPhone|iPod/.test(ua)) {
        OS_iOS = true;
    } else if (/Android/i.test(ua)) {
        OS_Android = true;
    } else if (hasTouch) {
        OS_Android = true;
    }
}

function isMobileDevice() {
    return OS_iOS || OS_iPAD || OS_Android;
}

function isLandscape() {
    return window.matchMedia("(orientation: landscape)").matches;
}

function getOrientation() {
    if (isMobileDevice()) {
        simulationPaused = isLandscape();
    }
}

async function requestOrientationPermission() {
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        try {
            const response = await DeviceOrientationEvent.requestPermission();
            if (response === "granted") {
                window.addEventListener('devicemotion', handleMotionEvent);
                return true;
            }
        } catch (e) {
            console.error("Error requesting orientation permission:", e);
        }
    } else {
        window.addEventListener('devicemotion', handleMotionEvent);
        return true;
    }
    return false;
}

// A dedicated function to update all screen layout elements.
function updateLayout() {
    const width = window.innerWidth;
    const height = window.innerHeight;

    simWidth = width;
    simHeight = height;

    // Update main camera
    if (camera) {
        camera.left = 0;
        camera.right = width;
        camera.top = 0;
        camera.bottom = -height;
        camera.updateProjectionMatrix();
    }
    
    // Update renderer
    if (renderer) {
        renderer.setSize(width, height);
    }

    // Update ground plane position and scale
    if (groundPlane) {
        groundPlane.position.set(width / 2, -height / 2, -10);
        groundPlane.scale.set(width * 2, height * 2, 1);
    }

    // Update light and shadow camera
    if (directionalLight) {
        directionalLight.position.set(width / 2, height * 0.1, 500); 
        directionalLight.target.position.set(width / 2, -height / 2, 0);

        const frustumSize = Math.max(width, height) * 1.5;
        const shadowCam = directionalLight.shadow.camera;
        shadowCam.left = -frustumSize / 2;
        shadowCam.right = frustumSize / 2;
        shadowCam.top = frustumSize / 2;
        shadowCam.bottom = -frustumSize / 2;
        shadowCam.updateProjectionMatrix();
    }
    
    getOrientation();
}

//================================//
//      INITIALIZE SIMULATION
//================================//
function init() {
    console.clear();
    detectOperatingSystem();

    const canvas = document.getElementById('simulation-canvas');

    // --- THREE.JS INITIALIZATION ---
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x505050);

    camera = new THREE.OrthographicCamera(0, 0, 0, 0, 1, 1000);
    camera.position.z = 500;

    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true
    });
    
    // --- ROBUST RESIZE HANDLING ---
    const resizeObserver = new ResizeObserver(() => {
        updateLayout();
    });
    resizeObserver.observe(canvas);
    
    updateLayout(); // Initial call to set all sizes correctly.

    // --- SHADOWS ---
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);
    directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);

    directionalLight.castShadow = true;
    scene.add(directionalLight);
    scene.add(directionalLight.target);
    
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    directionalLight.shadow.bias = -0.0005; 
    directionalLight.shadow.normalBias = 0.05;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 2000; 

    // --- GROUND PLANE & TEXTURE ---
    const groundGeometry = new THREE.PlaneGeometry(1, 1);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0xcccccc
    });
    groundPlane = new THREE.Mesh(groundGeometry, groundMaterial);
    groundPlane.receiveShadow = true;
    scene.add(groundPlane);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
        './textures/laminate_floor_02_diff_4k.jpg',
        function(texture) {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(simWidth * 2 / 350, simHeight * 2 / 350);
            groundMaterial.map = texture;
            groundMaterial.color.set(0xffffff);
            groundMaterial.needsUpdate = true;
        },
        undefined,
        function(err) {
            console.error('An error happened loading the texture. Using fallback color.');
        }
    );

    // --- START SIMULATION & ATTACH LISTENERS ---
    new Simulation(renderer);

    // --- UI BUTTONS ---
    const enableBtn = document.getElementById("enableTiltButton");
    const mobileDevice = isMobileDevice();
    if (!mobileDevice) enableBtn.textContent = "Toggle Gravity Off";
    enableBtn.addEventListener("click", () => {
        if (mobileDevice) {
            if (!tiltEnabled) {
                requestOrientationPermission().then((granted) => {
                    if (granted) {
                        tiltEnabled = true;
                        enableBtn.textContent = "Disable Tilt";
                    }
                });
            } else {
                tiltEnabled = false;
                gravityVec.set(0.0, GRAVITY_Y);
                enableBtn.textContent = "Enable Tilt";
                // Reset light position to default when disabling tilt
                updateLayout();
            }
        } else {
            tiltEnabled = !tiltEnabled;
            if (tiltEnabled) {
                gravityVec.set(0.0, 0.0);
                enableBtn.textContent = "Toggle Gravity On";
            } else {
                gravityVec.set(0.0, GRAVITY_Y);
                enableBtn.textContent = "Toggle Gravity Off";
            }
        }
    });

    getOrientation();
}

// Motion handler
function handleMotionEvent(event) {
    if (!tiltEnabled) return;
    let ax = event.accelerationIncludingGravity.x;
    let ay = event.accelerationIncludingGravity.y;
    if (ax === null || ay === null) return;

    // --- 1. Update Physics Gravity Vector ---
    const tilt_scale = 1000;
    let finalX, finalY;
    if (OS_iPAD || OS_iOS) {
        finalX = ax * tilt_scale;
        finalY = -ay * tilt_scale;
    } else if (OS_Android) {
        finalX = -ax * tilt_scale;
        finalY = ay * tilt_scale;
    } else {
        finalX = ax * tilt_scale;
        finalY = -ay * tilt_scale;
    }
    gravityVec.x = finalX;
    gravityVec.y = finalY;

    // --- 2. Update Light Position for Shadow Effect ---
    if (directionalLight) {
        const maxGravity = 9.8;
        const lightMoveScale = simWidth * 0.4; // How far the light moves

        // Correct the raw accelerometer data based on OS
        let lightAx = ax;
        let lightAy = ay;
        if (OS_iPAD || OS_iOS) {
            lightAy = -ay; // Match the inversion for iOS
        } else if (OS_Android) {
            lightAx = -ax; // Match the inversion for Android
        } else {
            lightAy = -ay; // Default to iOS behavior
        }

        // Normalize the CORRECTED acceleration values
        const normalizedX = Math.max(-1, Math.min(1, lightAx / maxGravity));
        const normalizedY = Math.max(-1, Math.min(1, lightAy / maxGravity));

        // Calculate the light's new position based on the corrected tilt
        const newLightX = (simWidth / 2) + (normalizedX * lightMoveScale);
        const newLightY = (simHeight * 0.1) + (normalizedY * lightMoveScale);

        directionalLight.position.x = newLightX;
        directionalLight.position.y = newLightY;
    }
}

//================================//
//      BODY (BALL) CLASS
//================================//
var Body = function(x, y, radius, color, mass) {
    this.position = new THREE.Vector2(x, y);
    this.previouspos = new THREE.Vector2(x, y);
    this.acceleration = new THREE.Vector2(0, 0);
    this.radius = radius;
    this.mass = mass;

    const geometry = new THREE.SphereGeometry(radius, 32, 16);
    const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        metalness: 0.3,
        roughness: 0.25,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    scene.add(this.mesh);

    this.bodies_array = null;

    this.updatePosition = function(delta) {
        const velocity = new THREE.Vector2().subVectors(this.position, this.previouspos);
        velocity.multiplyScalar(0.999);

        this.previouspos.copy(this.position);

        const deltaSq = delta * delta;
        this.position.add(velocity).add(this.acceleration.multiplyScalar(deltaSq));

        this.acceleration.set(0, 0);
    };
};

//================================//
//      WALL CLASS
//================================//
var Wall = function(p1x, p1y, p2x, p2y, thickness) {
    this.p1 = new THREE.Vector2(p1x, p1y);
    this.p2 = new THREE.Vector2(p2x, p2y);
    this.thickness = thickness;

    this.dir = new THREE.Vector2().subVectors(this.p2, this.p1);
    this.lenSq = this.dir.lengthSq();

    const normal = new THREE.Vector2(this.dir.y, -this.dir.x).normalize();
    const halfThick = this.thickness / 2;

    const c1 = this.p1.clone().add(normal.clone().multiplyScalar(halfThick));
    const c2 = this.p2.clone().add(normal.clone().multiplyScalar(halfThick));
    const c3 = this.p2.clone().sub(normal.clone().multiplyScalar(halfThick));
    const c4 = this.p1.clone().sub(normal.clone().multiplyScalar(halfThick));

    const wallShape = new THREE.Shape();
    wallShape.moveTo(c1.x, -c1.y);
    wallShape.lineTo(c2.x, -c2.y);
    wallShape.lineTo(c3.x, -c3.y);
    wallShape.lineTo(c4.x, -c4.y);
    wallShape.closePath();

    const extrudeSettings = {
        steps: 1,
        depth: 20,
        bevelEnabled: false
    };
    const geometry = new THREE.ExtrudeGeometry(wallShape, extrudeSettings);

    const material = new THREE.MeshStandardMaterial({
        color: 0xff4500,
        metalness: 0.3,
        roughness: 0.9,
    });
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.position.z = -15;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
};

//================================//
//      SIMULATION ENGINE
//================================//
var Simulation = function(renderer) {
    var bodies = this.bodies = [];
    var walls = [];
    const posDisplay = document.getElementById('position-display');
    const balls_Max = 150;
    const colors = ['#ff0000', '#0000ff', '#00ff00', '#ffff00', '#ff00ff'];
    let creationFailures = 0;
    const wallThickness = 10;
    
    const k = 0.2;

    // --- Touch Velocity Tracking ---
    const touch_Prev_Pos = new THREE.Vector2(0, 0);
    const touch_Vel = new THREE.Vector2(0, 0);
    let lastMoveTime = 0;


    while (bodies.length < balls_Max) {
        var bodyRadius = Math.random() * 20 + 6;

        const spawnableWidth = Math.max(0, simWidth - 2 * bodyRadius);
        const spawnableHeight = Math.max(0, (simHeight / 4) - 2 * bodyRadius);

        var body = new Body(
            bodyRadius + (Math.random() * spawnableWidth),
            bodyRadius + (Math.random() * spawnableHeight),
            bodyRadius,
            colors[Math.floor(Math.random() * colors.length)],
            Math.PI * bodyRadius * bodyRadius
        );

        let collides = false;
        for (let other of bodies) {
            if (body.position.distanceTo(other.position) < body.radius + other.radius) {
                collides = true;
                break;
            }
        }

        if (!collides) {
            body.bodies_array = bodies;
            bodies.push(body);
        } else {
            scene.remove(body.mesh);
        }

        creationFailures++;
        if (creationFailures > balls_Max * 20) {
            console.error("Aborting simulation: Unable to place balls without collision.");
            break;
        }
    }

    // Interior walls
    walls.push(new Wall(simWidth / 3, simHeight * 0.175, simWidth / 2.2, simHeight * 0.355, wallThickness));
    walls.push(new Wall(simWidth * 0.68, simHeight * 0.175, simWidth / 1.8, simHeight * 0.355, wallThickness));
    walls.push(new Wall(simWidth / 3, simHeight * 0.625, simWidth / 2.2, simHeight * 0.475, wallThickness));
    walls.push(new Wall(simWidth * 0.68, simHeight * 0.625, simWidth / 1.8, simHeight * 0.475, wallThickness));

    // Border walls
    walls.push(new Wall(0, 0, 0, simHeight, wallThickness)); // Left
    walls.push(new Wall(simWidth, 0, simWidth, simHeight, wallThickness)); // Right
    walls.push(new Wall(0, 0, simWidth, 0, wallThickness)); // Top
    walls.push(new Wall(0, simHeight, simWidth, simHeight, wallThickness)); // Bottom


    // --- NATIVE EVENT LISTENERS ---
    const canvas = renderer.domElement;

    function selectObject() {
        let distTestMax = Infinity;
        let selectedIndex = -1;
        for (let i = 0; i < bodies.length; i++) {
            const distTest = bodies[i].position.distanceTo(touch_Pos);
            if (distTest < distTestMax) {
                distTestMax = distTest;
                selectedIndex = i;
            }
        }
        
        if (selectedIndex !== -1 && distTestMax < simWidth / 3) {
            touch_Sel = selectedIndex;
        } else {
            touch_Sel = -1;
        }
    }

    function updateTouchPos(event) {
        if (event.type.includes('touch')) {
            const rect = canvas.getBoundingClientRect();
            const touch = event.touches[0];
            touch_Pos.set(touch.clientX - rect.left, touch.clientY - rect.top);
        } else {
            touch_Pos.set(event.offsetX, event.offsetY);
        }
    }

    function handleInteractionStart(event) {
        isDragging = true;
        if (event.type === 'touchstart') event.preventDefault();
        updateTouchPos(event);
        // Initialize positions and reset velocity for the new gesture
        touch_Prev_Pos.copy(touch_Pos);
        touch_Vel.set(0, 0);
        selectObject();
    }

    function handleInteractionMove(event) {
        if (isDragging) {
            if (event.type === 'touchmove') event.preventDefault();
            // Store last position, get new position, and calculate velocity
            touch_Prev_Pos.copy(touch_Pos);
            updateTouchPos(event);
            touch_Vel.subVectors(touch_Pos, touch_Prev_Pos);
            // Record the time of the last movement
            lastMoveTime = Date.now();
        }
    }

    function handleInteractionEnd() {
        if (isDragging && touch_Sel > -1) {
            const body = bodies[touch_Sel];
            const timeSinceLastMove = Date.now() - lastMoveTime;

            // Only apply velocity if the release is quick after a move, creating a "flick"
            const releaseThreshold = 100; // ms
            if (timeSinceLastMove < releaseThreshold) {
                // The calculated touch_Vel is raw displacement and too large.
                // It must be scaled down to prevent breaking the collision engine.
                const velocity_scale_factor = 0.2;
                const final_flick_velocity = touch_Vel.clone().multiplyScalar(velocity_scale_factor);

                // Set the ball's velocity by adjusting its previous position
                body.previouspos.subVectors(body.position, final_flick_velocity);
            }
        }
        isDragging = false;
        touch_Sel = -1;
    }

    canvas.addEventListener('mousedown', handleInteractionStart);
    canvas.addEventListener('mousemove', handleInteractionMove);
    canvas.addEventListener('mouseup', handleInteractionEnd);
    canvas.addEventListener('mouseleave', handleInteractionEnd);
    canvas.addEventListener('touchstart', handleInteractionStart, {
        passive: false
    });
    canvas.addEventListener('touchmove', handleInteractionMove, {
        passive: false
    });
    canvas.addEventListener('touchend', handleInteractionEnd);
    canvas.addEventListener('touchcancel', handleInteractionEnd);
    canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
        updateTouchPos(event);

        const testBallRadius = 25;
        const testBallColor = '#00ffff';
        const testBallMass = Math.PI * testBallRadius * testBallRadius;

        const newBall = new Body(
            touch_Pos.x,
            touch_Pos.y,
            testBallRadius,
            testBallColor,
            testBallMass
        );
        newBall.bodies_array = bodies;
        bodies.push(newBall);
    });


    // --- SIMULATION LOGIC ---
    
    function UseTheForce(body) {
        // **MODIFIED**: Increased gravitational constant for a stronger pull on all devices.
        const G = 6.674e2;
        const touchMass = 1e6; 
        
        const toCursor = new THREE.Vector2().subVectors(touch_Pos, body.position);
        const distanceSq = toCursor.lengthSq();

        // Prevent extreme gravitational forces when the ball is very close
        if (distanceSq < (body.radius * body.radius * 4)) { 
            return;
        }
        
        const forceMagnitude = G * (touchMass * body.mass) / distanceSq;
        const force = toCursor.normalize().multiplyScalar(forceMagnitude);
        
        body.acceleration.add(force.clone().divideScalar(body.mass));
    }

    var applyForces = function() {
        for (const body of bodies) {
            body.acceleration.add(gravityVec);
        }

        if (touch_Sel > -1) {
            const selectedBody = bodies[touch_Sel];
            // Only apply the gravity attraction when not actively dragging with the spring.
            if (!isDragging) {
                UseTheForce(selectedBody);
            }
            const antiGravity = gravityVec.clone().negate();
            selectedBody.acceleration.add(antiGravity);
        }
    };

    var solveCollisions = function() {
        const wall_damping = 0.9;
        const restitution = 0.9;
        const solverIterations = 5;

        for (let iter = 0; iter < solverIterations; iter++) {
            for (let i = 0; i < bodies.length; i++) {
                const body = bodies[i];

                for (const wall of walls) {
                    const p1_to_body = new THREE.Vector2().subVectors(body.position, wall.p1);
                    let t = p1_to_body.dot(wall.dir) / wall.lenSq;
                    t = Math.max(0, Math.min(1, t));

                    const closest_point = wall.p1.clone().add(wall.dir.clone().multiplyScalar(t));
                    const dist_vec = new THREE.Vector2().subVectors(body.position, closest_point);
                    const distance = dist_vec.length();

                    const collision_dist = body.radius + (wall.thickness / 2);

                    if (distance < collision_dist) {
                        const overlap = collision_dist - distance;
                        const normal = dist_vec.normalize();
                        body.position.add(normal.clone().multiplyScalar(overlap));

                        const velocity = new THREE.Vector2().subVectors(body.position, body.previouspos);
                        const vDotN = velocity.dot(normal);

                        if (vDotN < 0) {
                            const impulseMagnitude = -(1 + wall_damping) * vDotN;
                            const impulse = normal.clone().multiplyScalar(impulseMagnitude);
                            body.previouspos.sub(impulse);
                        }
                    }
                }

                for (let j = i + 1; j < bodies.length; j++) {
                    const other = bodies[j];
                    const axis = new THREE.Vector2().subVectors(body.position, other.position);
                    const dist = axis.length();
                    const target = body.radius + other.radius;

                    if (dist > 0 && dist < target) {
                        const normal = axis.clone().normalize();
                        const overlap = target - dist;

                        const totalMass = body.mass + other.mass;
                        const correction = normal.clone().multiplyScalar(overlap);
                        body.position.add(correction.clone().multiplyScalar(other.mass / totalMass));
                        other.position.sub(correction.clone().multiplyScalar(body.mass / totalMass));

                        const v1 = new THREE.Vector2().subVectors(body.position, body.previouspos);
                        const v2 = new THREE.Vector2().subVectors(other.position, other.previouspos);

                        const v_rel_n = v1.clone().sub(v2).dot(normal);

                        if (v_rel_n > 0) continue;

                        const total_inv_mass = 1 / body.mass + 1 / other.mass;
                        const j = -(1 + restitution) * v_rel_n / total_inv_mass;
                        const impulse_vec = normal.clone().multiplyScalar(j);

                        body.previouspos.sub(impulse_vec.clone().multiplyScalar(1 / body.mass));
                        other.previouspos.add(impulse_vec.clone().multiplyScalar(1 / other.mass));
                    }
                }
            }
        }
        
        if (isDragging && touch_Sel > -1) {
            const body = bodies[touch_Sel];
            const toCursor = new THREE.Vector2().subVectors(touch_Pos, body.position);
            
            if (toCursor.length() < (body.radius * 4)) {
                const spring_velocity = toCursor.multiplyScalar(k);
                body.position.add(spring_velocity);
            } else {
                UseTheForce(body);
            }
        }
    };

    var updateMeshPositions = function() {
        for (const body of bodies) {
            body.mesh.position.set(body.position.x, -body.position.y, 0);
        }
    };

    var step = function(delta) {
        if (simulationPaused) return;

        const sub_steps = 8;
        const sub_delta = delta / sub_steps;
        for (let i = 0; i < sub_steps; i++) {
            applyForces();
            for (const body of bodies) body.updatePosition(sub_delta);
            solveCollisions();
        }
    };

    var draw = function() {
        updateMeshPositions();
        renderer.render(scene, camera);

        if (posDisplay) {
            const mouseX = touch_Pos.x.toFixed(1);
            const mouseY = touch_Pos.y.toFixed(1);
            let displayText = `Mouse: (${mouseX}, ${mouseY})`;

            if (touch_Sel > -1) {
                const selectedBody = bodies[touch_Sel];
                const ballX = selectedBody.position.x.toFixed(1);
                const ballY = selectedBody.position.y.toFixed(1);
                displayText += `\nBall:  (${ballX}, ${ballY})`;
            } else {
                displayText += `\nBall:  (None)`;
            }
            posDisplay.innerText = displayText;
        }
    };

    function end(fps, panic) {
        const status = simulationPaused ? "Paused - Rotate to Portrait" : `${parseInt(fps, 10)} FPS`;
        fpsCounter.textContent = status;
        if (panic) MainLoop.resetFrameDelta();
    }

    MainLoop.setUpdate((delta) => step(delta / 1000)).setDraw(draw).setEnd(end).start();
};
