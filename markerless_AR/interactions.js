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
// 2. WEBXR HIT-TESTING & PLACEMENT LOGIC
// ==========================================
function playPlacementSound() {
    const audio = document.getElementById('placement-sound');
    if (!audio) return;
    audio.currentTime = 0;
    audio.play().catch(() => {});
}

function enableModelCastShadow(modelEl) {
    const apply = () => {
        modelEl.object3D.traverse((node) => {
            if (node.isMesh) {
                node.castShadow = true;
                node.receiveShadow = false;
            }
        });
    };
    modelEl.addEventListener('model-loaded', apply);
    if (modelEl.getObject3D('mesh')) apply();
}

function aimKeyLightAtFloor(position) {
    const keyLightEl = document.getElementById('key-light');
    if (!keyLightEl) return;

    keyLightEl.setAttribute('position', {
        x: position.x - 2.2,
        y: position.y + 4.5,
        z: position.z + 1.8
    });

    const light = keyLightEl.getObject3D('light');
    if (light && light.target) {
        light.target.position.set(position.x, position.y, position.z);
        light.target.updateMatrixWorld();
        if (!light.target.parent) {
            keyLightEl.object3D.parent.add(light.target);
        }
    }
}

function showShadowOnDetectedFloor(position) {
    const shadowFloor = document.getElementById('shadow-floor');
    if (!shadowFloor) return;
    shadowFloor.setAttribute('position', {
        x: position.x,
        y: position.y + 0.003,
        z: position.z
    });
    shadowFloor.setAttribute('visible', true);
}

function hideShadowFloor() {
    const shadowFloor = document.getElementById('shadow-floor');
    if (shadowFloor) shadowFloor.setAttribute('visible', false);
}

AFRAME.registerComponent('ar-floor-shadows', {
    init: function () {
        const renderer = this.el.renderer;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        enableModelCastShadow(document.getElementById('placed-model'));
    }
});

AFRAME.registerComponent('markerless-placement', {
    init: function () {
        this.xrHitTestSource = null;
        this.viewerSpace = null;
        this.refSpace = null;
        this.modelPlaced = false;

        this.reticle = document.getElementById('reticle');
        this.placedModel = document.getElementById('placed-model');
        this.placeBtn = document.getElementById('place-btn');
        this.gestureHint = document.getElementById('gesture-hint');
        const sceneEl = this.el.sceneEl;

        this.placeModel = () => {
            if (!this.reticle.object3D.visible || this.modelPlaced) return;

            const position = this.reticle.getAttribute('position');
            this.placedModel.setAttribute('position', { x: position.x, y: position.y, z: position.z });
            this.placedModel.setAttribute('scale', '0.6 0.6 0.6');
            this.placedModel.object3D.visible = true;
            this.modelPlaced = true;

            showShadowOnDetectedFloor(position);
            aimKeyLightAtFloor(position);

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
            hideShadowFloor();
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
        hideShadowFloor();
    });
});
