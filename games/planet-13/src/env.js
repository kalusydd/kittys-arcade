// Shared environment: sky dome, lights, fog, celestial body, ambient motes.
import { THREE, makeSky, celestialMaterial, ringMaterial, ambientParticles } from './gfx.js';

const MOTION = { rise: 0, fall: 1, drift: 2, spark: 3 };

export class Environment {
  constructor(scene) {
    this.scene = scene;
    this.sky = makeSky();
    scene.add(this.sky);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#443355', 1.0);
    scene.add(this.hemi);
    this.key = new THREE.DirectionalLight('#ffffff', 2.3);
    this.key.castShadow = true;
    const sc = this.key.shadow.camera;
    sc.left = -26; sc.right = 26; sc.top = 18; sc.bottom = -14; sc.near = 1; sc.far = 90;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.03;
    scene.add(this.key, this.key.target);
    this.rim = new THREE.DirectionalLight('#ff88ff', 1.4);
    this.rim.position.set(10, 8, -20);
    scene.add(this.rim);
    scene.fog = new THREE.Fog('#2a0a3a', 30, 150);

    this.celestial = new THREE.Group();
    this.planetMat = celestialMaterial('banded', '#ffcf6e', '#c2410c');
    this.planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), this.planetMat);
    this.ringMat = ringMaterial('#ffffff', '#ff88ff');
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.35, 2.3, 96), this.ringMat);
    this.ring.rotation.x = -1.2;
    this.celestial.add(this.planet, this.ring);
    this.moon = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), celestialMaterial('cratered', '#ffffff', '#8888aa'));
    this.celestial.add(this.moon);
    scene.add(this.celestial);
    this.celestialOffset = new THREE.Vector3(45, 60, -330);
    this.celestialScale = 70;
    this.parallax = 0.92;

    this.motes = ambientParticles(450);
    scene.add(this.motes);
  }
  apply(pal, celestial = { kind: 'banded', a: '#ffffff', b: '#8888ff', size: 1 }, particles = { color: '#ffffff', motion: 'drift' }) {
    const u = this.sky.material.uniforms;
    u.uTop.value.set(pal.sky[0]); u.uBottom.value.set(pal.sky[1]); u.uBand.value.set(pal.band);
    this.scene.fog.color.set(pal.fog);
    this.hemi.color.set(pal.light); this.hemi.groundColor.set(pal.amb);
    this.key.color.set(pal.light);
    const lum = (h) => { const c = new THREE.Color(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
    const bright = (lum(pal.body) + lum(pal.top) * 0.6) / 1.6;
    const k = Math.min(1.1, Math.max(0.55, 1.25 - bright * 0.75));
    this.key.intensity = 2.3 * k; this.hemi.intensity = 1.0 * k;
    this.rim.color.set(pal.accent);
    const fresh = celestialMaterial(celestial.kind, celestial.a, celestial.b);
    this.planet.material.dispose();
    this.planet.material = fresh; this.planetMat = fresh;
    this.ring.visible = celestial.kind === 'ringed';
    this.ringMat.uniforms.uA.value.set(celestial.a); this.ringMat.uniforms.uB.value.set(pal.accent);
    this.ring.rotation.set(-1.25, 0, celestial.ringTilt || 0.3);
    this.celestialScale = 70 * (celestial.size || 1);
    this.moon.visible = celestial.kind !== 'eye';
    this.moon.material.uniforms.uA.value.set(pal.top); this.moon.material.uniforms.uB.value.set(pal.fog);
    const mu = this.motes.material.uniforms;
    mu.uColor.value.set(particles.color); mu.uMotion.value = MOTION[particles.motion] ?? 2;
  }
  update(dt, t, camera, focus) {
    this.sky.position.copy(camera.position);
    this.sky.material.uniforms.uTime.value = t;
    this.planetMat.uniforms.uTime.value = t;
    this.celestial.position.set(camera.position.x * this.parallax + this.celestialOffset.x, this.celestialOffset.y + camera.position.y * 0.5, this.celestialOffset.z);
    this.planet.scale.setScalar(this.celestialScale);
    this.ring.scale.setScalar(this.celestialScale);
    this.planet.rotation.y = t * 0.01;
    this.moon.scale.setScalar(this.celestialScale * 0.16);
    this.moon.position.set(-this.celestialScale * 1.9, -this.celestialScale * 0.5, 30);
    if (this.planetMat.uniforms.uLook && focus) {
      // the eye-planet watches the player
      this.planetMat.uniforms.uLook.value.set((focus.x - this.celestial.position.x) / 500, (focus.y - this.celestial.position.y) / 300);
    }
    if (focus) {
      this.key.position.set(focus.x - 8, focus.y + 22, focus.z + 14);
      this.key.target.position.set(focus.x, focus.y, focus.z);
    }
    const mu = this.motes.material.uniforms;
    mu.uCam.value.copy(camera.position); mu.uTime.value = t;
  }
}
