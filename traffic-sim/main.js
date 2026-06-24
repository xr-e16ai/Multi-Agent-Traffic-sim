import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Simulation } from './src/simulation.js';
import { GEMINI_API_KEY } from './api_key.js';

class App {
    constructor() {
        window.simApp = this;

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(-13, 3, 4);
        this.camera.lookAt(0, 0, 4);

        this.scene  = new THREE.Scene();
        this.canvas = document.createElement('canvas');
        document.getElementById('app').appendChild(this.canvas);

        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
        this.renderer.shadowMap.enabled = true;

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enablePan    = true;
        this.controls.enableZoom   = true;
        this.controls.enableDamping = false;

        this.sim = new Simulation(this.scene, this.camera, {}, this.controls, () => {});

        this.setupUI();
        this.initAIChat();

        this.clock = new THREE.Clock();
        window.addEventListener('resize', () => this.onResize());
        this.onResize();

        setTimeout(() => this.sim.fetchAIDecisions(), 500);
        this.animate();
    }

    setupUI() {
        const overlay    = document.getElementById('setup-overlay');
        const mainCont   = document.getElementById('main-container');
        const startBtn   = document.getElementById('start-sim-btn');
        const setupState = { weather:'Sunny', traffic:'Normal', scenario:'SAFE' };

        document.querySelectorAll('.opt-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.target.parentElement.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const grp = e.target.parentElement.id; // opt-weather, opt-traffic, opt-scenario
                if      (grp === 'opt-weather')  setupState.weather   = e.target.dataset.val;
                else if (grp === 'opt-traffic')  setupState.traffic   = e.target.dataset.val;
                else if (grp === 'opt-scenario') setupState.scenario  = e.target.dataset.val;
            });
        });

        startBtn.addEventListener('click', () => {
            this.sim.setWeather(setupState.weather);
            this.sim.setTrafficDensity(setupState.traffic);
            this.sim.setScenario(setupState.scenario);

            document.getElementById('live-weather').value = setupState.weather;
            document.getElementById('live-traffic').value = setupState.traffic;

            // Immediate fallback panel update — no network dependency
            const _dm = { Low:'LOW', Normal:'MEDIUM', High:'HIGH' };
            const _wm = { Sunny:'SUNNY', Rain:'RAINY', Snow:'SNOWY', Foggy:'FOGGY' };
            this.sim._applyFallback({
                traffic_light:   this.sim.currentLight,
                traffic_density: _dm[setupState.traffic] || 'MEDIUM',
                weather:         _wm[setupState.weather] || 'SUNNY'
            });

            // Show/hide scenario badge
            const badge = document.getElementById('scenario-badge');
            if (badge) {
                badge.textContent = setupState.scenario === 'HAZARDOUS' ? '⚠️ HAZARDOUS' : '✅ SAFETY';
                badge.className   = setupState.scenario === 'HAZARDOUS' ? 'scenario-badge haz' : 'scenario-badge safe';
            }

            overlay.style.opacity = 0;
            setTimeout(() => overlay.style.display = 'none', 500);
            mainCont.style.opacity = 1;
            this.onResize();
            this.sim.fetchAIDecisions();
        });

        // Home button
        document.getElementById('home-btn').addEventListener('click', () => {
            this.sim.reset();
            const overlay  = document.getElementById('setup-overlay');
            const mainCont = document.getElementById('main-container');
            mainCont.style.opacity = 0;
            overlay.style.display  = 'flex';
            setTimeout(() => { overlay.style.opacity = 1; }, 20);
            // Reset scenario buttons
            document.querySelectorAll('#opt-scenario .opt-btn').forEach(b => b.classList.remove('active'));
            const safeBtn = document.querySelector('#opt-scenario [data-val="SAFE"]');
            if (safeBtn) safeBtn.classList.add('active');
        });

        // Restart button
        document.getElementById('restart-btn').addEventListener('click', () => {
            this.sim.reset();
        });

        // Live controls
        document.getElementById('live-weather').addEventListener('change', e => {
            this.sim.setWeather(e.target.value);
            this.sim.fetchAIDecisions();
        });
        document.getElementById('live-traffic').addEventListener('change', e => {
            this.sim.setTrafficDensity(e.target.value);
            this.sim.respawnTraffic();
            this.sim.fetchAIDecisions();
        });

        // Traffic light buttons
        const redBtn   = document.getElementById('toggle-red-btn');
        const greenBtn = document.getElementById('toggle-green-btn');
        redBtn.addEventListener('click', () => {
            this.sim.setTrafficLights('RED');
            this.sim._syncLightButtons('RED');
            // Instant panel update then real fetch
            const _d = { Low:'LOW', Normal:'MEDIUM', High:'HIGH' };
            const _w = { Sunny:'SUNNY', Rain:'RAINY', Snow:'SNOWY', Foggy:'FOGGY' };
            this.sim._applyFallback({ traffic_light:'RED', traffic_density:_d[this.sim.trafficDensity]||'MEDIUM', weather:_w[this.sim.weatherType]||'SUNNY' });
            this.sim.fetchAIDecisions();
        });
        greenBtn.addEventListener('click', () => {
            if (greenBtn.disabled) return;
            greenBtn.disabled = true;

            const density = this.sim.trafficDensity;
            let delayMs = 1000;
            if (density === 'Normal') delayMs = 5000;
            else if (density === 'High') delayMs = 10000;

            const el = document.getElementById('status-message');
            if (el) {
                el.innerHTML = `⏱️ Waiting ${delayMs/1000}s for safe crossing opportunity...`;
                el.style.color = '#ffaa00';
                el.style.display = 'block';
            }

            setTimeout(() => {
                greenBtn.disabled = false;
                this.sim.setTrafficLights('GREEN');
                this.sim._syncLightButtons('GREEN');
                this.sim._applyFallback({ traffic_light:'GREEN', traffic_density:{ Low:'LOW', Normal:'MEDIUM', High:'HIGH' }[this.sim.trafficDensity]||'MEDIUM', weather:{ Sunny:'SUNNY', Rain:'RAINY', Snow:'SNOWY', Foggy:'FOGGY' }[this.sim.weatherType]||'SUNNY' });
                this.sim.fetchAIDecisions();
            }, delayMs);
        });

        // Raycaster
        this.raycaster = new THREE.Raycaster();
        this.mouse     = new THREE.Vector2();
        this.renderer.domElement.addEventListener('click', e => {
            const r = this.renderer.domElement.getBoundingClientRect();
            this.mouse.set(((e.clientX-r.left)/r.width)*2-1, -((e.clientY-r.top)/r.height)*2+1);
            this.raycaster.setFromCamera(this.mouse, this.camera);
            this.sim.handleClick(this.raycaster.intersectObjects(this.sim.clickableObjects));
        });
    }

    initAIChat() {
        const input   = document.getElementById('ai-input');
        const sendBtn = document.getElementById('send-btn');
        const micBtn  = document.getElementById('mic-btn');
        const history = document.getElementById('chat-history');
        const status  = document.getElementById('ai-status');

        const addMsg = (text, cls) => {
            const d = document.createElement('div');
            d.className = `chat-msg ${cls}`; d.innerText = text;
            history.appendChild(d); history.scrollTop = history.scrollHeight;
        };

        const askAI = async text => {
            addMsg(text, 'user'); input.value = ''; status.innerText = 'Thinking…';
            try {
                const res = await fetch(
                    `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
                    { method:'POST', headers:{'Content-Type':'application/json'},
                      body: JSON.stringify({ contents:[{ parts:[{ text:'You are a Road Safety Expert. Answer only traffic/safety questions concisely (max 2 sentences).\n\nQuestion: '+text }]}] }) }
                );
                const data  = await res.json();
                const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm not sure.";
                addMsg(reply, 'ai');
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(reply), {rate:1,pitch:1,volume:1}));
                }
            } catch (err) { addMsg('Error: '+err.message, 'ai'); }
            finally { status.innerText = 'Ready'; }
        };

        sendBtn.addEventListener('click', () => { if (input.value.trim()) askAI(input.value.trim()); });
        input.addEventListener('keypress', e => { if (e.key==='Enter' && input.value.trim()) askAI(input.value.trim()); });

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const rec = new SpeechRecognition();
            rec.continuous = true;
            rec.interimResults = true;
            rec.lang = 'en-US';
            
            let silenceTimer = null;
            let finalTranscript = '';
            
            const stopRecording = () => {
                if (silenceTimer) clearTimeout(silenceTimer);
                rec.stop();
            };

            micBtn.addEventListener('click', () => { 
                if (micBtn.classList.contains('listening')) {
                    stopRecording();
                    return;
                }
                finalTranscript = '';
                input.value = '';
                try {
                    rec.start(); 
                    micBtn.classList.add('listening'); 
                    status.innerText='Listening...'; 
                } catch(e) {
                    console.error("Mic start error", e);
                }
            });
            
            rec.onresult = e => { 
                if (silenceTimer) clearTimeout(silenceTimer);
                
                let interimTranscript = '';
                for (let i = e.resultIndex; i < e.results.length; ++i) {
                    if (e.results[i].isFinal) {
                        finalTranscript += e.results[i][0].transcript;
                    } else {
                        interimTranscript += e.results[i][0].transcript;
                    }
                }
                input.value = finalTranscript + interimTranscript; 
                
                silenceTimer = setTimeout(() => {
                    stopRecording();
                }, 2000);
            };
            
            rec.onerror = e => { 
                micBtn.classList.remove('listening'); 
                if (e.error === 'not-allowed') {
                    status.innerText = 'Microphone permission denied.';
                } else {
                    status.innerText = 'Error: ' + e.error;
                }
                if (silenceTimer) clearTimeout(silenceTimer);
            };
            
            rec.onend = () => { 
                if (silenceTimer) clearTimeout(silenceTimer);
                micBtn.classList.remove('listening'); 
                const text = input.value.trim();
                if (text) {
                    status.innerText = 'Processing...';
                    setTimeout(() => {
                        status.innerText = 'Voice captured successfully.';
                        askAI(text);
                    }, 500);
                } else if (!status.innerText.includes('Error') && !status.innerText.includes('denied')) {
                    status.innerText = 'Ready';
                }
            };
        } else { micBtn.style.display = 'none'; }
    }

    onResize() {
        const c = document.getElementById('simulation-view');
        if (!c) return;
        const w = c.clientWidth, h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.sim?.update(this.clock.getDelta());
        this.renderer.render(this.scene, this.camera);
    }
}

new App();
