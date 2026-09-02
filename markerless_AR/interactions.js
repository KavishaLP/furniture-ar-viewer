// ==========================================
// 1. TOUCH GESTURES (ROTATE & SCALE)
// Works in WebXR AR by listening on window, not canvas
// ==========================================
AFRAME.registerComponent('gesture-handler', {
    schema: {
        minScale: { default: 0.2 },
        maxScale: { default: 3.0 },
        rotationSensitivity: { default: 0.05 },
        placementMode: { default: false }
    },
    init: function () {
        this.touchState = {
            isDown: false,
            initialDistance: 0,
            initialScale: 0.6,
            lastX: 0
        };

        this.onTouchStart = this.onTouchStart.bind(this);
        this.onTouchMove = this.onTouchMove.bind(this);
        this.onTouchEnd = this.onTouchEnd.bind(this);

        window.addEventListener('touchstart', this.onTouchStart, { passive: false });
        window.addEventListener('touchmove', this.onTouchMove, { passive: false });
        window.addEventListener('touchend', this.onTouchEnd, { passive: false });
    },
    remove: function () {
        window.removeEventListener('touchstart', this.onTouchStart);
        window.removeEventListener('touchmove', this.onTouchMove);
        window.removeEventListener('touchend', this.onTouchEnd);
    },
    isModelPlaced: function () {
        return this.el.object3D.scale.x > 0.05;
    },
    isUiTouch: function (target) {
        return target && target.closest('#ar-ui, #selection-ui, .place-btn, .exit-ar-btn, .back-btn, .nav-btn, .category-btn, .main-btn');
    },
    onTouchStart: function (e) {
        if (this.data.placementMode && !this.isModelPlaced()) return;
        if (this.isUiTouch(e.target)) return;

        if (e.touches.length === 1) {
            this.touchState.isDown = true;
            this.touchState.lastX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            this.touchState.isDown = true;
            this.touchState.initialDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            this.touchState.initialScale = this.el.object3D.scale.x;
        }
    },
    onTouchMove: function (e) {
        if (!this.touchState.isDown) return;
        if (this.data.placementMode && !this.isModelPlaced()) return;

        e.preventDefault();

        if (e.touches.length === 1) {
            const deltaX = e.touches[0].clientX - this.touchState.lastX;
            this.el.object3D.rotation.y += deltaX * this.data.rotationSensitivity;
            this.el.setAttribute('rotation', {
                x: THREE.MathUtils.radToDeg(this.el.object3D.rotation.x),
                y: THREE.MathUtils.radToDeg(this.el.object3D.rotation.y),
                z: THREE.MathUtils.radToDeg(this.el.object3D.rotation.z)
            });
            this.touchState.lastX = e.touches[0].clientX;
        } else if (e.touches.length === 2) {
            const currentDistance = Math.hypot(
                e.touches[0].clientX - e.touches[1].clientX,
                e.touches[0].clientY - e.touches[1].clientY
            );
            let newScale = this.touchState.initialScale * (currentDistance / this.touchState.initialDistance);
            newScale = Math.max(this.data.minScale, Math.min(this.data.maxScale, newScale));
            this.el.object3D.scale.set(newScale, newScale, newScale);
            this.el.setAttribute('scale', `${newScale} ${newScale} ${newScale}`);
        }
    },
    onTouchEnd: function (e) {
        if (e.touches.length === 0) {
            this.touchState.isDown = false;
        }
    }
});

// ==========================================
// 2. SIDE PROJECTED SHADOW (fixed light, model shape)
// Light from front-left → shadow falls to back-right on floor
// ==========================================
AFRAME.registerComponent('model-side-shadow', {
    schema: {
        opacity: { default: 0.62 },
        floorY: { default: 0.004 }
    },
    init: function () {
        // Fixed world-space light direction (sun front-left, above)
        this.lightDir = new THREE.Vector3(0.55, -1.0, 0.45).normalize();
        this.shadowMeshes = [];
        this.shadowGroup = new THREE.Group();
        this.rootEl = document.getElementById('furniture-root');
        this.rootEl.object3D.add(this.shadowGroup);
        this.shadowGroup.renderOrder = -1;

        this.temp = new THREE.Vector3();
        this.rootInverse = new THREE.Matrix4();
        this.lastRotY = null;
        this.lastScale = null;

        this.shadowMaterial = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: this.data.opacity,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            polygonOffsetUnits: -4,
            side: THREE.DoubleSide
        });

        this.buildShadowMeshes = this.buildShadowMeshes.bind(this);
        this.el.addEventListener('model-loaded', this.buildShadowMeshes);
        if (this.el.getObject3D('mesh')) {
            this.buildShadowMeshes();
        }
    },
    buildShadowMeshes: function () {
        this.shadowMeshes.forEach(({ shadow, geometry }) => {
            this.shadowGroup.remove(shadow);
            geometry.dispose();
        });
        this.shadowMeshes = [];

        this.el.object3D.traverse((node) => {
            if (!node.isMesh || !node.geometry) return;

            const geometry = node.geometry.clone();
            const shadow = new THREE.Mesh(geometry, this.shadowMaterial);
            this.shadowMeshes.push({ source: node, shadow, geometry });
            this.shadowGroup.add(shadow);
        });

        this.lastRotY = null;
        this.lastScale = null;
    },
    updateShadow: function () {
        if (this.el.object3D.scale.x < 0.05 || this.shadowMeshes.length === 0) {
            this.shadowGroup.visible = false;
            return;
        }

        this.shadowGroup.visible = true;
        this.rootEl.object3D.updateWorldMatrix(true, false);
        this.rootInverse.copy(this.rootEl.object3D.matrixWorld).invert();

        const floorY = this.data.floorY;
        const L = this.lightDir;

        this.shadowMeshes.forEach(({ source, shadow, geometry }) => {
            source.updateWorldMatrix(true, false);
            const srcPos = source.geometry.attributes.position;
            const dstPos = geometry.attributes.position;

            for (let i = 0; i < srcPos.count; i++) {
                this.temp.set(srcPos.getX(i), srcPos.getY(i), srcPos.getZ(i));
                this.temp.applyMatrix4(source.matrixWorld);
                this.temp.applyMatrix4(this.rootInverse);

                const t = (floorY - this.temp.y) / L.y;
                this.temp.x += L.x * t;
                this.temp.y = floorY;
                this.temp.z += L.z * t;

                dstPos.setXYZ(i, this.temp.x, this.temp.y, this.temp.z);
            }

            dstPos.needsUpdate = true;
            geometry.computeBoundingSphere();
            shadow.position.set(0, 0, 0);
            shadow.rotation.set(0, 0, 0);
            shadow.scale.set(1, 1, 1);
        });
    },
    tick: function () {
        const rotY = this.el.object3D.rotation.y;
        const scale = this.el.object3D.scale.x;

        if (this.lastRotY === rotY && this.lastScale === scale && this.shadowGroup.visible) {
            return;
        }

        this.lastRotY = rotY;
        this.lastScale = scale;
        this.updateShadow();
    },
    remove: function () {
        this.el.removeEventListener('model-loaded', this.buildShadowMeshes);
        this.shadowMeshes.forEach(({ shadow, geometry }) => {
            this.shadowGroup.remove(shadow);
            geometry.dispose();
        });
        this.shadowMeshes = [];
    }
});

// ==========================================
// 3. WEBXR HIT-TESTING & PLACEMENT LOGIC
// ==========================================
function playPlacementSound() {
    const audio = document.getElementById('placement-sound');
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

AFRAME.registerComponent('markerless-placement', {
    init: function () {
        this.xrHitTestSource = null;
        this.viewerSpace = null;
        this.refSpace = null;
        this.modelPlaced = false;

        this.reticle = document.getElementById('reticle');
        this.furnitureRoot = document.getElementById('furniture-root');
        this.placedModel = document.getElementById('placed-model');
        this.placeBtn = document.getElementById('place-btn');
        this.gestureHint = document.getElementById('gesture-hint');
        const sceneEl = this.el.sceneEl;

        this.placeModel = () => {
            if (!this.reticle.object3D.visible || this.modelPlaced) return;

            const position = this.reticle.getAttribute('position');
            this.furnitureRoot.setAttribute('position', {
                x: position.x,
                y: position.y,
                z: position.z
            });
            this.furnitureRoot.setAttribute('visible', true);
            this.furnitureRoot.object3D.visible = true;

            this.placedModel.setAttribute('position', '0 0 0');
            this.placedModel.setAttribute('rotation', '0 0 0');
            this.placedModel.setAttribute('scale', '0.6 0.6 0.6');
            this.placedModel.object3D.visible = true;
            this.modelPlaced = true;

            const shadowComp = this.placedModel.components['model-side-shadow'];
            if (shadowComp) {
                shadowComp.lastRotY = null;
                shadowComp.lastScale = null;
                shadowComp.updateShadow();
            }

            this.reticle.object3D.visible = false;
            this.reticle.setAttribute('visible', false);

            this.placeBtn.textContent = 'Furniture Placed';
            this.placeBtn.style.opacity = '0.6';
            if (this.gestureHint) this.gestureHint.style.display = 'block';
            playPlacementSound();
        };

        this.placeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.placeModel();
        });

        sceneEl.renderer.xr.addEventListener('sessionstart', async () => {
            const session = sceneEl.renderer.xr.getSession();
            session.addEventListener('select', this.placeModel);

            try {
                this.viewerSpace = await session.requestReferenceSpace('viewer');
                this.xrHitTestSource = await session.requestHitTestSource({ space: this.viewerSpace });
            } catch (error) {
                console.error('Hit test setup failed:', error);
            }

            try {
                this.refSpace = await session.requestReferenceSpace('local-floor');
            } catch (error) {
                try {
                    this.refSpace = await session.requestReferenceSpace('local');
                } catch (fallbackError) {
                    console.error('Reference space setup failed:', fallbackError);
                }
            }
        });

        sceneEl.renderer.xr.addEventListener('sessionend', () => {
            this.xrHitTestSource = null;
            this.viewerSpace = null;
            this.refSpace = null;
            this.modelPlaced = false;
            this.reticle.object3D.visible = false;
            this.furnitureRoot.setAttribute('visible', false);
            this.furnitureRoot.object3D.visible = false;
            this.placeBtn.textContent = 'Place Furniture Here';
            this.placeBtn.style.opacity = '1';
            if (this.gestureHint) this.gestureHint.style.display = 'none';
        });
    },
    tick: function () {
        const sceneEl = this.el.sceneEl;
        if (!sceneEl.is('ar-mode') || !this.viewerSpace || !this.xrHitTestSource || !this.refSpace) return;

        if (this.modelPlaced) {
            this.reticle.object3D.visible = false;
            return;
        }

        const frame = sceneEl.frame;
        if (!frame) return;

        const xrViewerPose = frame.getViewerPose(this.refSpace);
        if (!xrViewerPose) return;

        const hitTestResults = frame.getHitTestResults(this.xrHitTestSource);
        if (hitTestResults.length > 0 && !this.modelPlaced) {
            const pose = hitTestResults[0].getPose(this.refSpace);
            this.reticle.setAttribute('position', pose.transform.position);
            this.reticle.object3D.visible = true;
        } else if (!this.modelPlaced) {
            this.reticle.object3D.visible = false;
        }
    }
});

// ==========================================
// 3. UI SELECTION LOGIC
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    const furnitureData = {
        chair: [
            '../assets/models/chair/chair_1.glb',
            '../assets/models/chair/chair_2.glb',
            '../assets/models/chair/chair_3.glb',
            '../assets/models/chair/chair_4.glb'
        ],
        sofa: [
            '../assets/models/sofa/sofa_1.glb',
            '../assets/models/sofa/sofa_2.glb'
        ],
        cupboard: [
            '../assets/models/cupboard/cupboard_1.glb'
        ],
        table: [
            '../assets/models/table/table_1.glb'
        ]
    };

    let currentCategory = 'chair';
    let currentIndex = 0;
    let selectedModelPath = furnitureData.chair[0];

    const categoryButtons = document.querySelectorAll('.category-btn');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const modelPreviewText = document.getElementById('model-preview-text');
    const startArBtn = document.getElementById('start-ar-btn');
    const exitArBtn = document.getElementById('exit-ar-btn');
    const arStatus = document.getElementById('ar-status');
    const selectionUi = document.getElementById('selection-ui');
    const arUi = document.getElementById('ar-ui');
    const placedModel = document.getElementById('placed-model');
    const sceneEl = document.querySelector('a-scene');

    function updatePreview() {
        const modelsList = furnitureData[currentCategory];
        selectedModelPath = modelsList[currentIndex];
        modelPreviewText.textContent = selectedModelPath.split('/').pop();
    }

    function showSelectionUi(message) {
        selectionUi.style.display = 'flex';
        arUi.style.display = 'none';
        if (message) {
            arStatus.textContent = message;
            arStatus.style.color = '#e94560';
        }
    }

    async function checkWebXrSupport() {
        if (!window.isSecureContext) {
            return 'Camera needs HTTPS. Open this page through your Cloudflare tunnel link.';
        }
        if (!navigator.xr) {
            return 'WebXR not supported. Use Chrome on Android.';
        }
        try {
            const supported = await navigator.xr.isSessionSupported('immersive-ar');
            if (!supported) {
                return 'AR not supported on this device. Use Chrome on a compatible Android phone.';
            }
        } catch (error) {
            return 'Could not check AR support on this device.';
        }
        return null;
    }

    categoryButtons.forEach(button => {
        button.addEventListener('click', (e) => {
            categoryButtons.forEach(btn => btn.classList.remove('active'));
            e.target.classList.add('active');
            currentCategory = e.target.getAttribute('data-category');
            currentIndex = 0;
            updatePreview();
        });
    });

    nextBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex = (currentIndex + 1) % modelsList.length;
        updatePreview();
    });

    prevBtn.addEventListener('click', () => {
        const modelsList = furnitureData[currentCategory];
        currentIndex = (currentIndex - 1 + modelsList.length) % modelsList.length;
        updatePreview();
    });

    updatePreview();

    checkWebXrSupport().then((message) => {
        if (message) {
            arStatus.textContent = message;
            arStatus.style.color = '#e94560';
        }
    });

    async function startAr() {
        const supportMessage = await checkWebXrSupport();
        if (supportMessage) {
            arStatus.textContent = supportMessage;
            arStatus.style.color = '#e94560';
            return;
        }

        placedModel.setAttribute('src', selectedModelPath);
        placedModel.setAttribute('scale', '0 0 0');
        selectionUi.style.display = 'none';
        arUi.style.display = 'block';

        const enterAr = () => {
            sceneEl.enterVR(true).catch((error) => {
                console.error('Failed to start AR session:', error);
                showSelectionUi('Could not open camera. Allow camera permission and use Chrome on Android over HTTPS.');
            });
        };

        if (sceneEl.hasLoaded) {
            enterAr();
        } else {
            sceneEl.addEventListener('loaded', enterAr, { once: true });
        }
    }

    startArBtn.addEventListener('click', startAr);

    exitArBtn.addEventListener('click', () => {
        if (sceneEl.is('ar-mode')) {
            sceneEl.exitVR();
        } else {
            showSelectionUi();
        }
    });

    sceneEl.addEventListener('exit-vr', () => {
        showSelectionUi();
        arStatus.textContent = 'Use Chrome on Android over HTTPS to open the camera.';
        arStatus.style.color = '#a9a9b3';
        placedModel.setAttribute('scale', '0 0 0');
        document.getElementById('furniture-root').setAttribute('visible', false);
    });
});
